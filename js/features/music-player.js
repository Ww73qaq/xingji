/* 星迹 · 全局紫晶音乐播放器
   独立 UI 组件：在线歌单、SPA 连续播放、拖动吸附、位置记忆。
   不读取或修改聊天、调度及 IndexedDB 业务数据。 */
(function(){
  'use strict';
  const MUSIC_BASE='https://ww73qaq.github.io/music/';
  const BUILTIN=[
    {title:'Lowkey',artist:'Aamir',file:'Aamir - Lowkey.mp3'},
    {title:'SEE ME 4 ME',artist:'Leah Marie Perez / Notkyle',file:'Leah Marie Perez Notkyle - SEE ME 4 ME.mp3'},
    {title:'Out of my system',artist:'Nia Nkuna',file:'Nia Nkuna - Out of my system.mp3'},
    {title:'call you tonight',artist:'郭小成 · Remix',file:'郭小成 - call you tonight (郭小成 Remix).mp3'},
    {title:'X',artist:'刘柏辛 Lexie',file:'刘柏辛Lexie - X.mp3'},
    {title:'沉浸式想念',artist:'赵希予（戏庭画）/ 肖倾月',file:'赵希予（戏庭画） 肖倾月 - 沉浸式想念.mp3'}
  ].map((t,i)=>({...t,id:i,kind:'builtin',url:MUSIC_BASE+encodeURIComponent(t.file)}));

  /* 4.0：三个音源合成一条播放列表
     builtin = 仓库里那 6 首在线歌；net = 网易云歌单导入（存 localStorage 的元数据）；local = 本地音乐（Blob 存在 IndexedDB 的 music 表） */
  const IMP_KEY='xingji.music.imported.v1';
  let imported=[];
  try{const raw=JSON.parse(localStorage.getItem(IMP_KEY)||'[]');imported=Array.isArray(raw)?raw.filter(t=>t&&t.url):[];}catch(_){imported=[];}
  let localTracks=[];
  let TRACKS=BUILTIN.slice();
  let listDirty=true;
  let curObjectUrl=null;
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
    note:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l11-2v13M9 9l11-2"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
    more:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>',
    heart:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9Z"/></svg>',
    heartOn:'<svg viewBox="0 0 24 24" aria-hidden="true"><path class="xj-fill" d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9Z"/></svg>'
  };
  let saved={};
  try{saved=JSON.parse(localStorage.getItem(STORE_KEY)||'{}')||{};}catch(_){saved={};}
  let index=Number.isInteger(saved.index)&&saved.index>=0&&saved.index<TRACKS.length?saved.index:0;
  let repeat=saved.repeat==='one'?'one':'all';
  let open=false,errorText='',dragMoved=false;
  let audio,root,panel,phone,positionTimer=0;
  /* 合辑重建：内置 → 导入 → 本地，顺序固定，index 越界时回到第一首 */
  function rebuildTracks(){
    const list=BUILTIN.slice();
    imported.forEach((t,i)=>list.push({id:'net-'+i,kind:'net',title:t.title||'未命名',artist:t.artist||'网易云歌单',url:t.url}));
    localTracks.forEach((t,i)=>list.push({id:'loc-'+t.id,kind:'local',localId:t.id,title:t.title||'本地音乐',artist:t.artist||'本地文件'}));
    /* 4.2：「从当前列表移除」只是把这些歌藏起来，文件还在 */
    TRACKS=list.filter(t=>!isHiddenTrack(t));
    if(!TRACKS.length){index=0;return;}
    if(!Number.isInteger(index)||index<0||index>=TRACKS.length)index=0;
  }
  /* 本地文件每次播放现开一个 objectURL，切歌时释放上一条，避免内存泄漏 */
  function trackUrl(t){
    if(!t)return '';
    if(t.kind==='local'){
      const rec=localTracks.find(x=>x.id===t.localId);
      if(!rec||!rec.blob)return '';
      if(curObjectUrl){try{URL.revokeObjectURL(curObjectUrl);}catch(_){}}
      curObjectUrl=URL.createObjectURL(rec.blob);
      return curObjectUrl;
    }
    return t.url||'';
  }
  function saveImported(){
    try{localStorage.setItem(IMP_KEY,JSON.stringify(imported));}catch(_){}
  }
  const save=()=>{
    try{localStorage.setItem(STORE_KEY,JSON.stringify({index,repeat,volume:audio?audio.volume:.75,x:saved.x,y:saved.y}));}catch(_){}
  };
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=s=>Number.isFinite(s)&&s>=0?Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0'):'0:00';
  function template(){
    /* 4.2：面板按「播放列表 + 上一首/播放/下一首 + 循环」的头部组织（对标参考图），
       去掉原来的大唱片块，面板头部就是唯一的控制区；胶囊改成两行文字（曲名 / 刹那·序号）。 */
    return '<div class="xj-music-panel" id="xj-music-panel" aria-label="播放列表">'
      +'<div class="xj-music-head"><b>播放列表</b><span id="xj-music-count"></span><button class="xj-music-btn xj-music-close" type="button" data-action="close" aria-label="收起播放列表">'+ICONS.close+'</button></div>'
      +'<div class="xj-music-controls"><button class="xj-music-btn" type="button" data-action="prev" aria-label="上一首">'+ICONS.prev+'</button><button class="xj-music-btn xj-music-play" type="button" data-action="play" aria-label="播放或暂停">'+ICONS.play+'</button><button class="xj-music-btn" type="button" data-action="next" aria-label="下一首">'+ICONS.next+'</button><button class="xj-music-btn xj-music-repeat" type="button" data-action="repeat" aria-label="切换循环模式">'+ICONS.repeat+'</button></div>'
      +'<div class="xj-music-progress"><span id="xj-music-current">0:00</span><input id="xj-music-seek" type="range" min="0" max="1000" value="0" aria-label="播放进度"><span id="xj-music-duration">0:00</span></div>'
      +'<div class="xj-music-list" id="xj-music-list"></div>'
      +'<div class="xj-music-tools"><button class="xj-music-tool" type="button" data-tool="local">本地音乐</button><button class="xj-music-tool" type="button" data-tool="net">导入歌单</button></div>'
      +'<div class="xj-music-error" id="xj-music-error" hidden></div></div>'
      +'<div class="xj-music-pill" id="xj-music-pill" aria-label="可拖动的音乐播放器">'
      +'<button class="xj-music-btn xj-music-play" type="button" data-action="play" aria-label="播放或暂停">'+ICONS.play+'</button>'
      +'<div class="xj-music-title"><b id="xj-music-pill-title"></b><span id="xj-music-pill-sub"></span></div>'
      +'<button class="xj-music-btn xj-music-expand" type="button" data-action="toggle" aria-label="展开播放列表" aria-expanded="false">'+ICONS.down+'</button></div>'
      +'<audio id="xj-music-audio" preload="metadata" playsinline></audio>';
  }
  function render(){
    if(!root)return;
    const t=TRACKS[index],playing=audio&&!audio.paused&&!audio.ended;
    root.classList.toggle('open',open);root.classList.toggle('playing',!!playing);
    document.getElementById('xj-music-pill-title').textContent=t.title;
    document.getElementById('xj-music-pill-sub').textContent=whichLabel(index)+' · '+String(index+1).padStart(2,'0')+'/'+String(TRACKS.length).padStart(2,'0');
    requestAnimationFrame(updateMarquee);
    root.querySelectorAll('[data-action="play"]').forEach(b=>{b.innerHTML=playing?ICONS.pause:ICONS.play;b.setAttribute('aria-label',playing?'暂停':'播放');});
    if(listDirty){renderList();listDirty=false;}
    root.querySelectorAll('.xj-music-track').forEach(b=>{const on=Number(b.dataset.track)===index;b.classList.toggle('on',on);b.setAttribute('aria-current',on?'true':'false');});
    const rb=root.querySelector('[data-action="repeat"]');rb.classList.toggle('on',repeat==='one');rb.innerHTML=repeat==='one'?ICONS.one:ICONS.repeat;rb.title=repeat==='one'?'单曲循环':'列表循环';
    const ex=root.querySelector('[data-action="toggle"]');ex.setAttribute('aria-expanded',open?'true':'false');ex.setAttribute('aria-label',open?'收起播放列表':'展开播放列表');
    const cnt=document.getElementById('xj-music-count');
    if(cnt)cnt.textContent=TRACKS.length+' 首';
    const err=document.getElementById('xj-music-error');err.hidden=!errorText;err.textContent=errorText;
    updateTime();updateMediaSession();updateMusicIcon();
    notifyChange();
  }

  /* 订阅：音乐页/桌面图标等外部 UI 在状态变化时重画 */
  const _subs=[];
  function notifyChange(){_subs.forEach(fn=>{try{fn();}catch(_){}});}

  /* 播放列表：每行 = 序号 + 歌名/歌手 + 红心 + 更多（加入歌单 / 收藏 / 从列表移除） */
  function renderList(){
    const box=document.getElementById('xj-music-list');if(!box)return;
    if(!TRACKS.length){box.innerHTML='<div class="xj-music-empty">还没有歌。点下面的「本地音乐」或「导入歌单」。</div>';return;}
    box.innerHTML=TRACKS.map((t,i)=>{
      const love=isFav(i);
      return '<div class="xj-music-track'+(i===index?' on':'')+'" role="button" tabindex="0" data-track="'+i+'">'
        +'<span class="xj-music-track-n">'+String(i+1).padStart(2,'0')+'</span>'
        +'<span class="xj-music-track-text"><b>'+esc(t.title)+'</b><span>'+esc(t.artist)+(t.kind==='local'?' · 本地':t.kind==='net'?' · 歌单':'')+'</span></span>'
        +'<button class="xj-music-rowbtn'+(love?' on':'')+'" type="button" data-fav="'+i+'" aria-label="'+(love?'取消收藏':'收藏')+'">'+(love?ICONS.heartOn:ICONS.heart)+'</button>'
        +'<button class="xj-music-rowbtn" type="button" data-more="'+i+'" aria-label="更多操作">'+ICONS.more+'</button>'
        +'</div>';
    }).join('');
  }

  /* 桌面第 2 页的「音乐」图标跟着当前歌走：播放中显示歌名，暂停回到「音乐」 */
  function updateMusicIcon(){
    const el=document.getElementById('mu-app-label');
    if(!el)return;
    const t=TRACKS[index];
    const playing=audio&&!audio.paused&&!audio.ended;
    el.textContent=(playing&&t)?('♪ '+String(t.title).slice(0,5)):'音乐';
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
    const u=trackUrl(t);
    if(!u){errorText='这首歌的文件找不到了，可能已被删除。';render();return;}
    audio.src=u;audio.load();render();
    if(autoplay)play();
  }
  async function play(){
    if(!audio)return;
    if(!audio.src){
      const u=trackUrl(TRACKS[index]);
      if(!u){errorText='这首歌的文件找不到了，可能已被删除。';render();return;}
      audio.src=u;
    }
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
    const b=bounds(),y=saved.y||0;
    /* 4.2：面板与胶囊同宽、左缘对齐；下方放不下时改为向上展开（panel-up） */
    const panelH=Math.min(panel.scrollHeight||360,b.h*.62);
    root.classList.toggle('panel-up', (y+54+panelH) > (b.h-10) && y>panelH);
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
        /* 4.1：纵向不再强制回到顶部——否则往下拖一下就被弹回去，看起来像「拖不动」 */
        setPosition(tx,saved.y,true);
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
    /* 4.1：在「音乐」独立页面里不再浮胶囊——那一页自己有完整的播放控件，
       胶囊浮在上面只会挡住标题和分组标签。 */
    const onMusicPage=(typeof state!=='undefined')&&state&&state.currentApp==='music';
    root.hidden=!!(blocked||disabled||onMusicPage);
  }
  /* 供「我的 → 外观 → 显示音乐播放器」开关即时调用 */
  function setMusicPlayerVisible(visible){
    if(typeof state!=='undefined'&&state)state.musicOn=!!visible;
    syncVisibility();
  }
  window.setMusicPlayerVisible=setMusicPlayerVisible;
  /* ===== 4.1：给「音乐」独立页面用的接口 ===== */
  window.XJMusic={
    list:()=>TRACKS.map((t,i)=>({index:i,title:t.title,artist:t.artist,kind:t.kind})),
    current:()=>index,
    repeat:()=>repeat,
    playing:()=>!!(audio&&!audio.paused&&!audio.ended),
    select:(i)=>{select(i,true);},
    toggle:()=>{if(!audio)return;if(audio.paused)play();else audio.pause();},
    next:()=>select(index+1,true),
    prev:()=>select(index-1,true),
    toggleRepeat:()=>{repeat=repeat==='one'?'all':'one';save();render();return repeat;},
    addLocal:()=>addLocalMusic(),
    importNetease:()=>importNetease(),
    remove:(i)=>removeTrack(i),
    /* 4.2：歌单 / 收藏 / 从列表移除 */
    keyOf:(i)=>{const t=TRACKS[i];return t?trackKey(t):'';},
    isFav:(i)=>isFav(i),
    toggleFav:(i)=>{const on=toggleFav(i);showToast(on?'已收藏':'已取消收藏');return on;},
    favs:()=>favs.map(f=>({key:f.key,title:f.title,artist:f.artist,kind:f.kind,url:f.url,localId:f.localId})),
    playlists:()=>playlists.map(p=>({name:p.name,count:p.songs.length})),
    playlistSongs:(n)=>playlistSongs(n),
    newPlaylist:(n)=>{const pl=newPlaylist(n);showToast(pl?'已新建《'+pl.name+'》':'歌单名不能为空');return pl;},
    removePlaylist:(n)=>{removePlaylist(n);showToast('已删除歌单');},
    addToPlaylist:(i,n)=>confirmAdd(i,n),
    pickPlaylist:(i)=>pickPlaylist(i),
    confirmAdd:(i,n)=>confirmAdd(i,n),
    createAndAdd:(i)=>createAndAdd(i),
    menu:(i)=>trackMenu(i),
    idxByKey:(k)=>idxByKey(k),
    favByKey:(k)=>{const i=idxByKey(k);if(i<0)return false;const on=toggleFav(i);showToast(on?'已收藏':'已取消收藏');return on;},
    menuByKey:(k)=>{const i=idxByKey(k);if(i>=0)trackMenu(i);},
    pickPlaylistByKey:(k)=>{const i=idxByKey(k);if(i>=0)pickPlaylist(i);},
    removeByKey:(k)=>{const i=idxByKey(k);if(i>=0){removeFromList(i);showToast('已从当前列表移除（文件还在）');}},
    playKey:(k)=>{playKey(k);},
    removeFromList:(i)=>{removeFromList(i);showToast('已从当前列表移除（文件还在）');},
    deleteLocal:(i)=>deleteLocalTrack(i),
    refresh:()=>loadLocal().then(()=>{render();notifyChange();}),
    seekTo:(pct)=>{if(audio&&Number.isFinite(audio.duration)&&audio.duration>0){audio.currentTime=pct/100*audio.duration;updateTime();}},
    time:()=>({cur:audio?audio.currentTime:0,dur:audio&&Number.isFinite(audio.duration)?audio.duration:0}),
    onChange:(fn)=>{if(typeof fn==='function')_subs.push(fn);}
  };
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
  /* =========================================================
     4.2 · 歌单 / 收藏 / 从列表移除
     —— 全部存 localStorage（“便利贴”）：只记曲名/歌手/地址，几十 KB。
     —— 本地音频文件仍然在 IndexedDB 的 music 表（“储物间”），删歌单不会动文件。
     ========================================================= */
  const PL_KEY='xingji.music.playlists.v1';
  const FAV_KEY='xingji.music.favs.v1';
  const HID_KEY='xingji.music.hidden.v1';
  function loadJSON(k,def){try{const v=JSON.parse(localStorage.getItem(k));return v==null?def:v;}catch(_){return def;}}
  function saveJSON(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(_){}}
  let playlists=loadJSON(PL_KEY,[]);
  if(!Array.isArray(playlists))playlists=[];
  playlists=playlists.filter(p=>p&&p.name).map(p=>({name:String(p.name),songs:Array.isArray(p.songs)?p.songs:[]}));
  let favs=loadJSON(FAV_KEY,[]);
  if(!Array.isArray(favs))favs=[];
  let hidden=loadJSON(HID_KEY,{urls:[],localIds:[]});
  if(!hidden||typeof hidden!=='object')hidden={urls:[],localIds:[]};
  if(!Array.isArray(hidden.urls))hidden.urls=[];
  if(!Array.isArray(hidden.localIds))hidden.localIds=[];

  function trackKey(t){return !t?'':(t.kind==='local'?('loc:'+t.localId):('url:'+t.url));}
  function metaOf(t){return t?{key:trackKey(t),title:t.title,artist:t.artist,kind:t.kind,url:t.url,localId:t.localId}:null;}
  function isHiddenTrack(t){
    const k=trackKey(t);
    return hidden.urls.indexOf(k)>=0||hidden.localIds.indexOf(k)>=0;
  }
  function isFav(i){const t=TRACKS[i];return !!t&&favs.some(f=>f&&f.key===trackKey(t));}
  function whichLabel(){return '此刻';}

  function toggleFav(i){
    const t=TRACKS[i];if(!t)return false;
    const k=trackKey(t);
    const at=favs.findIndex(f=>f&&f.key===k);
    if(at>=0)favs.splice(at,1);
    else favs.unshift(Object.assign(metaOf(t),{at:Date.now()}));
    saveJSON(FAV_KEY,favs);
    render();notifyChange();
    return at<0;
  }
  /* 从「当前列表」移除：只写 hidden，**不删本地文件**（文件仍在 music 表里，可以再导入回来） */
  function removeFromList(i){
    const t=TRACKS[i];if(!t)return;
    const k=trackKey(t);
    /* 只写对应那一栏：本地曲进 localIds，在线/歌单曲进 urls */
    if(t.kind==='local'){ if(hidden.localIds.indexOf(k)<0)hidden.localIds.push(k); }
    else { if(hidden.urls.indexOf(k)<0)hidden.urls.push(k); }
    saveJSON(HID_KEY,hidden);
    rebuildTracks();
    if(index>=TRACKS.length)index=Math.max(0,TRACKS.length-1);
    listDirty=true;save();render();notifyChange();
  }
  /* 真删本地文件（单独入口，二次确认在页面里做） */
  async function deleteLocalTrack(i){
    const t=TRACKS[i];if(!t||t.kind!=='local')return;
    try{await dbDelete('music',t.localId);}catch(_){}
    await loadLocal();
    if(index>=TRACKS.length)index=Math.max(0,TRACKS.length-1);
    listDirty=true;save();render();notifyChange();
  }
  function newPlaylist(name){
    const n=String(name||'').trim();
    if(!n)return null;
    if(playlists.some(p=>p.name===n))return playlists.find(p=>p.name===n);
    const pl={name:n,songs:[]};
    playlists.push(pl);saveJSON(PL_KEY,playlists);notifyChange();
    return pl;
  }
  function removePlaylist(name){
    playlists=playlists.filter(p=>p.name!==name);
    saveJSON(PL_KEY,playlists);notifyChange();
  }
  function addToPlaylist(i,name){
    const t=TRACKS[i];if(!t)return false;
    const pl=newPlaylist(name);if(!pl)return false;
    const k=trackKey(t);
    if(pl.songs.some(x=>x&&x.key===k))return false;
    pl.songs.push(metaOf(t));
    saveJSON(PL_KEY,playlists);notifyChange();
    return true;
  }
  function playlistSongs(name){
    const pl=playlists.find(p=>p.name===name);
    return pl?pl.songs.slice():[];
  }
  /* 从歌单/收藏里点播：先把这首从 hidden 里放出来，再定位播放 */
  function playKey(key){
    if(!key)return;
    hidden.urls=hidden.urls.filter(x=>x!==key);
    hidden.localIds=hidden.localIds.filter(x=>x!==key);
    saveJSON(HID_KEY,hidden);
    rebuildTracks();listDirty=true;
    const idx=TRACKS.findIndex(t=>trackKey(t)===key);
    if(idx>=0)select(idx,true);else render();
    notifyChange();
  }
  function idxByKey(k){
    if(!k)return -1;
    let i=TRACKS.findIndex(t=>trackKey(t)===k);
    if(i>=0)return i;
    hidden.urls=hidden.urls.filter(x=>x!==k);
    hidden.localIds=hidden.localIds.filter(x=>x!==k);
    saveJSON(HID_KEY,hidden);
    rebuildTracks();listDirty=true;
    return TRACKS.findIndex(t=>trackKey(t)===k);
  }
  /* 行内「更多」：加入歌单 / 收藏 / 从当前列表移除 */
  function trackMenu(i){
    const t=TRACKS[i];if(!t)return;
    const love=isFav(i);
    setOpen(false);
    showModal('这首歌',
      '<div class="xj-sheet">'
      +'<div class="xj-sheet-song"><b>'+esc(t.title)+'</b><span>'+esc(t.artist)+'</span></div>'
      +'<div class="xj-sheet-item" onclick="closeModal();XJMusic.pickPlaylist('+i+')"><span>加入歌单</span></div>'
      +'<div class="xj-sheet-item" onclick="closeModal();XJMusic.toggleFav('+i+');"><span>'+(love?'取消收藏':'收藏这首歌')+'</span></div>'
      +'<div class="xj-sheet-item danger" onclick="closeModal();XJMusic.removeFromList('+i+');"><span>从当前列表移除</span></div>'
      +'</div>',
      '<div class="modal-btn-row single"><button class="modal-btn" onclick="closeModal()">取消</button></div>');
  }
  /* 选择歌单：已有歌单 + 新建 */
  function pickPlaylist(i){
    const t=TRACKS[i];if(!t)return;
    const rows=playlists.length
      ? playlists.map(p=>'<div class="xj-sheet-item" onclick="XJMusic.confirmAdd('+i+',\''+esc(p.name).replace(/'/g,"\\'")+'\')"><span>'+esc(p.name)+'</span><i>'+p.songs.length+' 首</i></div>').join('')
      : '<div class="xj-sheet-empty">还没有歌单</div>';
    showModal('加入歌单',
      '<div class="xj-sheet">'+rows
      +'<div class="xj-sheet-item accent" onclick="XJMusic.createAndAdd('+i+')"><span>＋ 新建歌单</span></div></div>',
      '<div class="modal-btn-row single"><button class="modal-btn" onclick="closeModal()">取消</button></div>');
  }
  function confirmAdd(i,name){
    const ok=addToPlaylist(i,name);
    closeModal();
    showToast(ok?('已加入《'+name+'》'):('《'+name+'》里已经有这首了'));
    notifyChange();
  }
  function createAndAdd(i){
    closeModal();
    if(typeof askText!=='function')return;
    askText('新建歌单','','给歌单起个名字',(name)=>{
      const n=String(name||'').trim();
      if(!n)return;
      const ok=addToPlaylist(i,n);
      showToast(ok?('已加入《'+n+'》'):('《'+n+'》里已经有这首了'));
      notifyChange();
    });
  }

  /* ---------- 本地音乐（Blob 存 IndexedDB 的 music 表，v3.19.0 就有这张表） ---------- */
  async function loadLocal(){
    try{localTracks=(await dbGetAll('music'))||[];}catch(_){localTracks=[];}
    localTracks.sort((a,b)=>(a.addedAt||0)-(b.addedAt||0));
    rebuildTracks();listDirty=true;
  }
  function addLocalMusic(){
    const input=document.createElement('input');
    input.type='file';input.accept='audio/*';input.multiple=true;
    input.onchange=async e=>{
      const files=[...(e.target.files||[])].slice(0,20);
      if(!files.length)return;
      showToast('正在导入…');
      let ok=0;
      for(const f of files){
        try{
          await dbPut('music',{title:f.name.replace(/\.[^.]+$/,''),artist:'本地音乐',blob:f,addedAt:Date.now()});
          ok++;
        }catch(_){}
      }
      await loadLocal();render();
      showToast(ok?('已导入 '+ok+' 首本地音乐'):'导入失败，可能是存储空间不足');
    };
    input.click();
  }
  /* 旧入口（行内 × 已不再渲染）：保留兼容，行为＝真删本地 / 移除导入元数据 */
  async function removeTrack(i){
    const t=TRACKS[i];if(!t||t.kind==='builtin')return;
    if(t.kind==='local'){
      try{await dbDelete('music',t.localId);}catch(_){}
      await loadLocal();
    }else{
      imported=imported.filter(x=>x.url!==t.url);
      saveImported();rebuildTracks();listDirty=true;
    }
    if(index>=TRACKS.length)index=0;
    save();render();notifyChange();
    showToast('已移除');
  }

  /* ---------- 网易云歌单导入 ----------
     走公共解析接口（Meting 系），失败就明确告诉用户，不假装成功。
     只存歌名/歌手/播放地址，音频仍然在对方 CDN 上，不进本地、不进安装包。 */
  function importNetease(){
    /* 用应用内输入弹窗（安卓 WebView 没有 window.prompt） */
    askText('导入歌单','' , '粘贴网易云歌单链接或歌单 ID', (raw)=>{ importNeteaseById(raw); });
  }
  async function importNeteaseById(raw){
    const m=String(raw||'').match(/(\d{5,})/);
    if(!m){showToast('没认出歌单 ID');return;}
    const id=m[1];
    showToast('正在读取歌单…');
    const apis=[
      'https://api.injahow.cn/meting/?type=playlist&id='+id,
      'https://api.i-meto.com/meting/api?server=netease&type=playlist&id='+id
    ];
    let list=null;
    for(const api of apis){
      try{
        const r=await fetch(api,{cache:'no-store'});
        if(!r.ok)continue;
        const j=await r.json();
        if(Array.isArray(j)&&j.length){list=j;break;}
      }catch(_){}
    }
    if(!list){
      showToast('歌单接口暂时用不了，可以先用「本地音乐」导入');
      return;
    }
    const seen=new Set(imported.map(t=>t.url));
    let add=0;
    for(const it of list){
      const url=it.url||it.src||'';
      const title=it.name||it.title||'';
      if(!url||!title||seen.has(url))continue;
      if(imported.length>=100)break;
      imported.push({title,artist:String(it.artist||it.author||'网易云歌单'),url});
      seen.add(url);add++;
    }
    saveImported();rebuildTracks();listDirty=true;
    if(add){save();render();showToast('已导入 '+add+' 首');}
    else showToast('这个歌单里没有可播放的曲目');
  }

  /* ---------- TA 偶尔会自己换个播放模式 ---------- */
  let taMusicTimer=0;
  function scheduleTaMusicTouch(){
    clearTimeout(taMusicTimer);
    taMusicTimer=setTimeout(()=>{
      try{
        const name=(typeof state!=='undefined'&&state&&state.other&&state.other.name)||'TA';
        const on=typeof state!=='undefined'&&state&&state.musicOn;
        if(on&&audio&&!audio.paused&&root&&!root.hidden){
          const p=Number(state.prob&&state.prob.taMusicSwitchProb);
          const prob=Number.isFinite(p)?p:8;
          if(Math.random()*100<prob){
            const toOne=repeat!=='one';
            repeat=toOne?'one':'all';save();render();
            showToast(name+(toOne?'把播放模式换成了单曲循环':'把播放模式换回了列表循环'));
          }
        }
      }catch(_){}
      scheduleTaMusicTouch();
    },(3*60+Math.random()*2*60)*1000);
  }

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
      const fav=e.target.closest('[data-fav]');
      if(fav){e.preventDefault();e.stopPropagation();const on=toggleFav(Number(fav.dataset.fav));showToast(on?'已收藏':'已取消收藏');return;}
      const more=e.target.closest('[data-more]');
      if(more){e.preventDefault();e.stopPropagation();trackMenu(Number(more.dataset.more));return;}
      const del=e.target.closest('[data-del]');
      if(del){e.preventDefault();e.stopPropagation();removeTrack(Number(del.dataset.del));return;}
      const tool=e.target.closest('[data-tool]');
      if(tool){const k=tool.dataset.tool;if(k==='local')addLocalMusic();else if(k==='net')importNetease();return;}
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
    loadLocal().then(()=>render());
    scheduleTaMusicTouch();
    const mo=new MutationObserver(syncVisibility);mo.observe(phone,{subtree:true,attributes:true,attributeFilter:['class','id']});
    const ro=new ResizeObserver(()=>{restorePosition();placePanel();});ro.observe(phone);
    window.addEventListener('resize',()=>{clearTimeout(positionTimer);positionTimer=setTimeout(()=>{restorePosition();placePanel();},100);});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
