/* =========================================================
   星迹 · 本地音乐播放器（v3.19.0，对标网易云·纯本地）
   - 桌面第 2 页：顶部当前播放卡片（便签位）+ 播放列表（心跳轨迹位）+ 图标位
   - 导入：<input multiple> 多选 / showDirectoryPicker 选文件夹（桌面 Edge/Chrome，自动降级）
   - 元数据：轻量 ID3v2 解析（标题/歌手/专辑/APIC 封面，GBK 兼容）；失败回退文件名解析
   - 存储：IndexedDB `music`（元数据 + 文件 Blob 持久化，歌曲记忆跨会话不丢）
   - 播放：单例 Audio 元素，切页/切 Tab 不中断；列表循环/单曲循环/随机
   - 位置记忆：{songId, time} 存 localStorage（3 秒节流），重进自动定位到上次进度
   - 悬浮小按钮：可拖动（y 位置记忆），tap 播放/暂停，桌面第 2 页自动隐藏
   ========================================================= */

const MU_KEY_POS = 'xj-music-pos';        // {id, t} 上次播放位置
const MU_KEY_SET = 'xj-music-settings';   // {mode, fabY, page} 模式/悬浮按钮位置/桌面页码

let muList = [];            // [{id,name,artist,album,cover,dur,blob,addedAt}]
let muCurId = null;         // 当前歌曲 id
let muAudio = null;         // 单例 Audio
let muCurUrl = null;        // 当前 objectURL（切换时 revoke）
let muSet = { mode: 'loop', fabY: null, page: 0 };
let muPosSaveT = 0;

function muLoadSet() { try { muSet = Object.assign(muSet, JSON.parse(localStorage.getItem(MU_KEY_SET) || '{}')); } catch (e) {} }
function muSaveSet() { try { localStorage.setItem(MU_KEY_SET, JSON.stringify(muSet)); } catch (e) {} }

/* ---------- 初始化 ---------- */
async function muInit() {
  muLoadSet();
  try { await dbReady; } catch (e) {}
  try { muList = (await dbGetAll('music')).sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0)); } catch (e) { muList = []; }
  muAudio = new Audio();
  muAudio.volume = (muSet.vol != null) ? muSet.vol : 1;
  muAudio.addEventListener('timeupdate', muOnTime);
  muAudio.addEventListener('ended', muOnEnded);
  muAudio.addEventListener('loadedmetadata', muOnMeta);
  muAudio.addEventListener('play', muRenderState);
  muAudio.addEventListener('pause', muRenderState);
  /* 位置记忆恢复：找到上次那首，定位进度（暂停待命） */
  let pos = null;
  try { pos = JSON.parse(localStorage.getItem(MU_KEY_POS) || 'null'); } catch (e) {}
  if (pos && pos.id != null) {
    const idx = muList.findIndex(x => x.id === pos.id);
    if (idx >= 0) { muCurId = pos.id; muPlayIndex(idx, pos.t || 0, true); }
  }
  muRenderAll();
  muBindMini();
  muRestorePage();
}

