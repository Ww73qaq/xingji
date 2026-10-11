/* =========================================================
   星迹 · 本地阅读书架（TXT + PDF，v3.10.0）
   - 书的文件本体（Blob）存入 IndexedDB `books` store（db.js v5 已就绪，勿改 db）
   - TXT：UTF-8 / GBK(GB18030) 自动探测 + 手动切换
         v3.9.0：翻页模式（CSS 分栏分页，覆盖/滑动/无动画三种翻页动画）
                 + 原滚动模式保留；点按左/中/右分区；阅读菜单（章节/进度条/目录/界面）
                 + 设置面板（字号/字距/行距/段距/边距/缩进/背景/动画/编码）
                 + 章节目录探测（第X章/卷/回 等正则）
                 + 进度统一存字符偏移比例 fraction，翻页/滚动互通、跨机型不丢
         v3.11.0：字体三选（默认衬线 / 楷体=霞鹜文楷内嵌 woff2 子集 / 跟随系统；
                 fontFamily 已纳入 bkMapKey，换字体自动作废页映射）+ 书签（TXT 存
                 字符位+摘要，PDF 存页码，挂 rec.bookmarks 随书持久化）+ PDF 无
                 outline 时目录改列页码列表（"页"就是 PDF 的天然章节）。
         v3.10.0：分块虚拟分页——全书不再整本挂 DOM，段落按 BK_CHUNK_PARAS 切块，
                 multicol 容器里永远只有当前块；页映射由后台测量器逐块量出
                 （离屏同规格容器），并缓存进书籍记录（rec.pageCache，按排版参数
                 + 视口尺寸做 key，换字号/旋转屏自动失效重测）。滚动模式同样只挂
                 邻近 2~3 块（无限滚动 + 顶部裁剪补偿）。20MB 大书与 2MB 一个体验。
   - PDF：v3.10.0 重做，对标 WPS 阅读器：连续滚动 + 页虚拟化（可见页前后各留缓冲，
                 离屏销毁 canvas）+ 双指捏合缩放沙盒（实时 transform，松手重排重渲染
                 并锚定捏合中心）+ 适应宽度重置 + PDF 书签目录 + 夜间模式（反色滤镜）；
                 点按分区/菜单/页脚样式与 TXT 阅读统一。
   - 进度：TXT 存 fraction（字符偏移比例），PDF 存页码 page + 缩放倍率 scale；自动防抖保存
   - 阅读偏好存 localStorage `xingji-book-settings`
   仅本文件 + index.html 引入，不改其他逻辑文件；传统脚本，函数声明即挂全局。
   ========================================================= */

/* PDF.js worker。
   v3.9.5：pdf.js 改成自托管 + defer 加载（index.html），而本文件是非 defer 的传统脚本，
   执行时机早于 pdfjsLib —— 所以「文件开头配置一次」会落空（旧版是从 cdnjs 同步加载才成立）。
   改为按需设置：真正用之前调 bkPdfWorkerSrc()，worker 与 pdf.min.js 同版本同目录。 */
const BK_PDF_WORKER = 'js/vendor/pdf.worker.min.js';
function bkPdfWorkerSrc() {
  try {
    if (typeof pdfjsLib === 'undefined') return false;
    const o = pdfjsLib.GlobalWorkerOptions;
    if (o && (!o.workerSrc || o.workerSrc.indexOf('cdnjs') >= 0)) o.workerSrc = BK_PDF_WORKER;
    return true;
  } catch (e) { return false; }
}

/* 模块初始化：一次性清理旧拼写残留 */
try { localStorage.removeItem('xingji-spelling'); } catch (e) {}

/* ---------- 模块私有状态 ---------- */
let _bk = null;                 // 当前阅读会话
let _bkSaveTimer = null;
let _bkRelayoutTimer = null;
let _bkStyleInjected = false;
const BK_SETTINGS_KEY = 'xingji-book-settings';
const BK_COL_GAP = 48;          // 分栏分页的栏间距（翻页步长 = 页宽 + 48）
const BK_CHUNK_PARAS = 700;     // v3.10.0 分块虚拟分页：每块段落数（约 1.5~2.5 万字/块）
const BK_CHAPTER_RE = /^\s*(第\s*[0-9〇零一二两三四五六七八九十百千万]+\s*[章节卷回部集幕]|序\s*章|序言|楔子|前言|后记|尾声|终\s*章|番外)/;

