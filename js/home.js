/* =========================================================
   星迹 · 桌面：昵称、便签、标签栏、角标、信号
   ========================================================= */

/* ===== HOME ===== */
/* v3.6.7：桌面状态行（颜色小点 + 状态名），可单独刷新（TA 状态自动切换时同步） */
function updateHomeStatusOnly(){
  const m=document.getElementById('home-status-me'),o=document.getElementById('home-status-other');
  if(!m||!o)return;
  const meS=state.me.status||'在线',meC=statusColor(meS)||'#4cd964';
  const taS=state.taStatus||state.other.status||'在线',taC=statusColor(taS)||'#4cd964';
  m.innerHTML='<i style="background:'+meC+'"></i>'+esc(meS);
  o.innerHTML='<i style="background:'+taC+'"></i>'+esc(taS);
}
async function updateHome(){
  document.getElementById('home-name-me').textContent=state.me.name;
  document.getElementById('home-name-other').textContent=state.other.name;
  paintAvatar(document.getElementById('home-avatar-me'),state.me);
  paintAvatar(document.getElementById('home-avatar-other'),state.other);
  updateHomeStatusOnly();
  if(state.meetTime){const d=Math.floor((Date.now()-state.meetTime)/86400000);document.getElementById('home-sign').textContent=`已相伴 ${d} 天`;}
  else{document.getElementById('home-sign').textContent='你在左边 我紧靠右';}
  renderNotes();
  updateTabBadge('chat',0);countUnreadLetters().then(n=>updateTabBadge('chat',n));
  updateTabBar();
  renderHomeTraceWidget();   // v3.7.5：桌面 4×3 心念轨迹组件（当天两条轨迹线）
}
/* ===== 桌面心念轨迹组件（v3.7.5.1）：当天我/TA 活动按各自时间单位 → 折线，带小时刻度 ===== */
async function renderHomeTraceWidget(){
  const g=document.getElementById('tw-lines');if(!g)return;
  try{await dbReady;}catch(e){}
  const d=new Date();
  const start=new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();
  const end=start+86400000;
  const HOURS=24,NB=12;                         // X 轴 0-24 小时，2 小时一格共 12 格（卡片宽度缩到 18:00 位置，右侧留给小蝴蝶）
  const meB=new Array(NB).fill(0),taB=new Array(NB).fill(0);
  const off=taOffsetNow();                      // TA 世界时间偏移（方案 B）
  const msgs=await dbGetAllM('messages',8000).catch(()=>[]);
  msgs.forEach(m=>{
    if(!m.time||m.time<start||m.time>=end)return;
    const h=m.sender==='me'?new Date(m.time).getHours():new Date(m.time+off).getHours();
    const bi=(h/2)|0;
    if(m.sender==='me')meB[bi]++; else if(m.sender==='ta')taB[bi]++;   // TA 按 TA 世界时间归桶
  });
  const evs=await dbGetAll('events').catch(()=>[]);
  evs.forEach(e=>{
    if(!e.time||e.time<start||e.time>=end)return;
    const h=e.who==='me'?new Date(e.time).getHours():new Date(e.time+off).getHours();
    const bi=(h/2)|0;
    if(e.who==='me')meB[bi]++; else if(e.who==='ta')taB[bi]++;
  });
  const el=document.getElementById('tw-date');
  if(el)el.textContent=(d.getMonth()+1)+'月'+d.getDate()+'日';
  const lg=document.getElementById('tw-legend-ta');
  if(lg)lg.textContent=state.other.name||'TA';
  const W=312,H=84,PADL=17,PADR=5,PADT=6,PADB=16;   // 左侧 12px 留给 Y 刻度（0/3/5）
  const iw=W-PADL-PADR,ih=H-PADT-PADB;
  const x=i=>PADL+(i/(NB-1))*iw;
  // Y：活跃密度 0-5 档（每 2h 段节点数相对归一化，封顶 5 档，与信号格 5 格同语言）
  const toLevel=arr=>{
    const max=Math.max(...arr);
    if(max<=0)return arr.map(()=>0);
    return arr.map(v=>v<=0?0:Math.max(1,Math.min(5,Math.round(v/max*5))));
  };
  const meL=toLevel(meB),taL=toLevel(taB);
  const y=l=>PADT+ih-(l/5)*ih;
  let out='';
  // 2 小时一格：细分刻度线（12 格边界）+ 主刻度文字（0/6/12/18/24）
  for(let i=0;i<=NB;i++){
    const px=x(Math.min(i,NB-1)).toFixed(1);
    out+=`<line x1="${px}" y1="${PADT}" x2="${px}" y2="${H-PADB+3}" stroke="var(--hint)" stroke-width="0.6" opacity="${i%3===0?'.55':'.28'}"/>`;
    if(i%3===0)out+=`<text x="${px}" y="${H-2}" text-anchor="${i===0?'start':i===NB?'end':'middle'}" font-size="8.5" fill="var(--hint)" opacity=".8">${i*2}</text>`;
  }
  // Y 网格横线（0 / 3 / 5 档）+ 左侧刻度文字
  for(const lv of [0,3,5]){
    out+=`<line x1="${PADL}" y1="${y(lv).toFixed(1)}" x2="${W-PADR}" y2="${y(lv).toFixed(1)}" stroke="var(--hint)" stroke-width="0.5" opacity="${lv===0?'.22':'.15'}" stroke-dasharray="2 3"/>`;
    out+=`<text x="${PADL-10}" y="${(y(lv)+2.6).toFixed(1)}" text-anchor="end" font-size="8" fill="var(--hint)" opacity=".75">${lv}</text>`;
  }
  const mkLine=(arr,color)=>{
    const pts=arr.map((v,i)=>x(i).toFixed(1)+','+y(v).toFixed(1));
    return `<polyline class="tw-line" points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>`;
  };
  // 红心（心里是我和他首字母）：沿各自折线从原点「电流式」传输到最后一个有值点，到达后持续心跳
  const lastIdx=arr=>{for(let i=arr.length-1;i>=0;i--)if(arr[i]>0)return i;return -1;};
  const subPath=(arr,last)=>{let s='M'+x(0).toFixed(1)+','+y(arr[0]).toFixed(1);for(let i=1;i<=last;i++)s+=' L'+x(i).toFixed(1)+','+y(arr[i]).toFixed(1);return s;};
  const heart=(ch,pathStr)=>`<g class="tw-heart" style="offset-path:path('${pathStr}')"><path d="M0 2.2 C-2.8 -0.6 -5.4 -2.6 -5.4 -5 C-5.4 -6.9 -3.4 -7.8 -1.7 -7.1 C-0.8 -6.7 0 -5.8 0 -5.1 C0 -5.8 0.8 -6.7 1.7 -7.1 C3.4 -7.8 5.4 -6.9 5.4 -5 C5.4 -2.6 2.8 -0.6 0 2.2 Z" fill="#e05c5c" stroke="#fff" stroke-width="0.4"/><text x="0" y="1.4" text-anchor="middle" font-size="3.8" fill="#fff" font-weight="700">${esc(ch)}</text></g>`;
  const total=meB.reduce((a,b)=>a+b,0)+taB.reduce((a,b)=>a+b,0);
  if(total>0){
    out+=mkLine(meL,'#5c8aa9')+mkLine(taL,'#8c7aa9');
    const mi=lastIdx(meL),ti=lastIdx(taL);
    if(mi>=0)out+=heart((state.me.name||'我').slice(0,1),subPath(meL,mi));
    if(ti>=0)out+=heart((state.other.name||'TA').slice(0,1),subPath(taL,ti));
  }
  else out+=`<line x1="${PADL}" y1="${(PADT+ih/2).toFixed(1)}" x2="${W-PADR}" y2="${(PADT+ih/2).toFixed(1)}" stroke="var(--hint)" stroke-width="1" opacity=".35"/>`;
  g.innerHTML=out;
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
      // v3.6.9：两张便签标题都显示保存时间（我的=主动保存，TA的=更新时间+未读红点）
      let badge=head.parentElement.querySelector('.note-head-meta');
      if(!badge){
        badge=document.createElement('span');
        badge.className='note-head-meta';
        head.parentElement.insertBefore(badge,head.nextSibling);
      }
      const unread=i===1&&state.stats.taNoteUnread&&noteIsTa(1);
      badge.textContent=noteTimeLabel(n.at);
      badge.classList.toggle('unread',!!unread);
      badge.style.display=n.at?'':'none';
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
  // v3.6.11：TA 的便签一旦写出来，立即同步进今天日历（便签区+心情）
  if(typeof calUpsertNote==='function')calUpsertNote('ta',state.notes[1],'auto');
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
  const alarm=(state.notes&&state.notes[idx]&&state.notes[idx].alarm)||{};
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
  /* v3.6.9：便签提醒（闹钟式：时间 + 频次） */
  const alarmFreqs=[['','不提醒'],['once','仅一次'],['daily','每天'],['weekly','每周']];
  const alarmHtml='<div style="font-size:11px;color:var(--hint);margin-top:10px">提醒（可选，闹钟式）：</div>'
    +'<div style="display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap">'
    +'<input type="time" id="note-alarm-time" class="textarea-full" style="min-height:0;padding:8px 10px;flex:0 0 92px" value="'+(alarm.time||'')+'">'
    +alarmFreqs.map(f=>`<span class="mood-chip${alarm.freq===f[0]?' on':''}" onclick="toggleNoteAlarmFreq(this,'${f[0]}')">${f[1]}</span>`).join('')
    +'</div><div style="font-size:10.5px;color:var(--hint);margin-top:5px">到点后在浏览器通知里提醒你（需已开启网站通知权限）</div>';
  showModal(title,`<textarea class="textarea-full" id="note-input" style="min-height:120px" placeholder="写点什么…">${esc(cur)}</textarea><div style="font-size:11px;color:var(--hint);margin-top:8px">心情（可选，显示在便签名字右侧）：</div>${moodsHtml}${alarmHtml}${tip}
    <div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button><button class="modal-btn primary" onclick="saveNote('${id}')">保存</button></div>`);
  setTimeout(()=>{const i=document.getElementById('note-input');if(i)i.focus();},80);
}
let _noteAlarmFreq='';
function toggleNoteAlarmFreq(el,f){
  _noteAlarmFreq=f;
  document.querySelectorAll('#note-alarm-time~.mood-chip').forEach(x=>x.classList.remove('on'));
  el.classList.add('on');
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
  // 提醒：时间 + 频次（_noteAlarmFreq 为本次弹窗选择的频次，未动则沿用旧值）
  const tEl=document.getElementById('note-alarm-time');
  const alarmTime=tEl?(tEl.value||''):((state.notes[idx]&&state.notes[idx].alarm&&state.notes[idx].alarm.time)||'');
  const alarmFreq=_noteAlarmFreq||((state.notes[idx]&&state.notes[idx].alarm&&state.notes[idx].alarm.freq)||'');
  _noteAlarmFreq='';
  // 用户编辑后 owner 归为 'me'：TA 之后不会再自动覆盖这一张
  state.notes[idx]={id:id,owner:'me',text:v,at:Date.now(),mood:noteMood||'',alarm:(alarmTime&&alarmFreq)?{time:alarmTime,freq:alarmFreq}:null};
  saveKey('notes');closeModal();updateHome();showToast('便签已保存');
  // v3.6.9：主动保存 → 实时同步进今天的日历（便签区 + 心情），标记「手动」
  if(typeof calUpsertNote==='function'){calUpsertNote(id==='a'?'me':'ta',state.notes[idx],'manual');}
}
/* v3.6.9：便签闹钟——心跳检查（app.js 每 20 秒调用） */
function maybeNoteAlarm(){
  const notes=state.notes||[];
  const now=new Date();
  const hm=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
  const dateKey=now.getFullYear()+'-'+(now.getMonth()+1)+'-'+now.getDate();
  notes.forEach((n,idx)=>{
    const a=n&&n.alarm;
    if(!a||!a.time||!a.freq)return;
    if(a.time!==hm)return;
    const done=state.noteAlarmDone||{};
    let key;
    if(a.freq==='once')key='1_'+idx+'_'+dateKey+'_'+a.time;
    else if(a.freq==='daily')key='d_'+idx+'_'+dateKey+'_'+a.time;
    else{
      const wk=Math.ceil(now.getDate()/7);
      key='w_'+idx+'_'+now.getFullYear()+'-W'+wk+'-'+now.getDay()+'_'+a.time;
    }
    if(done[key])return;
    state.noteAlarmDone=done;done[key]=1;saveKey('noteAlarmDone');
    const title=idx===0?'我的便签提醒':(state.other.name||'TA')+'的便签提醒';
    showToast('⏰ '+title);
    if(typeof pushSys==='function')pushSys('⏰ '+title+'：'+((n.text||'').slice(0,40)||'到了看便签的时间'));
    if(typeof notifySystem==='function')notifySystem(title,(n.text||'').slice(0,40),()=>goHome());
  });
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
/* 信号强弱（v3.6.0）：连接频率的镜子——目标档位由"距最后一条互动的时长"决定：
   刚互动 → 4~5 格（频率高）；长时间静默 → 缓慢降到 1~2 格（频率低）。
   当前档位向目标缓慢移动（一格一格走，天然平滑），停靠目标时叠加轻微呼吸。
   由主心跳每秒驱动，不再自持定时器。 */
let _sigLevel=3;
let _lastInteractAt=Date.now();
function touchInteract(){_lastInteractAt=Date.now();}
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
  const age=(Date.now()-_lastInteractAt)/60000;   // 距最后互动：分钟
  let target=age<10?4.5:age<60?3.5:age<180?2.5:1.5;
  target+=Math.random()*0.9;                      // 目标档位轻微浮动
  target=Math.max(1,Math.min(5,Math.round(target)));
  if(_sigLevel<target)_sigLevel++;
  else if(_sigLevel>target)_sigLevel--;
  else if(Math.random()<0.3)_sigLevel+=Math.random()<0.5?1:-1;   // 停靠目标时小呼吸
  _sigLevel=Math.max(1,Math.min(5,_sigLevel));
  const bars=el.children;
  for(let i=0;i<bars.length;i++){
    // v3.7.5：黑白极简渐变——点亮格由浅灰(72%)逐格加深到墨黑(20%)，空格淡灰 90%，强度一目了然
    const on=i<_sigLevel;
    bars[i].style.background=on?'hsl(0,0%,'+(72-13*i)+'%)':'hsl(0,0%,90%)';
    bars[i].style.opacity=on?1:.9;
    bars[i].style.transform=on?'scaleY(1)':'scaleY(.6)';
  }
}
function paintTabIcons(){
  document.querySelectorAll('.tab-ico[data-ico]').forEach(el=>{
    const k=el.dataset.ico;
    if(LINE_ICONS[k]&&!el.firstChild)el.innerHTML=LINE_ICONS[k];
  });
}
