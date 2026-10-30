/* =========================================================
   星迹 · 表情包管理（4.1：1:1 显示 + 分组）
   —— 上传的图一律放在正方形格子里按 1:1 显示（contain），不再被拉成长条。
   —— 支持分组：新建 / 重命名 / 删除分组，上传时归到当前组。
   —— 聊天输入栏的「表情包」列表页共用同一套分组（见 chat.js renderEmojiPanel）。
   ========================================================= */
/* 线性描边关闭 ×（删除角标用） */
const STICKER_CLOSE_ICO='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const STICKER_PLUS_ICO='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
const STICKER_FOLDER_ICO='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>';

const STICKER_UNGROUPED='未分组';
let stickerTab='all';          /* 表情包页当前分组 */
let stickerCache=[];           /* 最近一次读到的表情包（页面与聊天面板共用） */

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

  body.innerHTML=`
    <div class="stk-gbar">
      <span class="stk-g${stickerTab==='all'?' on':''}" onclick="setStickerTab('all')">全部 <b>${stickerCache.length}</b></span>
      ${groups.map(g=>`<span class="stk-g${stickerTab===g?' on':''}" onclick="setStickerTab('${esc(g).replace(/'/g,'&#39;')}')">${esc(g)} <b>${stickerCache.filter(e=>stickerGroupOf(e)===g).length}</b></span>`).join('')}
      <span class="stk-g stk-g-new" onclick="newStickerGroup()">${STICKER_PLUS_ICO}分组</span>
    </div>
    <div class="stk-grid" id="sticker-list"></div>
    <div class="stk-hint">点右上角 ＋ 上传表情包，会上传到当前分组${stickerTab==='all'?'（全部）下的「'+STICKER_UNGROUPED+'」':'「'+esc(stickerTab)+'」'}。点格子右上角 × 删除。</div>`;
  renderStickerList(stickerFiltered(stickerCache,stickerTab));
}
function setStickerTab(t){ stickerTab=t; renderEmojis(); }
function renderStickerList(list){
  const box=document.getElementById('sticker-list');
  if(!box)return;
  if(!list||!list.length){
    box.innerHTML='<div class="empty" style="grid-column:1/-1">这个分组还没有表情包<br>点右上角 ＋ 上传</div>';
    return;
  }
  box.innerHTML=list.map(e=>`
    <div class="stk-cell" title="${esc(e.name||'')}">
      ${e.src?`<img src="${esc(e.src)}" alt="">`:`<span class="stk-fallback">${esc((e.name||'?').slice(0,1))}</span>`}
      <span class="stk-del" onclick="event.stopPropagation();delSticker(${e.id})">${STICKER_CLOSE_ICO}</span>
    </div>`).join('');
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
    const files=[...(e.target.files||[])].slice(0,30);
    if(!files.length)return;
    const group=(stickerTab==='all')?STICKER_UNGROUPED:stickerTab;
    showToast('正在导入…');
    for(const f of files){
      try{
        const url=await compressImage(f);
        await dbPut('emojis',{src:url,name:f.name.replace(/\.[^.]+$/,''),group,time:Date.now()});
      }catch(err){}
    }
    renderEmojis();
    showToast(`已导入 ${files.length} 个到「${group}」`);
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
window.stickerGroups=stickerGroups;
window.stickerGroupOf=stickerGroupOf;
window.stickerFiltered=stickerFiltered;
