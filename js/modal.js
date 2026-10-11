/* =========================================================
   星迹 · 弹窗体系（showModal / appPrompt / appConfirm / 图片查看器）
   ========================================================= */
/* 线性描边关闭 ×（config 无此图标，本地内联，fill:none;stroke） */
const CLOSE_ICO='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

let appInputCb=null;
function appPrompt(title,def,onOk){
  appInputCb=onOk;
  showModal(title,'<textarea id="app-input" class="app-input app-input-multi" placeholder="请输入" style="min-height:84px;resize:none;white-space:pre-wrap;word-break:break-word;overflow-wrap:break-word">'+esc(def==null?'':String(def))+'</textarea><div class="modal-btn-row"><button class="modal-btn" onclick="appPromptCancel()">取消</button><button class="modal-btn primary" onclick="appPromptOk()">确定</button></div>');
  setTimeout(()=>{const i=document.getElementById('app-input');if(i){i.focus();i.select();}},80);
}
function appPromptCancel(){appInputCb=null;closeModal();}
function appPromptOk(){
  const v=document.getElementById('app-input')?document.getElementById('app-input').value:'';
  if(appInputCb){
    const cb=appInputCb;appInputCb=null;
    let r;
    try{r=cb(v);}catch(e){r=undefined;}
    if(r&&typeof r.then==='function'){r.then(keep=>{if(keep!==false)closeModal();},()=>closeModal());return;}
    if(r!==false)closeModal();
    return;
  }
  closeModal();
}
let appConfirmCb=null;
function appConfirm(title,body,onOk){
  appConfirmCb=onOk;
  showModal(title,'<div style="text-align:center;padding:8px 0 16px;font-size:15px;color:var(--text)">'+body+'</div><div class="modal-btn-row"><button class="modal-btn" onclick="appConfirmCancel()">取消</button><button class="modal-btn primary" onclick="appConfirmOk()">确定</button></div>');
}
function appConfirmCancel(){appConfirmCb=null;closeModal();}
function appConfirmOk(){
  if(appConfirmCb){const cb=appConfirmCb;appConfirmCb=null;cb();}
  closeModal();
}
/* ===== MODAL =====
   v3.7.0：新增第 5 个可选参数 opts={showClose:boolean}，显式控制右上角 ✕。
   未传 opts（或未给 showClose）时沿用旧逻辑——actions 文案含「取消」即隐藏 ✕，
   保证所有既有调用向后兼容、不破坏弹窗行为。 */
