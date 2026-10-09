/* =========================================================
   星迹 · 手机导航栈（压栈 / 返回 / 系统返回键 / 上滑回桌面 / 软键盘适配）
   ========================================================= */

let navStack=[];        // 当前打开的页面 id 栈（栈底始终是根页面）
let navRoot='chat';     // 栈底页面（对应底部标签栏）
let navLock=false;      // 防止 history.back() 触发的 popstate 递归
let lastBackAt=0;

function switchTab(tab){
  const pageId=TAB_PAGE[tab]||tab;
  const isActive=navRoot===pageId&&document.getElementById('app-pages').classList.contains('on');
  // 再次点击当前标签：有子页 → 退回该应用根页；已在根页 → 回桌面（手机习惯）
  if(isActive){
    if(navStack.length>1){for(let i=0;i<navStack.length-1;i++)goBack();}
    else goHome();
    return;
  }
  saveScrollTop();
  navStack=[pageId];navRoot=pageId;
  history.pushState({d:1},'');
  renderNav();
  enterPage(pageId);
}
/* 保存当前页面滚动位置（返回时恢复） */
function saveScrollTop(){
  const top=navStack[navStack.length-1];
  if(!top)return;
  const page=document.getElementById('app-'+top);if(!page)return;
  const body=page.querySelector('.app-body');
  if(body)body._savedTop=body.scrollTop;
  const cc=page.querySelector('.chat-content');
  if(cc)cc._savedTop=cc.scrollTop;
}
/* 回到桌面：收起全部浮层与页面（手机「上滑回桌面」） */
let skipPops=0;
function goHome(){
  closeCtxMenu();
  markNotesSeen();            // 回到桌面 = 已看见便签（清掉 TA 便签未读点）
  if(emojiOpen)toggleEmojiPanel();
  if(document.getElementById('img-viewer'))closeImageViewer();
  if(document.getElementById('modal').classList.contains('show'))closeModal();
  if(state.callActive)endCall('hangup');
  const n=Math.max(0,navStack.length-1);
  navStack=[];
  navRoot=navRoot;                       // 保留 tab 高亮参考
  closeAppUI();
  history.replaceState({d:0},'');
  history.pushState({d:0},'');
}
/* 打开子页面：压栈；从桌面打开时以自身为栈底，返回直接回桌面 */
function openApp(id){
  if(id==='settings'){openApp('profile');return;}
  const page=document.getElementById('app-'+id);
  if(!page){showToast('功能开发中');return;}
  if(navStack[navStack.length-1]===id)return;
  const atHome=!document.getElementById('app-pages').classList.contains('on');
  saveScrollTop();
  if(atHome){
    // 从桌面宫格进入：栈底=该功能页，返回一步即回桌面（不回聊天）
    navStack=[id];
    history.replaceState({d:1},'');
    history.pushState({d:1},'');
  }else{
    navStack.push(id);
    history.pushState({d:navStack.length},'');
  }
  renderNav();
  enterPage(id);
}
function enterPage(id){
  const page=document.getElementById('app-'+id);
  if(!page)return;
  state.currentApp=id;
  // 触底加载/滚动位置
  const body=page.querySelector('.app-body');
  if(body)body.scrollTop=body._savedTop||0;
  const render={
    chat:()=>{renderChat();updateChatHeader();markRead();},
    chatinfo:renderChatInfo, chatsearch:renderChatSearch,
    mailbox:renderMailbox, diary:renderDiary, moments:renderMoments,
    probability:renderProbability,
    cards:renderCards, emoji:renderEmojis, memory:renderMemory,
    sense:initRoom, writing:renderWriting, calendar:renderCalendar,
    trace:renderTrace, profile:renderProfile, data:renderDataPage
  };
  if(render[id])try{render[id]();}catch(e){console.error(e);}
}
/* 根据 navStack 重绘页面层级 */
function renderNav(){
  const container=document.getElementById('app-pages');
  container.classList.add('on');
  document.querySelectorAll('.app-page').forEach(p=>p.classList.remove('on','under','closing'));
  const top=navStack[navStack.length-1];
  if(!top)return;
  document.getElementById('app-'+top).classList.add('on');
  if(navStack.length>1)document.getElementById('app-'+navStack[navStack.length-2]).classList.add('under');
  state.currentApp=top;
  // 底部标签栏高亮
  document.querySelectorAll('.tab-item').forEach(t=>t.classList.toggle('on',t.dataset.tab===navRoot));
  document.getElementById('tabbar').classList.remove('hidden');
}
/* 返回上一层（按钮返回：先关浮层 → 再退页面 → 最终回桌面，全程不依赖浏览器历史） */
function goBack(){
  if(document.getElementById('ctx-menu').classList.contains('show')){closeCtxMenu();return;}
  if(document.getElementById('img-viewer')){closeImageViewer();return;}
  if(emojiOpen){toggleEmojiPanel();return;}
  if(document.getElementById('modal').classList.contains('show')){closeModal();return;}
  if(state.callActive){endCall('hangup');return;}
  if(navStack.length>1){
    navStack.pop();
    renderNav();
    const body=document.querySelector('#app-'+navStack[navStack.length-1]+' .app-body');
    if(body&&body._savedTop)body.scrollTop=body._savedTop;
    if(navStack[navStack.length-1]==='chat')renderChat(false);
    return;
  }
  closeApp();
}
/* 关闭所有页面（回到桌面） */
function closeAppUI(){
  saveScrollTop();
  navStack=[];
  state.currentApp=null;
  document.getElementById('app-pages').classList.remove('on');
  document.getElementById('tabbar').classList.remove('hidden');
  document.getElementById('edge-back').classList.remove('on');
  document.querySelectorAll('.tab-item').forEach(t=>t.classList.remove('on'));
  markNotesSeen();
  updateHome();
}
function closeApp(){
  closeAppUI();
  history.replaceState({d:0},'');
  history.pushState({d:0},'');
}
/* Android 物理返回键 / 浏览器后退按钮 / iOS 侧滑 */
window.addEventListener('popstate',()=>{
  if(navLock){navLock=false;return;}
  if(skipPops>0){skipPops--;return;}          // goHome/closeApp 批量回退，忽略
  if(navStack.length>1){
    navStack.pop();
    renderNav();
    const body=document.querySelector('#app-'+navStack[navStack.length-1]+' .app-body');
    if(body&&body._savedTop)body.scrollTop=body._savedTop;
    if(navStack[navStack.length-1]==='chat')renderChat(false);
    return;
  }
  const atHome=!document.getElementById('app-pages').classList.contains('on');
  if(!atHome){closeApp();return;}
  // 已在桌面：第一次返回提示，2 秒内再按则真正离开
  const now=Date.now();
  if(now-lastBackAt>2000){
    lastBackAt=now;
    showToast('再按一次返回键退出星迹');
    history.pushState({d:1},'');
  }else{
    // 第二次：真正离开本页面
    try{history.go(-1);}catch(e){location.href='';}
  }
});
/* 底部上滑 = 回桌面（手机 Home 手势） */
(function initHomeSwipe(){
  const phone=document.getElementById('phone');
  let y0=0,tracking=false;
  phone.addEventListener('touchstart',e=>{
    const t=e.touches[0];
    const h=window.innerHeight;
    if(t.clientY>h-26&&!state.callActive){y0=t.clientY;tracking=true;}
  },{passive:true});
  phone.addEventListener('touchmove',e=>{
    if(!tracking)return;
    if(e.touches[0].clientY-y0<-56){tracking=false;haptic();goHome();}
  },{passive:true});
  phone.addEventListener('touchend',()=>{tracking=false;});
})();

/* 软键盘适配：visualViewport 高度变化时压缩输入栏 */
(function initKeyboard(){
  const vv=window.visualViewport;
  if(!vv)return;
  const apply=()=>{
    const kb=Math.max(0,window.innerHeight-vv.height-vv.offsetTop);
    const over=kb>90?kb:0;
    document.body.classList.toggle('kb-open',over>0);
    document.documentElement.style.setProperty('--kb',over+'px');
  };
  vv.addEventListener('resize',apply);vv.addEventListener('scroll',apply);apply();
})();
