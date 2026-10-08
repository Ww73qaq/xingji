/* 星迹 · Service Worker
   Android Edge / Chrome 规定：站点必须注册 Service Worker 才能显示 Web 通知。
   通知统一通过 reg.showNotification() 发送——通知由浏览器原生调度，
   即使页面切到后台 / JS 被冻结，已提交的通知仍能弹出。
   （借鉴 mochi 站的 PWA 通知方案）
   ================================================================
   本网站为个人字卡传讯作品，专属于「我」（本站主人）本人。
   ================================================================ */
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });

/* 通知点击：回到/打开星迹页面 */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return clients.openWindow('./index.html');
  }));
});
