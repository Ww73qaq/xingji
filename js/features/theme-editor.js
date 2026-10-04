/* =========================================================
   星迹 · 主题变量（theme-editor.js）
   - v3.4.1：把「浮层 / 反色」这类硬编码颜色抽成 CSS 变量，由 state.skin 统一驱动。
   - CSS 的 :root 提供默认值（JS 未跑时也不会破图）；applySkinVars() 再按 skin 覆盖。
   - 将来要做深色皮肤：往 SKIN_TOKENS 里加一套 night 取值 + 在「我的」里给 themeId 一个切换项即可，
     不需要再改任何组件 CSS。
   ========================================================= */

/* 浮层（长按动作条 / 拍一拍提示 / 弹层遮罩）与「反色块」（我方气泡、选中态） */
const SKIN_TOKENS={
  ink:{
    '--ov-bar':'#2b2b2b',        /* 浮层条底 */
    '--ov-fg':'#ffffff',        /* 浮层条文字 */
    '--ov-sep':'rgba(255,255,255,.18)',
    '--ov-hover':'rgba(255,255,255,.10)',
    '--ov-press':'rgba(255,255,255,.20)',
    '--ov-scrim':'rgba(0,0,0,.40)',   /* 弹层遮罩 */
    '--ov-shadow':'rgba(0,0,0,.26)',
    '--ov-danger':'#ff8080',
    '--inv-bg':'#1a1a1a',       /* 反色块底（我方气泡 / 选中项） */
    '--inv-fg':'#f5f5f5'        /* 反色块文字 */
  }
};

function applySkinVars(){
  const root=document.documentElement;
  if(!root)return;
  const skin=state.skin||{};
  const base=SKIN_TOKENS.ink;
  // 优先级：内置主题 < state.skin.overrides（用户/未来主题写入的覆盖值）
  const t=Object.assign({},base,SKIN_TOKENS[skin.themeId]||{},skin.overrides||{});
  Object.keys(base).forEach(k=>{if(t[k]!==undefined)root.style.setProperty(k,t[k]);});
  // 主题色板（--c-*）与背景同样跟随 skin，保留旧字段的兼容性
  if(skin.primary)root.style.setProperty('--primary',skin.primary);
  if(skin.light)root.style.setProperty('--c-blue',skin.light);
  if(skin.bg)root.style.setProperty('--bg',skin.bg);
}