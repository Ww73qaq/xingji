/* =========================================================
   星迹 · APP 原生能力桥（v3.18.3，仅 Capacitor 壳内生效）
   ① Notification 构造器垫片：window.Notification 变为「调原生通知」的函数
      （旧版是普通对象，网页代码 new Notification() 直接 TypeError 被吞）
   ② 发送重载：sendWebNotify/fallbackNotify → LocalNotifications 原生通知
      ⚠️ 安装时机：立即 + DOMContentLoaded 各装一次——profile.js 的函数声明
      在解析时会覆盖先加载的垫片（v3.18.0~3.18.2 通知失效的根因），必须晚于它再挂
   ③ 电池优化白名单：appBatteryGuide()（自写原生 BatteryWhitelistPlugin）
   网页端：inApp()=false，本文件全部逻辑跳过，行为与旧版完全一致
   ========================================================= */
(function () {
  if (!window.inApp || !inApp()) return;
  if (!window.Capacitor || !Capacitor.Plugins || !Capacitor.Plugins.LocalNotifications) return;
  var LN = Capacitor.Plugins.LocalNotifications;
  var BW = Capacitor.Plugins.BatteryWhitelist || null;

  /* ---- 高优先级渠道：横幅 + 锁屏可见（默认渠道重要性不足会静默进抽屉） ---- */
  var XJ_CHANNEL = 'xingji-msg';
  function ensureChannel() {
    try {
      LN.createChannel({
        id: XJ_CHANNEL,
        name: '星迹消息',
        description: 'TA 的消息、动态与提醒',
        importance: 'HIGH',
        visibility: 'PUBLIC'
      }).catch(function () {});
    } catch (e) {}
  }

  /* ---- 权限状态缓存 ---- */
  window.__xjNPerm = 'default';
  LN.checkPermissions().then(function (r) { window.__xjNPerm = r.display === 'granted' ? 'granted' : (r.display === 'denied' ? 'denied' : 'default'); }).catch(function () {});

  /* ---- 原生发送（结果可见，不再静默吞错） ---- */
  var _clicks = {};
  var _nextId = 1;
  try {
    LN.addListener('localNotificationActionPerformed', function (ev) {
      try {
        var id = ev && ev.notification && ev.notification.id;
        var cb = _clicks[id];
        delete _clicks[id];
        if (typeof cb === 'function') cb();
      } catch (e) {}
    });
  } catch (e) {}

  function appNotifySend(title, body, onClick) {
    var id = (_nextId++) * 7919 + (Date.now() % 100000);
    if (typeof onClick === 'function') _clicks[id] = onClick;
    LN.schedule({
      notifications: [{
        id: id,
        title: title || '星迹',
        body: (body || '').slice(0, 150),
        channelId: XJ_CHANNEL
      }]
    }).then(function () {
      try { if (typeof showToast === 'function') showToast('原生通知已提交系统'); } catch (e) {}
    }).catch(function (err) {
      try { if (typeof showToast === 'function') showToast('通知发送失败：' + ((err && (err.message || err.details)) || JSON.stringify(err) || '未知')); } catch (e) {}
      console.error('[xingji] LocalNotifications.schedule 失败', err);
    });
  }
  window.appNotifySend = appNotifySend;   // 诊断/调试入口

  /* ---- Notification 构造器垫片：new Notification(title,{body}) → 原生通知 ---- */
  function XJNotification(title, opts) {
    try { appNotifySend(title, opts && opts.body); } catch (e) {}
    this.close = function () {};
  }
  XJNotification.requestPermission = function () {
    return LN.requestPermissions().then(function (r) {
      window.__xjNPerm = r.display === 'granted' ? 'granted' : (r.display === 'denied' ? 'denied' : 'default');
      return window.__xjNPerm;
    });
  };
  try {
    /* P1-7(v3.27.6)：permission 改为「读取即回查系统真实状态」（异步回填缓存）——
       原先 __xjNPerm 只在启动/请求权限时更新，用户在系统设置里改授权后
       缓存仍是旧值 → notifySystem 永久静默、通知链断裂。 */
    Object.defineProperty(XJNotification, 'permission', { get: function () {
      try {
        LN.checkPermissions().then(function (r) {
          window.__xjNPerm = r.display === 'granted' ? 'granted' : (r.display === 'denied' ? 'denied' : 'default');
        }).catch(function () {});
      } catch (e) {}
      return window.__xjNPerm;
    } });
  } catch (e) { XJNotification.permission = 'default'; }
  window.Notification = XJNotification;

  /* ---- 发送层重载（关键：晚于 profile.js 的函数声明再挂一次） ---- */
  function installShim() {
    window.sendWebNotify = function (title, body, tag, onClick) { appNotifySend(title, body, onClick); };
    window.fallbackNotify = function (title, body, onClick) { appNotifySend(title, body, onClick); };
  }
  installShim();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installShim);
    window.addEventListener('load', installShim);
  }

  /* ---- 电池优化白名单 ---- */
  window.appBatteryIsIgnoring = function () {
    if (!BW) return Promise.resolve(true);
    return BW.isIgnoring().then(function (r) { return !!r.value; }).catch(function () { return true; });
  };
  window.appBatteryGuide = function () {
    if (!BW) return;
    BW.request().then(function () {
      setTimeout(function () {
        appBatteryIsIgnoring().then(function (ok) {
          showToast(ok ? '保活已开启，通知在锁屏后也能送达' : '还没有允许，可稍后从「消息通知」里再进来开');
          try { localStorage.setItem('xj-battery-asked', '1'); } catch (e) {}
        });
      }, 1200);
    }).catch(function () { showToast('打开系统设置失败，请手动到 设置→电池 里关闭本应用的优化'); });
  };
  /* 首次启动一次性引导 */
  setTimeout(function () {
    try {
      var n = (typeof state !== 'undefined' && state.notify) || {};
      if (n.enabled === false) return;
      if (localStorage.getItem('xj-battery-asked')) return;
      appBatteryIsIgnoring().then(function (ok) {
        if (ok) return;
        localStorage.setItem('xj-battery-asked', '1');
        showModal('开启通知保活',
          '<div style="font-size:13px;line-height:1.9;color:var(--sub);text-align:left">锁屏后安卓会休眠应用导致通知停摆。<b style="color:var(--text)">把星迹加入电池优化白名单</b>后，' + esc((typeof state !== 'undefined' && state.other && state.other.name) || 'TA') + ' 的消息在锁屏时也能送达。<br><span style="font-size:11px;color:var(--hint)">部分国产系统还需在系统设置里允许「后台弹出界面 / 自启动」。</span></div>',
          '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">暂不</button><button class="modal-btn primary" onclick="closeModal();appBatteryGuide()">去开启</button></div>');
      });
    } catch (e) {}
  }, 6000);

  ensureChannel();
})();
