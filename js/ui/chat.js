/* =========================================================
   星迹 · 聊天页：渲染 / 发送 / 引用撤回 / 搜索 / 语音 / 表情 / 拍一拍 / 禁言
   ========================================================= */

let emojiGroupTab=0;
function updateChatHeader(){
  const t=document.getElementById('chat-title');
  if(t){t.firstChild.nodeValue=state.other.name||'TA';const p=document.getElementById('chat-presence');if(p)p.textContent=state.other.status==='离线'?'离线':'在线';}
  document.getElementById('chat-quote').textContent=state.quote;
  updateTaStatusBadge();
}
function editQuote(){appPrompt('编辑顶部文字',state.quote,q=>{if(q!==null&&q!==state.quote){state.quote=q||'遇你，与你，予你，余你';saveKey('quote');document.getElementById('chat-quote').textContent=state.quote;showToast('顶部文字已修改');}});}
function msgPreviewText(m){
  if(m.recalled)return '';
  switch(m.type){
    case 'text':return m.content||'';
    case 'image':return (m.images&&m.images.length?m.images:[m.content]).length+' 张图片';
    case 'voice':return '[语音]';
    case 'music':return '[音乐] '+(m.content||'');
    case 'card':return '[字卡] '+(m.content||'');
    case 'location':return '[位置] '+(m.name||'');
    case 'redpacket':return '[红包] '+(m.content||'')+' 元';
    case 'gift':return '[礼物] '+(m.content||'');
    case 'heart':return '[心意卡] '+(m.content||'');
    case 'transfer':return '[转账] '+(m.content||'')+' 元';
    case 'file':return '[文件] '+(m.content||'');
    default:return m.content||'';
  }
}
function openMeProfile(){
  showModal('我的资料',`<div style="text-align:center;padding:6px 0 12px"><div style="width:64px;height:64px;border-radius:50%;margin:0 auto 10px;background:#e8e6e0;display:flex;align-items:center;justify-content:center;font-size:26px;overflow:hidden;color:#666">${avatarHtml('me')}</div><div style="font-size:16px;font-weight:600">${esc(state.me.name||'我')}</div><div style="font-size:12px;color:#9a9a9a;margin-top:4px">在线</div></div>`,
    '<div class="modal-item" onclick="closeModal();editMeProfile()">修改资料</div>'
    +'<div class="modal-item" onclick="closeModal()">取消</div>');
}
function editMeProfile(){
  appPrompt('修改昵称',state.me.name||'我',v=>{
    if(v===null||v===undefined)return false;
    state.me.name=v.trim()||'我';saveKey('me');showToast('昵称已更新');
    const w=document.getElementById('home-name-me');if(w)w.textContent=state.me.name;
  });
}
function avatarHtml(who){
  const p=who==='me'?state.me:state.other;
  return p.avatar?`<img src="${p.avatar}" alt="">`:esc((p.name||'TA').charAt(0));
}
/* 礼物明信片：按礼物名散列到 6 套莫兰迪配色（同一种礼物每次颜色一致） */
function giftHue(text,shift){
  let h=0;const s=String(text||'');
  for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;
  return (h+(shift||0))%6;
}
/* 邮票图案：GIFTS 用的是数字实体（如&#9749;），默认按文字字形渲染成黑白，
   补一个 U+FE0F 变体选择符才会显示为彩色 emoji。 */
function pcStampEmoji(ch,fallback){
  const s=String(ch||'').trim();
  if(!s)return fallback||'&#127873;';
  return /\uFE0F/.test(s)?s:s+'\uFE0F';
}
function bubbleInnerHtml(m){
  if(m.recalled)return`<div class="msg-bubble msg-recalled">${who(m.sender)==='me'?'你撤回了一条消息':esc(state.other.name)+'撤回了一条消息'}</div>`;
  const q=m.quote?`<div class="msg-quoted" onclick="jumpToMsg(${m.quote.id},event)"><b>${esc(who(m.quote.sender))}：</b>${esc(m.quote.text)}</div>`:'';
  switch(m.type){
    case 'image':{
      const imgs=(m.images&&m.images.length)?m.images:[m.content];
      const n=imgs.length;
      if(n===1)return q+`<div class="msg-bubble img"><img class="msg-img msg-img-1" src="${imgs[0]}" onclick="openImageViewer(this,'${esc(msgPreviewText(m))}',0)"></div>`;
      return q+`<div class="msg-bubble img"><div class="msg-img-grid">${imgs.slice(0,9).map((u,i)=>`<img class="msg-img" src="${u}" onclick="openImageViewer(this,'',${i})">`).join('')}</div></div>`;
    }
    case 'voice':{
      const sec=m.sec||2,w=Math.min(160,60+sec*4);
      const bars=Array.from({length:Math.min(11,3+Math.floor(sec/2))},(_,i)=>`<i style="height:${6+((i*5)%11)}px"></i>`).join('');
      return q+`<div class="msg-bubble" style="padding:8px 11px;min-width:${w+40}px"><div class="voice-wrap" onclick="playVoiceMsg(${m.id},${sec},${m.sender==='me'})"><span class="voice-icon" id="vicon-${m.id}"></span><div class="voice-wave">${bars}</div><span class="voice-sec">${sec}″</span>${m.unread&&m.sender==='other'?'<span class="voice-unread"></span>':''}</div></div>`;
    }
    case 'music':
      return q+`<div class="msg-bubble msg-card"><div style="display:flex;align-items:center;gap:10px;padding:11px 12px"><div class="msg-card-ico">&#127925;</div><div style="flex:1;min-width:0"><div style="font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(m.content||'')}</div><div style="font-size:11px;opacity:.6;margin-top:1px">${esc(m.sub||'音乐消息')}</div></div></div><div class="msg-card-foot">${esc(m.sub||'')}&nbsp;·&nbsp;星迹音乐</div></div>`;
    case 'card':
      return q+`<div class="msg-bubble msg-card" style="background:linear-gradient(135deg,#2b2b2b,#0f0f0f)!important"><div class="msg-card-top"><div class="msg-card-title" style="color:#fff">${esc(m.content||'')}</div><div class="msg-card-sub" style="color:rgba(255,255,255,.55)">${esc(m.sub||'字卡')}</div></div><div class="msg-card-foot" style="background:rgba(255,255,255,.08);color:rgba(255,255,255,.5)">${esc(m.fav?'':'')}星迹字卡</div></div>`;
    case 'redpacket':
      return q+`<div class="msg-bubble msg-card rp-card" style="min-width:0"><div style="padding:12px 14px"><div class="rp-amt">&#129505; ${esc(m.content)} 元</div><div class="rp-msg">${esc(m.sub||'恭喜发财，大吉大利')}</div></div></div>`;
case 'gift':{
      const hue=giftHue(m.content||'礼物');
      return q+`<div class="msg-bubble msg-card postcard pc-${hue}">
        <div class="pc-head"><div class="pc-stamp"><span>${pcStampEmoji(m.sub,'&#127873;')}</span></div><div class="pc-mark"></div></div>

        <div class="pc-body">
          <div class="pc-title">${esc(m.content||'礼物')}</div>
          <div class="pc-sub">星迹心意</div>
        </div>
        <div class="pc-foot"><span class="pc-dash"></span>星迹 · 寄自 ${esc(state.other.name)}</div>
      </div>`;
    }
    case 'heart':{
      const hue=giftHue(m.content||'心意卡',2);
      return q+`<div class="msg-bubble msg-card postcard pc-${hue}">
        <div class="pc-head"><div class="pc-stamp"><span>${pcStampEmoji(m.sub,'&#10084;')}</span></div><div class="pc-mark"></div></div>

        <div class="pc-body">
          <div class="pc-title">${esc(m.content||'心意卡')}</div>
          <div class="pc-sub">星迹心意</div>
        </div>
        <div class="pc-foot"><span class="pc-dash"></span>星迹 · 心意已送达</div>
      </div>`;
    }
    case 'transfer':
      return q+`<div class="msg-bubble msg-card" style="min-width:0;border:1px solid var(--input)"><div style="padding:12px 14px"><div style="font-size:11px;color:var(--hint)">${esc(state.other.name)} 收款</div><div class="rp-amt" style="font-size:22px">${esc(m.content)} 元</div><div class="rp-msg" style="color:var(--hint)">${esc(m.sub||'转账')}</div></div></div>`;
    case 'location':
      return q+`<div class="msg-bubble msg-card" style="min-width:0"><div class="msg-loc"><div class="msg-loc-img"></div><div style="padding:7px 10px 9px"><div class="msg-loc-name">${esc(m.name||'位置')}</div><div class="msg-loc-addr">${esc(m.addr||'')}</div></div></div></div>`;
    case 'file':
      return q+`<div class="msg-bubble msg-card"><div style="display:flex;align-items:center;gap:10px;padding:11px 12px"><div class="msg-card-ico">&#128196;</div><div class="msg-music-meta"><div class="msg-music-name">${esc(m.content||'文件')}</div><div class="msg-music-artist">${esc(m.sub||'')}</div></div></div></div>`;
    case 'survey':      // 问卷与单选/多选共用同一套卡片渲染（v3.4.0 修复：survey 之前落到 default，气泡只显示一行文字）
    case 'poll':{
      const pp=m.poll||m.survey||{};
      const isSurvey=!!(pp.questions&&pp.questions.length);
      /* 已选判定（两种 sel 结构）：
         问卷  sel = [[i],[i,j]…] 逐题数组 → 取 sel[qi] 再判断
         单选/多选 sel = [i,j,…] 一维下标 → 直接在 sel 里找
         v3.4.0 之前这里统一按 sel[qi] 取，导致多选只勾中「第一个被选中的下标」，
         出现「回答文本列了 6 项、气泡只勾 1 项」的对不上问题。 */
      const sel=m.answer&&m.answer.sel;
      const isSelQ=(qi,oi)=>{if(!sel)return false;const s=sel[qi];return Array.isArray(s)?s.indexOf(oi)>=0:s===oi;};
      const isSelFlat=(oi)=>!!sel&&sel.indexOf(oi)>=0;
      /* 底部状态条：superseded（已被「修改并重发」替代）是独立提示行；
   已作答照旧显示用时，两者可以同时出现；未作答且已替代则不再给「再问一遍」，
   避免用户在废弃题上反复操作。 */
      const note=m.superseded?'<div class="poll-note">已重新发送 · 看下面那条</div>':'';
      const foot=m.answer
        ?(note+'<div class="poll-ans">'+esc(state.other.name)+' 已作答 · 用时 '+(m.answer.usedSec||0)+' 秒</div>')
        :(m.superseded
            ?note
            :(isPollStale(m)
            ?('<div class="poll-wait stale" onclick="pollRetry(\''+m.id+'\')">'+(m.retried?'已重新问过 · 再问一次':'TA 好像没接住这道题 · 点击再问一遍')+'</div>')
            :('<div class="poll-wait" onclick="pollRetry(\''+m.id+'\')">等待作答… 点击可再问一遍</div>')));
      if(isSurvey){
        const items=pp.questions.map((q,i)=>{
          const optsHtml=(q.options||[]).map((o,oi)=>{
            const on=isSelQ(i,oi);
            return '<div class="poll-opt'+(on?' sel':'')+'">'+String.fromCharCode(65+oi)+'. '+esc(o)+(on?' <b>&#10003;</b>':'')+'</div>';
          }).join('');
          return '<div class="poll-q" style="margin-top:'+(i?'7':'0')+'px">'+(i+1)+'. '+esc(q.q||'')+(q.multi?'<span style="font-size:11px;color:var(--hint)">（多选）</span>':'')+'</div>'+optsHtml;
        }).join('');
        const dl=pp.deadlineSec?(' · '+pp.deadlineSec+' 秒内作答'):'';
        return q+'<div class="msg-bubble msg-card" style="min-width:0"><div style="padding:11px 13px 9px"><div class="poll-q">'+esc(m.content||'问卷')+' <span style="font-size:11px;color:var(--hint)">问卷 · '+pp.questions.length+' 题'+dl+'</span></div>'+items+'</div>'+foot+'</div>';
      }
      const opts=(pp.options||[]).map((o,i)=>{const on=isSelFlat(i);return '<div class="poll-opt'+(on?' sel':'')+'">'+String.fromCharCode(65+i)+'. '+esc(o)+(on?' <b>&#10003;</b>':'')+'</div>';}).join('');
      const tag=(pp.multi?('多选'+(pp.multiMin?' · 选 '+pp.multiMin+'-'+pp.multiMax+' 项':'')):'单选');
      return q+'<div class="msg-bubble msg-card" style="min-width:0"><div style="padding:11px 13px 9px"><div class="poll-q">'+esc(pp.question||'题目')+' <span style="font-size:11px;color:var(--hint)">'+tag+'</span></div>'+opts+'</div>'+foot+'</div>';
    }
    default:{
      const mark=(m.proactive&&m.sender==='other')?'<span class="proactive-mark">✦ </span>':'';
      return q+`<div class="msg-bubble">${mark}${linkify(esc(m.content||''))}</div>`;
    }
  }
}
function who(s){return s==='me'?state.me.name:state.other.name;}
/* 头像渲染：有图显示图，无图显示首字（避免空 src 破图） */
function paintAvatar(el,p){
  if(!el)return;
  el.innerHTML=p.avatar?`<img src="${p.avatar}" alt="">`:esc((p.name||'TA').charAt(0));
}
let chatFirstPaint=true, chatUnreadShown=false;
/* 构建单条消息行（完整渲染与增量追加共用） */
/* 题目「等太久」的判定：超过预期作答时长的 2 倍（下限 60 秒）仍无答案 → 提示再问一遍
   问卷用自己的期限，单选/多选用回复时间。返回 0 表示不适用。 */
