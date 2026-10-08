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
  renderNotes();
  updateTabBadge('chat',0);countUnreadLetters().then(n=>updateTabBadge('chat',n));
  updateTabBar();
}
/* ===== 便签（两张：我的 / TA 的） =====
   owner:'me'   = 用户自己写的 → TA 绝不覆盖
   owner:'other' = TA 写的 → 用户可以编辑覆盖（编辑后 owner 变回 'me'） */
function noteAt(i){
  state.notes=state.notes||[];
  if(!state.notes[i])state.notes[i]={id:i===0?'a':'b',owner:'me',text:'',mood:''};
  return state.notes[i];
}
function noteIsTa(i){return noteAt(i).owner==='other';}
function noteBody(i){return (noteAt(i).text||'').trim();}
/* 便签时间标签：刚刚 / N 分钟前 / N 小时前 / MM月DD日 */
function noteTimeLabel(t){
  if(!t)return '';
  const d=Date.now()-t;
  if(d<60000)return '刚刚';
  if(d<3600000)return Math.floor(d/60000)+' 分钟前';
  if(d<86400000)return Math.floor(d/3600000)+' 小时前';
  return fmtFull(t);
}
function renderNotes(){
  const cards=[{k:'a',i:0},{k:'b',i:1}];
  cards.forEach(({k,i})=>{
    const n=noteAt(i);
    const body=document.getElementById('note-'+k);
    const head=document.getElementById('note-head-'+k);
    const card=body?body.closest('.note-card'):null;
    if(head){
      head.textContent=(i===0?'我的便签':state.other.name+'的便签');
      // TA 那张：右侧显示更新时间 + 未读小红点
      let badge=head.parentElement.querySelector('.note-head-meta');
      if(i===1){
        if(!badge){
          badge=document.createElement('span');
          badge.className='note-head-meta';
          head.parentElement.insertBefore(badge,head.nextSibling);
        }
        const unread=state.stats.taNoteUnread&&noteIsTa(1);
        badge.textContent=noteTimeLabel(n.at);
        badge.classList.toggle('unread',!!unread);
        badge.style.display=n.at?'':'none';
      }else if(badge)badge.remove();
    }
    if(body)body.textContent=n.text||'写点什么…';
    if(card)card.classList.toggle('from-ta',noteIsTa(i));
    // 心情标记：便签名字右侧
    let moodEl=head.parentElement.querySelector('.note-head-mood');
    if(!moodEl){moodEl=document.createElement('span');moodEl.className='note-head-mood';head.parentElement.insertBefore(moodEl,head.nextSibling);}
    moodEl.textContent=n.mood||'';
    moodEl.style.display=n.mood?'':'none';
  });
}
/* 进入桌面 = 看见便签 → 清掉未读红点 */
function markNotesSeen(){
  if(state.stats.taNoteUnread){state.stats.taNoteUnread=0;saveKey('stats');}
}
/* 便签长按菜单（复用聊天消息的锚定动作条） */
function openNoteMenu(id){
  const i=id==='a'?0:1;
  const items=[];
  items.push({label:noteBody(i)?'编辑便签':'写点什么',fn:()=>editNote(id)});
  if(i===1){
    if(noteIsTa(1))items.push({label:'让 TA 重新写',fn:()=>taWriteNote(true)});
    items.push({label:'清空便签',fn:()=>clearNote(id),danger:true,sepBefore:true});
  }else{
    items.push({label:'清空便签',fn:()=>clearNote(id),danger:true,sepBefore:true});
  }
  const card=document.querySelector(`.note-card`);
  const el=document.getElementById('note-'+id);
  showActionBar(items,{anchor:el||card});
}
function clearNote(id){
  const i=id==='a'?0:1;
  appConfirm('清空便签','清空后无法恢复，确定吗？',async()=>{
    state.notes[i]={id:id,owner:'me',text:'',mood:''};
    saveKey('notes');updateHome();showToast('便签已清空');
  });
}
/* 便签长按 → 菜单（与聊天长按同一套动作条，桌面不滚动所以不绑 scroller） */
(function bindNoteLongPress(){
  const wrap=document.getElementById('note-cards');
  if(!wrap)return;
  wrap.addEventListener('pointerdown',e=>{
    const card=e.target.closest('.note-card');if(!card)return;
    const id=card.dataset.note;
    const t=setTimeout(()=>{haptic();openNoteMenu(id);},520);
    const cancel=()=>clearTimeout(t);
    card.addEventListener('pointerup',cancel,{once:true});
    card.addEventListener('pointerleave',cancel,{once:true});
    card.addEventListener('pointercancel',cancel,{once:true});
    e.preventDefault&&e.preventDefault();   // 抑制长按选中
  });
  wrap.addEventListener('contextmenu',e=>{
    const card=e.target.closest('.note-card');if(!card)return;
    e.preventDefault();openNoteMenu(card.dataset.note);
  });
})();
/* ===== TA 写便签（内部节奏，用户只管开关） =====
   规则：
   1) 开关 state.stats.taNoteEnabled（默认开）关闭 → 不写；
   2) 用户自己写过这张便签（owner==='me' 且有内容）→ 绝不覆盖，等用户主动「让 TA 重新写」；
   3) 禁言期间（TA 在整理意识 / TA 不想理你）→ 不写；
   4) 最小间隔 90 分钟（内部再随机 ×1~1.8），到点后 30% 概率写一条。
   参数说明：
   - maybeTaWriteNote(skipThrottle)：心跳调用；skipThrottle 只跳过「间隔 + 概率」，
     开关、用户已写、禁言三条规则依然生效（调试时也用它，不要用它绕过数据保护）。
   - taWriteNote(force)：force=true 表示「用户主动点了让 TA 重新写」，此时允许覆盖用户写的内容。 */
