/* =========================================================
   星迹 · 信件回复生成与待回复队列
   ========================================================= */

function _buildLetterReply(l){
  const r=Math.random()*100;
  const pool=r<45?REPLY_TIER_RELATE:(r<75?REPLY_TIER_FEEL:REPLY_TIER_CARE);
  const tier=r<45?'relate':(r<75?'feel':'care');
  const p1=pool[Math.floor(Math.random()*pool.length)];
  const p2=REPLY_TIER_FEEL[Math.floor(Math.random()*REPLY_TIER_FEEL.length)];
  // 多段组合：首段（按 tier 选）+ 次段（情感收束）；相关回应时引用来信开头
  const lead=(tier==='relate'&&l.content)?'你写“'+String(l.content).replace(/\s+/g,' ').slice(0,24)+(String(l.content).length>24?'…':'')+'”，我收到了。\n\n':'';
  return lead+p1+'\n\n'+p2;
}
/* ===== TA 主动来信（v3.6.12）：独立低概率 · 字卡承载表达 =====
   规则（参照 maybeTaWriteNote）：
   1) 开关 state.stats.taLetterEnabled（默认开）关闭 → 不写；
   2) 冷却：距上次主动来信 12~36 小时随机（一天/几天/一周一封都正常）；
   3) 禁言期间（TA 在整理意识 / TA 不想理你）→ 不写（不强行传达，符合设定）；
   4) 到点后 70% 概率写一封。
   主动信内容：从字卡库随机挑 1~4 张字卡（承载想说的意思）＋ 一段意识收束。 */
const TA_LETTER_GAP_MIN=12*3600000;
const TA_LETTER_GAP_MAX=36*3600000;
const TA_LETTER_PROB=70;
function taLetterEnabled(){return (state.stats.taLetterEnabled===undefined)?true:!!state.stats.taLetterEnabled;}
async function maybeTaLetter(){
  if(!taLetterEnabled())return;
  const last=Number(state.stats.taLetterLastAt)||0;
  if(last&&Date.now()-last<TA_LETTER_GAP_MIN+Math.random()*(TA_LETTER_GAP_MAX-TA_LETTER_GAP_MIN))return;
  if(Date.now()<state.muteEndTime||Date.now()<state.taMuteMeEndTime)return;
  if(!_roll(TA_LETTER_PROB))return;
  return taSendLetter();
}
async function taSendLetter(){
  const cards=await dbGetAll('cards').catch(()=>[]);
  const enabled=cards.filter(c=>c.enabled!==false);
  const n=1+Math.floor(Math.random()*4);          // 1~4 张字卡（用多少张由 TA 的「此刻想说的量」决定）
  const picks=[];const pool=enabled.slice();
  for(let i=0;i<n&&pool.length;i++){const t=pool.splice(Math.floor(Math.random()*pool.length),1)[0].text||'';if(t)picks.push(t);}
  const lead=TA_LETTER_LEADS[Math.floor(Math.random()*TA_LETTER_LEADS.length)];
  const tail=TA_LETTER_TAILS[Math.floor(Math.random()*TA_LETTER_TAILS.length)];
  let content=(lead||'')+'\n\n';
  if(picks.length)content+=picks.join('\n')+'\n\n';
  content+=tail;
  const rec=await dbPut('letters',{sender:'other',title:'',content,time:Date.now(),status:'received',read:false});
  state.stats.taLetterLastAt=Date.now();
  saveKey('stats');
  updateTabBadge('chat',await countUnreadLetters());
  if(typeof pushNotif==='function')pushNotif({type:'letter',from:state.other.name,text:'写了一封信给你',letterId:rec});
  notifySystem(`${state.other.name} 写信给你`,content.slice(0,50),()=>openApp('mailbox'));
  if(navStack.length||document.getElementById('app-pages').classList.contains('on')){
    pushSys(state.other.name+' 给你写了一封信');
  }
  showToast(`${state.other.name} 给你写了一封信`);
  return true;
}

async function processPendingReplies(){
  const now=Date.now();
  const letters=await dbGetAll('letters');
  const due=letters.filter(l=>l.sender==='me'&&l.status==='waiting'&&l.replyAt&&l.replyAt<=now);
  for(const l of due){
    const text=_buildLetterReply(l);
    const reply=await dbPut('letters',{sender:'other',title:'RE: '+(l.title||'无标题'),content:text,time:now,status:'replied',read:false,replyTo:l.id,threadId:l.threadId||('letter-'+l.id)});
    l.status='replied';l.repliedId=reply;
    await dbPut('letters',l);
  }
  if(due.length){
    showToast('收到 '+due.length+' 封新回信');
    if((state.notify||{}).letters!==false)notifySystem(`${state.other.name} 回信了`,'收到 '+due.length+' 封新回信',()=>openApp('mailbox'));
  }
  updateTabBadge('chat',await countUnreadLetters());
  return due.length;
}

async function exportLetters(){
  const letters=await dbGetAll('letters');
  const name='星迹_信件数据_'+new Date().toISOString().slice(0,10)+'.json';
  const blob=new Blob([JSON.stringify(letters,null,2)],{type:'application/json'});
  confirmDownload(name,async()=>{showToast('已导出 '+letters.length+' 封信件');return {blob,name};});
}
function importLetters(){
  const input=document.createElement('input');input.type='file';input.accept='application/json,.json';
  input.onchange=async e=>{
    const f=e.target.files&&e.target.files[0];if(!f)return;
    try{
      const txt=await f.text();
      const arr=JSON.parse(txt);
      if(!Array.isArray(arr))throw new Error('格式错误');
      let n=0;
      for(const l of arr){if(l&&l.content){await dbPut('letters',{sender:l.sender==='other'?'other':'me',content:l.content,time:Number(l.time)||Date.now(),status:l.status||'replied',read:true,replyAt:l.replyAt});n++;}}
      showToast('已导入 '+n+' 封信件');renderMailbox();
    }catch(err){showToast('导入失败：文件格式不正确');}
  };
  input.click();
}
function clearLetters(){
  appConfirm('清空所有信件','确定清空全部信件吗？此操作不可恢复。',async()=>{
    const all=await dbGetAll('letters');
    for(const l of all)await dbDelete('letters',l.id);
    renderMailbox();showToast('信件已清空');
  });
}
