/* =========================================================
   星迹 · 回复概率设置页
   ========================================================= */

/* ===== PROBABILITY（回复设置 · 独立概率，不再归一化 100%） ===== */
let probAdjusting=false;
function renderProbability(){
  const p=state.prob;
  const body=document.getElementById('probability-body');if(!body)return;
  const iv=(k,def)=>{const v=Number(p[k]);return Number.isFinite(v)?v:def;};
  body.innerHTML=`
    <div class="list-card">
      <div class="list-card-title">回复时间</div>
      <div style="margin-top:10px;font-size:12px;color:var(--sub)">TA 回复你的时间 <b id="lb-replyDelaySec">${iv('replyDelaySec',20)}</b> 秒</div>
      <input type="range" min="3" max="300" value="${iv('replyDelaySec',20)}" oninput="setProb('replyDelaySec',this.value)" style="width:100%">
      <div style="font-size:11px;color:var(--hint);margin-top:8px">从你发送消息开始，到 TA 第一条回复出现为止。期间顶部显示“正在输入…”。</div>
    </div>
    <div class="list-card">
      <div class="list-card-title">多气泡回复</div>
      <button class="btn-pill ${p.multiBubbleEnabled===false?'ghost':'primary'}" style="width:100%;margin-top:8px;padding:11px 0" onclick="setProb('multiBubbleEnabled',${p.multiBubbleEnabled===false?1:0})">${p.multiBubbleEnabled===false?'多气泡回复：关闭':'多气泡回复：开启'}</button>
      ${p.multiBubbleEnabled!==false?`
      <div style="margin-top:12px;font-size:12px;color:var(--sub)">多气泡概率 <b id="lb-multiBubbleProb">${iv('multiBubbleProb',30)}</b>%</div>
      <input type="range" min="0" max="100" value="${iv('multiBubbleProb',30)}" oninput="setProb('multiBubbleProb',this.value)" style="width:100%">
      <div style="margin-top:8px;font-size:12px;color:var(--sub)">最多气泡 <b id="lb-maxBubbles">${iv('maxBubbles',3)}</b> 条</div>
      <input type="range" min="1" max="5" value="${iv('maxBubbles',3)}" oninput="setProb('maxBubbles',this.value)" style="width:100%">`:''}
      <div style="font-size:11px;color:var(--hint);margin-top:8px">一次回复由多条独立消息组成，消息间有自然间隔。</div>
    </div>
    <div class="list-card">
      <div class="list-card-title">字卡拼接</div>
      <button class="btn-pill ${p.cardConcatEnabled===false?'ghost':'primary'}" style="width:100%;margin-top:8px;padding:11px 0" onclick="setProb('cardConcatEnabled',${p.cardConcatEnabled===false?1:0})">${p.cardConcatEnabled===false?'字卡拼接：关闭':'字卡拼接：开启'}</button>
      ${p.cardConcatEnabled!==false?`
      <div style="margin-top:12px;font-size:12px;color:var(--sub)">拼接概率 <b id="lb-cardConcatProb">${iv('cardConcatProb',35)}</b>%</div>
      <input type="range" min="0" max="100" value="${iv('cardConcatProb',35)}" oninput="setProb('cardConcatProb',this.value)" style="width:100%">
      <div style="margin-top:8px;font-size:12px;color:var(--sub)">每气泡最少 <b id="lb-minCardsPerBubble">${iv('minCardsPerBubble',1)}</b> 张 · 最多 <b id="lb-maxCardsPerBubble">${iv('maxCardsPerBubble',3)}</b> 张</div>
      <div style="display:flex;gap:10px;margin-top:6px">
        <input type="range" min="1" max="6" value="${iv('minCardsPerBubble',1)}" oninput="setProb('minCardsPerBubble',this.value)" style="width:100%">
        <input type="range" min="1" max="6" value="${iv('maxCardsPerBubble',3)}" oninput="setProb('maxCardsPerBubble',this.value)" style="width:100%">
      </div>
      <div style="font-size:11px;color:var(--hint);margin-top:8px">开启后一个气泡内可由多张字卡拼接（如「嗯。今天也辛苦了。」）。与多气泡回复相互独立。</div>`:''}
    </div>
    <div class="list-card">
      <div class="list-card-title">回复类型</div>
      <div style="font-size:11px;color:var(--hint);margin-top:6px">每项概率独立计算，可同时触发多个互动（每轮最多 2 个额外互动）</div>
      ${[['emojiReplyProb','表情回应',15],['pokeReplyProb','拍一拍',8],['quoteReplyProb','引用',20],['giftReplyProb','礼物',5]].map(([k,label,def])=>{
        const v=Number.isFinite(Number(p[k]))?Number(p[k]):def;
        return `<div style="margin-top:10px;font-size:12px;color:var(--sub)">${label} <b id="lb-${k}">${v}</b>%</div><input type="range" min="0" max="100" value="${v}" oninput="setProb('${k}',this.value)" style="width:100%">`;
      }).join('')}
      <div style="margin-top:14px;font-size:12px;color:var(--sub)">颜文字字卡 <b id="lb-emojiCardProb">${iv('emojiCardProb',20)}</b>%</div>
      <input type="range" min="0" max="100" value="${iv('emojiCardProb',20)}" oninput="setProb('emojiCardProb',this.value)" style="width:100%">
      <div style="font-size:11px;color:var(--hint);margin-top:6px">命中时 TA 的回复直接用「颜文字」分组字卡（如 ^_^ 小表情）；与上方「表情回应」互不冲突，也不参与字卡拼接。</div>
      <div style="font-size:11px;color:var(--hint);margin-top:8px">普通字卡是基础回复，始终参与。单选 / 多选 / 问卷属于你明确提交的问题，TA 会<b>必答</b>（不走概率）；问卷期限与多选数量在<b>对应弹窗内</b>设置。</div>
    </div>
    <div class="list-card">
      <div class="list-card-title">回复行为</div>
      <button class="btn-pill ${p.readIgnoreEnabled?'primary':'ghost'}" style="width:100%;margin-top:8px;padding:11px 0" onclick="setProb('readIgnoreEnabled',${p.readIgnoreEnabled?0:1})">已读不回：${p.readIgnoreEnabled?'开启':'关闭'}</button>
      <div style="font-size:11px;color:var(--hint);margin-top:6px">开启后，某些轮次 TA 会显示已读但不回复。</div>
      <div style="margin-top:14px;font-size:12px;color:var(--sub)">最近重复排除 <b id="lb-repeatExclude">${iv('repeatExclude',5)}</b> 条</div>
      <input type="range" min="0" max="20" value="${iv('repeatExclude',5)}" oninput="setProb('repeatExclude',this.value)" style="width:100%">
      <div style="margin-top:14px;font-size:12px;color:var(--sub)">自定义字卡占比 <b id="lb-customRatio">${iv('customRatio',90)}</b>%</div>
      <input type="range" min="0" max="100" value="${iv('customRatio',90)}" oninput="setProb('customRatio',this.value)" style="width:100%">
      <div style="font-size:11px;color:var(--hint);margin-top:6px">其余比例使用系统预设字卡。</div>
    </div>
    <div class="list-card">
      <div class="list-card-title">主动消息</div>
      <button class="btn-pill ${p.proactiveEnabled===false?'ghost':'primary'}" style="width:100%;margin-top:8px;padding:11px 0" onclick="setProb('proactiveEnabled',${p.proactiveEnabled===false?1:0})">开启主动消息：${p.proactiveEnabled===false?'关闭':'开启'}</button>
      ${p.proactiveEnabled!==false?`
      <div style="margin-top:12px;font-size:12px;color:var(--sub)">最小间隔 <b id="lb-proactiveMinIntervalMin">${iv('proactiveMinIntervalMin',30)}</b> 分钟</div>
      <input type="range" min="5" max="720" value="${iv('proactiveMinIntervalMin',30)}" oninput="setProb('proactiveMinIntervalMin',this.value)" style="width:100%">
      <div style="margin-top:8px;font-size:12px;color:var(--sub)">一次发送 <b id="lb-proactiveCount">${iv('proactiveCountMin',1)}~${iv('proactiveCountMax',2)}</b> 条</div>
      <div style="display:flex;gap:10px;margin-top:6px">
        <input type="range" min="1" max="3" value="${iv('proactiveCountMin',1)}" oninput="setProb('proactiveCountMin',this.value)" style="width:100%">
        <input type="range" min="1" max="3" value="${iv('proactiveCountMax',2)}" oninput="setProb('proactiveCountMax',this.value)" style="width:100%">
      </div>
      <div style="font-size:11px;color:var(--hint);margin-top:8px">TA 会在间隔至少 30 分钟后主动联系你。TA 刚回复完、你刚发完消息或正在通话时不会插话，触发前显示“正在输入…”。</div>`:''}
    </div>
    <button class="btn-pill ghost" style="width:100%;margin-top:4px" onclick="resetProb()">恢复默认设置</button>`;
}
/* setSurveySetting：v3.4.0 起「回复设置」页不再展示问卷卡片，
   这里保留为「弹窗默认值的读写入口」——发送问卷/多选时用它取上次的默认数字。 */
