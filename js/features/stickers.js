/* =========================================================
   星迹 · 表情包管理
   ========================================================= */

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
      <span style="position:absolute;top:-4px;right:-4px;width:20px;height:20px;border-radius:50%;background:#c0392b;color:#fff;font-size:12px;display:flex;align-items:center;justify-content:center;cursor:pointer" onclick="delSticker(${e.id})">&#10005;</span>
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
function delSticker(id){dbDelete('emojis',id).then(()=>renderEmojis());showToast('已删除');}
