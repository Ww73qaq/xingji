/* =========================================================
   星迹 · 版本检测与更新提示
   ========================================================= */
/* v3.7.0：自动刷新改为「切后台/空闲时」再 reload——避免对话中途被打断。
   先等 baseMs；到点若页面已在后台则立即刷新，否则挂一次 visibilitychange，
   等用户切到后台/锁屏时再刷新。更新能力不失效（下次进后台即生效）。 */
let _bgReloadTimer=null,_bgVisHandler=null;
function scheduleBackgroundReload(baseMs){
  if(_bgReloadTimer)clearTimeout(_bgReloadTimer);
  // 重新排期时先摘掉上一次挂的 visibilitychange 监听，避免监听器堆积（每次「稍后再刷新」泄漏一个）
  if(_bgVisHandler){document.removeEventListener('visibilitychange',_bgVisHandler);_bgVisHandler=null;}
  _bgReloadTimer=setTimeout(()=>{
    _bgReloadTimer=null;
    if(document.hidden){location.reload();return;}
    const onVis=()=>{if(document.hidden){document.removeEventListener('visibilitychange',onVis);if(_bgVisHandler===onVis)_bgVisHandler=null;location.reload();}};
    _bgVisHandler=onVis;
    document.addEventListener('visibilitychange',onVis);
    showToast('稍后切到后台时自动刷新');
  },baseMs||180000);
}
/* ===== 更新提示弹窗（部署检测）：与 version.json 对比，发现新版本弹「立即刷新 / 稍后刷新」 ===== */
function checkVersion(){
  try{
    fetch('version.json?t='+Date.now(),{cache:'no-store'})
      .then(r=>r.ok?r.json():null)
      .then(v=>{
        if(!v||!v.version)return;
        const postKey='xjPostpone';
        const postpone=Number(localStorage.getItem(postKey)||0);
        if(postpone>Date.now())return;
        // v3.9.5：不再在「弹出提示」时就把版本记为已见（那会导致用户在应用更新前强退后，
        // 此后 last===v.version 永远不再提示、更新被永久吞掉）。改为与「正在运行的
        // APP_VERSION」比较：只有远端版本 ≠ 当前运行版本才提示；真正生效后远端与本地一致，
        // 自然不再提示，无需提前记账。xjLastVer 保留为「已提示到」的诊断记录。
        if(v.version!==APP_VERSION){
          localStorage.setItem('xjLastVer',v.version);
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
    <div class="modal-btn-row"><button class="modal-btn" onclick="postponeRefresh()">稍后再刷新</button><button class="modal-btn primary" onclick="forceVersionReload()">立即刷新</button></div>`;
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
  closeModal();showToast('3 分钟后、你切到后台时自动刷新');
  scheduleBackgroundReload(180000);
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
  scheduleBackgroundReload(180000);
  showToast('3 分钟后、你切到后台时自动刷新');
}
