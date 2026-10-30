/* =========================================================
   星迹 · 音乐（4.1：独立页面）
   —— 桌面第 2 页「音乐」图标进来的是这个完整页面，不再只是展开悬浮胶囊。
   —— 三个来源：内置在线歌曲 / 本地音乐（可增删）/ 网易云歌单（可增删）。
   —— 页面只负责「看和点」，真正的播放、循环、进度都在 music-player.js 里，悬浮胶囊同步。
   ========================================================= */

let muTab='all';

const MU_ICONS={
  play:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 5.5v13l10-6.5z"/></svg>',
  pause:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M9 5v14M15 5v14"/></svg>',
  prev:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 5v14M18 6l-9 6 9 6z"/></svg>',
  next:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M18 5v14M6 6l9 6-9 6z"/></svg>',
  repeat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l3 3-3 3M3 11V8a3 3 0 0 1 3-3h14M7 22l-3-3 3-3M21 13v3a3 3 0 0 1-3 3H4"/></svg>',
  one:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l3 3-3 3M3 11V8a3 3 0 0 1 3-3h14M7 22l-3-3 3-3M21 13v3a3 3 0 0 1-3 3H4"/><path d="M11 10h1v5M10 15h3"/></svg>',
  note:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
  local:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>',
  net:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.6"/><path d="M3.6 12h16.8M12 3.4c2.6 2.4 2.6 14.8 0 17.2M12 3.4c-2.6 2.4-2.6 14.8 0 17.2"/></svg>'
};

function muFmt(s){
  if(!Number.isFinite(s)||s<0)return '0:00';
  return Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');
}

function setMuTab(t){
  muTab=t;
  document.querySelectorAll('#app-music .mu-tab').forEach(b=>b.classList.toggle('on',b.dataset.mu===t));
  renderMusic();
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
  const local=all.filter(x=>x.kind==='local');
  const net=all.filter(x=>x.kind==='net');
  const shown=muTab==='local'?local:muTab==='net'?net:all;

  body.innerHTML=`
    <div class="mu-hero">
      <div class="mu-disc${playing?' spin':''}">${MU_ICONS.note}</div>
      <div class="mu-hero-meta">
        <div class="mu-hero-title">${esc(now.title||'还没有歌')}</div>
        <div class="mu-hero-artist">${esc(now.artist||'')}</div>
      </div>
      <div class="mu-controls">
        <button class="mu-btn" onclick="XJMusic.prev()" aria-label="上一首">${MU_ICONS.prev}</button>
        <button class="mu-btn main" onclick="XJMusic.toggle()" aria-label="${playing?'暂停':'播放'}">${playing?MU_ICONS.pause:MU_ICONS.play}</button>
        <button class="mu-btn" onclick="XJMusic.next()" aria-label="下一首">${MU_ICONS.next}</button>
        <button class="mu-btn${repeat==='one'?' on':''}" onclick="XJMusic.toggleRepeat();renderMusic()" aria-label="循环模式" title="${repeat==='one'?'单曲循环':'列表循环'}">${repeat==='one'?MU_ICONS.one:MU_ICONS.repeat}</button>
      </div>
      <div class="mu-progress">
        <span>${muFmt(t.cur)}</span>
        <input type="range" min="0" max="100" value="${Math.round(pct)}" oninput="XJMusic.seekTo(Number(this.value));updateMuProgressText()" aria-label="播放进度">
        <span>${muFmt(t.dur)}</span>
      </div>
    </div>

    <div class="mu-toolbar">
      <button class="mu-tool" onclick="XJMusic.addLocal()">${MU_ICONS.local}<span>本地音乐</span></button>
      <button class="mu-tool" onclick="XJMusic.importNetease()">${MU_ICONS.net}<span>网易云歌单</span></button>
    </div>

    <div class="mu-tabs">
      <button class="mu-tab${muTab==='all'?' on':''}" data-mu="all" onclick="setMuTab('all')">全部 <b>${all.length}</b></button>
      <button class="mu-tab${muTab==='local'?' on':''}" data-mu="local" onclick="setMuTab('local')">本地 <b>${local.length}</b></button>
      <button class="mu-tab${muTab==='net'?' on':''}" data-mu="net" onclick="setMuTab('net')">歌单 <b>${net.length}</b></button>
    </div>

    <div class="mu-list">
      ${shown.length?shown.map(x=>`
        <div class="mu-row${x.index===cur?' on':''}" onclick="XJMusic.select(${x.index});renderMusic()">
          <span class="mu-n">${x.index===cur&&playing?'♪':String(x.index+1).padStart(2,'0')}</span>
          <span class="mu-text"><b>${esc(x.title)}</b><span>${esc(x.artist)}${x.kind==='local'?' · 本地':x.kind==='net'?' · 歌单':''}</span></span>
          ${x.kind==='builtin'?'':`<span class="mu-del" onclick="event.stopPropagation();muRemove(${x.index})" aria-label="移除">×</span>`}
        </div>`).join(''):`<div class="empty" style="padding:26px 0">${muTab==='local'?'还没有本地音乐<br>点上面的「本地音乐」选文件':muTab==='net'?'还没有导入歌单<br>点上面的「网易云歌单」粘贴链接':'还没有歌'}</div>`}
    </div>

    <div class="mu-hint">播放时会同时在顶部出现胶囊播放器（可在「我的 → 外观」里关掉）。本地音乐存在本机，歌单只存链接。</div>`;

  /* 进度条跟随播放：只在页面停留时刷新，避免整页重画 */
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
    },500);
  }
}
let _muTick=0;
function updateMuProgressText(){/* 拖动时只更新左右时间，等 timeupdate 再对齐 */}

function muRemove(i){
  const M=window.XJMusic;if(!M)return;
  const list=M.list();
  const t=list[i];
  if(!t)return;
  appConfirm('从列表移除','「'+(t.title||'这首歌')+'」会从列表里移除'+(t.kind==='local'?'，本地文件也一起删掉。':'，可以再导入回来。'),()=>{
    M.remove(i);
    setTimeout(()=>{M.refresh();renderMusic();},60);
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
window.muRemove=muRemove;
window.updateMuProgressText=updateMuProgressText;
