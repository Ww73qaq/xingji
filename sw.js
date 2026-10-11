/* 星迹 · Service Worker（v3.9.5：新增离线缓存）
   ================================================================
   一、通知链路（原有职责，勿删）
   Android Edge / Chrome 规定：站点必须注册 Service Worker 才能显示 Web 通知。
   通知统一通过 reg.showNotification() 发送——通知由浏览器原生调度，
   即使页面切到后台 / JS 被冻结，已提交的通知仍能弹出。（借鉴 mochi 站的 PWA 通知方案）

   二、离线缓存（v3.9.5 新增）
   此前 sw.js 只有 install/activate/notificationclick，没有 fetch 监听、没有任何 caches.*，
   而 manifest 是可安装的 PWA、书架页还写着「离线也能接着读」——断网后连页面本身都打不开，
   书架里的 Blob 虽然还在 IndexedDB，却没有任何入口能渲染它。现在补上应用外壳缓存：
     - install：**只缓存 index.html 与站点根路径**，随即 skipWaiting → 激活；
     - activate：清旧版本缓存 + clients.claim，之后再做一次"尽力而为"的预热；
     - fetch：导航请求网络优先、失败退缓存（离线可打开）；version.json 完全不缓存；
       其余同源静态资源缓存优先 + 后台静默更新（stale-while-revalidate）；
       跨域请求（如外链）一律不拦截。
     - 预热（warmShell）：按 index.html 自身的 src/href 推导清单，限量并发 + 单请求超时 +
       整体超时，且**不放进 waitUntil**——失败或被杀都不影响激活；没预热到的资源，
       由 fetch 处理器在用户下次在线访问时按需缓存（每次在线打开都会补齐，故第二次访问起离线即完整）。

   ⚠️ 实测教训（v3.9.5 期间踩到）：最初把「38 个资源的预缓存」整个放进 install 的 waitUntil，
      线上（GitHub Pages）实测安装会在只缓存 5~23 个时**中断且三个 worker 槽位全空**——
      即"激活"被"所有资源都下完"绑死，用户既等不到激活也没有任何报错。
      所以：**install 必须只做极少、必定成功的工作；批量预热一律后置且可丢**。

   ⚠️ 发版纪律：SW_VERSION 必须与 version.json / js/config.js 的 APP_VERSION 一起改，
      否则 SHELL 缓存名不变、旧缓存不会换新。
   ================================================================
   本网站为个人字卡传讯作品，专属于「我」（本站主人）本人。
   ================================================================ */
const SW_VERSION = '3.9.5';
const SHELL_CACHE = 'xingji-shell-' + SW_VERSION;     // 外壳缓存：随发版整体换新
const RUNTIME_CACHE = 'xingji-runtime-' + SW_VERSION; // 运行期同源资源：带条数上限
const RUNTIME_MAX = 40;
const SCOPE_PATH = new URL('./', self.location).pathname;
const FETCH_TIMEOUT = 6000;      // 单请求上限
const WARM_DEADLINE = 15000;     // 预热整体上限（超时即放弃，不影响任何已成立的状态）
const WARM_CONCURRENCY = 6;

/* 带超时的取数：一个卡住的资源不允许拖死调用方 */
function fetchBounded(url) {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => { try { ac.abort(); } catch (e) {} }, FETCH_TIMEOUT);
    return fetch(url, { cache: 'reload', signal: ac.signal }).then(
      r => { clearTimeout(timer); return r; },
      e => { clearTimeout(timer); throw e; }
    );
  } catch (e) { return Promise.reject(e); }
}

