/* =========================================================
   星迹 · 统一任务调度器（scheduler.js）
   - enqueueTaJob：所有 TA 行为唯一入口（回复/继续/主动/题目/问卷）
   - 单联系人最多 1 个 active reply job
   - 连续消息 8 秒合并窗口（每新增延后 1~2 秒，最多额外 8 秒）
   - 任务先持久化（settings.activeJob），setTimeout 只是加速手段
   - resumeScheduledJobs 在多个恢复点调用，过期任务 catch-up
   - 状态机：waiting → typing → sending → done / cancelled
   ========================================================= */
const JOB_KEY='activeJob';
const PROACTIVE_KEY='proactiveNextAt';

const _scheduler={
  activeJob:null,       // 当前 reply job（含 proactive）
  pendingQueue:0,       // sending 期间到达的新消息 → 记一轮
  pendingJobs:[],       // 排队中的下一轮参数（messageId / 问卷期限），避免题目被丢掉
  tickTimer:null,       // 每秒倒计时 UI
  dueTimer:null,        // 到 dueAt 精确触发
  proactiveTimer:null,  // 主动消息定时器
  lastUserMsgAt:0,      // 用户最后发消息时间（主动避让）
  lastTaReplyAt:0,      // TA 最后回复时间（主动避让）
  mergeWindow:8000,     // 连续消息合并窗口
  maxExtraDelay:8000,   // 合并最大额外延后
  extraDelayed:0,       // 本轮已额外延后
  proactiveNextAt:0     // 下一次主动消息时间戳
};


/* 回复总时长（ms）：从用户发送到 TA 第一条回复出现（固定 replyDelaySec，含「正在输入…」窗口） */
function _replyTotalMs(){
  const p=state.prob||{};
  const sec=Math.max(1,Number(p.replyDelaySec)||20);
  return sec*1000;
}
/* 正在输入窗口：包含在总回复时间内（最后 typingRatio 段，钳制 1~4 秒） */
function _typingWindow(totalMs){
  const p=state.prob||{};
  const ratio=Number.isFinite(Number(p.typingRatio))?Number(p.typingRatio):0.25;
  return _clamp(Math.min(4000,totalMs*ratio),1000,4000);
}

/* ---- 任务持久化（settings store，按 key 覆盖） ---- */
function _persistJob(){
  const j=_scheduler.activeJob;
  if(!j||(j.status!=='waiting'&&j.status!=='typing'))return _clearPersistJob();
  const value={id:j.id,type:j.type,source:j.source,status:j.status,createdAt:j.createdAt,dueAt:j.dueAt,typingAt:j.typingAt,roundId:j.roundId,contactId:j.contactId,messageIds:j.messageIds,generation:j.generation,deadlineSec:j.deadlineSec,earlySubmitProb:j.earlySubmitProb};
  return dbGet('settings',JOB_KEY)
    .then(row=>{if(row){row.value=value;return dbPut('settings',row);}return dbPut('settings',{key:JOB_KEY,value});})
    .catch(e=>console.warn('[scheduler] persist job failed',e));
}
function _clearPersistJob(){
  return dbDelete('settings',JOB_KEY).catch(e=>console.warn('[scheduler] clear job failed',e));
}
function _persistProactiveNext(){
  const value={at:_scheduler.proactiveNextAt};
  return dbGet('settings',PROACTIVE_KEY)
    .then(row=>{if(row){row.value=value;return dbPut('settings',row);}return dbPut('settings',{key:PROACTIVE_KEY,value});})
    .catch(e=>console.warn('[scheduler] persist proactiveNext failed',e));
}

/* ---- 顶部状态副标题（唯一来源：activeJob.phase） ---- */
function _syncSubtitle(){
  if(typeof window.updateChatSubtitle==='function')window.updateChatSubtitle();
}

