/* =========================================================
   星迹 · 语音与视频通话（来电 / 去电 / 铃声 / 摄像头 / 悬浮窗）
   ========================================================= */

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
function simulateIncomingCall(){
  if(state.callActive){showToast('当前正在通话中');return;}
  callMode='in';state.callActive=true;callSec=0;callMuted=false;callSpeaker=false;
  showCallOverlay();
  setCallBadge('星迹',true);
  setCallStatus(`${state.other.name} 正在呼叫…<br><span style="opacity:.6;font-size:12px">${CALL_BG[Math.floor(Math.random()*CALL_BG.length)]}</span>`);
  renderCallActions(
    '<div class="call-row">'
    +'<div class="call-col"><button class="call-btn" onclick="toggleMute()">&#128263;</button><span class="call-btn-label">静音</span></div>'
    +'<div class="call-col"><button class="call-btn" onclick="showToast(\'暂不支持\')">&#128250;</button><span class="call-btn-label">键盘</span></div>'
    +'</div>'
    +'<div class="call-row">'
    +'<div class="call-col"><button class="call-btn end" onclick="declineCall()">&#128222;</button><span class="call-btn-label">拒绝</span></div>'
    +'<div class="call-col"><button class="call-btn answer" onclick="answerCall()">&#128222;</button><span class="call-btn-label">接听</span></div>'
    +'</div>');
  startRing();
  if(navigator.vibrate)navigator.vibrate([400,200,400]);
  callIv=setTimeout(()=>{ if(!state.callActive)return; endCall('miss-in'); showToast(`${state.other.name} 的来电未接听`); },30000);
}
/* 去电 */
function callOutgoing(kind){
  if(state.callActive){showToast('当前正在通话中');return;}
  callMode='out';callKind=kind||'voice';state.callActive=true;callSec=0;callMuted=false;callSpeaker=false;camOn=(kind==='video');
  showCallOverlay();
  setCallBadge(kind==='video'?'视频通话':'语音通话',false);
  setCallStatus('正在呼叫…');
  renderCallActions('<div class="call-row"><div class="call-col"><button class="call-btn end" onclick="cancelOutgoing()">&#128222;</button><span class="call-btn-label">取消</span></div></div>');
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
  const f=document.getElementById('call-float');f.classList.add('show');
  updateCallFloat();
  if(callIv)clearInterval(callIv);
  callIv=setInterval(()=>{callSec++;updateCallFloat();},1000);
  if(callKind==='video')showVideoStage();
  renderCallActions(callActionsHtml());
  scheduleCallTalk();
}
/* 通话中操作按钮（初始化和状态更新共用，避免重复重启通话） */
function callActionsHtml(){
  const camBtn=callKind==='video'
    ?`<div class="call-col"><button class="call-btn${camOn?' on':''}" onclick="toggleCamera()">&#128249;</button><span class="call-btn-label">${camOn?'摄像头开':'摄像头关'}</span></div>`
    :'';
  return '<div class="call-row">'
    +`<div class="call-col"><button class="call-btn${callMuted?' on':''}" onclick="toggleMute()">&#128263;</button><span class="call-btn-label">${callMuted?'已静音':'静音'}</span></div>`
    +camBtn
    +'</div>'
    +'<div class="call-row">'
    +`<div class="call-col"><button class="call-btn${callSpeaker?' on':''}" onclick="toggleSpeaker()">&#128266;</button><span class="call-btn-label">${callSpeaker?'免提开':'免提'}</span></div>`
    +'<div class="call-col"><button class="call-btn" onclick="minimizeCall()">&#128736;</button><span class="call-btn-label">收起</span></div>'
    +'<div class="call-col"><button class="call-btn end" onclick="endCall(\'hangup\')">&#128222;</button><span class="call-btn-label">挂断</span></div>'
    +'</div>';
}
function minimizeCall(){
  // 小窗收起：隐藏全屏 overlay，通话继续（底部浮层可点击恢复）
  const ov=document.getElementById('call-overlay');
  if(ov)ov.classList.remove('show');
  const f=document.getElementById('call-float');
  if(f)updateCallFloat();
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
  f.querySelector('#cf-text').textContent=`通话中 ${String(Math.floor(callSec/60)).padStart(2,'0')}:${String(callSec%60).padStart(2,'0')}`;
}
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

/* 点击悬浮小窗 → 重新展开全屏通话界面（原先 onclick 指向的缺失函数） */
function expandCall(){
  if(!state.callActive&&callMode!=='ringing'&&callMode!=='calling'&&callMode!=='talk')return;
  const ov=document.getElementById('call-overlay');
  if(ov)ov.classList.add('show');
  const f=document.getElementById('call-float');
  if(f)f.classList.remove('show');
  if(callMode==='talk'){setCallStatus(callDurationText());renderCallActions(callActionsHtml());}
}

/* 通话中顶部状态文案（与 updateCallFloat 使用同一格式） */
function callDurationText(){
  const m=Math.floor(callSec/60),s=callSec%60;
  return (callKind==='video'?'视频通话':'通话')+' '+(m<10?'0':'')+m+':'+(s<10?'0':'')+s;
}