function pollStaleMs(m){
  if(!m||m.answer||m.recalled)return 0;
  if(m.type!=='poll'&&m.type!=='survey')return 0;
  const p=m.poll||m.survey||{};
  const waitSec=m.type==='survey'
    ?(Number(p.deadlineSec)||Number((state.surveySettings||{}).deadlineSec)||60)
    :(Number(state.prob&&state.prob.replyDelaySec)||20);
  return Math.max(60,waitSec*2)*1000;
}
function isPollStale(m){
  const t=pollStaleMs(m);
  return t>0&&(Date.now()-m.time)>t;
}
/* 心跳里调：把「等太久」的题目气泡原地刷新（只刷状态翻转的那几条，不重绘全屏） */
async function refreshStalePolls(){
  if(state.currentApp!=='chat')return;
  const el=document.getElementById('chat-content');if(!el||!el.childElementCount)return;
  let all=[];try{all=await dbGetAll('messages');}catch(e){return;}
  for(const m of all){
    if(m.type!=='poll'&&m.type!=='survey')continue;
    const row=el.querySelector(`.msg-row[data-mid="${m.id}"]`);
    if(!row)continue;
    const now=isPollStale(m)?'1':'0';
    if(row.dataset.stale===now)continue;
    row.dataset.stale=now;
    const fresh=buildMsgRow(m);
    if(row.parentNode)row.parentNode.replaceChild(fresh,row);
  }
}
function buildMsgRow(m){
  const isMe=m.sender==='me';
  const row=document.createElement('div');
  row.className='msg-row '+(isMe?'me':'other');row.dataset.mid=m.id;
  // 题目气泡：缓存「是否等太久」，心跳只刷新状态翻转的那几条
  if(m.type==='poll'||m.type==='survey')row.dataset.stale=isPollStale(m)?'1':'0';
  const acol=document.createElement('div');acol.className='msg-avatar-col';
  const av=document.createElement('div');av.className='msg-avatar';av.innerHTML=avatarHtml(m.sender);
  if(!isMe){av.style.cursor='pointer';av.title='双击拍一拍';av.ondblclick=e=>{e.stopPropagation();pokeChat();};}
  acol.appendChild(av);
  const ts=document.createElement('span');ts.className='msg-time';ts.textContent=fmtChatTimeSec(m.time);
  acol.appendChild(ts);
  const body=document.createElement('div');body.className='msg-body';
  body.innerHTML=bubbleInnerHtml(m);
  const meta=document.createElement('div');meta.className='msg-meta';
  if(isMe){
    const st=document.createElement('span');
    st.className='msg-status '+(m.read?'read':'sent');
    st.textContent=m.read?'\u2714\u2714':'\u2714';
    meta.appendChild(st);
  }
  if(m.fav){const f=document.createElement('span');f.textContent='★';f.style.color='#c0392b';meta.appendChild(f);}
  body.appendChild(meta);
  row.appendChild(acol);row.appendChild(body);
  bindMsgGestures(row,m);
  return row;
}
/* 增量追加一条消息：不重绘历史；用户在看历史时不强制滚动 */
function appendMsgRow(m,stick){
  const el=document.getElementById('chat-content');if(!el)return;
  const atBottom=el.scrollTop+el.clientHeight>=el.scrollHeight-60;
  const label=fmtChatDate(m.time);
  // 日期分隔只由日期变化决定：向上找最近一个真正的日期分隔（跳过 查看更早消息/新消息分隔）
  let lastDate='';
  let scan=el.lastElementChild;
  while(scan){
    if(scan.classList.contains('chat-date')&&!scan.classList.contains('load-more')&&!scan.classList.contains('chat-unread')){lastDate=scan.textContent;break;}
    scan=scan.previousElementSibling;
  }
  if(label!==lastDate){const d=document.createElement('div');d.className='chat-date';d.textContent=label;el.appendChild(d);}
  if(m.sender!=='sys'&&!chatUnreadShown&&m.sender==='other'&&m.time>(state.chat.lastReadAt||0)){
    chatUnreadShown=true;
    const u=document.createElement('div');u.className='chat-unread';u.textContent='以下为新消息';u.onclick=()=>{el.scrollTop=u.offsetTop-60;};
    el.appendChild(u);
  }
  if(m.sender==='sys'){
    const d=document.createElement('div');
    d.className='msg-sys'+(m.action?' tappable':'');
    d.textContent=m.content||'';
    if(m.action==='reedit'&&m.ref)d.onclick=()=>reeditMessage(m.ref);
    el.appendChild(d);
  }else{
    el.appendChild(buildMsgRow(m));
  }
  if(stick||atBottom)requestAnimationFrame(()=>{el.scrollTop=el.scrollHeight;});
}
let chatPageSize=100;   // 聊天窗口化：默认只渲染最近 100 条，历史按 50 条加载
async function renderChat(scrollBottom){
  const el=document.getElementById('chat-content');if(!el)return;
  const msgs=(await dbGetAll('messages')).filter(m=>!m.deleted).sort((a,b)=>a.time-b.time);
  const oldH=el.scrollHeight,oldTop=el.scrollTop;
  const keep=el.scrollTop+el.clientHeight>=el.scrollHeight-60;
  const stick=(scrollBottom===true)||keep||chatFirstPaint;
  chatFirstPaint=false;
  chatUnreadShown=false;
  let lastLabel='',last=el.scrollHeight;
  el.innerHTML='';
  const start=msgs.length>chatPageSize?msgs.length-chatPageSize:0;
  const slice=msgs.slice(start);
  if(start>0){
    const btn=document.createElement('div');btn.className='chat-date load-more';
    btn.textContent='查看更早消息';
    btn.onclick=()=>{chatPageSize+=50;renderChat(false);};
    el.appendChild(btn);
  }
  for(const m of slice){
    if(m.sender!=='sys'&&!chatUnreadShown&&m.sender==='other'&&m.time>(state.chat.lastReadAt||0)){
      chatUnreadShown=true;
      const u=document.createElement('div');u.className='chat-unread';u.textContent='以下为新消息';u.onclick=()=>{el.scrollTop=u.offsetTop-60;};
      el.appendChild(u);
    }
    const label=fmtChatDate(m.time);
    if(label!==lastLabel){lastLabel=label;const d=document.createElement('div');d.className='chat-date';d.textContent=label;el.appendChild(d);}
    if(m.sender==='sys'){
      const d=document.createElement('div');
      d.className='msg-sys'+(m.action?' tappable':'');
      d.textContent=m.content||'';
      if(m.action==='reedit'&&m.ref) d.onclick=()=>reeditMessage(m.ref);
      el.appendChild(d);continue;
    }
    el.appendChild(buildMsgRow(m));
  }
  if(!msgs.length)el.innerHTML='<div class="msg-sys">还没有消息，说点什么吧</div>';
  if(stick)requestAnimationFrame(()=>{el.scrollTop=el.scrollHeight;});
  else if(oldH>0&&el.scrollHeight>oldH)el.scrollTop=oldTop+(el.scrollHeight-oldH);
  else el.scrollTop=oldTop;
}
/* 长按 / 右键 → 消息操作面板 */
function bindMsgGestures(row,m){
  let timer=null,moved=false,sx=0,sy=0;
  const start=e=>{
    if(m.sender==='sys')return;
    moved=false;
    const p=e.touches?e.touches[0]:e;
    sx=p.clientX;sy=p.clientY;
    timer=setTimeout(()=>{timer=null;haptic();openCtxMenu(m.id,e);},480);
  };
  const move=e=>{
    const p=e.touches?e.touches[0]:e;
    if(Math.abs(p.clientX-sx)>10||Math.abs(p.clientY-sy)>10){moved=true;if(timer){clearTimeout(timer);timer=null;}}
  };
  const end=()=>{if(timer){clearTimeout(timer);timer=null;}};
  row.addEventListener('pointerdown',start);
  row.addEventListener('pointermove',move);
  row.addEventListener('pointerup',end);
  row.addEventListener('pointercancel',end);
  row.addEventListener('pointerleave',end);
  row.addEventListener('contextmenu',e=>{e.preventDefault();if(m.sender!=='sys')openCtxMenu(m.id,e);});
}
/* =========================================================
   消息操作菜单（锚定消息的小横条 · 微信/iMessage 风格）
   - 长按 / 右键 → 在消息上方或下方弹出小横条（无全屏遮罩）
   - 点空白处 / 滚动 / 缩放 / 返回 → 自动关闭
   - 动作顺序：复制 → 引用 → 收藏 → 修改并重发 → 撤回 → 删除
   ========================================================= */