/* install 只做最小且必定成功的事：缓存 index.html 本身，然后立刻激活 */
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    try {
      const cache = await caches.open(SHELL_CACHE);
      const res = await fetchBounded('./index.html');
      if (res && res.ok) {
        const html = await res.text();
        const headers = { 'Content-Type': 'text/html; charset=utf-8' };
        await cache.put('./index.html', new Response(html, { headers }));
        await cache.put('./', new Response(html, { headers }));
      }
    } catch (err) {}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    try {
      const keep = [SHELL_CACHE, RUNTIME_CACHE];
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => /^xingji-(?:shell|runtime)-/.test(k) && keep.indexOf(k) < 0).map(k => caches.delete(k)));
    } catch (err) {}
    await self.clients.claim();
  })());
  /* 预热刻意不放进 waitUntil：它是"尽力而为"，跑不完或被杀都不影响已经成立的激活状态 */
  try { warmShell(); } catch (err) {}
});

/* 预热：从已缓存的 index.html 推导资源清单，限量并发 + 整体限时，全部吞错 */
async function warmShell() {
  const started = Date.now();
  try {
    const shell = await caches.open(SHELL_CACHE);
    const page = await shell.match('./index.html');
    if (!page) return;
    const html = await page.text();
    const urls = new Set();
    const re = /(?:src|href)="([^"]+)"/g;
    let m;
    while ((m = re.exec(html))) {
      const u = m[1];
      if (!u || /^(?:data:|https?:|\/\/|#|mailto:)/.test(u)) continue;   // 内联/跨域交给网络
      urls.add(u.split('#')[0]);
    }
    /* PDF.js 的 worker 不在 index.html 里（由 pdf.js 运行时按 workerSrc 拉起），显式补进来 */
    urls.add('js/vendor/pdf.worker.min.js');
    const list = Array.from(urls);
    let i = 0;
    const worker = async () => {
      while (i < list.length) {
        if (Date.now() - started > WARM_DEADLINE) return;
        const u = list[i++];
        try {
          const already = await shell.match(u);
          if (already) continue;
          const r = await fetchBounded(u);
          if (r && r.ok && r.type === 'basic') await shell.put(u, r);
        } catch (err) {}
      }
    };
    await Promise.all(Array.from({ length: Math.min(WARM_CONCURRENCY, list.length) }, worker));
  } catch (err) {}
}

/* 运行期缓存瘦身：只裁剪 RUNTIME，绝不动 SHELL */
async function trimRuntime() {
  try {
    const cache = await caches.open(RUNTIME_CACHE);
    const keys = await cache.keys();
    if (keys.length <= RUNTIME_MAX) return;
    for (let i = 0; i < keys.length - RUNTIME_MAX; i++) await cache.delete(keys[i]);
  } catch (e) {}
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;                       // 跨域不拦截
  if (url.pathname.indexOf(SCOPE_PATH) !== 0) return;                    // 只管本站目录

  /* 1) 导航请求：网络优先 → 失败退回缓存（离线仍可打开应用） */
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r && r.ok) {
          const c = await caches.open(SHELL_CACHE);
          c.put('./index.html', r.clone()).catch(() => {});
          c.put(req, r.clone()).catch(() => {});
        }
        return r;
      } catch (err) {
        const c = await caches.open(SHELL_CACHE);
        return (await c.match(req)) || (await c.match('./index.html')) || (await c.match('./')) || Response.error();
      }
    })());
    return;
  }

  /* 2) version.json 必须实时：直接走网络，不进缓存 */
  if (/\/version\.json$/.test(url.pathname)) return;

  /* 3) 其余同源静态资源：缓存优先 + 后台更新 */
  e.respondWith((async () => {
    const shell = await caches.open(SHELL_CACHE);
    const hit = (await shell.match(req)) || (await (await caches.open(RUNTIME_CACHE)).match(req));
    const net = fetch(req).then(r => {
      if (r && r.ok && r.type === 'basic') {
        caches.open(RUNTIME_CACHE)
          .then(c => c.put(req, r.clone()))
          .then(trimRuntime)
          .catch(() => {});
      }
      return r;
    }).catch(() => null);
    if (hit) return hit;
    return (await net) || Response.error();
  })());
});

/* 通知点击：回到/打开星迹页面（原有职责，勿删） */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return clients.openWindow('./index.html');
  }));
});
