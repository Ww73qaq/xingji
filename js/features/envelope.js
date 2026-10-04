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
  const json=JSON.stringify(letters,null,2);
  const blob=new Blob([json],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);const name='星迹_信件数据_'+new Date().toISOString().slice(0,10)+'.json';
  confirmDownload(name,async()=>{const blob=new Blob([JSON.stringify(letters,null,2)],{type:'application/json'});downloadBlob(blob,name);showToast('已导出 '+letters.length+' 封信件');});
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
