/* =========================================================
   星迹 · 入口：启动流程、事件绑定、主心跳
   ========================================================= */

/* ===== INIT ===== */
function initChatEvents(){
  const input=document.getElementById('chat-input');
  if(input){
    input.addEventListener('input',()=>{autoGrow(input);syncInputBar();});
    input.addEventListener('keydown',e=>{
      if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();sendMessage();}
    });
    input.addEventListener('focus',()=>{closeEmojiPanel();});
  }
  initVoiceTalk();
  document.getElementById('chat-content').addEventListener('scroll',()=>{
    const el=document.getElementById('chat-content');
    if(el.scrollTop+el.clientHeight>=el.scrollHeight-40)saveLastRead();
  });
}

/* 状态栏时钟（主心跳每秒调用） */
function updateStatusClock(){
  const now=new Date();
  const t=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
  const st=document.getElementById('status-time');if(st)st.textContent=t;
  const ct=document.getElementById('chat-status-time');if(ct)ct.textContent=t;
}
/* v3.6.13 TA 的世界时间（意识空间时间，方案 B——持久化）：
   TA 时间 = 现实时间 + 时差偏移。偏移初抽 ±1~6 小时并**持久化到 state.taTimeOffset**，
   断开连接/刷新后延续上次时差（两个世界时间连续、可积累）；之后每 1~8 小时或跨天时
   微漂移 ±20 分钟并持久化。分针随现实流动，TA 的世界与你的世界不同空间但各自连续。 */
let _taOffsetNext=0,_taOffsetDay='';
function taOffsetNow(){
  const now=Date.now();
  const d=new Date(now);
  const todayKey=d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();
  let changed=false;
  if(!state.taTimeOffset){
    const sign=Math.random()<0.5?-1:1;
    state.taTimeOffset=sign*(1+Math.random()*5)*3600000;   // 初抽 ±1~6h 时差
    changed=true;
  }
  if(now>=_taOffsetNext||_taOffsetDay!==todayKey){
    if(state.taTimeOffset&&!_taOffsetNext){
      // 延续场景（刷新/重开）：已有持久化时差 → 只安排下次漂移，不立即漂移
      _taOffsetNext=now+(1+Math.random()*7)*3600000;
    }else{
      state.taTimeOffset+=(Math.random()*40-20)*60000;       // 每 1~8h / 跨天漂移 ±20 分钟
      _taOffsetNext=now+(1+Math.random()*7)*3600000;
      changed=true;
    }
  }
  _taOffsetDay=todayKey;
  if(changed&&typeof saveKey==='function')saveKey('taTimeOffset');
  return state.taTimeOffset;
}
function renderTaTime(){
  const d=new Date(Date.now()+taOffsetNow());
  const el=document.getElementById('sb-ta-time');
  if(el)el.textContent='TA '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
}

/* 唯一主心跳：原先散落的 4 个 setInterval（1s 时钟/信号、5s 朋友圈、60s 陪伴、15s 信件）
   合并为一个 1 秒定时器；页面切到后台时暂停（除非「通知开启」→ 保活音频让后台继续跑，
   保证 TA 消息调度与系统通知在后台也能按时触发），回到前台由 visibilitychange 补跑。 */
let _tick=0;
function startHeartbeat(){
  setInterval(()=>{
    if(document.hidden&&!keepAliveActive())return;
    _tick++;
    updateStatusClock();
    renderTaTime();
    renderSignal();
    if(_tick%5===0){
      processMomentReplies();
      maybeTaMuteMe();
      if(typeof maybeTaStatusChange==='function')maybeTaStatusChange();
      if(typeof maybeTaCall==='function')maybeTaCall();
      if(typeof maybeTaSense==='function')maybeTaSense();       // v3.6.8 TA 主动感应
      if(typeof maybeNoteAlarm==='function')maybeNoteAlarm();    // v3.6.9 便签闹钟
      if(typeof maybeTodoAlarm==='function')maybeTodoAlarm();    // v3.6.11 待办闹钟
      if(typeof calMaybeSnap==='function')calMaybeSnap();   // v3.6.4 日历：跨天自动存档当天便签
      if(typeof calSyncTodayNotes==='function')calSyncTodayNotes();   // v3.6.12 当天便签自愈补同步
      // v3.6.10：按用户要求去掉朋友圈红点（提醒中心仍在，不再显示角标）
      refreshStalePolls();          // 题目「等太久」的文案翻转（只刷那几条气泡）
    }
    if(_tick%300===0){
      maybeTaWriteNote();            // TA 低频写便签（约 90~160 分钟一次机会，内部概率 30%）
    }
    if(_tick%15===0){
      processPendingReplies().then(n=>{if(n&&navStack[navStack.length-1]==='mailbox')renderMailbox();refreshAllBadges();});
    }
    if(_tick%60===0){
      if(state.stats.companionStart){
        state.stats.companionTime=(state.stats.companionTime||0)+(Date.now()-state.stats.companionStart);
        state.stats.companionStart=Date.now();saveKey('stats');
      }
    }
  },1000);
}


