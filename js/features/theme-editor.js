/* =========================================================
   星迹 · 全局主题变量与外观设置
   保留 state.skin 持久化结构，新增 amethyst，不触碰业务数据。
   ========================================================= */
const SKIN_TOKENS={
  ink:{
    '--bg':'#f7f6f3','--card':'#ffffff','--input':'#ecebe7',
    '--text':'#1a1a1a','--sub':'#73706b','--hint':'#aaa59d',
    '--primary':'#1a1a1a','--c-ink':'#c0392b',
    '--ov-bar':'#2b2b2b','--ov-fg':'#ffffff','--ov-sep':'rgba(255,255,255,.18)',
    '--ov-hover':'rgba(255,255,255,.10)','--ov-press':'rgba(255,255,255,.20)',
    '--ov-scrim':'rgba(26,22,20,.36)','--ov-shadow':'rgba(0,0,0,.20)','--ov-danger':'#c96b64',
    '--inv-bg':'#1a1a1a','--inv-fg':'#f5f5f5',
    '--c-pink':'#1a1a1a','--c-blue':'#3f3f3f','--c-green':'#575757','--c-warm':'#767676',
    '--c-purple':'#262626','--c-gold':'#8c8c8c','--c-gray':'#6b6b6b','--c-rose':'#121212'
  },
  amethyst:{
    '--bg':'#f8f5ff','--card':'#fffdfd','--input':'#eee6f5',
    '--text':'#2a2133','--sub':'#7f708c','--hint':'#ab9bb8',
    '--primary':'#6b587b','--c-ink':'#b65c70',
    '--ov-bar':'#5d496d','--ov-fg':'#fffaff','--ov-sep':'rgba(107,88,123,.16)',
    '--ov-hover':'rgba(200,168,224,.16)','--ov-press':'rgba(200,168,224,.28)',
    '--ov-scrim':'rgba(42,29,55,.30)','--ov-shadow':'rgba(76,50,102,.20)','--ov-danger':'#b85c73',
    '--inv-bg':'#b99bd4','--inv-fg':'#291d35',
    '--c-pink':'#8b6ba3','--c-blue':'#7ca8b5','--c-green':'#73a293','--c-warm':'#b08e9f',
    '--c-purple':'#6b587b','--c-gold':'#a08ca9','--c-gray':'#8d7d98','--c-rose':'#a66c89'
  }
};
const SKIN_META={
  ink:{name:'墨白',desc:'暖纸、墨色与克制留白',primary:'#1a1a1a',light:'#3f3f3f',bg:'#f7f6f3'},
  amethyst:{name:'紫晶',desc:'奶白、浅紫与柔光水晶',primary:'#6b587b',light:'#a88bd8',bg:'#f8f5ff'}
};
function currentSkinId(){return state&&state.skin&&SKIN_TOKENS[state.skin.themeId]?state.skin.themeId:'ink';}
function applySkinVars(){
  const root=document.documentElement;
  if(!root)return;
  const id=currentSkinId(),skin=state.skin||{};
  const base=SKIN_TOKENS.ink;
  const t=Object.assign({},base,SKIN_TOKENS[id]||{},skin.overrides||{});
  Object.keys(t).forEach(k=>{if(t[k]!==undefined)root.style.setProperty(k,t[k]);});
  /* 旧版自定义字段仅用于墨白兼容；紫晶必须完整覆盖，避免半紫半灰。 */
  if(id==='ink'){
    if(skin.primary)root.style.setProperty('--primary',skin.primary);
    if(skin.light)root.style.setProperty('--c-blue',skin.light);
    if(skin.bg)root.style.setProperty('--bg',skin.bg);
  }
  root.dataset.theme=id;
  root.style.colorScheme='light';
  const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=t['--bg'];
}
function setGlobalTheme(id){
  if(!SKIN_TOKENS[id])return;
  state.skin=state.skin||{};
  state.skin.themeId=id;
  const meta=SKIN_META[id];
  state.skin.primary=meta.primary;state.skin.light=meta.light;state.skin.bg=meta.bg;
  saveKey('skin');applySkinVars();
  if(typeof renderProfile==='function'&&document.getElementById('app-profile'))renderProfile();
  openThemeSettings();
  showToast('已切换为「'+meta.name+'」主题');
}
function openThemeSettings(){
  const id=currentSkinId();
  const options=Object.keys(SKIN_META).map(k=>{
    const m=SKIN_META[k];
    return '<div class="xj-theme-option'+(id===k?' on':'')+'" role="button" tabindex="0" aria-label="切换到'+m.name+'" onclick="setGlobalTheme(\''+k+'\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();setGlobalTheme(\''+k+'\')}">'
      +'<div class="xj-theme-preview '+k+'"><i></i><i></i><i></i></div>'
      +'<span class="xj-theme-name">'+m.name+'</span><span class="xj-theme-check"></span></div>';
  }).join('');
  showModal('外观主题','<div style="text-align:center;color:var(--sub);font-size:12px;line-height:1.7;margin:-4px 0 14px">'+esc(SKIN_META[id].desc)+'<br>全站页面、弹窗与聊天样式会同步切换</div><div class="xj-theme-options">'+options+'</div><div style="font-size:11px;color:var(--hint);line-height:1.8;text-align:center">主题选择会保存在本机，刷新后仍然有效。</div>');
}
