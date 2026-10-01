/* =========================================================
   星迹 · 回复生成引擎（chat-engine.js）
   - 普通字卡 = 基础回复；表情/拍一拍/引用/礼物/QA = 独立概率事件
   - 每项独立掷骰，允许多个同时发生（每轮最多 2 个额外互动）
   - 多气泡回复（多条消息）与字卡拼接（一个气泡多张卡）彻底分开
   - 已读不回为开关
   - 字卡统计 useCount/lastUsedAt/replyCount/proactiveCount 落库
   ========================================================= */

function _roll(pct){return Math.random()*100 < (Number.isFinite(pct)?pct:0);}
function _clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function _randomInt(min,max){min=Math.ceil(min);max=Math.floor(max);return Math.floor(Math.random()*(max-min+1))+min;}

/* ---- 字卡池：带 id 的对象（排除停用分组），禁止提前丢 id ---- */
async function _getCardPool(){
  const cards=await dbGetAll('cards');
  const groups=await dbGetAll('cardGroups');
  const dis=new Set(groups.filter(g=>g.enabled===false).map(g=>g.name));
  const pool=cards
    .filter(c=>c.enabled!==false&&!dis.has(c.group||'默认'))
    .map(c=>({id:c.id,text:String(c.text||'').trim(),useCount:c.useCount||0,group:c.group||'默认'}))
    .filter(c=>c.text);
  return pool;
}
/* 自定义/系统池分层：customRatio 控制（默认 90% 用自定义池，未命中回退系统池） */
async function _getReplySourcePool(){
  const p=state.prob||{};
  const custom=await _getCardPool();
  const ratio=_clamp(Number(p.customRatio)||90,0,100);
  if(custom.length&&Math.random()*100<ratio){
    return {cards:custom,kind:'custom'};
  }
  return {cards:null,kind:'system'};
}
/* 最近 n 条 TA 文本消息（重复排除） */
async function _getRecentUsed(n){
  const all=await dbGetAll('messages');
  const texts=new Set();
  for(let i=all.length-1;i>=0&&texts.size<n;i--){
    const m=all[i];
    if(m.sender==='other'&&m.type==='text'&&m.content&&!m.recalled&&!m.isPoke){
      texts.add(String(m.content));
    }
  }
  return texts;
}
/* 低频优先平衡随机：w = 1/sqrt(useCount+1) */
function _pickBalanced(cards,exclude){
  if(!cards||!cards.length)return null;
  let avail=exclude&&exclude.size?cards.filter(c=>!exclude.has(c.text)):[];
  if(!avail.length)avail=cards;
  const weights=avail.map(c=>1/Math.sqrt((c.useCount||0)+1));
  const total=weights.reduce((a,b)=>a+b,0);
  if(total<=0)return avail[Math.floor(Math.random()*avail.length)];
  let r=Math.random()*total;
  for(let i=0;i<avail.length;i++){
    r-=weights[i];
    if(r<=0)return avail[i];
  }
  return avail[avail.length-1];
}
const MULTI_SEPARATORS=[' ','，','。','！','？','......','——'];

/* ---- 问题上下文判断（QA 前置条件） ---- */
function isQuestionText(t){
  if(!t)return false;
  return /为什么|怎么|如何|是不是|能不能|可不可以|可以吗|好吗|对吗|行不行|怎么样|有没有|\?|？/.test(t);
}

/* ---- 最近一条我方文本消息（引用来源） ---- */
async function _latestUserText(){
  const all=await dbGetAll('messages');
  for(let i=all.length-1;i>=0;i--){
    const m=all[i];
    if(m.sender==='me'&&m.type==='text'&&m.content&&!m.recalled)return m;
  }
  return null;
}

