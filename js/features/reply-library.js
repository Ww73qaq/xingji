/* =========================================================
   星迹 · 字卡库：分组 / 增删改查 / 批量 / 导入导出 / 拍一拍
   ========================================================= */

/* ===== CARDS（字卡：分组 / 增删改查 / 批量导入 / 自动查重） ===== */
/* 列表排序规则（v3.5.0，取代原来的「最新添加 / 最常使用 / 最近使用 / 从未使用」四个按钮）：
   1) 有使用次数的字卡，整段排在没有使用次数的前面；
   2) 同为「用过」的，使用次数多的在前；
   3) 其余一律按 26 个字母排序（中文走拼音：Intl.Collator zh-Hans-CN）。
   即：默认是字母序，「使用次数」这一维度优先于字母序。 */
let cardGroupFilter='全部',selectedCardIds=new Set();
const _cardCollator=(typeof Intl!=='undefined'&&Intl.Collator)?new Intl.Collator('zh-Hans-CN',{numeric:true,sensitivity:'base'}):null;
/* 4.0：内置字卡导入后「全部」里有一万八千条，纯字母序会把颜文字（ASCII）全挤到最前面，
   第一屏全是 :-D / :( 这种东西。改为先按分组排，组内再按字母。
   自定义分组（不在下表的）排最前——用户自己写的永远是第一优先。 */
const CARD_GROUP_ORDER=['默认','日常','日常关心','聊天杂谈','疑问互动','动作','情绪安抚','夸夸',
  '承诺真心','表达爱意','甜言爱语','调情亲密','撒娇黏人','生气斗嘴','亲昵小动作','心情意象',
  '时间数字','称呼','提醒','留白','拍一拍','颜文字'];
function _cardGroupRank(g){
  const i=CARD_GROUP_ORDER.indexOf((g||'默认'));
  return i<0?-1:i;
}
function cardCompare(a,b){
  const ua=Number(a.useCount)||0,ub=Number(b.useCount)||0;
  const uaUsed=ua>0,ubUsed=ub>0;
  if(uaUsed!==ubUsed)return uaUsed?-1:1;      // 用过的整段排在前面
  if(uaUsed&&ub!==ua)return ub-ua;            // 段内按使用次数降序
  const ra=_cardGroupRank(a.group),rb=_cardGroupRank(b.group);
  if(ra!==rb)return ra-rb;                    // 再按分组
  const at=a.text||'',bt=b.text||'';          // 组内按字母序（中文按拼音）
  return _cardCollator?_cardCollator.compare(at,bt):(at<bt?-1:at>bt?1:0);
}
async function ensureDefaultCardGroups(){
  const groups=await dbGetAll('cardGroups');
  const names=new Set(groups.map(g=>g.name));
  for(const n of DEFAULT_CARD_GROUPS){
    if(!names.has(n)){await dbPut('cardGroups',{name:n,enabled:1});names.add(n);}
  }
  // v3.5.1：只留 4 个内置分组——删除旧内置分组（回应/情绪/提问/安慰/主动）中没有任何字卡的空分组
  // （组内已有字卡的保留，用户数据优先，不误删）
  const OLD_BUILTIN_EXTRA=['回应','情绪','提问','安慰','主动'];
  const cards=await dbGetAll('cards');
  const usedGroups=new Set(cards.map(c=>c.group));
  const keepNames=new Set(DEFAULT_CARD_GROUPS);
  for(const g of groups){
    if(OLD_BUILTIN_EXTRA.includes(g.name)&&!usedGroups.has(g.name)&&!keepNames.has(g.name)){
      await dbDelete('cardGroups',g.id);
    }
  }
}
/* =========================================================
   4.0 · 导入字卡包（本地文件）
   —— 不再随应用内置别人的字卡包：内容留在你自己手里，仓库里只有代码。
   —— 支持三种格式：
       ① 星迹字卡包 {version, groups:{组名:[句子,...]}}
       ② mochi 字卡库导出 {text:[[组名,[句子...]],...], kaomoji, poke}
       ③ 纯分组数组 [[组名,[句子...]],...]
   —— 导入即本地字卡：可改可删，重复句自动跳过。
   ========================================================= */