/* ---------- 阅读偏好（localStorage 全局） ---------- */
function bkLoadSettings() {
  const def = {
    fontSize: 19, lineHeight: 1.9, paraSpacing: 0.55, letterSpacing: 0,
    indent: true, margin: 20,
    bg: 'paper', mode: 'page', anim: 'cover', scale: 1,   // scale：PDF 相对「适应宽度」的倍率（v3.10.0 语义）
    fontFamily: 'system'   // v3.11.0：serif=默认衬线 | kai=楷体(霞鹜文楷) | system=跟随系统
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
/* 字体栈（v3.11.0）：kai 首选内嵌霞鹜文楷（所有设备同一字形），本地楷体作兜底；
   serif=默认衬线；system=跟随外壳（现状）。注意：换字体改变文字宽度，
   所以 fontFamily 必须参与 bkMapKey（页映射缓存 key），否则页码错位。 */
function bkFontStack() {
  const f = (_bk && _bk.settings && _bk.settings.fontFamily) || 'system';
  if (f === 'kai') return "'LXGW WenKai','Kaiti SC','STKaiti','KaiTi','BiauKai','DFKai-SB',serif";
  if (f === 'serif') return "Georgia,'Noto Serif SC','Songti SC',SimSun,serif";
  return 'inherit';
}
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
  .bk-reader-scroll{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;overflow-anchor:none}
  .bk-txt-text{max-width:720px;margin:0 auto}
  .bk-p{margin:0 0 .55em;white-space:pre-wrap;word-break:break-word;overflow-wrap:break-word}
  /* ===== PDF 阅读舞台（v3.10.0 重做：连续滚动 + 页虚拟化 + 缩放沙盒） ===== */
  .bk-pdf-scroll{position:absolute;inset:0;overflow:auto;-webkit-overflow-scrolling:touch;touch-action:pan-x pan-y}
  .bk-pdf-flow{position:relative;margin:0 auto;padding-top:12px}
  .bk-pdf-page{position:relative;margin:0 auto 10px;background:#fff;box-shadow:0 3px 14px rgba(0,0,0,.18);border-radius:2px;overflow:hidden}
  /* v3.11.1：页间距改「仅下 margin 10px + flow 顶 padding 12px」——旧版上下 margin 各 10 会
     相邻塌缩成 10px，而 bkPdfPageTop/bkPdfPageAt 按 20px/页累计，越往后偏差越大（每页多算
     10px），跳页后页顶被顶部栏遮住 ~N×10px。现在 DOM 与页高表口径完全一致。 */
  .bk-pdf-page canvas{display:block;width:100%;height:100%}
  .bk-pdf-page .bk-pdf-loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#c9c2b4;font-size:12px}
  /* 夜间模式：反色滤镜（白底 PDF 变暗底亮字），只作用于页面画布 */
  .bk-night .bk-pdf-page{background:#1f2024;box-shadow:0 3px 14px rgba(0,0,0,.5)}
  .bk-night .bk-pdf-page canvas{filter:invert(.92) hue-rotate(180deg)}
  .bk-night .bk-pdf-page .bk-pdf-loading{color:#6d6a62}
  .bk-shelf{display:grid;grid-template-columns:repeat(3,1fr);gap:16px 12px;padding:4px 2px}
  .bk-card{cursor:pointer;position:relative}
  .bk-cover{position:relative;width:100%;aspect-ratio:3/4;border-radius:9px;overflow:hidden;box-shadow:0 3px 10px rgba(80,60,30,.14);background:#ece7db;display:flex;align-items:center;justify-content:center}
  .bk-cover img{width:100%;height:100%;object-fit:cover;display:block}
  .bk-no-cover{color:#b3a98f}
  .bk-del{position:absolute;top:5px;right:5px;width:24px;height:24px;border-radius:50%;background:rgba(0,0,0,.32);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer}
  .bk-exp{position:absolute;top:5px;left:5px;width:24px;height:24px;border-radius:50%;background:rgba(0,0,0,.32);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer}
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
  /* v3.11.0：目录/书签双 tab + 书签条目 */
  .bk-toc-tabs{display:flex;gap:6px;padding:10px 14px;border-bottom:1px solid #eee2}
  .bk-toc-tab{flex:1;text-align:center;padding:6px 0;border-radius:14px;border:1px solid #e2ded4;background:#f7f5ef;color:#7a7263;font-size:13px;cursor:pointer}
  .bk-toc-tab.bk-on{background:#efe9dc;color:#5a4f38;border-color:#d8cfba;font-weight:600}
  .bk-toc-it{display:flex;align-items:center;gap:8px}
  .bk-toc-it .tx{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .bk-toc-it .meta{font-size:11px;color:#b3ab99;flex:none}
  .bk-toc-it .del{flex:none;width:26px;height:26px;line-height:24px;text-align:center;border-radius:50%;color:#c9c2b2;font-size:15px;cursor:pointer}
  .bk-toc-it .del:active{background:#f0ece1;color:#a05a4a}
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
  /* v3.10.0：大书不进总备份（base64 会撑爆备份文件），提醒走书架单独导出 */
  const big = files.filter(f => f.size > 8 * 1024 * 1024).length;
  if (big) setTimeout(() => showToast('其中 ' + big + ' 本超过 8MB：不随总备份走，可在书架页点封面左上角导出按钮单独备份'), 2600);
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
  bkPdfWorkerSrc();
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
  /* UTF-16（记事本「Unicode」保存的 txt）：先认 BOM。
     不认 BOM 的话 auto 会拿 UTF-16 字节去解 GB18030 得到乱码，而手动选项只有 UTF-8/GBK，
     用户怎么切都救不回来（v3.9.4 修）。 */
  if (enc === 'auto') {
    const u16 = bkSniffUtf16(bytes);
    if (u16) return new TextDecoder(u16).decode(bytes.subarray(2));
  }
  let start = 0;
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) start = 3; // UTF-8 BOM
  const body = bytes.subarray(start);
  if (enc === 'utf-8') return new TextDecoder('utf-8').decode(body);
  if (enc === 'gbk') return new TextDecoder('gb18030').decode(body);   // GB18030 兼容 GBK
  // auto：先严格 UTF-8，失败兜底 GB18030
  try { return new TextDecoder('utf-8', { fatal: true }).decode(body); }
  catch (e) { return new TextDecoder('gb18030').decode(body); }
}

/* UTF-16 嗅探（返回 'utf-16le' / 'utf-16be' / ''）：
   BOM 优先；无 BOM 时看零字节的奇偶分布 —— 纯 ASCII 的 UTF-16 文本恰好一半字节是 0，
   而 UTF-8/GBK 中文文本里几乎不出现 0x00，所以阈值卡紧后不会误判。 */
function bkSniffUtf16(bytes) {
  if (bytes.length < 2) return '';
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) return 'utf-16le';
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) return 'utf-16be';
  const n = Math.min(bytes.length, 4096);
  if (n < 8) return '';
  let evenZero = 0, oddZero = 0;
  for (let i = 0; i < n; i++) { if (bytes[i] === 0) { if (i % 2) oddZero++; else evenZero++; } }
  const half = n / 2;
  if (oddZero > half * 0.45 && evenZero < half * 0.05) return 'utf-16le';
  if (evenZero > half * 0.45 && oddZero < half * 0.05) return 'utf-16be';
  return '';
}

/* =========================================================
   三、书架视图
   ========================================================= */
async function renderBookshelf() {
  bkInjectStyle();
  /* 进入书架即收掉可能残留的阅读会话（顺带把挂起的进度落库），并复位返回键 */
  bkTeardownSession();
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
        <div class="bk-exp" title="导出原文件" onclick="event.stopPropagation();bkExportBook(${rec.id})"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M4 19h16"/></svg></div>
      </div>
      <div class="bk-name">${esc(rec.name)}</div>
      <div class="bk-prog">${[bkFmtSize(rec.size), bkProgressText(rec)].filter(Boolean).join(' · ')}</div>
    </div>`).join('');
  body.innerHTML = `<div class="bk-shelf">${cards}</div>`;
}

/* 字节数 → 展示体积（书卡用；size 缺失时返回空串不占位） */
function bkFmtSize(n) {
  if (typeof n !== 'number' || n <= 0) return '';
  if (n >= 1024 * 1024) return (n / 1048576).toFixed(1) + 'MB';
  if (n >= 1024) return Math.round(n / 1024) + 'KB';
  return n + 'B';
}

/* 单本导出：原文件 Blob 原样下载/分享（v3.10.0，大书不进总备份的替代通道） */
function bkExportBook(id) {
  dbGet('books', id).then(rec => {
    if (!rec || !rec.blob) { showToast('书不存在或文件已丢失'); return; }
    const ext = rec.type === 'pdf' || /pdf/i.test(rec.mime || '') ? '.pdf' : '.txt';
    const name = (rec.name || 'book') + ext;
    confirmDownload(name, async () => ({ blob: rec.blob, name }));
  }).catch(() => showToast('导出失败，请重试'));
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

/* 收掉当前阅读会话：把挂起的进度落库、作废动画与防抖计时器、销毁 PDF 文档、释放整本 buffer。
   离开阅读页（返回书架/重开一本）都必须走这里，否则 PDF 文档与 ArrayBuffer 会一直挂着（v3.9.4 修）。 */
function bkTeardownSession() {
  const s = _bk;
  if (s) {
    /* bkSaveProgress 在首个 await 前就同步取走了 _bk，因此先调用再置空也能正常写入 */
    if (s.rec) { try { bkSaveProgress(); } catch (e) {} }
    bkCancelPageAnim();
    bkStopMapper();                          // v3.10.0：停掉后台测量器
    clearTimeout(_bkMapSaveT); _bkMapSaveT = null;
    try { if (s.pdfDoc && s.pdfDoc.destroy) s.pdfDoc.destroy().catch(function () {}); } catch (e) {}
    s.pdfDoc = null;
    s.buffer = null;
    s.text = null;
    s.paras = null;
    s._pageParas = null;
  }
  _bkPinchActive = false;
  clearTimeout(_bkSaveTimer);
  clearTimeout(_bkRelayoutTimer);
  _bk = null;
}

let _bkOpenSeq = 0;   // 打开序号：连点两张书卡时作废先发起的那次，避免两次打开互相覆盖 DOM / 状态

let _bkOpenAt = 0;   // v3.11.1：连点保护——大书打开要几百 ms，用户会再点一下，
                     // 第二次点按在部分手机浏览器（无视 viewport 缩放限制的内置内核）里
                     // 会触发双击缩放，把书架页「放大一点」后再进阅读器
async function openBook(id) {
  const now = Date.now();
  if (now - _bkOpenAt < 800) return;
  _bkOpenAt = now;
  bkInjectStyle();
  const seq = ++_bkOpenSeq;
  bkTeardownSession();
  let rec = null;
  try { rec = await dbGet('books', id); } catch (e) {}
  if (seq !== _bkOpenSeq) return;                      // 读取期间已被后一次打开接管
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
    animLock: false,
    /* v3.10.0 分块虚拟分页 */
    chunkSize: BK_CHUNK_PARAS,
    blockMap: null,        // 每块 {chars:[各页首字符], pages:n}，null=未量
    curChunk: -1, curLocal: 0, curChar: 0,
    mountSeq: 0, mapSeq: 0, mapAllDone: false,
    _pageParas: null, _prevPageParas: null, _pageUnit: 0, _padLeft: 0,
    scrollFirst: -1, scrollLast: -1
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
  if (_bk !== s) return;                                 // 读取期间已被另一次打开接管
  s.text = decodeBookText(s.buffer, s.encoding);
  bkBuildParas();
  /* v3.10.0 内存止血：分段完成后正文只需要 paras 里那一份字符串引用，
     buffer / text / lines 三份大引用立刻松手（重编码时按需从 blob 重读，见 bkEnsureBuffer）。
     20MB 书这一下少占 30~40MB 堆内存。 */
  s.buffer = null; s.text = null; s.lines = null;

  body.innerHTML = `<div class="bk-stage" id="bk-stage"></div>`;
  bkBindResize();
  bkBuildTxtReader();
}

/* 从 s.text 建段落索引 + 章节探测（打开与重编码共用；字符偏移以「行 + \n」累计，与渲染解耦） */
function bkBuildParas() {
  const s = _bk;
  let off = 0;
  s.paras = (s.text || '').split(/\r?\n/).map(t => {
    const o = { text: t, charStart: off };
    off += t.length + 1;
    return o;
  });
  s.totalChars = Math.max(1, off);
  s.chapters = [];
  for (let i = 0; i < s.paras.length; i++) {
    const t = s.paras[i].text;
    if (t.trim() && BK_CHAPTER_RE.test(t)) s.chapters.push({ title: t.trim().slice(0, 40), charStart: s.paras[i].charStart, paraIndex: i });
  }
}

/* 重编码时需要整本字节：buffer 在打开后被止血释放，这里按需从 blob 重读 */
async function bkEnsureBuffer() {
  const s = _bk; if (!s) return null;
  if (!s.buffer) { try { s.buffer = await s.rec.blob.arrayBuffer(); } catch (e) {} }
  return s.buffer;
}

/* ---------- 分块虚拟分页：块几何工具 ---------- */
function bkChunkCount() {
  const s = _bk; if (!s || !s.paras) return 0;
  return Math.max(1, Math.ceil(s.paras.length / s.chunkSize));
}
function bkChunkParaRange(b) {
  const s = _bk;
  const a = b * s.chunkSize;
  return [a, Math.min((b + 1) * s.chunkSize, s.paras.length)];
}
/* 第 b 块覆盖的字符数（下一块起点 − 本块起点） */
function bkChunkChars(b) {
  const s = _bk;
  const start = s.paras[b * s.chunkSize] ? s.paras[b * s.chunkSize].charStart : s.totalChars;
  const nextStart = (b + 1) * s.chunkSize < s.paras.length ? s.paras[(b + 1) * s.chunkSize].charStart : s.totalChars;
  return Math.max(1, nextStart - start);
}
function bkChunkOfChar(charPos) {
  const s = _bk; if (!s || !s.paras || !s.paras.length) return 0;
  let lo = 0, hi = s.paras.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (s.paras[mid].charStart <= charPos) { ans = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return Math.min(bkChunkCount() - 1, Math.floor(ans / s.chunkSize));
}

/* 按当前模式搭建阅读区（切模式/改编码/旋转后重建）。
   v3.10.0：两种模式都只挂「当前块附近」的段落，不再整本进 DOM。 */
function bkBuildTxtReader() {
  const s = _bk; if (!s || s.type !== 'txt') return;
  const stage = document.getElementById('bk-stage');
  if (!stage) return;
  bkHideMenu();

  if (s.settings.mode === 'page') {
    stage.innerHTML = `
      <div class="bk-clip" id="bk-pageclip"><div class="bk-flow bk-paged" id="bk-pageflow"></div></div>
      <div class="bk-pagefoot" id="bk-pagefoot"></div>
      ${bkMenuHTML()}
    `;
    bkApplyTxtStyle();
    bkMapHydrate();                                     // 命中缓存则页映射直接可用
    const target = (s.fraction || 0) * s.totalChars;
    s._jumpNoAnim = true;
    bkMountChunk(bkChunkOfChar(target), target);
    s._jumpNoAnim = false;
    bkStartMapper();                                    // 后台把其余块量完（写缓存）
  } else {
    stage.innerHTML = `
      <div class="bk-reader-scroll" id="bk-txt-scroll"><div class="bk-txt-text" id="bk-txt-text"></div></div>
      ${bkMenuHTML()}
    `;
    bkApplyTxtStyle();
    bkBuildScrollReader((s.fraction || 0) * s.totalChars);
  }
}

/* 把第 b 块段落插到 host（末尾或 insertBefore 之前）；块 ≤ BK_CHUNK_PARAS 段，一次 fragment 插入无卡顿 */
function bkFillChunk(host, b, insertBefore) {
  const s = _bk; if (!host) return;
  const [a, z] = bkChunkParaRange(b);
  const frag = document.createDocumentFragment();
  for (let i = a; i < z; i++) {
    const p = document.createElement('p');
    p.className = 'bk-p' + (BK_CHAPTER_RE.test(s.paras[i].text) ? ' bk-h' : '');
    p.textContent = s.paras[i].text.length ? s.paras[i].text : ' ';   // 空行占一行
    p._charStart = s.paras[i].charStart;
    frag.appendChild(p);
  }
  if (insertBefore) host.insertBefore(frag, insertBefore);
  else host.appendChild(frag);
}

/* ---------- 翻页模式：分块虚拟分页（v3.10.0） ---------- */
/* 设定 multicol 容器规格（与阅读流/离屏测量器共用）。沿用 v3.9.1 的口径：
   分栏宽度 = 内容区宽（扣左右边距），翻页步长以浏览器实测为准。 */
function bkPrepareFlow(flow) {
  const s = _bk;
  const stage = document.getElementById('bk-stage');
  const W = stage.clientWidth, H = stage.clientHeight;
  flow.style.boxSizing = 'border-box';
  flow.style.width = W + 'px';
  flow.style.height = H + 'px';
  const cs = getComputedStyle(flow);
  const cw = Math.max(120, W - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
  flow.style.columnWidth = cw + 'px';
  flow.style.columnGap = BK_COL_GAP + 'px';
  flow.style.transform = 'translateX(0)';
  return cs;
}

function bkChunkEndChar(b) {
  const s = _bk;
  const p = s.paras[b * s.chunkSize];
  const start = p ? p.charStart : s.totalChars;
  return Math.min(s.totalChars, start + bkChunkChars(b));
}

/* 量一个已装填、已定规格的 multicol 容器：逐页首字符 + 页数 + 步长 + 页段落引用。
   与 v3.9.x 整本量法同一套不变量，只是作用域从「整本」缩到「当前块」：
   - 步长基准 = 内容区宽 + 栏间距（精确浮点）；实测校验取「相邻两段 offsetLeft 的最小正差值」，
     绝不能拿首段当基准 —— 首段跨多栏时差值会被放大成整数倍（v3.9.4 修）；
   - 总页数由段落实测列号推导（WebKit 的 scrollWidth 不含 multicol 溢出宽度，不可用，v3.9.2 修）；
   - 无段落开头的页（长段落跨页）线性插值 + 尾部外推到块末字符，进度不出现 0%/断链（v3.9.4/##150）。 */
function bkMeasureFlow(flow, endChar) {
  const cs = getComputedStyle(flow);
  const cw = Math.max(120, flow.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
  let period = cw + BK_COL_GAP;
  const kids = flow.children;
  let measured = 0;
  for (let k = 1; k < kids.length; k++) {
    const d = kids[k].offsetLeft - kids[k - 1].offsetLeft;
    if (d > cw * 0.5 && (!measured || d < measured)) measured = d;
  }
  if (measured > 0 && measured < period - 2) period = measured;
  const padLeft = parseFloat(cs.paddingLeft) || 0;

  let maxPg = 0;
  for (const p of kids) {
    const pg = Math.round((p.offsetLeft - padLeft) / period);
    if (pg > maxPg) maxPg = pg;
  }
  const totalSW = Math.round((flow.scrollWidth - padLeft) / period);
  const total = Math.max(1, maxPg + 1, totalSW || 0);
  const chars = new Array(total).fill(-1);
  const pageParas = new Array(total);
  for (const p of kids) {
    const pg = Math.max(0, Math.round((p.offsetLeft - padLeft) / period));
    if (pg < total) {
      if (chars[pg] < 0) chars[pg] = p._charStart;
      (pageParas[pg] || (pageParas[pg] = [])).push(p);
    }
  }
  let lastPg = -1, lastChar = 0;
  for (let i = 0; i < total; i++) {
    if (chars[i] >= 0) {
      if (lastPg >= 0 && i - lastPg > 1) {
        for (let j = lastPg + 1; j < i; j++) {
          chars[j] = Math.round(lastChar + (chars[i] - lastChar) * (j - lastPg) / (i - lastPg));
        }
      }
      lastPg = i; lastChar = chars[i];
    }
  }
  if (lastPg >= 0 && lastPg < total - 1) {
    for (let j = lastPg + 1; j < total; j++) {
      chars[j] = Math.round(lastChar + (endChar - lastChar) * (j - lastPg) / (total - 1 - lastPg));
    }
  }
  let last = 0;
  for (let i = 0; i < total; i++) {
    if (chars[i] < 0) chars[i] = last;
    else last = chars[i];
  }
  return { chars, pages: total, unit: period, padLeft, pageParas };
}

/* 挂载第 b 块并定位到 targetChar 所在页。同步完成（一次 fragment 插入 + 一次重排）。
   隐藏页守卫沿用 v3.9.4：舞台尺寸为 0（上滑回桌面/系统返回后）直接返回，绝不把进度写成 0。 */
function bkMountChunk(b, targetChar) {
  const s = _bk; if (!s || s.type !== 'txt') return;
  const stage = document.getElementById('bk-stage');
  const flow = document.getElementById('bk-pageflow');
  if (!stage || !flow) return;
  if (!stage.clientWidth || !stage.clientHeight) return;
  bkCancelPageAnim();
  b = Math.max(0, Math.min(bkChunkCount() - 1, b));
  if (s.curChunk !== b) {
    s._prevPageParas = (s._pageParas && s._pageParas[s.curLocal]) || null;   // 跨块动画的旧页快照
    flow.innerHTML = '';
    bkFillChunk(flow, b);
    s.curChunk = b;
    s._pageParas = null;
  }
  bkApplyTxtStyleTo(flow);
  bkPrepareFlow(flow);
  const m = bkMeasureFlow(flow, bkChunkEndChar(b));
  s._pageUnit = m.unit; s._padLeft = m.padLeft; s._pageParas = m.pageParas;
  s.blockMap = s.blockMap || [];
  s.blockMap[b] = { chars: m.chars, pages: m.pages };

  let local = 0;
  for (let i = 0; i < m.chars.length; i++) { if (m.chars[i] <= targetChar) local = i; else break; }
  s.curLocal = local;
  s.curChar = m.chars[local] != null ? m.chars[local] : targetChar;
  flow.style.transition = 'none';
  flow.style.transform = 'translateX(' + (-local * s._pageUnit) + 'px)';
  bkUpdatePageFoot();
  bkUpdateMenuSlider();
}

/* ---------- 后台测量器：逐块量页映射（离屏同规格容器，不碰阅读流；块间让帧，交互优先） ---------- */
function bkStartMapper() {
  const s = _bk; if (!s || s.type !== 'txt' || s.mapAllDone) return;
  const stage = document.getElementById('bk-stage'); if (!stage) return;
  const seq = ++s.mapSeq;
  let holder = document.getElementById('bk-measure');
  if (!holder) {
    holder = document.createElement('div');
    holder.id = 'bk-measure';
    holder.style.cssText = 'position:absolute;left:-99999px;top:0;width:100%;height:100%;visibility:hidden;pointer-events:none;overflow:hidden';
    stage.appendChild(holder);
  }
  const flow = document.createElement('div');
  flow.className = 'bk-flow bk-paged';
  holder.appendChild(flow);

  (async () => {
    const n = bkChunkCount();
    for (let b = 0; b < n; b++) {
      if (seq !== s.mapSeq || _bk !== s) { holder.remove(); return; }
      if (s.blockMap && s.blockMap[b]) continue;
      await new Promise(r => requestAnimationFrame(r));
      if (seq !== s.mapSeq || _bk !== s || s.type !== 'txt') { holder.remove(); return; }
      flow.innerHTML = '';
      bkFillChunk(flow, b);
      bkApplyTxtStyleTo(flow);
      bkPrepareFlow(flow);
      const m = bkMeasureFlow(flow, bkChunkEndChar(b));
      if (seq !== s.mapSeq || _bk !== s) { holder.remove(); return; }
      s.blockMap = s.blockMap || [];
      s.blockMap[b] = { chars: m.chars, pages: m.pages };
      bkMapSaveDebounce();
      bkUpdatePageFoot();     // 总页数估计随测量进度收敛
    }
    s.mapAllDone = true;
    holder.remove();
    bkMapSave();
    bkUpdatePageFoot();
  })();
}

function bkStopMapper() {
  const s = _bk; if (!s) return;
  s.mapSeq++;
  const holder = document.getElementById('bk-measure');
  if (holder) holder.remove();
}

/* ---------- 页映射缓存（存 rec.pageCache；key = 排版参数 + 视口 + 文件规模，变了自动失效） ---------- */
function bkMapKey() {
  const s = _bk;
  const stage = document.getElementById('bk-stage');
  return ['v1', s.chunkSize, s.encoding, s.settings.fontSize, s.settings.lineHeight, s.settings.letterSpacing,
    s.settings.paraSpacing, s.settings.margin, s.settings.indent ? 1 : 0, s.settings.fontFamily || 'system', BK_COL_GAP,
    stage ? stage.clientWidth : 0, stage ? stage.clientHeight : 0, s.rec.size || 0].join('|');
}
let _bkMapSaveT = null;
function bkMapSaveDebounce() {
  clearTimeout(_bkMapSaveT);
  _bkMapSaveT = setTimeout(bkMapSave, 3000);
}
function bkMapSave() {
  const s = _bk; if (!s || !s.blockMap || s.type !== 'txt') return;
  clearTimeout(_bkMapSaveT); _bkMapSaveT = null;
  s.rec.pageCache = { k: bkMapKey(), size: s.chunkSize, blocks: s.blockMap.map(m => m ? { c: m.chars, p: m.pages } : null) };
  try { dbPut('books', s.rec).catch(() => {}); } catch (e) {}
}
function bkMapHydrate() {
  const s = _bk;
  const pc = s.rec && s.rec.pageCache;
  if (!pc || pc.size !== s.chunkSize || pc.k !== bkMapKey() || !pc.blocks || !pc.blocks.length) return false;
  s.blockMap = pc.blocks.map(x => x ? { chars: x.c, pages: x.p } : null);
  s.mapAllDone = s.blockMap.every(Boolean);
  return true;
}
function bkInvalidateMap() {
  const s = _bk; if (!s) return;
  bkStopMapper();
  s.blockMap = null; s.mapAllDone = false;
}

/* 当前页的全局展示页号（x/y）：已量块用实测，未量块按「平均每字符页数」估计，量完即精确 */
function bkPageLabel() {
  const s = _bk;
  const n = bkChunkCount();
  let mPages = 0, mChars = 0;
  for (let b = 0; b < n; b++) {
    const m = s.blockMap && s.blockMap[b];
    if (m) { mPages += m.pages; mChars += bkChunkChars(b); }
  }
  const perChar = mChars > 0 ? mPages / mChars : 0;
  const est = b => perChar > 0
    ? Math.max(1, Math.round(bkChunkChars(b) * perChar))
    : Math.max(1, Math.ceil(bkChunkChars(b) / 1200));
  let before = 0, total = 0;
  for (let b = 0; b < n; b++) {
    const m = s.blockMap && s.blockMap[b];
    const p = m ? m.pages : est(b);
    if (b < s.curChunk) before += p;
    total += p;
  }
  return { x: before + s.curLocal + 1, y: total, exact: !!(s.blockMap && n > 0 && s.blockMap.length === n && s.blockMap.every(Boolean)) };
}

/* 作废进行中的翻页动画：递增动画序号让旧 finish 回调失效，并清掉克隆层、解锁输入。
   重排（resize/改排版）与直跳（进度滑条/章节目录）都会抢占动画；
   不作废的话，旧回调 330ms 后会用「旧页号 × 旧步长」把位移写回去，翻页与页脚/进度就此对不上（v3.9.4 修）。 */
function bkCancelPageAnim() {
  const s = _bk; if (!s) return;
  s.animSeq = (s.animSeq || 0) + 1;
  const stage = document.getElementById('bk-stage');
  if (stage) {
    const ovs = stage.querySelectorAll('.bk-pageov');
    for (let i = 0; i < ovs.length; i++) ovs[i].remove();
  }
  s.animLock = false;
}

/* ---------- 翻页：块内动画 / 跨块换装（v3.10.0） ---------- */
/* 块内翻到 local 页：基座仍是旧页，动画结束才提交位移（v3.9.3 克隆页面层方案原样保留） */
function bkTurnTo(local, dir) {
  const s = _bk; if (!s || s.type !== 'txt') return;
  const flow = document.getElementById('bk-pageflow');
  const blk = s.blockMap && s.blockMap[s.curChunk];
  if (!flow || !blk) return;
  local = Math.max(0, Math.min(blk.pages - 1, local));
  const prev = s.curLocal;
  if (local === prev) return;
  s.curLocal = local;
  s.curChar = blk.chars[local] != null ? blk.chars[local] : s.curChar;
  s.fraction = Math.min(1, Math.max(0, s.curChar / s.totalChars));
  bkUpdatePageFoot();
  bkUpdateMenuSlider();
  clearTimeout(_bkSaveTimer);
  _bkSaveTimer = setTimeout(bkSaveProgress, 600);

  const anim = s.settings.anim || 'cover';
  const stage = document.getElementById('bk-stage');
  const unit = s._pageUnit || (stage.clientWidth + BK_COL_GAP);   // 必须用 bkMountChunk 实测的步长，否则翻页累积偏移

  if (s._jumpNoAnim || anim === 'none') {
    bkCancelPageAnim();                    // 直跳/无动画抢占动画，作废其回调，避免过期位移回写
    flow.style.transition = 'none';
    flow.style.transform = 'translateX(' + (-local * unit) + 'px)';
    return;
  }
  if (s.animLock) return;

  bkCancelPageAnim();                      // 兜底清掉任何残留动画层（正常路径由 animLock 挡住重入）
  s.animLock = true;
  const seq = s.animSeq = (s.animSeq || 0) + 1;   // 本次动画序号，被抢占后 finish 直接作废
  const newOv = bkMakePageOverlay(local, null);
  let oldOv = null;
  const finish = () => {
    if (seq !== s.animSeq) return;         // 期间发生了重排/直跳：位移已由新的分页结果决定，不再回写
    flow.style.transition = 'none';
    flow.style.transform = 'translateX(' + (-local * unit) + 'px)';
    newOv.remove();
    if (oldOv) oldOv.remove();
    s.animLock = false;
  };

  if (anim === 'slide') {
    /* 滑动：旧页滑出 + 新页滑入，同步等速，中间无空隙 */
    oldOv = bkMakePageOverlay(prev, null);
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

/* 跨块翻页：挂载新块后基座已换装，旧页只能靠快照克隆垫底，再让新页滑入 */
function bkTurnChunk(b, dir) {
  const s = _bk; if (!s || s.type !== 'txt') return;
  if (b < 0 || b >= bkChunkCount()) return;
  const wasNoAnim = !!s._jumpNoAnim;
  const anim = s.settings.anim || 'cover';
  const prevParas = (s._pageParas && s._pageParas[s.curLocal]) || null;
  const targetChar = dir > 0
    ? (s.paras[b * s.chunkSize] ? s.paras[b * s.chunkSize].charStart : s.totalChars)
    : (s.totalChars - 1);                 // 反向：取块内最后一页
  bkMountChunk(b, targetChar);
  if (wasNoAnim || anim === 'none' || s.animLock) return;

  const stage = document.getElementById('bk-stage');
  if (!stage) return;
  bkCancelPageAnim();
  s.animLock = true;
  const seq = s.animSeq = (s.animSeq || 0) + 1;
  const newOv = bkMakePageOverlay(s.curLocal, null);
  let oldOv = null, under = null;
  const finish = () => {
    if (seq !== s.animSeq) return;
    newOv.remove();
    if (oldOv) oldOv.remove();
    if (under) under.remove();
    s.animLock = false;
  };
  if (anim === 'slide') {
    oldOv = bkMakePageOverlay(-1, prevParas);
    oldOv.style.zIndex = '5';
    newOv.style.zIndex = '6';
    newOv.style.transform = 'translateX(' + (dir > 0 ? '100%' : '-100%') + ')';
    void newOv.offsetWidth;
    const trans = 'transform .3s ease';
    oldOv.style.transition = trans; newOv.style.transition = trans;
    oldOv.style.transform = 'translateX(' + (dir > 0 ? '-100%' : '100%') + ')';
    newOv.style.transform = 'translateX(0)';
  } else {
    /* 覆盖：旧页快照全程垫底，新页从行进方向滑入盖住 */
    under = bkMakePageOverlay(-1, prevParas);
    under.style.zIndex = '5';
    newOv.style.zIndex = '6';
    newOv.style.transform = 'translateX(' + (dir > 0 ? '100%' : '-100%') + ')';
    newOv.style.boxShadow = dir > 0 ? '-8px 0 20px rgba(0,0,0,.18)' : '8px 0 20px rgba(0,0,0,.18)';
    void newOv.offsetWidth;
    newOv.style.transition = 'transform .3s ease';
    newOv.style.transform = 'translateX(0)';
  }
  setTimeout(finish, 330);
}

/* 克隆某一页的段落为一个全屏覆盖层（paras 传 null 取当前块第 pg 页；无段落时纯色兜底） */
function bkMakePageOverlay(pg, paras) {
  const s = _bk;
  const stage = document.getElementById('bk-stage');
  const flow = document.getElementById('bk-pageflow');
  if (!stage) return document.createElement('div');
  const cs = flow ? getComputedStyle(flow) : null;
  const bg = (bkBgList()[s.settings.bg] || bkBgList().paper);
  const ov = document.createElement('div');
  ov.className = 'bk-pageov';               // 供 bkCancelPageAnim 统一清理
  ov.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;z-index:6;'
    + 'background:' + bg[0] + ';color:' + bg[1] + ';';
  const list = paras || ((s._pageParas || [])[pg]);
  if (list && list.length && cs) {
    const inner = document.createElement('div');
    inner.style.cssText = 'height:100%;overflow:hidden;'
      + 'padding:' + cs.paddingTop + ' ' + cs.paddingRight + ' ' + cs.paddingBottom + ' ' + cs.paddingLeft + ';'
      + 'font-size:' + cs.fontSize + ';line-height:' + cs.lineHeight + ';letter-spacing:' + cs.letterSpacing + ';';
    for (const p of list) inner.appendChild(p.cloneNode(true));
    ov.appendChild(inner);
  }
  stage.appendChild(ov);
  return ov;
}

function bkNextPage() {
  const s = _bk;
  if (!s || s.type !== 'txt' || s.settings.mode !== 'page' || s.animLock) return;
  const blk = s.blockMap && s.blockMap[s.curChunk];
  if (!blk) return;
  if (s.curLocal >= blk.pages - 1) {
    if (s.curChunk >= bkChunkCount() - 1) { showToast('已经是最后一页'); return; }
    bkTurnChunk(s.curChunk + 1, 1);
    return;
  }
  bkTurnTo(s.curLocal + 1, 1);
}
function bkPrevPageTxt() {
  const s = _bk;
  if (!s || s.type !== 'txt' || s.settings.mode !== 'page' || s.animLock) return;
  if (s.curLocal <= 0) {
    if (s.curChunk <= 0) { showToast('已经是第一页'); return; }
    bkTurnChunk(s.curChunk - 1, -1);
    return;
  }
  bkTurnTo(s.curLocal - 1, -1);
}

/* 字符定位统一入口：滑条/目录/章节跳转/进度恢复全走这里（v3.10.0） */
function bkSeekChar(charPos, noAnim) {
  const s = _bk; if (!s || s.type !== 'txt') return;
  charPos = Math.max(0, Math.min((s.totalChars || 1) - 1, charPos));
  if (s.settings.mode !== 'page') { bkScrollSeek(charPos); return; }
  const b = bkChunkOfChar(charPos);
  if (b === s.curChunk && s.blockMap && s.blockMap[b]) {
    const chars = s.blockMap[b].chars;
    let local = 0;
    for (let i = 0; i < chars.length; i++) { if (chars[i] <= charPos) local = i; else break; }
    if (noAnim) s._jumpNoAnim = true;
    bkTurnTo(local, local >= s.curLocal ? 1 : -1);
    s._jumpNoAnim = false;
  } else {
    if (noAnim) s._jumpNoAnim = true;
    bkMountChunk(b, charPos);
    s._jumpNoAnim = false;
  }
}

/* 页脚：章节名 · x/y · 百分比（x/y 由页映射合成，未量完的块按平均页密度估计）
   百分比按页计算（长段落跨页时字符偏移会失真），尾页恰为 100% */
function bkUpdatePageFoot() {
  const s = _bk;
  const foot = document.getElementById('bk-pagefoot');
  if (!foot || !s || s.type !== 'txt' || s.curChunk < 0) return;
  const ch = bkChapterByChar(s.curChar || 0);
  const L = bkPageLabel();
  const pct = L.y > 1 ? ((L.x - 1) / (L.y - 1) * 100) : 100;
  const pctStr = (pct >= 99.95 ? 100 : pct).toFixed(1);
  foot.innerHTML = `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:52%">${esc(ch ? ch.title : '')}</span>
    <span>${L.x}/${L.y} · ${pctStr}%</span>`;
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

/* ---------- 滚动模式：无限滚动 + 顶部裁剪（窗口里最多 3 块，v3.10.0 虚拟化） ---------- */
function bkBuildScrollReader(targetChar) {
  const s = _bk; if (!s || s.type !== 'txt') return;
  const sc = document.getElementById('bk-txt-scroll');
  const host = document.getElementById('bk-txt-text');
  if (!sc || !host) return;
  s.scrollFirst = s.scrollLast = -1;
  const b0 = bkChunkOfChar(targetChar || 0);
  bkScrollMount(b0);
  let el = null;
  for (const p of host.children) { if (p._charStart <= (targetChar || 0)) el = p; else break; }
  sc.scrollTop = el ? Math.max(0, el.offsetTop - 8) : 0;
  sc.onscroll = bkOnTxtScroll;
  /* 初始窗口：目标块之后先垫一块，往下滚才有余量 */
  if (s.scrollLast < bkChunkCount() - 1) bkScrollMount(s.scrollLast + 1);
}
function bkScrollMount(b) {
  const s = _bk;
  const host = document.getElementById('bk-txt-text');
  if (!host || b < 0 || b >= bkChunkCount()) return;
  if (s.scrollFirst < 0) s.scrollFirst = b;
  bkFillChunk(host, b);
  s.scrollLast = b;
}
function bkScrollPrepend(b) {
  const s = _bk;
  const host = document.getElementById('bk-txt-text');
  const sc = document.getElementById('bk-txt-scroll');
  if (!host || !sc || b < 0 || b >= bkChunkCount()) return;
  const h0 = host.offsetHeight, top0 = sc.scrollTop;
  bkFillChunk(host, b, host.firstChild);
  s.scrollFirst = b;
  sc.scrollTop = top0 + (host.offsetHeight - h0);   // 顶部插入后补偿，视觉不动
}
function bkScrollTrimTop() {
  const s = _bk;
  const sc = document.getElementById('bk-txt-scroll');
  const host = document.getElementById('bk-txt-text');
  if (!sc || !host || s.scrollLast - s.scrollFirst < 3) return;
  const cnt = bkChunkParaRange(s.scrollFirst)[1] - bkChunkParaRange(s.scrollFirst)[0];
  const kids = host.children;
  if (kids.length <= cnt) return;
  const delta = kids[cnt].offsetTop - kids[0].offsetTop;   // 第一块的流高度（含外边距）
  if (sc.scrollTop < delta + 800) return;                   // 还没滚出第一块就不裁
  for (let i = 0; i < cnt; i++) kids[0].remove();
  s.scrollFirst++;
  sc.scrollTop = Math.max(0, sc.scrollTop - delta);
}
function bkScrollTrimBottom() {
  const s = _bk;
  const host = document.getElementById('bk-txt-text');
  if (!host || s.scrollLast - s.scrollFirst < 3) return;
  const cnt = bkChunkParaRange(s.scrollLast)[1] - bkChunkParaRange(s.scrollLast)[0];
  for (let i = 0; i < cnt; i++) { if (host.lastChild) host.lastChild.remove(); }
  s.scrollLast--;
}
function bkOnTxtScroll() {
  const s = _bk; if (!s || s.type !== 'txt') return;
  const sc = document.getElementById('bk-txt-scroll');
  const host = document.getElementById('bk-txt-text');
  if (!sc || !host) return;
  const max = sc.scrollHeight - sc.clientHeight;
  s.fraction = max > 0 ? Math.min(1, Math.max(0, sc.scrollTop / max)) : 0;
  bkUpdateMenuSlider();
  clearTimeout(_bkSaveTimer);
  _bkSaveTimer = setTimeout(bkSaveProgress, 500);
  /* 虚拟窗口维护：近底补下一块；近顶补上一块并裁尾；滚出第一块后裁头 */
  if (sc.scrollTop + sc.clientHeight > host.offsetHeight - 1400 && s.scrollLast < bkChunkCount() - 1) {
    bkScrollMount(s.scrollLast + 1);
  }
  if (sc.scrollTop < 800 && s.scrollFirst > 0) {
    bkScrollPrepend(s.scrollFirst - 1);
    bkScrollTrimBottom();
  }
  bkScrollTrimTop();
}
function bkScrollSeek(charPos) {
  const s = _bk;
  const host = document.getElementById('bk-txt-text');
  const sc = document.getElementById('bk-txt-scroll');
  if (!host || !sc) { bkBuildTxtReader(); return; }
  const tChunk = bkChunkOfChar(charPos);
  if (tChunk >= s.scrollFirst && tChunk <= s.scrollLast) {
    let el = null;
    for (const p of host.children) { if (p._charStart <= charPos) el = p; else break; }
    if (el) { sc.scrollTop = Math.max(0, el.offsetTop - 8); return; }
  }
  bkBuildScrollReader(charPos);   // 目标在挂载窗口外：重建窗口
}

/* ---------- 样式应用（翻页/滚动/离屏测量共用） ---------- */
function bkApplyTxtStyle() {
  const s = _bk; if (!s || s.type !== 'txt') return;
  const set = s.settings;
  const b = bkBgList()[set.bg] || bkBgList().paper;
  const stage = document.getElementById('bk-stage');
  const host = document.getElementById('bk-txt-text') || document.getElementById('bk-pageflow');
  if (stage) {
    stage.style.background = b[0];
    stage.style.color = b[1];
    stage.style.fontFamily = bkFontStack();   // v3.11.0：字体三选（测量容器在 stage 下同链继承）
  }
  bkApplyTxtStyleTo(host);
  /* 段距 / 缩进用动态 style 标签（避免逐段改） */
  let dyn = document.getElementById('bk-dyn-style');
  if (!dyn) { dyn = document.createElement('style'); dyn.id = 'bk-dyn-style'; document.head.appendChild(dyn); }
  dyn.textContent = `
    .bk-p{margin:0 0 ${set.paraSpacing}em${set.indent ? ';text-indent:2em' : ''}}
    .bk-p.bk-h{text-indent:0!important}
  `;
  bkUpdatePageFoot();
}
/* 只排正文容器本身（bkMountChunk/后台测量器对任意流容器复用） */
function bkApplyTxtStyleTo(host) {
  const s = _bk; if (!s || !host) return;
  const set = s.settings;
  host.style.fontSize = set.fontSize + 'px';
  host.style.lineHeight = set.lineHeight;
  host.style.letterSpacing = (set.letterSpacing || 0) + 'px';
  host.style.fontFamily = bkFontStack();   // 离屏测量容器（不在 stage 继承链外也保一致）
  host.style.padding = set.margin + 'px ' + set.margin + 'px ' + (set.margin + 26) + 'px';
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
      if (sc && (x < r.width * 0.32 || x > r.width * 0.68)) {
        /* v3.11.1：落点按行取整——任意像素落点会让屏幕底部露出半截行，
           看起来像「底部多两行、翻页后又消失」 */
        const host = document.getElementById('bk-txt-text');
        const lh = host ? (parseFloat(getComputedStyle(host).lineHeight) || 36) : 36;
        const dir = x > r.width * 0.68 ? 1 : -1;
        const target = sc.scrollTop + dir * sc.clientHeight * 0.85;
        sc.scrollTo({ top: Math.max(0, Math.round(target / lh) * lh), behavior: 'smooth' });
      }
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
        <span class="bk-mb2" onclick="bkBookmarkAdd()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-6-4.5L6 21Z"/></svg>加书签</span>
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
  const ch = bkChapterByChar(s.type === 'txt' ? (s.curChar || (s.fraction || 0) * s.totalChars) : 0);
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
  bkTogglePdfToc(false);   // v3.11.0：两个类型的目录面板都收（旧版只收 TXT，PDF 目录会残留）
}
/* v3.10.0：滑条两种模式统一为字符比例（0~1000），与进度存储口径一致，也不再依赖
   「全局总页数已量完」——大书测量未完成时照样能拖。 */
function bkUpdateMenuSlider() {
  const sl = document.getElementById('bk-menu-slider');
  const s = _bk; if (!sl || !s || s.type !== 'txt') return;
  sl.max = 1000;
  sl.value = Math.round(Math.min(1, Math.max(0, s.fraction || 0)) * 1000);
}
function bkMenuSeek(v) {
  const s = _bk; if (!s || s.type !== 'txt') return;
  bkSeekChar((parseFloat(v) / 1000) * (s.totalChars - 1), true);
}
function bkMenuChapter(dir) {
  const s = _bk; if (!s || s.type !== 'txt' || !s.chapters.length) { showToast('未识别到章节'); return; }
  const charNow = s.settings.mode === 'page' ? (s.curChar || 0) : (s.fraction || 0) * s.totalChars;
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
  bkSeekChar(charStart, true);
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
  bkReencode();
  showToast('编码：' + (s.encoding === 'gbk' ? 'GBK' : (s.encoding === 'utf-8' ? 'UTF-8' : '自动')));
}

/* ---------- 目录面板（v3.11.0：目录 / 书签 双 tab） ---------- */
function bkToggleToc(show, tab) {
  const s = _bk; if (!s || s.type !== 'txt') return;
  let toc = document.getElementById('bk-toc');
  if (!toc) {
    toc = document.createElement('div');
    toc.id = 'bk-toc'; toc.className = 'bk-toc';
    toc.innerHTML = `<div class="bk-toc-tabs">
        <span class="bk-toc-tab" data-t="toc" onclick="bkToggleToc(true,'toc')">目录</span>
        <span class="bk-toc-tab" data-t="bm" onclick="bkToggleToc(true,'bm')">书签</span>
      </div><div class="bk-toc-list" id="bk-toc-list"></div>`;
    const stage = document.getElementById('bk-stage');
    if (stage) stage.appendChild(toc);
    bkGuardOverlay(toc, false);
  }
  if (!show) { toc.classList.remove('bk-show'); return; }
  const curTab = tab || toc.dataset.tab || 'toc';
  toc.dataset.tab = curTab;
  toc.querySelectorAll('.bk-toc-tab').forEach(t => t.classList.toggle('bk-on', t.dataset.t === curTab));
  const list = document.getElementById('bk-toc-list');
  const charNow = s.settings.mode === 'page' ? (s.curChar || 0) : (s.fraction || 0) * s.totalChars;
  if (curTab === 'toc') {
    const n = s.chapters.length;
    list.innerHTML = n
      ? s.chapters.map((c, i) => `<div class="bk-toc-it" onclick="bkTocGo(${i})"><span class="tx">${esc(c.title)}</span></div>`).join('')
      : `<div style="padding:24px 18px;color:var(--hint,#b8b8b8);font-size:12px;line-height:1.9;text-align:center">未识别到章节<br>可加书签标记常读位置</div>`;
    if (n) {
      let cur = 0;
      s.chapters.forEach((c, i) => { if (c.charStart <= charNow) cur = i; });
      const curEl = list.children[cur];
      if (curEl) { curEl.classList.add('bk-cur'); setTimeout(() => curEl.scrollIntoView({ block: 'start' }), 60); }
    }
  } else {
    const bms = s.rec.bookmarks || [];
    list.innerHTML = bms.length
      ? bms.map((b, i) => `<div class="bk-toc-it" onclick="bkBmGo(${i})"><span class="tx">${esc(b.sn || '')}</span><span class="meta">${Math.round(((b.pos || 0) / (s.totalChars || 1)) * 100)}%</span><span class="del" onclick="event.stopPropagation();bkBmDel(${i})">✕</span></div>`).join('')
      : `<div style="padding:24px 18px;color:var(--hint,#b8b8b8);font-size:12px;line-height:1.9;text-align:center">还没有书签<br>阅读菜单里点「加书签」标记当前位置</div>`;
  }
  toc.classList.add('bk-show');
}
function bkTocGo(i) {
  const s = _bk; if (!s || !s.chapters || !s.chapters[i]) return;
  bkJumpChar(s.chapters[i].charStart);
  bkToggleToc(false);
}

/* ---------- 书签（v3.11.0）：挂 rec.bookmarks 随书持久化（与进度/pageCache 同一 IndexedDB 链路）。
   TXT 条目 {pos:字符位, sn:摘要, ts}；PDF 条目 {pos:页码, sn, ts}。按 pos 升序，上限 200 条。 ---------- */
async function bkBookmarkAdd() {
  const s = _bk; if (!s || !s.rec) return;
  let pos, sn;
  if (s.type === 'txt') {
    pos = Math.round(s.settings.mode === 'page' ? (s.curChar || 0) : (s.fraction || 0) * s.totalChars);
    /* 摘要从已挂载段落取（大书 s.text 已释放，不回读整本） */
    const host = document.getElementById('bk-txt-text') || document.getElementById('bk-pageflow');
    let el = null;
    if (host) for (const p of host.children) { if ((p._charStart || 0) <= pos + 2) el = p; else break; }
    sn = el ? (el.textContent || '').trim().slice(0, 30)
            : '位置 ' + Math.round((pos / (s.totalChars || 1)) * 100) + '%';
  } else {
    pos = s.pdfCur || 1;
    sn = '第 ' + pos + ' 页';
  }
  const bms = s.rec.bookmarks = s.rec.bookmarks || [];
  /* 去重：同页/邻近位置（±400 字符）不重复加 */
  if (bms.some(b => s.type === 'txt' ? Math.abs((b.pos || 0) - pos) < 400 : b.pos === pos)) {
    showToast('这个位置已有书签'); return;
  }
  const item = { pos: pos, sn: sn, ts: Date.now() };
  let at = bms.length;
  while (at > 0 && bms[at - 1].pos > item.pos) at--;
  bms.splice(at, 0, item);
  if (bms.length > 200) bms.shift();
  try { await dbPut('books', s.rec); } catch (e) {}
  showToast(s.type === 'pdf' ? '已加书签（第 ' + pos + ' 页）' : '已加书签');
}
async function bkBmSave() {
  const s = _bk; if (!s || !s.rec) return;
  try { await dbPut('books', s.rec); } catch (e) {}
}
function bkBmGo(i) {
  const s = _bk; if (!s || !s.rec || !s.rec.bookmarks || !s.rec.bookmarks[i]) return;
  const b = s.rec.bookmarks[i];
  bkHideMenu(); bkToggleToc(false);
  if (s.type === 'txt') bkSeekChar(b.pos, true);
  else bkPdfGoPage(b.pos);
}
async function bkBmDel(i) {
  const s = _bk; if (!s || !s.rec || !s.rec.bookmarks || !s.rec.bookmarks[i]) return;
  s.rec.bookmarks.splice(i, 1);
  await bkBmSave();
  showToast('已删除书签');
  /* 重画当前列表 */
  if (s.type === 'txt') bkToggleToc(true, 'bm'); else bkTogglePdfToc(true, 'bm');
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
    <div class="bk-sec">字体</div>
    <div class="bk-chips">
      ${[['serif', '默认'], ['kai', '楷体'], ['system', '跟随系统']].map(([k, t]) =>
        `<button class="bk-chip ${(set.fontFamily || 'system') === k ? 'bk-on' : ''}" onclick="bkSetFamily('${k}')">${t}</button>`).join('')}
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
  if (!relayout) return;
  clearTimeout(_bkRelayoutTimer);
  _bkRelayoutTimer = setTimeout(() => { if (_bk === s) bkRelayoutNow(); }, 160);
}
/* 排版参数或视口变化后的重排：翻页模式换块重量（页映射作废重测），滚动模式重建窗口 */
function bkRelayoutNow() {
  const s = _bk; if (!s) return;
  if (s.type === 'txt') {
    if (s.settings.mode === 'page') {
      bkInvalidateMap();                       // 排版参数已变：旧映射全部作废
      s.curChunk = -1;                         // 强制重插当前块
      s._jumpNoAnim = true;
      bkMountChunk(bkChunkOfChar(s.curChar || 0), s.curChar || 0);
      s._jumpNoAnim = false;
      bkStartMapper();
    } else {
      bkBuildScrollReader((s.fraction || 0) * s.totalChars);
    }
  } else if (s.type === 'pdf') {
    bkPdfRelayout();
  }
}
function bkSetProp(k, v) {
  const s = _bk; if (!s) return;
  s.settings[k] = v;
  const lab = document.getElementById('bk-v-' + k);
  if (lab) lab.textContent = v;
  bkPersistApply(true);
}
/* v3.11.0 字体三选：换字体改变文字宽度 → 必须走重排（bkMapKey 已含 fontFamily，整表自动作废） */
function bkSetFamily(f) {
  const s = _bk; if (!s) return;
  if (s.settings.fontFamily === f) return;
  s.settings.fontFamily = f;
  bkPersistApply(true);
  showToast({ serif: '字体：默认（衬线）', kai: '字体：楷体（霞鹜文楷）', system: '字体：跟随系统' }[f] || '字体已切换');
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
  bkReencode();
  bkShowPanel();
}
/* 重编码共用：buffer 被止血释放过就从 blob 重读；重建段落索引并作废全部页映射 */
async function bkReencode() {
  const s = _bk; if (!s || s.type !== 'txt') return;
  await bkEnsureBuffer();
  s.text = decodeBookText(s.buffer, s.encoding);
  bkBuildParas();
  s.buffer = null; s.text = null; s.lines = null;
  bkInvalidateMap();
  s.curChunk = -1; s.curLocal = 0; s.curChar = 0;
  s.fraction = 0;
  bkSaveProgress();
  bkBuildTxtReader();
}

/* ---------- 旋转/窗口变化：保持进度重排 ---------- */
function bkOnResize() {
  const s = _bk; if (!s) return;
  /* 已离开阅读页（上滑回桌面/系统返回后 _bk 与监听都还在）时不要重排：
     隐藏页尺寸为 0，重排会把 fraction 算成 0 并写回，等于抹掉阅读进度（v3.9.4 修）。 */
  const stage = document.getElementById('bk-stage');
  if (!stage || !stage.clientWidth || !stage.clientHeight) return;
  clearTimeout(_bkRelayoutTimer);
  _bkRelayoutTimer = setTimeout(() => { if (_bk === s) bkRelayoutNow(); }, 220);
}
function bkBindResize() {
  window.addEventListener('resize', bkOnResize);
  bkBindStageTap();
}
function bkUnbindResize() {
  window.removeEventListener('resize', bkOnResize);
}

/* =========================================================
   六、PDF 阅读：连续滚动 + 页虚拟化 + 缩放沙盒（v3.10.0 重做，对标 WPS 阅读器）
   - 所有页先铺占位框（先按首页宽高比），滚动到可见区才渲染 canvas（当前页前后各留缓冲），
     离开窗口即销毁 canvas 释放内存；单页真实尺寸回填后自动修正占位高度
   - 缩放语义：settings.scale = 相对「适应宽度」的倍率（0.5~4，1.0 = 适应宽度）
     · 双指捏合：手势期间只做实时 transform（不重排），松手提交倍率并重渲染（等比缩放，
       滚动位原样保留即锚定，见 bkBindPdfPinch 尾注）
     · 菜单「适应宽度」一键回 1.0；界面面板有缩放滑条；桌面 Ctrl+滚轮；中间双击放大/还原
   - 点按分区与 TXT 一致：左/右翻页（滚动定位），中间呼出菜单
   - 目录 = PDF 书签（getOutline，两级展开）；无书签时提示走滑条
   - 夜间模式：反色滤镜只作用于页面画布（.bk-night）
   ========================================================= */
let _bkPinchActive = false;   // 捏合进行中抑制点按/渲染
let _bkPinchEndAt = 0;        // 捏合结束时刻：结束后紧接着的 pointerup 不是点按

async function bkOpenPdf(body) {
  const s = _bk;
  showToast('正在打开 PDF…');
  bkPdfWorkerSrc();                        // defer 加载下 pdfjsLib 可能刚就绪，worker 地址在这里兜底设置
  try {
    s.buffer = await s.rec.blob.arrayBuffer();
    s.pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(s.buffer) }).promise;
    if (_bk !== s) { try { s.pdfDoc.destroy(); } catch (e) {} return; }   // 已被另一次打开接管：别泄漏文档
    s.totalPages = s.pdfDoc.numPages;
    s.pageNum = Math.max(1, Math.min(s.pageNum, s.totalPages));
    s.buffer = null;                       // 文档已持有数据，释放整本 ArrayBuffer
  } catch (e) {
    showToast('PDF 打开失败');
    console.error(e);
    renderBookshelf();
    return;
  }
  if (_bk !== s) return;

  /* 首页尺寸定基准：占位框全按它铺，各页真实尺寸渲染时回填修正 */
  const p1 = await s.pdfDoc.getPage(1);
  if (_bk !== s) return;
  const vp1 = p1.getViewport({ scale: 1 });
  s.baseW = vp1.width; s.baseH = vp1.height;
  s.pdfSizes = new Array(s.totalPages).fill(null);
  s.pdfSizes[0] = { w: vp1.width, h: vp1.height };
  s.pdfSizeVer = 0; s.pdfHeights = null; s.pdfEff = 0;
  s.pdfCur = s.pageNum;
  s.pdfOutline = null;
  s.pdfNight = !!(s.rec.progress && s.rec.progress.night);

  body.innerHTML = `<div class="bk-stage" id="bk-stage">
      <div class="bk-pdf-scroll" id="bk-pdf-scroll"><div class="bk-pdf-flow" id="bk-pdf-flow"></div></div>
      <div class="bk-pagefoot" id="bk-pagefoot"></div>
      ${bkPdfMenuHTML()}
    </div>`;
  const stage = document.getElementById('bk-stage');
  const b = (bkBgList()[s.settings.bg] || bkBgList().paper);
  stage.style.background = b[0];
  stage.style.color = b[1];
  if (s.pdfNight) stage.classList.add('bk-night');

  bkPdfBuildPages();
  bkBindPdfTap();
  bkBindPdfPinch();
  bkBindPdfScroll();
  bkPdfGoPage(s.pageNum, true);
  bkPdfLoadOutline();
}

function bkPdfBuildPages() {
  const s = _bk;
  const flow = document.getElementById('bk-pdf-flow');
  if (!flow) return;
  const frag = document.createDocumentFragment();
  for (let i = 1; i <= s.totalPages; i++) {
    const d = document.createElement('div');
    d.className = 'bk-pdf-page';
    d.dataset.pg = i;
    frag.appendChild(d);
  }
  flow.innerHTML = '';
  flow.appendChild(frag);
  bkPdfApplyScale();
}

/* ---------- 布局：适应宽度基准 × 倍率 ---------- */
function bkPdfFitScale() {
  const s = _bk;
  const sc = document.getElementById('bk-pdf-scroll');
  if (!sc || !s.baseW) return 1;
  return Math.max(0.05, (sc.clientWidth - 24) / s.baseW);   // 左右各留 12px
}
function bkPdfEffScale() {
  const s = _bk;
  return Math.max(0.05, bkPdfFitScale() * (s.settings.scale || 1));
}
/* 各页高表（惰性缓存：倍率或尺寸回填版本号变了才重算） */
function bkPdfHeights() {
  const s = _bk;
  const eff = bkPdfEffScale();
  if (s.pdfHeights && s.pdfEff === eff && s.pdfVer === s.pdfSizeVer) return s.pdfHeights;
  const hs = new Array(s.totalPages + 1).fill(0);
  for (let i = 1; i <= s.totalPages; i++) {
    const sz = s.pdfSizes[i - 1] || { w: s.baseW, h: s.baseH };
    hs[i] = Math.round(sz.h * eff);   // v3.11.1：与 DOM 取整口径一致（页框 height=Math.round），否则大 PDF 累积 ~0.5px/页 漂移
  }
  s.pdfHeights = hs; s.pdfEff = eff; s.pdfVer = s.pdfSizeVer;
  return hs;
}
function bkPdfPageTop(pg) {
  const hs = bkPdfHeights();
  let acc = 12;                            // flow 顶部 padding
  for (let i = 1; i < pg; i++) acc += hs[i] + 10;   // v3.11.1：页间距=下 margin 10px（不再有塌缩误差）
  return acc;
}
function bkPdfPageAt(scrollTop) {
  const s = _bk;
  const sc = document.getElementById('bk-pdf-scroll');
  const hs = bkPdfHeights();
  const probe = scrollTop + (sc ? sc.clientHeight * 0.35 : 0) - 12;
  let acc = 0;
  for (let i = 1; i <= s.totalPages; i++) {
    if (probe < acc + hs[i] + 10) return i;    // v3.11.1：页间距 20→10，与 .bk-pdf-page 新 margin 口径一致
    acc += hs[i] + 10;
  }
  return s.totalPages;
}
/* 把倍率落到 DOM：flow 宽度 + 每页占位尺寸（不动滚动位——等比缩放下滚动位即锚定） */
function bkPdfApplyScale() {
  const s = _bk;
  const sc = document.getElementById('bk-pdf-scroll');
  const flow = document.getElementById('bk-pdf-flow');
  if (!sc || !flow) return;
  const eff = bkPdfEffScale();
  flow.style.width = Math.max(sc.clientWidth - 24, s.baseW * eff) + 'px';
  flow.style.paddingTop = '12px';
  flow.style.paddingBottom = '24px';
  for (const d of flow.children) {
    const pg = +d.dataset.pg;
    const sz = s.pdfSizes[pg - 1] || { w: s.baseW, h: s.baseH };
    d.style.width = Math.round(sz.w * eff) + 'px';
    d.style.height = Math.round(sz.h * eff) + 'px';
  }
}
function bkPdfRelayout(keepPage) {
  const s = _bk; if (!s || s.type !== 'pdf') return;
  const sc = document.getElementById('bk-pdf-scroll');
  const pg = s.pdfCur || 1;
  const flow = document.getElementById('bk-pdf-flow');
  if (flow) flow.style.transform = 'none';
  bkPdfApplyScale();
  if (flow) {
    /* 缩放变了：已渲染页的位图是旧倍率的，作废 done 标记让可见页按新倍率重渲染
       （旧画布先撑着占位框当预览，渲染完无缝替换） */
    for (const d of flow.children) delete d.dataset.done;
  }
  if (keepPage && sc) sc.scrollTop = bkPdfPageTop(pg);
  bkPdfRenderVisible();
  bkUpdatePageFootPdf();
  bkUpdatePdfMenuSlider();
}

/* ---------- 滚动 → 当前页 + 可见区渲染 ---------- */
function bkBindPdfScroll() {
  const sc = document.getElementById('bk-pdf-scroll');
  if (!sc) return;
  let ticking = false;
  sc.onscroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const s = _bk; if (!s || s.type !== 'pdf') return;
      const cur = bkPdfPageAt(sc.scrollTop);
      if (cur !== s.pdfCur) {
        s.pdfCur = cur; s.pageNum = cur;
        bkUpdatePageFootPdf();
        bkUpdatePdfMenuSlider();
        clearTimeout(_bkSaveTimer);
        _bkSaveTimer = setTimeout(bkSaveProgress, 600);
      }
      bkPdfRenderVisible();
    });
  };
}
/* 渲染可见页（cur-1 ~ cur+2），离开窗口的页销毁 canvas。
   捏合手势期间不排渲染（live transform 下的排布不是最终布局，松手统一重渲染） */
function bkPdfRenderVisible() {
  const s = _bk; if (!s || !s.pdfDoc || _bkPinchActive) return;
  const flow = document.getElementById('bk-pdf-flow');
  if (!flow) return;
  const cur = s.pdfCur || 1;
  const want = new Set();
  for (let p = cur - 1; p <= cur + 2; p++) if (p >= 1 && p <= s.totalPages) want.add(p);
  for (const p of want) {
    const d = flow.querySelector('.bk-pdf-page[data-pg="' + p + '"]');
    if (d && !d.dataset.done) bkPdfRenderPage(p, d);
  }
  for (const d of flow.children) {
    if (!want.has(+d.dataset.pg) && d.firstChild) {
      delete d.dataset.done;
      d.innerHTML = '';                    // 释放整页位图
    }
  }
}

/* 渲染排队：每页一个 token 作废过期请求，全局链保证同一时刻只有一个 render 在跑 */
function bkPdfRenderPage(pg, d) {
  const s = _bk; if (!s || s.type !== 'pdf') return;
  const t = (d._renderToken = (d._renderToken || 0) + 1);
  const run = () => (t !== d._renderToken || !d.isConnected) ? Promise.resolve() : bkPdfRenderPageNow(pg, d);
  s.pdfChain = (s.pdfChain || Promise.resolve()).then(run, run);
}

async function bkPdfRenderPageNow(pg, d) {
  const s = _bk;
  if (!s || !s.pdfDoc || s.type !== 'pdf') return;
  try {
    const page = await s.pdfDoc.getPage(pg);
    if (!d.isConnected || !document.getElementById('bk-pdf-flow')) return;
    const eff = bkPdfEffScale();
    const vp = page.getViewport({ scale: eff });
    /* 单页真实尺寸与首页占位不同：回填尺寸表（页高按真实比例修正） */
    const vp1 = page.getViewport({ scale: 1 });
    const sz = s.pdfSizes[pg - 1];
    if (!sz || Math.abs(sz.h - vp1.height) > 0.5 || Math.abs(sz.w - vp1.width) > 0.5) {
      s.pdfSizes[pg - 1] = { w: vp1.width, h: vp1.height };
      s.pdfSizeVer++;
    }
    d.style.width = Math.round(vp.width) + 'px';
    d.style.height = Math.round(vp.height) + 'px';
    const canvas = document.createElement('canvas');
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);   // 3x 屏上限 2.5，控制位图内存
    canvas.width = Math.floor(vp.width * dpr);
    canvas.height = Math.floor(vp.height * dpr);
    canvas.style.width = '100%'; canvas.style.height = '100%';
    d.innerHTML = '';
    d.appendChild(canvas);
    await page.render({
      canvasContext: canvas.getContext('2d'),
      viewport: vp,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null
    }).promise;
    if (d.isConnected) d.dataset.done = '1';
  } catch (e) {
    if (e && e.name === 'RenderingCancelledException') return;
    console.error(e);
  }
}

/* ---------- 页面跳转 / 翻页 ---------- */
function bkPdfGoPage(pg, instant) {
  const s = _bk; if (!s || s.type !== 'pdf') return;
  pg = Math.max(1, Math.min(s.totalPages || 1, pg));
  const sc = document.getElementById('bk-pdf-scroll');
  if (!sc) return;
  s.pdfCur = pg; s.pageNum = pg;
  if (instant) sc.scrollTop = bkPdfPageTop(pg);
  else sc.scrollTo({ top: bkPdfPageTop(pg), behavior: 'smooth' });
  bkUpdatePageFootPdf();
  bkUpdatePdfMenuSlider();
  clearTimeout(_bkSaveTimer);
  _bkSaveTimer = setTimeout(bkSaveProgress, 600);
  bkPdfRenderVisible();
}
function bkPdfGoPageRel(d) {
  const s = _bk; if (!s || s.type !== 'pdf') return;
  bkPdfGoPage((s.pdfCur || 1) + d);
}
function bkPdfSlider(v) {
  bkPdfGoPage(parseInt(v, 10) || 1, true);   // 拖动滑条连续触发，即时跳转比逐帧 smooth 顺
}
function bkUpdatePdfMenuSlider() {
  const sl = document.getElementById('bk-menu-slider');
  const s = _bk; if (!sl || !s || s.type !== 'pdf') return;
  sl.max = s.totalPages || 1;
  sl.value = s.pdfCur || 1;
}

/* ---------- 缩放沙盒：一切缩放只作用于文档流容器 ---------- */
function bkPdfCommitScale(nv) {
  const s = _bk; if (!s || s.type !== 'pdf') return;
  s.settings.scale = Math.max(0.5, Math.min(4, nv));
  bkSaveSettings(s.settings);
  bkPdfRelayout();
  bkUpdatePageFootPdf();
  clearTimeout(_bkSaveTimer);
  _bkSaveTimer = setTimeout(bkSaveProgress, 600);
}
/* 带锚点的提交（按钮/双击/Ctrl 滚轮）：保持锚点屏幕位置下的内容不动 */
function bkPdfSetScale(v, anchorX, anchorY) {
  const s = _bk; if (!s || s.type !== 'pdf') return;
  const sc = document.getElementById('bk-pdf-scroll');
  if (!sc) return;
  const old = s.settings.scale || 1;
  const nw = Math.max(0.5, Math.min(4, v));
  if (Math.abs(nw - old) < 0.001) return;
  if (anchorX != null) {
    const r = nw / old;
    var sx = (sc.scrollLeft + anchorX) * r - anchorX;
    var sy = (sc.scrollTop + anchorY) * r - anchorY;
  }
  bkPdfCommitScale(nw);
  if (anchorX != null) { sc.scrollLeft = sx; sc.scrollTop = sy; }
}
function bkPdfZoom(d) {
  const s = _bk; if (!s || s.type !== 'pdf') return;
  bkPdfSetScale((s.settings.scale || 1) + d);
}

/* 双指捏合：手势期间实时 transform（不重排），松手提交。
   锚定原理：实时 transform 是把已提交布局整体乘 k=nv/s0，期间滚动位已按 k 平移；
   松手后提交新倍率，布局同样变 k 倍 —— 同一内容点自然落在同一屏幕位置，滚动位无需再调。 */
function bkBindPdfPinch() {
  const sc = document.getElementById('bk-pdf-scroll');
  if (!sc) return;
  let pinch = null;
  sc.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      const s = _bk; if (!s || s.type !== 'pdf') return;
      _bkPinchActive = true;
      pinch = {
        d0: Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY) || 1,
        s0: s.settings.scale || 1,
        sl0: sc.scrollLeft, st0: sc.scrollTop,
        cx: (e.touches[0].clientX + e.touches[1].clientX) / 2 - sc.getBoundingClientRect().left,
        cy: (e.touches[0].clientY + e.touches[1].clientY) / 2 - sc.getBoundingClientRect().top,
        live: null
      };
      e.preventDefault();
    }
  }, { passive: false });
  sc.addEventListener('touchmove', e => {
    if (!pinch || e.touches.length < 2) return;
    e.preventDefault();
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY) || 1;
    const nv = Math.max(0.5, Math.min(4, pinch.s0 * d / pinch.d0));
    pinch.live = nv;
    const flow = document.getElementById('bk-pdf-flow');
    if (flow) {
      flow.style.transformOrigin = '0 0';
      flow.style.transform = 'scale(' + (nv / pinch.s0) + ')';
    }
    sc.scrollLeft = (pinch.sl0 + pinch.cx) * (nv / pinch.s0) - pinch.cx;
    sc.scrollTop = (pinch.st0 + pinch.cy) * (nv / pinch.s0) - pinch.cy;
  }, { passive: false });
  const end = () => {
    if (!pinch) return;
    const s = _bk;
    const nv = pinch.live;
    pinch = null;
    _bkPinchActive = false;
    _bkPinchEndAt = Date.now();
    if (s && s.type === 'pdf' && nv != null) bkPdfCommitScale(nv);
  };
  sc.addEventListener('touchend', end);
  sc.addEventListener('touchcancel', end);
  /* 桌面：Ctrl+滚轮缩放（锚定光标位置） */
  sc.addEventListener('wheel', e => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const s = _bk; if (!s || s.type === 'pdf') return;
    const r = sc.getBoundingClientRect();
    bkPdfSetScale((s.settings.scale || 1) * (e.deltaY < 0 ? 1.1 : 0.9), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
}

/* ---------- 点按分区（与 TXT 一致：左/右翻页，中间呼出菜单，双击缩放） ---------- */
function bkBindPdfTap() {
  const stage = document.getElementById('bk-stage');
  if (!stage) return;
  let downX = 0, downY = 0, lastCenterTap = 0, tapTimer = null;
  stage.addEventListener('pointerdown', e => { downX = e.clientX; downY = e.clientY; });
  stage.addEventListener('pointerup', e => {
    const s = _bk; if (!s || s.type !== 'pdf' || _bkPinchActive) return;
    if (Date.now() - _bkPinchEndAt < 350) return;            // 捏合松手余波，不是点按
    if (Math.abs(e.clientX - downX) > 10 || Math.abs(e.clientY - downY) > 10) return;   // 拖动/捏合不算点按
    const panel = document.getElementById('bk-panel');
    const toc = document.getElementById('bk-toc');
    if (panel && panel.classList.contains('bk-show')) { bkHidePanel(); return; }
    if (toc && toc.classList.contains('bk-show')) { bkTogglePdfToc(false); return; }
    const sc = document.getElementById('bk-pdf-scroll');
    if (!sc) return;
    const r = sc.getBoundingClientRect();
    if (e.clientY < r.top || e.clientY > r.bottom) return;    // 页脚/菜单区不算
    const x = e.clientX - r.left;
    if (x < r.width * 0.32) bkPdfGoPage((s.pdfCur || 1) - 1);
    else if (x > r.width * 0.68) bkPdfGoPage((s.pdfCur || 1) + 1);
    else {
      /* 中间：单击呼出菜单（延时让位给双击缩放） */
      const now = Date.now();
      if (now - lastCenterTap < 300) {
        clearTimeout(tapTimer); lastCenterTap = 0;
        const nv = (s.settings.scale || 1) > 1.5 ? 1 : 2.2;
        bkPdfSetScale(nv, x, e.clientY - r.top);
      } else {
        lastCenterTap = now;
        clearTimeout(tapTimer);
        tapTimer = setTimeout(() => { if (_bk && _bk.type === 'pdf') bkShowPdfMenu(); }, 290);
      }
    }
  });
}

/* ---------- 菜单 / 面板 / 目录（样式与 TXT 阅读统一） ---------- */
function bkPdfMenuHTML() {
  return `
  <div class="bk-menu bk-hide" id="bk-menu">
    <div class="bk-menu-top">
      <span class="bk-mb" onclick="closeReader()">←</span>
      <span class="bk-mt">${esc(_bk.rec.name)}</span>
      <span class="bk-mc" id="bk-menu-ch"></span>
    </div>
    <div class="bk-menu-bot">
      <div class="bk-menu-row">
        <span class="bk-mb2" onclick="bkPdfGoPageRel(-1)">上一页</span>
        <input type="range" id="bk-menu-slider" min="1" max="${_bk.totalPages || 1}" value="${_bk.pdfCur || 1}" oninput="bkPdfSlider(this.value)">
        <span class="bk-mb2" onclick="bkPdfGoPageRel(1)">下一页</span>
      </div>
      <div class="bk-menu-tabs">
        <span class="bk-mb2" onclick="bkTogglePdfToc(true)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>目录</span>
        <span class="bk-mb2" onclick="bkBookmarkAdd()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-6-4.5L6 21Z"/></svg>加书签</span>
        <span class="bk-mb2" onclick="bkPdfSetScale(1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>适应宽度</span>
        <span class="bk-mb2" onclick="bkShowPdfPanel()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h9"/><circle cx="18.5" cy="17" r="1.6"/></svg>界面</span>
      </div>
    </div>
  </div>`;
}
function bkShowPdfMenu() {
  const m = document.getElementById('bk-menu');
  const s = _bk; if (!m || !s || s.type !== 'pdf') return;
  bkGuardOverlay(m, true);
  m.classList.remove('bk-hide');
  bkUpdatePdfMenuSlider();
  const el = document.getElementById('bk-menu-ch');
  if (el) el.textContent = (s.pdfCur || 1) + '/' + s.totalPages + ' 页';
}
function bkUpdatePageFootPdf() {
  const s = _bk;
  const foot = document.getElementById('bk-pagefoot');
  if (!foot || !s || s.type !== 'pdf' || !s.totalPages) return;
  const pct = s.totalPages > 1 ? ((s.pdfCur - 1) / (s.totalPages - 1) * 100) : 100;
  const pctStr = (pct >= 99.95 ? 100 : pct).toFixed(1);
  foot.innerHTML = `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:52%">缩放 ${Math.round((s.settings.scale || 1) * 100)}%</span>
    <span>${s.pdfCur}/${s.totalPages} · ${pctStr}%</span>`;
  foot.style.color = (bkBgList()[s.settings.bg] || bkBgList().paper)[2];
}
function bkShowPdfPanel() {
  const s = _bk; if (!s || s.type !== 'pdf') return;
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
    `<div class="bk-sw ${set.bg === k ? 'bk-on' : ''}" style="background:${v[0]}" title="${k}" onclick="bkPdfSetBg('${k}')"></div>`).join('');
  panel.innerHTML = `
    <div class="bk-panel-h"><span class="t">阅读设置</span><span class="x" onclick="bkHidePanel()">✕</span></div>
    <div class="bk-slider-row"><span class="lb">缩放</span>
      <button class="pm" onclick="bkPdfZoom(-0.1)">−</button>
      <input type="range" min="0.5" max="4" step="0.1" value="${set.scale || 1}" oninput="bkPdfScaleInput(this.value)">
      <button class="pm" onclick="bkPdfZoom(0.1)">＋</button>
      <span class="val" id="bk-v-scale">${Math.round((set.scale || 1) * 100)}%</span></div>
    <div class="bk-chips">
      <button class="bk-chip ${Math.abs((set.scale || 1) - 1) < 0.01 ? 'bk-on' : ''}" onclick="bkPdfSetScale(1);bkShowPdfPanel()">适应宽度</button>
      <button class="bk-chip ${s.pdfNight ? 'bk-on' : ''}" onclick="bkPdfToggleNight()">夜间模式${s.pdfNight ? '：开' : '：关'}</button>
    </div>
    <div class="bk-sec">背景（页面周围）</div>
    <div class="bk-swatches">${swatches}</div>`;
  panel.classList.add('bk-show');
}
/* 缩放滑条连续拖动：只更新数字，松手（change）才重排 */
function bkPdfScaleInput(v) {
  const s = _bk; if (!s || s.type !== 'pdf') return;
  const nv = Math.max(0.5, Math.min(4, parseFloat(v) || 1));
  s.settings.scale = nv;
  const lab = document.getElementById('bk-v-scale');
  if (lab) lab.textContent = Math.round(nv * 100) + '%';
}
function bkPdfToggleNight() {
  const s = _bk; if (!s || s.type !== 'pdf') return;
  s.pdfNight = !s.pdfNight;
  const stage = document.getElementById('bk-stage');
  if (stage) stage.classList.toggle('bk-night', s.pdfNight);
  bkShowPdfPanel();
  clearTimeout(_bkSaveTimer);
  _bkSaveTimer = setTimeout(bkSaveProgress, 400);
}
function bkPdfSetBg(k) {
  const s = _bk; if (!s || s.type !== 'pdf') return;
  s.settings.bg = k;
  bkSaveSettings(s.settings);
  const stage = document.getElementById('bk-stage');
  const b = (bkBgList()[k] || bkBgList().paper);
  if (stage) { stage.style.background = b[0]; stage.style.color = b[1]; }
  bkUpdatePageFootPdf();
  bkShowPdfPanel();
}

/* ---------- 目录 = PDF 书签（getOutline，两级展开；页码异步解析） ---------- */
async function bkPdfLoadOutline() {
  const s = _bk; if (!s || !s.pdfDoc) return;
  try {
    const o = await s.pdfDoc.getOutline();
    if (_bk !== s) return;
    if (!o || !o.length) { s.pdfOutline = null; return; }
    const flat = [];
    const walk = (arr, depth) => {
      for (const it of arr) {
        flat.push({ title: it.title, dest: it.dest, depth: depth });
        if (it.items && it.items.length && depth < 2) walk(it.items, depth + 1);
      }
    };
    walk(o, 0);
    for (const it of flat) {
      try {
        let d = it.dest;
        if (typeof d === 'string') d = await s.pdfDoc.getDestination(d);
        if (Array.isArray(d) && d[0]) it.page = (await s.pdfDoc.getPageIndex(d[0])) + 1;
      } catch (e) {}
      if (_bk !== s) return;
    }
    s.pdfOutline = flat.filter(it => it.page);
  } catch (e) { s.pdfOutline = null; }
}
/* v3.11.0：目录（outline，无则页码列表）/ 书签 双 tab。无 outline 不再是死胡同——
   "页"就是 PDF 的天然章节。 */
function bkTogglePdfToc(show, tab) {
  const s = _bk; if (!s || s.type !== 'pdf') return;
  let toc = document.getElementById('bk-toc');
  if (!toc) {
    toc = document.createElement('div');
    toc.id = 'bk-toc'; toc.className = 'bk-toc';
    toc.innerHTML = `<div class="bk-toc-tabs">
        <span class="bk-toc-tab" data-t="toc" onclick="bkTogglePdfToc(true,'toc')">目录</span>
        <span class="bk-toc-tab" data-t="bm" onclick="bkTogglePdfToc(true,'bm')">书签</span>
      </div><div class="bk-toc-list" id="bk-toc-list"></div>`;
    const stage = document.getElementById('bk-stage');
    if (stage) stage.appendChild(toc);
    bkGuardOverlay(toc, false);
  }
  if (!show) { toc.classList.remove('bk-show'); return; }
  const curTab = tab || toc.dataset.tab || 'toc';
  toc.dataset.tab = curTab;
  toc.querySelectorAll('.bk-toc-tab').forEach(t => t.classList.toggle('bk-on', t.dataset.t === curTab));
  const list = document.getElementById('bk-toc-list');
  if (curTab === 'toc') {
    const items = s.pdfOutline;
    if (items && items.length) {
      list.innerHTML = items.map((it, i) =>
        `<div class="bk-toc-it" onclick="bkPdfTocGo(${i})"><span class="tx" style="${it.depth ? 'padding-left:' + (it.depth * 16) + 'px;font-size:13px;' : ''}">${esc(it.title || ('第 ' + it.page + ' 页'))}</span><span class="meta">${it.page}</span></div>`).join('');
    } else {
      const total = s.totalPages || 0;
      const cur = s.pdfCur || 1;
      list.innerHTML = total
        ? Array.from({ length: total }, (_, k) => k + 1).map(p =>
            `<div class="bk-toc-it ${p === cur ? 'bk-cur' : ''}" onclick="bkPdfTocGo(-1,${p})"><span class="tx">第 ${p} 页</span></div>`).join('')
        : `<div style="padding:24px 18px;color:var(--hint,#b8b8b8);font-size:12px;text-align:center">页数解析中…</div>`;
      const curEl = list.querySelector('.bk-cur');
      if (curEl) setTimeout(() => curEl.scrollIntoView({ block: 'center' }), 60);
    }
  } else {
    const bms = s.rec.bookmarks || [];
    list.innerHTML = bms.length
      ? bms.map((b, i) => `<div class="bk-toc-it" onclick="bkBmGo(${i})"><span class="tx">${esc(b.sn || ('第 ' + b.pos + ' 页'))}</span><span class="del" onclick="event.stopPropagation();bkBmDel(${i})">✕</span></div>`).join('')
      : `<div style="padding:24px 18px;color:var(--hint,#b8b8b8);font-size:12px;line-height:1.9;text-align:center">还没有书签<br>阅读菜单里点「加书签」收藏当前页</div>`;
  }
  toc.classList.add('bk-show');
}
function bkPdfTocGo(i, page) {
  const s = _bk; if (!s || s.type !== 'pdf') return;
  let pg = page;
  if (!pg && i >= 0 && s.pdfOutline && s.pdfOutline[i]) pg = s.pdfOutline[i].page;
  if (!pg) return;
  bkHideMenu();
  bkPdfGoPage(pg);
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
    p.page = s.pdfCur || s.pageNum;
    p.totalPages = s.pdfDoc ? s.pdfDoc.numPages : (s.totalPages || p.totalPages || 0);
    p.scale = s.settings.scale || 1;      // v3.10.0：相对适应宽度的倍率，随书记忆
    p.night = s.pdfNight ? 1 : 0;
  }
  s.rec.progress = p;
  try { await dbPut('books', s.rec); } catch (e) {}   // rec 已带 id → 更新同一条
}

/* 返回书架（标题栏返回键在阅读期被切到这里） */
async function closeReader() {
  await bkSaveProgress();
  bkTeardownSession();
  bkSetBack(false);
  bkUnbindResize();
  renderBookshelf();
}
