/* =========================================================
   星迹 · 相处节奏（回复设置）v3.28.2
   —— 对齐 mochi：分组 tabs + 逐项裸露「秒数 / 条数 / 概率%」，− / + 直接调，即改即存。
   —— 保留原有「关系档位」作为一键预设；所有颜色走主题变量，墨白/紫晶自动跟随。
   ========================================================= */
let probAdjusting=false;
let probTab='chat';   /* chat | moments | other */

/* 参数元数据：min / max / step / 单位 / 说明 */
const PROB_META={
  replyDelayMinSec:{min:1,max:120,step:1,unit:'秒',hint:'回复速度最短'},
  replyDelayMaxSec:{min:1,max:120,step:1,unit:'秒',hint:'回复速度最长'},
  maxBubbles:{min:1,max:6,step:1,unit:'条',hint:'回复条数最多'},
  multiBubbleProb:{min:0,max:100,step:5,unit:'%',hint:'分成多条说的概率'},
  readIgnoreProb:{min:0,max:100,step:5,unit:'%',hint:'已读不回概率'},
  proactiveMinIntervalMin:{min:1,max:720,step:5,unit:'分钟',hint:'主动间隔'},
  cardConcatProb:{min:0,max:100,step:5,unit:'%',hint:'把多张字卡拼成一句'},
  minCardsPerBubble:{min:1,max:6,step:1,unit:'张',hint:'每气泡最少张数'},
  maxCardsPerBubble:{min:1,max:6,step:1,unit:'张',hint:'每气泡最多张数'},
  customRatio:{min:0,max:100,step:5,unit:'%',hint:'用你整理的字卡占比'},
  emojiReplyProb:{min:0,max:100,step:5,unit:'%',hint:'微情绪回应'},
  pokeReplyProb:{min:0,max:100,step:1,unit:'%',hint:'拍一拍'},
  quoteReplyProb:{min:0,max:100,step:5,unit:'%',hint:'引用你的话'},
  giftReplyProb:{min:0,max:100,step:1,unit:'%',hint:'送礼物'},
  emojiCardProb:{min:0,max:100,step:5,unit:'%',hint:'颜文字字卡'},
  withdrawProb:{min:0,max:100,step:1,unit:'%',hint:'撤回概率'},
  withdrawReissueProb:{min:0,max:100,step:5,unit:'%',hint:'撤回后补发'},
  momentProb:{min:0,max:100,step:5,unit:'%',hint:'主动发朋友圈'},
  callHangupMinSec:{min:30,max:1800,step:30,unit:'秒',hint:'通话最短保底'},
  callHangupProb:{min:0,max:50,step:1,unit:'%/分',hint:'每分钟挂断概率'}
};

/* 语义档位分段行：选中 primary、未选 ghost */
function _tierRow(current, options, applyFn){
  return `<div style="display:flex;gap:8px;margin-top:12px">
    ${options.map(([val,label])=>`
      <button type="button" class="btn-pill ${current===val?'primary':'ghost'}" style="flex:1;padding:11px 0;letter-spacing:0" onclick="${applyFn}('${val}')">${label}</button>
    `).join('')}
  </div>`;
}

