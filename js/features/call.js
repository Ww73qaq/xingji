/* =========================================================
   星迹 · 语音与视频通话（来电 / 去电 / 铃声 / 摄像头 / 悬浮窗）
   ========================================================= */

/* v3.6.3 线性 SVG 图标（微信风格，描边 1.8，24px） */
const IC_MUTE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Z"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/><path d="m4 4 16 16"/></svg>';
const IC_SPEAKER='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16 8a4 4 0 0 1 0 8M18.5 5.5a8 8 0 0 1 0 13"/></svg>';
const IC_CAM='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6.5" width="13" height="11" rx="2.2"/><path d="m16 10.5 5-2.8v8.6l-5-2.8"/></svg>';
const IC_PHONE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.13.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.45c.9.34 1.84.57 2.8.7A2 2 0 0 1 22 16.9Z"/></svg>';
const IC_MIN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14v6h6M20 10V4h-6"/></svg>';
const IC_KEYPAD='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/><circle cx="10" cy="10" r=".5"/><circle cx="14" cy="10" r=".5"/><circle cx="10" cy="14" r=".5"/><circle cx="14" cy="14" r=".5"/></svg>';

/* ===== 视频通话：本地摄像头 + 模拟远端（无真实 WebRTC） ===== */
let callKind='voice',camOn=false;
function openVideoCall(){
  if(state.callActive){showToast('当前正在通话中');return;}
  callOutgoing('video');
}
function toggleCamera(){
  camOn=!camOn;
  const v=document.getElementById('cv-local'),ph=document.getElementById('cv-local-ph');
  if(camOn){
    startLocalCamera();
  }else{
    if(mediaStream)mediaStream.getVideoTracks().forEach(t=>t.stop());
    if(v){v.style.display='none';}
    if(ph)ph.style.display='flex';
  }
  renderCallActions(callActionsHtml());
}
async function startLocalCamera(){
  const v=document.getElementById('cv-local'),ph=document.getElementById('cv-local-ph');
  if(!v||!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){showToast('当前环境不支持摄像头');return;}
  try{
    if(!mediaStream)mediaStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:true});
    else{const tr=mediaStream.getVideoTracks()[0];if(tr)tr.enabled=true;}
    v.srcObject=mediaStream;
    v.style.display='block';
    if(ph)ph.style.display='none';
  }catch(e){showToast('无法打开摄像头（可能被拒绝）');camOn=false;renderCallActions(callActionsHtml());}
}
function showVideoStage(){
  const box=document.getElementById('call-video');if(!box)return;
  box.style.display='flex';
  const av=document.getElementById('call-avatar'),nm=document.getElementById('call-name'),st=document.getElementById('call-status');
  if(av)av.style.display='none';if(nm)nm.style.display='none';if(st)st.style.display='none';
  if(camOn)startLocalCamera();
}