/* 消息长按 / 右键 → 操作菜单（实现在 ui/action-bar.js，这里只负责组装动作） */
let ctxMsgId=null;
let ctxItems=[];        // 兼容旧调用；动作本体交给 showActionBar
async function openCtxMenu(id,ev){
  const msgs=await dbGetAll('messages');
  const m=msgs.find(x=>Number(x.id)===Number(id));
  if(!m||m.sender==='sys')return;

  ctxMsgId=id;
  const isMe=m.sender==='me';
  // 撤回：固定 120 秒（开关控制是否可用）
  const canRecall=isMe&&!m.recalled&&state.chat.allowRecall!==false&&(Date.now()-m.time)<120000;

  const items=[];
  if(m.type==='text'||m.type==='poll'||m.type==='survey')items.push({key:'copy',label:'复制',fn:()=>copyMsg(m)});
  items.push({key:'quote',label:'引用',fn:()=>startQuote(m)});
  items.push({key:'fav',label:m.fav?'取消收藏':'收藏',fn:()=>toggleFav(m)});
  if((m.type==='poll'||m.type==='survey')&&isMe)items.push({key:'edit',label:'修改并重发',fn:()=>editPollAndResend(m)});
  if(canRecall)items.push({key:'recall',label:'撤回',fn:()=>recallMsg(m)});
  items.push({key:'delete',label:'删除',fn:()=>deleteMsg(m),danger:true,sepBefore:true});

  const row=document.querySelector(`.msg-row[data-mid="${id}"]`);
  // 定位锚点：优先用长按/右键坐标，没有则退回消息行
  const point=(ev&&ev.clientX)?{x:ev.clientX,y:ev.clientY}:null;
  showActionBar(items,{anchor:point?null:row,point,scroller:document.getElementById('chat-content')});
}
/* 兼容旧调用：关闭动作条 */
function closeCtxMenu(){
  closeActionBar();
  ctxMsgId=null;ctxItems=[];
}
/* ---- 长按动作实现 ---- */
/* 把 poll / survey 消息转成「可粘回问卷文本框」的原文（复制 → 修改 → 重发 的关键链路） */
function _pollToText(m){
  const p=m.poll||m.survey||{};
  if(p.questions&&p.questions.length){
    return p.questions.map(q=>'[题目] '+(q.q||'')+'\n'+(q.options||[]).join('\n')).join('\n\n');
  }
  return '[题目] '+(p.question||'')+'\n'+(p.options||[]).join('\n');
}
async function copyMsg(m){
  const t=(m.type==='poll'||m.type==='survey')?_pollToText(m):msgPreviewText(m);
  if(!t){showToast('这条消息没有可复制的内容');return;}
  try{await navigator.clipboard.writeText(t);showToast('已复制到剪贴板');}
  catch(e){
    const ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();
    try{document.execCommand('copy');showToast('已复制到剪贴板');}catch(_){showToast('复制失败');}
    ta.remove();
  }
}
let quoteTarget=null;
function startQuote(m){
  quoteTarget={id:m.id,sender:m.sender,text:msgPreviewText(m)};
  const bar=document.getElementById('quote-input');
  document.getElementById('quote-input-text').innerHTML=`<b>${esc(who(m.sender))}：</b>${esc(quoteTarget.text)}`;
  bar.classList.add('show');
  closeEmojiPanel();
  const inp=document.getElementById('chat-input');inp.focus();
  if(window.innerWidth<520)setTimeout(()=>inp.scrollIntoView({block:'nearest'}),60);
}
function cancelQuoteInput(){quoteTarget=null;document.getElementById('quote-input').classList.remove('show');}
async function forwardMsg(m){
  await dbPut('messages',{sender:'sys',type:'text',content:`你转发了一条消息给${state.other.name}`,time:Date.now()});
  const t=msgPreviewText(m);
  await dbPut('messages',{sender:'me',type:'text',content:'【转发】'+(TYPE_LABEL[m.type]||'')+t,time:Date.now()+1,read:false});
  renderChat(true);showToast('已转发');
}
async function toggleFav(m){
  m.fav=m.fav?0:1;await dbPut('messages',m);renderChat();showToast(m.fav?'已收藏':'已取消收藏');
}
async function deleteMsg(m){
  appConfirm('删除消息','删除后不可恢复，确定删除这条消息吗？',async()=>{
    await dbDelete('messages',m.id);renderChat();showToast('消息已删除');
  });
}
async function recallMsg(m){
  m.recalled=1;m.content='';m.images=null;m.sec=0;await dbPut('messages',m);
  await dbPut('messages',{sender:'sys',type:'text',content:'你撤回了一条消息',time:Date.now()+1,action:'reedit',ref:{id:m.id,text:msgPreviewText(m)}});
  renderChat();showToast('已撤回');
}
function reeditMessage(ref){
  const inp=document.getElementById('chat-input');
  inp.value=ref.text||'';cancelQuoteInput();syncInputBar();inp.focus();
  showToast('已填入输入框，可重新编辑');
}
function jumpToMsg(id,ev){
  ev&&ev.stopPropagation();
  const find=()=>document.querySelector(`.msg-row[data-mid="${id}"]`);
  const jump=()=>{
    let row=find();
    if(!row){
      // 消息在窗口外（历史消息）：扩窗到全量再定位（搜索定位 / 引用跳转）
      chatPageSize=99999;
      renderChat(false).then(()=>{if(find())jump();else showToast('消息不存在');});
      return;
    }
    row.scrollIntoView({block:'center',inline:'nearest',behavior:'auto'});
    // v3.6.14：先瞬时定位到大致位置，等渲染稳定（1s 缓冲区）后再精确重定位，
    // 抵消固定顶栏 / 头像图片加载 / smooth 动画过冲造成的 UI 偏移
    setTimeout(()=>{
      const rr=find();if(!rr)return;
      rr.scrollIntoView({block:'center',inline:'nearest',behavior:'auto'});
      rr.classList.add('flash');setTimeout(()=>rr.classList.remove('flash'),1500);
    },1000);
  };
  jump();
}
/* ---- 发送 ---- */
/* ---- 统一消息发送入口：文字/图片/语音/emoji/表情包/字卡/礼物/单选/多选/问卷 ---- */
async function sendMessageObject(message){
  if(Date.now()<state.taMuteMeEndTime){showToast('对方暂时不想理你，等 TA 缓一缓');return null;}
  message.sender='me';message.time=message.time||Date.now();message.read=false;message.state='sending';
  if(typeof touchInteract==='function')touchInteract();   // v3.6.0：我方发消息 → 连接频率上升
  if(quoteTarget&&!message.quote){message.quote=quoteTarget;quoteTarget=null;document.getElementById('quote-input').classList.remove('show');}
  const rec=await dbPut('messages',message);
  closeEmojiPanel();
  // 增量追加，不重建整个聊天（renderChat 只在进页面/翻历史/撤回删除收藏时调用）
  if(state.currentApp==='chat')appendMsgRow({...message,id:rec},true);
  // 系统消息不触发回复；其余全部统一进入回复调度
  const sysTypes=['sys'];
  if(!sysTypes.includes(message.sender)&&message.sender==='me'&&!message.noReply){
    // 问卷期限写在「消息自身的 survey.deadlineSec」上（弹窗里设置），缺省回退全局默认
    let deadlineSec=null,earlySubmitProb=null;
    if(message.type==='survey'){
      const sv=message.survey||{};
      deadlineSec=Number(sv.deadlineSec)||Number(state.surveySettings&&state.surveySettings.deadlineSec)||60;
      if(Number.isFinite(Number(sv.earlySubmitProb)))earlySubmitProb=Number(sv.earlySubmitProb);
    }
    enqueueTaJob({type:'reply',source:'passive',messageId:rec,deadlineSec,earlySubmitProb});
  }
  return rec||message;
}
/* 兼容旧调用 */
async function sendMsgObj(obj,noReply){obj.noReply=noReply;return sendMessageObject(obj);}
function sendMessage(){
  if(Date.now()<state.muteEndTime){showToast('对方已被禁言');return;}
  if(Date.now()<state.taMuteMeEndTime){showToast('对方暂时不想理你，等 TA 缓一缓');return;}
  const input=document.getElementById('chat-input');const text=input.value.trim();if(!text)return;
  input.value='';autoGrow(input);
  syncInputBar();
  sendMessageObject({type:'text',content:text});
  markMeReadSoon();
}
/* 我方消息延迟 2~4 秒标记「已读」（✓✓），模拟 TA 已读 */
function markMeReadSoon(){
  setTimeout(async()=>{
    const all=await dbGetAll('messages');
    const changed=all.filter(m=>m.sender==='me'&&!m.read&&!m.recalled);
    if(!changed.length)return;
    for(const m of changed){m.read=true;await dbPut('messages',m);}
    // 只刷新 ✓/✓✓ 状态，不重建 DOM（避免整屏重绘导致滚动位置丢失）
    if(state.currentApp==='chat')refreshReadTicks();
  },2000+Math.random()*2000);
}
/* 增量刷新我方消息的已读标记 */
async function refreshReadTicks(){
  const el=document.getElementById('chat-content');if(!el)return;
  let all=[];try{all=await dbGetAll('messages');}catch(e){return;}
  const map=new Map(all.map(m=>[String(m.id),m]));
  el.querySelectorAll('.msg-row.me').forEach(row=>{
    const m=map.get(row.dataset.mid);if(!m)return;
    const st=row.querySelector('.msg-status');if(!st)return;
    const want=m.read?'read':'sent';
    if(st.classList.contains(want))return;
    st.className='msg-status '+want;
    st.textContent=m.read?'\u2714\u2714':'\u2714';
  });
}

