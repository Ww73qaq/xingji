/* =========================================================
   星迹 · 本地阅读书架（TXT + PDF，v3.8.0）
   - 书的文件本体（Blob）存入 IndexedDB `books` store（db.js v5 已就绪，勿改 db）
   - TXT：UTF-8 / GBK(GB18030) 自动探测 + 手动切换；分段插入防卡顿
   - PDF：PDF.js 按需渲染当前页，不一次渲染全部
   - 进度：TXT 存滚动比例 fraction，PDF 存页码 page；自动防抖保存
   - 阅读偏好存 localStorage `xingji-book-settings`
   仅新增本文件，不改其他文件；传统脚本，函数声明即挂全局供 onclick 调用。
   ========================================================= */

/* PDF.js worker（文件开头配置一次，与 cdnjs 3.11.174 同版本） */
try {
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
} catch (e) {}

/* 模块初始化：一次性清理旧拼写残留 */
try { localStorage.removeItem('xingji-spelling'); } catch (e) {}

/* ---------- 模块私有状态 ---------- */
let _bk = null;                 // 当前阅读会话 { rec, settings, type, text, buffer, encoding, fraction, pdfDoc, pageNum, totalPages, pdfToken }
let _bkSaveTimer = null;
let _bkStyleInjected = false;
const BK_SETTINGS_KEY = 'xingji-book-settings';

/* ---------- 阅读偏好（localStorage 全局） ---------- */
function bkLoadSettings() {
  const def = { fontSize: 17, lineHeight: 1.9, bg: 'paper', scale: 1.1 };
  try { return Object.assign(def, JSON.parse(localStorage.getItem(BK_SETTINGS_KEY) || '{}')); }
  catch (e) { return def; }
}
function bkSaveSettings(s) {
  try { localStorage.setItem(BK_SETTINGS_KEY, JSON.stringify(s || {})); } catch (e) {}
}

/* ---------- 样式注入（只挂一次，不污染全局文件） ---------- */
function bkInjectStyle() {
  if (_bkStyleInjected) return; _bkStyleInjected = true;
  const st = document.createElement('style');
  st.textContent = `
  #books-body.bk-reading{display:flex;flex-direction:column!important;padding:0!important;overflow:hidden!important}
  .bk-toolbar{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid #e9e5dc;background:var(--card,#fff);flex-wrap:wrap;flex:none}
  .bk-toolbar .bk-tb{border:1px solid #e2ded4;background:#f3f1ea;color:#5a5344;border-radius:14px;padding:4px 11px;font-size:12px;cursor:pointer;line-height:1.4}
  .bk-toolbar .bk-tb:active{background:#e8e4d9}
  .bk-toolbar .bk-ind{font-size:12px;color:var(--sub,#7d7d7d);padding:0 4px}
  .bk-reader-scroll{flex:1;overflow:auto;-webkit-overflow-scrolling:touch}
  .bk-txt-text{max-width:720px;margin:0 auto;padding:22px 20px 70px}
  .bk-p{margin:0 0 .55em;white-space:pre-wrap;word-break:break-word;overflow-wrap:break-word}
  .bk-pdf-wrap{min-height:100%;display:flex;align-items:flex-start;justify-content:center;padding:14px}
  .bk-pdf-canvas{box-shadow:0 3px 14px rgba(0,0,0,.18);background:#fff;border-radius:2px}
  .bk-shelf{display:grid;grid-template-columns:repeat(3,1fr);gap:16px 12px;padding:4px 2px}
  .bk-card{cursor:pointer;position:relative}
  .bk-cover{position:relative;width:100%;aspect-ratio:3/4;border-radius:9px;overflow:hidden;box-shadow:0 3px 10px rgba(80,60,30,.14);background:#ece7db;display:flex;align-items:center;justify-content:center}
  .bk-cover img{width:100%;height:100%;object-fit:cover;display:block}
  .bk-no-cover{color:#b3a98f}
  .bk-del{position:absolute;top:5px;right:5px;width:24px;height:24px;border-radius:50%;background:rgba(0,0,0,.32);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer}
  .bk-name{font-size:12px;margin-top:7px;color:var(--text,#1a1a1a);line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
  .bk-prog{font-size:11px;color:var(--hint,#b8b8b8);margin-top:2px}
  `;
  document.head.appendChild(st);
}