const CARD_PACK_DROP_GROUPS = {'拼句词根':1,'次元设定':1,'吵':1};   /* 不是完整句 / 世界观会串味 */

function _packPush(out, group, text){
  const g = String(group||'默认').trim() || '默认';
  if(CARD_PACK_DROP_GROUPS[g]) return;
  let t = String(text==null?'':text).replace(/\s+/g,' ').trim();
  if(!t || t.length < 2 || t.length > 60) return;
  if(/[<>]/.test(t)) return;
  (out[g] || (out[g]=[])).push(t);
}
function normalizeCardPack(obj){
  if(!obj || typeof obj!=='object') return null;
  const out = {};
  const pairs = list=>{
    if(!Array.isArray(list))return;
    list.forEach(item=>{
      if(Array.isArray(item) && item.length>=2 && Array.isArray(item[1])){
        item[1].forEach(t=>_packPush(out, item[0], t));
      }
    });
  };
  if(obj.groups && typeof obj.groups==='object' && !Array.isArray(obj.groups)){
    Object.keys(obj.groups).forEach(g=>{
      const arr = obj.groups[g];
      if(Array.isArray(arr)) arr.forEach(t=>_packPush(out, g, t));
    });
  }else if(obj.text || obj.kaomoji || obj.poke){
    pairs(obj.text);
    pairs(obj.kaomoji);
    pairs(obj.poke);
  }else if(Array.isArray(obj)){
    pairs(obj);
  }
  const names = Object.keys(out).filter(g=>(out[g]||[]).length);
  if(!names.length) return null;
  const groups = {};
  names.forEach(g=>{
    /* 组内去重，保留首次出现的顺序 */
    const seen = new Set();
    groups[g] = out[g].filter(t=>{const k=t.replace(/\s+/g,'');if(seen.has(k))return false;seen.add(k);return true;});
  });
  return {groups};
}
function importCardPack(){
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,.js,application/json,text/javascript,text/plain';
  input.onchange = e=>{
    const f = e.target.files && e.target.files[0];
    if(f) doImportCardPack(f);
  };
  input.click();
}
async function doImportCardPack(file){
  showToast('正在读取 '+(file.name||'文件')+'…');
  let text = '';
  try{ text = await file.text(); }catch(e){ showToast('这个文件读不出来'); return; }
  let pack = null;
  try{ pack = normalizeCardPack(JSON.parse(text)); }catch(e){
    /* .js 形式的包：截取第一个 { 到最后一个 } 再解析 */
    const a = text.indexOf('{'), b = text.lastIndexOf('}');
    if(a >= 0 && b > a){
      try{ pack = normalizeCardPack(JSON.parse(text.slice(a, b+1))); }catch(_){}
    }
  }
  if(!pack){ showToast('没认出这个文件里的字卡（支持 .json / .js 字卡包）'); return; }

  const groupNames = Object.keys(pack.groups);
  const total = groupNames.reduce((n,g)=>n+pack.groups[g].length,0);
  appConfirm('导入字卡包',
    `《${esc(file.name||'字卡包')}》<br>共 ${total} 条，分 ${groupNames.length} 组。<br>已存在的同句会自动跳过。`,
    async ()=>{
      const existing = new Set();
      try{ (await dbGetAll('cards')).forEach(c=>existing.add(String(c.text||'').trim())); }catch(e){}
      const rows = [];
      for(const g of groupNames){
        for(const t of pack.groups[g]){
          if(existing.has(t)) continue;
          existing.add(t);
          rows.push({text:t, group:g, direction:'ta', imported:1, enabled:1, time:Date.now()});
        }
      }
      if(!rows.length){ showToast('这些字卡已经都在了，不用再导'); return; }
      showToast('正在导入，请不要退出…');
      let ok = 0;
      try{
        ok = await dbBulkPut('cards', rows, (d,n)=>{ if(d % 4000 === 0 && d < n) showToast('正在导入 '+d+'/'+n); });
      }catch(e){ showToast('导入中断，已写入的部分会保留'); }
      try{
        const gs = await dbGetAll('cardGroups');
        const have = new Set(gs.map(x=>x.name));
        const add = groupNames.filter(g=>!have.has(g)).map(g=>({name:g, enabled:1}));
        if(add.length) await dbBulkPut('cardGroups', add);
      }catch(e){}
      state.lastCardPack = {name:String(file.name||''), count:ok, time:Date.now()};
      try{ saveKey('lastCardPack'); }catch(e){}
      renderCards();
      showToast('已导入 '+ok+' 条字卡');
    });
}