/* ---- 表情回应 ---- */
const EMOJI_REPLY_POOL=[
  '😊','😄','🥰','😌','😉','🤭','😳','🥹','😮','💕','✨','🌙','👍','👀','🫶','☺️'
];
/* ---- 拍一拍 ---- */
async function _allPokeTexts(){
  const groups=(state.stats&&state.stats.pokeGroups)||{};
  const out=[];
  Object.values(groups).forEach(arr=>{if(Array.isArray(arr))arr.forEach(t=>out.push(String(t)));});
  return out.filter(Boolean);
}
/* ---- 礼物池（心意卡合并进礼物） ---- */
const GIFT_REPLY_POOL=[
  '☕ 咖啡','🌹 鲜花','🎂 蛋糕','🌙 月亮','🍀 幸运','📖 书','🍰 甜点','🥤 饮料','🎁 小礼物','💐 花束'
];
/* ---- QA 应答风格字卡（普通/安慰/回应） ---- */
const QA_REPLY_POOL=[
  '嗯，我明白你的意思。','我觉得可以。','应该可以的。','可能要看情况。','我信你。',
  '嗯，你说得对。','不用太担心。','我会陪着你。','慢慢来，不急。','我在听。',
  '当然可以。','放心，没事的。','嗯嗯。','我觉得挺好。','那我们一起吧。'
];

/* ---- 一个气泡的基础内容（字卡拼接 / 单卡 / 系统池回退） ---- */
async function _buildBaseBubbleText(src,roundUsed,usage,bubbleUsed,markUsed){
  const p=state.prob||{};
  const cards=src.cards;
  let picked=[];
  const useConcat=p.cardConcatEnabled!==false&&_roll(Number(p.cardConcatProb)||35);
  if(cards&&cards.length){
    const min=_clamp(Number(p.minCardsPerBubble)||1,1,6);
    const max=_clamp(Number(p.maxCardsPerBubble)||3,min,6);
    const n=useConcat?_randomInt(min,max):1;
    for(let i=0;i<n;i++){
      const exclude=new Set([...roundUsed,...bubbleUsed]);
      let c=_pickBalanced(cards,exclude);
      if(!c&&src.kind==='custom'){
        // 自定义池抽空 → 回退系统池
        const sys=SYSTEM_TEXT_POOL().filter(t=>!roundUsed.has(t)&&!bubbleUsed.has(t));
        const text=sys.length?sys[Math.floor(Math.random()*sys.length)]:SYSTEM_TEXT_POOL()[0];
        picked.push({id:null,text});
      }else if(c){
        picked.push(c);
      }
    }
  }else{
    const sys=SYSTEM_TEXT_POOL().filter(t=>!roundUsed.has(t));
    const text=sys.length?sys[Math.floor(Math.random()*sys.length)]:SYSTEM_TEXT_POOL()[0];
    picked.push({id:null,text});
  }
  if(!picked.length)return null;
  let sep=' ';
  if(useConcat&&picked.length>1)sep=MULTI_SEPARATORS[Math.floor(Math.random()*MULTI_SEPARATORS.length)];
  const text=picked.map(c=>c.text).join(sep);
  picked.forEach(c=>{
    roundUsed.add(c.text);
    if(c.id)markUsed(c,usage);
  });
  return {text,cards:picked};
}

/* ---- 系统字卡池（55 条，8 类） ---- */
function SYSTEM_TEXT_POOL(){
  return [
    '嗯，我在听。','好呀。','我知道啦。','嗯嗯。','好的。','可以。','行。','没事。','我懂。','明白。',
    '今天还好吗？','在忙什么？','吃饭了吗？','早点休息。','记得喝水。','今天想我了吗？','最近怎么样？','心情还好吗？','有好好睡觉吗？','今天也要开心。',
    '我刚想到你。','有点想你。','你在做什么呀？','跟你说话就很安心。','今天也很喜欢你。','想见你。','你在就好。','给你留了一句话。','今天发生了一点小事。','想跟你说说话。',
    '别难过，我陪着你。','没关系的。','你做得很好。','抱抱你。','慢慢来。','有我在。','别担心。','你已经很棒了。','想哭就哭吧。','我会一直在。',
    '晚安。','早安。','好梦。','晚安，做个好梦。','醒了记得找我。','今天也要元气满满。','睡个好觉。','晚安呀。','早。','夜深了，快睡吧。',
    '你呢？','然后呢？','真的吗？','是吗？','还有呢？','那后来呢？','你说说看？','这样啊。','哇。','嗯？',
    '嘿嘿。','嘿嘿嘿。','(*^▽^*)','(￣▽￣)','(◕ᴗ◕✿)','(｡•̀ᴗ-)✧','(≧▽≦)','(๑•̀ㅂ•́)و✧','(,,•́ . •̀,,)','(●′▽′●)',
    '嗯，我知道了。','好，听你的。','那一起吧。','陪你。','你决定。','都可以。','随你开心。','好呀好呀。','没问题。','这就来。'
  ];
}

