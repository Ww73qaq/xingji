/* =========================================================
   星迹 · 我的：资料 / 密码 / 通知 / 相遇时间 / 开屏语
   ========================================================= */

function editSplashText(){appPrompt('开屏语（换行请用空格分隔）',state.splashText.replace(/\n/g,' '),t=>{if(t===null||!t.trim())return false;state.splashText=t.trim();saveKey('splashText');renderSplashLetter();showToast('开屏语已更新');});}

/* ===== PROFILE（「我的」标签页 = 原设置页） ===== */
function renderProfile(){
  const body=document.getElementById('profile-body');
  if(!body)return;
  body.innerHTML=`
    <div class="cs-hero">
      <div class="cs-avatar" onclick="pickAvatar('me')" style="cursor:pointer">${avatarHtml('me')}</div>
      <div style="flex:1;min-width:0">
        <div class="cs-hero-name" onclick="editName('me')" style="cursor:pointer">${esc(state.me.name)} &#9998;</div>
        <div class="cs-hero-sub" onclick="editStatus('me')" style="cursor:pointer">${esc(state.me.status||'在线')} &#9998;</div>
      </div>
    </div>
    <div class="cs-group">
      <div class="cs-item" onclick="editName('me')"><span class="cs-ico">${ICO.user}</span><span class="cs-label">我的昵称</span><span class="cs-val">${esc(state.me.name)}</span><span class="cs-arrow">&#8250;</span></div>
      <div class="cs-item" onclick="pickAvatar('me')"><span class="cs-ico">${ICO.cam}</span><span class="cs-label">我的头像</span><span class="cs-thumb">${avatarHtml('me')}</span><span class="cs-arrow">&#8250;</span></div>
      <div class="cs-item" onclick="editStatus('me')"><span class="cs-ico">${ICO.chat}</span><span class="cs-label">我的状态</span><span class="cs-val">${esc(state.me.status||'在线')}</span><span class="cs-arrow">&#8250;</span></div>
      <div class="cs-item" onclick="editName('other')"><span class="cs-ico">${ICO.pair}</span><span class="cs-label">TA 的昵称</span><span class="cs-val">${esc(state.other.name)}</span><span class="cs-arrow">&#8250;</span></div>
      <div class="cs-item" onclick="pickAvatar('other')"><span class="cs-ico">${ICO.cam}</span><span class="cs-label">TA 的头像</span><span class="cs-thumb">${avatarHtml('other')}</span><span class="cs-arrow">&#8250;</span></div>
      <div class="cs-item" onclick="editStatus('other')"><span class="cs-ico">${ICO.chat}</span><span class="cs-label">TA 的状态</span><span class="cs-val">${esc(state.other.status||'在线')}</span><span class="cs-arrow">&#8250;</span></div>
    </div>
    <div class="cs-group-title">传讯</div>
    <div class="cs-group">
      <div class="cs-item" onclick="openApp('mailbox')"><span class="cs-ico">${ICO.mail}</span><span class="cs-label">信箱</span><span class="cs-arrow">&#8250;</span></div>
      <div class="cs-item" onclick="openApp('sense')"><span class="cs-ico">${ICO.room}</span><span class="cs-label">感应房间</span><span class="cs-arrow">&#8250;</span></div>
    </div>
    <div class="cs-group-title">内容</div>
    <div class="cs-group">
      <div class="cs-item" onclick="openApp('cards')"><span class="cs-ico">${ICO.card}</span><span class="cs-label">字卡管理</span><span class="cs-arrow">&#8250;</span></div>
      <div class="cs-item" onclick="openApp('emoji')"><span class="cs-ico">${ICO.smile}</span><span class="cs-label">表情管理</span><span class="cs-arrow">&#8250;</span></div>
      <div class="cs-item" onclick="openApp('probability')"><span class="cs-ico">${ICO.chart}</span><span class="cs-label">回复设置</span><span class="cs-arrow">&#8250;</span></div>
      <div class="cs-item" onclick="editMyPoke()"><span class="cs-ico">${ICO.poke}</span><span class="cs-label">我的拍一拍</span><span class="cs-val">${esc(state.stats.myPoke||'拍了拍TA的肩膀')}</span><span class="cs-arrow">&#8250;</span></div>
      <div class="cs-item" onclick="managePokes()"><span class="cs-ico">${ICO.poke}</span><span class="cs-label">TA 拍我</span><span class="cs-val">${(allPokeTexts()||[]).length} 条动作</span><span class="cs-arrow">&#8250;</span></div>
      <div class="cs-item" onclick="openTaNoteSettings()"><span class="cs-ico">${ICO.star}</span><span class="cs-label">TA 写便签</span><span class="cs-val">${taNoteEnabled()?'已开启':'已关闭'}</span><span class="cs-switch${taNoteEnabled()?' on':''}" onclick="event.stopPropagation();toggleTaNote()"></span></div>
    </div>
    <div class="cs-group-title">记录</div>
    <div class="cs-group">
      <div class="cs-item" onclick="openApp('diary')"><span class="cs-ico">${ICO.book}</span><span class="cs-label">日记</span><span class="cs-arrow">&#8250;</span></div>
      <div class="cs-item" onclick="openApp('memory')"><span class="cs-ico">${ICO.chart}</span><span class="cs-label">数据与回忆</span><span class="cs-arrow">&#8250;</span></div>
    </div>
    <div class="cs-group-title">安全</div>
    <div class="cs-group">
      <div class="cs-item" onclick="setupPin()"><span class="cs-ico">${ICO.lock}</span><span class="cs-label">应用锁密码</span><span class="cs-val">${state.pin.code==='0000'?'未修改':'已设置'}</span><span class="cs-arrow">&#8250;</span></div>
      <div class="cs-item" onclick="setMeetTime()"><span class="cs-ico">${ICO.heart}</span><span class="cs-label">相遇时间</span><span class="cs-val">${state.meetTime?fmtFull(state.meetTime):'未设置'}</span><span class="cs-arrow">&#8250;</span></div>
      <div class="cs-item" onclick="editSplashText()"><span class="cs-ico">${ICO.star}</span><span class="cs-label">开屏语</span><span class="cs-arrow">&#8250;</span></div>
    </div>
    <div class="cs-group-title">通知</div>
    <div class="cs-group">
      <div class="cs-item" onclick="openNotifySettings()"><span class="cs-ico">${ICO.bell}</span><span class="cs-label">消息通知</span><span class="cs-val">${state.notify.enabled?'已开启':'未开启'}</span><span class="cs-arrow">&#8250;</span></div>
      <div class="cs-item" onclick="showNotifyHint()"><span class="cs-ico">${ICO.bulb}</span><span class="cs-label">后台保持在线</span><span class="cs-arrow">&#8250;</span></div>
    </div>
<div class="cs-group-title">数据清理</div>
    <div class="cs-group">
      <div class="cs-item" onclick="clearAllXingjiData()"><span class="cs-ico">&#9888;</span><span class="cs-label" style="color:#c0392b">清除全部数据</span><span class="cs-val">不可恢复</span><span class="cs-arrow">&#8250;</span></div>
    </div>
    <div style="text-align:center;color:var(--hint);font-size:11px;padding:10px 0 4px">星迹 · STAR TRACE<br>数据全部保存在本机浏览器</div>`;
}
/* ===== TA 写便签开关（我的 → 内容） ===== */
function openTaNoteSettings(){
  const on=taNoteEnabled();
  const rows='<div class="modal-item" onclick="closeModal();toggleTaNote()"><span style="flex:1">允许 TA 写便签</span><span class="cs-switch'+(on?' on':'')+'"></span></div>';
  const tip='<div style="padding:2px 2px 10px;font-size:12px;color:var(--hint);line-height:1.75">'
    +'开启后，'+esc(state.other.name)+' 会在桌面右侧那张便签上<b>低频</b>留下一句话（大约几小时一次，看 TA 想不想说）。<br>'
    +'· 你自己写过的便签，'+esc(state.other.name)+'<b>不会覆盖</b>；想换一句可长按便签选「让 TA 重新写」。<br>'
    +'· '+esc(state.other.name)+'正在整理意识（禁言）时不写。<br>'
    +'· 便签会留一条系统消息与手机通知，方便你回到桌面看见。</div>';
  showModal('TA 写便签',tip+rows,'<div class="modal-btn-row single"><button class="modal-btn" onclick="closeModal()">知道了</button></div>');
}
function toggleTaNote(){
  const next=taNoteEnabled()?0:1;
  state.stats.taNoteEnabled=next;saveKey('stats');
  showToast(next?(state.other.name+' 可以在便签上留言了'):'已关闭，'+state.other.name+' 不再写便签');
  renderProfile();
  if(typeof openTaNoteSettings==='function'&&document.getElementById('modal').classList.contains('show'))openTaNoteSettings();
}
function notifySystem(title,body,onClick){
  const n=state.notify||{};
  if(n.enabled===false||!notifyPermGranted())return;
  // 聊天消息：仅当用户当前正停在聊天界面（且页面可见）时不打扰；
  // 其余情况一律通知——网站其它页面（朋友圈/我的/桌面等）、切到别的App、锁屏等后台场景
  const tag=(title||'').indexOf(state.other.name)>=0?'chat':'other';
  if(tag==='chat'&&n.chat===false)return;
  if(tag==='other'&&n.moments===false)return;
  const inChatView=Array.isArray(navStack)&&navStack[navStack.length-1]==='chat';
  if(!document.hidden&&inChatView)return;
  sendWebNotify(title||'星迹',body,tag+'|'+Date.now(),onClick);
}
/* 系统通知统一发送：优先 Service Worker（Android 必须注册 SW 才能显示通知，
   通知由浏览器原生调度，页面后台/冻结也能弹出）；无 SW 时回退 Notification API。 */