async function renderCards(){
  const body=document.getElementById('cards-body');
  await ensureDefaultCardGroups();
  const groups=await dbGetAll('cardGroups');
  const all=await dbGetAll('cards');
  const names=['全部',...groups.map(g=>g.name)];
  cardGroupNames=names;
  const enabledCount=all.filter(c=>c.enabled!==false).length;
  const totalUse=all.reduce((s,c)=>s+(c.useCount||0),0);
  body.innerHTML=`
    <div class="card-stats">
      <span>全部 <b>${all.length}</b></span><span>可用 <b>${enabledCount}</b></span><span>停用 <b>${all.length-enabledCount}</b></span><span>累计使用 <b>${totalUse}</b></span>
    </div>
    <div class="card-actions" style="display:flex;gap:8px;padding:2px 0 8px">
      <button class="btn-pill" style="flex:1" onclick="addCard()">＋ 字卡</button>
      <button class="btn-pill ghost" style="flex:1" onclick="manageCardGroups()">分组管理</button>
      <button class="btn-pill ghost" style="flex:1" onclick="importCardPack()">导入字卡包</button>
    </div>
    <div class="card-import-hint">
      还没有字卡？点「导入字卡包」选一个 <b>.json / .js</b> 文件（星迹字卡包、mochi 字卡库导出都认）。<br>
      导入的字卡存在本机，可以随时改、删、停用。
      ${state.lastCardPack&&state.lastCardPack.count?`<div class="card-import-last">上次导入：${esc(state.lastCardPack.name||'字卡包')} · ${state.lastCardPack.count} 条</div>`:''}
    </div>
    <div class="tabs" style="overflow-x:auto;flex-wrap:nowrap">${names.map((n,i)=>{const cnt=n==='全部'?all.length:all.filter(c=>(c.group||'默认')===n).length;return `<button class="tab${cardGroupFilter===n?' active':''}" style="flex:0 0 auto;padding:6px 14px;min-width:60px" onclick="pickCardGroup(${i})"><span style="display:block;font-size:13px;line-height:1.35">${esc(n)}</span><span style="display:block;font-size:10px;opacity:.62;line-height:1.3">${cnt} 条</span></button>`;}).join('')}</div>
    <div class="card-toolbar" style="color:var(--hint);font-size:11px">用过的排在前面 · 再按分组 · 组内按字母</div>
    <div class="search-bar"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg><input type="text" id="card-search" placeholder="搜索字卡" oninput="filterCards(this.value)"></div>
    <div id="card-list"></div>`;
  bindCardScroll();
  renderCardList();
  filterCards('');
}
let cardGroupNames=[];
function pickCardGroup(i){cardGroupFilter=cardGroupNames[i]||'全部';renderCards();}
/* v3.6.14 字卡性能：分批渲染（每批 60 条），滚动到底部再追加，避免字卡上千时一次性渲染卡顿 */
let _cardList=[],_cardHits=[],_cardRenderN=60,_cardSearchQ='';   // v3.9.5：_cardHits 单独存搜索命中，_cardList 始终保留全量（分组过滤后）
function cardHtml(c){
  const n=Number(c.useCount)||0;
  const meta=n?(' · '+n+' 次使用'+(c.lastUsedAt?(' · 最近 '+fmtChatDate(c.lastUsedAt)):'')):'';
  return `<div class="list-card" style="display:flex;align-items:center;gap:10px" data-t="${esc(c.text||'')}"><input class="card-select" type="checkbox" ${selectedCardIds.has(c.id)?'checked':''} onchange="toggleCardSelect(${c.id},this.checked)"><div style="flex:1;min-width:0;cursor:pointer" onclick="sendCardPoke('${esc(c.text)}')"><div class="list-card-title">${esc(c.text)}</div><div class="list-card-sub">${esc(c.group||'默认')}${meta}</div></div><button class="btn-pill ghost" style="padding:6px 10px" onclick="editCard(${c.id})">改</button><button class="btn-pill ghost" style="padding:6px 10px;color:${c.enabled===false?'#c0392b':'var(--sub)'}" onclick="toggleCardEnabled(${c.id})">${c.enabled===false?'启用':'停用'}</button><button class="btn-pill ghost" style="padding:6px 10px" onclick="delCard(${c.id})">删</button></div>`;
}
function renderCardList(reset){
  dbGetAll('cards').then(all=>{
    let list=all.filter(c=>cardGroupFilter==='全部'||(c.group||'默认')===cardGroupFilter);
    list.sort(cardCompare);
    _cardList=list;   // v3.9.5：全量（分组过滤后）始终留在 _cardList，搜索命中另存 _cardHits（否则后续搜索只在上一次命中的子集里找）
    if(_cardSearchQ)list=list.filter(c=>(c.text||'').toLowerCase().includes(_cardSearchQ));
    _cardHits=_cardSearchQ?list:[];
    if(reset)_cardRenderN=60;
    const box=document.getElementById('card-list');
    if(!list.length){box.innerHTML='<div class="empty">这个分组还没有字卡<br>点击上方 ＋ 字卡 添加</div>';return;}
    _cardRenderN=Math.min(list.length,_cardRenderN);
    box.innerHTML=list.slice(0,_cardRenderN).map(cardHtml).join('');
    maybeCardLoadMore();
  });
}
function maybeCardLoadMore(){
  const src=_cardSearchQ?_cardHits:_cardList;   // v3.9.5：搜索态从命中集追加，非搜索态用全量
  if(!src.length||_cardRenderN>=src.length)return;
  const box=document.getElementById('card-list');
  if(!box)return;
  const r=box.getBoundingClientRect();
  if(r.bottom<innerHeight+160){
    _cardRenderN=Math.min(src.length,_cardRenderN+60);
    box.innerHTML=src.slice(0,_cardRenderN).map(cardHtml).join('');
  }
}
window.addEventListener('scroll',()=>{if(document.getElementById('app-cards')&&document.getElementById('app-cards').classList.contains('on'))maybeCardLoadMore();},{passive:true});
/* v3.6.14：字卡页滚动容器是 .app-body（#cards-body 自己），监听其滚动触发追加 */
function bindCardScroll(){
  const c=document.getElementById('cards-body')||document.getElementById('app-cards');
  if(c&&!c.dataset.bs){c.dataset.bs=1;c.addEventListener('scroll',()=>maybeCardLoadMore(),{passive:true});}
}
function toggleCardSelect(id,on){if(on)selectedCardIds.add(id);else selectedCardIds.delete(id);}
async function toggleCardEnabled(id){
  const all=await dbGetAll('cards');const c=all.find(x=>x.id===id);if(!c)return;
  c.enabled=c.enabled===false?1:false;await dbPut('cards',c);
  renderCardList();showToast(c.enabled===false?'已停用，不再参与回复':'已启用，可参与回复');
}
async function toggleGroupReply(){
  const groups=await dbGetAll('cardGroups');
  showModal('分组参与回复',groups.map(g=>`<div class="modal-item" onclick="toggleGroupEnabled('${esc(g.name)}')">${esc(g.name)}：${g.enabled===false?'<span style="color:#c0392b">已停用</span>':'参与回复'}</div>`).join('')+'<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button></div>');
}
async function toggleGroupEnabled(name){
  const gs=await dbGetAll('cardGroups');const g=gs.find(x=>x.name===name);if(!g)return;
  g.enabled=g.enabled===false?1:false;await dbPut('cardGroups',g);
  showToast(`「${name}」${g.enabled===false?'已停用，该组字卡不再参与回复':'已启用'}`);
  toggleGroupReply();
}
async function toggleSelectAllCards(){const all=await dbGetAll('cards');const list=all.filter(c=>cardGroupFilter==='全部'||(c.group||'默认')===cardGroupFilter);const allSelected=list.length&&list.every(c=>selectedCardIds.has(c.id));list.forEach(c=>allSelected?selectedCardIds.delete(c.id):selectedCardIds.add(c.id));renderCardList();}
async function deleteSelectedCards(){const ids=[...selectedCardIds];if(!ids.length){showToast('请先选择字卡');return;}appConfirm('删除选中字卡',`确定删除已选择的 ${ids.length} 张字卡吗？此操作不可恢复。`,async()=>{for(const id of ids)await dbDelete('cards',id);selectedCardIds.clear();renderCards();showToast('已删除选中字卡');});}
async function optimizeCards(){const all=await dbGetAll('cards');const seen=new Set(),dupIds=[],changes=[];for(const c of all){const t=(c.text||'').replace(/\s+/g,' ').trim();if(!t){dupIds.push(c.id);continue;}if(seen.has(t)){dupIds.push(c.id);continue;}seen.add(t);if(c.text!==t)changes.push([c,t]);}const apply=async()=>{for(const id of dupIds)await dbDelete('cards',id);for(const [c,t] of changes){c.text=t;await dbPut('cards',c);}selectedCardIds.clear();renderCards();showToast(`清理重复完成${dupIds.length?'，删除重复/空卡 '+dupIds.length+' 张':''}`);};if(dupIds.length){appConfirm('检测到重复字卡',`发现 ${dupIds.length} 张重复或空白字卡。是否自动删除？`,apply);}else{await apply();}}
function filterCards(q){
  q=(q||'').trim().toLowerCase();
  _cardSearchQ=q;
  // v3.6.14：搜索时重建已渲染批次（不一次性渲染全部）
  const box=document.getElementById('card-list');
  if(!box)return;
  if(!q){_cardHits=[];renderCardList(false);return;}
  // v3.9.5：命中项存 _cardHits，不再覆盖 _cardList（否则下一次搜索只在上一次命中的子集里找，会漏卡）
  const hit=_cardList.filter(c=>(c.text||'').toLowerCase().includes(q));
  _cardHits=hit;
  _cardRenderN=Math.min(hit.length,60);
  box.innerHTML=hit.slice(0,_cardRenderN).map(cardHtml).join('');
  if(hit.length>_cardRenderN){
    setTimeout(maybeCardLoadMore,80);
  }
}
async function addCard(){
  showModal('添加字卡','',
    '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button><button class="modal-btn primary" onclick="closeModal();addSingleCard()">单条添加</button><button class="modal-btn primary" onclick="closeModal();bulkAddCards()">批量导入</button></div>');
}
async function addSingleCard(){
  const groups=await dbGetAll('cardGroups');
  const opts=groups.map(g=>`<option value="${esc(g.name)}">${esc(g.name)}</option>`).join('');
  showModal('添加字卡',`<div style="font-size:12px;color:var(--sub);margin-bottom:6px">选择分组</div>
    <select class="app-input" id="card-new-group" style="width:100%;padding:9px 12px;background:var(--input);border:none;border-radius:10px">${opts}</select>
    <div style="font-size:12px;color:var(--sub);margin:10px 0 6px">内容</div>
    <textarea class="app-input auto-grow" id="card-new-text" placeholder="例如：早安" style="width:100%;resize:none;min-height:90px" oninput="autosize(this)"></textarea>`,
    '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button><button class="modal-btn primary" onclick="saveCardSingle()">保存</button></div>');
  setTimeout(()=>{const ta=document.getElementById('card-new-text');if(ta)autosize(ta);},60);
}
async function saveCardSingle(){
  const group=document.getElementById('card-new-group').value||'默认';
  const text=(document.getElementById('card-new-text').value||'').trim();
  if(!text){showToast('内容不能为空');return;}
  const all=await dbGetAll('cards');
  if(all.some(c=>c.text===text)){showToast('已存在相同字卡');return;}
  await dbPut('cards',{text:text,group:group,time:Date.now(),useCount:0});
  closeModal();renderCards();showToast('已添加字卡');
}
async function saveCardsBatch(){
  const group=document.getElementById('card-new-group').value||'默认';
  const lines=(document.getElementById('card-new-text').value||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);
  if(!lines.length){showToast('内容不能为空');return;}
  const all=await dbGetAll('cards');const exist=new Set(all.map(c=>c.text));
  let added=0,skip=0;
  for(const line of lines){
    if(exist.has(line)){skip++;continue;}
    exist.add(line);
    await dbPut('cards',{text:line,group:group,time:Date.now(),useCount:0});
    added++;
  }
  closeModal();renderCards();showToast(`已添加 ${added} 张${skip?'，跳过重复 '+skip+' 张':''}`);
}
async function delCardGroup(){
  const groups=await dbGetAll('cardGroups');
  const normal=groups.filter(g=>!DEFAULT_CARD_GROUPS.includes(g.name));
  if(!normal.length){showToast('内置分组不可删除');return;}
  showModal('删除分组',normal.map(g=>`<div class="modal-item" onclick="closeModal();confirmDelGroup('${esc(g.name)}')">${esc(g.name)}</div>`).join(''),
    '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button></div>');
}
async function confirmDelGroup(name){
  const gs=await dbGetAll('cardGroups');
  const g=gs.find(x=>x.name===name);if(!g)return;
  await dbDelete('cardGroups',g.id);
  const cards=await dbGetAll('cards');
  for(const c of cards)if((c.group||'默认')===name){c.group='默认';await dbPut('cards',c);}
  if(cardGroupFilter===name)cardGroupFilter='全部';
  renderCards();showToast(`已删除分组「${name}」`);
}
let cardPokeText='';
function sendCardPoke(text){
  cardPokeText=esc(text);
  const n=esc(state.other.name);
  showModal('字卡拍一拍','<div style="text-align:center;padding:8px 0 4px;font-size:16px;font-weight:600">「'+cardPokeText+'」</div><div style="text-align:center;font-size:12px;color:var(--sub);padding-bottom:8px">选择由谁发起</div>',
    '<div class="modal-item" onclick="closeModal();sendCardPokeDo(1)">我拍 '+n+'</div>'
    +'<div class="modal-item" onclick="closeModal();sendCardPokeDo(2)">'+n+' 拍我</div>');
}
function sendCardPokeDo(kind){
  if(!cardPokeText)return;
  if(kind===1){
    sendMsgObj({type:'text',content:'你拍了拍 '+state.other.name+'：「'+cardPokeText+'」'});
    showToast('已发送拍一拍');
  }else{
    sendMsgObj({type:'text',content:state.other.name+' 拍了拍你：「'+cardPokeText+'」'});
    showToast('TA 拍了拍你');
  }
}
async function exportCards(){
  const groups=await dbGetAll('cardGroups'),cards=await dbGetAll('cards');
  const data={app:'xingji-cards',schemaVersion:1,exportedAt:new Date().toISOString(),cardGroups:groups,cards:cards};
  const name='星迹_字卡备份_'+new Date().toISOString().slice(0,10)+'.json';
  const blob=new Blob([JSON.stringify(data)],{type:'application/json'});
  confirmDownload(name,async()=>{showToast('已导出 '+cards.length+' 张字卡及 '+groups.length+' 个分组');return {blob,name};});
}
/* v3.27.5：导入字卡改为「先选方式 → 再选文件 → 直接导入」——原流程先弹文件选择器，
   合并/覆盖弹窗藏在选文件之后，APP 内体验反直觉且像没有功能 */
