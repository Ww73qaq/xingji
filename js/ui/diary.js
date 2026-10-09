/* =========================================================
   星迹 · 日记：写 / 读 / 编辑 / 申请查看 TA 日记
   ========================================================= */

/* ===== DIARY ===== */
let diaryReqAt=0;
function fmtDiaryFull(t){
  const d=new Date(t);
  const wd=['日','一','二','三','四','五','六'][d.getDay()];
  return d.getFullYear()+'年'+(d.getMonth()+1)+'月'+d.getDate()+'日 星期'+wd+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
}
let diaryTab='mine';
function switchDiaryTab(tab,btn){diaryTab=tab;document.querySelectorAll('#app-diary .tab').forEach(t=>t.classList.remove('active'));if(btn)btn.classList.add('active');renderDiary();}
async function renderDiary(){
  const list=document.getElementById('diary-list');if(!list)return;
  list.innerHTML='';
  const diaries=await dbGetAll('diaries');
  for(const d of diaries)if(d.owner==='other'&&!d.read){d.read=true;await dbPut('diaries',d);}
  const mine=diaries.filter(d=>d.owner==='me').sort((a,b)=>b.time-a.time);
  const others=diaries.filter(d=>d.owner==='other').sort((a,b)=>b.time-a.time);
  if(diaryTab==='mine'){
    if(!mine.length){list.innerHTML='<div class="empty" style="padding:24px 0">还没有日记<br>写下第一篇吧</div>';}
    else for(const d of mine){
      /* v3.6.9：我的日记默认模糊（对 TA 藏起内容），我自己点「查看」直接展开；
         TA 想看 → 走申请流程（45% 弹窗同意/拒绝），同意后 taAccess=1 才明文显示 */
      const lockHtml=d.taAccess?''
        :`<div class="diary-lock-overlay"><div style="font-size:13px;color:var(--sub);margin-bottom:8px;padding:0 10px;text-align:center"><span style="display:inline-flex;vertical-align:-3px;margin-right:4px">${ICO.lock}</span>日记已加密<br>${esc(state.other.name||'TA')} 想看你需要申请</div><button class="btn-pill primary" onclick="toggleMyDiary(${d.id})">查看</button></div>`;
      list.innerHTML+=`<div class="diary-blur-wrap${d.taAccess?' open':''}">
        <div class="${d.taAccess?'diary-entry':'diary-blur diary-entry'}" style="${d.taAccess?'':'margin:0'}">
          <div class="d-head"><span class="d-owner">${esc(state.me.name)}</span><span class="d-time">${fmtDiaryFull(d.time)}</span>
          ${d.taAccess?'<span class="d-lock" style="border-color:var(--c-green);color:var(--c-green)"><span style="display:inline-flex;vertical-align:-2px;margin-right:3px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>'+esc(state.other.name||'TA')+' 已解锁</span>':''}
          </div>
          <div class="d-text">${esc(d.content)}</div>
          ${d.taReply?`<div style="font-size:12px;color:var(--sub);margin-top:6px;border-top:1px dashed var(--input);padding-top:6px">${esc(state.other.name)}：「${esc(d.taReply)}」</div>`:''}
          <div class="d-btns"><span onclick="editDiary(${d.id})" title="编辑">${ICO_EDIT}</span><span style="color:#c0392b" onclick="delDiary(${d.id})" title="删除">${ICO_DEL}</span></div>
        </div>
        ${lockHtml}
      </div>`;
    }
    list.innerHTML+='<button class="btn-pill primary" style="width:100%;margin-top:10px" onclick="openWriteDiary()">写日记</button>';
  }else{
    if(!others.length){list.innerHTML='<div class="empty" style="padding:24px 0">TA 还没有写日记</div>';}
    else for(const d of others){
      const g=(state.stats.diaryGrants||{})[d.id];
      const denied=(state.taDiaryDenied||{})[d.id];
      if(g){
        list.innerHTML+=`<div class="diary-entry"><div class="d-head"><span class="d-owner">${esc(state.other.name)}</span><span class="d-time">${fmtDiaryFull(d.time)}</span></div><div class="d-text">${esc(d.content)}</div></div>`;
      }else if(denied){
        list.innerHTML+=`<div class="diary-blur-wrap"><div class="diary-blur diary-entry" style="margin:0;filter:blur(5px);opacity:.45"><div class="d-head"><span class="d-owner">${esc(state.other.name)}</span><span class="d-time">${fmtDiaryFull(d.time)}</span></div><div class="d-text">${esc(d.content)}</div></div><div class="diary-lock-overlay"><div style="font-size:13px;color:var(--sub);margin-bottom:8px;padding:0 10px;text-align:center">这一篇，TA 暂时不想让人看<br>过段时间再试试</div></div></div>`;
      }else{
        list.innerHTML+=`<div class="diary-blur-wrap"><div class="diary-blur diary-entry" style="margin:0"><div class="d-head"><span class="d-owner">${esc(state.other.name)}</span><span class="d-time">${fmtDiaryFull(d.time)}</span></div><div class="d-text">${esc(d.content)}</div></div><div class="diary-lock-overlay"><div style="font-size:13px;color:var(--sub);margin-bottom:8px;padding:0 10px;text-align:center">TA 的日记已加密模糊<br>申请后可查看这一篇</div><button class="btn-pill primary" onclick="requestDiaryAccess(${d.id},this)">申请查看</button></div></div>`;
      }
    }
  }
  updateTabBadge('moments',0);
  refreshAllBadges();
}
/* v3.7.0：去掉 30~60s「TA 正在考虑」干等空窗——点申请即出结果（保留 8% 概率拒绝、拒绝后该篇长冷却） */
function requestDiaryAccess(id,btn){
  if((state.taDiaryDenied||{})[id]){showToast('这一篇 TA 暂时不想让人看，过段时间再试试');return;}
  if(Math.random()<0.08){
    state.taDiaryDenied=state.taDiaryDenied||{};
    state.taDiaryDenied[id]=Date.now();
    saveKey('taDiaryDenied');
    showToast('这一篇，TA 暂时不想让人看');
    renderDiary();
  }else{
    state.stats.diaryGrants=state.stats.diaryGrants||{};
    state.stats.diaryGrants[id]=Date.now();
    saveKey('stats');
    showToast(state.other.name+' 同意你查看这篇日记');
    renderDiary();
  }
}
function openWriteDiary(){
  showModal('写日记',`<textarea class="textarea-full diary-paper" id="diary-content" placeholder="写下今天的心情..."></textarea>
    <div style="text-align:right;font-size:11px;color:var(--hint);margin-top:8px">保存后自动记录：${fmtDiaryFull(Date.now())}</div>`,
    '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button><button class="modal-btn primary" onclick="saveDiary()">保存</button></div>');
}
async function saveDiary(){
  const content=document.getElementById('diary-content').value.trim();
  if(!content){showToast('内容不能为空');return;}
  const rec=await dbPut('diaries',{owner:'me',subtype:'record',content,time:Date.now(),taAccess:0});
  closeModal();showToast('日记已保存（'+fmtDiaryFull(Date.now())+'）');
  if(state.currentApp==='diary')renderDiary();
  /* v3.6.8：TA 不再自动读日记——45% 概率发起申请，同意后才读+回复；拒绝冷却 2h；30 分钟未答复自动同意 */
  maybeTaRequestDiary(rec);
}
/* TA 申请看我的日记 */
function maybeTaRequestDiary(recId){
  if(Date.now()<(state.myDiaryReqCoolAt||0))return;
  if(Math.random()>0.45)return;
  state.myDiaryReqCoolAt=Date.now()+200000+Math.random()*600000;   // 申请后 3~13 分钟冷却
  saveKey('myDiaryReqCoolAt');
  showModal((state.other.name||'TA')+' 想看看你的日记',
    `<div style="font-size:13px;line-height:1.9">TA 在意识空间里感应到你今天写了日记，想读一读。</div>`,
    '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal();taDiaryDecide('+recId+',0)">拒绝</button><button class="modal-btn primary" onclick="closeModal();taDiaryDecide('+recId+',1)">同意</button></div>');
  setTimeout(()=>taDiaryAutoGrant(recId),30*60000);   // v3.7.0：30 分钟自动同意逻辑保留，但不再上屏倒计时/数字
}
async function taDiaryDecide(id,ok){
  if(!ok){state.myDiaryReqCoolAt=Date.now()+2*3600000;saveKey('myDiaryReqCoolAt');showToast('TA 收回了目光');return;}
  await grantTaDiary(id);
}
/* v3.7.0：回复轻读日记内容——含疲惫/用眼/失眠/难受等关键词时偏向安抚、医生语气（R4）；
   从 TA_DIARY_REPLIES 原池挑选，绝不删改「明天见面吧，我想当面说给你听」整条 */
