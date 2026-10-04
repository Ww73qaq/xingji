/* =========================================================
   星迹 · 桌面：昵称、便签、标签栏、角标、信号
   ========================================================= */

/* ===== HOME ===== */
function updateHome(){
  document.getElementById('home-name-me').textContent=state.me.name;
  document.getElementById('home-name-other').textContent=state.other.name;
  paintAvatar(document.getElementById('home-avatar-me'),state.me);
  paintAvatar(document.getElementById('home-avatar-other'),state.other);
  if(state.meetTime){const d=Math.floor((Date.now()-state.meetTime)/86400000);document.getElementById('home-sign').textContent=`已相伴 ${d} 天`;}
  else{document.getElementById('home-sign').textContent='你在左边 我紧靠右';}
  // 桌面便签（我的便签 / {TA昵称}便签，动态绑定昵称）
  const na=document.getElementById('note-a'),nb=document.getElementById('note-b');
  const nha=document.getElementById('note-head-a'),nhb=document.getElementById('note-head-b');
  if(nha)nha.textContent='我的便签';
  if(nhb)nhb.textContent=state.other.name+'的便签';
  if(na)na.textContent=((state.notes||[])[0]||{}).text||'写点什么…';
  if(nb)nb.textContent=((state.notes||[])[1]||{}).text||'写点什么…';
  updateTabBadge('chat',0);countUnreadLetters().then(n=>updateTabBadge('chat',n));
  updateTabBar();
}
function editNote(id){
  const idx=id==='a'?0:1;
  const cur=(state.notes&&state.notes[idx]&&state.notes[idx].text)||'';
  const title=id==='a'?'我的便签':state.other.name+'的便签';
  showModal(title,`<textarea class="textarea-full" id="note-input" style="min-height:120px" placeholder="写点什么…">${esc(cur)}</textarea>
    <div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button><button class="modal-btn primary" onclick="saveNote('${id}')">保存</button></div>`);
  setTimeout(()=>{const i=document.getElementById('note-input');if(i)i.focus();},80);
}
function saveNote(id){
  const idx=id==='a'?0:1;
  const v=document.getElementById('note-input')?document.getElementById('note-input').value:'';
  state.notes=state.notes||[{id:'a',owner:'me',text:''},{id:'b',owner:'me',text:''}];
  state.notes[idx]={id:state.notes[idx]?state.notes[idx].id:id,owner:state.notes[idx]?state.notes[idx].owner:'me',text:v};
  saveKey('notes');closeModal();updateHome();showToast('便签已保存');
}
function updateTabBar(){
  document.querySelectorAll('.tab-item').forEach(t=>t.classList.toggle('on',t.dataset.tab===navRoot));
}
async function countUnreadLetters(){const all=await dbGetAll('letters');return all.filter(l=>l.sender==='other'&&!l.read).length;}
/* 底部标签栏未读徽标（统一红点，不显示数字） */
function updateTabBadge(tab,count){
  const b=document.getElementById('tab-badge-'+tab);if(!b)return;
  b.style.display=count>0?'block':'none';b.textContent='';
}
async function refreshAllBadges(){
  if(!DB)return;
  const msgs=await dbGetAll('messages');
  const chatUnread=msgs.filter(m=>m.sender==='other'&&!m.read).length + await countUnreadLetters();
  updateTabBadge('chat',chatUnread);
  const moments=await dbGetAll('moments');
  const diary=await dbGetAll('diaries');
  const momUnread=moments.filter(m=>m.owner==='other'&&!m.read).length + diary.filter(d=>d.owner==='other'&&!d.read).length + notifUnreadCount();
  updateTabBadge('moments',momUnread);
  updateTabBadge('cards',0);
}
/* 信号强弱：动态跳动，模拟链接强度；每 2.5 秒随机一次强弱 */
const SIG_SEQ=[1,2,3,2,4,3,5,4,5,3];  // 楼梯式离散状态：1→2→3→2→4→3→5→4…
function renderSignal(){
  const el=document.getElementById('sb-signal');if(!el)return;
  if(!el.childElementCount){
    for(let i=0;i<5;i++){
      const b=document.createElement('span');
      b.className='sig-bar';
      b.style.height=(5+(i+1)*2)+'px';
      b.style.opacity=.25;
      el.appendChild(b);
    }
  }
  clearTimeout(renderSignal._t);
  let idx=0;
  const step=()=>{
    const n=SIG_SEQ[idx%SIG_SEQ.length];
    const bars=el.children;
    for(let i=0;i<bars.length;i++){
      bars[i].style.opacity=i<n?1:.25;
      bars[i].style.transform=i<n?'scaleY(1)':'scaleY(.6)';
    }
    idx++;
    const hold=2600+Math.random()*2600;   // 楼梯式呼吸：2.6~5.2 秒换一次
    renderSignal._t=setTimeout(step,hold);
  };
  step();
}
function paintTabIcons(){
  document.querySelectorAll('.tab-ico[data-ico]').forEach(el=>{
    const k=el.dataset.ico;
    if(LINE_ICONS[k]&&!el.firstChild)el.innerHTML=LINE_ICONS[k];
  });
}