/* ---------- ID3v2 轻量解析（v2.3/v2.4：TIT2/TPE1/TALB/APIC） ---------- */
function muParseID3(buf) {
  try {
    const u8 = new Uint8Array(buf);
    if (u8.length < 10 || u8[0] !== 0x49 || u8[1] !== 0x44 || u8[2] !== 0x33) return null;
    const ver = u8[3];
    const size = ((u8[6] & 0x7f) << 21) | ((u8[7] & 0x7f) << 14) | ((u8[8] & 0x7f) << 7) | (u8[9] & 0x7f);
    const end = Math.min(10 + size, u8.length);
    let p = 10;
    if (u8[5] & 0x40) { p += 4; }   // 扩展头（忽略长度，简单跳过可能不准，仅 best effort）
    const out = {};
    const txt = (bytes, enc) => {
      try {
        if (enc === 1 || enc === 2) return new TextDecoder('utf-16').decode(bytes).replace(/\u0000+$/g, '');
        if (enc === 3) return new TextDecoder('utf-8').decode(bytes).replace(/\u0000+$/g, '');
        return new TextDecoder('gb18030').decode(bytes).replace(/\u0000+$/g, '');   // enc 0：中文常见 GBK
      } catch (e) { return ''; }
    };
    while (p + 10 <= end) {
      const id = String.fromCharCode(u8[p], u8[p + 1], u8[p + 2], u8[p + 3]);
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      let fsz;
      if (ver === 4) fsz = ((u8[p + 4] & 0x7f) << 21) | ((u8[p + 5] & 0x7f) << 14) | ((u8[p + 6] & 0x7f) << 7) | (u8[p + 7] & 0x7f);
      else fsz = (u8[p + 4] << 24) | (u8[p + 5] << 16) | (u8[p + 6] << 8) | u8[p + 7];
      if (fsz <= 0 || p + 10 + fsz > end) break;
      const body = u8.subarray(p + 10, p + 10 + fsz);
      if (id === 'TIT2') out.title = txt(body.subarray(1), body[0]);
      else if (id === 'TPE1') out.artist = txt(body.subarray(1), body[0]);
      else if (id === 'TALB') out.album = txt(body.subarray(1), body[0]);
      else if (id === 'APIC' && !out.cover) {
        let q = 1;
        while (q < body.length && body[q] !== 0) q++;     // mime
        const mime = String.fromCharCode.apply(null, body.subarray(1, q)) || 'image/jpeg';
        q++;                                               // \0
        q++;                                               // picture type
        if (body[q] === 0) q++; else { while (q < body.length && body[q] !== 0) q++; q++; }   // description（含 terminating）
        const img = body.subarray(q);
        if (img.length > 100) {
          try {
            let bin = ''; const CH = 8192;
            for (let i = 0; i < img.length; i += CH) bin += String.fromCharCode.apply(null, img.subarray(i, Math.min(i + CH, img.length)));
            out.cover = 'data:' + mime + ';base64,' + btoa(bin);
          } catch (e) {}
        }
      }
      p += 10 + fsz;
      if (out.title && out.artist && out.album && out.cover) break;
    }
    return out;
  } catch (e) { return null; }
}

/* 文件名解析：「歌手 - 歌名」 */
function muNameFromFile(filename) {
  const base = (filename || '').replace(/\.[^.]+$/, '').trim();
  const m = base.split(/\s+-\s+|\s+–\s+/);
  if (m.length >= 2) return { artist: m[0].trim(), name: m.slice(1).join(' - ').trim() };
  return { artist: '', name: base };
}

/* ---------- 导入 ---------- */
function _muBindInput() {
  let inp = document.getElementById('mu-file-input');
  if (!inp) {
    inp = document.createElement('input');
    inp.type = 'file'; inp.id = 'mu-file-input'; inp.multiple = true;
    inp.accept = 'audio/*,.mp3,.m4a,.flac,.wav,.ogg';
    inp.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
    inp.onchange = e => muImportFiles(Array.from(e.target.files || []));
    document.body.appendChild(inp);
  }
  inp.value = '';
  return inp;
}
function muImport() { _muBindInput().click(); }
async function muImportFolder() {
  if (!window.showDirectoryPicker) { muImport(); return; }   // 移动端降级多选
  try {
    const dir = await window.showDirectoryPicker();
    const files = [];
    async function walk(d) {
      for await (const [, h] of d.entries()) {
        if (h.kind === 'file') {
          if (/\.(mp3|m4a|flac|wav|ogg)$/i.test(h.name)) { try { files.push(await h.getFile()); } catch (e) {} }
        } else if (h.kind === 'directory') await walk(h);
      }
    }
    await walk(dir);
    if (!files.length) { showToast('文件夹里没有音频文件'); return; }
    muImportFiles(files);
  } catch (e) { /* 用户取消 */ }
}
async function muImportFiles(files) {
  if (!files || !files.length) return;
  showToast('正在导入 ' + files.length + ' 首…');
  let ok = 0, dup = 0;
  for (const f of files) {
    try {
      const exist = muList.find(x => x.name === f.name && x.size === f.size);
      if (exist) { dup++; continue; }
      const meta = muParseID3(await f.slice(0, Math.min(f.size, 1024 * 1024)).arrayBuffer()) || {};
      const fb = muNameFromFile(f.name);
      const rec = {
        name: (meta.title || fb.name || '未命名').trim(),
        artist: (meta.artist || fb.artist || '').trim(),
        album: (meta.album || '').trim(),
        cover: meta.cover || '',
        dur: 0,
        size: f.size,
        blob: f,
        addedAt: Date.now() + ok
      };
      const id = await dbPut('music', rec);
      rec.id = id; muList.push(rec); ok++;
    } catch (e) { console.error('导入失败', f.name, e); }
  }
  muList.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
  muRenderAll();
  showToast('已导入 ' + ok + ' 首' + (dup ? '，跳过重复 ' + dup : ''));
}

