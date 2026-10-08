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

/* 唯一主心跳：原先散落的 4 个 setInterval（1s 时钟/信号、5s 朋友圈、60s 陪伴、15s 信件）
   合并为一个 1 秒定时器；页面切到后台时暂停（除非「通知开启」→ 保活音频让后台继续跑，
   保证 TA 消息调度与系统通知在后台也能按时触发），回到前台由 visibilitychange 补跑。 */
let _tick=0;
function startHeartbeat(){
  setInterval(()=>{
    if(document.hidden&&!keepAliveActive())return;
    _tick++;
    updateStatusClock();
    renderSignal();
    if(_tick%5===0){
      processMomentReplies();
      maybeTaMuteMe();
      const badge=document.getElementById('mom-notif-badge');
      if(badge)badge.style.display=notifUnreadCount()>0?'block':'none';
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