/* =========================================================
   一、导入：隐藏 file input，pickBooks() 触发；逐个读取入库
   ========================================================= */
function pickBooks() {
  let inp = document.getElementById('bk-file-input');
  if (!inp) {
    inp = document.createElement('input');
    inp.type = 'file'; inp.id = 'bk-file-input'; inp.multiple = true;
    inp.accept = '.txt,.pdf';
    inp.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
    inp.onchange = bkOnFiles;
    document.body.appendChild(inp);
  }
  inp.value = '';
  inp.click();
}

async function bkOnFiles(e) {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  showToast('正在导入 ' + files.length + ' 本书…');
  let ok = 0;
  for (const f of files) {
    try { await bkImportOne(f); ok++; }
    catch (err) { console.error('导入失败', f.name, err); }
  }
  showToast(ok ? '已导入 ' + ok + ' 本' : '导入失败，请重试');
  renderBookshelf();
}

async function bkImportOne(file) {
  const lower = (file.name || '').toLowerCase();
  const isPdf = lower.endsWith('.pdf');
  const type = isPdf ? 'pdf' : 'txt';
  const name = (file.name || '未命名').replace(/\.[^.]+$/, '');
  const mime = file.type || (isPdf ? 'application/pdf' : 'text/plain');

  let buffer = null;
  try { buffer = await file.arrayBuffer(); } catch (e) {}

  let thumb = '';
  if (isPdf && buffer) thumb = await bkMakePdfThumb(buffer);
  if (!thumb) thumb = bkMakeTxtCover(name);   // TXT 统一极简书封；PDF 出封面失败也兜底

  const rec = {
    name, type, mime,
    size: file.size || 0,
    blob: file,                 // 文件本体 Blob 入库存档，绝不只存临时 objectURL
    addedAt: Date.now(),
    thumb,
    progress: {}
  };
  await dbPut('books', rec);    // 返回新 id；records 不提前给 id
}

/* PDF 第 1 页小缩略图 → dataURL */
async function bkMakePdfThumb(buffer) {
  if (typeof pdfjsLib === 'undefined') return '';
  let pdf = null;
  try {
    pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    const page = await pdf.getPage(1);
    const vp = page.getViewport({ scale: 0.55 });
    const c = document.createElement('canvas');
    c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    return c.toDataURL('image/jpeg', 0.72);
  } catch (e) { return ''; }
  finally { try { if (pdf && pdf.destroy) pdf.destroy(); } catch (e) {} }
}

/* TXT 极简书封：暖色块 + 书脊 + 书名首字（canvas→dataURL） */
function bkMakeTxtCover(name) {
  try {
    const c = document.createElement('canvas');
    c.width = 240; c.height = 320;
    const x = c.getContext('2d');
    const palettes = [
      ['#e8d9c0', '#8a6d4b'], ['#dfe3d3', '#5f7048'], ['#e3d3d0', '#8a5a52'],
      ['#d6dde6', '#4f6480'], ['#e9e0cf', '#7a6a3f'], ['#d9e2dc', '#4f7066']
    ];
    const h = [...(name || '书')].reduce((a, ch) => a + (ch.codePointAt(0) || 0), 0);
    const p = palettes[h % palettes.length];
    x.fillStyle = p[0]; x.fillRect(0, 0, 240, 320);
    x.fillStyle = 'rgba(0,0,0,.09)'; x.fillRect(0, 0, 10, 320);   // 书脊
    x.fillStyle = p[1];
    x.font = 'bold 120px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(((name || '书').trim().charAt(0)) || '书', 132, 162);
    return c.toDataURL('image/png');
  } catch (e) { return ''; }
}

/* =========================================================
   二、TXT 编码解码：BOM 识别 + UTF-8/GB18030 自动探测
   decodeBookText(buffer, enc): enc='auto'|'utf-8'|'gbk'
   ========================================================= */
function decodeBookText(buffer, enc) {
  const bytes = new Uint8Array(buffer || new ArrayBuffer(0));
  let start = 0;
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) start = 3; // UTF-8 BOM
  const body = bytes.subarray(start);
  if (enc === 'utf-8') return new TextDecoder('utf-8').decode(body);
  if (enc === 'gbk') return new TextDecoder('gb18030').decode(body);   // GB18030 兼容 GBK
  // auto：先严格 UTF-8，失败兜底 GB18030
  try { return new TextDecoder('utf-8', { fatal: true }).decode(body); }
  catch (e) { return new TextDecoder('gb18030').decode(body); }
}

