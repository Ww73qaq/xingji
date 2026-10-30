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

/* 状态栏时钟（主心跳每秒调用）：顶部左侧「我的时间」固定显示北京时间（UTC+8，用户手机时间） */
function updateStatusClock(){
  const now=new Date(Date.now()+(480+new Date().getTimezoneOffset())*60000);   // 任意设备时区 → 换算北京时间
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
  // v3.7.3：「TA」改用全局昵称（state.other.name），全站状态栏统一
  const d=new Date(Date.now()+taOffsetNow());
  const el=document.getElementById('sb-ta-time');
  const name=state.other.name||'TA';
  if(el){el.textContent=name+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');el.title=name+' 的世界时间，与现实有偏差';}
}

/* 唯一主心跳 v3.27.3：前台 1s 全速（时钟/信号/状态机），后台 45s 瘦身（跳过 DOM，只留调度兜底与闹钟类）。
   前后台判定双保险：网页 visibilitychange + Capacitor 原生 appStateChange（修复部分 ROM 切后台不触发
   visibilitychange 导致后台仍每秒全量跑的耗电问题）。TA「到点回复」不受影响——那是调度器独立的
   精确 setTimeout，心跳只是兜底巡逻；后台兜底从 1s 变 45s，最坏误差 45s，主动消息本身是小时级冷却。 */
let _tick=0,_bgMode=false,_heartTimer=0;
function _applyBg(v){
  const was=_bgMode;_bgMode=!!v;
  if(was&&!_bgMode){clearTimeout(_heartTimer);_heartTick();}   // 回前台：立即恢复 1s 心跳并补跑一轮
  else if(!was&&_bgMode){clearTimeout(_heartTimer);_heartTick();}   // 切后台：立即进入瘦身节拍
  else return;
}
document.addEventListener('visibilitychange',()=>_applyBg(document.hidden));
try{
  const _P=(window.Capacitor&&window.Capacitor.Plugins)||null;
  if(_P&&_P.App&&_P.App.addListener)_P.App.addListener('appStateChange',s=>_applyBg(!s.isActive));
}catch(e){}
function _scheduleHeartbeat(){clearTimeout(_heartTimer);_heartTimer=setTimeout(_heartTick,_bgMode?45000:1000);}
function startHeartbeat(){setTimeout(_heartTick,1000);}   /* 首跳延迟 1s：等 openDB 初始化完成（旧 setInterval 首跳即 1s，行为对齐） */
function _heartTick(){
  _scheduleHeartbeat();
  _tick++;
  if(_bgMode){
    /* 后台瘦身节拍（45s）：跳过一切 DOM 刷新；保留闹钟与跨天存档（分钟级敏感）。
       TA 回复的准点触发由调度器自身 dueTimer 负责，此处仅为兜底。 */
    if(typeof maybeNoteAlarm==='function')maybeNoteAlarm();
    if(typeof maybeTodoAlarm==='function')maybeTodoAlarm();
    if(typeof calMaybeSnap==='function')calMaybeSnap();
    return;
  }
  updateStatusClock();
  renderTaTime();
  renderSignal();
    if(_tick%5===0){
      processMomentReplies();
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
    if(_tick%120===0){ renderHomeTraceWidget(); }        // v3.7.5.1：桌面轨迹组件 2 分钟低频刷新
    if(_tick%300===0){
      maybeTaWriteNote();            // TA 低频写便签（约 90~160 分钟一次机会，内部概率 30%）
      if(typeof maybeTaLetter==='function')maybeTaLetter();   // v3.6.12 TA 主动来信（冷却 12~36h，字卡承载）
      if(typeof maybeTaMoment==='function')maybeTaMoment();   // v3.6.12 TA 主动发朋友圈（冷却 4~10h，频率略高）
      if(typeof maybeTaInteract==='function')maybeTaInteract();   // 4.2 TA 主动互动（提问/好奇/选择/打卡/邀请/吐槽）
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
  if (typeof appUpdateCheck === 'function') appUpdateCheck(false);   // v3.17.0：APP 壳内静默检查 APK 更新
  await loadSettings();
  migrateProb();                 // 旧概率结构 → 新独立概率结构（迁移一次）
  /* v3.9.5：刷新页面会丢掉内存里的陪伴会话（companion.js 的 companionSession），
     但 state.stats.companionStart 是持久化的 —— 于是下面 %60 的心跳会把「离开的这段挂钟时间」
     当成陪伴时长一直累加。启动时若没有活动会话，直接把残留的起点清掉，不再虚增。 */
  if(state.stats.companionStart&&typeof companionSession!=='undefined'&&!companionSession){
    state.stats.companionStart=0;saveKey('stats');
  }
  /* v3.24.0：禁言/TA 安静横幅恢复逻辑已删（两套静音移除） */
  if(typeof migratePersonaV41==='function')migratePersonaV41();   // 4.1：清掉旧的「医生」设定残留
  applySkinVars();                 // 主题变量（浮层/反色令牌）由 state.skin 驱动
  if(typeof setMusicPlayerVisible==='function')setMusicPlayerVisible(!!state.musicOn);   // 播放器开关（持久化值生效）
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