/* 桌面组件头像点击 → 导入本地相册 */
document.getElementById('widget-avatars').addEventListener('click',e=>{
  pickAvatar(e.target.closest('#home-avatar-other')?'other':'me');
});


/* 注册 Service Worker：Android Edge/Chrome 通知必需（通知统一走 reg.showNotification 发送） */
if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js').catch(()=>{});}

openDB().then(async()=>{
  checkUpdate();
  checkVersion();
  await loadSettings();
  migrateProb();                 // 旧概率结构 → 新独立概率结构（迁移一次）
  if(Date.now()<state.muteEndTime)showMuteBanner(Math.ceil((state.muteEndTime-Date.now())/1000));
  if(Date.now()<state.taMuteMeEndTime)showTaMuteBanner();
  applySkinVars();                 // 主题变量（浮层/反色令牌）由 state.skin 驱动
  applyChatBg();
  history.replaceState({d:1},'');
  updateHome();
  refreshAllBadges();
  initChatEvents();
  ensureTaDiary&&ensureTaDiary();
  resumeScheduledJobs();          // 恢复未完成的回复任务（含 catch-up）
  scheduleProactive();            // 重新安排主动消息
}).catch(e=>{console.error(e);showToast('数据库初始化失败');});


document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'){
    refreshAllBadges();
    if(isAppVisible())renderChat(false);
    resumeScheduledJobs();        // 回前台：恢复/补触发到期任务
  }
});
window.addEventListener('focus',()=>resumeScheduledJobs());
window.addEventListener('pageshow',()=>resumeScheduledJobs());
document.addEventListener('DOMContentLoaded',()=>resumeScheduledJobs());
// 路由切换 / 切回聊天也恢复状态
const _origOpenApp=window.openApp;
window.openApp=function(id,...rest){const r=_origOpenApp.apply(this,[id,...rest]);if(id==='chat')resumeScheduledJobs();return r;};

/* 启动：paintTabIcons 需要 DOM + LINE_ICONS，放在最后统一执行 */
paintTabIcons();
startHeartbeat();

/* v3.7：贴边小蝴蝶 = 连接 TA 世界的通道（不重载页面，保留当前状态与 TA 时间）
   点击 → 仪式感连接动画（约 2.1s）→ 同步 TA 意识状态一轮 + 检查新版本 */
let _connecting=false;
function refreshSite(){
  if(_connecting)return;
  _connecting=true;
  const b=document.getElementById('refresh-butterfly');
  if(b)b.classList.add('flap');
  const ov=document.getElementById('connect-overlay');
  const tx=document.getElementById('connect-text');
  const setT=s=>{if(tx)tx.textContent=s;};
  ov.classList.remove('done');ov.classList.add('show');
  setT('正在连接 TA 的世界…');
  setTimeout(()=>{
    setT('建立意识通道…');
    // 同步 TA 意识状态一轮（页面原地更新，不重载）
    try{
      if(typeof calSyncTodayNotes==='function')calSyncTodayNotes(true);
      if(typeof ensureTaSchedule==='function')ensureTaSchedule();
      if(typeof renderNotes==='function')renderNotes();
      if(typeof updateHome==='function')updateHome();
      if(typeof renderTaTime==='function')renderTaTime();
      if(typeof refreshAllBadges==='function')refreshAllBadges();
      if(typeof refreshStalePolls==='function')refreshStalePolls();
    }catch(e){console.warn('connect sync',e);}
  },700);
  setTimeout(()=>{setT('TA 在附近');ov.classList.add('done');},1500);
  setTimeout(()=>{
    ov.classList.remove('show');
    _connecting=false;
    if(b)b.classList.remove('flap');
    // 版本检查：有新版本提示手动刷新（不自动重载，不打断连接）
    try{if(typeof checkVersion==='function')checkVersion();}catch(e){}
  },2150);
}