/* 相处习惯开关行：只显「开 / 关」 */
function _switchRow(key,label,sub){
  const v=state.prob[key];
  const on=!(v===false||v===0);
  return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid var(--line,rgba(0,0,0,.06))">
    <div>
      <div style="font-size:14px;color:var(--text)">${label}</div>
      <div style="font-size:11px;color:var(--hint);margin-top:3px;line-height:1.5">${sub}</div>
    </div>
    <button type="button" class="btn-pill ${on?'primary':'ghost'}" style="padding:6px 16px;font-size:12px;flex-shrink:0" onclick="setProb('${key}',${on?0:1})">${on?'开':'关'}</button>
  </div>`;
}

/* 数值行：− 值 + （裸露秒数/条数/概率） */
function _numRow(key,label,sub){
  const m=PROB_META[key]||{min:0,max:100,step:1,unit:'%'};
  let v=Number(state.prob[key]);
  if(!Number.isFinite(v))v=m.min;
  const isMax=key==='replyDelayMaxSec';
  const isMinCards=key==='minCardsPerBubble';
  return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 0;border-top:1px solid var(--line,rgba(0,0,0,.06))">
    <div style="min-width:0">
      <div style="font-size:14px;color:var(--text)">${label}<span style="font-size:11px;color:var(--hint);margin-left:5px">${m.unit}</span></div>
      <div style="font-size:11px;color:var(--hint);margin-top:3px;line-height:1.5">${sub||(''+m.hint)}</div>
    </div>
    <div style="display:flex;align-items:center;gap:2px;flex-shrink:0;background:var(--input,#ecebe7);border-radius:12px;padding:3px">
      <button type="button" onclick="adjustProb('${key}',-1)" style="width:30px;height:30px;border:0;border-radius:9px;background:transparent;color:var(--text);font-size:17px;line-height:1;cursor:pointer">−</button>
      <b id="pv_${key}" style="min-width:44px;text-align:center;font-size:14px;font-variant-numeric:tabular-nums;color:var(--text)">${v}</b>
      <button type="button" onclick="adjustProb('${key}',1)" style="width:30px;height:30px;border:0;border-radius:9px;background:transparent;color:var(--text);font-size:17px;line-height:1;cursor:pointer">+</button>
    </div>
  </div>`;
}

/* 调值：钳制 → 落库 → 只更新显示（不整页重绘，避免滚动跳动） */
function adjustProb(key,dir){
  if(probAdjusting)return;
  const m=PROB_META[key];if(!m)return;
  let v=Number(state.prob[key]);if(!Number.isFinite(v))v=m.min;
  v=v+dir*m.step;
  v=Math.max(m.min,Math.min(m.max,v));
  /* 联动约束：最短 ≤ 最长；每气泡最少 ≤ 最多 */
  if(key==='replyDelayMinSec'&&Number(state.prob.replyDelayMaxSec)<v)state.prob.replyDelayMaxSec=v;
  if(key==='replyDelayMaxSec'&&Number(state.prob.replyDelayMinSec)>v)state.prob.replyDelayMinSec=v;
  if(key==='minCardsPerBubble'&&Number(state.prob.maxCardsPerBubble)<v)state.prob.maxCardsPerBubble=v;
  if(key==='maxCardsPerBubble'&&Number(state.prob.minCardsPerBubble)>v)state.prob.minCardsPerBubble=v;
  state.prob[key]=v;
  probAdjusting=true;
  saveKey('prob');
  const el=document.getElementById('pv_'+key);if(el)el.textContent=v;
  const el2=document.getElementById('pv_'+(key==='replyDelayMinSec'?'replyDelayMaxSec':key==='replyDelayMaxSec'?'replyDelayMinSec':key==='minCardsPerBubble'?'maxCardsPerBubble':key==='maxCardsPerBubble'?'minCardsPerBubble':''));
  if(el2){const k2=el2.id.slice(3);el2.textContent=Number(state.prob[k2]);}
  probAdjusting=false;
  if(key==='proactiveMinIntervalMin'&&typeof scheduleProactive==='function')scheduleProactive();
}

/* tab 切换 */
function switchProbTab(t){
  probTab=t;
  renderProbability();
}