/* =========================================================
   三、书架视图
   ========================================================= */
async function renderBookshelf() {
  bkInjectStyle();
  /* 进入书架即重置可能残留的阅读会话与返回键 */
  try { if (_bk && _bk.pdfDoc) _bk.pdfDoc.destroy().catch(() => {}); } catch (e) {}
  _bk = null;
  bkSetBack(false);

  const body = document.getElementById('books-body');
  if (!body) return;
  body.style.cssText = '';             // 还原 .app-body 默认滚动/内边距
  body.classList.remove('bk-reading');

  let list = [];
  try { list = await dbGetAll('books'); } catch (e) { list = []; }
  list.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));

  if (!list.length) {
    body.innerHTML = `<div class="empty">
      <div style="color:#c9bfa4">${ICO.book}</div>
      <div style="margin-top:12px;color:var(--sub,#7d7d7d)">书架空空的，放一本想读的书吧</div>
      <div style="font-size:12px;color:var(--hint,#b8b8b8);margin-top:6px;line-height:1.8">点右上角「+」导入 TXT 或 PDF<br>离线也能接着读</div>
    </div>`;
    return;
  }

  const cards = list.map(rec => `
    <div class="bk-card" onclick="openBook(${rec.id})">
      <div class="bk-cover">
        ${rec.thumb
          ? `<img src="${rec.thumb}" alt="">`
          : `<span class="bk-no-cover">${ICO.book}</span>`}
        <div class="bk-del" title="删除" onclick="event.stopPropagation();bkDeleteBook(${rec.id})">${ICO_DEL}</div>
      </div>
      <div class="bk-name">${esc(rec.name)}</div>
      <div class="bk-prog">${bkProgressText(rec)}</div>
    </div>`).join('');
  body.innerHTML = `<div class="bk-shelf">${cards}</div>`;
}

function bkProgressText(rec) {
  const p = rec.progress || {};
  if (rec.type === 'pdf') {
    if (p.page && p.totalPages) return `第 ${p.page}/${p.totalPages} 页`;
    if (p.page) return `第 ${p.page} 页`;
    return '未开始';
  }
  if (p.fraction && p.fraction > 0) {
    const pct = Math.round(p.fraction * 100);
    return pct >= 99 ? '已读完' : pct + '%';
  }
  return '未开始';
}

/* 删除：appConfirm 二次确认后 dbDelete */
function bkDeleteBook(id) {
  appConfirm('删除书籍', '确定删除这本书吗？<br>删除后不可恢复。', async () => {
    try { await dbDelete('books', id); } catch (e) {}
    showToast('已删除');
    renderBookshelf();
  });
}

/* =========================================================
   四、打开阅读（TXT / PDF 共用壳）
   ========================================================= */
function bkSetBack(onReader) {
  const back = document.querySelector('#app-books .app-header .back');
  if (back) back.onclick = onReader ? closeReader : goBack;  // 覆盖内联 onclick，不改动 index.html
}

async function openBook(id) {
  bkInjectStyle();
  let rec = null;
  try { rec = await dbGet('books', id); } catch (e) {}
  if (!rec) { showToast('书不存在或已删除'); renderBookshelf(); return; }

  const prog = rec.progress || {};
  const s = _bk = {
    rec,
    settings: bkLoadSettings(),
    type: rec.type,
    text: null, buffer: null,
    encoding: prog.encoding || 'auto',
    fraction: typeof prog.fraction === 'number' ? prog.fraction : 0,
    pdfDoc: null,
    pageNum: Math.max(1, prog.page || 1),
    totalPages: prog.totalPages || 0,
    pdfToken: 0
  };

  const body = document.getElementById('books-body');
  body.style.cssText = '';
  body.classList.add('bk-reading');
  bkSetBack(true);

  if (s.type === 'txt') await bkOpenTxt(body);
  else await bkOpenPdf(body);
}