/* ---- 调度执行 ---- */
function _scheduleDue(){
  if(_scheduler.dueTimer){clearTimeout(_scheduler.dueTimer);_scheduler.dueTimer=null;}
  const j=_scheduler.activeJob;
  if(!j||(j.status!=='waiting'&&j.status!=='typing'))return;
  const wait=Math.max(0,j.dueAt-Date.now())+30;
  _scheduler.dueTimer=setTimeout(()=>{
    const j2=_scheduler.activeJob;
    if(j2&&j2.id===j.id&&(j2.status==='waiting'||j2.status==='typing')){
      j2.status='typing';
      if(Date.now()>=j2.dueAt){_executeJob();return;}
      _persistJob();
    }
    _syncSubtitle();
  },wait);
}
function _startTick(){
  if(_scheduler.tickTimer)return;
  _scheduler.tickTimer=setInterval(()=>{
    const j=_scheduler.activeJob;
    if(!j){_syncSubtitle();return;}
    if(j.status==='waiting'&&Date.now()>=j.typingAt){
      j.status='typing';_persistJob();
    }
    if((j.status==='waiting'||j.status==='typing')&&Date.now()>=j.dueAt){
      _executeJob();return;
    }
    _syncSubtitle();
  },1000);
}
function _stopTick(){
  if(_scheduler.tickTimer){clearInterval(_scheduler.tickTimer);_scheduler.tickTimer=null;}
}

/* 创建/合并回复任务（所有用户消息与「继续」的唯一入口） */
/* 排队一轮：记下本条消息（及问卷期限），等当前这轮跑完再补一轮。
   v3.4.0：原先只累加一个计数器，排队期间发出的「单选/多选/问卷」会丢掉 messageId，
   结果那一轮不知道该回答哪道题。现在把参数一起排队。 */
function _queueNextRound(cfg){
  _scheduler.pendingQueue++;
  _scheduler.pendingJobs.push({
    messageId:cfg.messageId||null,
    deadlineSec:Number.isFinite(Number(cfg.deadlineSec))?Number(cfg.deadlineSec):null,
    earlySubmitProb:Number.isFinite(Number(cfg.earlySubmitProb))?Number(cfg.earlySubmitProb):null
  });
}
function enqueueTaJob(config){
  const cfg=config||{};
  const source=cfg.source||'passive';
  if(Date.now()<state.muteEndTime){showToast('对方已被禁言');return;}
  const now=Date.now();
  _scheduler.lastUserMsgAt=now;
  const j=_scheduler.activeJob;
  if(j&&(j.status==='waiting'||j.status==='typing')){
    // 合并窗口内 → 延后 dueAt/typingAt 1~2 秒（累计最多额外 8 秒）
    if(now-j.createdAt<_scheduler.mergeWindow&&_scheduler.extraDelayed<_scheduler.maxExtraDelay){
      const extra=1000+Math.random()*1000;
      _scheduler.extraDelayed+=extra;
      j.dueAt+=extra;j.typingAt+=extra;
      if(cfg.messageId)j.messageIds.push(cfg.messageId);
      _persistJob();_scheduleDue();_syncSubtitle();
      return;
    }
    // 超出合并窗口仍在等待 → 排队下一轮
    _queueNextRound(cfg);
    return;
  }
  if(j&&j.status==='sending'){_queueNextRound(cfg);return;}
  // 新任务：问卷可携带独立期限（deadlineSec，来自「消息自身的 survey.deadlineSec」）
  // v3.4.0：期限以问卷自身设置为准（不再与回复时间取更早者），
  //         否则「设 60 秒」会被 20 秒的回复时间截断，期限形同虚设。
  // 提前交卷：部分问卷 TA 会在期限结束前 25%~75% 时刻交卷（earlySubmitProb 控制概率，优先取消息自带值）
  let totalMs=_replyTotalMs();
  const deadlineSec=Number(cfg.deadlineSec);
  const hasDeadline=Number.isFinite(deadlineSec)&&deadlineSec>0;
  let earlySubmitProb=null;
  if(hasDeadline){
    let eff=deadlineSec;
    const ss=state.surveySettings||{};
    const ep=Number(cfg.earlySubmitProb);
    earlySubmitProb=Number.isFinite(ep)?_clamp(ep,0,100):(Number.isFinite(Number(ss.earlySubmitProb))?Number(ss.earlySubmitProb):30);
    if(_roll(earlySubmitProb))eff=deadlineSec*(0.25+Math.random()*0.5);
    totalMs=Math.max(_typingWindow(totalMs),eff*1000);
  }
  const tw=_typingWindow(totalMs);
  const typingAt=now+totalMs-tw;
  const dueAt=now+totalMs;
  const job={
    id:'job_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7),
    type:cfg.type||'reply',source,
    status:'waiting',
    createdAt:now,dueAt,typingAt,
    roundId:'r_'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),
    contactId:'other',
    messageIds:cfg.messageId?[cfg.messageId]:[],
    deadlineSec:hasDeadline?deadlineSec:null,
    earlySubmitProb,
    generation:(j?j.generation+1:1)
  };
  _scheduler.activeJob=job;
  _scheduler.extraDelayed=0;
  _persistJob();
  _scheduleDue();
  _startTick();
  _syncSubtitle();
}
/* 「继续」：只改变 source，时间机制与普通消息完全一致 */
function continueReply(){
  if(Date.now()<state.muteEndTime){showToast('对方已被禁言');return;}
  if(_scheduler.activeJob){showToast('对方正在回复中');return;}
  enqueueTaJob({type:'reply',source:'continue'});
}
function getActiveJob(){return _scheduler.activeJob;}

