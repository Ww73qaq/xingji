/* =========================================================
   星迹 · 本地阅读书架（TXT + PDF，v3.9.0）
   - 书的文件本体（Blob）存入 IndexedDB `books` store（db.js v5 已就绪，勿改 db）
   - TXT：UTF-8 / GBK(GB18030) 自动探测 + 手动切换；分段插入防卡顿
         v3.9.0：翻页模式（CSS 分栏分页，覆盖/滑动/无动画三种翻页动画）
                 + 原滚动模式保留；点按左/中/右分区；阅读菜单（章节/进度条/目录/界面）
                 + 设置面板（字号/字距/行距/段距/边距/缩进/背景/动画/编码）
                 + 章节目录探测（第X章/卷/回 等正则）
                 + 进度统一存字符偏移比例 fraction，翻页/滚动互通、跨机型不丢
   - PDF：PDF.js 按需渲染当前页，不一次渲染全部
   - 进度：TXT 存 fraction（字符偏移比例），PDF 存页码 page；自动防抖保存
   - 阅读偏好存 localStorage `xingji-book-settings`
   仅本文件 + index.html 引入，不改其他逻辑文件；传统脚本，函数声明即挂全局。
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
let _bk = null;                 // 当前阅读会话
let _bkSaveTimer = null;
let _bkRelayoutTimer = null;
let _bkStyleInjected = false;
const BK_SETTINGS_KEY = 'xingji-book-settings';
const BK_COL_GAP = 48;          // 分栏分页的栏间距（翻页步长 = 页宽 + 48）
const BK_CHAPTER_RE = /^\s*(第\s*[0-9〇零一二两三四五六七八九十百千万]+\s*[章节卷回部集幕]|序\s*章|序言|楔子|前言|后记|尾声|终\s*章|番外)/;

/* ---------- 阅读偏好（localStorage 全局） ---------- */
function bkLoadSettings() {
  const def = {
    fontSize: 19, lineHeight: 1.9, paraSpacing: 0.55, letterSpacing: 0,
    indent: true, margin: 20,
    bg: 'paper', mode: 'page', anim: 'cover', scale: 1.1   // scale 供 PDF 用
  };
  try {
    const raw = JSON.parse(localStorage.getItem(BK_SETTINGS_KEY) || '{}');
    // 兼容旧字号（14~26 继续沿用；旧的 17 起步偏小，老用户保留其值）
    return Object.assign(def, raw);
  } catch (e) { return def; }
}
function bkSaveSettings(s) {
  try { localStorage.setItem(BK_SETTINGS_KEY, JSON.stringify(s || {})); } catch (e) {}
}