/* ===== CALL（手机通话：来电 / 去电 / 通话中 / 通话记录） ===== */
let callSec=0,callIv=null,callMode=null,callMuted=false,callSpeaker=false,ringIv=null,ringOsc=null,callTalkTimer=null;
function showCallOverlay(){
  const ov=document.getElementById('call-overlay');
  ov.classList.add('active');
  document.getElementById('call-name').textContent=state.other.name;
  const av=document.getElementById('call-avatar');
  if(state.other.avatar){av.innerHTML=`<img src="${state.other.avatar}">`;av.classList.remove('ringing');}
  else{av.textContent=state.other.name.charAt(0)||'TA';av.classList.add('ringing');}
  document.getElementById('edge-back').classList.remove('on');
}function hideCallOverlay(){document.getElementById('call-overlay').classList.remove('active');}
function setCallStatus(html){document.getElementById('call-status').innerHTML=html;}
function renderCallActions(html){document.getElementById('call-actions').innerHTML=html;}
function setCallBadge(txt,rec){
  const b=document.getElementById('call-badge');
  b.textContent=txt;b.classList.toggle('rec',!!rec);
}
/* Web Audio 铃声 */
function startRing(){
  try{
    if(!voiceAudioCtx)voiceAudioCtx=new (window.AudioContext||window.webkitAudioContext)();
    const ctx=voiceAudioCtx;
    const tick=()=>{
      if(!state.callActive)return;
      const o=ctx.createOscillator(),g=ctx.createGain();
      o.type='sine';o.frequency.setValueAtTime(660,ctx.currentTime);
      o.frequency.linearRampToValueAtTime(520,ctx.currentTime+.35);
      g.gain.setValueAtTime(0,ctx.currentTime);
      g.gain.linearRampToValueAtTime(.14,ctx.currentTime+.04);
      g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.4);
      o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+.45);
    };
    tick();ringIv=setInterval(tick,2200);
  }catch(e){}
}
function stopRing(){if(ringIv){clearInterval(ringIv);ringIv=null;}}
/* 来电（TA 主动打来） */
function simulateIncomingCall(kind){
  if(state.callActive){showToast('当前正在通话中');return;}
  callMode='in';callKind=kind||'voice';state.callActive=true;callSec=0;callMuted=false;callSpeaker=false;camOn=(callKind==='video');
  showCallOverlay();
  setCallBadge('星迹',true);
  setCallStatus(`${state.other.name} 正在呼叫…<br><span style="opacity:.6;font-size:12px">${CALL_BG[Math.floor(Math.random()*CALL_BG.length)]}</span>`);
  renderCallActions(
    '<div class="call-row">'
    +'<div class="call-col"><button class="call-btn" onclick="toggleMute()">'+IC_MUTE+'</button><span class="call-btn-label">静音</span></div>'
    +'<div class="call-col"><button class="call-btn" onclick="showToast(\'暂不支持\')">'+IC_KEYPAD+'</button><span class="call-btn-label">键盘</span></div>'
    +'</div>'
    +'<div class="call-row">'
    +'<div class="call-col"><button class="call-btn end" onclick="declineCall()">'+IC_PHONE+'</button><span class="call-btn-label">拒绝</span></div>'
    +'<div class="call-col"><button class="call-btn answer" onclick="answerCall()">'+IC_PHONE+'</button><span class="call-btn-label">接听</span></div>'
    +'</div>');
  startRing();
  if(navigator.vibrate)navigator.vibrate([400,200,400]);
  callIv=setTimeout(()=>{ if(!state.callActive)return; endCall('miss-in'); showToast(`${state.other.name} 的来电未接听`); },30000);
}
/* v3.5.9：TA 主动来电调度（借鉴 mochi 概率模型，挂心跳每 5 秒检测一次）
   规则：通话中 / 被禁言 / 距上次来电 30 分钟冷却内不触发；
   每 5 秒 1% 概率触发；60% 视频来电 / 40% 语音来电 */
const TA_CALL_COOLDOWN_MS=30*60000;
function maybeTaCall(){
  if(state.callActive)return;
  if(Date.now()<state.muteEndTime||Date.now()<state.taMuteMeEndTime)return;
  const last=Number(state.stats.taCallLastAt)||0;
  if(last&&Date.now()-last<TA_CALL_COOLDOWN_MS)return;
  if(state.taCallCycleSkip){                           // v3.6.0 跳过层：本周期 TA 不打 → 重新进冷却（TA 医生、不粘人，需要时才会来）
    state.taCallCycleSkip=false;
    state.stats.taCallLastAt=Date.now();saveKey('stats');
    return;
  }
  if(Math.random()<0.01){
    state.stats.taCallLastAt=Date.now();saveKey('stats');
    state.taCallCycleSkip=Math.random()<0.6;           // 下一周期 60% 跳过
    saveKey('stats');
    simulateIncomingCall(Math.random()<0.6?'video':'voice');
  }
}
/* 去电 */
function callOutgoing(kind){
  if(state.callActive){showToast('当前正在通话中');return;}
  callMode='out';callKind=kind||'voice';state.callActive=true;callSec=0;callMuted=false;callSpeaker=false;camOn=(kind==='video');
  showCallOverlay();
  setCallBadge(kind==='video'?'视频通话':'语音通话',false);
  setCallStatus('正在呼叫…');
  renderCallActions('<div class="call-row"><div class="call-col"><button class="call-btn end" onclick="cancelOutgoing()">'+IC_PHONE+'</button><span class="call-btn-label">取消</span></div></div>');
  const t=setTimeout(()=>{
    if(!state.callActive)return;
    if(Math.random()<0.72)startCall();
    else{setCallStatus('对方未接听');setTimeout(()=>{if(state.callActive)endCall('miss-out');},1400);}
  },2600);
  callIv=t;
}
function declineCall(){
  if(!state.callActive)return;
  clearTimeout(callIv);stopRing();
  setCallStatus('已拒绝');
  setTimeout(()=>{if(state.callActive)endCall('declined');},900);
}
function cancelOutgoing(){
  if(!state.callActive)return;
  clearTimeout(callIv);
  setCallStatus('已取消');
  setTimeout(()=>{if(state.callActive)endCall('cancel');},900);
}
function answerCall(){
  if(!state.callActive)return;
  clearTimeout(callIv);stopRing();
  setCallStatus('对方已接听…');
  setTimeout(()=>{if(state.callActive)startCall();},700);
}
function startCall(){
  callSec=0;callMode='talk';
  setCallBadge(callKind==='video'?'视频通话中':'通话中',true);
  updateCallFloat();                // v3.6.3：全屏通话不显示浮窗（缩小后才出现，避免浮窗盖住全屏）
  if(callIv)clearInterval(callIv);
  callIv=setInterval(()=>{callSec++;updateCallFloat();},1000);
  if(callKind==='video')showVideoStage();
  renderCallActions(callActionsHtml());
  scheduleCallTalk();
}
/* 通话中操作按钮（初始化和状态更新共用，避免重复重启通话）
   v3.6.3 微信式：功能按钮一行并排（线性 SVG 小图标），挂断单独一行居中大红 */