/* ---- 执行一轮回复（sending） ---- */
function _executeJob(){
  const j=_scheduler.activeJob;
  if(!j||(j.status!=='waiting'&&j.status!=='typing'))return;
  j.status='sending';
  _persistJob();
  // 执行层在 js/engine.js（executeReply：落库 + 增量渲染 + 系统通知）
  if(typeof window.executeReply==='function'){
    window.executeReply(j).then(()=>_finishJob()).catch(e=>{console.warn('[scheduler] execute job failed',e);_finishJob();});
  }else{
    _finishJob();
  }
}
/* 一轮结束：清理 / 排队下一轮 / 重新安排主动消息 */
function _finishJob(){
  _scheduler.activeJob=null;
  _scheduler.extraDelayed=0;
  _stopTick();                       // 无任务时停掉每秒倒计时，避免定时器常驻
  _clearPersistJob();
  if(_scheduler.pendingQueue>0){
    _scheduler.pendingQueue--;
    const next=_scheduler.pendingJobs.shift()||{};
    setTimeout(()=>enqueueTaJob({type:'reply',source:'passive',messageId:next.messageId,deadlineSec:next.deadlineSec,earlySubmitProb:next.earlySubmitProb}),650);
  }else{
    _scheduler.pendingJobs=[];
  }
  _syncSubtitle();
  scheduleProactive();
}

/* ---- 主动消息：统一进 scheduler。用户可见设置只有「开关 + 最小间隔（分钟）」；
   TA 的想不想主动属于内部行为（间隔内随机偏置 + 内部意愿概率） ---- */