/* ---------- 播放控制 ---------- */
function muCur() { return muList.find(x => x.id === muCurId) || null; }
function muPlayIndex(idx, resumeT, silent) {
  if (idx < 0 || idx >= muList.length) return;
  const rec = muList[idx];
  if (!muAudio) { setTimeout(() => muPlayIndex(idx, resumeT, silent), 300); return; }
  try { if (muCurUrl) { URL.revokeObjectURL(muCurUrl); muCurUrl = null; } } catch (e) {}
  muCurUrl = URL.createObjectURL(rec.blob);
  muAudio.src = muCurUrl;
  muCurId = rec.id;
  muAudio.currentTime = resumeT || 0;
  if (!silent) muAudio.play().catch(() => {});
  else { muAudio.pause(); muAudio.currentTime = resumeT || 0; }
  muSavePos(true);
  muRenderAll();
}
function muToggle() {
  if (!muCurId) { if (muList.length) muPlayIndex(0); else muImport(); return; }
  if (muAudio.paused) muAudio.play().catch(() => {}); else muAudio.pause();
}
function muNext() { muStep(1); }
function muPrev() { muStep(-1); }
function muStep(dir) {
  if (!muList.length) return;
  let i = muList.findIndex(x => x.id === muCurId);
  if (muSet.mode === 'random' && muList.length > 1) {
    let r; do { r = Math.floor(Math.random() * muList.length); } while (r === i);
    i = r;
  } else {
    i = (i + dir + muList.length) % muList.length;
  }
  muPlayIndex(i);
}
function muOnEnded() {
  if (muSet.mode === 'one') { muAudio.currentTime = 0; muAudio.play().catch(() => {}); }
  else muStep(1);
}
function muOnMeta() {
  const rec = muCur();
  if (rec && muAudio.duration && isFinite(muAudio.duration)) {
    const d = Math.round(muAudio.duration);
    if (rec.dur !== d) { rec.dur = d; dbPut('music', rec).catch(() => {}); }
  }
  muRenderAll();
}
function muOnTime() {
  const now = Date.now();
  if (now - muPosSaveT > 3000) { muPosSaveT = now; muSavePos(); }
  if (muSeeking) return;
  const d = muAudio.duration || 0;
  const sl = document.getElementById('mu-seek');
  if (sl && d) sl.value = Math.round(muAudio.currentTime / d * 1000);
  const tc = document.getElementById('mu-t-cur');
  if (tc) tc.textContent = muFmt(muAudio.currentTime);
  const msl = document.getElementById('muf-seek');
  if (msl && d) msl.value = Math.round(muAudio.currentTime / d * 1000);
  const tc2 = document.getElementById('muf-t-cur');
  if (tc2) tc2.textContent = muFmt(muAudio.currentTime);
}
let muSeeking = false;
function muSeek(v) {
  if (!muAudio || !muAudio.duration) return;
  muSeeking = true;
  muAudio.currentTime = (v / 1000) * muAudio.duration;
  muSavePos();
  setTimeout(() => { muSeeking = false; }, 400);
}
function muSavePos(force) {
  if (muCurId == null) return;
  const t = muAudio ? muAudio.currentTime : 0;
  try { localStorage.setItem(MU_KEY_POS, JSON.stringify({ id: muCurId, t: force ? t : Math.round(t) })); } catch (e) {}
}
function muCycleMode() {
  const order = ['loop', 'one', 'random'];
  muSet.mode = order[(order.indexOf(muSet.mode) + 1) % order.length];
  muSaveSet();
  muRenderAll();
  showToast(muSet.mode === 'loop' ? '列表循环' : muSet.mode === 'one' ? '单曲循环' : '随机播放');
}
function muFmt(s) {
  s = Math.max(0, Math.floor(s || 0));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

/* ---------- 删除 ---------- */
function muDelete(id, ev) {
  if (ev) event.stopPropagation();
  const rec = muList.find(x => x.id === id); if (!rec) return;
  appConfirm('删除歌曲', '从列表移除「' + esc(rec.name) + '」？<br>不会删除源文件。', async () => {
    const wasCur = id === muCurId;
    try { await dbDelete('music', id); } catch (e) {}
    muList = muList.filter(x => x.id !== id);
    if (wasCur) {
      try { muAudio.pause(); } catch (e) {}
      const idx = Math.min(muList.length - 1, muList.findIndex(x => x.id === muCurId));
      muCurId = null;
      if (muList.length) muPlayIndex(Math.max(0, idx), 0, true);
    }
    muRenderAll();
    showToast('已移除');
  });
}

/* ---------- 渲染 ---------- */
function muRenderAll() { muRenderPlayer(); muRenderList(); muRenderMini(); muRenderFull(); muRenderAppIcon(); }
const _covBg = rec => rec && rec.cover ? 'url(' + rec.cover + ')' : 'linear-gradient(135deg,#8a6d4b,#c99a7a)';
function muRenderPlayer() {
  const rec = muCur();
  const cov = document.getElementById('mu-cover');
  if (cov) cov.style.backgroundImage = _covBg(rec);
  const t = document.getElementById('mu-title'), a = document.getElementById('mu-artist');
  if (t) t.textContent = rec ? rec.name : '未在播放';
  if (a) a.textContent = rec ? (rec.artist || '本地音乐') : '点此进入播放页 · 导入歌曲';
  const pi = document.getElementById('mu-play-ico');
  if (pi) pi.innerHTML = (muAudio && !muAudio.paused && muCurId) ? '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
}
/* 全屏黑胶页 */
function muRenderFull() {
  const rec = muCur();
  const cov = document.getElementById('muf-cover2');
  if (cov) cov.style.backgroundImage = _covBg(rec);
  const t = document.getElementById('muf-title'), a = document.getElementById('muf-artist');
  if (t) t.textContent = rec ? rec.name : '未在播放';
  if (a) a.textContent = rec ? (rec.artist || '本地音乐') : '导入本地歌曲开始聆听';
  const pi = document.getElementById('muf-play-ico');
  if (pi) pi.innerHTML = (muAudio && !muAudio.paused && muCurId) ? '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
  const playing = !!(muAudio && !muAudio.paused && muCurId);
  const disc = document.getElementById('muf-disc');
  if (disc) disc.classList.toggle('spin', playing);
  const arm = document.getElementById('muf-arm');
  if (arm) arm.classList.toggle('on', playing);
  const mt = document.getElementById('muf-mode-t');
  if (mt) mt.textContent = '· ' + (muSet.mode === 'loop' ? '列表循环' : muSet.mode === 'one' ? '单曲循环' : '随机播放');
  const te = document.getElementById('muf-t-end');
  if (te) te.textContent = muFmt(rec && rec.dur ? rec.dur : (muAudio && muAudio.duration) || 0);
}
/* 悬浮迷你控制条 */
function muRenderMini() {
  const m = document.getElementById('mu-mini');
  if (!m) return;
  const has = muList.length > 0;
  const appOpen = !!(document.getElementById('app-pages') && document.getElementById('app-pages').classList.contains('on'));
  const onDesk2 = !appOpen && deskCurPage() === 1;
  m.style.display = (has && !onDesk2) ? 'flex' : 'none';
  const rec = muCur();
  const cov = document.getElementById('mu-mini-cov');
  if (cov) cov.style.backgroundImage = _covBg(rec);
  const t = document.getElementById('mu-mini-t'), a = document.getElementById('mu-mini-a');
  if (t) t.textContent = rec ? rec.name : '未在播放';
  if (a) a.textContent = rec ? (rec.artist || '星迹音乐') : '星迹音乐';
  const p = document.getElementById('mu-mini-ico');
  if (p) p.innerHTML = (muAudio && !muAudio.paused && muCurId) ? '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
  m.style.opacity = muSet.miniOp != null ? muSet.miniOp : 1;
}
function muRenderList() {
  const host = document.getElementById('mu-list');
  const cnt = document.getElementById('mu-count');
  if (cnt) cnt.textContent = muList.length;
  if (!host) return;
  if (!muList.length) { host.innerHTML = '<div class="mu-empty">还没有歌曲<br><span style="font-size:11px">点上方「导入歌曲」或「选文件夹」，支持 MP3 / M4A / FLAC / WAV</span></div>'; return; }
  host.innerHTML = muList.map((x, i) => {
    const cur = x.id === muCurId;
    return '<div class="mu-item' + (cur ? ' on' : '') + '" onclick="muPlayById(' + x.id + ')">'
      + '<span class="mu-i-n">' + (cur && muAudio && !muAudio.paused ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="#8a6d4b"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>' : (i + 1)) + '</span>'
      + '<span class="mu-i-m"><b>' + esc(x.name) + '</b><i>' + esc(x.artist || '未知歌手') + (x.dur ? ' · ' + muFmt(x.dur) : '') + '</i></span>'
      + '<span class="mu-i-del" onclick="muDelete(' + x.id + ',1)">×</span></div>';
  }).join('');
  const curEl = host.querySelector('.mu-item.on');
  if (curEl) setTimeout(() => { try { curEl.scrollIntoView({ block: 'nearest' }); } catch (e) {} }, 30);
}
function muPlayById(id) {
  const idx = muList.findIndex(x => x.id === id);
  if (idx < 0) return;
  if (id === muCurId) { muToggle(); muRenderAll(); return; }
  muPlayIndex(idx);
}
function muRenderAppIcon() {
  const ico = document.getElementById('mu-app-ico');
  if (!ico) return;
  const rec = muCur();
  ico.style.backgroundImage = rec && rec.cover ? 'url(' + rec.cover + ')' : '';
  ico.style.backgroundSize = 'cover';
  ico.classList.toggle('mu-playing', !!(muAudio && !muAudio.paused && muCurId));
}
/* 状态变化只刷按钮/悬浮钮 */
function muRenderState() { muRenderPlayer(); muRenderList(); muRenderMini(); muRenderFull(); muRenderAppIcon(); }

/* ---------- 悬浮迷你控制条（自由拖动·位置记忆·长按切透明度） ---------- */
let _miniMoved = false, muFabMoved = false;
function muBindMini() {
  const m = document.getElementById('mu-mini');
  if (!m) return;
  let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false, pressT = 0, lpTimer = 0;
  m.addEventListener('pointerdown', e => {
    if (e.target.closest('.mu-mini-btn') || e.target.closest('.mu-mini-cov')) return;   // 控制钮不触发拖动
    dragging = true; _miniMoved = false;
    sx = e.clientX; sy = e.clientY;
    const r = m.getBoundingClientRect();
    ox = r.left; oy = r.top;
    try { m.setPointerCapture(e.pointerId); } catch (e2) {}
    pressT = Date.now();
    lpTimer = setTimeout(() => {   // 长按 600ms：循环透明度 100→75→45→100
      muFabMoved = true; dragging = false;
      const ops = [1, 0.75, 0.45];
      const i = ops.findIndex(o => Math.abs((muSet.miniOp == null ? 1 : muSet.miniOp) - o) < 0.05);
      muSet.miniOp = ops[(i + 1) % ops.length];
      m.style.opacity = muSet.miniOp;
      muSaveSet();
      if (typeof showToast === 'function') showToast('迷你条透明度 ' + Math.round(muSet.miniOp * 100) + '%');
    }, 600);
  });
  m.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) { muFabMoved = true; clearTimeout(lpTimer); }
    const r = m.getBoundingClientRect();
    let nx = ox + dx, ny = oy + dy;
    nx = Math.max(4, Math.min(window.innerWidth - r.width - 4, nx));
    ny = Math.max(46, Math.min(window.innerHeight - r.height - 4, ny));
    m.style.left = nx + 'px'; m.style.top = ny + 'px'; m.style.right = 'auto'; m.style.bottom = 'auto';
  });
  m.addEventListener('pointerup', () => {
    clearTimeout(lpTimer);
    if (dragging && _miniMoved) {
      muSet.miniX = parseFloat(m.style.left) || null;
      muSet.miniY = parseFloat(m.style.top) || null;
      muSaveSet();
      setTimeout(() => { _miniMoved = false; }, 60);
    }
    dragging = false;
  });
  if (muSet.miniX != null && muSet.miniY != null) {
    m.style.left = muSet.miniX + 'px'; m.style.top = muSet.miniY + 'px';
    m.style.right = 'auto'; m.style.bottom = 'auto';
  }
}
function muOpenFull() {
  if (typeof openApp === 'function') openApp('music');
  muRenderFull();
}
function muVol(v) {
  if (muAudio) muAudio.volume = Math.max(0, Math.min(1, v / 100));
  muSet.vol = v / 100; muSaveSet();
}
function muListPeek() {
  if (typeof openApp === 'function') { muSet.page = 1; muSaveSet(); }
  try { document.getElementById('desk-pages').scrollLeft = document.getElementById('desk-pages').clientWidth; } catch (e) {}
  if (typeof goBack === 'function') goBack();
  showToast('已回到桌面第 2 页的播放列表');
}

/* ---------- 桌面分页联动 ---------- */
function muRestorePage() {
  const pages = document.getElementById('desk-pages');
  if (!pages) return;
  const w = pages.clientWidth;
  if (muSet.page === 1 && w) pages.scrollLeft = w;
  muUpdateDots();
}
function deskCurPage() {
  const pages = document.getElementById('desk-pages');
  if (!pages) return 0;
  return Math.round(pages.scrollLeft / Math.max(1, pages.clientWidth));
}
function muBindDeskScroll() {
  const pages = document.getElementById('desk-pages');
  if (!pages || pages._muBound) return;
  pages._muBound = true;
  let t = 0;
  pages.addEventListener('scroll', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const p = deskCurPage();
      muSet.page = p; muSaveSet();
      muUpdateDots();
      muRenderMini();
    }, 120);
  }, { passive: true });
}
function muUpdateDots() {
  const dots = document.getElementById('desk-dots');
  if (!dots) return;
  const p = deskCurPage();
  dots.querySelectorAll('i').forEach((el, i) => el.classList.toggle('on', i === p));
}

/* ---------- 启动 ---------- */
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { muInit(); muBindDeskScroll(); });
else { muInit(); muBindDeskScroll(); }