function updateChatSubtitle(){
  const sub=document.getElementById('chat-subtitle');
  const title=document.getElementById('chat-title');
  if(title){const nn=title.firstChild;if(nn&&nn.nodeType===3)nn.nodeValue=state.other.name||'TA';}   // 只改名字文本，保留状态徽标 span（v3.6.0 修 bug：textContent 会抹掉 chat-ta-status）
  if(!sub)return;
  const j=_scheduler.activeJob;
  // 唯一状态来源：在线 / 正在输入…（含 waiting+typing 全程） / 被禁言 / 通话中
  if(state.callActive){sub.textContent='通话中';}
  else if(Date.now()<state.muteEndTime){sub.textContent='被禁言';}
  else if(Date.now()<state.taMuteMeEndTime){sub.textContent='对方暂时不想理你';}
  else if(j&&(j.status==='waiting'||j.status==='typing'||j.status==='sending')){sub.textContent='正在输入…';}
  else{sub.textContent='在线';}
  /* 继续按钮：有进行中的任务时隐藏；无任务且已有过回复轮次时显示 */
  const wrap=document.getElementById('chat-continue-wrap');
  if(wrap){
    const hasJob=!!(_scheduler.activeJob);
    const hadRound=(_scheduler.lastTaReplyAt||0)>0||(_scheduler.lastUserMsgAt||0)>0;
    wrap.style.display=(!hasJob&&hadRound)?'flex':'none';
  }
}
/* 兼容旧调用：统一进调度器 */
function scheduleReply(){enqueueTaJob({type:'reply',source:'passive'});}
/* 兼容旧调用：无独立 typing 横条，状态走副标题 */
function showTyping(){updateChatSubtitle();}
function hideTyping(){updateChatSubtitle();}
function isAppVisible(){return navStack[navStack.length-1]==='chat'&&!document.hidden;}

