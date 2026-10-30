/* 星迹 · 全局紫晶音乐播放器
   独立 UI 组件：在线歌单、SPA 连续播放、拖动吸附、位置记忆。
   不读取或修改聊天、调度及 IndexedDB 业务数据。 */
(function(){
  'use strict';
  const MUSIC_BASE='https://ww73qaq.github.io/music/';
  const TRACKS=[
    {title:'Lowkey',artist:'Aamir',file:'Aamir - Lowkey.mp3'},
    {title:'SEE ME 4 ME',artist:'Leah Marie Perez / Notkyle',file:'Leah Marie Perez Notkyle - SEE ME 4 ME.mp3'},
    {title:'Out of my system',artist:'Nia Nkuna',file:'Nia Nkuna - Out of my system.mp3'},
    {title:'call you tonight',artist:'郭小成 · Remix',file:'郭小成 - call you tonight (郭小成 Remix).mp3'},
    {title:'X',artist:'刘柏辛 Lexie',file:'刘柏辛Lexie - X.mp3'},
    {title:'沉浸式想念',artist:'赵希予（戏庭画）/ 肖倾月',file:'赵希予（戏庭画） 肖倾月 - 沉浸式想念.mp3'}
  ].map((t,i)=>({...t,id:i,url:MUSIC_BASE+encodeURIComponent(t.file)}));
  const STORE_KEY='xingji.music.ui.v3'; /* v3.28.2：换键——新默认「顶部居中」对老用户也生效一次，之后仍记忆拖动位置 */
  const TOP_OFFSET=56; /* 播放器默认停靠：状态栏下方一点，顶部居中 */
  const ICONS={
    play:'<svg viewBox="0 0 24 24" aria-hidden="true"><path class="xj-fill" d="M8 5.5v13l10-6.5z"/></svg>',
    pause:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5v14M15 5v14"/></svg>',
    prev:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5v14M18 6l-9 6 9 6z"/></svg>',
    next:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 5v14M6 6l9 6-9 6z"/></svg>',
    down:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9 5 5 5-5"/></svg>',
    close:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>',
    repeat:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 2l3 3-3 3M3 11V8a3 3 0 0 1 3-3h14M7 22l-3-3 3-3M21 13v3a3 3 0 0 1-3 3H4"/></svg>',
    one:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 2l3 3-3 3M3 11V8a3 3 0 0 1 3-3h14M7 22l-3-3 3-3M21 13v3a3 3 0 0 1-3 3H4M11 10h1v5M10 15h3"/></svg>',
    note:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l11-2v13M9 9l11-2"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>'
  };
  let saved={};
  try{saved=JSON.parse(localStorage.getItem(STORE_KEY)||'{}')||{};}catch(_){saved={};}
  let index=Number.isInteger(saved.index)&&saved.index>=0&&saved.index<TRACKS.length?saved.index:0;
  let repeat=saved.repeat==='one'?'one':'all';
  let open=false,errorText='',dragMoved=false;
  let audio,root,panel,phone,positionTimer=0;
  const save=()=>{
    try{localStorage.setItem(STORE_KEY,JSON.stringify({index,repeat,volume:audio?audio.volume:.75,x:saved.x,y:saved.y}));}catch(_){}
  };
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=s=>Number.isFinite(s)&&s>=0?Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0'):'0:00';
  function template(){
    return '<div class="xj-music-panel" id="xj-music-panel" aria-label="播放列表">'
      +'<div class="xj-music-head"><b>此刻的声音</b><span>'+TRACKS.length+' 首在线歌曲</span><button class="xj-music-btn xj-music-close" type="button" data-action="close" aria-label="收起播放列表">'+ICONS.close+'</button></div>'
      +'<div class="xj-music-now"><div class="xj-music-disc">'+ICONS.note+'</div><div class="xj-music-now-text"><b id="xj-music-now-title"></b><span id="xj-music-now-artist"></span></div><div class="xj-music-wave" aria-hidden="true"><i></i><i></i><i></i></div></div>'
      +'<div class="xj-music-controls"><button class="xj-music-btn" type="button" data-action="prev" aria-label="上一首">'+ICONS.prev+'</button><button class="xj-music-btn xj-music-play" type="button" data-action="play" aria-label="播放或暂停">'+ICONS.play+'</button><button class="xj-music-btn" type="button" data-action="next" aria-label="下一首">'+ICONS.next+'</button><button class="xj-music-btn xj-music-repeat" type="button" data-action="repeat" aria-label="切换循环模式">'+ICONS.repeat+'</button></div>'
      +'<div class="xj-music-progress"><span id="xj-music-current">0:00</span><input id="xj-music-seek" type="range" min="0" max="1000" value="0" aria-label="播放进度"><span id="xj-music-duration">0:00</span></div>'
      +'<div class="xj-music-list" id="xj-music-list">'+TRACKS.map(t=>'<button class="xj-music-track" type="button" data-track="'+t.id+'"><span class="xj-music-track-n">'+String(t.id+1).padStart(2,'0')+'</span><span class="xj-music-track-text"><b>'+esc(t.title)+'</b><span>'+esc(t.artist)+'</span></span><i class="xj-music-track-dot"></i></button>').join('')+'</div>'
      +'<div class="xj-music-error" id="xj-music-error" hidden></div></div>'
      +'<div class="xj-music-pill" id="xj-music-pill" aria-label="可拖动的音乐播放器">'
      +'<button class="xj-music-btn xj-music-play" type="button" data-action="play" aria-label="播放或暂停">'+ICONS.play+'</button>'
      +'<div class="xj-music-title"><span id="xj-music-pill-title"></span></div><span class="xj-music-index" id="xj-music-index"></span>'
      +'<button class="xj-music-btn xj-music-expand" type="button" data-action="toggle" aria-label="展开播放列表" aria-expanded="false">'+ICONS.down+'</button></div>'
      +'<audio id="xj-music-audio" preload="metadata" playsinline></audio>';
  }
  function render(){
    if(!root)return;
    const t=TRACKS[index],playing=audio&&!audio.paused&&!audio.ended;
    root.classList.toggle('open',open);root.classList.toggle('playing',!!playing);
    document.getElementById('xj-music-now-title').textContent=t.title;
    document.getElementById('xj-music-now-artist').textContent=t.artist;
    document.getElementById('xj-music-pill-title').textContent=t.artist+' - '+t.title;
    requestAnimationFrame(updateMarquee);
    document.getElementById('xj-music-index').textContent=String(index+1).padStart(2,'0')+' / '+String(TRACKS.length).padStart(2,'0');
    root.querySelectorAll('[data-action="play"]').forEach(b=>{b.innerHTML=playing?ICONS.pause:ICONS.play;b.setAttribute('aria-label',playing?'暂停':'播放');});
    root.querySelectorAll('.xj-music-track').forEach(b=>{const on=Number(b.dataset.track)===index;b.classList.toggle('on',on);b.setAttribute('aria-current',on?'true':'false');});
    const rb=root.querySelector('[data-action="repeat"]');rb.classList.toggle('on',repeat==='one');rb.innerHTML=repeat==='one'?ICONS.one:ICONS.repeat;rb.title=repeat==='one'?'单曲循环':'列表循环';
    const ex=root.querySelector('[data-action="toggle"]');ex.setAttribute('aria-expanded',open?'true':'false');ex.setAttribute('aria-label',open?'收起播放列表':'展开播放列表');
    const err=document.getElementById('xj-music-error');err.hidden=!errorText;err.textContent=errorText;
    updateTime();updateMediaSession();
  }
  function updateMarquee(){
    const wrap=root&&root.querySelector('.xj-music-title'),span=wrap&&wrap.querySelector('span');
    if(!wrap||!span)return;
    const distance=Math.max(0,span.scrollWidth-wrap.clientWidth+14);
    wrap.classList.toggle('marquee',distance>3);
    span.style.setProperty('--scroll-x','-'+distance+'px');
  }
  function updateTime(){
    if(!audio)return;
    const cur=document.getElementById('xj-music-current'),dur=document.getElementById('xj-music-duration'),seek=document.getElementById('xj-music-seek');
    if(cur)cur.textContent=fmt(audio.currentTime);if(dur)dur.textContent=fmt(audio.duration);
    if(seek&&!seek.matches(':active'))seek.value=Number.isFinite(audio.duration)&&audio.duration>0?String(Math.round(audio.currentTime/audio.duration*1000)):'0';
  }
  function loadTrack(autoplay){
    if(!audio)return;
    const t=TRACKS[index];errorText='';
    audio.src=t.url;audio.load();render();
    if(autoplay)play();
  }
  async function play(){
    if(!audio)return;
    if(!audio.src)audio.src=TRACKS[index].url;
    errorText='';
    try{await audio.play();}catch(e){
      errorText='歌曲暂时无法播放，请检查网络后重试。';render();
    }
  }
  function togglePlay(){if(audio.paused)play();else audio.pause();}
  function select(i,autoplay=true){index=(i+TRACKS.length)%TRACKS.length;save();loadTrack(autoplay);}
  function setOpen(v){open=!!v;render();requestAnimationFrame(placePanel);}
  function updateMediaSession(){
    if(!('mediaSession' in navigator))return;
    try{
      const t=TRACKS[index];navigator.mediaSession.metadata=new MediaMetadata({title:t.title,artist:t.artist,album:'星迹 · 此刻的声音'});
      navigator.mediaSession.setActionHandler('play',play);navigator.mediaSession.setActionHandler('pause',()=>audio.pause());
      navigator.mediaSession.setActionHandler('previoustrack',()=>select(index-1));navigator.mediaSession.setActionHandler('nexttrack',()=>select(index+1));
    }catch(_){}
  }
  function bounds(){
    const pr=phone.getBoundingClientRect(),r=root.getBoundingClientRect();
    return {w:pr.width,h:pr.height,pw:r.width,ph:r.height};
  }
  function setPosition(x,y,persist=true){
    const b=bounds(),margin=10;
    const maxX=Math.max(margin,b.w-b.pw-margin),maxY=Math.max(44,b.h-b.ph-margin);
    x=Math.max(margin,Math.min(maxX,x));y=Math.max(44,Math.min(maxY,y));
    root.style.transform='translate3d('+Math.round(x)+'px,'+Math.round(y)+'px,0)';
    saved.x=Math.round(x);saved.y=Math.round(y);
    if(persist)save();
  }
  function restorePosition(){
    const b=bounds();
    /* v3.28.2：默认停靠顶部居中（状态栏下方一点，以聊天页个性签名为准），仍可拖动并记忆 */
    let x=Number.isFinite(saved.x)?saved.x:(b.w-b.pw)/2;
    let y=Number.isFinite(saved.y)?saved.y:TOP_OFFSET;
    setPosition(x,y,false);
  }
  function placePanel(){
    if(!root||!panel)return;
    const b=bounds(),x=saved.x||0;
    const panelW=Math.min(310,b.w-28);
    /* 胶囊固定顶部、面板始终向下展开；靠近右缘则向右对齐，避免超出屏幕 */
    root.classList.toggle('panel-above-right',x+panelW>b.w-10);
  }
  function bindDrag(){
    const pill=document.getElementById('xj-music-pill');
    let drag=null;
    pill.addEventListener('pointerdown',e=>{
      if(e.target.closest('button')||e.button>0)return;
      drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:saved.x||0,top:saved.y||0};
      dragMoved=false;pill.setPointerCapture(e.pointerId);root.classList.add('dragging');setOpen(false);
    });
    pill.addEventListener('pointermove',e=>{
      if(!drag||drag.id!==e.pointerId)return;
      const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
      if(Math.abs(dx)+Math.abs(dy)>4)dragMoved=true;
      if(dragMoved)setPosition(drag.left+dx,drag.top+dy,false);
      e.preventDefault();
    });
    const finish=e=>{
      if(!drag||drag.id!==e.pointerId)return;
      root.classList.remove('dragging');
      /* v3.28.1：松手吸附到最近的停靠位（左缘 / 底部居中 / 右缘），不再强制贴边 */
      if(dragMoved){
        const b=bounds(),cx=saved.x+b.pw/2;
        let tx;
        if(cx<b.w*.28)tx=10;
        else if(cx>b.w*.72)tx=b.w-b.pw-10;
        else tx=(b.w-b.pw)/2;
        setPosition(tx,TOP_OFFSET,true);
      }
      drag=null;setTimeout(()=>{dragMoved=false;},0);
    };
    pill.addEventListener('pointerup',finish);pill.addEventListener('pointercancel',finish);
    pill.addEventListener('click',e=>{if(dragMoved){e.preventDefault();e.stopPropagation();}},true);
  }
  function syncVisibility(){
    if(!root)return;
    const blocked=document.querySelector('#screen-lock.active,#screen-splash.active,.call-overlay.active,#img-viewer');
    /* 用户未开启播放器（state.musicOn 默认 false）时同样隐藏 */
    const disabled=(typeof state!=='undefined')&&state&&state.musicOn===false;
    root.hidden=!!(blocked||disabled);
  }
  /* 供「我的 → 外观 → 显示音乐播放器」开关即时调用 */
  function setMusicPlayerVisible(visible){
    if(typeof state!=='undefined'&&state)state.musicOn=!!visible;
    syncVisibility();
  }
  window.setMusicPlayerVisible=setMusicPlayerVisible;
  /* 4.0：桌面第 2 页的「音乐」图标入口——
     播放器没开就先打开开关，再把播放列表面板展开（不是只显隐）。 */
  window.openMusicPanel=function(){
    if(typeof state!=='undefined'&&state&&state.musicOn!==true){
      state.musicOn=true;
      if(typeof saveKey==='function')saveKey('musicOn');
    }
    syncVisibility();
    if(!root||!panel)return;
    if(open){render();return;}
    open=true;root.classList.add('open');
    if(typeof placePanel==='function')placePanel();
    render();
  };
  function init(){
    phone=document.getElementById('phone');if(!phone||document.getElementById('xj-music'))return;
    root=document.createElement('section');root.id='xj-music';root.className='xj-music';root.setAttribute('aria-label','全局音乐播放器');root.innerHTML=template();
    phone.appendChild(root);panel=document.getElementById('xj-music-panel');audio=document.getElementById('xj-music-audio');
    audio.volume=Number.isFinite(saved.volume)?Math.max(0,Math.min(1,saved.volume)):.75;
    audio.addEventListener('play',render);audio.addEventListener('pause',render);audio.addEventListener('ended',()=>{
      if(repeat==='one'){audio.currentTime=0;play();}else select(index+1,true);
    });
    audio.addEventListener('timeupdate',updateTime);audio.addEventListener('durationchange',updateTime);audio.addEventListener('loadedmetadata',updateTime);
    audio.addEventListener('error',()=>{errorText='歌曲加载失败，请检查网络连接。';render();});
    audio.addEventListener('waiting',()=>root.classList.add('buffering'));audio.addEventListener('playing',()=>root.classList.remove('buffering'));
    root.addEventListener('click',e=>{
      const track=e.target.closest('[data-track]');if(track){select(Number(track.dataset.track),true);return;}
      const btn=e.target.closest('[data-action]');if(!btn)return;
      const a=btn.dataset.action;
      if(a==='play')togglePlay();else if(a==='prev')select(index-1,true);else if(a==='next')select(index+1,true);
      else if(a==='toggle')setOpen(!open);else if(a==='close')setOpen(false);
      else if(a==='repeat'){repeat=repeat==='one'?'all':'one';save();render();showToast(repeat==='one'?'单曲循环':'列表循环');}
    });
    document.getElementById('xj-music-seek').addEventListener('input',e=>{
      if(Number.isFinite(audio.duration)&&audio.duration>0){audio.currentTime=Number(e.target.value)/1000*audio.duration;updateTime();}
    });
    document.addEventListener('pointerdown',e=>{if(open&&root&&!root.contains(e.target))setOpen(false);});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&open)setOpen(false);});
    bindDrag();restorePosition();render();syncVisibility();
    const mo=new MutationObserver(syncVisibility);mo.observe(phone,{subtree:true,attributes:true,attributeFilter:['class','id']});
    const ro=new ResizeObserver(()=>{restorePosition();placePanel();});ro.observe(phone);
    window.addEventListener('resize',()=>{clearTimeout(positionTimer);positionTimer=setTimeout(()=>{restorePosition();placePanel();},100);});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