function sendWebNotify(title,body,tag,onClick){
  if(!notifySupported()||!notifyPermGranted())return;
  const opts={body:(body||'').slice(0,120),tag:tag||('xingji|'+Date.now())};
  if('serviceWorker' in navigator){
    navigator.serviceWorker.ready.then(reg=>reg.showNotification(title||'星迹',opts))
      .then(()=>{})
      .catch(()=>fallbackNotify(title,body,onClick));
    return;
  }
  fallbackNotify(title,body,onClick);
}
function fallbackNotify(title,body,onClick){
  try{
    const nt=new Notification(title||'星迹',{body:(body||'').slice(0,120),tag:'xingji|'+Date.now()});
    if(typeof onClick==='function'){nt.onclick=()=>{window.focus();try{onClick();}catch(e){}nt.close();};}
    setTimeout(()=>nt.close(),10000);
  }catch(e){/* 通知失败静默（iOS 需添加到主屏幕 / 浏览器未授权等） */}
}
function openNotifySettings(){
  const n=state.notify||{enabled:false,chat:true,moments:true,letters:true};
  if(n.enabled)startKeepAlive();
  const perm=notifySupported()?(Notification.permission==='granted'?'已允许':(Notification.permission==='denied'?'已拒绝（被浏览器挡掉）':'未请求')):'不支持';
  const deniedHint=(notifySupported()&&Notification.permission==='denied')
    ?'<div style="font-size:11px;color:#c55;line-height:1.8;margin:6px 0 4px;padding:8px 10px;background:rgba(200,80,80,.08);border-radius:8px">浏览器已「自动禁止」本站通知（Edge / Chrome 在多次拒绝授权框后会自动挡掉该站点）。<br>请到：<br>· Edge：地址栏左侧图标 → 网站权限 → 通知 → 允许；<br>· 或 浏览器 设置 → 网站设置 → 通知 →「添加网站例外」→ 输入本站网址。<br>允许后回来点下方「测试通知」验证。</div>'
    :'';
  showModal('消息通知',`<div style="font-size:12px;color:var(--sub);line-height:1.9;margin-bottom:8px">浏览器权限：<b>${perm}</b>${!notifySupported()?'（当前浏览器不支持通知）':''}<br>开启后，TA 发消息/回信/朋友圈互动时，即使你切到别的 App 也能收到手机通知。</div>${deniedHint}
    <div class="modal-item" onclick="setNotify('enabled')"><span style="flex:1">总开关</span><span class="cs-switch${n.enabled?' on':''}" onclick="event.stopPropagation();setNotify('enabled')"></span></div>
    <div class="modal-item" onclick="setNotify('chat')"><span style="flex:1">聊天消息</span><span class="cs-switch${n.chat!==false?' on':''}" onclick="event.stopPropagation();setNotify('chat')"></span></div>
    <div class="modal-item" onclick="setNotify('moments')"><span style="flex:1">朋友圈互动</span><span class="cs-switch${n.moments!==false?' on':''}" onclick="event.stopPropagation();setNotify('moments')"></span></div>
    <div class="modal-item" onclick="setNotify('letters')"><span style="flex:1">信件回信</span><span class="cs-switch${n.letters!==false?' on':''}" onclick="event.stopPropagation();setNotify('letters')"></span></div>
    <button class="btn-pill" style="width:100%;margin-top:8px" onclick="testNotify()">测试通知（当场发一条验证链路）</button>
    <div style="font-size:11px;color:var(--hint);line-height:1.8;margin-top:10px">说明：<br>· 通知需要浏览器授权，首次开启会弹出授权请求；<br>· 若授权框不弹、或已被浏览器自动禁止（Edge / Chrome 会挡反复请求的站点）→ 按上面红字去浏览器设置添加例外；<br>· 手机端点「测试通知」：切回桌面/其它App 后通知即弹出（Android 前台页面不显示通知）；<br>· iPhone Safari：先「添加到主屏幕」再从桌面图标打开，通知才能稳定生效；<br>· QQ / 微信内置浏览器：部分版本会拦截网页通知，建议用系统浏览器打开本站；<br>· Android 后台运行：设置→应用→Edge/Chrome→电池→「不受限制」；最近任务把浏览器「锁定」；关闭浏览器省电模式/后台限制——否则锁屏后系统会休眠浏览器导致通知失效；<br>· 页面完全关闭后无法收到（静态站无推送服务器），保持后台打开即可。</div>`);
}
function testNotify(){
  if(!notifySupported()){showToast('当前浏览器不支持通知');return;}
  if(Notification.permission==='granted'){
    sendTestNotification();
    showToast(document.hidden?'已发送测试通知，请看通知栏':'测试通知已发送，请切回桌面/其它App 查看');
  }else if(Notification.permission==='default'){
    Notification.requestPermission().then(p=>{if(p==='granted')testNotify();else showToast('通知权限未允许');});
  }else{
    openNotifySettings();
  }
}
/* 发送测试通知：走 Service Worker——前台调用不抛异常，Android 上通知在切回桌面/其它App 后显示 */
function sendTestNotification(){
  if('serviceWorker' in navigator&&navigator.serviceWorker.controller){
    navigator.serviceWorker.ready.then(reg=>reg.showNotification('星迹 · 测试通知',{body:'通知链路已打通，你已能收到本网站的系统通知',tag:'xingji-test'}))
      .catch(()=>fallbackNotify('星迹 · 测试通知','通知链路已打通，你已能收到本网站的系统通知'));
  }else{
    fallbackNotify('星迹 · 测试通知','通知链路已打通，你已能收到本网站的系统通知');
  }
}
function setNotify(k){
  state.notify=state.notify||{enabled:false,chat:true,moments:true,letters:true};
  if(k==='enabled'){
    state.notify.enabled=!state.notify.enabled;
    if(state.notify.enabled){
      if(notifySupported()&&Notification.permission==='default')Notification.requestPermission().then(p=>showToast(p==='granted'?'通知权限已允许':(p==='denied'?'权限被拒绝，请在浏览器设置中开启':'未授权')));
      else if(!notifyPermGranted())showToast('请先在浏览器设置里允许通知权限');
      startKeepAlive();
    }else{
      stopKeepAlive();
    }
  }else{
    state.notify[k]=(state.notify[k]===false)?true:false;
  }
  saveKey('notify');renderProfile();openNotifySettings();
}
/* ===== 后台保活音频（借鉴 mochi bg-keep 模块）：通知开启时播放静音循环，
   Android 浏览器对「正在播放媒体」的页面不会冻结后台 JS → 定时器/心跳继续运行，
   切到别的 App 后 TA 消息调度与通知能按时触发。 ===== */