/* 语音：按住说话（真实 MediaRecorder 录音，不可用时回退到合成音） */
let voiceMode=false,recording=false,recordStart=0,mediaRec=null,mediaStream=null,mediaChunks=[],recTimer=null;
function toggleVoiceMode(){
  voiceMode=!voiceMode;
  const input=document.getElementById('chat-input'),talk=document.getElementById('talk-btn'),btn=document.getElementById('btn-voice');
  if(input){input.style.display=voiceMode?'none':'';if(voiceMode)input.blur();}
  if(talk)talk.classList.toggle('show',voiceMode);
  if(btn)btn.innerHTML=voiceMode?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M10 9l4 6M14 9l-4 6"/></svg>':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a4 4 0 0 1 4 4v5a4 4 0 0 1-8 0V7a4 4 0 0 1 4-4Z"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
  if(voiceMode)closeEmojiPanel();
}
let voiceRecTick=null;
function initVoiceTalk(){
  const talk=document.getElementById('talk-btn');if(!talk)return;
  talk.addEventListener('click',async ()=>{
    if(!voiceMode)return;
    if(Date.now()<state.muteEndTime){showToast('对方已被禁言');return;}
    if(!recording){
      recording=true;recordStart=Date.now();
      talk.classList.add('recording');talk.textContent='00:00 · 点击结束';
      startRealRecord(talk);
      return;
    }
    finishVoiceRecord(talk);
  });
}
async function finishVoiceRecord(talk){
  recording=false;
  clearInterval(recTimer);
  if(voiceRecTick){clearInterval(voiceRecTick);voiceRecTick=null;}
  talk.classList.remove('recording');talk.textContent='点击 开始录音';
  const sec=(Date.now()-recordStart)/1000;
  if(sec<0.8){stopRealRecord();showToast('说话时间太短');return;}
  const vsec=Math.max(1,Math.min(60,Math.round(sec)));
  const audio=await stopRealRecord();
  pendingVoiceAudio=audio;
  showModal('发送语音',`<div style="text-align:center;padding:10px 0 2px">
    <div style="width:84px;height:84px;border-radius:50%;background:var(--input);display:flex;align-items:center;justify-content:center;margin:0 auto;font-size:38px">&#127908;</div>
    <div style="font-size:26px;font-weight:700;color:var(--text);margin-top:10px">${vsec} 秒</div>
    <div style="font-size:12px;color:var(--hint);margin-top:4px">${audio?'· 真实录音':'· 模拟音'} · ${fmtTime(recordStart)}</div>
    <button class="pill-oval" style="margin-top:14px" onclick="playPendingVoice()">&#9654; 先试听</button>
  </div>`,
    '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal();pendingVoiceAudio=null">取消</button><button class="modal-btn primary" onclick="closeModal();doSendVoice('+vsec+')">发送</button></div>');
  const mc=document.getElementById('modal-close');if(mc)mc.style.display='';
}
function playPendingVoice(){
  if(!pendingVoiceAudio){showToast('没有可试听的音频');return;}
  stopVoiceAudio();
  voiceAudioEl=new Audio(pendingVoiceAudio);
  voiceAudioEl.onended=()=>{voiceAudioEl=null;};
  voiceAudioEl.play().catch(()=>showToast('试听失败'));
}
let pendingVoiceAudio=null;
async function doSendVoice(vsec){
  const audio=pendingVoiceAudio;pendingVoiceAudio=null;
  await sendMsgObj({type:'voice',sec:vsec,audio:audio||null});
  showToast(audio?'语音已发送（真实录音）':'语音已发送（模拟音）');
}
function startRealRecord(talk){
  const tick=()=>{
    if(!recording)return;
    const sec=Math.floor((Date.now()-recordStart)/1000);
    const mm=String(Math.floor(sec/60)).padStart(2,'0'),ss=String(sec%60).padStart(2,'0');
    talk.textContent=`${mm}:${ss} · 点击结束`;
    if(sec>=60)finishVoiceRecord(talk);
  };
  tick();
  voiceRecTick=setInterval(tick,1000);
  recTimer=setTimeout(()=>{},0);
  if(!navigator.mediaDevices||!window.MediaRecorder)return;
  navigator.mediaDevices.getUserMedia({audio:true}).then(stream=>{
    if(!recording){stream.getTracks().forEach(t=>t.stop());return;}
    mediaStream=stream;mediaChunks=[];
    let mime='';['audio/webm','audio/mp4','audio/ogg'].some(m=>{if(window.MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(m)){mime=m;return true;}});
    mediaRec=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
    mediaRec.ondataavailable=e=>{if(e.data&&e.data.size)mediaChunks.push(e.data);};
    mediaRec.start();
  }).catch(()=>{mediaRec=null;});
}
function stopRealRecord(){
  return new Promise(res=>{
    if(!mediaRec){if(mediaStream)mediaStream.getTracks().forEach(t=>t.stop());mediaRec=null;mediaStream=null;return res(null);}
    const rec=mediaRec;
    rec.onstop=()=>{
      if(mediaStream)mediaStream.getTracks().forEach(t=>t.stop());
      const blob=new Blob(mediaChunks,{type:rec.mimeType||'audio/webm'});
      mediaRec=null;mediaStream=null;mediaChunks=[];
      if(!blob.size)return res(null);
      const fr=new FileReader();
      fr.onload=()=>res(fr.result);
      fr.onerror=()=>res(null);
      fr.readAsDataURL(blob);
    };
    try{rec.stop();}catch(e){res(null);}
  });
}
let voiceAudioCtx=null,voicePlayingId=null,voiceAudioEl=null;
function playSimVoice(sec){
  try{
    if(!voiceAudioCtx)voiceAudioCtx=new (window.AudioContext||window.webkitAudioContext)();
    const ctx=voiceAudioCtx,dur=Math.max(0.5,Math.min(sec||2,15));
    const n=Math.floor(ctx.sampleRate*dur),buf=ctx.createBuffer(1,n,ctx.sampleRate),data=buf.getChannelData(0);
    for(let i=0;i<n;i++){
      const t=i/ctx.sampleRate;
      data[i]=(Math.random()*2-1)*0.35+Math.sin(2*Math.PI*190*t)*0.18+Math.sin(2*Math.PI*150*t)*0.1;
      data[i]*=Math.sin(Math.PI*i/n)*0.9;
    }
    const src=ctx.createBufferSource();src.buffer=buf;
    const g=ctx.createGain();g.gain.value=0.22;
    src.connect(g);g.connect(ctx.destination);src.start();
    setTimeout(()=>{try{src.stop();}catch(e){}},dur*1000);
  }catch(e){}
}
async function playVoiceMsg(id,sec,isMe){
  if(voicePlayingId!==null){const old=document.getElementById('vicon-'+voicePlayingId);if(old)old.classList.remove('playing');}
  if(voicePlayingId===id){voicePlayingId=null;stopVoiceAudio();return;}
  voicePlayingId=id;
  const icon=document.getElementById('vicon-'+id);if(icon)icon.classList.add('playing');
  const msgs=await dbGetAll('messages');const m=msgs.find(x=>x.id===id);
  if(isMe===false){m.unread=0;await dbPut('messages',m);}
  if(m&&m.audio){
    stopVoiceAudio();
    voiceAudioEl=new Audio(m.audio);
    voiceAudioEl.onended=()=>{voicePlayingId=null;const ic=document.getElementById('vicon-'+id);if(ic)ic.classList.remove('playing');};
    voiceAudioEl.play().catch(()=>{playSimVoice(sec||2);});
  }else playSimVoice(sec||2);
  setTimeout(()=>{if(voicePlayingId===id){voicePlayingId=null;if(icon)icon.classList.remove('playing');}},Math.max(800,(sec||2)*1000+300));
}
function stopVoiceAudio(){if(voiceAudioEl){try{voiceAudioEl.pause();}catch(e){}voiceAudioEl=null;}}
function appendEmojiPlus(body,fn){
  const d=document.createElement('div');
  d.className='emoji-item';d.style.border='1.5px dashed #d0d0cd';d.style.background='#fafafa';d.style.fontSize='20px';d.style.color='#b5b5b0';
  d.innerHTML='&#43;';
  d.onclick=fn;
  body.appendChild(d);
}
/* 表情面板：表情 / 表情包 / 拍一拍（三 tab，网格布局） */
let emojiOpen=false,emojiTab='emoji';
function toggleEmojiPanel(){
  const panel=document.getElementById('emoji-panel');
  if(!panel)return;
  // 与「+」面板互斥
  const more=document.getElementById('more-panel');
  if(more&&more.classList.contains('show')){more.classList.remove('show');document.getElementById('btn-plus')?.classList.remove('off');}
  emojiOpen=!emojiOpen;
  panel.classList.toggle('show',emojiOpen);
  document.getElementById('btn-emoji').classList.toggle('off',emojiOpen);
  if(emojiOpen){
    if(voiceMode)toggleVoiceMode();
    renderEmojiPanel();
  }
}
function closeEmojiPanel(){
  if(!emojiOpen)return;
  emojiOpen=false;
  const p=document.getElementById('emoji-panel');if(p)p.classList.remove('show');
  document.getElementById('btn-emoji')?.classList.remove('off');
}
function setEmojiTab(t){emojiTab=t;renderEmojiPanel();}
function renderEmojiPanel(){
  const tabs=document.getElementById('emoji-tabs'),body=document.getElementById('emoji-body');
  if(!tabs||!body)return;
  const list=[{id:'emoji',name:'表情'},{id:'sticker',name:'表情包'},{id:'poke',name:'拍一拍'}];
  tabs.innerHTML=list.map(t=>`<div class="etab${emojiTab===t.id?' on':''}" onclick="setEmojiTab('${t.id}')">${t.name}</div>`).join('');
  body.innerHTML='';
  if(emojiTab==='emoji'){
    // 分组小标签 + 当前组网格
    const gbar=document.createElement('div');
    gbar.className='emoji-groupbar';
    gbar.innerHTML=EMOJI_GROUPS.map((g,i)=>`<span class="egtab${emojiGroupTab===i?' on':''}" onclick="emojiGroupTab=${i};renderEmojiPanel()">${g.name}</span>`).join('');
    body.appendChild(gbar);
    const grid=document.createElement('div');
    grid.className='emoji-grid';
    EMOJI_GROUPS[emojiGroupTab].items.forEach(em=>{const d=document.createElement('div');d.className='ecell';d.textContent=em;d.onclick=()=>{insertText(em);};grid.appendChild(d);});
    body.appendChild(grid);
    return;
  }
  if(emojiTab==='sticker'){
    dbGetAll('emojis').then(list=>{
      if(!list.length){body.innerHTML='<div class="emoji-empty">还没有表情包<br>去「表情」页面上传</div>';return;}
      list.forEach(e=>{const d=document.createElement('div');d.className='sticker-cell';d.title=e.name||'';
        if(e.src)d.innerHTML=`<img src="${e.src}" alt="">`;else d.innerHTML=`<span class="stk-fallback">${esc((e.name||'?').slice(0,1))}</span>`;
        d.onclick=()=>sendMessageObject({type:'image',images:[e.src],content:e.src,sticker:1});
        body.appendChild(d);});
    });
    return;
  }
  // 拍一拍（内置小黄脸动作）
  POKE_ACTIONS.forEach(p=>{
    const d=document.createElement('div');d.className='ecell';d.style.fontSize='13px';d.style.fontWeight='600';d.textContent=p.name;
    d.onclick=()=>{pokeTa(p.action);};
    body.appendChild(d);
  });
}
function pokeTa(action){
  const name=state.other.name||'TA';
  sendMessageObject({type:'poke',content:action||'拍了拍'});
  showPokeToast(`你${action||'拍了拍'}"${name}"`);
  dbPut('messages',{sender:'sys',type:'text',content:`你${action||'拍了拍'}"${name}"`,time:Date.now()}).then(()=>{if(isAppVisible())renderChat(true);});
}
function insertText(s){
  const input=document.getElementById('chat-input');
  const p=input.selectionStart??input.value.length;
  input.value=input.value.slice(0,p)+s+input.value.slice(input.selectionEnd??p);
  input.focus();
  try{input.setSelectionRange(p+s.length,p+s.length);}catch(e){}
  autoGrow(input);syncInputBar();
}
function syncInputBar(){
  const input=document.getElementById('chat-input'),sendBtn=document.getElementById('send-btn'),
        plusBtn=document.getElementById('btn-plus'),emojiBtn=document.getElementById('btn-emoji');
  const v=input.value.trim();
  if(sendBtn)sendBtn.classList.toggle('show',!!v);
  if(plusBtn)plusBtn.classList.toggle('off',!!v);
  if(emojiBtn)emojiBtn.classList.toggle('off',!!v);
}
function chatPickImage(multi){
  const input=document.createElement('input');input.type='file';input.accept='image/*';if(multi)input.multiple=true;
  input.onchange=async e=>{
    const files=[...(e.target.files||[])].slice(0,9);
    if(!files.length)return;
    showToast(`正在压缩 ${files.length} 张图片…`);
    document.body.style.cursor='wait';
    try{
      const urls=[];
      for(const f of files)urls.push(await compressImage(f));
      await sendMsgObj({type:'image',images:urls,content:urls[0]});
      showToast('图片已发送（已自动压缩）');
    }catch(err){showToast('图片处理失败，请换一张');}
    document.body.style.cursor='';
  };
  input.click();
}
/* 聊天内「+」面板：从输入区向下展开（only 相册/视频通话/礼物/单选/多选/问卷） */
function showPlusMenu(){
  const more=document.getElementById('more-panel');
  const emojiP=document.getElementById('emoji-panel');
  if(!more)return;
  if(emojiP&&emojiP.classList.contains('show')){closeEmojiPanel();}
  const open=more.classList.contains('show');
  more.classList.toggle('show',!open);
  document.getElementById('btn-plus').classList.toggle('off',!open);
}
function chatPickMedia(){
  showModal('发送图片',`<div class="modal-item" onclick="closeModal();chatPickPhoto()">&#128247; 拍照</div><div class="modal-item" onclick="closeModal();chatPickImage(true)">&#128193; 从相册选择（可多选）</div>`,'<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button></div>');
}
function chatPickPhoto(){
  const input=document.createElement('input');input.type='file';input.accept='image/*';input.capture='environment';
  input.onchange=async e=>{
    const f=e.target.files&&e.target.files[0];if(!f)return;
    try{const url=await compressImage(f);await sendMsgObj({type:'image',images:[url],content:url});showToast('照片已发送');}catch(err){showToast('照片处理失败');}
  };
  input.click();
}
/* v3.6.7 礼物：内置 21 个 + 自定义（名称+图标，emoji 或压缩图片，可保存/删除） */
function giftPool(){
  const custom=Array.isArray(state.customGifts)?state.customGifts:[];
  return GIFTS.map((icon,i)=>({name:GIFT_NAMES[i],icon,builtin:true})).concat(custom.map(g=>({name:g.name,icon:g.icon||'🎁',builtin:false,id:g.id})));
}
function giftIconHtml(icon){
  if(!icon)return '🎁';
  if(icon.indexOf('<svg')===0||icon.indexOf('<img')===0)return icon;
  if(icon.indexOf('data:')===0||icon.indexOf('http')===0)return '<img src="'+icon+'" style="width:100%;height:100%;object-fit:cover">';
  return icon;
}
function sendGift(){
  const pool=giftPool();
  const cell=(g)=>`<div class="plus-item" style="padding:14px 0;position:relative" onclick="closeModal();doSendGift('${esc(g.name).replace(/'/g,"\\'")}','${esc(g.icon).replace(/'/g,"\\'")}')">
    ${!g.builtin?'<span style="position:absolute;top:2px;right:8px;font-size:11px;color:#c0392b;cursor:pointer" onclick="event.stopPropagation();delCustomGift('+g.id+')">&#10005;</span>':''}
    <div style="width:46px;height:46px;border-radius:14px;background:var(--input);display:flex;align-items:center;justify-content:center;font-size:26px;overflow:hidden">${giftIconHtml(g.icon)}</div>
    <div class="plus-label">${esc(g.name)}</div>
  </div>`;
  const grid='<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:8px 2px">'
    +pool.map(g=>cell(g)).join('')
    +'<div class="plus-item" style="padding:14px 0" onclick="addCustomGift()"><div style="width:46px;height:46px;border-radius:14px;background:var(--input);display:flex;align-items:center;justify-content:center;font-size:22px;color:var(--accent,#4a7dcf)">＋</div><div class="plus-label">自定义</div></div>'
    +'</div>';
  showModal('送礼物',grid,'<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button></div>');
}
function doSendGift(name,icon){
  sendMessageObject({type:'gift',content:name,sub:icon||'🎁'});
  showToast('你的心意已送达');
}
let _cgImg='';
function addCustomGift(){
  showModal('自定义礼物',
    `<div style="font-size:12px;color:var(--hint);margin-bottom:4px">名称</div>
     <input class="textarea-full" id="cg-name" style="min-height:0;padding:9px 10px" placeholder="如：手写信">
     <div style="font-size:12px;color:var(--hint);margin:10px 0 4px">图标</div>
     <input class="textarea-full" id="cg-emoji" style="min-height:0;padding:9px 10px" placeholder="输入一个 emoji，如：🎁">
     <button class="modal-btn" style="width:100%;margin-top:8px" onclick="cgPickImage()">上传图片作为图标（自动压缩适配）</button>
     <div style="font-size:11px;color:var(--hint);margin-top:8px">自定义礼物保存在本地，重启不丢；删除：在礼物弹窗里点右上角 ×。</div>`,
    '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button><button class="modal-btn primary" onclick="cgSave()">保存</button></div>');
}
function cgPickImage(){
  const input=document.createElement('input');input.type='file';input.accept='image/*';
  input.onchange=async e=>{
    const f=e.target.files&&e.target.files[0];if(!f)return;
    try{_cgImg=await compressImage(f);showToast('图片已压缩处理，可保存');}catch(err){showToast('图片处理失败');}
  };
  input.click();
}
function cgSave(){
  const name=(document.getElementById('cg-name')||{}).value||'';
  const emoji=(document.getElementById('cg-emoji')||{}).value||'';
  if(!name.trim()){showToast('请填写名称');return;}
  state.customGifts=state.customGifts||[];
  if(state.customGifts.length>=30){showToast('自定义礼物最多 30 个');return;}
  state.customGifts.push({id:Date.now(),name:name.trim(),icon:_cgImg||emoji.trim()||'🎁'});
  saveKey('customGifts');
  _cgImg='';closeModal();sendGift();showToast('自定义礼物已保存');
}
function delCustomGift(id){
  state.customGifts=(state.customGifts||[]).filter(g=>g.id!==id);
  saveKey('customGifts');sendGift();
}

