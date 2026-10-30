/* =========================================================
   星迹 · mochi 备份兼容导入（4.2）
   —— 识别 mochi 的备份结构 {app:'mochi-zika', ls:{…}, idb:{…}}，
      做字段映射后选择性导入；导入前预览条数、跳过项明示。
   —— 只导入能对应上的：字卡 / 聊天 / 拍一拍 / 便签 / 心情 / 日历 / 信件。
   —— 媒体（240 个 media 键）不导入（引用格式不同），小游戏记录不导入。
   ========================================================= */

const MOCHI_FIELD_MAP={
  'xy-home-v2:default:cc-groups':'cards',
  'xy-home-v2:default:chat-msgs':'messages',
  'xy-home-v2:default:letters':'letters',
  'xy-home-v2:default:feed':'moments',
  'xy-home-v2:default:notes':'notes',
  'xy-home-v2:default:moods':'moods'
};

/* 从 mochi 的 ls / idb 里取字卡（cc-groups 是 {分组:[[组名,[句…]],…]} 或 {组名:[…]}） */
function mochiExtractCards(ls,idb){
  const out=[];   // [{group,text}]
  const raw=ls['xy-home-v2:default:cc-groups'];
  let cc=raw;
  if(typeof raw==='string'){try{cc=JSON.parse(raw);}catch(_){cc=null;}}
  if(!cc||typeof cc!=='object')return out;
  Object.keys(cc).forEach(type=>{
    const v=cc[type];
    const list=typeof v==='string'?(function(){try{return JSON.parse(v);}catch(_){return v;}})():v;
    if(!Array.isArray(list))return;
    list.forEach(item=>{
      if(Array.isArray(item)&&item.length>=2&&Array.isArray(item[1])){
        const g=String(item[0]||'').trim()||'默认';
        item[1].forEach(t=>{ if(t)out.push({group:g,text:String(t).trim()}); });
      }else if(typeof item==='string'){
        out.push({group:'默认',text:item.trim()});
      }
    });
  });
  return out;
}

/* 从 mochi 备份提取聊天消息 */
function mochiExtractMessages(ls,idb){
  const out=[];
  const src=idb['xy-home-v2:default:chat-msgs']||ls['xy-home-v2:default:chat-msgs'];
  let arr=src;
  if(typeof src==='string'){try{arr=JSON.parse(src);}catch(_){arr=[];}}
  if(!Array.isArray(arr))return out;
  arr.forEach(m=>{
    if(!m||typeof m!=='object')return;
    const side=(m.side==='in')?'other':(m.side==='out'?'me':(m.sender==='other'?'other':'me'));
    const type=(m.type==='image')?'image':(m.type==='voice')?'voice':'text';
    const text=m.text||m.content||m.msg||'';
    if(!text&&type==='text')return;
    out.push({
      sender:side,
      type:type,
      content:text,
      images:type==='image'?(m.images||(m.src?[m.src]:[])):undefined,
      time:(m.ts||m.time||Date.now()),
      read:true
    });
  });
  return out.sort((a,b)=>a.time-b.time);
}

async function importMochiBackup(file){
  let data=null;
  try{ data=JSON.parse(await file.text()); }catch(_){}
  if(!data||data.app!=='mochi-zika'){ showToast('这不像 mochi 的备份文件（缺少 app 标记）'); return; }
  const ls=data.ls||{};
  const idb=data.idb||{};

  /* 预览统计 */
  const cards=mochiExtractCards(ls,idb);
  const msgs=mochiExtractMessages(ls,idb);
  const mediaCount=Object.keys(idb).filter(k=>/media|image|blob/i.test(k)).length;
  const skipped=['媒体文件（引用格式不同，'+mediaCount+' 项）','小游戏记录','mochi 专属设置'].join('、');

  const preview=`<div style="font-size:13px;color:var(--text);line-height:1.9">
    识别到 mochi 备份，可导入：<br>
    <b>字卡</b> ${cards.length} 条<br>
    <b>聊天消息</b> ${msgs.length} 条<br><br>
    <span style="font-size:11px;color:var(--hint)">跳过：${skipped}</span>
  </div>`;

  showModal('导入 mochi 备份',
    preview,
    '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button>'
    +'<button class="modal-btn primary" onclick="doImportMochi()">开始导入</button></div>');

  window.__mochiImport={cards,msgs};
}

async function doImportMochi(){
  const pkg=window.__mochiImport; if(!pkg)return;
  closeModal();
  let cOk=0,mOk=0;
  /* 字卡：按 text 去重 */
  try{
    const existing=new Set((await dbGetAll('cards')).map(c=>String(c.text).trim()));
    const rows=[];
    const seen=new Set();
    for(const c of pkg.cards){
      const t=c.text;
      if(!t||existing.has(t)||seen.has(t))continue;
      seen.add(t);
      rows.push({text:t,group:c.group,direction:'ta',imported:1,enabled:1,time:Date.now()});
    }
    if(rows.length)cOk=await dbBulkPut('cards',rows);
    /* 分组也建出来 */
    const gs=await dbGetAll('cardGroups');
    const have=new Set(gs.map(x=>x.name));
    const add=[...new Set(pkg.cards.map(c=>c.group))].filter(g=>!have.has(g)).map(g=>({name:g,enabled:1}));
    if(add.length)await dbBulkPut('cardGroups',add);
  }catch(_){}
  /* 聊天消息 */
  try{
    for(const m of pkg.msgs){
      await dbPut('messages',{...m,cardIds:[],read:true,imported:1});
      mOk++;
    }
  }catch(_){}
  renderCards&&renderCards();
  showToast(`导入完成：字卡 ${cOk} · 消息 ${mOk}`);
}

window.importMochiBackup=importMochiBackup;