function pickDiaryReply(content){
  const c=content||'';
  if(/累|困|疲|眼|失眠|睡|难|疼|不舒服|病|头|熬|辛苦/.test(c)){
    const calm=TA_DIARY_REPLIES.filter(s=>/别太累|记下来|每一个字/.test(s));
    if(calm.length)return calm[Math.floor(Math.random()*calm.length)];
  }
  return TA_DIARY_REPLIES[Math.floor(Math.random()*TA_DIARY_REPLIES.length)];
}
async function grantTaDiary(id){
  const d=await dbGet('diaries',id);if(!d||d.owner!=='me')return;
  if(d.taAccess)return;
  d.taAccess=1;await dbPut('diaries',d);
  showToast('TA 读到了你的日记');
  setTimeout(async()=>{
    const row=await dbGet('diaries',id);
    if(row&&row.taAccess&&!row.taReply){
      const reply=pickDiaryReply(row.content);
      row.taReply=reply;await dbPut('diaries',row);   // 先把回复落进日记记录
      /* v3.7.0：静音/收起声音期不推送（pushSys/pushReply），但 taReply 已私有落库 */
      if(taOutputBlocked()){if(state.currentApp==='diary')renderDiary();return;}
      pushSys(state.other.name+' 读到了你的日记');
      pushReply(reply);
      if(state.currentApp==='diary')renderDiary();
    }
  },5000+Math.random()*12000);
}
async function taDiaryAutoGrant(id){
  const d=await dbGet('diaries',id);if(!d)return;
  if(!d.taAccess)await grantTaDiary(id);
}
/* v3.6.9：我的日记「查看」按钮——我自己直接展开明文（不需要申请） */
function toggleMyDiary(id){
  const wrap=event&&event.target?event.target.closest('.diary-blur-wrap'):null;
  if(wrap){
    wrap.classList.add('open');
    return;
  }
  // 兜底：找不到 DOM 时全量刷新
  renderDiary();
}
async function editDiary(id){
  const diaries=await dbGetAll('diaries');const d=diaries.find(x=>x.id===id);if(!d||d.owner!=='me')return;
  showModal('编辑日记',`<textarea class="textarea-full diary-paper" id="diary-content" style="min-height:120px">${esc(d.content)}</textarea>`,'<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button><button class="modal-btn primary" onclick="saveDiaryEdit(${id})">保存修改</button></div>');
}
async function saveDiaryEdit(id){
  const diaries=await dbGetAll('diaries');const d=diaries.find(x=>x.id===id);if(!d)return;
  const content=document.getElementById('diary-content').value.trim();
  if(!content){showToast('内容不能为空');return;}
  d.content=content;await dbPut('diaries',d);closeModal();renderDiary();showToast('日记已更新');
}
async function delDiary(id){
  appConfirm('删除日记','确定删除这篇日记吗？此操作不可恢复。',async()=>{await dbDelete('diaries',id);renderDiary();showToast('已删除');});
}
async function ensureTaDiary(){
  // v3.5.1：用户刚「清除全部数据」，本次会话 TA 不再自动写加密日记（否则清除后日记"又回来"）
  try{if(sessionStorage.getItem('xingji-cleared'))return;}catch(e){}
  const diaries=await dbGetAll('diaries');
  const hasOther=diaries.some(d=>d.owner==='other');
  if(hasOther)return;
  const n=1+Math.floor(Math.random()*2);
  for(let i=0;i<n;i++){
    const line=TA_DIARY_LINES[Math.floor(Math.random()*TA_DIARY_LINES.length)];
    const hoursAgo=Math.floor(Math.random()*96)+8;
    await dbPut('diaries',{owner:'other',subtype:'record',content:line,time:Date.now()-hoursAgo*3600000});
  }
  if(state.currentApp==='diary')renderDiary();
}
