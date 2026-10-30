/* =========================================================
   星迹 · 表情包管理（4.2：1:1 + 分组 + 批量）
   —— 上传的图一律放在正方形格子里按 1:1 显示（contain），不再被拉成长条。
   —— 支持分组：新建 / 删除分组，上传时归到当前组。
   —— 4.2：批量操作——一次导入数十张、并发压缩、进度提示；页面可进入「选择」模式批量删除 / 移动分组。
   —— 聊天输入栏的「表情包」列表页共用同一套分组（见 chat.js renderEmojiPanel）。
   ========================================================= */
const STICKER_CLOSE_ICO='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const STICKER_PLUS_ICO='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
const STICKER_FOLDER_ICO='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>';

const STICKER_UNGROUPED='未分组';
let stickerTab='all';          /* 表情包页当前分组 */
let stickerCache=[];           /* 最近一次读到的表情包（页面与聊天面板共用） */
let stickerSelMode=false;      /* 4.2：批量选择模式 */
let stickerSel=new Set();      /* 4.2：已勾选的 id */

function stickerGroupOf(e){ return (e&&e.group) ? String(e.group) : STICKER_UNGROUPED; }
function stickerGroups(list){
  const set=new Set();
  (list||stickerCache).forEach(e=>{ if(e&&e.src) set.add(stickerGroupOf(e)); });
  return [...set];
}
function stickerFiltered(list,tab){
  if(!tab||tab==='all') return list;
  return list.filter(e=>stickerGroupOf(e)===tab);
}