/* 拍一拍：独立字库 / 分组 / 批量管理 / 随机触发 */
function ensurePokeGroups(){
  if(!state.stats)state.stats={};
  if(!state.stats.pokeGroups){
    state.stats.pokeGroups={'默认':Array.isArray(state.stats.pokes)?state.stats.pokes.slice():['😊 戳了戳你','🥺 蹭了蹭你','😌 摸了摸你的头','🥰 抱了抱你','😤 捏了捏你的脸','😴 靠在了你肩上','😏 朝你挑了挑眉','😭 晃了晃你的胳膊','😘 朝你比了个心','🤔 歪头看你']};
    state.stats.pokeGroup='默认'; saveKey('stats');
  }
  if(!state.stats.pokeGroup||!state.stats.pokeGroups[state.stats.pokeGroup])state.stats.pokeGroup=Object.keys(state.stats.pokeGroups)[0]||'默认';
}
function allPokeTexts(){ensurePokeGroups();return Object.values(state.stats.pokeGroups).flat().filter(Boolean);}
function showPokeToast(text){const t=document.getElementById('poke-toast');if(!t)return;t.textContent=text;t.classList.add('show');clearTimeout(showPokeToast._t);showPokeToast._t=setTimeout(()=>t.classList.remove('show'),2200);}
function editMyPoke(){
  ensurePokeGroups();
  const nm=state.me.name||'我';
  appPrompt('我的拍一拍',nm+(state.stats.myPoke||'拍了拍'+state.other.name+'的肩膀'),t=>{
    const v=(t||'').trim();
    if(v!==null&&v!==undefined&&v!==''){
      state.stats.myPoke=v.replace(new RegExp('^'+nm.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),'').replace(/^我/,'');
      saveKey('stats');renderChatInfo();showToast('已更新（发送时显示：'+nm+state.stats.myPoke+'「'+state.other.name+'」）');
    }
    return false;
  });
}
function pokeChat(){
  const name=state.other.name;
  const nm=state.me.name||'我';
  ensurePokeGroups();
  const myPoke=state.stats.myPoke||'拍了拍'+name+'的肩膀';
  showPokeToast(`${nm}${myPoke}「${name}」`); dbPut('messages',{sender:'sys',type:'text',content:`${nm}${myPoke}「${name}」`,time:Date.now()}).then(()=>{if(isAppVisible())renderChat(true);});
  if(Math.random()<0.6)setTimeout(()=>{showPokeToast(`「${name}」拍了拍你`);dbPut('messages',{sender:'sys',type:'text',content:`「${name}」拍了拍你`,time:Date.now()}).then(()=>{if(isAppVisible())renderChat(true);});},1000+Math.random()*1300);
}
let pokeManageGroup='默认';
function managePokes(){
  ensurePokeGroups(); pokeManageGroup=state.stats.pokeGroup||Object.keys(state.stats.pokeGroups)[0]||'默认';
  renderPokeManager();
}
function renderPokeManager(){
  ensurePokeGroups(); const groups=Object.keys(state.stats.pokeGroups); if(!groups.includes(pokeManageGroup))pokeManageGroup=groups[0]||'默认';
  const list=state.stats.pokeGroups[pokeManageGroup]||[];
  showModal('拍一拍字卡',`<div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:8px">${groups.map(g=>`<button class="tab${g===pokeManageGroup?' active':''}" style="white-space:nowrap" onclick="pokeManageGroup='${esc(g)}';state.stats.pokeGroup='${esc(g)}';saveKey('stats');renderPokeManager()">${esc(g)}</button>`).join('')}<button class="tab" onclick="closeModal();addPokeGroup()">＋ 分组</button></div><div style="display:flex;justify-content:space-between;align-items:center;margin:4px 0 8px"><span style="font-size:11px;color:var(--hint)">${list.length} 条 · 回复时随机触发</span><span style="font-size:12px;color:var(--sub);cursor:pointer" onclick="closeModal();renamePokeGroup()">重命名</span></div>${list.length?list.map((p,i)=>`<div style="display:flex;align-items:center;gap:8px;padding:10px 4px;border-bottom:1px solid var(--input)"><span style="flex:1;font-size:14px">${esc(p)}</span><span style="cursor:pointer;padding:4px" onclick="closeModal();editPoke(${i})">✎</span><span style="cursor:pointer;padding:4px;color:#c0392b" onclick="closeModal();delPoke(${i})">✕</span></div>`).join(''):'<div class="empty" style="padding:25px 0">当前分组还没有拍一拍字卡</div>'}<div style="font-size:11px;color:var(--hint);margin-top:8px">支持一行一条批量添加，自动查重。</div><button class="btn-pill ghost" style="width:100%;margin-top:12px" onclick="closeModal();addPoke()">＋ 新增拍一拍</button><button class="btn-pill ghost" style="width:100%;margin-top:8px" onclick="closeModal();bulkAddPokes()">批量添加</button>`);
}
function addPokeGroup(){appPrompt('新建拍一拍分组','',v=>{const n=(v||'').trim();if(!n)return false;ensurePokeGroups();if(state.stats.pokeGroups[n]){showToast('分组已存在');return false;}state.stats.pokeGroups[n]=[];state.stats.pokeGroup=n;saveKey('stats');pokeManageGroup=n;managePokes();});}
function renamePokeGroup(){ensurePokeGroups();const old=pokeManageGroup;appPrompt('重命名分组',old,v=>{const n=(v||'').trim();if(!n||n===old)return false;if(state.stats.pokeGroups[n]){showToast('分组已存在');return false;}state.stats.pokeGroups[n]=state.stats.pokeGroups[old]||[];delete state.stats.pokeGroups[old];state.stats.pokeGroup=n;saveKey('stats');pokeManageGroup=n;managePokes();});}
function addPoke(){ensurePokeGroups();appPrompt('新增拍一拍','',v=>{const t=(v||'').trim();if(!t)return false;const arr=state.stats.pokeGroups[pokeManageGroup]||[];if(arr.includes(t)){showToast('已存在相同字卡');return false;}arr.push(t);state.stats.pokeGroups[pokeManageGroup]=arr;saveKey('stats');showToast('已添加');managePokes();});}
function bulkAddPokes(){ensurePokeGroups();appPrompt('批量添加拍一拍（每行一条，自动查重）','',v=>{const lines=(v||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);if(!lines.length)return false;const arr=state.stats.pokeGroups[pokeManageGroup]||[];const set=new Set(allPokeTexts());let add=0;for(const x of lines){if(!set.has(x)){set.add(x);arr.push(x);add++;}}state.stats.pokeGroups[pokeManageGroup]=arr;saveKey('stats');showToast(`已添加 ${add} 条，重复内容已跳过`);managePokes();});}
function editPoke(i){ensurePokeGroups();const arr=state.stats.pokeGroups[pokeManageGroup]||[];appPrompt('修改拍一拍',arr[i],v=>{const t=(v||'').trim();if(!t)return false;if(arr.some((x,j)=>j!==i&&x===t)){showToast('已存在相同字卡');return false;}arr[i]=t;saveKey('stats');managePokes();});}
function delPoke(i){ensurePokeGroups();const arr=state.stats.pokeGroups[pokeManageGroup]||[];arr.splice(i,1);saveKey('stats');managePokes();}

