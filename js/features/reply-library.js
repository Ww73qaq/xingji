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
function cardCompare(a,b){
  const ua=Number(a.useCount)||0,ub=Number(b.useCount)||0;
  const uaUsed=ua>0,ubUsed=ub>0;
  if(uaUsed!==ubUsed)return uaUsed?-1:1;      // 用过的整段排在前面
  if(uaUsed&&ub!==ua)return ub-ua;            // 段内按使用次数降序
  const at=a.text||'',bt=b.text||'';          // 默认：字母序（中文按拼音）
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
    <div class="tabs" style="overflow-x:auto;flex-wrap:nowrap">${names.map((n,i)=>`<button class="tab${cardGroupFilter===n?' active':''}" style="flex:0 0 auto;padding:8px 14px" onclick="pickCardGroup(${i})">${esc(n)}</button>`).join('')}
    <button class="tab" style="flex:0 0 auto;padding:8px 14px" onclick="addCard()">＋ 字卡</button>
    <button class="tab" style="flex:0 0 auto;padding:8px 14px" onclick="exportCards()">导出</button>
    <button class="tab" style="flex:0 0 auto;padding:8px 14px" onclick="importCards()">导入</button>
    <button class="tab" style="flex:0 0 auto;padding:8px 14px" onclick="manageCardGroups()">分组</button></div>
    <div class="card-toolbar" style="color:var(--hint);font-size:11px">默认按字母排序 · 用过的字卡排在前面</div>
    <div class="search-bar">&#128269;<input type="text" id="card-search" placeholder="搜索字卡" oninput="filterCards(this.value)"></div>
    <div id="card-list"></div>`;
  renderCardList();
  filterCards('');
}
let cardGroupNames=[];
function pickCardGroup(i){cardGroupFilter=cardGroupNames[i]||'全部';renderCards();}
function renderCardList(){dbGetAll('cards').then(all=>{let list=all.filter(c=>cardGroupFilter==='全部'||(c.group||'默认')===cardGroupFilter);list.sort(cardCompare);const box=document.getElementById('card-list');if(!list.length){box.innerHTML='<div class="empty">这个分组还没有字卡<br>点击右上角 + 添加</div>';return;}box.innerHTML=list.map(c=>{const n=Number(c.useCount)||0;const meta=n?(' · '+n+' 次使用'+(c.lastUsedAt?(' · 最近 '+fmtChatDate(c.lastUsedAt)):'')):'';return `<div class="list-card" style="display:flex;align-items:center;gap:10px" data-t="${esc(c.text||'')}"><input class="card-select" type="checkbox" ${selectedCardIds.has(c.id)?'checked':''} onchange="toggleCardSelect(${c.id},this.checked)"><div style="flex:1;min-width:0;cursor:pointer" onclick="sendCardPoke('${esc(c.text)}')"><div class="list-card-title">${esc(c.text)}</div><div class="list-card-sub">${esc(c.group||'默认')}${meta}</div></div><button class="btn-pill ghost" style="padding:6px 10px" onclick="editCard(${c.id})">改</button><button class="btn-pill ghost" style="padding:6px 10px;color:${c.enabled===false?'#c0392b':'var(--sub)'}" onclick="toggleCardEnabled(${c.id})">${c.enabled===false?'启用':'停用'}</button><button class="btn-pill ghost" style="padding:6px 10px" onclick="delCard(${c.id})">删</button></div>`;}).join('');});}
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
  document.querySelectorAll('#card-list .list-card').forEach(el=>{
    el.style.display=!q||(el.dataset.t||'').toLowerCase().includes(q)?'':'none';
  });
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
  const normal=groups.filter(g=>g.name!=='默认');
  if(!normal.length){showToast('默认分组不可删除');return;}
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
  confirmDownload(name,async()=>{downloadBlob(new Blob([JSON.stringify(data)],{type:'application/json'}),name);showToast('已导出 '+cards.length+' 张字卡及 '+groups.length+' 个分组');});
}
function importCards(){
  const input=document.createElement('input');input.type='file';input.accept='.json,application/json';
  input.onchange=async e=>{
    const f=e.target.files&&e.target.files[0];if(!f)return;
    try{
      const data=JSON.parse(await f.text()),groups=Array.isArray(data.cardGroups)?data.cardGroups:[],cards=Array.isArray(data.cards)?data.cards:[];
      if(!groups.length&&!cards.length){showToast('文件里没有可导入的字卡');return;}
      showModal('导入字卡','<div style="font-size:13px;line-height:1.7;color:var(--sub)">发现 '+cards.length+' 张字卡、'+groups.length+' 个分组。请选择导入方式。</div>',
        '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal();window.__cardImportMode(\'merge\')">合并</button><button class="modal-btn primary" onclick="closeModal();window.__cardImportMode(\'replace\')">覆盖字卡</button></div>');
      window.__cardImportMode=async mode=>{
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
      };
    }catch(err){console.error(err);showToast('字卡导入失败：文件格式不正确');}
  };input.click();
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
/* 分组管理：新建 / 重命名 / 删除 / 停用开关（默认分组不可删除） */
async function manageCardGroups(){
  const groups=await dbGetAll('cardGroups');
  showModal('分组管理',
    groups.map(g=>`<div class="modal-item" style="display:flex;align-items:center;gap:10px">
      <span style="flex:1;text-align:left">${esc(g.name)}${g.name==='默认'?'<span style="font-size:10px;color:var(--hint);margin-left:6px">不可删除</span>':''}</span>
      <span class="cs-switch${g.enabled!==false?' on':''}" style="transform:scale(.8)" onclick="toggleGroupEnabled('${esc(g.name)}')"></span>
      <span style="font-size:12px;padding:4px 6px" onclick="closeModal();renameCardGroup('${esc(g.name)}')" title="重命名">${ICO_EDIT}</span>
      ${g.name==='默认'?'':`<span style="color:#c0392b;font-size:12px;padding:4px 6px" onclick="closeModal();confirmDelGroup('${esc(g.name)}')" title="删除">${ICO_DEL}</span>`}
    </div>`).join('')
    +'<div class="modal-item" style="color:var(--primary)" onclick="closeModal();addCardGroup()">＋ 新建分组</div>',
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