/* 背景预设：[页面底色, 正文色, 页脚/菜单弱色] */
function bkBgList() {
  return {
    white: ['#ffffff', '#262626', '#9a9a9a'],
    paper: ['#f7f2e7', '#3a3226', '#a89e88'],
    green: ['#cfe0cc', '#2f3b2e', '#7d8f7a'],
    warm:  ['#efe4d2', '#4a3a28', '#a8967c'],
    dark:  ['#1c1d21', '#c9c5ba', '#6d6a62']
  };
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
  .bk-txt-text{max-width:720px;margin:0 auto}
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

  /* ===== TXT 阅读舞台（翻页/滚动共用外壳） ===== */
  .bk-stage{flex:1;position:relative;overflow:hidden;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;display:flex;flex-direction:column}
  .bk-stage > .bk-menu,.bk-stage > .bk-toc,.bk-stage > .bk-panel{flex:none}
  .bk-clip{position:absolute;inset:0;overflow:hidden}
  .bk-flow{position:absolute;top:0;left:0;will-change:transform}
  .bk-flow.bk-paged{column-fill:auto}
  .bk-flow .bk-p.bk-h{font-weight:700}
  .bk-pagefoot{position:absolute;left:0;right:0;bottom:6px;display:flex;justify-content:space-between;align-items:center;padding:0 16px;font-size:11px;pointer-events:none;opacity:.85}
  .bk-cover-anim{position:absolute;top:0;bottom:0;width:100%;left:100%;box-shadow:-6px 0 18px rgba(0,0,0,.22);z-index:5;pointer-events:none}
  .bk-menu{position:absolute;inset:0;z-index:20;display:flex;flex-direction:column;justify-content:space-between;background:rgba(0,0,0,.32)}
  .bk-menu.bk-hide{display:none}
  .bk-menu-top{display:flex;align-items:center;gap:12px;padding:calc(env(safe-area-inset-top,0px) + 12px) 16px 12px;background:rgba(20,20,20,.86);color:#eee;backdrop-filter:blur(8px)}
  .bk-menu-top .bk-mb{font-size:20px;line-height:1;cursor:pointer;padding:4px 6px}
  .bk-menu-top .bk-mt{flex:1;min-width:0;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .bk-menu-top .bk-mc{font-size:12px;opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:44%}
  .bk-menu-bot{background:rgba(20,20,20,.86);color:#eee;backdrop-filter:blur(8px);padding:14px 18px calc(env(safe-area-inset-bottom,0px) + 14px);display:flex;flex-direction:column;gap:12px}
  .bk-menu-row{display:flex;align-items:center;gap:14px}
  .bk-menu-row .bk-mb2{font-size:14px;cursor:pointer;flex:none;padding:6px 4px}
  .bk-menu-row input[type=range]{flex:1;accent-color:#c9bfa4;height:22px}
  .bk-menu-nav{display:flex;align-items:center;justify-content:center;gap:26px;font-size:14px}
  .bk-menu-nav .bk-mb2{cursor:pointer;padding:6px 14px}
  .bk-menu-nav .bk-mb2.bk-dis{opacity:.35;pointer-events:none}
  .bk-menu-tabs{display:flex;justify-content:space-around;font-size:13px;opacity:.95}
  .bk-menu-tabs .bk-mb2{display:flex;flex-direction:column;align-items:center;gap:3px;padding:2px 10px;cursor:pointer}
  .bk-menu-tabs .bk-mb2 svg{width:20px;height:20px}
  .bk-toc{position:absolute;top:0;bottom:0;left:0;width:min(78%,340px);z-index:30;background:var(--card,#fff);box-shadow:6px 0 20px rgba(0,0,0,.2);display:flex;flex-direction:column;transform:translateX(-102%);transition:transform .26s ease}
  .bk-toc.bk-show{transform:translateX(0)}
  .bk-toc-h{padding:14px 16px;font-size:15px;font-weight:600;border-bottom:1px solid #eee2;color:#444}
  .bk-toc-list{flex:1;overflow:auto;padding:6px 0}
  .bk-toc-it{padding:11px 18px;font-size:14px;color:#555;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .bk-toc-it.bk-cur{color:#8a6d4b;background:rgba(160,130,80,.1);font-weight:600}
  .bk-panel{position:absolute;left:0;right:0;bottom:0;z-index:25;background:var(--card,#fff);color:var(--text,#333);border-radius:16px 16px 0 0;box-shadow:0 -6px 24px rgba(0,0,0,.16);padding:14px 18px calc(env(safe-area-inset-bottom,0px) + 14px);transform:translateY(105%);transition:transform .26s ease;max-height:72%;overflow:auto}
  .bk-panel.bk-show{transform:translateY(0)}
  .bk-panel-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
  .bk-panel-h .t{font-size:14px;font-weight:600}
  .bk-panel-h .x{font-size:16px;cursor:pointer;padding:4px 8px;color:#999}
  .bk-chips{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 12px}
  .bk-chip{border:1px solid #ddd6c8;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;background:transparent;color:inherit}
  .bk-chip.bk-on{background:#4a4436;color:#fff;border-color:#4a4436}
  .bk-slider-row{display:flex;align-items:center;gap:10px;margin:9px 0;font-size:13px}
  .bk-slider-row .lb{flex:none;width:34px;color:#888}
  .bk-slider-row .pm{flex:none;width:28px;height:28px;border-radius:50%;border:1px solid #ddd6c8;background:transparent;color:inherit;font-size:15px;cursor:pointer;line-height:1}
  .bk-slider-row input[type=range]{flex:1;accent-color:#8a6d4b;height:20px}
  .bk-slider-row .val{flex:none;width:38px;text-align:right;font-size:12px;color:#999}
  .bk-swatches{display:flex;gap:12px;margin:8px 0 4px}
  .bk-sw{width:36px;height:36px;border-radius:50%;cursor:pointer;border:2px solid transparent;box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)}
  .bk-sw.bk-on{border-color:#8a6d4b}
  .bk-sec{font-size:11px;color:#aaa;margin:10px 0 2px}
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
  bkUnbindResize();

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
    pdfToken: 0,
    /* TXT 翻页相关 */
    lines: null, paras: null, chapters: null,
    pageIndex: 0, txtPages: 0, pageChars: null,
    animLock: false
  };

  const body = document.getElementById('books-body');
  body.style.cssText = '';
  body.classList.add('bk-reading');
  bkSetBack(true);

  if (s.type === 'txt') await bkOpenTxt(body);
  else await bkOpenPdf(body);
}

/* =========================================================
   五、TXT 阅读：翻页 / 滚动双模式
   ========================================================= */
async function bkOpenTxt(body) {
  const s = _bk;
  try { s.buffer = await s.rec.blob.arrayBuffer(); } catch (e) {}
  s.text = decodeBookText(s.buffer, s.encoding);

  /* 预切行 + 章节探测（字符偏移统一以「行 + \n」累计，与渲染解耦） */
  s.lines = (s.text || '').split(/\r?\n/);
  let off = 0;
  s.paras = s.lines.map(t => {
    const o = { text: t, charStart: off };
    off += t.length + 1;
    return o;
  });
  s.totalChars = Math.max(1, off);
  s.chapters = [];
  s.lines.forEach((t, i) => {
    if (t.trim() && BK_CHAPTER_RE.test(t)) s.chapters.push({ title: t.trim().slice(0, 40), charStart: s.paras[i].charStart, paraIndex: i });
  });

  body.innerHTML = `<div class="bk-stage" id="bk-stage"></div>`;
  bkBindResize();
  bkBuildTxtReader();
}

/* 按当前模式搭建阅读区（切模式时重建） */
function bkBuildTxtReader() {
  const s = _bk; if (!s || s.type !== 'txt') return;
  const stage = document.getElementById('bk-stage');
  if (!stage) return;

  if (s.settings.mode === 'page') {
    stage.innerHTML = `
      <div class="bk-clip" id="bk-pageclip"><div class="bk-flow bk-paged" id="bk-pageflow"></div></div>
      <div class="bk-pagefoot" id="bk-pagefoot"></div>
      ${bkMenuHTML()}
    `;
    bkApplyTxtStyle();
    bkRenderParas(document.getElementById('bk-pageflow'), () => bkLayoutPages());
  } else {
    stage.innerHTML = `
      <div class="bk-reader-scroll" id="bk-txt-scroll"><div class="bk-txt-text" id="bk-txt-text"></div></div>
      ${bkMenuHTML()}
    `;
    bkApplyTxtStyle();
    bkRenderParas(document.getElementById('bk-txt-text'), () => bkRestoreTxtScroll());
    const sc = document.getElementById('bk-txt-scroll');
    sc.onscroll = () => {
      const max = sc.scrollHeight - sc.clientHeight;
      s.fraction = max > 0 ? sc.scrollTop / max : 0;
      bkUpdateMenuSlider();
      clearTimeout(_bkSaveTimer);
      _bkSaveTimer = setTimeout(bkSaveProgress, 500);
    };
  }
  bkHideMenu();
}

/* 段落渲染（分段插入防超大文本卡顿；每段记录 charStart 供翻页/目录/进度换算） */
function bkRenderParas(host, done) {
  if (!host) return;
  host.innerHTML = '';
  const s = _bk;
  const set = s.settings;
  const CHUNK = 1500;
  let i = 0;
  (function step() {
    if (!_bk || _bk.type !== 'txt' || !host.isConnected) return;
    const frag = document.createDocumentFragment();
    const end = Math.min(i + CHUNK, s.paras.length);
    for (; i < end; i++) {
      const p = document.createElement('p');
      p.className = 'bk-p' + (BK_CHAPTER_RE.test(s.paras[i].text) ? ' bk-h' : '');
      p.textContent = s.paras[i].text.length ? s.paras[i].text : ' ';   // 空行占一行
      p._charStart = s.paras[i].charStart;
      frag.appendChild(p);
    }
    host.appendChild(frag);
    if (i < s.paras.length) { requestAnimationFrame(step); }
    else { requestAnimationFrame(done); }
  })();
}

/* ---------- 翻页模式：分栏分页 ---------- */
function bkLayoutPages() {
  const s = _bk; if (!s || s.type !== 'txt') return;
  const stage = document.getElementById('bk-stage');
  const flow = document.getElementById('bk-pageflow');
  if (!stage || !flow) return;

  const W = stage.clientWidth, H = stage.clientHeight;
  flow.style.boxSizing = 'border-box';
  flow.style.width = W + 'px';
  flow.style.height = H + 'px';
  /* 分栏宽度 = 内容区宽（扣除左右边距），翻页步长以浏览器实际列间距实测为准 */
  const cs = getComputedStyle(flow);
  const cw = Math.max(120, W - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
  flow.style.columnWidth = cw + 'px';
  flow.style.columnGap = BK_COL_GAP + 'px';
  flow.style.transform = 'translateX(0)';

  /* 实测步长：取前两段不同 offsetLeft 的差值（= 列宽+栏间距），杜绝任何舍入/计算口径不一致 */
  let period = cw + BK_COL_GAP;
  const kids = flow.children;
  if (kids.length > 1) {
    const first = kids[0].offsetLeft;
    for (let k = 1; k < kids.length; k++) {
      const d = kids[k].offsetLeft - first;
      if (d > cw * 0.5) { period = d; break; }
    }
  }
  s._pageUnit = period;
  s._padLeft = parseFloat(cs.paddingLeft) || 0;

  const unit = period;
  /* 总页数由段落实测列号推导（WebKit 的 scrollWidth 不含 multicol 溢出宽度，不可用） */
  let maxPg = 0;
  for (const p of flow.children) {
    const pg = Math.round((p.offsetLeft - s._padLeft) / unit);
    if (pg > maxPg) maxPg = pg;
  }
  const totalMap = maxPg + 1;
  const totalSW = Math.round((flow.scrollWidth - s._padLeft) / unit);
  const total = Math.max(1, totalMap, totalSW || 0);
  s.txtPages = total;
  s.pageChars = new Array(total).fill(-1);
  s._pageParas = new Array(total);   // 每页的段落实引用（动画克隆用）
  for (const p of flow.children) {
    const pg = Math.max(0, Math.round((p.offsetLeft - s._padLeft) / unit));
    if (pg >= 0 && pg < total) {
      if (s.pageChars[pg] < 0) s.pageChars[pg] = p._charStart;
      (s._pageParas[pg] || (s._pageParas[pg] = [])).push(p);
    }
  }
  /* 页间无段落开头的页（长段落跨页）线性插值字符偏移，避免进度显示 0% */
  let lastPg = -1, lastChar = 0;
  for (let i = 0; i < total; i++) {
    if (s.pageChars[i] >= 0) {
      if (lastPg >= 0 && i - lastPg > 1) {
        for (let j = lastPg + 1; j < i; j++) {
          s.pageChars[j] = Math.round(lastChar + (s.pageChars[i] - lastChar) * (j - lastPg) / (i - lastPg));
        }
      }
      lastPg = i; lastChar = s.pageChars[i];
    }
  }
  if (lastPg >= 0 && lastPg < total - 1) {
    for (let j = lastPg + 1; j < total; j++) {
      s.pageChars[j] = Math.round(lastChar + (s.totalChars - lastChar) * (j - lastPg) / (total - 1 - lastPg));
    }
  }
  let last = 0;
  for (let i = 0; i < total; i++) {
    if (s.pageChars[i] < 0) s.pageChars[i] = last;
    else last = s.pageChars[i];
  }

  /* 按字符比例恢复进度 */
  const target = (s.fraction || 0) * s.totalChars;
  let pg = bkPageByChar(target);
  s._jumpNoAnim = true;
  bkGoPage(pg);
  s._jumpNoAnim = false;
}

function bkPageByChar(charPos) {
  const s = _bk;
  const arr = s.pageChars || [0];
  let lo = 0, hi = arr.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= charPos) { ans = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return ans;
}

function bkGoPage(pg) {
  const s = _bk; if (!s || s.type !== 'txt') return;
  const flow = document.getElementById('bk-pageflow');
  if (!flow || !s.txtPages) return;
  pg = Math.max(0, Math.min(s.txtPages - 1, pg));
  const prev = s.pageIndex;
  const dir = pg >= prev ? 1 : -1;
  s.pageIndex = pg;
  s.fraction = (s.pageChars[pg] || 0) / s.totalChars;
  bkUpdatePageFoot();
  bkUpdateMenuSlider();
  clearTimeout(_bkSaveTimer);
  _bkSaveTimer = setTimeout(bkSaveProgress, 600);

  const anim = s.settings.anim || 'cover';
  const stage = document.getElementById('bk-stage');
  const unit = s._pageUnit || (stage.clientWidth + BK_COL_GAP);   // 必须用 bkLayoutPages 实测的步长，否则翻页累积偏移

  if (s._jumpNoAnim || anim === 'none' || pg === prev || !s._pageParas) {
    flow.style.transition = 'none';
    flow.style.transform = 'translateX(' + (-pg * unit) + 'px)';
    return;
  }

  /* 克隆页面动画层：新页/旧页都带真实文字，动画中不再出现"空白页" */
  s.animLock = true;
  const newOv = bkMakePageOverlay(pg);
  const finish = () => {
    flow.style.transition = 'none';
    flow.style.transform = 'translateX(' + (-pg * unit) + 'px)';
    newOv.remove();
    if (oldOv) oldOv.remove();
    s.animLock = false;
  };
  let oldOv = null;

  if (anim === 'slide') {
    /* 滑动：旧页滑出 + 新页滑入，同步等速，中间无空隙 */
    oldOv = bkMakePageOverlay(prev);
    oldOv.style.zIndex = '5';
    newOv.style.zIndex = '6';
    newOv.style.transform = 'translateX(' + (dir > 0 ? '100%' : '-100%') + ')';
    void newOv.offsetWidth;
    const trans = 'transform .3s ease';
    oldOv.style.transition = trans; newOv.style.transition = trans;
    oldOv.style.transform = 'translateX(' + (dir > 0 ? '-100%' : '100%') + ')';
    newOv.style.transform = 'translateX(0)';
  } else {
    /* 覆盖：新页整页从行进方向滑入盖住旧页（旧页不动） */
    newOv.style.zIndex = '6';
    newOv.style.transform = 'translateX(' + (dir > 0 ? '100%' : '-100%') + ')';
    newOv.style.boxShadow = dir > 0 ? '-8px 0 20px rgba(0,0,0,.18)' : '8px 0 20px rgba(0,0,0,.18)';
    void newOv.offsetWidth;
    newOv.style.transition = 'transform .3s ease';
    newOv.style.transform = 'translateX(0)';
  }
  setTimeout(finish, 330);
}

/* 克隆某一页的段落为一个全屏覆盖层（无段落开头的跨页用纯色兜底） */
function bkMakePageOverlay(pg) {
  const s = _bk;
  const stage = document.getElementById('bk-stage');
  const flow = document.getElementById('bk-pageflow');
  const cs = getComputedStyle(flow);
  const bg = (bkBgList()[s.settings.bg] || bkBgList().paper);
  const ov = document.createElement('div');
  ov.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;z-index:6;'
    + 'background:' + bg[0] + ';color:' + bg[1] + ';';
  const paras = (s._pageParas || [])[pg];
  if (paras && paras.length) {
    const inner = document.createElement('div');
    inner.style.cssText = 'height:100%;overflow:hidden;'
      + 'padding:' + cs.paddingTop + ' ' + cs.paddingRight + ' ' + cs.paddingBottom + ' ' + cs.paddingLeft + ';'
      + 'font-size:' + cs.fontSize + ';line-height:' + cs.lineHeight + ';letter-spacing:' + cs.letterSpacing + ';';
    for (const p of paras) inner.appendChild(p.cloneNode(true));
    ov.appendChild(inner);
  }
  stage.appendChild(ov);
  return ov;
}

function bkNextPage() {
  const s = _bk;
  if (!s || s.type !== 'txt' || s.settings.mode !== 'page' || s.animLock) return;
  if (s.pageIndex >= s.txtPages - 1) { showToast('已经是最后一页'); return; }
  bkGoPage(s.pageIndex + 1);
}
function bkPrevPageTxt() {
  const s = _bk;
  if (!s || s.type !== 'txt' || s.settings.mode !== 'page' || s.animLock) return;
  if (s.pageIndex <= 0) { showToast('已经是第一页'); return; }
  bkGoPage(s.pageIndex - 1);
}

/* 页脚：章节名 · x/y · 百分比 */
function bkUpdatePageFoot() {
  const s = _bk;
  const foot = document.getElementById('bk-pagefoot');
  if (!foot || !s || s.type !== 'txt') return;
  const charNow = s.pageChars ? (s.pageChars[s.pageIndex] || 0) : 0;
  const ch = bkChapterByChar(charNow);
  /* 百分比按页计算（长段落跨页时字符偏移会失真），尾页恰为 100% */
  const pct = s.txtPages > 1 ? (s.pageIndex / (s.txtPages - 1) * 100) : 100;
  const pctStr = (pct >= 99.95 ? 100 : pct).toFixed(1);
  foot.innerHTML = `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:52%">${esc(ch ? ch.title : '')}</span>
    <span>${s.pageIndex + 1}/${s.txtPages} · ${pctStr}%</span>`;
  foot.style.color = (bkBgList()[s.settings.bg] || bkBgList().paper)[2];
}

function bkChapterByChar(charPos) {
  const s = _bk;
  if (!s.chapters || !s.chapters.length) return null;
  let lo = 0, hi = s.chapters.length - 1, ans = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (s.chapters[mid].charStart <= charPos) { ans = s.chapters[mid]; lo = mid + 1; }
    else hi = mid - 1;
  }
  return ans;
}

/* ---------- 滚动模式恢复进度 ---------- */
function bkRestoreTxtScroll() {
  const sc = document.getElementById('bk-txt-scroll');
  if (!sc || !_bk) return;
  const target = (_bk.fraction || 0) * _bk.totalChars;
  const host = document.getElementById('bk-txt-text');
  if (host && host.children.length) {
    let el = host.children[0];
    for (const p of host.children) {
      if (p._charStart <= target) el = p; else break;
    }
    sc.scrollTop = el.offsetTop - 8;
  } else {
    sc.scrollTop = (_bk.fraction || 0) * (sc.scrollHeight - sc.clientHeight);
  }
}

/* ---------- 样式应用（翻页/滚动共用） ---------- */
function bkApplyTxtStyle() {
  const s = _bk; if (!s || s.type !== 'txt') return;
  const set = s.settings;
  const b = bkBgList()[set.bg] || bkBgList().paper;
  const stage = document.getElementById('bk-stage');
  const host = document.getElementById('bk-txt-text') || document.getElementById('bk-pageflow');
  if (stage) {
    stage.style.background = b[0];
    stage.style.color = b[1];
    stage.style.fontFamily = 'inherit';
  }
  if (host) {
    host.style.fontSize = set.fontSize + 'px';
    host.style.lineHeight = set.lineHeight;
    host.style.letterSpacing = (set.letterSpacing || 0) + 'px';
    host.style.padding = set.margin + 'px ' + set.margin + 'px ' + (set.margin + 26) + 'px';
  }
  /* 段距 / 缩进用动态 style 标签（避免逐段改） */
  let dyn = document.getElementById('bk-dyn-style');
  if (!dyn) { dyn = document.createElement('style'); dyn.id = 'bk-dyn-style'; document.head.appendChild(dyn); }
  dyn.textContent = `
    .bk-p{margin:0 0 ${set.paraSpacing}em${set.indent ? ';text-indent:2em' : ''}}
    .bk-p.bk-h{text-indent:0!important}
  `;
  bkUpdatePageFoot();
}

/* ---------- 点按分区：左翻上 / 右翻下 / 中呼出菜单 ---------- */
function bkBindStageTap() {
  const stage = document.getElementById('bk-stage');
  if (!stage) return;
  stage.onpointerup = (e) => {
    const s = _bk; if (!s || s.type !== 'txt') return;
    const panel = document.getElementById('bk-panel');
    const toc = document.getElementById('bk-toc');
    if (panel && panel.classList.contains('bk-show')) { bkHidePanel(); return; }
    if (toc && toc.classList.contains('bk-show')) { bkToggleToc(false); return; }
    const r = stage.getBoundingClientRect();
    const x = e.clientX - r.left;
    if (s.settings.mode === 'page') {
      if (x < r.width * 0.32) bkPrevPageTxt();
      else if (x > r.width * 0.68) bkNextPage();
      else bkShowMenu();
    } else {
      const sc = document.getElementById('bk-txt-scroll');
      if (x < r.width * 0.32 && sc) sc.scrollBy({ top: -sc.clientHeight * 0.85, behavior: 'smooth' });
      else if (x > r.width * 0.68 && sc) sc.scrollBy({ top: sc.clientHeight * 0.85, behavior: 'smooth' });
      else bkShowMenu();
    }
  };
}

/* 覆盖层拦截：面板/目录/菜单内部的点按不冒泡到舞台分区逻辑；
   菜单暗区（点在根节点上）点击关闭 */
function bkGuardOverlay(el, isMenu) {
  if (!el) return;
  el.onpointerup = (e) => {
    e.stopPropagation();
    if (isMenu && e.target === el) bkHideMenu();
  };
}

/* ---------- 阅读菜单 ---------- */
function bkMenuHTML() {
  return `
  <div class="bk-menu bk-hide" id="bk-menu">
    <div class="bk-menu-top">
      <span class="bk-mb" onclick="closeReader()">←</span>
      <span class="bk-mt">${esc(_bk.rec.name)}</span>
      <span class="bk-mc" id="bk-menu-ch"></span>
    </div>
    <div class="bk-menu-bot">
      <div class="bk-menu-row">
        <span class="bk-mb2" onclick="bkMenuChapter(-1)">上一章</span>
        <input type="range" id="bk-menu-slider" min="0" max="1000" value="0" oninput="bkMenuSeek(this.value)">
        <span class="bk-mb2" onclick="bkMenuChapter(1)">下一章</span>
      </div>
      <div class="bk-menu-tabs">
        <span class="bk-mb2" onclick="bkToggleToc(true)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>目录</span>
        <span class="bk-mb2" onclick="bkMenuMode()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h12M4 8l3-3M4 8l3 3M20 16H8M20 16l-3-3M20 16l-3 3"/></svg><span id="bk-menu-mode-t">滚动</span></span>
        <span class="bk-mb2" onclick="bkShowPanel()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h9"/><circle cx="18.5" cy="17" r="1.6"/></svg>界面</span>
        <span class="bk-mb2" onclick="bkCycleEnc()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17l6-10M10 7l6 10M6.5 13h7M17 17h3"/></svg><span id="bk-menu-enc-t"></span></span>
      </div>
    </div>
  </div>`;
}

function _bkMenuHidden() {
  const m = document.getElementById('bk-menu');
  return !m || m.classList.contains('bk-hide');
}
function bkShowMenu() {
  const m = document.getElementById('bk-menu');
  if (!m) return;
  bkGuardOverlay(m, true);
  m.classList.remove('bk-hide');
  bkUpdateMenuSlider();
  const s = _bk;
  const ch = bkChapterByChar(s.type === 'txt' && s.pageChars ? (s.pageChars[s.pageIndex] || 0) : 0);
  const el = document.getElementById('bk-menu-ch');
  if (el) el.textContent = ch ? ch.title : '';
  const enc = document.getElementById('bk-menu-enc-t');
  if (enc) enc.textContent = s.encoding === 'gbk' ? 'GBK' : (s.encoding === 'utf-8' ? 'UTF-8' : '编码');
  const mt = document.getElementById('bk-menu-mode-t');
  if (mt) mt.textContent = s.settings.mode === 'page' ? '翻页' : '滚动';
}
function bkHideMenu() {
  const m = document.getElementById('bk-menu');
  if (m) m.classList.add('bk-hide');
  bkHidePanel();
  bkToggleToc(false);
}
function bkUpdateMenuSlider() {
  const sl = document.getElementById('bk-menu-slider');
  const s = _bk; if (!sl || !s || s.type !== 'txt') return;
  const max = s.settings.mode === 'page' ? Math.max(1, s.txtPages - 1) : 1000;
  sl.max = max;
  sl.value = s.settings.mode === 'page' ? s.pageIndex : Math.round((s.fraction || 0) * 1000);
}
function bkMenuSeek(v) {
  const s = _bk; if (!s || s.type !== 'txt') return;
  if (s.settings.mode === 'page') {
    s._jumpNoAnim = true;
    bkGoPage(parseInt(v, 10) || 0);
    s._jumpNoAnim = false;
  } else {
    const sc = document.getElementById('bk-txt-scroll');
    if (sc) sc.scrollTop = (parseFloat(v) / 1000) * (sc.scrollHeight - sc.clientHeight);
  }
}
function bkMenuChapter(dir) {
  const s = _bk; if (!s || s.type !== 'txt' || !s.chapters.length) { showToast('未识别到章节'); return; }
  const charNow = s.type === 'txt' && s.pageChars && s.settings.mode === 'page'
    ? (s.pageChars[s.pageIndex] || 0)
    : (s.fraction || 0) * s.totalChars;
  if (dir > 0) {
    const next = s.chapters.find(c => c.charStart > charNow);
    if (!next) { showToast('已经是最后一章'); return; }
    bkJumpChar(next.charStart);
  } else {
    let prev = null;
    for (const c of s.chapters) { if (c.charStart < charNow - 4) prev = c; }
    if (!prev) { showToast('已经是第一章'); return; }
    bkJumpChar(prev.charStart);
  }
}
function bkJumpChar(charStart) {
  const s = _bk; if (!s || s.type !== 'txt') return;
  if (s.settings.mode === 'page') {
    s._jumpNoAnim = true;
    bkGoPage(bkPageByChar(charStart));
    s._jumpNoAnim = false;
  } else {
    const host = document.getElementById('bk-txt-text');
    const sc = document.getElementById('bk-txt-scroll');
    if (!host || !sc) return;
    for (const p of host.children) {
      if (p._charStart === charStart) { sc.scrollTop = p.offsetTop - 8; break; }
    }
  }
  bkHideMenu();
}
function bkMenuMode() {
  const s = _bk; if (!s || s.type !== 'txt') return;
  s.settings.mode = s.settings.mode === 'page' ? 'scroll' : 'page';
  bkSaveSettings(s.settings);
  bkBuildTxtReader();
}
function bkCycleEnc() {
  const s = _bk; if (!s || s.type !== 'txt') return;
  const order = ['auto', 'utf-8', 'gbk'];
  s.encoding = order[(order.indexOf(s.encoding) + 1) % order.length];
  s.text = decodeBookText(s.buffer, s.encoding);
  let off = 0;
  s.paras = (s.text || '').split(/\r?\n/).map(t => {
    const o = { text: t, charStart: off }; off += t.length + 1; return o;
  });
  s.totalChars = Math.max(1, off);
  s.chapters = [];
  s.lines = (s.text || '').split(/\r?\n/);
  s.lines.forEach((t, i) => {
    if (t.trim() && BK_CHAPTER_RE.test(t)) s.chapters.push({ title: t.trim().slice(0, 40), charStart: s.paras[i].charStart, paraIndex: i });
  });
  s.fraction = 0;
  bkSaveProgress();
  bkBuildTxtReader();
  showToast('编码：' + (s.encoding === 'gbk' ? 'GBK' : (s.encoding === 'utf-8' ? 'UTF-8' : '自动')));
}

/* ---------- 目录面板 ---------- */
function bkToggleToc(show) {
  const s = _bk; if (!s || s.type !== 'txt') return;
  let toc = document.getElementById('bk-toc');
  if (!toc) {
    toc = document.createElement('div');
    toc.id = 'bk-toc'; toc.className = 'bk-toc';
    toc.innerHTML = `<div class="bk-toc-h">目录 <span id="bk-toc-n" style="font-weight:400;color:#aaa;font-size:12px"></span></div><div class="bk-toc-list" id="bk-toc-list"></div>`;
    const stage = document.getElementById('bk-stage');
    if (stage) stage.appendChild(toc);
    bkGuardOverlay(toc, false);
  }
  const list = document.getElementById('bk-toc-list');
  if (show && list && !list.children.length) {
    const charNow = s.settings.mode === 'page' && s.pageChars ? (s.pageChars[s.pageIndex] || 0) : (s.fraction || 0) * s.totalChars;
    const n = document.getElementById('bk-toc-n');
    if (n) n.textContent = s.chapters.length ? s.chapters.length + ' 章' : '（未识别到章节，可继续滚动/翻页阅读）';
    list.innerHTML = s.chapters.length
      ? s.chapters.map((c, i) => `<div class="bk-toc-it" data-i="${i}" onclick="bkTocGo(${i})">${esc(c.title)}</div>`).join('')
      : '';
    if (s.chapters.length) {
      let cur = 0;
      s.chapters.forEach((c, i) => { if (c.charStart <= charNow) cur = i; });
      const curEl = list.children[cur];
      if (curEl) { curEl.classList.add('bk-cur'); setTimeout(() => curEl.scrollIntoView({ block: 'start' }), 60); }
    }
  }
  toc.classList.toggle('bk-show', !!show);
}
function bkTocGo(i) {
  const s = _bk; if (!s || !s.chapters || !s.chapters[i]) return;
  bkJumpChar(s.chapters[i].charStart);
  bkToggleToc(false);
}

/* ---------- 设置面板（界面） ---------- */
function bkShowPanel() {
  const s = _bk; if (!s || s.type !== 'txt') return;
  bkHideMenu();
  let panel = document.getElementById('bk-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'bk-panel'; panel.className = 'bk-panel';
    const stage = document.getElementById('bk-stage');
    if (stage) stage.appendChild(panel);
    bkGuardOverlay(panel, false);
  }
  const set = s.settings;
  const swatches = Object.entries(bkBgList()).map(([k, v]) =>
    `<div class="bk-sw ${set.bg === k ? 'bk-on' : ''}" style="background:${v[0]}" title="${k}" onclick="bkSetBg('${k}')"></div>`).join('');
  const isPage = set.mode === 'page';
  panel.innerHTML = `
    <div class="bk-panel-h"><span class="t">阅读设置</span><span class="x" onclick="bkHidePanel()">✕</span></div>
    <div class="bk-chips">
      <button class="bk-chip ${isPage ? 'bk-on' : ''}" onclick="bkSetMode('page')">翻页</button>
      <button class="bk-chip ${!isPage ? 'bk-on' : ''}" onclick="bkSetMode('scroll')">滚动</button>
    </div>
    <div class="bk-sec">翻页动画（翻页模式）</div>
    <div class="bk-chips">
      ${['cover', 'slide', 'none'].map(a => `<button class="bk-chip ${set.anim === a ? 'bk-on' : ''} ${isPage ? '' : 'bk-dis-like'}" style="${isPage ? '' : 'opacity:.4;pointer-events:none'}" onclick="bkSetAnim('${a}')">${{ cover: '覆盖', slide: '滑动', none: '无动画' }[a]}</button>`).join('')}
    </div>
    <div class="bk-slider-row"><span class="lb">字号</span>
      <button class="pm" onclick="bkAdj('fontSize',-1)">−</button>
      <input type="range" min="14" max="30" step="1" value="${set.fontSize}" oninput="bkSetProp('fontSize',+this.value)">
      <button class="pm" onclick="bkAdj('fontSize',1)">＋</button>
      <span class="val" id="bk-v-fontSize">${set.fontSize}</span></div>
    <div class="bk-slider-row"><span class="lb">字距</span>
      <button class="pm" onclick="bkAdj('letterSpacing',-0.5)">−</button>
      <input type="range" min="0" max="6" step="0.5" value="${set.letterSpacing}" oninput="bkSetProp('letterSpacing',+this.value)">
      <button class="pm" onclick="bkAdj('letterSpacing',0.5)">＋</button>
      <span class="val" id="bk-v-letterSpacing">${set.letterSpacing}</span></div>
    <div class="bk-slider-row"><span class="lb">行距</span>
      <button class="pm" onclick="bkAdj('lineHeight',-0.05)">−</button>
      <input type="range" min="1.3" max="2.6" step="0.05" value="${set.lineHeight}" oninput="bkSetProp('lineHeight',+this.value)">
      <button class="pm" onclick="bkAdj('lineHeight',0.05)">＋</button>
      <span class="val" id="bk-v-lineHeight">${set.lineHeight}</span></div>
    <div class="bk-slider-row"><span class="lb">段距</span>
      <button class="pm" onclick="bkAdj('paraSpacing',-0.1)">−</button>
      <input type="range" min="0" max="2" step="0.1" value="${set.paraSpacing}" oninput="bkSetProp('paraSpacing',+this.value)">
      <button class="pm" onclick="bkAdj('paraSpacing',0.1)">＋</button>
      <span class="val" id="bk-v-paraSpacing">${set.paraSpacing}</span></div>
    <div class="bk-slider-row"><span class="lb">边距</span>
      <button class="pm" onclick="bkAdj('margin',-4)">−</button>
      <input type="range" min="0" max="48" step="2" value="${set.margin}" oninput="bkSetProp('margin',+this.value)">
      <button class="pm" onclick="bkAdj('margin',4)">＋</button>
      <span class="val" id="bk-v-margin">${set.margin}</span></div>
    <div class="bk-chips">
      <button class="bk-chip ${set.indent ? 'bk-on' : ''}" onclick="bkToggleIndent()">段首缩进${set.indent ? '：开' : '：关'}</button>
    </div>
    <div class="bk-sec">背景</div>
    <div class="bk-swatches">${swatches}</div>
    <div class="bk-sec">文件编码</div>
    <div class="bk-chips">
      ${['auto', 'utf-8', 'gbk'].map(e2 => `<button class="bk-chip ${s.encoding === e2 ? 'bk-on' : ''}" onclick="bkSetEnc('${e2}')">${{ auto: '自动', 'utf-8': 'UTF-8', gbk: 'GBK' }[e2]}</button>`).join('')}
    </div>`;
  panel.classList.add('bk-show');
}
function bkHidePanel() {
  const p = document.getElementById('bk-panel');
  if (p) p.classList.remove('bk-show');
}
function bkPersistApply(relayout) {
  const s = _bk; if (!s) return;
  bkSaveSettings(s.settings);
  bkApplyTxtStyle();
  if (s.settings.mode === 'page' && relayout) {
    clearTimeout(_bkRelayoutTimer);
    _bkRelayoutTimer = setTimeout(() => {
      const f = s.fraction;
      bkLayoutPagesKeep(f);
    }, 160);
  }
}
function bkLayoutPagesKeep(f) {
  const s = _bk; if (!s) return;
  s.fraction = f;
  bkLayoutPages();
}
function bkSetProp(k, v) {
  const s = _bk; if (!s) return;
  s.settings[k] = v;
  const lab = document.getElementById('bk-v-' + k);
  if (lab) lab.textContent = v;
  bkPersistApply(true);
}
function bkAdj(k, d) {
  const s = _bk; if (!s) return;
  const ranges = { fontSize: [14, 30, 1], letterSpacing: [0, 6, 0.5], lineHeight: [1.3, 2.6, 0.05], paraSpacing: [0, 2, 0.1], margin: [0, 48, 2] };
  const r = ranges[k];
  s.settings[k] = Math.round(Math.max(r[0], Math.min(r[1], s.settings[k] + d)) / r[2]) * r[2];
  const panel = document.getElementById('bk-panel');
  if (panel) { bkShowPanel(); }   // 重画面板同步滑条与数值
  bkPersistApply(true);
}
function bkSetBg(k) {
  const s = _bk; if (!s) return;
  s.settings.bg = k;
  bkPersistApply(false);
  bkShowPanel();
}
function bkSetAnim(a) {
  const s = _bk; if (!s) return;
  s.settings.anim = a;
  bkSaveSettings(s.settings);
  bkShowPanel();
}
function bkToggleIndent() {
  const s = _bk; if (!s) return;
  s.settings.indent = !s.settings.indent;
  bkPersistApply(true);
  bkShowPanel();
}
function bkSetMode(m) {
  const s = _bk; if (!s || s.settings.mode === m) return;
  s.settings.mode = m;
  bkSaveSettings(s.settings);
  bkBuildTxtReader();   // 重建后按 fraction 恢复
}
function bkSetEnc(e2) {
  const s = _bk; if (!s || s.encoding === e2) return;
  s.encoding = e2;
  s.text = decodeBookText(s.buffer, s.encoding);
  let off = 0;
  s.paras = (s.text || '').split(/\r?\n/).map(t => { const o = { text: t, charStart: off }; off += t.length + 1; return o; });
  s.totalChars = Math.max(1, off);
  s.lines = (s.text || '').split(/\r?\n/);
  s.chapters = [];
  s.lines.forEach((t, i) => {
    if (t.trim() && BK_CHAPTER_RE.test(t)) s.chapters.push({ title: t.trim().slice(0, 40), charStart: s.paras[i].charStart, paraIndex: i });
  });
  s.fraction = 0;
  bkSaveProgress();
  bkBuildTxtReader();
  bkShowPanel();
}

/* ---------- 旋转/窗口变化：保持进度重排 ---------- */
function bkOnResize() {
  const s = _bk; if (!s || s.type !== 'txt') return;
  clearTimeout(_bkRelayoutTimer);
  _bkRelayoutTimer = setTimeout(() => {
    if (s.settings.mode === 'page') bkLayoutPages();
    else bkRestoreTxtScroll();
  }, 220);
}
function bkBindResize() {
  window.addEventListener('resize', bkOnResize);
  bkBindStageTap();
}
function bkUnbindResize() {
  window.removeEventListener('resize', bkOnResize);
}

/* =========================================================
   六、PDF 阅读：按需渲染当前页
   ========================================================= */
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
      <button class="bk-tb" onclick="bkPdfPrev()">上一页</button>
      <span class="bk-ind" id="bk-page-ind">-</span>
      <button class="bk-tb" onclick="bkPdfNext()">下一页</button>
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

/* PDF 翻页/缩放（TXT 的 bkNextPage/bkPrevPageTxt 在第五节；命名区分避免覆盖） */
function bkPdfPrev() {
  if (!_bk || _bk.type !== 'pdf' || _bk.pageNum <= 1) return;
  _bk.pageNum--; bkRenderPdfPage();
}
function bkPdfNext() {
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
   七、进度保存 / 关闭阅读
   ========================================================= */
async function bkSaveProgress() {
  const s = _bk;
  if (!s || !s.rec) return;
  const p = s.rec.progress || {};
  if (s.type === 'txt') {
    p.fraction = Math.round((typeof s.fraction === 'number' ? s.fraction : 0) * 1000) / 1000;
    p.encoding = s.encoding;
    p.mode = s.settings.mode;   // 记忆上次阅读方式（仅记录，不改全局偏好）
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
  bkUnbindResize();
  renderBookshelf();
}
