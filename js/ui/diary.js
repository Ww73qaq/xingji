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
      list.innerHTML+=`<div class="diary-entry locked"><div class="d-head"><span class="d-owner">${esc(state.me.name)}</span><span class="d-time">${fmtDiaryFull(d.time)}</span></div>
        <div class="d-text">${esc(d.content)}</div>
        ${d.taReply?`<div style="font-size:12px;color:var(--sub);margin-top:6px;border-top:1px dashed var(--input);padding-top:6px">${esc(state.other.name)}：「${esc(d.taReply)}」</div>`:''}
        <div class="d-btns"><span onclick="editDiary(${d.id})" title="编辑">${ICO_EDIT}</span><span style="color:#c0392b" onclick="delDiary(${d.id})" title="删除">${ICO_DEL}</span></div></div>`;
    }
    list.innerHTML+='<button class="btn-pill primary" style="width:100%;margin-top:10px" onclick="openWriteDiary()">写日记</button>';
  }else{
    if(!others.length){list.innerHTML='<div class="empty" style="padding:24px 0">TA 还没有写日记</div>';}
    else for(const d of others){
      const g=(state.stats.diaryGrants||{})[d.id];
      if(g){
        list.innerHTML+=`<div class="diary-entry"><div class="d-head"><span class="d-owner">${esc(state.other.name)}</span><span class="d-time">${fmtDiaryFull(d.time)}</span></div><div class="d-text">${esc(d.content)}</div></div>`;
      }else{
        list.innerHTML+=`<div class="diary-blur-wrap"><div class="diary-blur diary-entry" style="margin:0"><div class="d-head"><span class="d-owner">${esc(state.other.name)}</span><span class="d-time">${fmtDiaryFull(d.time)}</span></div><div class="d-text">${esc(d.content)}</div></div><div class="diary-lock-overlay"><div style="font-size:13px;color:var(--sub);margin-bottom:8px;padding:0 10px;text-align:center">TA 的日记已加密模糊<br>申请后可查看这一篇</div><button class="btn-pill primary" onclick="requestDiaryAccess(${d.id})">申请查看</button></div></div>`;
      }
    }
  }
  updateTabBadge('moments',0);
  refreshAllBadges();
}
function requestDiaryAccess(id){
  state.stats.diaryGrants=state.stats.diaryGrants||{};
  state.stats.diaryGrants[id]=Date.now();
  saveKey('stats');
  showToast(state.other.name+' 同意你查看这篇日记');
  renderDiary();
}
function openWriteDiary(){
  showModal('写日记',`<textarea class="textarea-full diary-paper" id="diary-content" placeholder="写下今天的心情..."></textarea>
    <div style="text-align:right;font-size:11px;color:var(--hint);margin-top:8px">保存后自动记录：${fmtDiaryFull(Date.now())}</div>`,
    '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button><button class="modal-btn primary" onclick="saveDiary()">保存</button></div>');
}
async function saveDiary(){
  const content=document.getElementById('diary-content').value.trim();
  if(!content){showToast('内容不能为空');return;}
  const rec=await dbPut('diaries',{owner:'me',subtype:'record',content,time:Date.now()});
  closeModal();showToast('日记已保存（'+fmtDiaryFull(Date.now())+'）');
  if(state.currentApp==='diary')renderDiary();
  if(Math.random()<0.78){
    const reply=TA_DIARY_REPLIES[Math.floor(Math.random()*TA_DIARY_REPLIES.length)];
    setTimeout(async()=>{
      const row=await dbGet('diaries',rec);
      if(row){row.taReply=reply;await dbPut('diaries',row);}
      pushSys(state.other.name+' 读到了你的日记');
      pushReply(reply);
      if(state.currentApp==='diary')renderDiary();
    },5000+Math.random()*12000);
  }
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
