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
  muPls = muPlLoad();
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

function muRenderAppIcon() {
  const ico = document.getElementById('mu-app-ico');
  if (!ico) return;
  const rec = muCur();
  ico.style.backgroundImage = rec && rec.cover ? 'url(' + rec.cover + ')' : '';
  ico.style.backgroundSize = 'cover';
  ico.classList.toggle('mu-playing', !!(muAudio && !muAudio.paused && muCurId));
}
function muRenderState() { muRenderAll(); }

/* ---------- 删除 ---------- */
function muDelete(id, ev) {
  if (ev) event.stopPropagation();
  const rec = muList.find(x => x.id === id); if (!rec) return;
  appConfirm('删除歌曲', '从列表移除「' + esc(rec.name) + '」？<br>不会删除源文件。', async () => {
    const wasCur = id === muCurId;
    try { await dbDelete('music', id); } catch (e) {}
    muList = muList.filter(x => x.id !== id);
    muPls.forEach(pl => { pl.ids = pl.ids.filter(x => x !== id); });
    muPlSave();
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

/* ---------- 渲染总入口 ---------- */
function muRenderAll() {
  muRenderPlayer();      // 桌面第2页摘要条
  muRenderListTab();     // Tab1 全部列表
  muRenderPl();          // Tab2 歌单
  muRenderSet();         // Tab3 设置
  muRenderBar();         // APP 内常驻迷你条
  muRenderMini();        // 悬浮迷你条（APP 外）
  muRenderFull();        // 全屏播放页
  muRenderAppIcon();     // 图标位状态
}
const _covBg = rec => rec && rec.cover ? 'url(' + rec.cover + ')' : 'linear-gradient(135deg,#8a6d4b,#c99a7a)';

/* 桌面第2页摘要条 */
function muRenderPlayer() {
  const rec = muCur();
  const cov = document.getElementById('mu-cover');
  if (cov) cov.style.backgroundImage = _covBg(rec);
  const t = document.getElementById('mu-title'), a = document.getElementById('mu-artist');
  if (t) t.textContent = rec ? rec.name : '未在播放';
  if (a) a.textContent = rec ? (rec.artist || '点此进入音乐 APP') : '点此进入音乐 · 导入歌曲';
  const pi = document.getElementById('mu-play-ico');
  if (pi) pi.innerHTML = (muAudio && !muAudio.paused && muCurId) ? '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
}

/* 全屏播放页（浅色卡片式） */
function muRenderFull() {
  const rec = muCur();
  const cov = document.getElementById('muf-cover2');
  if (cov) cov.style.backgroundImage = _covBg(rec);
  const t = document.getElementById('muf-title'), a = document.getElementById('muf-artist');
  if (t) t.textContent = rec ? rec.name : '未在播放';
  if (a) a.textContent = rec ? (rec.artist || '本地音乐') : '导入本地歌曲开始聆听';
  const pi = document.getElementById('muf-play-ico');
  if (pi) pi.innerHTML = (muAudio && !muAudio.paused && muCurId) ? '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
  const mt = document.getElementById('muf-mode-t');
  if (mt) mt.textContent = '· ' + (muSet.mode === 'loop' ? '列表循环' : muSet.mode === 'one' ? '单曲循环' : '随机播放');
  const te = document.getElementById('muf-t-end');
  if (te) te.textContent = muFmt(rec && rec.dur ? rec.dur : (muAudio && muAudio.duration) || 0);
  const vs = document.getElementById('muf-vol');
  if (vs && muAudio) vs.value = Math.round((muAudio.volume || 1) * 100);
}

/* Tab 切换 */
function muTab(t) {
  muSet.tab = t; muSaveSet();
  ['list', 'pl', 'set'].forEach(k => {
    const pg = document.getElementById('mu-tab-' + k);
    if (pg) pg.style.display = k === t ? '' : 'none';
  });
  document.querySelectorAll('#mu-tabbar .mu-ti').forEach(el => el.classList.toggle('on', el.dataset.t === t));
  if (t === 'list') muRenderListTab();
  if (t === 'pl') muRenderPl();
  if (t === 'set') muRenderSet();
}

/* Tab1 全部列表（搜索过滤 + 加入歌单 + 删除） */
function muRenderListTab() {
  const host = document.getElementById('mu-list');
  if (!host) return;
  const qEl = document.getElementById('mu-q');
  const q = (qEl && qEl.value || '').trim().toLowerCase();
  const list = muList.filter(x => !q || (x.name || '').toLowerCase().includes(q) || (x.artist || '').toLowerCase().includes(q));
  if (!muList.length) {
    host.innerHTML = '<div class="mu-empty">还没有歌曲<br><span style="font-size:11px">点右上角「＋」导入，支持 MP3 / M4A / FLAC / WAV<br>桌面浏览器还可「选文件夹」整包导入</span></div>';
    return;
  }
  if (!list.length) { host.innerHTML = '<div class="mu-empty">没有匹配「' + esc(q) + '」的歌曲</div>'; return; }
  host.innerHTML = list.map((x, i) => {
    const cur = x.id === muCurId;
    return '<div class="mu-row' + (cur ? ' on' : '') + '" onclick="muPlayById(' + x.id + ')">'
      + '<span class="mu-i-n">' + (i + 1) + '</span>'
      + '<span class="mu-i-m"><b>' + esc(x.name) + '</b><i>' + esc(x.artist || '未知歌手') + (x.dur ? ' · ' + muFmt(x.dur) : '') + '</i></span>'
      + '<span class="mu-i-add" title="加入歌单" onclick="event.stopPropagation();muAddToPl(' + x.id + ')">＋</span>'
      + '<span class="mu-i-del" title="移除" onclick="event.stopPropagation();muDelete(' + x.id + ')">×</span></div>';
  }).join('');
}

/* Tab2 歌单 */
function muPlLoad() { try { return JSON.parse(localStorage.getItem('xj-music-playlists') || '[]'); } catch (e) { return []; } }
function muPlSave() { try { localStorage.setItem('xj-music-playlists', JSON.stringify(muPls)); } catch (e) {} }
let muPls = [];
let muPlView = null;   // null=歌单列表视图，数字=某歌单下标

function muRenderPl() {
  const host = document.getElementById('mu-pl-body');
  if (!host) return;
  if (muPlView == null) {
    host.innerHTML = '<div class="mu-pl-add" onclick="muPlCreate()">＋ 新建歌单</div>'
      + (muPls.length ? muPls.map((p, i) => '<div class="mu-row" onclick="muPlOpen(' + i + ')"><span class="mu-i-n"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#8a6d4b" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="9" width="12" height="12" rx="2"/><path d="M9 13h6M9 17h4"/></svg></span><span class="mu-i-m"><b>' + esc(p.name) + '</b><i>' + p.ids.length + ' 首</i></span><span class="mu-i-del" onclick="event.stopPropagation();muPlDel(' + i + ')">×</span></div>').join('')
      : '<div class="mu-empty">还没有歌单<br><span style="font-size:11px">点「＋ 新建歌单」，再在「全部」里点 ＋ 收歌</span></div>');
    return;
  }
  const p = muPls[muPlView];
  if (!p) { muPlView = null; muRenderPl(); return; }
  const songs = p.ids.map(id => muList.find(x => x.id === id)).filter(Boolean);
  host.innerHTML = '<div class="mu-pl-head" onclick="muPlView=null;muRenderPl()"><span class="mu-back-ico">‹</span><b>' + esc(p.name) + '</b><i>' + songs.length + ' 首</i><span class="mu-lbtn" onclick="event.stopPropagation();muPlPlay(' + muPlView + ')">播放全部</span></div>'
    + (songs.length ? songs.map(x => '<div class="mu-row' + (x.id === muCurId ? ' on' : '') + '" onclick="muPlayById(' + x.id + ')"><span class="mu-i-m"><b>' + esc(x.name) + '</b><i>' + esc(x.artist || '未知歌手') + '</i></span><span class="mu-i-del" title="移出歌单" onclick="event.stopPropagation();muPlRemove(' + muPlView + ',' + x.id + ')">×</span></div>').join('')
    : '<div class="mu-empty">歌单还是空的<br><span style="font-size:11px">去「全部」里点歌曲旁的 ＋ 收进来</span></div>');
}
function muPlCreate() {
  showModal('新建歌单',
    '<input id="mu-pl-name" placeholder="歌单名称" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--input);border-radius:10px;font-size:14px">',
    '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button><button class="modal-btn primary" onclick="muPlCreateDo()">创建</button></div>');
  setTimeout(() => { const el = document.getElementById('mu-pl-name'); if (el) el.focus(); }, 80);
}
function muPlCreateDo() {
  const name = (document.getElementById('mu-pl-name') || {}).value || '';
  if (!name.trim()) { showToast('先写个名字'); return; }
  muPls.push({ name: name.trim(), ids: [] });
  muPlSave(); closeModal(); muRenderPl();
  showToast('已创建「' + name.trim() + '」');
}
function muPlDel(i) {
  appConfirm('删除歌单', '删除歌单「' + esc(muPls[i].name) + '」？<br>歌曲本身不受影响。', () => {
    muPls.splice(i, 1); muPlSave(); if (muPlView != null) muPlView = null; muRenderPl(); showToast('已删除');
  });
}
function muPlOpen(i) { muPlView = i; muRenderPl(); }
function muPlRemove(pi, id) { muPls[pi].ids = muPls[pi].ids.filter(x => x !== id); muPlSave(); muRenderPl(); }
function muPlPlay(pi) {
  const songs = muPls[pi].ids.map(id => muList.find(x => x.id === id)).filter(Boolean);
  if (!songs.length) { showToast('歌单是空的'); return; }
  muPlayById(songs[0].id);
}
function muAddToPl(id) {
  const rec = muList.find(x => x.id === id); if (!rec) return;
  showModal('加入歌单 · ' + esc(rec.name),
    (muPls.length ? muPls.map((p, i) => '<div class="mu-pl-pick" onclick="muAddToPlDo(' + i + ',' + id + ')">' + esc(p.name) + '<i>' + p.ids.length + ' 首</i></div>').join('') : '<div style="text-align:center;color:var(--hint);padding:8px 0">还没有歌单</div>')
    + '<div class="mu-pl-pick" style="color:#8a6d4b" onclick="muPlCreate();closeModal()">＋ 新建歌单…</div>',
    '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button></div>');
}
function muAddToPlDo(pi, id) {
  const pl = muPls[pi];
  if (pl.ids.includes(id)) { closeModal(); showToast('已在这个歌单里'); return; }
  pl.ids.push(id); muPlSave(); closeModal(); muRenderPl(); showToast('已加入「' + pl.name + '」');
}

/* Tab3 设置 */
function muRenderSet() {
  const host = document.getElementById('mu-set-body');
  if (!host) return;
  const sizeMB = (muList.reduce((a, x) => a + (x.size || 0), 0) / 1048576).toFixed(1);
  const op = muSet.miniOp != null ? muSet.miniOp : 1;
  host.innerHTML =
    '<div class="mu-sec">播放</div>'
    + '<div class="mu-set-row" onclick="muCycleMode()"><span>播放模式</span><b>' + (muSet.mode === 'loop' ? '列表循环' : muSet.mode === 'one' ? '单曲循环' : '随机播放') + '</b></div>'
    + '<div class="mu-set-row" onclick="muToggleRestore()"><span>启动恢复上次进度</span><span class="cs-switch' + (muSet.restore !== false ? ' on' : '') + '"></span></div>'
    + '<div class="mu-sec">悬浮迷你条（星迹桌面/其他页面）</div>'
    + '<div class="mu-set-row" onclick="muToggleMini()"><span>显示悬浮迷你条</span><span class="cs-switch' + (muSet.miniOn !== false ? ' on' : '') + '"></span></div>'
    + '<div class="mu-set-col"><span>透明度 <i id="mu-op-t">' + Math.round(op * 100) + '%</i></span><input type="range" min="30" max="100" value="' + Math.round(op * 100) + '" oninput="muSetOp(this.value)"></div>'
    + '<div class="mu-sec">数据</div>'
    + '<div class="mu-set-row" style="cursor:default"><span>歌曲数量</span><b>' + muList.length + ' 首 · 约 ' + sizeMB + ' MB</b></div>'
    + '<div class="mu-set-row" onclick="muClearDup()"><span>清理重复导入</span><b>检查</b></div>'
    + '<div class="mu-set-row" onclick="muClearAll()"><span style="color:#c55">清空歌单与列表</span><b style="color:#c55">危险</b></div>'
    + '<div style="font-size:11px;color:var(--hint);line-height:1.9;padding:10px 2px">全部数据仅存本机（IndexedDB），不联网上传。<br>歌曲本体随记录保存，删除 APP 数据会一并清掉。</div>';
}
function muToggleRestore() { muSet.restore = muSet.restore === false; muSaveSet(); muRenderSet(); }
function muToggleMini() { muSet.miniOn = muSet.miniOn === false; muSaveSet(); muRenderMini(); muRenderSet(); }
function muSetOp(v) { muSet.miniOp = v / 100; muSaveSet(); muRenderMini(); const t = document.getElementById('mu-op-t'); if (t) t.textContent = v + '%'; }
function muClearDup() {
  const seen = new Set(), dup = [];
  muList.forEach(x => { const k = (x.name || '') + '|' + (x.size || 0); if (seen.has(k)) dup.push(x.id); seen.add(k); });
  if (!dup.length) { showToast('没有重复歌曲'); return; }
  appConfirm('清理重复', '发现 ' + dup.length + ' 首重复歌曲，移除？', () => {
    dup.forEach(id => { muList = muList.filter(x => x.id !== id); try { dbDelete('music', id); } catch (e) {} });
    muRenderAll(); showToast('已清理 ' + dup.length + ' 首');
  });
}
function muClearAll() {
  appConfirm('清空音乐', '清空全部歌曲与歌单？<br>不可恢复，请谨慎操作。', async () => {
    try { muAudio.pause(); } catch (e) {}
    for (const x of muList) { try { await dbDelete('music', x.id); } catch (e) {} }
    muList = []; muPls = []; muPlSave(); muCurId = null;
    try { localStorage.removeItem(MU_KEY_POS); } catch (e) {}
    muRenderAll(); showToast('已清空');
  });
}

/* APP 内常驻迷你条 */
function muRenderBar() {
  const b = document.getElementById('mu-bar');
  if (!b) return;
  const rec = muCur();
  b.style.display = rec ? 'flex' : 'none';
  if (!rec) return;
  const cov = document.getElementById('mu-bar-cov');
  if (cov) cov.style.backgroundImage = _covBg(rec);
  const t = document.getElementById('mu-bar-t'), a = document.getElementById('mu-bar-a');
  if (t) t.textContent = rec.name;
  if (a) a.textContent = rec.artist || '本地音乐';
  const p = document.getElementById('mu-bar-ico');
  if (p) p.innerHTML = (muAudio && !muAudio.paused) ? '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
}

/* 悬浮迷你条（APP 外） */
function muRenderMini() {
  const m = document.getElementById('mu-mini');
  if (!m) return;
  const has = muList.length > 0;
  const appOpen = !!(document.getElementById('app-pages') && document.getElementById('app-pages').classList.contains('on'));
  const onDesk2 = !appOpen && deskCurPage() === 1;
  m.style.display = (has && muSet.miniOn !== false && !onDesk2) ? 'flex' : 'none';
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

/* 全屏播放页打开（供外部调用） */
function muOpenFull() { if (typeof openApp === 'function') openApp('musicplay'); muRenderFull(); }
function muVol(v) {
  if (muAudio) muAudio.volume = Math.max(0, Math.min(1, v / 100));
  muSet.vol = v / 100; muSaveSet();
}
function muImportMenu() {
  showModal('导入歌曲',
    '<div class="mu-pl-pick" onclick="closeModal();muImportFolder()">📁 选文件夹<span style="float:right;color:var(--hint);font-size:11px">桌面浏览器</span></div>'
    + '<div class="mu-pl-pick" onclick="closeModal();muImport()">🎵 多选导入<span style="float:right;color:var(--hint);font-size:11px">全平台</span></div>',
    '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button></div>');
}

/* ---------- 悬浮迷你条（自由拖动·位置记忆·长按切透明度） ---------- */
let _miniMoved = false, muFabMoved = false;
function muBindMini() {
  const m = document.getElementById('mu-mini');
  if (!m) return;
  let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false, lpTimer = 0;
  m.addEventListener('pointerdown', e => {
    if (e.target.closest('.mu-mini-btn') || e.target.closest('.mu-mini-cov')) return;
    dragging = true; _miniMoved = false;
    sx = e.clientX; sy = e.clientY;
    const r = m.getBoundingClientRect();
    ox = r.left; oy = r.top;
    try { m.setPointerCapture(e.pointerId); } catch (e2) {}
    lpTimer = setTimeout(() => {
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
    let nx = Math.max(4, Math.min(window.innerWidth - r.width - 4, ox + dx));
    let ny = Math.max(46, Math.min(window.innerHeight - r.height - 4, oy + dy));
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
      muSet.page = deskCurPage(); muSaveSet();
      muUpdateDots(); muRenderMini();
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
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', muBoot);
else muBoot();
function muBoot() {
  muInit().then(() => {
    muBindMini();
    muBindDeskScroll();
    muTab(muSet.tab || 'list');
  });
}