const TA_NOTE_MIN_GAP=90*60000;
const TA_NOTE_PROB=30;
function taNoteEnabled(){return (state.stats.taNoteEnabled===undefined)?true:!!state.stats.taNoteEnabled;}
function maybeTaWriteNote(skipThrottle){
  if(!taNoteEnabled())return false;
  if(!skipThrottle){
    const last=Number(state.stats.taNoteLastAt)||0;
    if(last&&Date.now()-last<TA_NOTE_MIN_GAP*(1+Math.random()*0.8))return false;
    if(!_roll(TA_NOTE_PROB))return false;
  }
  return taWriteNote(false);
}
function taWriteNote(force){
  const n=noteAt(1);
  // 数据安全第一：用户写过就不覆盖（只有用户主动点「让 TA 重新写」才允许覆盖）
  if(!force&&n.owner==='me'&&(n.text||'').trim())return false;
  if(!force&&(Date.now()<state.muteEndTime||Date.now()<state.taMuteMeEndTime))return false;
  const used=state.stats.taNoteUsed||{};
  const pool=TA_NOTE_LINES.filter(t=>!used[t]);
  const text=(pool.length?pool:TA_NOTE_LINES)[Math.floor(Math.random()*(pool.length||TA_NOTE_LINES.length))];
  const moods=MOOD_POOL.concat(Array.isArray(state.moodPool)?state.moodPool:[]);
  const mood=moods.length?moods[Math.floor(Math.random()*moods.length)]:'';
  state.notes[1]={id:'b',owner:'other',text,at:Date.now(),mood};
  used[text]=1;
  state.stats.taNoteUsed=used;
  state.stats.taNoteLastAt=Date.now();
  state.stats.taNoteUnread=1;
  saveKey('notes');saveKey('stats');
  renderNotes();
  if(state.currentApp&&state.currentApp!=='chat')return true;
  // 不在聊天页时给一条系统消息 + 手机通知，回到桌面就能看到便签
  if(navStack.length||document.getElementById('app-pages').classList.contains('on')){
    pushSys(state.other.name+' 在便签上留下了一句话');
  }
  notifySystem(state.other.name+' 写了便签',text.slice(0,40),()=>goHome());
  showToast(state.other.name+' 在便签上写了一句话');
  return true;
}
let noteMood='',_noteEditId='a';
function editNote(id){
  const idx=id==='a'?0:1;
  _noteEditId=id;
  const cur=(state.notes&&state.notes[idx]&&state.notes[idx].text)||'';
  noteMood=(state.notes&&state.notes[idx]&&state.notes[idx].mood)||'';
  const title=id==='a'?'我的便签':state.other.name+'的便签';
  const fromTa=idx===1&&noteIsTa(1);
  const tip=idx===1
    ?(fromTa?'<div style="font-size:11px;color:var(--hint);margin-top:8px">这是 '+esc(state.other.name)+' 写的便签。你改动之后 TA 不会再自动覆盖这一张。</div>'
          :'<div style="font-size:11px;color:var(--hint);margin-top:8px">你写这张便签后，'+esc(state.other.name)+' 不会覆盖它；想换一句可长按便签选「让 TA 重新写」。</div>')
    :'';
  const moods=MOOD_POOL.concat(Array.isArray(state.moodPool)?state.moodPool:[]);
  const moodsHtml='<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:8px">'
    +moods.map(m=>`<span class="mood-chip${m===noteMood?' on':''}" onclick="toggleNoteMood(this,'${esc(m)}')">${esc(m)}</span>`).join('')
    +'<span class="mood-chip add" onclick="addCustomMood()">＋ 新增</span></div>';
  showModal(title,`<textarea class="textarea-full" id="note-input" style="min-height:120px" placeholder="写点什么…">${esc(cur)}</textarea><div style="font-size:11px;color:var(--hint);margin-top:8px">心情（可选，显示在便签名字右侧）：</div>${moodsHtml}${tip}
    <div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button><button class="modal-btn primary" onclick="saveNote('${id}')">保存</button></div>`);
  setTimeout(()=>{const i=document.getElementById('note-input');if(i)i.focus();},80);
}
function toggleNoteMood(el,m){
  if(noteMood===m){noteMood='';document.querySelectorAll('.mood-chip.on').forEach(x=>x.classList.remove('on'));return;}
  noteMood=m;
  document.querySelectorAll('.mood-chip').forEach(x=>x.classList.remove('on'));
  el.classList.add('on');
}
function addCustomMood(){
  appPrompt('新增心情','输入心情（可带符号/表情），如：🌸 赏花',v=>{
    v=(v||'').trim();if(!v)return false;
    state.moodPool=state.moodPool||[];
    if(state.moodPool.indexOf(v)>=0){showToast('已存在，直接点选即可');return true;}
    state.moodPool.push(v);saveKey('moodPool');
    editNote(_noteEditId);return false;
  });
}
function saveNote(id){
  const idx=id==='a'?0:1;
  const v=document.getElementById('note-input')?document.getElementById('note-input').value:'';
  // 用户编辑后 owner 归为 'me'：TA 之后不会再自动覆盖这一张
  state.notes[idx]={id:id,owner:'me',text:v,at:Date.now(),mood:noteMood||''};
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
/* 底部标签栏红点（方案 C）：红点 = 真实未读内容，不叠加「提醒中心」条数
   （提醒中心有自己的入口红点 mom-notif-badge，避免同一件事被计两次） */
async function refreshAllBadges(){
  if(!DB)return;
  const msgs=await dbGetAll('messages');
  const chatUnread=msgs.filter(m=>m.sender==='other'&&!m.read).length + await countUnreadLetters();
  updateTabBadge('chat',chatUnread);
  const moments=await dbGetAll('moments');
  const diary=await dbGetAll('diaries');
  const momUnread=
      moments.filter(m=>m.owner==='other'&&!m.read).length
    + diary.filter(d=>d.owner==='other'&&!d.read).length
    + moments.reduce((s,m)=>s+(m.comments||[]).filter(c=>c.fromTa&&!c.read).length,0);
  updateTabBadge('moments',momUnread);
  updateTabBadge('cards',0);
}
/* 信号强弱（v3.5.9）：带权重随机跳变——信号好（3/4/5 格）概率高、差（1/2 格）概率低，
   且与上一档差值限幅 ≤2（平滑，不跳变），每 2.6~5.2 秒呼吸换一档 */
const SIG_W=[0.08,0.14,0.32,0.26,0.20];  // 权重：1格~5格
function sigNext(prev){
  const total=SIG_W.reduce((a,b)=>a+b,0);
  let r=Math.random()*total,n=1;
  for(let i=0;i<SIG_W.length;i++){r-=SIG_W[i];if(r<=0){n=i+1;break;}}
  if(prev){if(n-prev>2)n=prev+2;else if(prev-n>2)n=prev-2;}
  return n;
}
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
  let prev=0;
  const step=()=>{
    const n=sigNext(prev);prev=n;
    const bars=el.children;
    for(let i=0;i<bars.length;i++){
      bars[i].style.opacity=i<n?1:.25;
      bars[i].style.transform=i<n?'scaleY(1)':'scaleY(.6)';
    }
    const hold=2600+Math.random()*2600;   // 呼吸：2.6~5.2 秒换一档
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
