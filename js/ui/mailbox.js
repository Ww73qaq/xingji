/* =========================================================
   星迹 · 信箱：写信 / 收信 / 回信 / 编辑 / 往来
   ========================================================= */

let mailboxTab='sent';   // 寄出在前（方案：寄出的信/收到的信位置互换）
function switchMailboxTab(tab,btn){mailboxTab=tab;document.querySelectorAll('#app-mailbox .tab').forEach(t=>t.classList.remove('active'));if(btn)btn.classList.add('active');renderMailbox();}
function renderWriteLetter(list){
  const taName=state.other.name||'TA',myName=state.me.name||'我';
  const today=fmtFull(Date.now());
  list.innerHTML=`<div class="write-letter">
    <div class="wl-to">致 ${esc(taName)}</div>
    <div class="wl-hint">见字如面，展信舒颜。</div>
    <textarea class="textarea-full" id="letter-content" placeholder="写下想说的话…" style="min-height:190px;background:transparent;line-height:2;font-size:15px"></textarea>
    <div class="wl-foot">此致<br>${esc(myName)} · ${today}</div>
  </div>`;
}
function renderMailboxData(list){
  list.innerHTML=`<div class="cs-group" style="margin-top:6px">
    <div class="cs-item" onclick="exportLetters()"><span class="cs-ico">&#128229;</span><span class="cs-label">导出信件数据</span><span class="cs-arrow">&#8250;</span></div>
    <div class="cs-item" onclick="importLetters()"><span class="cs-ico">&#128228;</span><span class="cs-label">导入信件数据</span><span class="cs-arrow">&#8250;</span></div>
    <div class="cs-item" style="color:#c0392b" onclick="clearLetters()"><span class="cs-ico">&#128465;</span><span class="cs-label">清空所有信件</span></div>
  </div>
  <div style="font-size:11px;color:var(--hint);padding:14px 4px;line-height:1.8">信件数据仅保存在本机浏览器中，清除浏览器数据会丢失，请定期导出备份。</div>`;
}
async function renderMailbox(){
  await processPendingReplies();
  const list=document.getElementById('mailbox-list');list.innerHTML='';
  if(mailboxTab==='write'){renderWriteLetter(list);return;}
  if(mailboxTab==='data'){renderMailboxData(list);return;}
  const letters=await dbGetAll('letters');
  if(!letters.length){list.innerHTML='<div class="empty">还没有信件<br>去「写封信」写一封吧</div>';return;}
  letters.sort((a,b)=>b.time-a.time);
  for(const l of letters){
    if(mailboxTab==='inbox'&&l.sender!=='other')continue;
    if(mailboxTab==='sent'&&l.sender!=='me')continue;
    const statusClass=l.status==='waiting'?'waiting':(l.sender==='other'&&!l.read)?'unread':(l.sender==='me'&&l.status==='replied')?'replied':'replied';
    const statusText=(l.sender==='me'&&l.status==='waiting')?'对方正在回信':(l.sender==='other'&&!l.read)?'新回信':(l.sender==='me')?'已回信':'已读';
    list.innerHTML+=`<div class="letter-card" onclick="viewLetter(${l.id})"><div style="display:flex;align-items:center;gap:8px"><span class="letter-status ${statusClass}">${statusText}</span><span style="flex:1;font-size:11px;color:var(--hint)">${l.sender==='me'?'寄出':'收到'} · ${fmtTime(l.time)}</span><span style="cursor:pointer;font-size:15px;padding:2px 6px" onclick="event.stopPropagation();editLetter(${l.id})">&#9998;</span></div><div class="list-card-title" style="margin-top:6px">${l.sender==='me'?'寄出的信':'TA 的回信'}</div><div class="list-card-sub">${esc(l.content?.slice(0,60)||'')}${(l.content?.length||0)>60?'...':''}</div></div>`;
  }
  if(!list.innerHTML)list.innerHTML='<div class="empty">暂无信件</div>';
  updateTabBadge('chat',await countUnreadLetters());
}
async function sendLetter(){
  const content=document.getElementById('letter-content').value.trim();
  if(!content){showToast('内容不能为空');return;}
  const now=Date.now();const threadId='letter-'+now+'-'+Math.random().toString(36).slice(2,8);const replyAt=now+Math.floor(Math.random()*8*60*60*1000);await dbPut('letters',{sender:'me',title:'',content,time:now,status:'waiting',read:true,replyAt,threadId});
  const el=document.getElementById('letter-content');if(el)el.value='';
  closeModal();
  showToast('信件已寄出，等待回信');
  renderMailbox();
}
function writeLetterModal(){
  const list=document.createElement('div');
  renderWriteLetter(list);
  showModal('写封信',list.innerHTML,'<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button><button class="modal-btn primary" onclick="sendLetter()">寄出</button></div>');
}
function mailboxMore(){
  const list=document.createElement('div');
  renderMailboxData(list);
  showModal('信件数据',list.innerHTML,'<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button></div>');
}
async function viewLetter(id){const letters=await dbGetAll('letters');const l=letters.find(x=>x.id===id);if(!l)return;const tid=l.threadId||('letter-'+(l.replyTo||l.id));const thread=letters.filter(x=>(x.threadId||('letter-'+(x.replyTo||x.id)))===tid).sort((a,b)=>a.time-b.time);for(const x of thread)if(x.sender==='other'&&!x.read){x.read=true;await dbPut('letters',x);}updateTabBadge('chat',await countUnreadLetters());const html=thread.map(x=>`<div class="letter-thread${x.sender==='me'?' mine':''}"><div class="lt-head">${esc(x.sender==='me'?state.me.name:state.other.name)}${x.status==='waiting'?' · 等待回信':''}</div><div class="lt-body">${esc(x.content)}</div><div class="lt-time">${fmtFull(x.time)}</div></div>`).join('');showModal('往来信件',html,(l.sender==='other'?'<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button><button class="modal-btn primary" onclick="closeModal();replyLetter('+l.id+')">回复 TA</button></div>':'<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button><button class="modal-btn primary" onclick="closeModal();editLetter('+l.id+')">修改这封信</button></div>'));}
async function editLetter(id){
  const letters=await dbGetAll('letters');const l=letters.find(x=>x.id===id);if(!l||l.sender!=='me')return;
  showModal('编辑寄出的信',`<textarea class="textarea-full" id="letter-content" style="min-height:120px">${esc(l.content)}</textarea>`,'<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button><button class="modal-btn primary" onclick="saveLetterEdit(${id})">保存修改</button></div>');
}
async function saveLetterEdit(id){
  const letters=await dbGetAll('letters');const l=letters.find(x=>x.id===id);if(!l)return;
  const content=document.getElementById('letter-content').value.trim();
  if(!content){showToast('内容不能为空');return;}
  l.content=content;l.time=Date.now();await dbPut('letters',l);closeModal();renderMailbox();showToast('信件已更新');
}
function replyLetter(id){
  showModal('回信',`<textarea class="textarea-full" id="letter-content" placeholder="写下你的回信…" style="min-height:140px"></textarea>`,'<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button><button class="modal-btn primary" onclick="saveLetterReply(${id})">寄出回信</button></div>');
}
async function saveLetterReply(id){
  const content=document.getElementById('letter-content').value.trim();
  if(!content){showToast('内容不能为空');return;}
  const parent=(await dbGetAll('letters')).find(x=>x.id===id);const now=Date.now();const replyAt=now+Math.floor(Math.random()*8*60*60*1000);await dbPut('letters',{sender:'me',title:'',content,time:now,status:'waiting',read:true,replyAt,replyTo:id,threadId:parent?.threadId||('letter-'+id)});
  closeModal();showToast('回信已寄出');renderMailbox();
}