function callActionsHtml(){
  const camBtn=callKind==='video'
    ?`<div class="call-col"><button class="call-btn${camOn?' on':''}" onclick="toggleCamera()">${IC_CAM}</button><span class="call-btn-label">${camOn?'摄像头开':'摄像头关'}</span></div>`
    :'';
  return '<div class="call-row">'
    +`<div class="call-col"><button class="call-btn${callMuted?' on':''}" onclick="toggleMute()">${IC_MUTE}</button><span class="call-btn-label">${callMuted?'已静音':'静音'}</span></div>`
    +`<div class="call-col"><button class="call-btn${callSpeaker?' on':''}" onclick="toggleSpeaker()">${IC_SPEAKER}</button><span class="call-btn-label">${callSpeaker?'免提开':'免提'}</span></div>`
    +camBtn
    +'<div class="call-col"><button class="call-btn" onclick="minimizeCall()">'+IC_MIN+'</button><span class="call-btn-label">小窗</span></div>'
    +'</div>'
    +'<div class="call-row">'
    +'<div class="call-col"><button class="call-btn end" onclick="endCall(\'hangup\')">'+IC_PHONE+'</button><span class="call-btn-label">挂断</span></div>'
    +'</div>';
}
/* 通话中 TA 说话：概率 + 最短/最长间隔的重复调度 */
function scheduleCallTalk(){
  if(callTalkTimer){clearTimeout(callTalkTimer);callTalkTimer=null;}
  const p=state.prob||{};
  const prob=clamp(num(p.callTalkProb,70),0,100);
  const min=Math.max(5,num(p.callTalkMin,12));
  const max=Math.max(min,num(p.callTalkMax,45));
  callTalkTimer=setTimeout(()=>{
    callTalkTimer=null;
    if(!state.callActive||callMode!=='talk')return;
    if(Math.random()*100<prob){
      pushReply(TALK_LINES[Math.floor(Math.random()*TALK_LINES.length)]);
    }
    scheduleCallTalk();
  },(min+Math.random()*(max-min))*1000);
}
function updateCallFloat(){
  const f=document.getElementById('call-float');
  if(!f)return;
  const n=document.getElementById('cf-name');if(n)n.textContent=state.other.name||'TA';
  const t=document.getElementById('cf-text');
  if(t)t.textContent=String(Math.floor(callSec/60)).padStart(2,'0')+':'+String(callSec%60).padStart(2,'0');
}
/* v3.6.3 微信式通话小窗：全局悬浮、可拖动、松手自动靠边 */
function minimizeCall(){
  if(callMode!=='talk')return;
  hideCallOverlay();                 // 修复旧 bug：之前 remove('show') 不生效，全屏一直盖着浮条
  initCallFloat();
  const f=document.getElementById('call-float');if(f)f.classList.add('show');
  updateCallFloat();
}
/* 拖动监听只初始化一次；默认落点：右侧中上（像微信视频小窗） */
let _floatDragInit=false;
function initCallFloat(){
  const f=document.getElementById('call-float');if(!f)return;
  if(_floatDragInit)return;_floatDragInit=true;
  const ph=document.getElementById('phone');
  const pw=ph.getBoundingClientRect().width;
  f.style.right='auto';f.style.left=(pw-f.offsetWidth-14)+'px';f.style.top=(ph.getBoundingClientRect().height*0.3)+'px';
  let dragging=false,dx=0,dy=0,sx=0,sy=0,moved=false;
  f.addEventListener('pointerdown',e=>{
    if(e.target.closest('.cf-x'))return;
    dragging=true;moved=false;
    const r=f.getBoundingClientRect();
    dx=e.clientX-r.left;dy=e.clientY-r.top;sx=e.clientX;sy=e.clientY;
    try{f.setPointerCapture(e.pointerId);}catch(err){}
  });
  f.addEventListener('pointermove',e=>{
    if(!dragging)return;
    const p=document.getElementById('phone').getBoundingClientRect();
    if(Math.abs(e.clientX-sx)>6||Math.abs(e.clientY-sy)>6)moved=true;
    let x=e.clientX-dx-p.left,y=e.clientY-dy-p.top;
    x=Math.max(0,Math.min(p.width-f.offsetWidth,x));
    y=Math.max(0,Math.min(p.height-f.offsetHeight,y));
    f.style.left=x+'px';f.style.top=y+'px';f.style.right='auto';
  });
  f.addEventListener('pointerup',e=>{
    if(!dragging)return;dragging=false;
    const p=document.getElementById('phone').getBoundingClientRect();
    const r=f.getBoundingClientRect();
    if(moved){  // 拖动过 → 松手自动靠边（吸附左/右边缘，保留当前高度）
      const left=r.left-p.left;
      const snapLeft=(left+r.width/2)<p.width/2;
      f.style.left=(snapLeft?0:p.width-r.width)+'px';
      f.style.top=(r.top-p.top)+'px';
      f.style.right='auto';
    }else{      // 未拖动 = 点击 → 恢复全屏
      expandCall();
    }
  });
}
/* 浮窗上的 × ：直接挂断 */
function miniCallHangup(){endCall('hangup');}
function toggleMute(){callMuted=!callMuted;if(mediaStream)mediaStream.getAudioTracks().forEach(t=>t.enabled=!callMuted);renderCallActions(callActionsHtml());}
function toggleSpeaker(){callSpeaker=!callSpeaker;renderCallActions(callActionsHtml());}
function endCall(reason){
  const dur=callSec;
  const connected=(callMode==='talk');
  const kind=callKind||'voice';
  state.callActive=false;callSec=0;callMode=null;
  if(callIv){clearInterval(callIv);clearTimeout(callIv);callIv=null;}
  if(callTalkTimer){clearTimeout(callTalkTimer);callTalkTimer=null;}
  stopRing();
  if(mediaStream){mediaStream.getTracks().forEach(t=>t.stop());mediaStream=null;}
  camOn=false;
  const v=document.getElementById('cv-local');if(v){v.style.display='none';v.srcObject=null;}
  const cv=document.getElementById('call-video');if(cv)cv.style.display='none';
  const av=document.getElementById('call-avatar'),nm=document.getElementById('call-name'),st=document.getElementById('call-status');
  if(av)av.style.display='';if(nm)nm.style.display='';if(st)st.style.display='';
  hideCallOverlay();
  document.getElementById('call-float').classList.remove('show');
  document.getElementById('edge-back').classList.toggle('on',navStack.length>1);
  const dstr=String(Math.floor(dur/60)).padStart(2,'0')+':'+String(dur%60).padStart(2,'0');
  if(connected)pushSys(`${kind==='video'?'视频':'语音'}通话 ${dstr}`);
  else if(reason==='miss-out')pushSys(`呼叫${state.other.name}未接通`);
  else if(reason==='miss-in')pushSys(`${state.other.name}的来电已超时`);
  else if(reason==='declined')pushSys(`你拒接了${state.other.name}的来电`);
  else if(reason==='cancel')pushSys(`已取消呼叫${state.other.name}`);
}

/* 点击悬浮小窗 → 重新展开全屏通话界面（v3.6.3：改用 active 类正确显示全屏） */
function expandCall(){
  if(!state.callActive)return;
  const ov=document.getElementById('call-overlay');
  if(ov)ov.classList.add('active');
  const f=document.getElementById('call-float');
  if(f)f.classList.remove('show');
  if(callMode==='talk'){setCallStatus(callDurationText());renderCallActions(callActionsHtml());}
}

/* 通话中顶部状态文案（与 updateCallFloat 使用同一格式） */
function callDurationText(){
  const m=Math.floor(callSec/60),s=callSec%60;
  return (callKind==='video'?'视频通话':'通话')+' '+(m<10?'0':'')+m+':'+(s<10?'0':'')+s;
}
