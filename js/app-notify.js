/* =========================================================
   星迹 · APP 原生能力桥（v3.18.0，仅 Capacitor 壳内生效）
   ① Notification API 垫片：让 profile.js 现有权限检查/开关 UI 原样工作
   ② 发送重载：sendWebNotify/fallbackNotify → LocalNotifications 原生通知
   ③ 电池优化白名单：appBatteryGuide()（自写原生 BatteryWhitelistPlugin）
   网页端：inApp()=false，本文件全部逻辑跳过，行为与旧版完全一致
   ========================================================= */
(function () {
  if (!window.inApp || !inApp()) return;
  if (!window.Capacitor || !Capacitor.Plugins || !Capacitor.Plugins.LocalNotifications) return;
  var LN = Capacitor.Plugins.LocalNotifications;
  var BW = Capacitor.Plugins.BatteryWhitelist || null;

  /* v3.18.1：高优先级渠道——横幅弹出 + 锁屏可见（默认渠道重要性不足会静默进抽屉） */
  var XJ_CHANNEL = 'xingji-msg';
  try {
    LN.createChannel({
      id: XJ_CHANNEL,
      name: '星迹消息',
      description: 'TA 的消息、动态与提醒',
      importance: 'HIGH',          // 4：横幅 + 声音 + 锁屏
      visibility: 'PUBLIC'         // 锁屏上显示内容
    }).catch(function () {});
  } catch (e) {}

  /* ---- 权限状态缓存 + Notification 垫片 ---- */
  window.__xjNPerm = 'default';
  LN.checkPermissions().then(function (r) { window.__xjNPerm = r.display === 'granted' ? 'granted' : (r.display === 'denied' ? 'denied' : 'default'); }).catch(function () {});
  window.Notification = {
    get permission() { return window.__xjNPerm; },
    requestPermission: function () {
      return LN.requestPermissions().then(function (r) {
        window.__xjNPerm = r.display === 'granted' ? 'granted' : (r.display === 'denied' ? 'denied' : 'default');
        return window.__xjNPerm;
      });
    }
  };

  /* ---- 点击回调表：通知 id → onClick ---- */
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
    var id = (_nextId++) * 7919 + (Date.now() % 100000);   // 32bit 内稳定唯一
    if (typeof onClick === 'function') _clicks[id] = onClick;
    LN.schedule({
      notifications: [{
        id: id,
        title: title || '星迹',
        body: (body || '').slice(0, 150),
        channelId: XJ_CHANNEL
      }]
    }).catch(function () {});
  }

  /* 重载发送层（notifySystem 内部调 sendWebNotify；SW 不可达时走 fallbackNotify） */
  window.sendWebNotify = function (title, body, tag, onClick) { appNotifySend(title, body, onClick); };
  window.fallbackNotify = function (title, body, onClick) { appNotifySend(title, body, onClick); };

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
          if (typeof saveKey === 'function') { try { localStorage.setItem('xj-battery-asked', '1'); } catch (e) {} }
        });
      }, 1200);
    }).catch(function () { showToast('打开系统设置失败，请手动到 设置→电池 里关闭本应用的优化'); });
  };
  /* 首次启动一次性引导：仅在已开总开关且未豁免且没问过时弹 */
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
})();