function showModal(title,body,actions,position,opts){
  const m=document.getElementById('modal');
  /* v3.9.5：强制更新层是「只能按按钮」的独占态。此前 closeModal() 会因
     dataset.forceUpdate==='1' 永久失效，而 showModal 既不检查也不清除该标记——
     若强更弹窗未走「稍后再刷新」就被任何 showModal 覆盖，整个弹窗将再也关不上。
     这里让 showModal 接管该态：控制权已转移给普通弹窗，就清掉守卫并恢复 ✕ 显示，
     保证「守卫存活」与「当前显示的是强更弹窗」始终一致（不变量不再悬空）。 */
  const forced=!!(m&&m.dataset.forceUpdate==='1');
  if(forced)m.dataset.forceUpdate='';
  document.getElementById('modal-title').textContent=title;
  document.getElementById('modal-body').innerHTML=body;
  const ma=document.getElementById('modal-actions');
  if(ma){
    if(actions){ma.innerHTML=actions;ma.style.display='';}
    else{ma.innerHTML='';ma.style.display='none';}
  }
  const mc=document.getElementById('modal-close');
  if(mc){
    if(forced){mc.style.display='';}
    else{
      let closeVisible;
      if(opts&&typeof opts==='object'&&typeof opts.showClose==='boolean')closeVisible=opts.showClose;
      else closeVisible=!(actions&&/取消/.test(actions));
      mc.style.display=closeVisible?'block':'none';
    }
  }
  m.classList.toggle('bottom',position==='bottom');
  m.classList.add('show');
}
function closeModal(){
  const modal=document.getElementById('modal');
  if(modal&&modal.dataset.forceUpdate==='1')return;
  modal.classList.remove('show');
  const mc=document.getElementById('modal-close');if(mc)mc.style.display='';
  appInputCb=null;appConfirmCb=null;
  if(typeof roomPickerOpen!=='undefined'){roomPickerOpen=false;pendingRoomCell=-1;}
}
/* 图片查看器：双击缩放 + 拖动 */
let ivScale=1,ivX=0,ivY=0,ivDrag=null;
function openImageViewer(imgEl,label,idx){
  closeImageViewer();
  const row=imgEl.closest('.msg-img-grid')||imgEl.parentElement;
  const imgs=row?[...row.querySelectorAll('img')]:[imgEl];
  const v=document.createElement('div');
  v.id='img-viewer';
  const big=document.createElement('img');
  big.className='iv-img';big.src=imgEl.src;
  const idxEl=document.createElement('div');idxEl.className='iv-idx';
  idxEl.textContent=imgs.length>1?`${(idx||0)+1} / ${imgs.length}`:(label||'');
  const bar=document.createElement('div');bar.className='iv-bar';
  bar.innerHTML=`<div class="iv-btn" style="display:flex;align-items:center;justify-content:center" onclick="event.stopPropagation();closeImageViewer()">${CLOSE_ICO}</div>`;
  v.appendChild(big);v.appendChild(idxEl);v.appendChild(bar);
  v.onclick=()=>closeImageViewer();
  document.getElementById('phone').appendChild(v);
  // 切换图片
  if(imgs.length>1){
    let cur=idx||0;
    const swipe=e=>{
      const x0=e.changedTouches?e.changedTouches[0].clientX:e.clientX;
      if(e.type==='touchstart'){ivDrag=x0;return;}
      if(ivDrag===null)return;
      const dx=x0-ivDrag;ivDrag=null;
      if(Math.abs(dx)<46)return;
      cur=(cur+(dx<0?1:-1)+imgs.length)%imgs.length;
      big.src=imgs[cur].src;idxEl.textContent=`${cur+1} / ${imgs.length}`;
    };
    v.addEventListener('touchstart',swipe,{passive:true});
    v.addEventListener('touchend',swipe);
    v.addEventListener('click',e=>{if(e.target===big){swipe({changedTouches:[{clientX:big._lx||0}],type:'touchend'});}});
  }
  // 双指缩放 / 双击放大
  let d0=null;
  v.addEventListener('touchstart',e=>{if(e.touches.length===2){const[a,b]=e.touches;d0={d:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY),s:ivScale};}});
  v.addEventListener('touchmove',e=>{
    if(d0&&e.touches.length===2){const[a,b]=e.touches;const d=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
      ivScale=Math.max(1,Math.min(4,d0.s*d/d0.d));big.style.transform=`translate(${ivX}px,${ivY}px) scale(${ivScale})`;}
    else if(e.touches.length===1&&ivScale>1){
      const t=e.touches[0];if(ivDrag&&typeof ivDrag==='object'){ivX=t.clientX-ivDrag.x;ivY=t.clientY-ivDrag.y;big.style.transform=`translate(${ivX}px,${ivY}px) scale(${ivScale})`;}
    }
  });
  v.addEventListener('touchend',e=>{if(d0&&e.touches.length<2)d0=null;if(e.touches.length===0)ivDrag=null;});
  big.addEventListener('touchstart',e=>{if(ivScale>1){const t=e.touches[0];ivDrag={x:t.clientX-ivX,y:t.clientY-ivY};}});
  big.ondblclick=()=>{ivScale=ivScale>1?1:2.4;ivX=ivY=0;big.style.transform=`scale(${ivScale})`;};
}
function closeImageViewer(){
  const v=document.getElementById('img-viewer');if(v)v.remove();
  ivScale=1;ivX=0;ivY=0;ivDrag=null;
}
function viewImage(url){openImageViewer({src:url,closest:()=>null,parentElement:null},'',0);}
