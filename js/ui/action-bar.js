/* =========================================================
   星迹 · 通用「锚定动作条」（action-bar.js）
   - 在锚点（元素或坐标）上方/下方弹出一条小横条，点空白处关闭
   - 聊天长按消息菜单、桌面便签菜单共用同一套定位与关闭逻辑
   - 颜色全部走 CSS 变量（--ov-*），由 state.skin 驱动，便于将来做深色皮肤
   ========================================================= */
let _abItems=[];
let _abCleanup=null;
let _abOpen=false;

/* items: [{label, fn, danger:true, sepBefore:true}] */
function showActionBar(items,opt){
  const menu=document.getElementById('ctx-menu');
  if(!menu||!items||!items.length)return;
  _abClearListeners();
  _abItems=items;
  menu.innerHTML='';
  const bar=document.createElement('div');
  bar.className='ctx-bar'+(items.length>5?' wrap':'');
  items.forEach((it,i)=>{
    if(it.sepBefore&&i>0){const sep=document.createElement('span');sep.className='ctx-sep';bar.appendChild(sep);}
    const el=document.createElement('div');
    el.className='ctx-item'+(it.danger?' danger':'');
    el.textContent=it.label;
    el.onclick=e=>{e.stopPropagation();actionBarDo(i);};
    bar.appendChild(el);
  });
  menu.appendChild(bar);
  menu.classList.add('show');
  _abOpen=true;
  menu.onclick=e=>{if(e.target===menu)closeActionBar();};
  positionActionBar(bar,opt&&opt.anchor?opt.anchor:null,opt&&opt.point?opt.point:null);
  // 滚动 / 缩放自动关闭，避免悬浮错位
  const scroller=(opt&&opt.scroller)||null;
  const onScroll=()=>closeActionBar();
  if(scroller)scroller.addEventListener('scroll',onScroll,{passive:true});
  window.addEventListener('resize',closeActionBar);
  _abCleanup=()=>{if(scroller)scroller.removeEventListener('scroll',onScroll);window.removeEventListener('resize',closeActionBar);};
}
/* 定位：优先用锚点元素矩形，其次用坐标；上方空间不足自动改放下方 */
function positionActionBar(bar,anchorEl,point,opt){
  const phone=document.getElementById('phone');
  if(!phone)return;
  const pr=phone.getBoundingClientRect();
  bar.style.visibility='hidden';bar.style.left='0px';bar.style.top='0px';
  const barW=bar.offsetWidth||120,barH=bar.offsetHeight||36;
  bar.style.visibility='';
  let ax,at,ab;
  if(point&&point.x){
    ax=point.x-pr.left;at=point.y-pr.top;ab=at;
  }else if(anchorEl){
    const r=anchorEl.getBoundingClientRect();
    ax=r.left-pr.left+r.width/2;at=r.top-pr.top;ab=r.bottom-pr.top;
  }else{
    ax=pr.width/2;at=pr.height/2;ab=at;
  }
  const gap=12;
  let left=_clamp(ax-barW/2,8,Math.max(8,pr.width-barW-8));
  let top,dir;
  // v3.7：聊天长按菜单默认放消息条下方（prefer:'below'），下方放不下才移上方
  const preferBelow=opt&&opt.prefer==='below';
  if(preferBelow){
    if(ab+barH+gap<=pr.height-8){top=ab+gap;dir='below';}
    else if(at-barH-gap>=8){top=at-barH-gap;dir='above';}
    else{top=Math.max(8,pr.height-barH-8);dir='below';}
  }else{
    if(at-barH-gap>=8){top=at-barH-gap;dir='above';}
    else{top=ab+gap;dir='below';}
  }
  top=_clamp(top,8,Math.max(8,pr.height-barH-8));
  bar.classList.remove('above','below');
  bar.classList.add(dir);
  bar.style.left=left+'px';
  bar.style.top=top+'px';
  bar.style.setProperty('--ctx-tri-left',_clamp(ax-left,14,Math.max(14,barW-14))+'px');
}
function actionBarDo(i){
  const it=_abItems[i];
  closeActionBar();
  if(it&&it.fn)setTimeout(()=>{try{it.fn();}catch(e){console.warn(e);}},40);
}
function closeActionBar(){
  _abClearListeners();
  const menu=document.getElementById('ctx-menu');
  if(!menu)return;
  menu.classList.remove('show');
  menu.innerHTML='';
  menu.onclick=null;
  _abItems=[];
  _abOpen=false;
}
function _abClearListeners(){
  if(_abCleanup){const f=_abCleanup;_abCleanup=null;try{f();}catch(e){}}
}
function actionBarOpen(){return _abOpen;}