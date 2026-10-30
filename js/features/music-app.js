/* =========================================================
   星迹 · 音乐（4.2：独立页面）
   —— 顶部只留文字歌曲信息 + 控制行 + 进度条（去掉大唱片图标），卡片限宽居中。
   —— 五个视图：全部 / 本地 / 歌单（网易云导入）/ 收藏 / 我的歌单。
   —— 每行右侧：红心收藏 + ⋯（加入歌单 / 收藏 / 从当前列表移除）。
   —— 播放、循环、进度都在 music-player.js 里，悬浮胶囊同步。
   ========================================================= */

let muTab='all';
let muPlaylist=null;   /* 当前打开的自建歌单名 */

const MU_ICONS={
  play:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 5.5v13l10-6.5z"/></svg>',
  pause:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M9 5v14M15 5v14"/></svg>',
  prev:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 5v14M18 6l-9 6 9 6z"/></svg>',
  next:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M18 5v14M6 6l9 6-9 6z"/></svg>',
  repeat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l3 3-3 3M3 11V8a3 3 0 0 1 3-3h14M7 22l-3-3 3-3M21 13v3a3 3 0 0 1-3 3H4"/></svg>',
  one:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l3 3-3 3M3 11V8a3 3 0 0 1 3-3h14M7 22l-3-3 3-3M21 13v3a3 3 0 0 1-3 3H4"/><path d="M11 10h1v5M10 15h3"/></svg>',
  local:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>',
  net:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.6"/><path d="M3.6 12h16.8M12 3.4c2.6 2.4 2.6 14.8 0 17.2M12 3.4c-2.6 2.4-2.6 14.8 0 17.2"/></svg>',
  heart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9Z"/></svg>',
  heartOn:'<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9Z"/></svg>',
  more:'<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/></svg>',
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/></svg>'
};

function muFmt(s){
  if(!Number.isFinite(s)||s<0)return '0:00';
  return Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');
}

function setMuTab(t){
  muTab=t;
  if(t!=='lists') muPlaylist=null;
  renderMusic();
}

function openMuPlaylist(name){
  muTab='lists';
  muPlaylist=name||null;
  renderMusic();
}

/* 一行歌曲：序号 + 文字 + 红心 + 更多 */
function muRowHtml(key,index,title,artist,sub,playing){
  const M=window.XJMusic;
  const love=M&&M.isFav(index);
  return `<div class="mu-row${playing?' on':''}" data-key="${esc(key)}" onclick="muPlay('${esc(key)}')">
    <span class="mu-n">${playing?'♪':String(index+1).padStart(2,'0')}</span>
    <span class="mu-text"><b>${esc(title)}</b><span>${esc(artist)}${sub?' · '+esc(sub):''}</span></span>
    <button class="mu-ico${love?' on':''}" onclick="event.stopPropagation();muFav('${esc(key)}')" aria-label="${love?'取消收藏':'收藏'}">${love?MU_ICONS.heartOn:MU_ICONS.heart}</button>
    <button class="mu-ico" onclick="event.stopPropagation();muMore('${esc(key)}')" aria-label="更多">${MU_ICONS.more}</button>
  </div>`;
}

