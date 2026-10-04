/* =========================================================
   星迹 · 全局状态、设置读写与概率结构迁移
   ========================================================= */

/* ===== STATE ===== */
let state = {
  me:{name:'我',avatar:'',status:'在线'}, other:{name:'TA',avatar:'',status:'在线'},
  skin:{themeId:'ink',primary:'#1a1a1a',light:'#3f3f3f',bg:'#f7f6f3',chatBg:''},
  pin:{code:'0000',enabled:1},
  prob:{
    // 回复时间（秒）：从你发送消息到 TA 第一条回复出现的总时长（含「正在输入…」窗口）
    replyDelaySec:20, typingRatio:0.25,
    // 多气泡回复（多条独立消息）
    multiBubbleEnabled:true, multiBubbleProb:30, maxBubbles:3,
    // 字卡拼接（一个气泡里拼几张字卡，与多气泡相互独立）
    cardConcatEnabled:true, cardConcatProb:35, minCardsPerBubble:1, maxCardsPerBubble:3,
    // 独立互动概率（各自掷骰、可叠加，每轮最多 2 个额外互动；题目必答不走概率）
    emojiReplyProb:15, pokeReplyProb:8, quoteReplyProb:20, giftReplyProb:5,
    // 回复行为
    readIgnoreEnabled:false, repeatExclude:5, customRatio:90,
    // 主动消息：只暴露「开关 + 最小间隔（分钟）」，TA 的想不想主动属于内部行为
    proactiveEnabled:true, proactiveMinIntervalMin:30, proactiveCountMin:1, proactiveCountMax:2,
    momentProb:25
  },
  // 问卷回答期限（秒）：问卷提交后 TA 最迟在 deadlineSec 内回应（与回复时间取更早者）
  surveySettings:{deadlineSec:60,earlySubmitProb:30,multiMin:1,multiMax:6},
  // 系统通知：真正的浏览器/手机级通知（页面在前台或后台时都可用）
  notify:{enabled:false, chat:true, moments:true, letters:true},
  // 桌面便签两张（A=我的 / B=TA 的）
  // owner:'me' = 用户写的（TA 绝不覆盖）；owner:'other' = TA 写的（可被用户编辑覆盖）
  // at = 最后一次写入时间；TA 便签开关与节奏见 state.stats.taNoteEnabled / taNoteLastAt / taNoteUnread
  notes:[{id:'a',owner:'me',text:'',at:0},{id:'b',owner:'me',text:'',at:0}],
  // TA 禁言我（毫秒时间戳）；禁言期间输入栏禁用，可申请解除
  taMuteMeEndTime:0,
  // 日记申请查看时间（持久化：刷新不丢 REQUESTING 状态）
  diaryReqAt:0,
  meetTime:null, quote:'遇你，与你，予你，余你', splashText:'谢绝一切内外意识体进入本网站，暂不开放！\n（本网站是专属于·时停该独立意识体的传讯网站，目前暂不开放，也包括不对时停开放）', muteEndTime:0, muteRequest:null,
  letters:[], diaries:[], moments:[], currentApp:null, callActive:false,
  chat:{lastReadAt:0, chatBg:'', recallSec:120, showQuote:true},
  stats:{diaryOpen:false,companionTime:0,companionStreak:0,diaryCount:0,momentCount:0,chatCount:0,
    myPoke:'',notifCenter:[],momentReplyQueue:[],hiddenMoments:[],momentsAllowPost:1,momentsAllowComment:1,momentsAllowEmoji:1,momentsAllowEmojiPack:1,momentsAllowMultiBubble:1,momentsAllowCardReply:1,momentsAllowLike:1,
    // TA 写便签：开关（默认开）/ 上次写入时间 / 便签是否有未读新内容 / 已用过的句子
    taNoteEnabled:1,taNoteLastAt:0,taNoteUnread:0,taNoteUsed:{}},
  taMuteLastEnd:0,taMuteReqAt:0
};

async function loadSettings(){
  const keys=['me','other','skin','pin','prob','meetTime','quote','splashText','stats','chat','muteEndTime','muteRequest','surveySettings','notify','notes','taMuteMeEndTime','diaryReqAt','writings','taMuteLastEnd','taMuteReqAt'];
  for(const k of keys){const v=await dbGet('settings',k);if(v&&v.value!==undefined)state[k]=typeof v.value==='object'&&v.value!==null?{...state[k],...v.value}:v.value;}
}
async function saveKey(key){const v=await dbGet('settings',key);if(v){v.value=state[key];await dbPut('settings',v);}else{await dbPut('settings',{key,value:state[key]});}}

