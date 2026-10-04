/* =========================================================
   星迹 · 版本检测与更新提示
   ========================================================= */

/* ===== 更新提示弹窗（部署检测）：与 version.json 对比，发现新版本弹「立即刷新 / 3 分钟后刷新」 ===== */
function checkVersion(){
  try{
    fetch('version.json?t='+Date.now(),{cache:'no-store'})
      .then(r=>r.ok?r.json():null)
      .then(v=>{
        if(!v||!v.version)return;
        const key='xjLastVer',postKey='xjPostpone';
        const last=localStorage.getItem(key);
        const postpone=Number(localStorage.getItem(postKey)||0);
        if(!last){localStorage.setItem(key,v.version);return;}
        if(postpone>Date.now())return;
        if(last!==v.version){
          localStorage.setItem(key,v.version);
          showVersionUpdateModal(v.version);
        }
      })
      .catch(()=>{});
  }catch(e){}
}
function showVersionUpdateModal(version){
  const modal=document.getElementById('modal');
  if(!modal)return;
  // 强制更新层：禁止关闭、点击遮罩、ESC/背景区域等任何非按钮操作。
  modal.dataset.forceUpdate='1';
  document.getElementById('modal-title').textContent='发现新版本';
  document.getElementById('modal-body').innerHTML=`<div style="text-align:center;padding:8px 0 16px;font-size:15px;color:var(--text)">星迹已更新到 <b>v${esc(version)}</b><br><span style="font-size:12px;color:var(--hint)">请选择一种方式继续</span></div>
    <div class="modal-btn-row"><button class="modal-btn" onclick="postponeRefresh()">3 分钟后刷新</button><button class="modal-btn primary" onclick="forceVersionReload()">立即刷新</button></div>`;
  const ma=document.getElementById('modal-actions');if(ma){ma.innerHTML='';ma.style.display='none';}
  const mc=document.getElementById('modal-close');if(mc)mc.style.display='none';
  modal.classList.remove('bottom');
  modal.classList.add('show');
}
function forceVersionReload(){
  localStorage.removeItem('xjPostpone');
  location.reload();
}
function postponeRefresh(){
  localStorage.setItem('xjPostpone',String(Date.now()+180000));
  const modal=document.getElementById('modal');
  if(modal)modal.dataset.forceUpdate='';
  closeModal();showToast('将在 3 分钟后自动刷新');
  setTimeout(()=>location.reload(),180000);
}
/* ===== 版本更新通知 ===== */
let updateTimer=null;
function checkUpdate(){
  try{
    const old=localStorage.getItem('xingji-ver');
    if(old&&old!==APP_VERSION){
      const lastAsk=parseInt(localStorage.getItem('xingji-ver-ask')||'0',10);
      if(Date.now()-lastAsk<86400000){localStorage.setItem('xingji-ver',APP_VERSION);return;} // 一天只询问一次
      localStorage.setItem('xingji-ver-ask',String(Date.now()));
      showUpdateDialog(old);
    }
    localStorage.setItem('xingji-ver',APP_VERSION);
  }catch(e){}
}
function showUpdateDialog(old){
  showModal('星迹已更新',`<div style="padding:12px 6px 8px;text-align:center;font-size:14px;line-height:1.9;color:var(--sub)">网站已更新到新版本（v${APP_VERSION}）<br>刷新后即可体验最新内容</div>
    <div class="modal-item" onclick="closeModal();location.reload()">立即刷新</div>
    <div class="modal-item" onclick="closeModal();scheduleReload()">3 分钟后自动刷新</div>`);
  const c=document.querySelector('.modal-close');if(c)c.textContent='暂不刷新';
}
function scheduleReload(){
  if(updateTimer)clearInterval(updateTimer);
  updateTimer=setInterval(()=>location.reload(),180000);
  showToast('3 分钟后将自动刷新');
}
