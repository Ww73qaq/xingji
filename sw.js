/* 星迹 · Service Worker（v3.9.5：新增离线缓存）
   ================================================================
   一、通知链路（原有职责，勿删）
   Android Edge / Chrome 规定：站点必须注册 Service Worker 才能显示 Web 通知。
   通知统一通过 reg.showNotification() 发送——通知由浏览器原生调度，
   即使页面切到后台 / JS 被冻结，已提交的通知仍能弹出。（借鉴 mochi 站的 PWA 通知方案）

   二、离线缓存（v3.9.5 新增）
   此前 sw.js 只有 install/activate/notificationclick，没有 fetch 监听、没有任何 caches.*，
   而 manifest 是可安装的 PWA、书架页还写着「离线也能接着读」——断网后连页面本身都打不开，
   书架里的 Blob 虽然还在 IndexedDB，却没有任何入口能渲染它。现在补上应用外壳预缓存：
     - install：抓 index.html 并**按它自身的 src/href 推导**要缓存的资源清单
       （不维护硬编码清单，以后加脚本、换 CDN 都不用改这里），写入 SHELL 缓存；
     - 导航请求：网络优先（发版后立刻拿到新 HTML），失败退回缓存 → 断网也能打开；
     - version.json：完全走网络（更新提示必须实时，绝不缓存）；
     - 其余同源静态资源：缓存优先 + 后台静默更新（stale-while-revalidate），
       所以即使某次发版忘了改 ?v=，用户最多多一次加载就会自愈；
     - 跨域请求（如 PDF.js 的 CDN）一律不拦截，交给浏览器。

   ⚠️ 发版纪律：SW_VERSION 必须与 version.json / js/config.js 的 APP_VERSION 一起改，
      否则 SHELL 缓存名不变、预缓存不会重建。
   ================================================================
   本网站为个人字卡传讯作品，专属于「我」（本站主人）本人。
   ================================================================ */
const SW_VERSION = '3.9.5';
const SHELL_CACHE = 'xingji-shell-' + SW_VERSION;     // 预缓存外壳：随发版整体换新
const RUNTIME_CACHE = 'xingji-runtime-' + SW_VERSION; // 运行期同源资源：带条数上限
const RUNTIME_MAX = 40;
const SCOPE_PATH = new URL('./', self.location).pathname;

/* 用 index.html 自身推导预缓存清单（正则取 src/href，SW 里没有 DOMParser） */
async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  const res = await fetch('./index.html', { cache: 'reload' });
  if (!res || !res.ok) return;
  const html = await res.text();
  const headers = { 'Content-Type': 'text/html; charset=utf-8' };
  await cache.put('./index.html', new Response(html, { headers }));
  await cache.put('./', new Response(html, { headers }));   // 便于离线直接打开站点根路径
  const urls = new Set();
  const re = /(?:src|href)="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const u = m[1];
    if (!u || /^(?:data:|https?:|\/\/|#|mailto:)/.test(u)) continue;   // 内联/跨域交给网络
    urls.add(u.split('#')[0]);
  }
  /* PDF.js 的 worker 不在 index.html 里（由 pdf.js 运行时按 workerSrc 拉起），
     显式补进来，否则断网时「离线也能接着读」对 PDF 不成立。 */
  urls.add('js/vendor/pdf.worker.min.js');
  await Promise.all(Array.from(urls).map(async u => {
    try {
      const r = await fetch(u, { cache: 'reload' });
      if (r && r.ok && r.type === 'basic') await cache.put(u, r);
    } catch (e) {}
  }));
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    try { await precacheShell(); } catch (err) {}
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
});

/* 运行期缓存瘦身：只裁剪 RUNTIME，绝不动 SHELL 预缓存 */
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
  if (url.origin !== self.location.origin) return;                       // 跨域（PDF.js CDN 等）不拦截
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