function clearChat(){
  appConfirm('清除聊天记录','确定清空所有聊天记录吗？此操作不可恢复。',async()=>{
    const all=await dbGetAll('messages');
    for(const m of all)await dbDelete('messages',m.id);
    state.chat.lastReadAt=Date.now();saveKey('chat');
    chatFirstPaint=true;renderChat(true);showToast('聊天记录已清空');
  });
}
function requestUnmute(){if(Date.now()>=state.muteEndTime)return;state.muteRequest={status:'pending',time:Date.now()};saveKey('muteRequest');showToast('已发送解除申请');showMuteBanner(Math.ceil((state.muteEndTime-Date.now())/1000));}
function agreeUnmute(){if(Date.now()>=state.muteEndTime)return;state.muteEndTime=0;state.muteRequest=null;saveKey('muteEndTime');saveKey('muteRequest');if(muteBannerInterval)clearInterval(muteBannerInterval);document.getElementById('mute-banner').classList.remove('show');pushSys('对方同意了你的解除申请，禁言已解除');showToast('对方同意解除禁言');renderChat();}
function rejectUnmute(){if(!state.muteRequest||Date.now()>=state.muteEndTime)return;state.muteRequest={status:'rejected',time:Date.now()};saveKey('muteRequest');showToast('对方拒绝了解除申请');showMuteBanner(Math.ceil((state.muteEndTime-Date.now())/1000));}
function showMuteBanner(sec){
  const banner=document.getElementById('mute-banner');banner.classList.add('show');
  if(muteBannerInterval)clearInterval(muteBannerInterval);
  const refresh=()=>{
    const remain=Math.ceil((state.muteEndTime-Date.now())/1000);
    const text=document.getElementById('mute-text');const actions=document.getElementById('mute-actions');
    if(remain<=0){clearInterval(muteBannerInterval);state.muteRequest=null;saveKey('muteRequest');banner.classList.remove('show');return;}
    if(state.muteRequest&&state.muteRequest.status==='pending'){text.textContent='已申请解除禁言，等待对方同意';actions.innerHTML='<span class="mute-mini agree" onclick="agreeUnmute()">同意解除</span><span class="mute-mini" onclick="rejectUnmute()">拒绝</span>';}
    else if(state.muteRequest&&state.muteRequest.status==='rejected'){text.textContent=`对方拒绝了解除申请，禁言继续，剩余 ${remain} 秒`;actions.innerHTML='<span class="mute-mini" onclick="requestUnmute()">再次申请</span>';}
    else{text.innerHTML=`对方已被禁言，剩余 <b>${remain}</b> 秒`;actions.innerHTML='<span class="mute-mini" onclick="requestUnmute()">申请解除</span>';}
  };
  refresh();muteBannerInterval=setInterval(refresh,1000);
}
async function pushSys(text){const m={sender:'sys',type:'text',content:text,time:Date.now()};m.id=await dbPut('messages',m);if(isAppVisible())appendMsgRow(m,true);}            // TA 禁言时长（10 分钟）   // 两次 TA 禁言的最小冷却（40 分钟）
/* v3.6.0：禁言原因文案池随机抽取 */
function pickMuteReason(){
  return MUTE_REASONS[Math.floor(Math.random()*MUTE_REASONS.length)];
}
function maybeTaMuteMe(){
  if(state.taMuteMeEndTime>Date.now())return;          // 正在被禁言中
  if(Date.now()-state.taMuteLastEnd<TA_MUTE_COOLDOWN_MS)return;
  if(state.taMuteCycleSkip){                           // v3.6.0 跳过层：本周期 TA 不想这样 → 重新进冷却（间隔自然翻倍，恢复"偶尔"感）
    state.taMuteCycleSkip=false;
    state.taMuteLastEnd=Date.now();
    saveKey('taMuteMeEndTime');saveKey('taMuteCycleSkip');
    return;
  }
  if(Math.random()<0.03){
    state.taMuteMeEndTime=Date.now()+TA_MUTE_MS;
    state.taMuteLastEnd=state.taMuteMeEndTime;
    state.taMuteReqAt=0;
    state.taMuteReason=pickMuteReason();
    // v3.6.0：禁言同步 TA 状态——随机切一个非在线状态（职业/生活），保持与禁言同长，到期由状态机自动回在线
    if(typeof statusPool==='function'){
      const pool=statusPool().filter(x=>x.s!=='在线');
      if(pool.length){
        const st=pool[Math.floor(Math.random()*pool.length)];
        state.taStatus=st.s;state.other.status=st.s;
        state.taStatusUntil=state.taMuteMeEndTime;
        saveKey('other');saveKey('taStatusUntil');
        if(typeof updateTaStatusBadge==='function')updateTaStatusBadge();
      }
    }
    state.taMuteCycleSkip=Math.random()<0.6;           // v3.6.0：下一周期 60% 跳过（TA 低频、不粘人）
    saveKey('taMuteMeEndTime');saveKey('taMuteCycleSkip');
    pushSys('对方暂时不想理你…（'+state.taMuteReason+'）');
    showTaMuteBanner();
    updateChatSubtitle();
  }
}
function showTaMuteBanner(){
  const b=document.getElementById('ta-mute-banner');
  if(!b)return;
  b.classList.add('show');
  const refresh=()=>{
    const remain=Math.ceil((state.taMuteMeEndTime-Date.now())/1000);
    if(remain<=0){
      b.classList.remove('show');
      if(state.taMuteReqAt){state.taMuteReqAt=0;saveKey('taMuteMeEndTime');pushSys('对方愿意理你了，禁言解除');}
      syncInputDisabled();
      updateChatSubtitle();
      return;
    }
    const txt=document.getElementById('ta-mute-text');
    const act=document.getElementById('ta-mute-actions');
    // v3.5.1：验证码式 60 秒冷却——申请后按钮进入动态倒计时，归零才能再次申请
    const cool=Math.ceil(60-(Date.now()-(state.taMuteReqCoolAt||0))/1000);
    txt.innerHTML=`对方暂时不想理你（${esc(state.taMuteReason||'TA 需要一点空间')}），剩余 <b>${remain}</b> 秒`;
    if(cool>0){
      act.innerHTML=`<span class="mute-mini" style="opacity:.45;pointer-events:none">${cool} 秒后可再次申请</span>`;
    }else{
      act.innerHTML='<span class="mute-mini" onclick="requestTaUnmute()">申请解除</span>';
    }
  };
  refresh();
  if(showTaMuteBanner._iv)clearInterval(showTaMuteBanner._iv);
  showTaMuteBanner._iv=setInterval(refresh,1000);
  syncInputDisabled();
}
function requestTaUnmute(){
  if(state.taMuteMeEndTime<=Date.now())return;
  // v3.5.1：60 秒验证码式冷却，冷却中不可再申请
  const cool=Math.ceil(60-(Date.now()-(state.taMuteReqCoolAt||0))/1000);
  if(cool>0){showToast(`请等 ${cool} 秒后再申请`);return;}
  state.taMuteReqCoolAt=Date.now();
  state.taMuteReqAt=Date.now();
  saveKey('taMuteMeEndTime');saveKey('taMuteReqCoolAt');
  showToast('已申请解除，等 TA 缓一缓');
  showTaMuteBanner();
}
function syncInputDisabled(){
  const inp=document.getElementById('chat-input');
  const sendBtn=document.getElementById('send-btn');
  const muted=state.taMuteMeEndTime>Date.now();
  if(inp){inp.disabled=muted;inp.placeholder=muted?'对方暂时不想理你…':'发消息…';}
  if(sendBtn)sendBtn.style.display=(muted||!inp||!inp.value.trim())?'none':'block';
}
async function pushReply(text){
  const msg={sender:'other',type:'text',content:text,time:Date.now(),read:false};
  if(typeof touchInteract==='function')touchInteract();   // v3.6.0：TA 回复 → 连接频率上升
  msg.id=await dbPut('messages',msg);
  // 增量追加：不在聊天页时才弹 Toast + 角标 + 系统通知
  if(isAppVisible())appendMsgRow(msg,true);
  else{showToast(`${state.other.name}：${text}`);updateTabBadge('chat',1);notifySystem(`${state.other.name} 发来消息`,text,()=>openApp('chat'));}
}
/* 单条消息原地重绘（题目被作答后刷新气泡，不整屏重绘） */
async function refreshMsgRow(id){
  const row=document.querySelector(`.msg-row[data-mid="${id}"]`);
  if(!row)return;
  const m=await dbGet('messages',id);
  if(!m)return;
  const fresh=buildMsgRow(m);
  if(row.parentNode)row.parentNode.replaceChild(fresh,row);
}
window.refreshMsgRow=refreshMsgRow;   // engine.js 回填「题目已作答」时原地重绘该气泡
async function markRead(){
  const msgs=await dbGetAll('messages');
  const changed=msgs.filter(m=>m.sender==='other'&&!m.read);
  for(const m of changed){m.read=true;await dbPut('messages',m);}
  if(changed.length&&isAppVisible())renderChat();
  refreshAllBadges();
}

