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
function notifySystem(title,body,onClick){
  try{
    const n=state.notify||{};
    if(!n.enabled||!notifyPermGranted())return;
    // 聊天消息：仅当页面不可见时才弹（避免前台刷屏）；其他类按开关直接弹
    const tag=(title||'').indexOf(state.other.name)>=0?'chat':'other';
    if(tag==='chat'&&n.chat===false)return;
    if(tag==='other'&&n.moments===false)return;
    if(!document.hidden)return;
    const nt=new Notification(title||'星迹',{body:(body||'').slice(0,120),tag:tag+'|'+Date.now(),icon:location.origin+'/favicon.ico'});
    if(typeof onClick==='function'){nt.onclick=()=>{window.focus();try{onClick();}catch(e){}nt.close();};}
    setTimeout(()=>nt.close(),10000);
  }catch(e){/* 通知失败静默（iOS 需添加到主屏幕 / 浏览器未授权等） */}
}
function openNotifySettings(){
  const n=state.notify||{enabled:false,chat:true,moments:true,letters:true};
  const perm=notifySupported()?(Notification.permission==='granted'?'已允许':(Notification.permission==='denied'?'已拒绝':'未请求')):'不支持';
  showModal('消息通知',`<div style="font-size:12px;color:var(--sub);line-height:1.9;margin-bottom:8px">浏览器权限：<b>${perm}</b>${!notifySupported()?'（当前浏览器不支持通知）':''}<br>开启后，TA 发消息/回信/朋友圈互动时，即使你切到别的 App 也能收到手机通知。</div>
    <div class="modal-item" onclick="setNotify('enabled')"><span style="flex:1">总开关</span><span class="cs-switch${n.enabled?' on':''}" onclick="event.stopPropagation();setNotify('enabled')"></span></div>
    <div class="modal-item" onclick="setNotify('chat')"><span style="flex:1">聊天消息</span><span class="cs-switch${n.chat!==false?' on':''}" onclick="event.stopPropagation();setNotify('chat')"></span></div>
    <div class="modal-item" onclick="setNotify('moments')"><span style="flex:1">朋友圈互动</span><span class="cs-switch${n.moments!==false?' on':''}" onclick="event.stopPropagation();setNotify('moments')"></span></div>
    <div class="modal-item" onclick="setNotify('letters')"><span style="flex:1">信件回信</span><span class="cs-switch${n.letters!==false?' on':''}" onclick="event.stopPropagation();setNotify('letters')"></span></div>
    <div style="font-size:11px;color:var(--hint);line-height:1.8;margin-top:10px">说明：<br>· 通知需要浏览器授权，首次开启会弹出授权请求；<br>· iPhone Safari：先「添加到主屏幕」再从桌面图标打开，通知才能稳定生效；<br>· QQ / 微信内置浏览器：部分版本会拦截网页通知，建议用系统浏览器打开本站；<br>· 页面完全关闭后无法收到（静态站无推送服务器），保持后台打开即可。</div>`);
}
function setNotify(k){
  state.notify=state.notify||{enabled:false,chat:true,moments:true,letters:true};
  if(k==='enabled'){
    state.notify.enabled=!state.notify.enabled;
    if(state.notify.enabled&&notifySupported()&&Notification.permission==='default')Notification.requestPermission().then(p=>showToast(p==='granted'?'通知权限已允许':(p==='denied'?'权限被拒绝，请在浏览器设置中开启':'未授权')));
    else if(state.notify.enabled&&!notifyPermGranted())showToast('请先在浏览器设置里允许通知权限');
  }else{
    state.notify[k]=(state.notify[k]===false)?true:false;
  }
  saveKey('notify');renderProfile();openNotifySettings();
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