let _keepCtx=null,_keepSrc=null,_keepTimer=null,_keepVisBound=false;
function keepAliveActive(){return !!(state.notify&&state.notify.enabled&&_keepCtx);}
/* 后台保活音频（增强版，借鉴 mochi bg-keep）：
   - 近静音正弦波（18000Hz 人耳不可闻，幅度 0.006×0.05≈-70dBFS）——必须有「实际信号」才被
     Android 视为媒体播放中；gain=0 纯静音不算，后台照样被冻结。
   - 重试定时器：Chromium 139+ 安卓后台冻结线缩到 1 分钟，隐藏期 ≤15s 检查一次 AudioContext
     是否被挂起（suspended）并 resume，保证音频不停、页面不被冻结。
   - visibilitychange：切后台确保保活在跑；切回前台 resume 被挂起的上下文。 */
function startKeepAlive(){
  if(_keepCtx)return;
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return;
    const ctx=new AC();
    const rate=ctx.sampleRate||44100;
    const buf=ctx.createBuffer(1,rate,rate); /* 1 秒近静音正弦波 */
    const ch=buf.getChannelData(0);
    for(let i=0;i<ch.length;i++)ch[i]=Math.sin(2*Math.PI*18000*i/rate)*0.006;
    const src=ctx.createBufferSource();
    src.buffer=buf;src.loop=true;
    const g=ctx.createGain();g.gain.value=0.05;
    src.connect(g);g.connect(ctx.destination);
    src.start();
    _keepCtx=ctx;_keepSrc=src;
    if(_keepTimer)clearInterval(_keepTimer);
    _keepTimer=setInterval(()=>{
      if(!_keepCtx)return;
      if(_keepCtx.state==='suspended'){try{_keepCtx.resume();}catch(e){}}
    },document.hidden?15000:60000);
    if(!_keepVisBound){
      _keepVisBound=true;
      document.addEventListener('visibilitychange',()=>{
        if(document.hidden){
          if(state.notify&&state.notify.enabled)startKeepAlive();
        }else if(_keepCtx&&_keepCtx.state==='suspended'){
          try{_keepCtx.resume();}catch(e){}
        }
      });
    }
  }catch(e){_keepCtx=null;_keepSrc=null;}
}
function stopKeepAlive(){
  if(_keepTimer){clearInterval(_keepTimer);_keepTimer=null;}
  if(_keepCtx){try{_keepSrc.stop();_keepCtx.close();}catch(e){}}
  _keepCtx=null;_keepSrc=null;
}
/* 兼容旧调用：旧「消息通知」一键开关 → 打开新通知设置 */
function toggleNotify(){openNotifySettings();}
function showNotifyHint(){
  showModal('后台保持在线',`<div style="padding:4px 2px 10px;font-size:13px;line-height:2;color:var(--sub)">· 网页无法完全阻止手机杀后台，但可以尽量降低概率：<br>· iOS：添加到主屏幕，从主屏幕图标打开，后台驻留更久；<br>· Android Chrome：站点设置里允许后台运行。</div>`,
    '<div class="modal-item" onclick="closeModal();copySiteUrl()">复制本站地址</div>'
    +'<div class="modal-item" onclick="closeModal();showAddHomeSteps()">查看「添加到主屏幕」步骤</div>');
}
function copySiteUrl(){
  const url=location.href;
  const done=()=>showToast('地址已复制');
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(url).then(done).catch(()=>{const t=document.createElement('textarea');t.value=url;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove();done();});}
  else{const t=document.createElement('textarea');t.value=url;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove();done();}
}
function showAddHomeSteps(){
  showModal('添加到主屏幕',`<div style="padding:8px 2px;font-size:13px;line-height:2.1;color:var(--sub)">· iPhone（Safari）：点底部分享按钮 → 添加到主屏幕。<br>· Android（Chrome）：右上角菜单 → 添加到主屏幕。<br>· 完成后从桌面图标打开，后台驻留和通知更稳定。</div>`);
}
function editName(who_){
  const p=who_==='me'?state.me:state.other;
  appPrompt('修改昵称',p.name,t=>{
    const v=(t||'').trim();if(!v)return false;
    p.name=v;saveKey(who_==='me'?'me':'other');updateHome();renderProfile();showToast('昵称已更新');
  });
}
function pickAvatar(who_){
  const input=document.createElement('input');input.type='file';input.accept='image/*';
  input.onchange=async e=>{
    const f=e.target.files[0];if(!f)return;
    showToast('正在处理头像…');
    try{
      const url=await compressImage(f);
      (who_==='me'?state.me:state.other).avatar=url;
      saveKey(who_==='me'?'me':'other');
      updateHome();if(state.currentApp==='chat'){updateChatHeader();renderChat(true);}renderProfile();
      showToast('头像已更新');
    }catch(err){showToast('头像处理失败');}
  };
  input.click();
}