function renderMusic(){
  const body=document.getElementById('music-body');
  if(!body)return;
  const M=window.XJMusic;
  if(!M){body.innerHTML='<div class="empty">播放器还没准备好</div>';return;}

  const all=M.list();
  const cur=M.current();
  const playing=M.playing();
  const repeat=M.repeat();
  const t=M.time();
  const pct=t.dur>0?Math.min(100,t.cur/t.dur*100):0;
  const now=all[cur]||{title:'还没有歌',artist:''};
  const favs=M.favs();
  const lists=M.playlists();

  const local=all.filter(x=>x.kind==='local');
  const net=all.filter(x=>x.kind==='net');

  let rowsHtml='';
  let emptyHint='';
  if(muTab==='lists'&&muPlaylist){
    const songs=M.playlistSongs(muPlaylist);
    rowsHtml=songs.map(x=>muRowHtml(x.key,M.idxByKey(x.key),x.title,x.artist,'',false)).join('');
    emptyHint='这个歌单还是空的<br>点任意歌曲右侧 ⋯ → 加入歌单';
  }else if(muTab==='lists'){
    rowsHtml=lists.map(p=>`<div class="mu-row mu-pl" onclick="openMuPlaylist('${esc(p.name).replace(/'/g,"\\'")}')">
      <span class="mu-n">${MU_ICONS.local}</span>
      <span class="mu-text"><b>${esc(p.name)}</b><span>${p.count} 首</span></span>
      <button class="mu-ico" onclick="event.stopPropagation();muDelPlaylist('${esc(p.name).replace(/'/g,"\\'")}')" aria-label="删除歌单">${MU_ICONS.trash}</button>
    </div>`).join('');
    if(!lists.length)emptyHint='还没有歌单<br>点上面「新建歌单」开始整理';
  }else if(muTab==='fav'){
    rowsHtml=favs.map(f=>muRowHtml(f.key,M.idxByKey(f.key),f.title,f.artist,f.kind==='local'?'本地':'',false)).join('');
    emptyHint='还没有收藏<br>点歌曲右侧的 ♡ 收藏喜欢的歌';
  }else if(muTab==='local'){
    rowsHtml=local.map(x=>muRowHtml(M.keyOf(x.index),x.index,x.title,x.artist,'',x.index===cur&&playing)).join('');
    emptyHint='还没有本地音乐<br>点上面「本地音乐」选文件';
  }else if(muTab==='net'){
    rowsHtml=net.map(x=>muRowHtml(M.keyOf(x.index),x.index,x.title,x.artist,'',x.index===cur&&playing)).join('');
    emptyHint='还没有导入歌单<br>点上面「网易云歌单」粘贴链接';
  }else{
    rowsHtml=all.map(x=>muRowHtml(M.keyOf(x.index),x.index,x.title,x.artist,x.kind==='local'?'本地':x.kind==='net'?'歌单':'',x.index===cur&&playing)).join('');
    emptyHint='还没有歌<br>点上面「本地音乐」或「网易云歌单」';
  }

  const listHead=(muTab==='lists'&&muPlaylist)
    ? `<div class="mu-pl-head"><button class="mu-back" onclick="openMuPlaylist(null)" aria-label="返回歌单">‹</button><b>${esc(muPlaylist)}</b><span>${M.playlistSongs(muPlaylist).length} 首</span><button class="mu-pl-play" onclick="muPlayAll('${esc(muPlaylist).replace(/'/g,"\\'")}')">播放全部</button></div>`
    : '';

  body.innerHTML=`
    <div class="mu-hero">
      <div class="mu-hero-title">${esc(now.title||'还没有歌')}</div>
      <div class="mu-hero-artist">${esc(now.artist||'')}</div>
      <div class="mu-controls">
        <button class="mu-btn" onclick="XJMusic.prev()" aria-label="上一首">${MU_ICONS.prev}</button>
        <button class="mu-btn main" onclick="XJMusic.toggle()" aria-label="${playing?'暂停':'播放'}">${playing?MU_ICONS.pause:MU_ICONS.play}</button>
        <button class="mu-btn" onclick="XJMusic.next()" aria-label="下一首">${MU_ICONS.next}</button>
        <button class="mu-btn${repeat==='one'?' on':''}" onclick="XJMusic.toggleRepeat();renderMusic()" aria-label="循环模式" title="${repeat==='one'?'单曲循环':'列表循环'}">${repeat==='one'?MU_ICONS.one:MU_ICONS.repeat}</button>
      </div>
      <div class="mu-progress">
        <span>${muFmt(t.cur)}</span>
        <input type="range" min="0" max="100" value="${Math.round(pct)}" oninput="XJMusic.seekTo(Number(this.value))" aria-label="播放进度">
        <span>${muFmt(t.dur)}</span>
      </div>
    </div>

    <div class="mu-toolbar">
      <button class="mu-tool" onclick="XJMusic.addLocal()">${MU_ICONS.local}<span>本地音乐</span></button>
      <button class="mu-tool" onclick="XJMusic.importNetease()">${MU_ICONS.net}<span>网易云歌单</span></button>
      <button class="mu-tool" onclick="muNewPlaylist()">${MU_ICONS.plus}<span>新建歌单</span></button>
    </div>

    <div class="mu-tabs">
      <button class="mu-tab${muTab==='all'?' on':''}" onclick="setMuTab('all')">全部 <b>${all.length}</b></button>
      <button class="mu-tab${muTab==='local'?' on':''}" onclick="setMuTab('local')">本地 <b>${local.length}</b></button>
      <button class="mu-tab${muTab==='net'?' on':''}" onclick="setMuTab('net')">歌单 <b>${net.length}</b></button>
      <button class="mu-tab${muTab==='fav'?' on':''}" onclick="setMuTab('fav')">收藏 <b>${favs.length}</b></button>
      <button class="mu-tab${muTab==='lists'?' on':''}" onclick="setMuTab('lists')">我的歌单 <b>${lists.length}</b></button>
    </div>

    ${listHead}
    <div class="mu-list">
      ${rowsHtml||`<div class="empty" style="padding:26px 0">${emptyHint}</div>`}
    </div>

    <div class="mu-hint">播放时顶部会出现胶囊播放器（可在「我的 → 外观」关掉）。本地音乐存在本机，歌单只存链接；「从列表移除」不会删文件。</div>`;

  clearInterval(_muTick);
  if(playing){
    _muTick=setInterval(()=>{
      if(state.currentApp!=='music'){clearInterval(_muTick);return;}
      const tt=XJMusic.time();
      const p=tt.dur>0?Math.min(100,tt.cur/tt.dur*100):0;
      const r=document.querySelector('#app-music .mu-progress input');
      const spans=document.querySelectorAll('#app-music .mu-progress span');
      if(r&&document.activeElement!==r)r.value=Math.round(p);
      if(spans[0])spans[0].textContent=muFmt(tt.cur);
      if(spans[1])spans[1].textContent=muFmt(tt.dur);
    },600);
  }
}
let _muTick=0;