function renderProbability(){
  const p=state.prob;
  const body=document.getElementById('probability-body');if(!body)return;
  const tabBtn=(k,label)=>`<button type="button" class="tab${probTab===k?' active':''}" onclick="switchProbTab('${k}')">${label}</button>`;

  const head=`<div class="list-card" style="padding:14px 16px">
      <div style="font-size:12px;color:var(--sub);line-height:1.8">以下都是 ${esc(state.other.name||'TA')} 随机行为的触发概率与时长：调到 0 = 不再触发；开关关掉 = 彻底关闭该行为。修改即时保存生效。</div>
    </div>
    <div class="tabs" style="margin:10px 0 12px">${tabBtn('chat','聊天')}${tabBtn('moments','朋友圈')}${tabBtn('other','其他')}</div>`;

  let panel='';
  if(probTab==='chat'){
    panel=`
    <div class="list-card">
      <div class="list-card-title">回复与主动</div>
      <div class="list-card-sub">TA 回你的快慢、一次回几条。</div>
      ${_numRow('replyDelayMinSec','回复速度最短','TA 最早可能多久回你')}
      ${_numRow('replyDelayMaxSec','回复速度最长','TA 最晚多久回你（在最短~最之间随机）')}
      ${_numRow('maxBubbles','回复条数最多','一次最多分成几条发出来')}
      ${_numRow('multiBubbleProb','分成多条的概率','每次回话拆成多条的几率')}
      ${_numRow('readIgnoreProb','已读不回概率','命中后只显示已读、这轮不回复')}
      ${_numRow('proactiveMinIntervalMin','主动间隔','TA 想主动找你时，最少隔多久')}
      ${_switchRow('proactiveEnabled','主动来消息','TA 想你的时候会自己先开口')}
    </div>
    <div class="list-card">
      <div class="list-card-title">字卡与概率</div>
      <div class="list-card-sub">字卡怎么抽、抽几张、附带哪些小动作。</div>
      ${_numRow('customRatio','用你整理的字卡占比','剩下的比例走系统字卡池')}
      ${_numRow('cardConcatProb','把话连成一句的概率','几张字卡拼成一句，听着更自然')}
      ${_numRow('minCardsPerBubble','每气泡最少张数','')}
      ${_numRow('maxCardsPerBubble','每气泡最多张数','')}
      ${_numRow('emojiReplyProb','微情绪回应概率','笑了 / 愣了一下 这类纯文字情绪')}
      ${_numRow('pokeReplyProb','拍一拍概率','')}
      ${_numRow('quoteReplyProb','引用概率','引你的话再回')}
      ${_numRow('giftReplyProb','礼物概率','')}
      ${_numRow('emojiCardProb','颜文字字卡概率','')}
      ${_switchRow('multiBubbleEnabled','分几次说','关掉后无论上面设几条都只回 1 条')}
      ${_switchRow('cardConcatEnabled','把话连成一句','关掉后一次只发一张字卡')}
      ${_switchRow('readIgnoreEnabled','偶尔已读不回','关掉后永不触发已读不回')}
    </div>
    <div class="list-card">
      <div class="list-card-title">撤回</div>
      <div class="list-card-sub">TA 偶尔会撤回刚发的话。</div>
      ${_numRow('withdrawProb','撤回概率','0 = 永不撤回')}
      ${_numRow('withdrawReissueProb','撤回后补发概率','撤回后另发一张字卡的概率；0 = 撤回后什么都不再说')}
    </div>
    <div class="list-card">
      <div class="list-card-title">一键预设</div>
      <div class="list-card-sub">不想逐项调？点一个档位套用整套推荐值。</div>
      <div style="font-size:12px;color:var(--sub);margin-top:10px">说话节奏</div>
      ${_tierRow(p.replyPace||'natural',[['slow','从容慢一点'],['natural','自然'],['fast','快一点']],'applyReplyPace')}
      <div style="font-size:12px;color:var(--sub);margin-top:14px">用词与字卡比例</div>
      ${_tierRow(p.cardRatio||'mine',[['mine','以你整理的为主'],['half','各占一半'],['free','让 TA 自由发挥']],'applyCardRatio')}
    </div>`;
  }else if(probTab==='moments'){
    panel=`
    <div class="list-card">
      <div class="list-card-title">朋友圈</div>
      <div class="list-card-sub">TA 多久会想发一条动态。</div>
      ${_numRow('momentProb','主动发朋友圈概率','每次到点后决定发不发的几率')}
    </div>`;
  }else{
    panel=`
    <div class="list-card">
      <div class="list-card-title">通话</div>
      <div class="list-card-sub">TA 在电话里陪你聊多久。</div>
      ${_numRow('callHangupMinSec','通话最短保底','至少陪你这么久才可能挂断')}
      ${_numRow('callHangupProb','每分钟挂断概率','每分钟掷一次，数值越大挂得越快')}
      ${_tierRow(p.callHangupTier||'natural',[['clingy','恋恋不舍'],['natural','自然'],['brief','简短']],'applyCallHangupTier')}
    </div>
    <div class="list-card">
      <div class="list-card-title">主动频率</div>
      <div class="list-card-sub">TA 多久会想主动找你说说话。</div>
      ${_tierRow(p.proactiveFreq||'occasional',[['rare','安静独处'],['occasional','偶尔想起'],['frequent','常来看看']],'applyProactiveFreq')}
    </div>`;
  }

  body.innerHTML=head+panel+`<button type="button" class="btn-pill ghost" style="width:100%;margin-top:6px" onclick="resetProb()">恢复默认</button>`;
}