/* ===== 聊天信息（右上角 ⋮ → 聊天信息） ===== */
function renderChatInfo(){
  const body=document.getElementById('chatinfo-body');
  const bg=state.chat.chatBg||state.skin.chatBg;
  body.innerHTML=`
    <div class="cs-hero">
      <div class="cs-avatar">${avatarHtml('other')}</div>
      <div style="flex:1;min-width:0">
        <div class="cs-hero-name">${esc(state.other.name)}</div>
        <div class="cs-hero-sub">${esc(state.other.status||'在线')}${state.meetTime?' · 相伴 '+Math.floor((Date.now()-state.meetTime)/86400000)+' 天':''}</div>
      </div>
    </div>
    <div class="cs-group">
      <div class="cs-item" onclick="openApp('chatsearch')"><span class="cs-ico">&#128269;</span><span class="cs-label">聊天记录</span><span class="cs-arrow">&#8250;</span></div>
    </div>
    <div class="cs-group">
      <div class="cs-item" onclick="toggleChatQuote()"><span class="cs-ico">&#128172;</span><span class="cs-label">允许引用</span><span class="cs-switch${state.chat.showQuote!==0?' on':''}" onclick="event.stopPropagation();toggleChatQuote()"></span></div>
      <div class="cs-item" onclick="toggleAllowRecall()"><span class="cs-ico">&#8617;</span><span class="cs-label">允许撤回</span><span class="cs-val" style="font-size:11px;color:var(--hint)">2 分钟内可撤回</span><span class="cs-switch${state.chat.allowRecall!==false?' on':''}" onclick="event.stopPropagation();toggleAllowRecall()"></span></div>
    </div>
    <div class="cs-group">
      <div class="cs-item" onclick="editMyPoke()"><span class="cs-ico">&#128072;</span><span class="cs-label">我的拍一拍</span><span class="cs-val" style="font-size:11px;color:var(--hint)">${esc(state.stats.myPoke||'拍了拍TA的肩膀')}</span><span class="cs-arrow">&#8250;</span></div>
      <div class="cs-item" onclick="managePokes()"><span class="cs-ico">&#128073;</span><span class="cs-label">TA 拍我</span><span class="cs-val" style="font-size:11px;color:var(--hint)">${(allPokeTexts()||[]).length} 条动作</span><span class="cs-arrow">&#8250;</span></div>
    </div>
    <div class="cs-group">
      <div class="cs-item" onclick="muteOther()"><span class="cs-ico">&#128263;</span><span class="cs-label">禁言 TA</span>${Date.now()<state.muteEndTime?`<span class="cs-val">剩 ${Math.ceil((state.muteEndTime-Date.now())/1000)}s</span>`:''}<span class="cs-arrow">&#8250;</span></div>
    </div>
    <div class="cs-group">
      <div class="cs-item" onclick="clearChat()" style="color:#c0392b"><span class="cs-ico">&#128465;</span><span class="cs-label">清空聊天记录</span></div>
    </div>`;
}
function toggleChatQuote(){state.chat.showQuote=state.chat.showQuote===0?1:0;saveKey('chat');renderChatInfo();showToast(state.chat.showQuote?'已开启引用':'已关闭引用');}
function toggleAllowRecall(){state.chat.allowRecall=state.chat.allowRecall===false?true:false;saveKey('chat');renderChatInfo();showToast(state.chat.allowRecall?'已开启撤回':'已关闭撤回');}
/* 禁言 TA：输入分钟，可自动解除 */
function muteOther(){
  showModal('禁言 TA',`<div style="padding:4px 2px 10px;font-size:13px;color:var(--sub)">禁言期间 TA 不会回复、不会主动发消息；到时间自动解除。</div>
    <input class="app-input" id="mute-min" type="number" min="1" max="1440" placeholder="禁言时长（分钟）" style="width:100%;text-align:center;font-size:18px;margin-bottom:12px">
    <button class="btn-pill primary" style="width:100%" onclick="doMuteOther()">开始禁言</button>`);
}
function doMuteOther(){
  const min=parseInt((document.getElementById('mute-min')||{}).value||'0',10);
  if(!min||min<1){showToast('请输入至少 1 分钟');return;}
  state.muteEndTime=Date.now()+min*60000;
  saveKey('muteEndTime');
  closeModal();
  showMuteBanner(min*60);
  renderChatInfo();
  showToast(`已禁言 TA ${min} 分钟`);
}
function applyChatBg(){
  const el=document.getElementById('chat-content');if(!el)return;
  const bg=state.chat.chatBg||state.skin.chatBg;
  el.style.backgroundImage=bg?`url(${bg})`:'';
  el.style.backgroundSize=bg?'cover':'';
  el.style.backgroundPosition='center';
}

/* ===== 聊天记录搜索 ===== */
/* 索引页（方案 §3）：未输入关键词时，只显示 TA 的消息索引（日期分组+时间+内容，点击定位高亮）；输入关键词后搜索全部记录 */
function renderChatSearch(){
  const box=document.getElementById('chat-search-result');
  const input=document.getElementById('chat-search-input');
  const q=(input?input.value:'').trim();
  dbGetAll('messages').then(all=>{
    let list=all.filter(m=>!m.recalled).sort((a,b)=>b.time-a.time);
    if(!q)list=list.filter(m=>m.sender==='other');   // 索引：只有 TA 的信息
    if(q)list=list.filter(m=>m.sender==='other'&&(msgPreviewText(m).toLowerCase().includes(q.toLowerCase())||(m.content||'').toLowerCase().includes(q.toLowerCase())));
    const dates=[...new Set(list.map(m=>fmtChatDate(m.time)))];
    if(!list.length){box.innerHTML=q?'<div class="empty">没有匹配的记录</div>':'<div class="empty">TA 还没有发过消息</div>';return;}
    box.innerHTML=`<div class="cs-group"><div class="cs-item" style="cursor:default"><span class="cs-ico">&#128197;</span><span class="cs-label">${q?'搜索到 ':''}${list.length} 条${q?'记录':'TA 的消息'}</span></div></div>`
      +dates.map(d=>{
        const day=list.filter(m=>fmtChatDate(m.time)===d);
        return `<div class="chat-date" style="margin:16px auto">${d} · ${day.length} 条</div>`
          +day.map(m=>`<div class="search-result" onclick="goSearchMsg(${m.id})">
              <div class="sr-sender">${esc(who(m.sender))}${m.sender==='me'?'（我）':''}${m.type==='text'?'':`<span style="color:var(--hint)"> · ${TYPE_LABEL[m.type]||''}</span>`}</div>
              <div class="sr-text">${esc(msgPreviewText(m)||'（空）')}</div>
              <div class="sr-time">${fmtChatTimeSec(m.time)}</div></div>`).join('');
      }).join('');
  });
}
function goSearchMsg(id){saveScrollTop();navStack=['chat'];navRoot='chat';renderNav();enterPage('chat');setTimeout(()=>{chatFirstPaint=false;chatPageSize=99999;renderChat(false).then(()=>jumpToMsg(id));},120);}
function onChatSearch(q){
  const box=document.getElementById('chat-search-result');
  q=(q||'').trim();
  if(!q){renderChatSearch();return;}
  dbGetAll('messages').then(all=>{
    // 搜索结果只来自 TA（§56）
    const list=all.filter(m=>m.sender==='other'&&!m.recalled&&msgPreviewText(m).toLowerCase().includes(q.toLowerCase())).sort((a,b)=>b.time-a.time);
    if(!list.length){box.innerHTML='<div class="empty">没有找到 TA 的相关消息</div>';return;}
    box.innerHTML=`<div class="cs-group"><div class="cs-item" style="cursor:default"><span class="cs-ico">&#128269;</span><span class="cs-label">${list.length} 条结果</span></div></div>`
      +list.map(m=>{
        const t=msgPreviewText(m);
        const i=t.toLowerCase().indexOf(q.toLowerCase());
        const html=i>=0?esc(t.slice(0,i))+'<mark>'+esc(t.slice(i,i+q.length))+'</mark>'+esc(t.slice(i+q.length)):esc(t);
        return `<div class="search-result" onclick="goSearchMsg(${m.id})">
          <div class="sr-sender">${esc(who(m.sender))} · ${fmtFull(m.time)}</div>
          <div class="sr-text">${html}</div></div>`;
      }).join('');
  });
}
/* 记录已读位置（用于「以下为新消息」分割线） */
let lastReadTimer=null;
function saveLastRead(){
  clearTimeout(lastReadTimer);
  lastReadTimer=setTimeout(()=>{
    if(!isAppVisible())return;
    const msgs=dbGetAll('messages');
    msgs.then(all=>{
      if(!all.length)return;
      const max=all[all.length-1].time;
      if(max>(state.chat.lastReadAt||0)){state.chat.lastReadAt=max;saveKey('chat');}
    });
  },400);
}