/* ===== SETTINGS UTILS ===== */
let setupPinTmp='', setupPinPhase=0, setupPinVal='';
function setupPin(){
  setupPinTmp='';setupPinPhase=0;setupPinVal='';
  const body='<div class="pin-dots" id="setup-pin-dots"><div class="pin-dot"></div><div class="pin-dot"></div><div class="pin-dot"></div><div class="pin-dot"></div></div>'+
    '<div class="pin-error" id="setup-pin-error" style="color:#c55;opacity:1;height:18px"></div>'+
    '<div class="pin-pad" style="max-width:280px;margin:0 auto">'+
    [1,2,3,4,5,6,7,8,9,0,'del'].map((n,i)=>{
      if(n==='del')return '<button class="pin-btn" onclick="setupPinBack()">&#9003;</button>';
      if(n===0)return '<button class="pin-btn wide" onclick="setupPinKey(0)">0</button>';
      return '<button class="pin-btn" onclick="setupPinKey('+n+')">'+n+'</button>';
    }).join('')+'</div>'+
    '<div style="text-align:center;font-size:12px;color:var(--hint);margin-top:12px">'+(state.pin.code==='0000'?'首次设置密码':'修改当前密码')+'</div>';
  showModal('设置应用锁密码',body);
}
function renderSetupDots(){const dots=document.querySelectorAll('#setup-pin-dots .pin-dot');dots.forEach((d,i)=>d.classList.toggle('filled',i<setupPinVal.length));}
function setupPinKey(n){
  if(setupPinVal.length>=4)return;
  setupPinVal+=String(n);renderSetupDots();
  if(setupPinVal.length<4)return;
  if(setupPinPhase===0){
    if(/^\d{4}$/.test(setupPinVal)){
      setupPinTmp=setupPinVal;setupPinVal='';setupPinPhase=1;
      document.getElementById('setup-pin-error').textContent='再次输入以确认';
      renderSetupDots();
    }else{document.getElementById('setup-pin-error').textContent='请输入4位数字';}
  }else if(setupPinVal===setupPinTmp){
    state.pin.code=setupPinVal;saveKey('pin');closeModal();showToast('密码已修改');
  }else{
    document.getElementById('setup-pin-error').textContent='两次输入不一致，请重试';
    setupPinVal='';setupPinTmp='';setupPinPhase=0;renderSetupDots();
  }
}
function setupPinBack(){setupPinVal=setupPinVal.slice(0,-1);renderSetupDots();}

function setMeetTime(){
  const cur=state.meetTime?new Date(state.meetTime).toISOString().slice(0,10):'';
  showModal('设置相遇时间','<input type="date" id="meet-date" value="'+cur+'" style="width:100%;padding:12px;border:1px solid var(--input);border-radius:12px;font-size:15px;color:var(--text);background:var(--bg)"><button class="modal-confirm" onclick="saveMeetTime()">保存</button>');
}
function saveMeetTime(){
  const inp=document.getElementById('meet-date');const d=inp?inp.value:'';
  if(!d){showToast('请选择日期');return;}
  state.meetTime=new Date(d).getTime();saveKey('meetTime');closeModal();updateHome();showToast('相遇时间已设置');
}