function importCards(){
  showModal('导入字卡',
    '<div style="font-size:12px;color:var(--sub);line-height:1.9;padding:2px 2px 8px"><b>合并导入</b>：按文本查重，只追加缺失的字卡与分组，现有数据不动。<br><b>覆盖导入</b>：清空现有字卡库（保留「默认」分组），完全以文件为准。不可撤销。</div>',
    '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal();pickCardImportFile(\'merge\')">合并导入</button><button class="modal-btn primary" onclick="pickCardImportFile(\'replace\')">覆盖导入</button></div>');
}
function pickCardImportFile(mode){
  const input=document.createElement('input');input.type='file';input.accept='.json,application/json';
  input.onchange=async e=>{
    const f=e.target.files&&e.target.files[0];if(!f)return;
    try{
      const data=JSON.parse(await f.text()),groups=Array.isArray(data.cardGroups)?data.cardGroups:[],cards=Array.isArray(data.cards)?data.cards:[];
      if(!groups.length&&!cards.length){showToast('文件里没有可导入的字卡');return;}
      if(mode==='replace'){
        appConfirm('覆盖导入','将清空现有字卡库（保留「默认」分组），导入文件中的 '+cards.length+' 张字卡。不可撤销，建议先导出备份。继续？',async()=>{await __cardImportDo(mode,groups,cards);});
      }else{
        await __cardImportDo(mode,groups,cards);
      }
    }catch(err){console.error(err);showToast('字卡导入失败：文件格式不正确');}
  };
  input.click();
}
async function __cardImportDo(mode,groups,cards){
  if(mode==='replace'){
    for(const c of await dbGetAll('cards'))await dbDelete('cards',c.id);
    for(const g of await dbGetAll('cardGroups'))if(g.name!=='默认')await dbDelete('cardGroups',g.id);
  }
  const gs=await dbGetAll('cardGroups'),gn=new Set(gs.map(g=>g.name));
  for(const g of groups)if(g&&g.name&&!gn.has(g.name)){await dbPut('cardGroups',{name:g.name,enabled:g.enabled!==false});gn.add(g.name);}
  const existing=await dbGetAll('cards'),seen=new Set(existing.map(c=>c.text));let added=0,skipped=0;
  for(const c of cards){
    const text=String(c.text||'').trim();if(!text)continue;
    if(mode==='merge'&&seen.has(text)){skipped++;continue;}
    const rec={...c,text,group:c.group||'默认',time:Number(c.time)||Date.now(),useCount:Number(c.useCount)||0};
    if(mode==='replace')delete rec.id;
    await dbPut('cards',rec);seen.add(text);added++;
  }
  renderCards();showToast('字卡导入完成：新增 '+added+' 张'+(skipped?'，跳过重复 '+skipped+' 张':''));
}
async function editCard(id){
  const all=await dbGetAll('cards');const c=all.find(x=>x.id===id);if(!c)return;
  appPrompt('修改字卡',c.text,async t=>{
    const v=(t||'').trim();if(!v)return false;
    const all2=await dbGetAll('cards');
    if(all2.some(x=>x.id!==id&&x.text===v)){showToast('已存在相同字卡');return false;}
    c.text=v;await dbPut('cards',c);renderCards();showToast('已修改');
  });
}
async function delCard(id){
  appConfirm('删除字卡','确定删除这张字卡吗？',async()=>{await dbDelete('cards',id);renderCards();showToast('已删除');});
}
function addCardGroup(){
  appPrompt('新建字卡分组','',t=>{
    const v=(t||'').trim();if(!v)return false;
    dbPut('cardGroups',{name:v}).then(()=>{cardGroupFilter=v;renderCards();showToast('分组已创建');});
  });
}
/* 分组管理：新建 / 重命名 / 删除 / 停用开关（内置 4 分组不可删除——ensureDefaultCardGroups 会自动重建，删了也没用，故不显示删除按钮） */
async function manageCardGroups(){
  const groups=await dbGetAll('cardGroups');
  const all=await dbGetAll('cards');
  const builtin=name=>DEFAULT_CARD_GROUPS.includes(name);
  const cnt=n=>all.filter(c=>(c.group||'默认')===n).length;
  showModal('分组管理',
    groups.map(g=>`<div class="modal-item">
      <span class="g-name">${esc(g.name)}<span style="font-size:10px;color:var(--hint);margin-left:6px">${cnt(g.name)} 条</span>${builtin(g.name)?'<span style="font-size:10px;color:var(--hint);margin-left:6px">内置</span>':''}</span>
      <span class="cs-switch${g.enabled!==false?' on':''}" onclick="toggleGroupEnabled('${esc(g.name)}')"></span>
      <span class="g-act" onclick="closeModal();renameCardGroup('${esc(g.name)}')" title="重命名">${ICO_EDIT}</span>
      ${builtin(g.name)?'':`<span class="g-act danger" onclick="closeModal();confirmDelGroup('${esc(g.name)}')" title="删除">${ICO_DEL}</span>`}
    </div>`).join('')
    +'<div class="modal-item g-new" onclick="closeModal();addCardGroup()">＋ 新建分组</div>',
    '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button></div>');
}
async function renameCardGroup(name){
  appPrompt('重命名分组',name,async t=>{
    const v=(t||'').trim();if(!v)return false;
    if(v===name)return false;
    const gs=await dbGetAll('cardGroups');
    if(gs.some(g=>g.name===v)){showToast('同名分组已存在');return false;}
    const g=gs.find(x=>x.name===name);if(!g)return false;
    g.name=v;await dbPut('cardGroups',g);
    const cards=await dbGetAll('cards');
    for(const c of cards)if((c.group||'默认')===name){c.group=v;await dbPut('cards',c);}
    if(cardGroupFilter===name)cardGroupFilter=v;
    renderCards();showToast('分组已重命名');
  });
}
function bulkAddCards(){
  showModal('批量导入','<div style="font-size:12px;color:var(--sub);margin-bottom:6px">选择目标分组</div>'
    +'<select class="app-input" id="card-new-group" style="width:100%;padding:9px 12px;background:var(--input);border:none;border-radius:10px"><option>默认</option></select>'
    +'<div style="font-size:12px;color:var(--sub);margin:10px 0 6px">内容（一行一张，自动查重）</div>'
    +'<textarea class="app-input auto-grow" id="card-new-text" placeholder="每行一张字卡&#10;例如：&#10;早安&#10;晚安&#10;想你了" style="width:100%;resize:none;min-height:150px" oninput="autosize(this)"></textarea>',
    '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button><button class="modal-btn primary" onclick="saveCardsBatch()">批量导入</button></div>');
  dbGetAll('cardGroups').then(gs=>{
    const sel=document.getElementById('card-new-group');if(!sel)return;
    sel.innerHTML=gs.map(g=>`<option value="${esc(g.name)}">${esc(g.name)}</option>`).join('');
  });
  setTimeout(()=>{const ta=document.getElementById('card-new-text');if(ta)autosize(ta);},60);
}
