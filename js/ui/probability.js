/* =========================================================
   星迹 · 相处节奏设置页（v3.7.0，P0 内化整改）
   —— 原先约 15 个「概率% / 秒 / 分钟 / 条」滑杆全部删除并内化，
      UI 只呈现关系语义；底层数值由 js/utils.js 的 set*Tier 派生落库，
      本页不直接读写工程参数，也绝不显示 % / 秒 / 分钟 / 条。
   ========================================================= */
let probAdjusting=false;

/* 语义档位分段行：选中 primary、未选 ghost */
function _tierRow(current, options, applyFn){
  return `<div style="display:flex;gap:8px;margin-top:12px">
    ${options.map(([val,label])=>`
      <button type="button" class="btn-pill ${current===val?'primary':'ghost'}" style="flex:1;padding:11px 0;letter-spacing:0" onclick="${applyFn}('${val}')">${label}</button>
    `).join('')}
  </div>`;
}

/* 相处习惯开关行：只显「开 / 关」，不显概率 */
function _switchRow(key,label,sub){
  const v=state.prob[key];
  const on=!(v===false||v===0);   // v3.9.5：false / 数字 0 都算关（兼容旧数据）；未设置默认开，唯 readIgnoreEnabled 默认关
  return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid rgba(0,0,0,.06)">
    <div>
      <div style="font-size:14px;color:var(--text)">${label}</div>
      <div style="font-size:11px;color:var(--hint);margin-top:3px;line-height:1.5">${sub}</div>
    </div>
    <button type="button" class="btn-pill ${on?'primary':'ghost'}" style="padding:6px 16px;font-size:12px;flex-shrink:0" onclick="setProb('${key}',${on?0:1})">${on?'开':'关'}</button>
  </div>`;
}

function renderProbability(){
  const p=state.prob;
  const body=document.getElementById('probability-body');if(!body)return;
  body.innerHTML=`
    <div class="list-card">
      <div class="list-card-title">说话节奏</div>
      <div class="list-card-sub">TA 回你的快慢，不用赶。想让 TA 从容一点，还是利落一点。</div>
      ${_tierRow(p.replyPace||'natural',[['slow','从容慢一点'],['natural','自然'],['fast','快一点']],'applyReplyPace')}
    </div>
    <div class="list-card">
      <div class="list-card-title">主动频率</div>
      <div class="list-card-sub">TA 多久会想主动找你说说话。</div>
      ${_tierRow(p.proactiveFreq||'occasional',[['rare','安静独处'],['occasional','偶尔想起'],['frequent','常来看看']],'applyProactiveFreq')}
    </div>
    <div class="list-card">
      <div class="list-card-title">用词与字卡比例</div>
      <div class="list-card-sub">TA 说话时，多用你为 TA 整理的话，还是让 TA 顺着心意自己发挥。</div>
      ${_tierRow(p.cardRatio||'mine',[['mine','以你整理的为主'],['half','各占一半'],['free','让 TA 自由发挥']],'applyCardRatio')}
    </div>
    <div class="list-card">
      <div class="list-card-title">相处习惯</div>
      <div class="list-card-sub">一些你们之间的小习惯，想开想关都随你。</div>
      ${_switchRow('proactiveEnabled','主动来消息','TA 想你的时候，会自己先开口')}
      ${_switchRow('multiBubbleEnabled','分几次说','像当面聊天，把一句话拆成几次发出来')}
      ${_switchRow('cardConcatEnabled','把话连成一句','把几张字卡拼成一整句，听着更自然')}
      ${_switchRow('readIgnoreEnabled','偶尔已读不回','有时候 TA 看到了，只想先安静待一会儿')}
    </div>
    <button type="button" class="btn-pill ghost" style="width:100%;margin-top:4px" onclick="resetProb()">恢复默认</button>`;
}

/* 档位点击：调用 utils.js 已就绪的 setter 派生底层数值，再落库并刷新选中态 */
function applyReplyPace(t){ setReplyPace(t); saveKey('prob'); renderProbability(); }
function applyProactiveFreq(t){ setProactiveFreqTier(t); saveKey('prob'); renderProbability(); }
function applyCardRatio(t){ setCardRatioTier(t); saveKey('prob'); renderProbability(); }

/* setSurveySetting：v3.4.0 起本页不再展示问卷卡片，
   这里保留为「弹窗默认值的读写入口」——发送问卷/多选时用它取上次的默认数字。 */
function setSurveySetting(key,v){
  state.surveySettings=state.surveySettings||{deadlineSec:60,earlySubmitProb:30,multiMin:1,multiMax:6};
  if(key==='deadlineSec')state.surveySettings.deadlineSec=Math.max(10,Math.min(600,parseInt(v)||60));
  else if(key==='earlySubmitProb')state.surveySettings.earlySubmitProb=Math.max(0,Math.min(100,parseInt(v)||30));
  else if(key==='multiMin'){let n=Math.max(1,Math.min(10,parseInt(v)||1));if(n>state.surveySettings.multiMax)state.surveySettings.multiMax=n;state.surveySettings.multiMin=n;}
  else if(key==='multiMax'){let n=Math.max(1,Math.min(10,parseInt(v)||6));if(n<state.surveySettings.multiMin)state.surveySettings.multiMin=n;state.surveySettings.multiMax=n;}
  saveKey('surveySettings');renderProbability();
}

/* 能力开关：只用于相处习惯的 0/1 开关行 */
function setProb(key,val){
  if(probAdjusting)return;
  state.prob[key]=parseInt(val)?true:false;   // v3.9.5：一律存布尔——原来存 0/1 会被读侧的 !==false 当成「开」
  saveKey('prob');
  if(key==='proactiveEnabled')scheduleProactive();
  renderProbability();
}

function updateProbHints(){}

function resetProb(){
  state.prob={...state.prob,
    replyDelaySec:20,typingRatio:0.25,
    multiBubbleEnabled:true,multiBubbleProb:30,maxBubbles:3,
    cardConcatEnabled:true,cardConcatProb:35,minCardsPerBubble:1,maxCardsPerBubble:3,
    emojiReplyProb:15,pokeReplyProb:8,quoteReplyProb:20,giftReplyProb:5,
    emojiCardProb:20,
    readIgnoreEnabled:false,repeatExclude:5,customRatio:90,
    proactiveEnabled:true,proactiveMinIntervalMin:30,
    proactiveCountMin:1,proactiveCountMax:2,
    momentProb:20
  };
  // 复位三个关系语义档位，并通过 setter 派生对应底层数值
  setReplyPace('natural');
  setProactiveFreqTier('occasional');
  setCardRatioTier('mine');
  state.surveySettings={deadlineSec:60,earlySubmitProb:30,multiMin:1,multiMax:6};
  saveKey('prob');saveKey('surveySettings');renderProbability();scheduleProactive();showToast('已恢复默认');
}