/* ---------- TXT 阅读 ---------- */
async function bkOpenTxt(body) {
  const s = _bk;
  try { s.buffer = await s.rec.blob.arrayBuffer(); } catch (e) {}
  s.text = decodeBookText(s.buffer, s.encoding);

  body.innerHTML = `
    <div class="bk-toolbar">
      <button class="bk-tb" onclick="bkFontSize(-1)">A-</button>
      <button class="bk-tb" onclick="bkFontSize(1)">A+</button>
      <button class="bk-tb" onclick="bkCycleBg()">背景</button>
      <button class="bk-tb" id="bk-enc-btn" onclick="bkToggleEncoding()">编码</button>
    </div>
    <div class="bk-reader-scroll" id="bk-txt-scroll">
      <div class="bk-txt-text" id="bk-txt-text"></div>
    </div>`;

  bkUpdateEncBtn();
  bkApplyTxtStyle();

  const sc = document.getElementById('bk-txt-scroll');
  sc.onscroll = () => {
    const max = sc.scrollHeight - sc.clientHeight;
    s.fraction = max > 0 ? sc.scrollTop / max : 0;
    clearTimeout(_bkSaveTimer);
    _bkSaveTimer = setTimeout(bkSaveProgress, 500);   // 滚动防抖保存
  };

  bkRenderTxt();
}

/* 分段插入防超大文本卡顿（按行切块，RAF 让出主线程；全文连续、滚动位置一致） */
function bkRenderTxt() {
  const host = document.getElementById('bk-txt-text');
  if (!host) return;
  host.innerHTML = '';
  const lines = (_bk.text || '').split(/\r?\n/);
  const CHUNK = 1500;
  let i = 0;
  (function step() {
    if (!_bk || _bk.type !== 'txt') return;
    const frag = document.createDocumentFragment();
    const end = Math.min(i + CHUNK, lines.length);
    for (; i < end; i++) {
      const p = document.createElement('p');
      p.className = 'bk-p';
      p.textContent = lines[i];            // textContent 防注入；CSS pre-wrap 保留换行/缩进
      frag.appendChild(p);
    }
    host.appendChild(frag);
    if (i < lines.length) { requestAnimationFrame(step); }
    else { requestAnimationFrame(bkRestoreTxtScroll); }
  })();
}

function bkRestoreTxtScroll() {
  const sc = document.getElementById('bk-txt-scroll');
  if (!sc || !_bk) return;
  const f = typeof _bk.fraction === 'number' ? _bk.fraction : 0;
  sc.scrollTop = f * (sc.scrollHeight - sc.clientHeight);
}

function bkApplyTxtStyle() {
  const sc = document.getElementById('bk-txt-scroll');
  const host = document.getElementById('bk-txt-text');
  if (!sc || !host || !_bk) return;
  const set = _bk.settings;
  const bgs = {
    paper: ['#f7f2e7', '#3a3226'],   // 护眼米白（默认）
    warm: ['#efe4d2', '#4a3a28'],    // 暖褐
    dark: ['#222226', '#e6e2d8']     // 深色
  };
  const b = bgs[set.bg] || bgs.paper;
  sc.style.background = b[0];
  sc.style.color = b[1];
  host.style.fontSize = set.fontSize + 'px';
  host.style.lineHeight = set.lineHeight;
}

/* 字号 */
function bkFontSize(d) {
  if (!_bk || _bk.type !== 'txt') return;
  _bk.settings.fontSize = Math.max(14, Math.min(26, (_bk.settings.fontSize || 17) + d));
  bkSaveSettings(_bk.settings);
  bkApplyTxtStyle();
}
/* 背景循环：paper→warm→dark */
function bkCycleBg() {
  if (!_bk || _bk.type !== 'txt') return;
  const order = ['paper', 'warm', 'dark'];
  let i = order.indexOf(_bk.settings.bg);
  _bk.settings.bg = order[(i + 1) % order.length];
  bkSaveSettings(_bk.settings);
  bkApplyTxtStyle();
}
/* 手动切换 UTF-8 / GBK：重新解码并持久化到记录 progress.encoding */
function bkToggleEncoding() {
  if (!_bk || _bk.type !== 'txt') return;
  _bk.encoding = (_bk.encoding === 'gbk') ? 'utf-8' : 'gbk';
  _bk.text = decodeBookText(_bk.buffer, _bk.encoding);
  _bk.fraction = 0;
  bkUpdateEncBtn();
  bkRenderTxt();
  bkSaveProgress();
}
function bkUpdateEncBtn() {
  const b = document.getElementById('bk-enc-btn');
  if (!b || !_bk) return;
  b.textContent = '编码：' + (_bk.encoding === 'gbk' ? 'GBK' : (_bk.encoding === 'utf-8' ? 'UTF-8' : '自动'));
}

