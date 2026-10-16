/* =========================================================
   星迹 · APP 内更新检测（仅 Capacitor 安卓壳内生效，网页端静默跳过）
   - 更新服务器 = 本仓库 GitHub Pages：version.json 的 apk 段 {version,code,url,sizeMB,notes}
   - 本地版本：构建时写入 www/app-version.json（{version,code}）
   - 下载：跳系统浏览器打开 APK 链接（Chrome 自动开始下载），下载完点通知安装
   ========================================================= */
const XJ_SITE = 'https://ww73qaq.github.io/xingji/';
function inApp() {
  return !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());
}
async function appLocalVersion() {
  try {
    const r = await fetch('app-version.json?t=' + Date.now(), { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
}
/* manual=true 时给出结果反馈；启动自动检查完全静默 */
/* P1-6(v3.27.6)：语义版本比较 + versionCode 双端 parseInt。
   原逻辑只判「字符串相等」和 code < local，code 为字符串时 "3910"<"399" 误判为最新。 */
function _verToInt(v){const m=String(v||'').match(/(\d+)\.(\d+)\.(\d+)/);return m?(+m[1])*1000000+(+m[2])*1000+(+m[3]):0;}
async function appUpdateCheck(manual) {
  if (!inApp()) { if (manual) showToast('仅 APP 内可用（网页版刷新即更新）'); return; }
  try {
    const loc = await appLocalVersion();
    const rem = await fetch(XJ_SITE + 'version.json?t=' + Date.now(), { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null).catch(() => null);
    const apk = rem && rem.apk;
    if (!apk || !apk.version || !apk.url) { if (manual) showToast('暂未获取到更新信息'); return; }
    if (!loc || (!loc.version && loc.code == null)) {
      /* P1-6：本地版本读取失败 → 降级为仅提示，不再每次都弹「发现新版本」 */
      if (manual) showToast('远端最新版 ' + apk.version + '（本地版本读取失败）');
      return;
    }
    const rv = _verToInt(apk.version), lv = _verToInt(loc.version);
    const rc = parseInt(apk.code, 10), lc = parseInt(loc.code, 10);
    const codeOk = Number.isFinite(rc) && Number.isFinite(lc) && rc > 0 && lc > 0;
    const latest = apk.version === loc.version ||
      (codeOk ? rc <= lc : (rv > 0 && lv > 0 && rv <= lv));
    if (latest) { if (manual) showToast('已是最新版本 ' + (loc.version || apk.version)); return; }
    showAppUpdateModal(apk, loc);
  } catch (e) { if (manual) showToast('检查失败，请稍后再试'); }
}
function showAppUpdateModal(apk, loc) {
  const size = apk.sizeMB ? (' · 约 ' + apk.sizeMB + 'MB') : '';
  showModal('发现新版本',
    '<div style="font-size:13px;line-height:1.9;color:var(--sub);text-align:left">' +
    (loc ? ('当前 ' + esc(loc.version || '') + ' → ') : '') +
    '<b style="color:var(--text)">' + esc(apk.version) + '</b>' + size +
    (apk.notes ? ('<div style="margin-top:6px;white-space:pre-wrap;color:var(--text)">' + esc(apk.notes) + '</div>') : '') +
    '<div style="font-size:11px;color:var(--hint);margin-top:8px">点「去下载」会打开浏览器并自动开始下载，完成后点通知安装；若提示未知来源，允许一次即可。数据在 APP 内不受影响。</div></div>',
    '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">以后再说</button>' +
    '<button class="modal-btn primary" onclick="appUpdateGo()">去下载</button></div>');
  window.__apkUrl = apk.url;
}
function appUpdateGo() {
  try {
    closeModal();
    const url = XJ_SITE + (window.__apkUrl || 'apk/xingji-latest.apk').replace(/^\//, '');
    if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Browser) {
      Capacitor.Plugins.Browser.open({ url: url });       // 官方 Browser 插件 → Chrome 自定义标签
    } else {
      window.open(url, '_system');                        // 兜底：系统浏览器
    }
  } catch (e) { showToast('打开浏览器失败，请手动访问仓库下载'); }
}