/* ---- 构造一轮回复（多气泡 + 独立互动事件） ---- */
async function buildReply(context){
  const p=state.prob||{};
  const src=await _getReplySourcePool();
  const roundUsed=await _getRecentUsed(Number(p.repeatExclude)||5);
  const usage={};
  const markUsed=(c,u)=>{u[c.id]=(u[c.id]||0)+1;};

  const bubbles=[];
  // 多气泡回复：multiBubbleEnabled × 概率 → 1~maxBubbles 个独立气泡
  let bubbleCount=1;
  if(p.multiBubbleEnabled!==false&&_roll(Number(p.multiBubbleProb)||30)){
    bubbleCount=_randomInt(1,_clamp(Number(p.maxBubbles)||3,1,5));
  }
  let extraInteractions=0;
  const MAX_EXTRA=2;

  const hasQuestion=isQuestionText(context.latestUserText);
  const latest=context.latestUserMsg||null;
  const isPollMsg=!!latest&&(latest.type==='poll'||latest.type==='survey')&&!!latest.poll;
  const shouldQuote=!!latest&&_roll(Number(p.quoteReplyProb)||20);
  // 回答题目：仅当最近消息是题目或文本提问且命中 qaReplyProb 时进入 QA 分支
  const qaRoll=(hasQuestion||isPollMsg)&&_roll(Number(p.qaReplyProb)||30);
  const emojiRoll=_roll(Number(p.emojiReplyProb)||15);
  const pokeRoll=_roll(Number(p.pokeReplyProb)||8);
  const giftRoll=_roll(Number(p.giftReplyProb)||5);

  for(let i=0;i<bubbleCount;i++){
    const bubbleUsed=new Set();
    let base=null;
    // 基础回复：普通字卡（第一气泡可能被 QA/引用改造）
    base=await _buildBaseBubbleText(src,roundUsed,usage,bubbleUsed,markUsed);
    if(!base)base={text:SYSTEM_TEXT_POOL()[0],cards:[]};
    let msgType='text';
    let content=base.text;
    let quote=null;

    if(i===0&&qaRoll&&extraInteractions<MAX_EXTRA){
      if(isPollMsg){
        // 题目回复：单选/多选/问卷 生成答案
        content=_buildPollAnswerText(latest);
      }else{
        const qaPool=QA_REPLY_POOL.filter(t=>!roundUsed.has(t));
        content=qaPool.length?qaPool[Math.floor(Math.random()*qaPool.length)]:QA_REPLY_POOL[0];
      }
      msgType='text';
      extraInteractions++;
    }
    if(i===0&&shouldQuote&&latest&&extraInteractions<MAX_EXTRA){
      quote={id:latest.id,text:latest.content};
      extraInteractions++;
    }
    bubbles.push({type:msgType,content,quote,cardIds:base.cards.map(c=>c.id),proactive:context.source==='proactive'});
  }

  // 独立互动：表情 / 拍一拍 / 礼物（作为额外气泡，受每轮最多 2 个限制）
  if(emojiRoll&&extraInteractions<MAX_EXTRA){
    bubbles.push({type:'emoji',content:EMOJI_REPLY_POOL[Math.floor(Math.random()*EMOJI_REPLY_POOL.length)],cardIds:[]});
    extraInteractions++;
  }
  if(pokeRoll&&extraInteractions<MAX_EXTRA){
    const pokes=await _allPokeTexts();
    const poke=(pokes.length?pokes[Math.floor(Math.random()*pokes.length)]:'拍了拍你');
    bubbles.push({type:'poke',content:(state.other.name||'TA')+'拍了拍你：'+poke,isPoke:true,cardIds:[]});
    extraInteractions++;
  }
  if(giftRoll&&extraInteractions<MAX_EXTRA){
    bubbles.push({type:'gift',content:GIFT_REPLY_POOL[Math.floor(Math.random()*GIFT_REPLY_POOL.length)],cardIds:[]});
    extraInteractions++;
  }

  return {bubbles,usage};
}