function setSurveySetting(key,v){
  state.surveySettings=state.surveySettings||{deadlineSec:60,earlySubmitProb:30,multiMin:1,multiMax:6};
  if(key==='deadlineSec')state.surveySettings.deadlineSec=Math.max(10,Math.min(600,parseInt(v)||60));
  else if(key==='earlySubmitProb')state.surveySettings.earlySubmitProb=Math.max(0,Math.min(100,parseInt(v)||30));
  else if(key==='multiMin'){let n=Math.max(1,Math.min(10,parseInt(v)||1));if(n>state.surveySettings.multiMax)state.surveySettings.multiMax=n;state.surveySettings.multiMin=n;}
  else if(key==='multiMax'){let n=Math.max(1,Math.min(10,parseInt(v)||6));if(n<state.surveySettings.multiMin)state.surveySettings.multiMin=n;state.surveySettings.multiMax=n;}
  saveKey('surveySettings');renderProbability();
}
function setProb(key,val){
  if(probAdjusting)return;
  const p=state.prob;
  p[key]=parseInt(val);
  if(key==='minCardsPerBubble'&&p.minCardsPerBubble>p.maxCardsPerBubble){p.maxCardsPerBubble=p.minCardsPerBubble;}
  if(key==='maxCardsPerBubble'&&p.maxCardsPerBubble<p.minCardsPerBubble){p.minCardsPerBubble=Math.max(1,p.maxCardsPerBubble);}
  if(key==='proactiveCountMin'&&p.proactiveCountMin>p.proactiveCountMax){p.proactiveCountMax=p.proactiveCountMin;}
  if(key==='proactiveCountMax'&&p.proactiveCountMax<p.proactiveCountMin){p.proactiveCountMin=Math.max(1,p.proactiveCountMax);}
  saveKey('prob');
  if(['proactiveEnabled','proactiveMinIntervalMin','proactiveCountMin','proactiveCountMax'].includes(key)){
    scheduleProactive();
  }
  renderProbability();
}
function updateProbHints(){}
function resetProb(){
  state.prob={...state.prob,
    replyDelaySec:20,typingRatio:0.25,
    multiBubbleEnabled:true,multiBubbleProb:30,maxBubbles:3,
    cardConcatEnabled:true,cardConcatProb:35,minCardsPerBubble:1,maxCardsPerBubble:3,
    emojiReplyProb:15,pokeReplyProb:8,quoteReplyProb:20,giftReplyProb:5,
    readIgnoreEnabled:false,repeatExclude:5,customRatio:90,
    proactiveEnabled:true,proactiveMinIntervalMin:30,
    proactiveCountMin:1,proactiveCountMax:2,
    momentProb:25
  };
  state.surveySettings={deadlineSec:60,earlySubmitProb:30,multiMin:1,multiMax:6};
  saveKey('prob');saveKey('surveySettings');renderProbability();scheduleProactive();showToast('已恢复默认设置');
}