/* 档位点击：调用 utils.js 已就绪的 setter 派生底层数值，再落库并刷新 */
function applyReplyPace(t){ setReplyPace(t); saveKey('prob'); renderProbability(); }
function applyProactiveFreq(t){ setProactiveFreqTier(t); saveKey('prob'); renderProbability(); }
function applyCardRatio(t){ setCardRatioTier(t); saveKey('prob'); renderProbability(); }
function applyReadIgnoreTier(t){ setReadIgnoreTier(t); saveKey('prob'); renderProbability(); }
function applyCallHangupTier(t){ setCallHangupTier(t); saveKey('prob'); renderProbability(); }

/* setSurveySetting：问卷/多选发送弹窗的默认值读写入口 */
function setSurveySetting(key,v){
  state.surveySettings=state.surveySettings||{deadlineSec:60,earlySubmitProb:30,multiMin:1,multiMax:6};
  if(key==='deadlineSec')state.surveySettings.deadlineSec=Math.max(10,Math.min(600,parseInt(v)||60));
  else if(key==='earlySubmitProb')state.surveySettings.earlySubmitProb=Math.max(0,Math.min(100,parseInt(v)||30));
  else if(key==='multiMin'){let n=Math.max(1,Math.min(10,parseInt(v)||1));if(n>state.surveySettings.multiMax)state.surveySettings.multiMax=n;state.surveySettings.multiMin=n;}
  else if(key==='multiMax'){let n=Math.max(1,Math.min(10,parseInt(v)||6));if(n<state.surveySettings.multiMin)state.surveySettings.multiMin=n;state.surveySettings.multiMax=n;}
  saveKey('surveySettings');renderProbability();
}

/* 能力开关：0/1 开关行 */
function setProb(key,val){
  if(probAdjusting)return;
  state.prob[key]=parseInt(val)?true:false;
  saveKey('prob');
  if(key==='proactiveEnabled')scheduleProactive();
  renderProbability();
}

function updateProbHints(){}

function resetProb(){
  state.prob={...state.prob,
    replyDelaySec:20,typingRatio:0.25,replyDelayMinSec:4,replyDelayMaxSec:9,
    multiBubbleEnabled:true,multiBubbleProb:30,maxBubbles:3,
    cardConcatEnabled:true,cardConcatProb:35,minCardsPerBubble:1,maxCardsPerBubble:3,
    emojiReplyProb:15,pokeReplyProb:8,quoteReplyProb:20,giftReplyProb:5,
    emojiCardProb:20,
    withdrawProb:12,withdrawReissueProb:80,
    readIgnoreEnabled:false,readIgnoreTier:'normal',readIgnoreProb:20,repeatExclude:5,customRatio:90,
    proactiveEnabled:true,proactiveMinIntervalMin:30,
    proactiveCountMin:1,proactiveCountMax:2,
    momentProb:20
  };
  setReplyPace('natural');
  setProactiveFreqTier('occasional');
  setCardRatioTier('mine');
  setCallHangupTier('natural');
  state.surveySettings={deadlineSec:60,earlySubmitProb:30,multiMin:1,multiMax:6};
  saveKey('prob');saveKey('surveySettings');renderProbability();scheduleProactive();showToast('已恢复默认');
}