/* ---------- PDF 阅读：按需渲染当前页 ---------- */
async function bkOpenPdf(body) {
  const s = _bk;
  showToast('正在打开 PDF…');
  try {
    s.buffer = await s.rec.blob.arrayBuffer();
    s.pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(s.buffer) }).promise;  // 直接用字节，不依赖 objectURL
    s.totalPages = s.pdfDoc.numPages;
    s.pageNum = Math.max(1, Math.min(s.pageNum, s.totalPages));
  } catch (e) {
    showToast('PDF 打开失败');
    console.error(e);
    renderBookshelf();
    return;
  }

  body.innerHTML = `
    <div class="bk-toolbar">
      <button class="bk-tb" onclick="bkPrevPage()">上一页</button>
      <span class="bk-ind" id="bk-page-ind">-</span>
      <button class="bk-tb" onclick="bkNextPage()">下一页</button>
      <button class="bk-tb" onclick="bkZoom(-0.1)">－</button>
      <button class="bk-tb" onclick="bkZoom(0.1)">＋</button>
    </div>
    <div class="bk-reader-scroll" id="bk-pdf-scroll">
      <div class="bk-pdf-wrap"><canvas class="bk-pdf-canvas" id="bk-pdf-canvas"></canvas></div>
    </div>`;

  await bkRenderPdfPage();
}

async function bkRenderPdfPage() {
  const s = _bk;
  if (!s || !s.pdfDoc || s.type !== 'pdf') return;
  const token = ++s.pdfToken;
  try {
    const page = await s.pdfDoc.getPage(s.pageNum);
    if (token !== s.pdfToken) return;   // 快速翻页时丢弃过期渲染
    const vp = page.getViewport({ scale: s.settings.scale || 1.1 });
    const canvas = document.getElementById('bk-pdf-canvas');
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(vp.width * dpr);
    canvas.height = Math.floor(vp.height * dpr);
    canvas.style.width = vp.width + 'px';
    canvas.style.height = vp.height + 'px';
    await page.render({
      canvasContext: canvas.getContext('2d'),
      viewport: vp,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null
    }).promise;
    if (token !== s.pdfToken) return;
    const ind = document.getElementById('bk-page-ind');
    if (ind) ind.textContent = s.pageNum + ' / ' + s.totalPages;
    const sc = document.getElementById('bk-pdf-scroll');
    if (sc) sc.scrollTop = 0;
    bkSaveProgress();
  } catch (e) { console.error(e); }
}

function bkPrevPage() {
  if (!_bk || _bk.type !== 'pdf' || _bk.pageNum <= 1) return;
  _bk.pageNum--; bkRenderPdfPage();
}
function bkNextPage() {
  if (!_bk || _bk.type !== 'pdf' || _bk.pageNum >= _bk.totalPages) return;
  _bk.pageNum++; bkRenderPdfPage();
}
function bkZoom(d) {
  if (!_bk || _bk.type !== 'pdf') return;
  _bk.settings.scale = Math.max(0.6, Math.min(2.6, (_bk.settings.scale || 1.1) + d));
  bkSaveSettings(_bk.settings);
  bkRenderPdfPage();
}

/* =========================================================
   五、进度保存 / 关闭阅读
   ========================================================= */
async function bkSaveProgress() {
  const s = _bk;
  if (!s || !s.rec) return;
  const p = s.rec.progress || {};
  if (s.type === 'txt') {
    p.fraction = Math.round((typeof s.fraction === 'number' ? s.fraction : 0) * 1000) / 1000;
    p.encoding = s.encoding;
  } else {
    p.page = s.pageNum;
    p.totalPages = s.pdfDoc ? s.pdfDoc.numPages : (s.totalPages || p.totalPages || 0);
  }
  s.rec.progress = p;
  try { await dbPut('books', s.rec); } catch (e) {}   // rec 已带 id → 更新同一条
}

/* 返回书架（标题栏返回键在阅读期被切到这里） */
async function closeReader() {
  await bkSaveProgress();
  try { if (_bk && _bk.pdfDoc) _bk.pdfDoc.destroy().catch(() => {}); } catch (e) {}
  _bk = null;
  bkSetBack(false);
  renderBookshelf();
}
