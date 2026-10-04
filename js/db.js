/* =========================================================
   星迹 · IndexedDB 封装（8 个 store + 索引 + v1→v2 版本迁移）
   ========================================================= */
let DB=null;

/* 主键：settings 用 keyPath:'key'，其余 store 用 autoIncrement 的 id */
function dbPrimaryKey(store,rec){return store==='settings'?(rec&&rec.key):(rec&&rec.id);}

/* v1 → v2 迁移要点：
     - settings 由 {keyPath:'id',autoIncrement} 改为 {keyPath:'key'}，需重建并搬行
     - messages / letters / diaries / moments 补 time 索引
     - messages 补 sender 索引，cards 补 group 索引
   老数据全部保留，只是多一次升级。 */
function openDB(){
  return new Promise((res,rej)=>{
    const req=indexedDB.open('xingji',2);
    req.onerror=()=>rej(req.error);
    req.onsuccess=()=>{DB=req.result;window.DB=DB;res();};
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

function dbPut(store,data){return new Promise((res,rej)=>{const tx=DB.transaction(store,'readwrite');const st=tx.objectStore(store);const req=st.put(data);req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error);});}
function dbGetAll(store){return new Promise((res,rej)=>{const tx=DB.transaction(store,'readonly');const req=tx.objectStore(store).getAll();req.onsuccess=()=>res(req.result||[]);req.onerror=()=>rej(req.error);});}
function dbDelete(store,id){return new Promise((res,rej)=>{const tx=DB.transaction(store,'readwrite');const req=tx.objectStore(store).delete(id);req.onsuccess=res;req.onerror=rej;});}
function dbGetByKey(store,key){return dbGetAll(store).then(all=>all.find(x=>x.key===key)||null);}