/* ---------- 页面动作 ---------- */
function muPlay(key){ const M=window.XJMusic; if(M){M.playKey(key); setTimeout(renderMusic,80);} }
function muFav(key){ const M=window.XJMusic; if(M){M.favByKey(key); renderMusic();} }
function muMore(key){ const M=window.XJMusic; if(M)M.menuByKey(key); }
function muPlayAll(name){
  const M=window.XJMusic; if(!M)return;
  const songs=M.playlistSongs(name);
  if(!songs.length){showToast('这个歌单还是空的');return;}
  M.playKey(songs[0].key); setTimeout(renderMusic,100);
}
function muNewPlaylist(){
  if(typeof askText!=='function')return;
  askText('新建歌单','','给歌单起个名字',(name)=>{
    const n=String(name||'').trim();
    if(!n)return;
    window.XJMusic.newPlaylist(n);
    muTab='lists'; muPlaylist=null; renderMusic();
  });
}
function muDelPlaylist(name){
  appConfirm('删除歌单','《'+name+'》会被删除，里面的歌不会从列表里消失。',()=>{
    window.XJMusic.removePlaylist(name);
    muPlaylist=null; renderMusic();
  });
}

function renderMusicPage(){
  muTab=muTab||'all';
  renderMusic();
  const M=window.XJMusic;
  if(M&&!renderMusicPage._bound){
    renderMusicPage._bound=1;
    M.onChange(()=>{if(state.currentApp==='music')renderMusic();});
  }
}

window.renderMusic=renderMusic;
window.renderMusicPage=renderMusicPage;
window.setMuTab=setMuTab;
window.openMuPlaylist=openMuPlaylist;
window.muPlay=muPlay;
window.muFav=muFav;
window.muMore=muMore;
window.muPlayAll=muPlayAll;
window.muNewPlaylist=muNewPlaylist;
window.muDelPlaylist=muDelPlaylist;