/* ---- 旧概率结构迁移（v1.3 → v2.0 → v3.0，幂等） ---- */
function migrateProb(){
  const p=state.prob||{};
  if(!p.replyDelaySec&&!p.replyMinSec){
    // v1.3 旧字段 fastSec/slowSec → v2.0 replyMinSec/replyMaxSec → v3.0 replyDelaySec
    const fast=Number(p.fastSec)||20;
    state.prob.replyDelaySec=Math.max(3,Math.min(300,fast)); state.prob.typingRatio=0.25;
  }else if(p.replyMinSec!==undefined){
    // v2.0：最短/最长 → v3.0 单一回复时间（取最短）
    state.prob.replyDelaySec=Math.max(3,Math.min(300,Number(p.replyMinSec)||20));
    delete p.replyMinSec; delete p.replyMaxSec;
  }
  if(p.c1!==undefined||p.normalProb!==undefined){
    // v1.3 c1~c5 / normalProb / emojiProb… → 新独立概率
    const old={...p};
    state.prob={
      ...state.prob,
      multiBubbleEnabled:old.multiBubbleEnabled!==undefined?old.multiBubbleEnabled:true,
      multiBubbleProb:old.multiBubbleProb!==undefined?old.multiBubbleProb:(old.multiProb||30),
      maxBubbles:old.maxBubbles!==undefined?old.maxBubbles:3,
      cardConcatEnabled:old.cardConcatEnabled!==undefined?old.cardConcatEnabled:true,
      cardConcatProb:old.cardConcatProb!==undefined?old.cardConcatProb:(old.multiProb||35),
      minCardsPerBubble:old.minCardsPerBubble!==undefined?old.minCardsPerBubble:(old.minPerBubble||1),
      maxCardsPerBubble:old.maxCardsPerBubble!==undefined?old.maxCardsPerBubble:(old.maxPerBubble||3),
      emojiReplyProb:old.emojiReplyProb!==undefined?old.emojiReplyProb:(old.emojiProb!==undefined?old.emojiProb:15),
      pokeReplyProb:old.pokeReplyProb!==undefined?old.pokeReplyProb:(old.pokeProb!==undefined?old.pokeProb:8),
      quoteReplyProb:old.quoteReplyProb!==undefined?old.quoteReplyProb:(old.quoteProb!==undefined?old.quoteProb:20),
      giftReplyProb:old.giftReplyProb!==undefined?old.giftReplyProb:5,
      readIgnoreEnabled:old.readIgnoreEnabled!==undefined?old.readIgnoreEnabled:!!(old.readIgnoreProb),
      repeatExclude:old.repeatExclude!==undefined?old.repeatExclude:5,
      customRatio:old.customRatio!==undefined?old.customRatio:90,
      proactiveEnabled:old.proactiveEnabled!==undefined?old.proactiveEnabled:true,
      proactiveMinIntervalMin:old.proactiveMinIntervalMin!==undefined?old.proactiveMinIntervalMin:(old.proactiveMin!==undefined?old.proactiveMin:30),
      proactiveCountMin:old.proactiveCountMin!==undefined?old.proactiveCountMin:1,
      proactiveCountMax:old.proactiveCountMax!==undefined?old.proactiveCountMax:2,
      momentProb:old.momentProb!==undefined?old.momentProb:25
    };
  }
  // v3.0：主动消息只剩「开关+最小间隔」，删除概率/最长/安静期用户键
  if(p.proactiveMin!==undefined){state.prob.proactiveMinIntervalMin=Math.max(5,Number(p.proactiveMin)||30);delete p.proactiveMin;}
  if(p.proactiveMax!==undefined)delete p.proactiveMax;
  if(p.proactiveProb!==undefined)delete p.proactiveProb;
  if(p.quietAfterReply!==undefined)delete p.quietAfterReply;
  // v3.0：题目必答，删除回答题目概率
  if(p.qaReplyProb!==undefined)delete p.qaReplyProb;
  // v2.0 兜底：replyDelaySec 缺失时补 20
  if(!(state.prob.replyDelaySec>0))state.prob.replyDelaySec=20;
  if(!(state.prob.proactiveMinIntervalMin>0))state.prob.proactiveMinIntervalMin=30;
  // 删除 v1.3 残留旧键
  ['fastSec','slowSec','c1','c2','c3','c4','c5','normalProb','emojiProb','pokeProb','quoteProb','heartProb','qaProb','proactive','readIgnoreProb','multiEnabled','multiProb','minPerBubble','maxPerBubble','pollProb'].forEach(k=>delete state.prob[k]);
  saveKey('prob');
  // surveySettings / notify / notes 默认补齐（对象级深合并已在 loadSettings 完成，这里补缺省键）
  if(!state.surveySettings||!state.surveySettings.deadlineSec)state.surveySettings={deadlineSec:60,earlySubmitProb:30,multiMin:1,multiMax:6};
  if(state.surveySettings.earlySubmitProb===undefined)state.surveySettings.earlySubmitProb=30;
  if(state.surveySettings.multiMin===undefined)state.surveySettings.multiMin=1;
  if(state.surveySettings.multiMax===undefined)state.surveySettings.multiMax=6;
  if(!state.notify)state.notify={enabled:false,chat:true,moments:true,letters:true};
  if(!Array.isArray(state.notes)||state.notes.length<2)state.notes=[{id:'a',owner:'me',text:''},{id:'b',owner:'me',text:''}];
}

let pinVal='', muteBannerInterval;

/* 统一落库入口：改 state.stats / state.prob / state.chat 后调用，避免漏存 */
function saveStats(){return saveKey('stats');}
function saveProb(){return saveKey('prob');}
function saveChat(){return saveKey('chat');}
