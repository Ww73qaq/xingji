/* =========================================================
   星迹 · 朋友圈：发布 / 点赞 / 评论 / 提醒中心 / TA 回评队列
   ========================================================= */

function momentOptOn(k,def=true){const v=state.stats&&state.stats[k];return v===undefined?def:v!==0;}
function openMomentsSettings(){
  const opts=[
    ['post','允许 TA 发布朋友圈',true],
    ['comment','允许 TA 评论 / 回复',true],
    ['emoji','允许 TA 使用表情回应',true],
    ['emojiPack','允许 TA 使用表情包',true],
    ['multiBubble','允许 TA 使用多个拼接气泡',true],
    ['cardReply','允许 TA 在朋友圈回复拼接字卡',true],
    ['like','允许 TA 点赞',true]
  ];
  const rows=opts.map(([k,label,def])=>'<div class="modal-item" onclick="toggleMomentsOpt(\''+k+'\')"><span style="flex:1">'+label+'</span><span class="cs-switch'+(momentOptOn('momentsAllow'+k.charAt(0).toUpperCase()+k.slice(1),def)?' on':'')+'" onclick="event.stopPropagation();toggleMomentsOpt(\''+k+'\')"></span></div>').join('');
  showModal('朋友圈设置','<div style="padding:4px 2px 10px;font-size:12px;color:var(--hint);line-height:1.7">这里控制 TA 在朋友圈可以使用的能力；是否发生互动仍由 TA 自己的行为节奏决定。</div>'+rows,
    '<div class="modal-btn-row single"><button class="modal-btn" onclick="closeModal()">取消</button></div>');
}
function setMomentRate(i){const v=[10,20,50][i]||20;state.prob.momentProb=v;saveKey('prob');openMomentsSettings();}
function toggleMomentsOpt(k){
  const key='momentsAllow'+k.charAt(0).toUpperCase()+k.slice(1);
  state.stats[key]=state.stats[key]===0?1:0;
  saveKey('stats');showToast('已更新');openMomentsSettings();
}
async function renderMoments(){
  const body=document.getElementById('moments-body');body.innerHTML='';
  let moments=await dbGetAll('moments');
  // TA 生成新动态（低频，momentProb）
  const taCount=moments.filter(m=>m.owner==='other'&&!isHiddenMoment(m.id)).length;
  if(taCount<2&&state.stats.momentsAllowPost!==0&&Math.random()<((state.prob.momentProb??25)/100)){
    const line=TA_MOMENT_LINES[Math.floor(Math.random()*TA_MOMENT_LINES.length)];
    const rec=await dbPut('moments',{owner:'other',name:state.other.name,content:line,time:Date.now()-Math.floor(Math.random()*6)*3600000,likes:0,comments:[],read:true});
    // 提醒中心 + 系统通知
    pushNotif({type:'newMoment',from:state.other.name,text:'发布了新动态',momentId:rec});
    notifySystem(`${state.other.name} 发了新动态`,line.slice(0,50),()=>switchTab('moments'));
  }
  moments=await dbGetAll('moments');
  /* 进入朋友圈 → TA 动态 / TA 日记 / TA 评论一律标记已读（红点随之消失） */
  let dirty=false;
  for(const m of moments){
    let changed=false;
    if(m.owner==='other'&&!m.read){m.read=true;changed=true;}
    if(m.comments){
      for(const c of m.comments){if(c.fromTa&&!c.read){c.read=true;changed=true;}}
    }
    if(changed){await dbPut('moments',m);dirty=true;}
  }
  const diaries=await dbGetAll('diaries');
  for(const d of diaries){
    if(d.owner==='other'&&!d.read){d.read=true;await dbPut('diaries',d);dirty=true;}
  }
  if(dirty)refreshAllBadges();
  // 提醒未读红点
  const notifUnread=(state.stats.notifCenter||[]).filter(n=>!n.read).length;
  moments.sort((a,b)=>b.time-a.time);
  moments=moments.filter(m=>!(m.owner==='other'&&isHiddenMoment(m.id)));
  if(!moments.length){body.innerHTML='<div class="empty">还没有朋友圈<br>分享你的第一条动态吧</div>';return;}
  for(const m of moments){
    const likeByMe=m.likedByMe?'已赞':'赞';
    const imgs=(m.images||[]).filter(Boolean);
    let imgHtml='';
    if(imgs.length){
      const cls=imgs.length===1?'mi-1':(imgs.length>=5?'mi-9':(imgs.length===2||imgs.length===4?'mi-2-4':'mi-3'));
      imgHtml=`<div class="moment-imgs ${cls}">${imgs.map(u=>`<div class="mi-cell" style="cursor:pointer" onclick="openImageViewerFromUrl('${u}')"><img src="${u}" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block"></div>`).join('')}</div>`;
    }
    // v3.6.10：头像/昵称全局替换——我的动态与评论一律用 state.me.name / state.me.avatar
    const whoName=(m.owner==='me')?(m.name&&m.name!=='我'?m.name:state.me.name):(m.name||state.other.name||'TA');
    const whoAv=(m.owner==='me')?state.me.avatar:state.other.avatar;
    body.innerHTML+=`<div class="list-card moment-card" data-mid="${m.id}"><div style="display:flex;align-items:center;gap:10px"><div class="moment-avatar" style="background:${m.owner==='other'?'var(--c-rose)':'var(--c-gray)'}">${whoAv?`<img src="${esc(whoAv)}">`:esc(whoName.slice(0,1))}</div><div class="list-card-title" style="flex:1;margin:0">${esc(whoName)}</div><div class="letter-time">${fmtFull(m.time)}</div><span style="font-size:17px;color:var(--hint);cursor:pointer;padding:2px 6px" onclick="momentMenu('${m.id}')">&#8942;</span></div><div style="margin:8px 0;font-size:14px;line-height:1.7">${esc(m.content)}</div>${imgHtml}
    <div style="display:flex;gap:6px;justify-content:flex-end;color:var(--hint);font-size:12px">
      <span class="mom-act ${m.likedByMe?'liked':''}" onclick="likeMoment('${m.id}',this)">${HEART_ICO}${likeByMe}${m.likes?`<i>${m.likes}</i>`:''}</span>
      <span class="mom-act" onclick="commentMoment('${m.id}')">${COMMENT_ICO}评论${(m.comments||[]).length?`<i>${m.comments.length}</i>`:''}</span>
    </div>
    ${(m.comments||[]).map((c,ci)=>`<div class="moment-comment" onclick="replyMomentComment('${m.id}',${ci})" style="cursor:pointer;margin-left:${c.replyTo?'18px':'0'}"><b>${esc(c.name==='我'?(state.me.name||'我'):c.name)}</b>${c.replyTo?' <span style="color:var(--hint)">回复</span> <b>'+esc(c.replyTo.name||'')+'</b>':''}：${esc(c.text)}${c.card?'<span class="moment-reply-card"> · 字卡：'+esc(c.card)+'</span>':''}</div>`).join('')}
    </div>`;
  }
  if(notifUnread>0){
    // 提醒红点入口（顶部已有）
  }
}
function openImageViewerFromUrl(url){openImageViewer({src:url},'图片');}
async function likeMoment(id,el){
  const moments=await dbGetAll('moments');
  const m=moments.find(x=>String(x.id)===String(id));if(!m)return;
  const liked=!!m.likedByMe;
  m.likedByMe=!liked;
  m.likes=Math.max(0,(m.likes||0)+(liked?-1:1));
  await dbPut('moments',m);
  renderMoments();
  showToast(liked?'已取消赞':(m.owner==='other'?'你赞了 TA 的动态':'已赞，你的动态会被 TA 看到'));
}
async function commentMoment(id){
  showModal('评论','<input id="comment-input" class="app-input" placeholder="说点什么…" value="" style="width:100%">',
    '<div class="modal-btn-row"><button class="modal-btn" type="button" onclick="closeModal()">取消</button><button class="modal-btn primary" type="button" onclick="sendMomentComment(\''+String(id)+'\')">发送</button></div>','bottom');
  setTimeout(()=>{const i=document.getElementById('comment-input');if(i){i.focus();}},100);
}
async function sendMomentComment(id){
  const inp=document.getElementById('comment-input');
  const v=inp?(inp.value||'').trim():'';
  if(!v){showToast('评论不能为空');return;}
  const moments=await dbGetAll('moments');
  const m=moments.find(x=>String(x.id)===String(id));if(!m)return;
  m.comments=m.comments||[];
  m.comments.push({name:state.me.name||'我',text:v,time:Date.now(),replyTo:null});
  const commentIndex=m.comments.length-1;
  await dbPut('moments',m);
  closeModal();renderMoments();showToast('评论已发布');
  if(m.owner==='other'&&state.stats.momentsAllowComment!==0&&Math.random()<0.8){
    const delay=(Number(state.prob.replyDelaySec)||20)*1000+Math.random()*6000;
    state.stats.momentReplyQueue=state.stats.momentReplyQueue||[];
    state.stats.momentReplyQueue.push({id:'mr_'+Date.now().toString(36),momentId:id,replyToIndex:commentIndex,at:Date.now()+delay});
    saveKey('stats');
  }
}
async function replyMomentComment(momentId,commentIndex){
  const moments=await dbGetAll('moments');
  const m=moments.find(x=>String(x.id)===String(momentId));if(!m)return;
  const c=(m.comments||[])[commentIndex];if(!c)return;
  const body='<input id="comment-input" class="app-input" placeholder="回复 '+esc(c.name||'评论')+'" style="width:100%">'+
    '<div style="display:flex;gap:7px;margin-top:8px">'+
    '<button class="btn-pill ghost" style="flex:1" onclick="pickMomentReplyCard(\''+String(momentId)+'\','+commentIndex+')">字卡</button>'+
    '<button class="btn-pill ghost" style="flex:1" onclick="pickMomentReplyEmoji()">表情</button></div>'+
    '<div id="moment-reply-extra" style="font-size:11px;color:var(--hint);margin-top:6px"></div>';
  showModal('回复 '+(c.name||'评论'),body,
    '<div class="modal-btn-row single"><button class="modal-btn primary" type="button" onclick="sendMomentReply(\''+String(momentId)+'\','+commentIndex+')">发送</button></div>');
  setTimeout(()=>document.getElementById('comment-input')?.focus(),100);
}
async function sendMomentReply(momentId,commentIndex){
  const inp=document.getElementById('comment-input');
  const v=(inp?.value||'').trim();
  if(!v){showToast('回复不能为空');return;}
  const moments=await dbGetAll('moments');const m=moments.find(x=>String(x.id)===String(momentId));if(!m)return;
  const target=(m.comments||[])[commentIndex];if(!target)return;
  m.comments=m.comments||[];
  const replyTo={index:commentIndex,name:target.name||'评论'};
  const cardText=(window._momentReplyCardText||''); window._momentReplyCardText='';
  m.comments.push({name:state.me.name||'我',text:v,time:Date.now(),replyTo,card:cardText||null});
  await dbPut('moments',m);closeModal();renderMoments();showToast('回复已发送');
  if(m.owner==='other'&&momentOptOn('momentsAllowComment')){
    const delay=(Number(state.prob.replyDelaySec)||20)*1000+Math.random()*6000;
    state.stats.momentReplyQueue=state.stats.momentReplyQueue||[];
    state.stats.momentReplyQueue.push({id:'mr_'+Date.now().toString(36),momentId,replyToIndex:m.comments.length-1,at:Date.now()+delay});
    saveKey('stats');
  }
}
async function pickMomentReplyCard(momentId,commentIndex){
  if(!momentOptOn('momentsAllowCardReply')){showToast('朋友圈字卡回复未开启');return;}
  const cards=(await dbGetAll('cards')).filter(c=>c.enabled!==false);
  if(!cards.length){showToast('还没有可用字卡');return;}
  showModal('选择字卡',cards.slice(0,30).map(c=>'<div class="modal-item" onclick="useMomentReplyCard('+c.id+')">'+esc(c.text||'')+'<span style="color:var(--hint);font-size:11px;margin-left:6px">'+esc(c.group||'默认')+'</span></div>').join(''),
    '<div class="modal-btn-row single"><button class="modal-btn" onclick="closeModal()">取消</button></div>');
  window._momentReplyTarget={momentId,commentIndex};
}
function useMomentReplyCard(id){
  dbGetAll('cards').then(cards=>{
    const c=cards.find(x=>x.id===id);if(!c)return;
    const extra=document.getElementById('moment-reply-extra');
    const inp=document.getElementById('comment-input');
    window._momentReplyCardText=c.text||'';
    closeModal();
    const t=window._momentReplyTarget;
    if(t)replyMomentComment(t.momentId,t.commentIndex);
  });
}
function pickMomentReplyEmoji(){
  const inp=document.getElementById('comment-input');if(inp){inp.value=(inp.value||'')+' 😊';inp.focus();}
}
function pushNotif(n){
  state.stats.notifCenter=state.stats.notifCenter||[];
  state.stats.notifCenter.unshift({id:'n_'+Date.now().toString(36),type:n.type,from:n.from||state.other.name,text:n.text||'',momentId:n.momentId||null,time:Date.now(),read:false});
  if(state.stats.notifCenter.length>50)state.stats.notifCenter=state.stats.notifCenter.slice(0,50);
  saveKey('stats');refreshAllBadges();
}
function notifUnreadCount(){return (state.stats.notifCenter||[]).filter(n=>!n.read).length;}
function openNotifCenter(){
  const list=(state.stats.notifCenter||[]).map(n=>`<div class="modal-item" style="text-align:left;align-items:flex-start" onclick="closeModal();goToNotif('${n.id}')"><div style="flex:1;min-width:0">${n.read?'':'<span style="width:7px;height:7px;border-radius:50%;background:#e74c3c;display:inline-block;margin-right:6px"></span>'}<b>${esc(n.from)}</b> ${esc(n.text)}<div style="font-size:11px;color:var(--hint);margin-top:2px">${fmtFull(n.time)}</div></div><span style="color:var(--hint)">&#8250;</span></div>`).join('');
  showModal('提醒',list||'<div class="empty" style="padding:20px 0">暂无提醒</div>');
}
function goToNotif(nid){
  const n=(state.stats.notifCenter||[]).find(x=>x.id===nid);
  if(n){n.read=true;saveKey('stats');refreshAllBadges();}
  switchTab('moments');
  setTimeout(()=>{
    if(n&&n.momentId){
      const row=document.querySelector(`.moment-card[data-mid="${n.momentId}"]`);
      if(row){row.scrollIntoView({block:'center',behavior:'smooth'});row.classList.add('flash');setTimeout(()=>row.classList.remove('flash'),1800);}
    }
  },350);
}
function isHiddenMoment(id){return (state.stats.hiddenMoments||[]).indexOf(Number(id))>=0;}
/* TA 回评队列处理：挂在 5 秒心跳上，到期写入评论 + 提醒 */
/* ===== TA 主动发朋友圈（v3.6.12）：独立低概率调度 =====
   规则（频率比主动来信略高：冷却 4~10 小时）：
   1) 开关 momentsAllowPost!==0（沿用既有朋友圈开关）关闭 → 不写；
   2) 冷却：距上次主动发圈 4~10 小时随机；
   3) 禁言期间（TA 在整理意识 / TA 不想理你）→ 不写；
   4) 到点后按 momentProb（默认 25%）概率发一条，文案从 TA_MOMENT_LINES 抽。 */