/* ---- 题目回答生成（单选 / 多选 / 问卷） ---- */
function _buildPollAnswerText(m){
  const poll=m.poll||{};
  const pick=arr=>arr[Math.floor(Math.random()*arr.length)];
  if(poll.questions&&poll.questions.length){
    // 问卷：每题一个单选，一次性提交
    const lines=poll.questions.map((q,i)=>{
      const opts=q.options&&q.options.length?q.options:[];
      const sel=opts.length?pick(opts):'—';
      return `${i+1}. ${sel}`;
    });
    return (m.content||'问卷回答')+'：'+lines.join('；');
  }
  const opts=poll.options||[];
  if(!opts.length)return '嗯，我选好了。';
  if(poll.multi){
    const n=1+Math.floor(Math.random()*Math.min(2,opts.length));
    const idxs=[];while(idxs.length<n){const i=Math.floor(Math.random()*opts.length);if(idxs.indexOf(i)<0)idxs.push(i);}
    return '我选：'+idxs.map(i=>opts[i]).join('、');
  }
  return '我选：'+pick(opts);
}

/* ---- 执行一轮回复：逐条落库 + 增量渲染 + 统计（含已读不回开关） ---- */
async function buildAndSendReply(job){
  // 禁言检查
  if(Date.now()<state.muteEndTime){
    _scheduler.activeJob=null;
    return;
  }
  // 已读不回开关：打开后允许某轮已读但不回复
  if(state.prob&&state.prob.readIgnoreEnabled){
    const all=await dbGetAll('messages');
    const mine=all.filter(m=>m.sender==='me'&&!m.read&&!m.recalled);
    if(mine.length&&Math.random()<0.2){
      for(const m of mine){m.read=true;await dbPut('messages',m);}
      if(state.currentApp==='chat')renderChat(false);
      return;
    }
  }
  // 主动消息条数：proactiveCountMin~Max（1~2 条）
  const p=state.prob||{};
  const proactiveCount=job.source==='proactive'
    ?_randomInt(_clamp(Number(p.proactiveCountMin)||1,1,5),_clamp(Number(p.proactiveCountMax)||2,1,5))
    :1;
  const latestUserMsg=job.source==='proactive'?null:await _latestUserText();
  const latestUserText=latestUserMsg?latestUserMsg.content:null;
  const context={latestUserMsg,latestUserText,source:job.source};

  let totalBubbles=[];
  for(let c=0;c<proactiveCount;c++){
    const res=await buildReply(context);
    totalBubbles=totalBubbles.concat(res.bubbles);
    for(const id in res.usage){
      // 合并 usage 到全局一轮统计（以最后一批为准做累加）
    }
    const cards=await dbGetAll('cards');
    for(const id in res.usage){
      const c=cards.find(x=>x.id===Number(id));
      if(c){
        c.useCount=(c.useCount||0)+res.usage[id];
        c.lastUsedAt=Date.now();
        if(job.source==='proactive')c.proactiveCount=(c.proactiveCount||0)+res.usage[id];
        else c.replyCount=(c.replyCount||0)+res.usage[id];
        await dbPut('cards',c);
      }
    }
  }

  // 逐条发送（自然间隔 800~2400ms）
  const start=Date.now();
  for(let i=0;i<totalBubbles.length;i++){
    const b=totalBubbles[i];
    if(Date.now()<state.muteEndTime)break;
    if(i>0){
      const gap=800+Math.random()*1600;
      await new Promise(r=>setTimeout(r,gap));
    }
    const msg={
      sender:'other',type:b.type,content:b.content,time:Date.now(),
      read:false,quote:b.quote||null,isPoke:b.isPoke||false,
      proactive:b.proactive||false,source:job.source,
      replyRoundId:job.roundId,cardIds:b.cardIds||[]
    };
    msg.id=await dbPut('messages',msg);
    _scheduler.lastTaReplyAt=Date.now();
    if(state.currentApp==='chat')appendMsgRow(msg,true);
    updateTabBadge('chat',1);
  }
  refreshAllBadges();
}