const INTERNAL_QUIET_MS=20*60000;      // 内部：你发消息后的安静期（不暴露给用户）
const INTERNAL_PROACTIVE_PCT=45;        // 内部：到点后 TA 主动联系的意愿概率（不暴露给用户）
function scheduleProactive(){
  if(_scheduler.proactiveTimer){clearTimeout(_scheduler.proactiveTimer);_scheduler.proactiveTimer=null;}
  const p=state.prob||{};
  if(!p.proactiveEnabled){
    _scheduler.proactiveNextAt=0;_persistProactiveNext();
    return;
  }
  const min=Math.max(1,Number(p.proactiveMinIntervalMin)||30);
  // 至少 min 分钟；内部在 min~min*1.5 间随机（不向用户暴露最大值）
  const delay=(min+Math.random()*min*0.5)*60000;
  _scheduler.proactiveNextAt=Date.now()+delay;
  _persistProactiveNext();
  _scheduler.proactiveTimer=setTimeout(runProactive,delay);
}
/* 主动消息避让规则：等待/输入/多气泡/通话/用户刚发/TA 刚回复/禁言 时禁止插入 */
function runProactive(){
  if(_scheduler.proactiveTimer){clearTimeout(_scheduler.proactiveTimer);_scheduler.proactiveTimer=null;}
  const p=state.prob||{};
  _scheduler.proactiveNextAt=0;_persistProactiveNext();
  if(!p.proactiveEnabled)return;
  if(Date.now()<state.muteEndTime){scheduleProactive();return;}
  if(Date.now()<state.taMuteMeEndTime){scheduleProactive();return;}
  const j=_scheduler.activeJob;
  if(j&&(j.status==='waiting'||j.status==='typing'||j.status==='sending')){scheduleProactive();return;}
  if(state.callActive){scheduleProactive();return;}
  if(Date.now()-_scheduler.lastUserMsgAt<INTERNAL_QUIET_MS){scheduleProactive();return;}
  if(Date.now()-_scheduler.lastTaReplyAt<60000){scheduleProactive();return;}
  if(!_roll(INTERNAL_PROACTIVE_PCT)){scheduleProactive();return;}
  // 主动消息直接进入 typing（时长统一从回复设置读取）
  const tw=_typingWindow(_replyTotalMs());
  const now=Date.now();
  const job={
    id:'job_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7),
    type:'reply',source:'proactive',
    status:'typing',
    createdAt:now,dueAt:now+tw,typingAt:now,
    roundId:'r_'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),
    contactId:'other',messageIds:[],generation:1
  };
  _scheduler.activeJob=job;
  _persistJob();
  _scheduleDue();
  _startTick();
  _syncSubtitle();
}
function startProactive(){scheduleProactive();}
function stopProactive(){
  if(_scheduler.proactiveTimer){clearTimeout(_scheduler.proactiveTimer);_scheduler.proactiveTimer=null;}
}

/* ---- 恢复检查点：DOMContentLoaded / pageshow / focus / visibilitychange / 路由切换 / 切回聊天 ----
   v3.4.0：原先用 `if(!window.DB) return` 直接短路，DB 未就绪时静默丢掉恢复。
   改为等 dbReady，ready 后自动补跑；已 ready 时行为与原来一致。 ---- */
function resumeScheduledJobs(){
  if(typeof dbReady==='undefined'||!dbReady)return Promise.resolve();
  return dbReady.then(()=>{
    const list=dbGetAll('settings');
    return list;
  }).then(list=>{
    if(!list)return;
    const jrow=list.find(r=>r.key===JOB_KEY);
    if(jrow&&jrow.value){
      const v=jrow.value;
      const now=Date.now();
      const job={...v};
      _scheduler.activeJob=job;
      if(now>=job.dueAt){
        job.status='typing';
        _executeJob();          // catch-up：补发，不重随机
        return;
      }
      job.status=now>=job.typingAt?'typing':'waiting';
      _persistJob();
      _scheduleDue();
      _startTick();
      _syncSubtitle();
    }
    const prow=list.find(r=>r.key===PROACTIVE_KEY);
    if(prow&&prow.value&&prow.value.at){
      _scheduler.proactiveNextAt=prow.value.at;
      const wait=prow.value.at-Date.now();
      if(_scheduler.proactiveTimer)clearTimeout(_scheduler.proactiveTimer);
      _scheduler.proactiveTimer=setTimeout(runProactive,Math.max(0,wait)+100);
    }
  }).catch(e=>console.warn('[scheduler] resume failed',e));
}
