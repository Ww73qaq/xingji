/* =========================================================
   星迹 · IndexedDB 封装（8 个 store + 索引 + v1→v2 版本迁移）
   ========================================================= */
let DB=null;

/* DB 就绪门闩：openDB 成功前，任何依赖 DB 的入口（如调度器恢复）先挂在这里排队，
   就绪后自动继续，不再出现「静默 return、任务丢失」。
   用法：return dbReady.then(()=>{ ...依赖 DB 的逻辑... }); */
let _dbReadyResolve=null;
const dbReady=new Promise(r=>{_dbReadyResolve=r;});
function _markDbReady(){if(_dbReadyResolve){const r=_dbReadyResolve;_dbReadyResolve=null;r();}}

/* 主键：settings 用 keyPath:'key'，其余 store 用 autoIncrement 的 id */
function dbPrimaryKey(store,rec){return store==='settings'?(rec&&rec.key):(rec&&rec.id);}

/* 真实存在的 store 列表：清库/遍历一律以库本身为准，不再依赖硬编码列表
   ——历史上正因为硬编码，settings 的键（keyPath 是 key 不是 id）删不掉，
   且 events / books 两个 store 被「清除全部数据 / 恢复出厂」整体漏掉（v3.9.5 修）。 */
function dbStoreNames(){try{return DB?Array.from(DB.objectStoreNames):[];}catch(e){return [];}}

/* v1 → v2 迁移要点：
     - settings 由 {keyPath:'id',autoIncrement} 改为 {keyPath:'key'}，需重建并搬行
     - messages / letters / diaries / moments 补 time 索引
     - messages 补 sender 索引，cards 补 group 索引
   老数据全部保留，只是多一次升级。 */
function openDB(){
  return new Promise((res,rej)=>{
    const req=indexedDB.open('xingji',5);
    req.onerror=()=>{_markDbReady();rej(req.error);};   // 失败也开门闩，避免等待者永久挂起（后续调用会自行 reject）
    req.onsuccess=()=>{DB=req.result;window.DB=DB;_markDbReady();res();};
    req.onupgradeneeded=e=>{
      const db=e.target.result;
      const tx=e.target.transaction;
      const ensure=(name,cfg)=>{
        let st;
        if(!db.objectStoreNames.contains(name)){
          st=db.createObjectStore(name,{keyPath:cfg.keyPath,autoIncrement:!!cfg.autoIncrement});
        }else{
          st=tx.objectStore(name);
        }
        (cfg.indexes||[]).forEach(pair=>{
          if(!st.indexNames.contains(pair[0]))st.createIndex(pair[0],pair[1]);
        });
      };
      // 1) 同步补齐：老库已存在的 store 直接加索引，新库整表创建
      ensure('messages',{keyPath:'id',autoIncrement:true,indexes:[['time','time'],['sender','sender']]});
      ensure('letters',{keyPath:'id',autoIncrement:true,indexes:[['time','time']]});
      ensure('diaries',{keyPath:'id',autoIncrement:true,indexes:[['time','time']]});
      ensure('moments',{keyPath:'id',autoIncrement:true,indexes:[['time','time']]});
      ensure('cardGroups',{keyPath:'id',autoIncrement:true});
      ensure('cards',{keyPath:'id',autoIncrement:true,indexes:[['group','group']]});
      ensure('emojis',{keyPath:'id',autoIncrement:true});
      // v3.6.4：日历（每日心情/便签快照，按日期索引）
      ensure('calendar',{keyPath:'id',autoIncrement:true,indexes:[['date','date']]});
      // v3.6.8：事件轨迹（感应/状态/日程等，供「心念轨迹」App 与 TA 记得引用）
      ensure('events',{keyPath:'id',autoIncrement:true,indexes:[['time','time']]});
      // v3.8.0：本地阅读书架（书的文件本体 Blob + 元信息 + 进度；按 addedAt 索引）
      ensure('books',{keyPath:'id',autoIncrement:true,indexes:[['addedAt','addedAt']]});
      // 2) settings：keyPath 不可变更，老库只能删表重建并把旧行搬过去。
      //    必须放在最后，且不能提前 return，否则上面的索引不会被创建。
      if(!db.objectStoreNames.contains('settings')){
        db.createObjectStore('settings',{keyPath:'key'});
      }else if(tx.objectStore('settings').keyPath!=='key'){
        const old=tx.objectStore('settings');
        const allReq=old.getAll();
        allReq.onsuccess=()=>{
          const rows=allReq.result||[];
          db.deleteObjectStore('settings');
          const st=db.createObjectStore('settings',{keyPath:'key'});
          rows.forEach(r=>{if(r&&r.key)st.put({key:r.key,value:r.value});});
        };
      }
    };
  });
}
function dbGet(store,key){
  return new Promise((res,rej)=>{
    const tx=DB.transaction(store,'readonly');
    const req=tx.objectStore(store).get(key);
    req.onsuccess=()=>res(req.result||null);
    req.onerror=()=>rej(req.error);
  });
}

function dbPut(store,data){
  // v3.7.2 性能：写操作同步维护内存缓存（若有），读侧无需立刻回库
  const memo=_dbMemo[store];
  if(memo&&memo.v){
    const arr=memo.v;
    const kid=(data&&data.id!==undefined)?data.id:(data&&data.key!==undefined?data.key:null);
    if(kid!==null){
      const i=arr.findIndex(x=>String(x&&(x.id!==undefined?x.id:x.key))===String(kid));
      if(i>=0)arr[i]=data;else arr.push(data);
    }else if(data){arr.push(data);}
  }
  return new Promise((res,rej)=>{const tx=DB.transaction(store,'readwrite');const st=tx.objectStore(store);const req=st.put(data);req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error);});
}
function dbGetAll(store){return new Promise((res,rej)=>{const tx=DB.transaction(store,'readonly');const req=tx.objectStore(store).getAll();req.onsuccess=()=>res(req.result||[]);req.onerror=()=>rej(req.error);});}

/* ---- v3.7.2 内存读缓存：dbGetAllM(store, ttl)
   高频全表读（心跳轮询 / 回复引擎取池）改为走内存缓存：
   - 首次或 TTL 过期才真正读库（校准漂移）；
   - dbPut/dbDelete 同步维护缓存数组 → 写入即刻可见，不依赖 TTL；
   - 单页纯前端场景安全；多 tab 共享库时由 TTL 兜底校准。 ---- */
const _dbMemo={};
function dbGetAllM(store,ttl){
  const now=Date.now();
  const hit=_dbMemo[store];
  if(hit&&now-hit.t<(ttl||30000))return Promise.resolve(hit.v);
  return dbGetAll(store).then(v=>{
    _dbMemo[store]={t:Date.now(),v:v||[]};
    return v||[];
  });
}
function dbMemoInvalidate(store){delete _dbMemo[store];}
function dbDelete(store,id){
  const memo=_dbMemo[store];
  /* v3.9.5：与 dbPut 口径对齐——settings 的键在 .key 上，只按 .id 找会让缓存里留下已删除的行 */
  if(memo&&memo.v){const i=memo.v.findIndex(x=>String(x&&(x.id!==undefined?x.id:x.key))===String(id));if(i>=0)memo.v.splice(i,1);}
  return new Promise((res,rej)=>{const tx=DB.transaction(store,'readwrite');const req=tx.objectStore(store).delete(id);req.onsuccess=res;req.onerror=rej;});}
function dbGetByKey(store,key){return dbGetAll(store).then(all=>all.find(x=>x.key===key)||null);}
