/* =========================================================
   星迹 · 开屏与锁屏（密码校验、开屏信、进入空间确认）
   ========================================================= */

/* ===== PIN ===== */
function pinInput(n){if(pinVal.length>=4)return;pinVal+=n;updatePinDots();if(pinVal.length===4)checkPin();}
function pinBack(){pinVal=pinVal.slice(0,-1);updatePinDots();document.getElementById('pin-error').classList.remove('show');}
function updatePinDots(){const dots=document.querySelectorAll('#pin-dots .pin-dot');dots.forEach((d,i)=>d.classList.toggle('filled',i<pinVal.length));}
function checkPin(){
  if(pinVal===state.pin.code){
    pinVal='';updatePinDots();
    document.getElementById('screen-lock').classList.remove('active');
    renderSplashLetter();
    document.getElementById('screen-splash').classList.add('active');
  }
  else{document.getElementById('pin-error').classList.add('show');pinVal='';setTimeout(updatePinDots,300);}
}
function renderSplashLetter(){
  const el=document.getElementById('splash-letter');
  const t=state.splashText||'';
  el.innerHTML=esc(t).replace(/\n/g,'<br>');
  el.classList.toggle('long',t.length>=30);
}

/* ===== 进入确认（无时限、不自动关闭；确认＝primary 迎接进入，取消＝ghost 对等） ===== */
function confirmEnter(){
  const mc=document.querySelector('#modal .modal-close');
  if(mc)mc.style.display='none';
  showModal('进入确认',
    '<div style="text-align:center;padding:2px 4px 14px;font-size:14px;line-height:1.95;color:var(--text)">谢绝一切内外意识体进入本网站。<br>本网站为个人字卡传讯作品，专属于「我」，归我所有、由我掌控。</div>'+
    '<div style="display:flex;gap:10px">'+
      '<button class="btn-pill primary" style="flex:1;padding:13px 0;font-size:15px" onclick="confirmEnterOk()">确认</button>'+
      '<button class="btn-pill ghost" style="flex:1;padding:13px 0;font-size:15px" onclick="cancelEnter()">取消</button>'+
    '</div>');
}
function confirmEnterOk(){
  closeModal();
  restoreModalClose();
  enterSpace();
}
function cancelEnter(silent){
  closeModal();
  restoreModalClose();
  if(!silent)showToast('已取消进入');
}
function restoreModalClose(){
  const mc=document.querySelector('#modal .modal-close');
  if(mc)mc.style.display='';
}
function enterSpace(){
  document.getElementById('screen-splash').classList.remove('active');
  document.getElementById('screen-home').classList.add('active');
  navStack=['chat'];navRoot='chat';
  history.replaceState({d:1},'');
  history.pushState({d:1},'');
  updateHome();
  updateTabBar();
  refreshAllBadges();
  startProactive();
}