const TA_MOMENT_GAP_MIN=4*3600000;
const TA_MOMENT_GAP_MAX=24*3600000;
async function maybeTaMoment(){
  if(state.stats.momentsAllowPost===0)return;
  const last=Number(state.stats.taMomentLastAt)||0;
  if(last&&Date.now()-last<TA_MOMENT_GAP_MIN+Math.random()*(TA_MOMENT_GAP_MAX-TA_MOMENT_GAP_MIN))return;
  if(Date.now()<state.muteEndTime||Date.now()<state.taMuteMeEndTime)return;
  if(Math.random()<((state.prob.momentProb??25)/100))return taPostMoment();
  return false;
}
async function taPostMoment(){
  const line=TA_MOMENT_LINES[Math.floor(Math.random()*TA_MOMENT_LINES.length)];
  const rec=await dbPut('moments',{owner:'other',name:state.other.name,content:line,time:Date.now(),likes:0,comments:[],read:false});
  state.stats.taMomentLastAt=Date.now();
  saveKey('stats');
  if(typeof pushNotif==='function')pushNotif({type:'newMoment',from:state.other.name,text:'发布了新动态',momentId:rec});
  notifySystem(`${state.other.name} 发了新动态`,line.slice(0,50),()=>switchTab('moments'));
  if(state.currentApp==='moments')renderMoments();
  return true;
}
function processMomentReplies(){
  const q=state.stats.momentReplyQueue||[];
  if(!q.length)return;
  const now=Date.now();
  const due=q.filter(x=>x.at<=now);
  if(!due.length)return;
  state.stats.momentReplyQueue=q.filter(x=>x.at>now);
  saveKey('stats');
  due.forEach(async x=>{
    const ms=await dbGetAll('moments');const mm=ms.find(y=>y.id===Number(x.momentId));if(!mm)return;
    mm.comments=mm.comments||[];
    let text=MOMENT_COMMENTS[Math.floor(Math.random()*MOMENT_COMMENTS.length)];
    let cardText=null;
    if(momentOptOn('momentsAllowCardReply')&&state.prob.cardConcatEnabled&&Math.random()<((Number(state.prob.cardConcatProb)||35)/100)){
      const cards=await dbGetAll('cards');const enabled=cards.filter(c=>c.enabled!==false);if(enabled.length){const c=enabled[Math.floor(Math.random()*enabled.length)];cardText=c.text||null;}
    }
    const target=Number.isInteger(x.replyToIndex)?mm.comments[x.replyToIndex]:null;
    mm.comments.push({name:state.other.name,text:text,time:Date.now(),replyTo:target?{name:target.name,index:x.replyToIndex}:null,card:cardText,fromTa:true,read:false});
    await dbPut('moments',mm);
    pushNotif({type:'comment',from:state.other.name,text:'回复了你的评论：'+text.slice(0,16),momentId:mm.id});
    notifySystem(`${state.other.name} 回复了你`,text.slice(0,50),()=>switchTab('moments'));
    if(state.currentApp==='moments')renderMoments();
  });
}
async function momentMenu(id){
  const moments=await dbGetAll('moments');const m=moments.find(x=>String(x.id)===String(id));if(!m)return;
  const hid=isHiddenMoment(id)?'取消隐藏':'隐藏该动态';
  if(m.owner==='me'){
    showModal('我的动态',`<div class="modal-item" onclick="closeModal();hideMoment('${id}')">${hid}</div><div class="modal-item" style="color:#c0392b" onclick="closeModal();confirmDelMoment('${id}')">删除此动态</div>`,
      '<div class="modal-btn-row single"><button class="modal-btn" onclick="closeModal()">取消</button></div>');
  }else{
    showModal('TA 的动态',`<div class="modal-item" onclick="closeModal();hideMoment('${id}')">${hid}</div>
      <div class="modal-item" onclick="closeModal();toggleMomentsOpt('comment')">允许 TA 评论 / 回复：${momentOptOn('momentsAllowComment')?'开启':'关闭'}</div>
      <div class="modal-item" onclick="closeModal();toggleMomentsOpt('emoji')">允许 TA 表情回应：${momentOptOn('momentsAllowEmoji')?'开启':'关闭'}</div>
      <div class="modal-item" onclick="closeModal();toggleMomentsOpt('emojiPack')">允许 TA 使用表情包：${momentOptOn('momentsAllowEmojiPack')?'开启':'关闭'}</div>
      <div class="modal-item" onclick="closeModal();toggleMomentsOpt('multiBubble')">允许多个拼接气泡：${momentOptOn('momentsAllowMultiBubble')?'开启':'关闭'}</div>
      <div class="modal-item" onclick="closeModal();toggleMomentsOpt('cardReply')">允许朋友圈拼接字卡回复：${momentOptOn('momentsAllowCardReply')?'开启':'关闭'}</div>
      <div class="modal-item" style="color:#c0392b" onclick="closeModal();confirmDelMoment('${id}')">删除此动态</div>`,
      '<div class="modal-btn-row single"><button class="modal-btn" onclick="closeModal()">取消</button></div>');
  }
}
function confirmDelMoment(id){
  showModal('删除这条朋友圈？','<div style="padding:6px 2px 4px;font-size:13px;color:var(--sub)">删除后不可恢复。</div>','<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button><button class="modal-btn primary" style="color:#fff;background:#c0392b" onclick="delMoment(\''+id+'\')">确认删除</button></div>');
}
async function hideMoment(id){
  state.stats.hiddenMoments=state.stats.hiddenMoments||[];
  const nid=Number(id);
  if(state.stats.hiddenMoments.indexOf(nid)>=0)state.stats.hiddenMoments=state.stats.hiddenMoments.filter(x=>x!==nid);
  else state.stats.hiddenMoments.push(nid);
  saveKey('stats');renderMoments();showToast('已更新');
}
async function delMoment(id){await dbDelete('moments',id);renderMoments();showToast('已删除');}
function toggleMomentAllow(k){
  if(k==='comment')state.stats.momentsAllowComment=state.stats.momentsAllowComment===0?1:0;
  else state.stats.momentsAllowEmoji=state.stats.momentsAllowEmoji===0?1:0;
  saveKey('stats');showToast('已更新');
}
let momentDraftImgs=[];
function openCreateMoment(){
  momentDraftImgs=[];
  showModal('发布动态',`<textarea class="textarea-full" id="moment-content" placeholder="分享此刻..."></textarea>
    <div style="display:flex;gap:8px;align-items:center;margin-top:8px">
      <span style="font-size:12px;color:var(--sub)">图片（最多 9 张）</span>
      <button class="btn-pill ghost" style="padding:6px 12px;font-size:12px" onclick="pickMomentImages()">＋ 选择图片</button>
      <span id="moment-img-count" style="font-size:12px;color:var(--hint)">0 张</span>
    </div>
    <div id="moment-img-preview" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px"></div>
    <button class="btn-pill primary" style="width:100%;margin-top:10px" onclick="saveMoment()">发布</button>`);
}
function pickMomentImages(){
  const remain=9-momentDraftImgs.length;
  if(remain<=0){showToast('最多 9 张图片');return;}
  const input=document.createElement('input');input.type='file';input.accept='image/*';input.multiple=true;
  input.onchange=async e=>{
    const files=[...(e.target.files||[])].slice(0,remain);
    if(!files.length)return;
    showToast('正在压缩图片…');
    document.body.style.cursor='wait';
    try{
      for(const f of files){
        momentDraftImgs.push(await compressImage(f));
        if(momentDraftImgs.length>=9)break;
      }
      const box=document.getElementById('moment-img-preview');
      const cnt=document.getElementById('moment-img-count');
      box.innerHTML=momentDraftImgs.map((u,i)=>`<div style="position:relative;width:64px;height:64px;border-radius:8px;overflow:hidden;background:var(--input)"><img src="${u}" style="width:100%;height:100%;object-fit:cover"><span style="position:absolute;top:2px;right:2px;width:16px;height:16px;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center;cursor:pointer" onclick="removeMomentImg(${i})">×</span></div>`).join('');
      if(cnt)cnt.textContent=momentDraftImgs.length+' 张';
    }catch(err){showToast('图片处理失败');}
    document.body.style.cursor='';
  };
  input.click();
}
function removeMomentImg(i){momentDraftImgs.splice(i,1);const box=document.getElementById('moment-img-preview');const cnt=document.getElementById('moment-img-count');if(box)box.innerHTML=momentDraftImgs.map((u,idx)=>`<div style="position:relative;width:64px;height:64px;border-radius:8px;overflow:hidden;background:var(--input)"><img src="${u}" style="width:100%;height:100%;object-fit:cover"><span style="position:absolute;top:2px;right:2px;width:16px;height:16px;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center;cursor:pointer" onclick="removeMomentImg(${idx})">×</span></div>`).join('');if(cnt)cnt.textContent=momentDraftImgs.length+' 张';}
async function scheduleTaMomentInteraction(momentId){
  const delay=3500+Math.random()*9000;
  setTimeout(async()=>{
    const ms=await dbGetAll('moments');
    const m=ms.find(x=>String(x.id)===String(momentId));
    if(!m||m.owner!=='me')return;
    let changed=false;
    if(momentOptOn('momentsAllowLike')&&Math.random()<0.8&&!m.taLiked){
      m.likes=(m.likes||0)+1;m.taLiked=true;changed=true;
      pushNotif({type:'like',from:state.other.name,text:'赞了你的动态',momentId:m.id});
      notifySystem(state.other.name+' 赞了你的动态',(m.content||'').slice(0,50),()=>switchTab('moments'));
    }
    if(momentOptOn('momentsAllowComment')&&Math.random()<0.65){
      m.comments=m.comments||[];
      const text=MOMENT_COMMENTS[Math.floor(Math.random()*MOMENT_COMMENTS.length)];
      m.comments.push({name:state.other.name,text:text,time:Date.now(),replyTo:null,fromTa:true,read:false});
      changed=true;
      pushNotif({type:'comment',from:state.other.name,text:'评论了你的动态：'+text.slice(0,16),momentId:m.id});
      notifySystem(state.other.name+' 评论了你的动态',text.slice(0,50),()=>switchTab('moments'));
    }
    if(changed){await dbPut('moments',m);if(state.currentApp==='moments')renderMoments();}
  },delay);
}
async function saveMoment(){
  const content=(document.getElementById('moment-content')?.value||'').trim();
  if(!content&&!momentDraftImgs.length){showToast('内容不能为空');return;}
  const id=await dbPut('moments',{owner:'me',name:state.me.name||'我',content,images:momentDraftImgs.slice(),time:Date.now(),likes:0,comments:[]});
  closeModal();showToast('动态已发布');
  if(state.currentApp==='moments')renderMoments();
  scheduleTaMomentInteraction(id);
}