/* ===== EMOJI（表情包管理页） ===== */
async function renderEmojis(){
  const body=document.getElementById('emoji-manage-body');
  if(!body)return;
  const list=await dbGetAll('emojis');
  stickerCache=list||[];
  const groups=stickerGroups(stickerCache);
  if(stickerTab!=='all'&&!groups.includes(stickerTab))stickerTab='all';
  /* 选择集里删掉已经不存在的 id */
  const ids=new Set(stickerCache.map(e=>e.id));
  [...stickerSel].forEach(id=>{ if(!ids.has(id))stickerSel.delete(id); });

  const selCount=stickerSel.size;
  body.innerHTML=`
    <div class="stk-gbar">
      <span class="stk-g${stickerTab==='all'?' on':''}" onclick="setStickerTab('all')">全部 <b>${stickerCache.length}</b></span>
      ${groups.map(g=>`<span class="stk-g${stickerTab===g?' on':''}" onclick="setStickerTab('${esc(g).replace(/'/g,'&#39;')}')">${esc(g)} <b>${stickerCache.filter(e=>stickerGroupOf(e)===g).length}</b></span>`).join('')}
      <span class="stk-g stk-g-new" onclick="newStickerGroup()">${STICKER_PLUS_ICO}分组</span>
    </div>
    <div class="stk-toolbar">
      <button class="btn-pill ghost" style="flex:1;padding:8px 0;font-size:12px" onclick="toggleStickerSel()">${stickerSelMode?'完成':'选择'}</button>
      ${stickerSelMode?`<button class="btn-pill ghost" style="flex:1;padding:8px 0;font-size:12px" onclick="stickerSelAll()">全选</button>
      <button class="btn-pill ghost" style="flex:1;padding:8px 0;font-size:12px" onclick="stickerMoveGroup()">移分组</button>
      <button class="btn-pill" style="flex:1;padding:8px 0;font-size:12px;color:var(--danger)" onclick="stickerBatchDel()">删除${selCount?`(${selCount})`:''}</button>`:''}
    </div>
    <div class="stk-grid" id="sticker-list"></div>
    <div class="stk-hint">点右上角 ＋ 一次可导入几十张（自动压缩）。${stickerSelMode?'正在选择：点格子勾选，底部可批量删除或移动分组。':'点「选择」进入批量模式。'}</div>`;
  renderStickerList(stickerFiltered(stickerCache,stickerTab));
}
function setStickerTab(t){ stickerTab=t; if(stickerSelMode)toggleStickerSel(false); renderEmojis(); }
function renderStickerList(list){
  const box=document.getElementById('sticker-list');
  if(!box)return;
  if(!list||!list.length){
    box.innerHTML='<div class="empty" style="grid-column:1/-1">这个分组还没有表情包<br>点右上角 ＋ 上传</div>';
    return;
  }
  box.innerHTML=list.map(e=>{
    const sel=stickerSelMode&&stickerSel.has(e.id);
    return `
    <div class="stk-cell${sel?' sel':''}" title="${esc(e.name||'')}" onclick="${stickerSelMode?`stickerTap(${e.id})`:''}">
      ${e.src?`<img src="${esc(e.src)}" alt="">`:`<span class="stk-fallback">${esc((e.name||'?').slice(0,1))}</span>`}
      ${stickerSelMode?`<span class="stk-check${sel?' on':''}"></span>`:`<span class="stk-del" onclick="event.stopPropagation();delSticker(${e.id})">${STICKER_CLOSE_ICO}</span>`}
    </div>`;
  }).join('');
}
function toggleStickerSel(force){
  stickerSelMode = (force===undefined)? !stickerSelMode : !!force;
  if(!stickerSelMode) stickerSel.clear();
  renderEmojis();
}
function stickerTap(id){ if(stickerSel.has(id))stickerSel.delete(id); else stickerSel.add(id); renderEmojis(); }
function stickerSelAll(){
  const cur=stickerFiltered(stickerCache,stickerTab);
  const ids=cur.map(e=>e.id);
  const all=ids.every(id=>stickerSel.has(id));
  if(all)ids.forEach(id=>stickerSel.delete(id)); else ids.forEach(id=>stickerSel.add(id));
  renderEmojis();
}
function stickerBatchDel(){
  if(!stickerSel.size){showToast('先勾选要删除的表情包');return;}
  const n=stickerSel.size;
  appConfirm('批量删除','确定删除选中的 '+n+' 个表情包吗？删除后不可恢复。',async()=>{
    for(const id of [...stickerSel]){ try{await dbDelete('emojis',id);}catch(_){} }
    stickerSel.clear();
    renderEmojis();
    if(typeof renderEmojiPanel==='function'&&typeof emojiOpen!=='undefined'&&emojiOpen)renderEmojiPanel();
    showToast('已删除 '+n+' 个');
  });
}
function stickerMoveGroup(){
  if(!stickerSel.size){showToast('先勾选要移动的表情包');return;}
  askText('移动到分组','','填一个分组名（不存在会自动新建）',(name)=>{
    const g=String(name||'').trim();
    if(!g){showToast('分组名不能为空');return;}
    (async()=>{
      for(const id of [...stickerSel]){
        const e=stickerCache.find(x=>x.id===id);
        if(e){e.group=g;try{await dbPut('emojis',e);}catch(_){}}
      }
      stickerSel.clear();
      stickerSelMode=false;
      renderEmojis();
      showToast('已移动到「'+g+'」');
    })();
  });
}
function newStickerGroup(){
  askText('新建分组','','如：猫猫 / 日常 / 摸摸头',(name)=>{
    const g=String(name||'').trim();
    if(!g){showToast('分组名不能为空');return;}
    stickerTab=g;
    renderEmojis();
    showToast('已切到「'+g+'」，上传的表情会进这个组');
  });
}
function addSticker(){
  const input=document.createElement('input');
  input.type='file';input.accept='image/*';input.multiple=true;
  input.onchange=async e=>{
    const files=[...(e.target.files||[])].slice(0,99);
    if(!files.length)return;
    const group=(stickerTab==='all')?STICKER_UNGROUPED:stickerTab;
    const total=files.length;
    let done=0,ok=0,fail=0;
    showToast('正在导入 0/'+total+' …');
    /* 4.2：并发 3 压缩，表情包专用 512/0.82，逐张上报进度 */
    const queue=files.slice();
    const workers=Array.from({length:3},async()=>{
      while(queue.length){
        const f=queue.shift();if(!f)break;
        try{
          const url=await compressImage(f,{max:512,quality:0.82});
          /* 文件名前缀自动分组：如 猫猫_01.png → 猫猫 */
          let g=group;
          const m=f.name.match(/^([^_\-]+)[_\-]/);
          if(m&&stickerTab==='all')g=m[1];
          await dbPut('emojis',{src:url,name:f.name.replace(/\.[^.]+$/,''),group:g,time:Date.now()});
          ok++;
        }catch(_){fail++;}
        done++;
        if(done%3===0||done===total)showToast('正在导入 '+done+'/'+total);
      }
    });
    await Promise.all(workers);
    renderEmojis();
    if(typeof renderEmojiPanel==='function'&&typeof emojiOpen!=='undefined'&&emojiOpen)renderEmojiPanel();
    showToast(fail?('导入完成：成功 '+ok+' · 失败 '+fail):('已导入 '+ok+' 个到「'+group+'」'));
  };
  input.click();
}
function delSticker(id){
  appConfirm('删除表情包','确定删除这个表情包吗？删除后不可恢复。',()=>{
    dbDelete('emojis',id).then(()=>{renderEmojis();if(typeof renderEmojiPanel==='function'&&typeof emojiOpen!=='undefined'&&emojiOpen)renderEmojiPanel();}).catch(()=>{});
    showToast('已删除');
  });
}

window.renderEmojis=renderEmojis;
window.addSticker=addSticker;
window.delSticker=delSticker;
window.setStickerTab=setStickerTab;
window.newStickerGroup=newStickerGroup;
window.toggleStickerSel=toggleStickerSel;
window.stickerSelAll=stickerSelAll;
window.stickerBatchDel=stickerBatchDel;
window.stickerMoveGroup=stickerMoveGroup;
window.stickerGroups=stickerGroups;
window.stickerGroupOf=stickerGroupOf;
window.stickerFiltered=stickerFiltered;
