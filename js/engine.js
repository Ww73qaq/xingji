/* =========================================================
   星迹 · 回复生成引擎（engine.js）
   - 普通字卡 = 基础回复；表情/拍一拍/引用/礼物/QA = 独立概率事件
   - 每项独立掷骰，允许多个同时发生（每轮最多 2 个额外互动）
   - 多气泡回复（多条消息）与字卡拼接（一个气泡多张卡）彻底分开
   - 已读不回为开关
   - 字卡统计 useCount/lastUsedAt/replyCount/proactiveCount 落库
   ========================================================= */


/* ---- 字卡池：带 id 的对象（排除停用分组），禁止提前丢 id ---- */
async function _getCardPool(){
  const cards=await dbGetAllM('cards',30000);
  const groups=await dbGetAllM('cardGroups',30000);
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
  const all=await dbGetAllM('messages',8000);
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

/* ---- 最近一条我方消息（文本 / 单选 / 多选 / 问卷；不含撤回）
   v3.4.0：原来只取 type==='text'，导致 poll/survey 永远进不了「必答」分支。 ---- */
async function _latestUserMsg(){
  const all=await dbGetAll('messages');
  for(let i=all.length-1;i>=0;i--){
    const m=all[i];
    if(m.sender==='me'&&!m.recalled&&(m.type==='text'||m.type==='poll'||m.type==='survey')){
      /* v3.9.5：已作答的题目不再当成本轮「必答」目标。否则点「继续」会重跑一遍任务
         （scheduler 的 continue 不带 messageId → _jobPollTarget 返回 null → 落到这里），
         重掷答案并覆盖用户看到的勾选。直接返回 null，而不是继续往前找更旧的文本，
         免得对早就聊过的内容补一条莫名其妙的回复。 */
      if((m.type==='poll'||m.type==='survey')&&m.answer)return null;
      return m;
    }
  }
  return null;
}
/* ---- 本轮「必须作答」的题目：优先取任务携带的 messageId
   合并窗口内用户可能连发「题目 + 文字」，此时仍要回答那道题，而不是最后一条文字。 ---- */
async function _jobPollTarget(job){
  const ids=(job&&job.messageIds)||[];
  if(!ids.length)return null;
  const all=await dbGetAll('messages');
  for(let i=ids.length-1;i>=0;i--){
    const m=all.find(x=>Number(x.id)===Number(ids[i]));
    if(m&&!m.recalled&&!m.answer&&(m.type==='poll'||m.type==='survey')&&(m.poll||m.survey))return m;
  }
  return null;
}

/* ---- 微情绪回应（v3.7.0：不再发 emoji 字符，改纯文字微情绪词，走普通文本气泡） ---- */
const EMOJI_REPLY_POOL=[
  '笑了','眼睛弯了一下','愣了一下','点点头','安静地看了你一眼','轻轻嗯了一声',
  '垂眼想了想','嘴角动了一下','抬眼看你','没说话，只是看着你','歪了一下头','低低应了一声'
];
/* ---- 拍一拍 ---- */
async function _allPokeTexts(){
  const groups=(state.stats&&state.stats.pokeGroups)||{};
  const out=[];
  Object.values(groups).forEach(arr=>{if(Array.isArray(arr))arr.forEach(t=>out.push(String(t)));});
  return out.filter(Boolean);
}
/* ---- 礼物池（心意卡合并进礼物；v3.7.0：去掉 emoji 前缀只留名字，礼物图案仍由 GIFTS 渲染） ---- */
const GIFT_REPLY_POOL=[
  '咖啡','鲜花','蛋糕','月亮','幸运','书','甜点','饮料','小礼物','花束'
];
/* ---- QA 应答风格字卡（普通/安慰/回应） ---- */
const QA_REPLY_POOL=[
  '嗯，我明白你的意思。','我觉得可以。','应该可以的。','可能要看情况。','我信你。',
  '嗯，你说得对。','不用太担心。','我会陪着你。','慢慢来，不急。','我在听。',
  '当然可以。','放心，没事的。','嗯嗯。','我觉得挺好。','那我们一起吧。'
];

/* ---- 一个气泡的基础内容（字卡拼接 / 单卡 / 意图素材 / 系统池回退） ---- */
async function _buildBaseBubbleText(src,roundUsed,usage,bubbleUsed,markUsed,intent){
  const p=state.prob||{};
  const cards=src.cards;
  let picked=[];
  /* v3.6.4 颜文字字卡独立概率：命中则本轮基础回复直接抽「颜文字」分组字卡（单张成条，不参与拼接），
     与「表情回应」emojiReplyProb 相互独立（后者是通用表情池，不占字卡）。 */
  if(cards&&cards.length&&_roll(Number(p.emojiCardProb)||20)){
    const emo=cards.filter(c=>c.group==='颜文字');
    if(emo.length){
      const c=_pickBalanced(emo,new Set([...roundUsed,...bubbleUsed]));
      if(c){
        picked.push(c);
        roundUsed.add(c.text);
        if(c.id)markUsed(c,usage);
        return {text:c.text,cards:[c]};
      }
    }
  }
  const useConcat=p.cardConcatEnabled!==false&&_roll(Number(p.cardConcatProb)||35);
  if(cards&&cards.length){
    const min=_clamp(Number(p.minCardsPerBubble)||1,1,6);
    const max=_clamp(Number(p.maxCardsPerBubble)||3,min,6);
    const n=useConcat?_randomInt(min,max):1;
    for(let i=0;i<n;i++){
      const exclude=new Set([...roundUsed,...bubbleUsed]);
      let c=_pickBalanced(cards,exclude);
      if(!c&&src.kind==='custom'){
        // 自定义池抽空 → 意图素材 → 系统池回退
        const intentPool=INTENT_POOLS[intent]||[];
        const sys=intentPool.filter(t=>!roundUsed.has(t)&&!bubbleUsed.has(t));
        const fallback=SYSTEM_TEXT_POOL().filter(t=>!roundUsed.has(t)&&!bubbleUsed.has(t));
        const pool=sys.length?sys:fallback;
        const text=pool.length?pool[Math.floor(Math.random()*pool.length)]:(intentPool[0]||SYSTEM_TEXT_POOL()[0]);
        picked.push({id:null,text});
      }else if(c){
        picked.push(c);
      }
    }
  }else{
    // 无自定义字卡（或命中系统池层）：意图素材优先
    const intentPool=INTENT_POOLS[intent]||[];
    const sys=intentPool.filter(t=>!roundUsed.has(t));
    const fallback=SYSTEM_TEXT_POOL().filter(t=>!roundUsed.has(t));
    const pool=sys.length?sys:fallback;
    const text=pool.length?pool[Math.floor(Math.random()*pool.length)]:(intentPool[0]||SYSTEM_TEXT_POOL()[0]);
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

/* ---- 统一 Response Engine（方案 §22-25）：shouldRespond → intent → 素材 → 组合 ---- */
/* shouldRespond：进入本引擎即视为应回复（外部调度器已做禁言/已读不回/主动避让判断） */
/* intent：根据最近一条我方消息判断本轮意图，驱动素材选择与组合 */
function _detectIntent(context){
  const m=context.latestUserMsg;
  if(m&&(m.type==='poll'||m.type==='survey'))return 'poll-answer';
  const t=(context.latestUserText||'').trim();
  if(!t)return 'random';
  if(/难过|伤心|委屈|哭|累|烦|焦虑|不安|害怕|孤独|失眠/.test(t))return 'comfort';
  if(/早安|早上好|晚安|睡觉|休息|睡了/.test(t))return 'greeting';
  if(isQuestionText(t))return 'question';
  return 'random';
}
/* 意图素材表：各 intent 的可用素材（优先系统池，命中后回退通用池） */
const INTENT_POOLS={
  comfort:['别难过，我陪着你。','没关系的。','你做得很好。','抱抱你。','有我在。','你已经很棒了。','想哭就哭吧。','我会一直在。','慢慢来，不急。','我在听。'],
  greeting:['晚安。','早安。','好梦。','晚安，做个好梦。','醒了记得找我。','今天也要元气满满。','睡个好觉。','夜深了，快睡吧。','早。','今天也要开心。'],
  question:['嗯，我明白你的意思。','我觉得可以。','应该可以的。','可能要看情况。','我信你。','嗯，你说得对。','当然可以。','放心，没事的。','我觉得挺好。','那我们一起吧。']
};

/* ---- 构造一轮回复（多气泡 + 独立互动事件） ---- */
async function buildReply(context){
  const p=state.prob||{};
  const src=await _getReplySourcePool();
  const roundUsed=await _getRecentUsed(Number(p.repeatExclude)||5);
  const usage={};
  const markUsed=(c,u)=>{u[c.id]=(u[c.id]||0)+1;};
  const intent=_detectIntent(context);

  const bubbles=[];
  // 多气泡回复：multiBubbleEnabled × 概率 → 1~maxBubbles 个独立气泡
  let bubbleCount=1;
  if(p.multiBubbleEnabled!==false&&_roll(Number(p.multiBubbleProb)||30)){
    bubbleCount=_randomInt(1,_clamp(Number(p.maxBubbles)||3,1,5));
  }
  let extraInteractions=0;
  const MAX_EXTRA=2;

  const latest=context.latestUserMsg||null;
  const isPollMsg=!!latest&&(latest.type==='poll'||latest.type==='survey')&&!!(latest.poll||latest.survey);
  const shouldQuote=!!latest&&_roll(Number(p.quoteReplyProb)||20);
  // 题目必答：poll / survey 消息不走任何概率（用户已明确提交问题，TA 必须回答）
  const mustAnswer=isPollMsg;
  const emojiRoll=_roll(Number(p.emojiReplyProb)||15);
  const pokeRoll=_roll(Number(p.pokeReplyProb)||8);
  const giftRoll=_roll(Number(p.giftReplyProb)||5);

  for(let i=0;i<bubbleCount;i++){
    const bubbleUsed=new Set();
    let msgType='text';
    let content='';
    let quote=null;
    let cardIds=[];
    let answerOf=null;      // 本气泡作答的题目消息（落库后回填「已作答」状态）

    if(i===0&&mustAnswer){
      // 必答气泡直接用答案，不再抽字卡（避免「抽了却被丢弃」的字卡统计污染）
      const ans=await _buildPollAnswer(latest);
      content=ans.text;
      answerOf={id:latest.id,sel:ans.sel,text:ans.text,card:ans.card};
    }else{
      const base=await _buildBaseBubbleText(src,roundUsed,usage,bubbleUsed,markUsed,intent);
      content=base?base.text:SYSTEM_TEXT_POOL()[0];
      cardIds=base?base.cards.map(c=>c.id):[];
    }
    if(i===0&&shouldQuote&&latest){
      quote={id:latest.id,text:latest.content};
      extraInteractions++;
    }
    bubbles.push({type:msgType,content,quote,cardIds,proactive:context.source==='proactive',intent,answerOf});
  }

  // 独立互动：微情绪 / 拍一拍 / 礼物（作为额外气泡，受每轮最多 2 个限制）
  // v3.7.0：必答题（mustAnswer）时全部跳过——答完题不顺带撩，保持清冷专注
  if(!mustAnswer){
    if(emojiRoll&&extraInteractions<MAX_EXTRA){
      // 纯文字微情绪，走普通文本气泡（不再是 emoji 大表情）
      bubbles.push({type:'text',content:EMOJI_REPLY_POOL[Math.floor(Math.random()*EMOJI_REPLY_POOL.length)],cardIds:[],intent:'emotion',proactive:context.source==='proactive'});
      extraInteractions++;
    }
    if(pokeRoll&&extraInteractions<MAX_EXTRA){
      const pokes=await _allPokeTexts();
      const poke=(pokes.length?pokes[Math.floor(Math.random()*pokes.length)]:'拍了拍你');
      bubbles.push({type:'poke',content:(state.other.name||'TA')+'拍了拍你：'+poke,isPoke:true,cardIds:[],intent:'poke'});
      extraInteractions++;
    }
    if(giftRoll&&extraInteractions<MAX_EXTRA){
      bubbles.push({type:'gift',content:GIFT_REPLY_POOL[Math.floor(Math.random()*GIFT_REPLY_POOL.length)],cardIds:[],intent:'gift',proactive:context.source==='proactive'});
      extraInteractions++;
    }
  }

  /* v3.6.8：TA 记得——12% 概率前置一条「引用」气泡（最近礼物/便签/话题/心情/感应/待办/信/朋友圈）
     v3.7.0：内联双禁言统一改为 taOutputBlocked()；必答时也不前置（答完题不顺带撩） */
  if(!mustAnswer&&_roll(12)&&!taOutputBlocked()){
    try{
      const quote=await makeTaQuote();
      if(quote)bubbles.unshift({type:'text',content:quote,cardIds:[],intent:'quote',proactive:context.source==='proactive'});
    }catch(e){}
  }

  /* v3.7.0：医生提醒——深夜（小时≥23 或 <2）或本轮上下文偏累/长时间用眼时，
     低内部概率（10~15%）把一句医生提醒作为领句 unshift 到最前；不做定时闹钟、不刷存在感。 */
  if(!mustAnswer&&!taOutputBlocked()){
    const hr=new Date().getHours();
    const lateNight=(hr>=23||hr<2);
    const ctxTired=/累|困|眼|熬夜|加班|盯着|屏幕|头疼|疲惫|晕/.test(context.latestUserText||'');
    if((lateNight||ctxTired)&&_roll(12)){
      const dr=pickDoctorReminder();
      if(dr)bubbles.unshift({type:'text',content:dr,cardIds:[],intent:'doctor',proactive:context.source==='proactive'});
    }
  }

  return {bubbles,usage,intent};
}

/* v3.6.8：TA 记得——从最近互动里随机抽一条记忆，拼成「TA 记得」句（模块：礼物/便签/话题/心情/感应/待办/信/朋友圈） */
async function makeTaQuote(){
  const items=[];
  try{
    const msgs=await dbGetAll('messages');
    const gifts=msgs.filter(m=>m.sender==='me'&&m.type==='gift');
    if(gifts.length){const g=gifts[gifts.length-1];items.push({name:'你送来的'+g.content});}
    const myTexts=msgs.filter(m=>m.sender==='me'&&m.type==='text'&&m.content&&m.content.trim());
    if(myTexts.length){const t=myTexts[myTexts.length-1].content.trim();items.push({name:'你说过「'+t.slice(0,20)+'」'});}
  }catch(e){}
  try{
    const notes=state.notes||[];
    for(const n of notes){
      if(n&&n.text&&n.text.trim())items.push({name:'你在便签里写「'+n.text.trim().slice(0,20)+'」'});
      if(n&&n.mood)items.push({name:'你那天的心情是 '+n.mood});
    }
  }catch(e){}
  try{
    const evs=await dbGetAll('events');
    const senses=evs.filter(e=>e.type==='sense'&&e.who==='ta');
    if(senses.length){const s=senses[senses.length-1];const d=s.dir||'';items.push({name:(d&&d!=='附近')?('上次感应到你在'+d+'附近'):'上次感应到你就在附近'});}
  }catch(e){}
  try{
    const cals=await dbGetAll('calendar');
    const todos=cals.filter(c=>c.type==='todo'&&!c.done);
    if(todos.length){const t=todos[todos.length-1];items.push({name:'你待办里还写着「'+t.text.slice(0,20)+'」'});}
  }catch(e){}
  try{
    const lets=await dbGetAll('letters');
    if(lets.some(l=>l.sender==='me'))items.push({name:'你写给我的那封信'});
  }catch(e){}
  try{
    const mms=await dbGetAll('moments');
    const mine=mms.filter(m=>m.owner==='me'&&m.content);
    if(mine.length){const t=mine[mine.length-1];items.push({name:'你朋友圈写「'+(t.content||'').slice(0,20)+'」'});}
  }catch(e){}
  if(!items.length)return null;
  const it=items[Math.floor(Math.random()*items.length)];
  const tpl=TA_QUOTE_TEMPLATES[Math.floor(Math.random()*TA_QUOTE_TEMPLATES.length)];
  return tpl.replace('{item}',it.name);
}

/* ---- 题目回答生成（单选 / 多选 / 问卷）
   返回 {text, sel}：sel 是被选中的选项下标，供气泡渲染打勾
     · 问卷   sel = [[i],[i,j],…]（逐题）
     · 多选   sel = [i,j,…]
     · 单选   sel = [i]
   多选数量上下限优先取「消息自带」（发送弹窗里设置），回退全局默认。 ---- */
async function _buildPollAnswer(m){
  const poll=(m&&(m.poll||m.survey))||{};
  const ss=state.surveySettings||{};
  const defMin=_clamp(Number(ss.multiMin)||1,1,10);
  const defMax=_clamp(Number(ss.multiMax)||6,Math.max(2,defMin),10);
  const multiMin=_clamp(Number(poll.multiMin)||defMin,1,10);
  const multiMax=_clamp(Number(poll.multiMax)||defMax,Math.max(2,multiMin),10);
  const pick=arr=>arr[Math.floor(Math.random()*arr.length)];
  const pickMulti=opts=>{
    if(!opts.length)return [];
    const max=Math.min(multiMax,opts.length);
    const min=Math.min(multiMin,max);
    const n=max>min?_randomInt(min,max):min;
    const idxs=[];
    while(idxs.length<n){
      const i=Math.floor(Math.random()*opts.length);
      if(idxs.indexOf(i)<0)idxs.push(i);
    }
    return idxs;
  };

  if(poll.questions&&poll.questions.length){
    // 问卷：每题按题型作答（单选=1 项，多选=最少~最多项），一次性提交
    const sel=[];
    const lines=poll.questions.map((q,i)=>{
      const opts=q.options&&q.options.length?q.options:[];
      if(q.multi){
        const ids=pickMulti(opts);
        sel[i]=ids;
        return ids.length?`${i+1}. ${ids.map(k=>opts[k]).join('、')}`:`${i+1}. —`;
      }
      if(!opts.length){sel[i]=[];return `${i+1}. —`;}
      const k=Math.floor(Math.random()*opts.length);
      sel[i]=[k];
      return `${i+1}. ${opts[k]}`;
    });
    return {text:(m.content||'问卷回答')+'：'+lines.join('；'),sel};
  }

  const opts=poll.options||[];
  if(!opts.length)return {text:'嗯，我选好了。',sel:[]};
  if(poll.multi){
    const ids=pickMulti(opts);
    return {text:ids.length?'我选：'+ids.map(k=>opts[k]).join('、'):'嗯，我选好了。',sel:ids};
  }
  const k=Math.floor(Math.random()*opts.length);
  const base={text:'我选：'+opts[k],sel:[k]};
  // v3.7.1「让 TA 帮我决定」：选完选项后再从字卡库抽一张卡，作为 TA 的「意思/补充说明」
  // 抽卡复用 TA 平时发字卡的低频平衡随机（_pickBalanced）；字卡库为空时退回纯选项
  if(poll.decide){
    try{
      const pool=await _getCardPool();
      const card=_pickBalanced(pool,null);
      if(card)base.card={text:card.text,group:card.group};
    }catch(e){}
  }
  return base;
}
/* 兼容旧调用：只要文本 */
function _buildPollAnswerText(m){return _buildPollAnswer(m).text;}
/* 把作答结果写回题目消息：气泡上的「✓ / 已作答 · 用时 N 秒」由此驱动 */
async function _applyPollAnswer(answerOf){
  const m=await dbGet('messages',answerOf.id);
  if(!m)return;
  /* v3.9.5：已经有作答就不再覆盖。任务重跑（刷新后 catch-up / 「继续」）时同一道题会被再答一次，
     而 _buildPollAnswer 是随机抽取，于是勾选和新答案文本对不上。 */
  if(m.answer)return;
  const usedSec=Math.max(0,Math.round((Date.now()-(m.time||Date.now()))/1000));
  m.answer={sel:answerOf.sel,usedSec,at:Date.now()};
  if(answerOf.card)m.answer.card=answerOf.card;
  m.answerText=answerOf.text;
  await dbPut('messages',m);
  if(state.currentApp==='chat'&&typeof window.refreshMsgRow==='function')window.refreshMsgRow(m.id);
}

/* ---- 执行一轮回复：逐条落库 + 增量渲染 + 统计（含已读不回开关） ----
   纯生成在 buildReply()，这里只负责「执行」：落库、增量渲染、角标、系统通知。 ---- */
async function executeReply(job){
  // v3.7.0：入口统一静音判据（你静音 + TA 收起声音），替代原先只判 muteEndTime
  if(taOutputBlocked()){
    _scheduler.activeJob=null;
    return;
  }
  // 主动消息条数：proactiveCountMin~Max（1~2 条）
  const p=state.prob||{};
  // 本轮必须作答的题目（若有）
  const pollTarget=job.source==='proactive'?null:await _jobPollTarget(job);
  // 已读不回开关：打开后允许某轮已读但不回复。
  // 但「必答」优先——用户明确提交了单选/多选/问卷时，不能已读不回。
  if(state.prob&&state.prob.readIgnoreEnabled&&!pollTarget){
    const all=await dbGetAll('messages');
    const mine=all.filter(m=>m.sender==='me'&&!m.read&&!m.recalled);
    if(mine.length&&Math.random()<0.2){
      for(const m of mine){m.read=true;await dbPut('messages',m);}
      if(state.currentApp==='chat')refreshReadTicks();
      return;
    }
  }
  const proactiveCount=job.source==='proactive'
    ?_randomInt(_clamp(Number(p.proactiveCountMin)||1,1,5),_clamp(Number(p.proactiveCountMax)||2,1,5))
    :1;
  // 上下文：优先「本轮任务对应的题目」，否则取最近一条我方消息
  const latestUserMsg=job.source==='proactive'?null:(pollTarget||(await _latestUserMsg()));
  const latestUserText=(latestUserMsg&&latestUserMsg.type==='text')?latestUserMsg.content:null;
  const context={latestUserMsg,latestUserText,source:job.source};

  let totalBubbles=[];
  for(let c=0;c<proactiveCount;c++){
    const res=await buildReply(context);
    totalBubbles=totalBubbles.concat(res.bubbles);
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

  // v3.7.0：生成后、发送前二次门控——若此刻静音/TA收起声音已开始，整条放弃（含「TA记得」/医生提醒），不落库任何内容
  if(taOutputBlocked()){
    _scheduler.activeJob=null;
    return;
  }
  // 逐条发送（自然间隔 800~2400ms）
  let lastSent=null;
  for(let i=0;i<totalBubbles.length;i++){
    const b=totalBubbles[i];
    // v3.7.0：发送循环内统一判双静音（补上原先漏判的 taMuteMeEndTime）——门堵在走廊
    if(taOutputBlocked())break;
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
    lastSent=msg;
    // 题目/问卷：作答结果回写到那条消息上（气泡立刻变成「已作答」）
    if(b.answerOf)await _applyPollAnswer(b.answerOf);
  }
  refreshAllBadges();
  // 系统通知：TA 发来新消息且页面不在前台时，发真正的手机关通知（浏览器 Notification API）
  if(lastSent&&typeof window.notifySystem==='function'){
    const preview=(lastSent.content||'');
    window.notifySystem(`${state.other.name} 发来消息`,preview.slice(0,60),()=>{
      if(state.currentApp!=='chat')switchTab('chat');
    });
  }
}

/* ---- 显式导出：调度器通过 window 调用，避免隐式全局依赖 ---- */
window.buildReply=buildReply;
window.executeReply=executeReply;
window.buildAndSendReply=executeReply;   // 兼容旧调用名
