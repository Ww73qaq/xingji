/* =========================================================
   星迹 · 表情包管理
   ========================================================= */
/* 线性描边关闭 ×（删除角标用，替代原实心红圆＋字符 ×） */
const STICKER_CLOSE_ICO='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

/* ===== EMOJI（表情包管理） ===== */
async function renderEmojis(){
  const body=document.getElementById('emoji-manage-body');
  const list=await dbGetAll('emojis');
  body.innerHTML=`<div id="sticker-list"></div>`;
  renderStickerList(list);
}
function renderStickerList(list){
  const box=document.getElementById('sticker-list');
  if(!list||!list.length){box.innerHTML='<div class="empty">还没有表情包<br>点右上角 + 上传表情包</div>';return;}
  box.innerHTML=`<div class="emoji-body" style="background:#fff;border-radius:14px;padding:12px">`+list.map(e=>`
    <div class="emoji-item" style="position:relative;width:64px;height:64px" title="${esc(e.name||'')}">
      ${e.src?`<img src="${e.src}">`:`<span style="font-size:28px">${esc(e.name||'')}</span>`}
      <span style="position:absolute;top:-4px;right:-4px;width:20px;height:20px;border-radius:50%;background:var(--bg,#fff);color:#c0392b;border:1px solid var(--input,rgba(0,0,0,.08));display:flex;align-items:center;justify-content:center;cursor:pointer" onclick="delSticker(${e.id})">${STICKER_CLOSE_ICO}</span>
    </div>`).join('')+`</div>`;
}
function addSticker(){
  const input=document.createElement('input');input.type='file';input.accept='image/*';input.multiple=true;
  input.onchange=async e=>{
    const files=[...(e.target.files||[])].slice(0,30);
    if(!files.length)return;
    showToast('正在导入…');
    for(const f of files){
      try{const url=await compressImage(f);await dbPut('emojis',{src:url,name:f.name.replace(/\.[^.]+$/,''),time:Date.now()});}
      catch(err){}
    }
    renderEmojis();showToast(`已导入 ${files.length} 个表情包`);
  };
  input.click();
}
function delSticker(id){appConfirm('删除表情包','确定删除这个表情包吗？删除后不可恢复。',()=>{dbDelete('emojis',id).then(()=>renderEmojis()).catch(()=>{});showToast('已删除');});}
