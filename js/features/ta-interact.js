/* =========================================================
   星迹 · TA 互动（4.2）
   —— TA 偶尔主动「问一句 / 好奇一下 / 出个选择 / 打个卡 / 邀你 / 吐槽一句」，
      内容全部走字卡式（内置 + 可新增），语气克制、不说教。
   —— 六类：ask 提问 / curious 好奇 / choose 选择 / checkin 打卡 / invite 邀请 / tease 吐槽
   —— 数据：state.taInteract = { ask:[…], curious:[…], … }
   —— 触发：心跳低概率（默认 12%/轮，冷却 40~120 分钟），每轮最多一种。
   ========================================================= */

const TA_INTERACT_DEFAULT={
  ask:['你最近睡得好吗？','今天有没有好好吃饭？','有没有什么话想问我？','你那边下雨了吗？'],
  curious:['我有点好奇，你现在在做什么。','想知道你今天心情怎么样。','我在想，你现在是不是又在熬夜。'],
  choose:['陪我选一个：茶，还是咖啡？','如果你现在能去一个地方，会去哪？','今晚早点睡，还是再聊一会儿？'],
  checkin:['今天有记得喝水吗？','提醒你一下，起来动一动。','该吃晚饭了，别拖太晚。'],
  invite:['想不想一起听首歌？','要一起安安静静待一会儿吗？','今晚一起看个电影？'],
  tease:['你今天好像又没回我。','说好早睡的，又没做到。','你把我晾在这儿了。']
};
const TA_INTERACT_META={
  ask:{label:'TA 提问',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21a9 9 0 1 0-9-9c0 1.5.4 2.9 1 4.2L3 21l4.8-1A9 9 0 0 0 12 21Z"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.2c-.7.4-1 1-1 1.8"/><circle cx="12" cy="16.4" r=".6" fill="currentColor" stroke="none"/></svg>'},
  curious:{label:'TA 好奇',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.6"/><circle cx="9.5" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="14.5" cy="10" r="1" fill="currentColor" stroke="none"/><path d="M9 15c.8.8 1.8 1.2 3 1.2s2.2-.4 3-1.2"/></svg>'},
  choose:{label:'TA 让你选',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6l8 0M8 12l8 0M8 18l5 0"/><circle cx="5" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="5" cy="18" r="1" fill="currentColor" stroke="none"/></svg>'},
  checkin:{label:'TA 打卡',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/><circle cx="12" cy="12" r="8.6"/></svg>'},
  invite:{label:'TA 邀请',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.4-5.8"/><path d="M20 4v4h-4"/></svg>'},
  tease:{label:'TA 吐槽',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.6"/><path d="M9 10h.01M15 10h.01"/><path d="M9 15h6"/></svg>'}
};

function taInteract(){
  if(!state.taInteract||typeof state.taInteract!=='object')state.taInteract={};
  Object.keys(TA_INTERACT_DEFAULT).forEach(k=>{
    if(!Array.isArray(state.taInteract[k])||!state.taInteract[k].length)state.taInteract[k]=TA_INTERACT_DEFAULT[k].slice();
  });
  return state.taInteract;
}
function taInteractEnabled(){ return (state.stats.taInteractEnabled===undefined)?true:!!state.stats.taInteractEnabled; }

/* 心跳：低概率随机一种互动，产出一条「TA 主动」的消息进聊天/通知 */
async function maybeTaInteract(){
  if(!taInteractEnabled())return false;
  const last=Number(state.stats.taInteractLastAt)||0;
  const gap=(40+Math.random()*80)*60000;   // 40~120 分钟冷却
  if(Date.now()-last<gap)return false;
  if(typeof taOutputBlocked==='function'&&taOutputBlocked())return false;
  if(Math.random()*100>=12)return false;   // 12% 概率
  const pool=taInteract();
  const kinds=Object.keys(TA_INTERACT_META).filter(k=>pool[k]&&pool[k].length);
  if(!kinds.length)return false;
  const kind=kinds[Math.floor(Math.random()*kinds.length)];
  const lines=pool[kind];
  const text=lines[Math.floor(Math.random()*lines.length)];
  state.stats.taInteractLastAt=Date.now();
  saveKey('stats');
  const meta=TA_INTERACT_META[kind];
  /* 以一条 TA 的消息进聊天（proactive 主动），并进通知中心 */
  const msg={sender:'other',type:'text',content:text,time:Date.now(),read:false,proactive:true,interact:kind,cardIds:[]};
  try{msg.id=await dbPut('messages',msg);}catch(_){}
  if(typeof appendMsgRow==='function'&&state.currentApp==='chat')appendMsgRow(msg,true);
  if(typeof pushNotif==='function')pushNotif({type:'interact',from:state.other.name,text:meta.label+'：'+text.slice(0,16),interact:kind});
  if(typeof notifySystem==='function')notifySystem(meta.label,text.slice(0,50),()=>{if(state.currentApp!=='chat')switchTab('chat');},'interact');
  refreshAllBadges();
  return true;
}

/* 设置页：开关 + 六类各自的「内置 + 新增 + 删除」 */
function openTaInteractSettings(){
  const pool=taInteract();
  const rows=Object.keys(TA_INTERACT_META).map(k=>{
    const meta=TA_INTERACT_META[k];
    const list=pool[k]||[];
    return `<div class="modal-item" onclick="manageTaInteract('${k}')"><span class="cs-ico">${meta.icon}</span><span style="flex:1">${meta.label}</span><span class="cs-val" style="font-size:11px;color:var(--hint)">${list.length} 条</span><span class="cs-arrow">&#8250;</span></div>`;
  }).join('');
  showModal('TA 的主动互动',
    `<div style="padding:4px 2px 12px;font-size:12px;color:var(--hint);line-height:1.7">TA 偶尔会主动来问一句、好奇一下、邀你。全部走字卡式，可以关掉，也可以改每条内容。</div>`
    +`<div class="modal-item" onclick="toggleTaInteract()"><span class="cs-ico">${TA_INTERACT_META.checkin.icon}</span><span style="flex:1">开启主动互动</span><span class="cs-switch${taInteractEnabled()?' on':''}" onclick="event.stopPropagation();toggleTaInteract()"></span></div>`
    +rows,
    '<div class="modal-btn-row single"><button class="modal-btn" onclick="closeModal()">关闭</button></div>');
}
function toggleTaInteract(){
  state.stats.taInteractEnabled=taInteractEnabled()?0:1;
  saveKey('stats');showToast(taInteractEnabled()?'已开启':'已关闭');openTaInteractSettings();
}
let _tiKind='ask';
function manageTaInteract(kind){
  _tiKind=kind;
  const pool=taInteract();
  const list=pool[kind]||[];
  const meta=TA_INTERACT_META[kind];
  showModal(meta.label,
    `<div style="font-size:11px;color:var(--hint);margin-bottom:8px">TA 说这类话的备选，回复时随机抽一条。可增删。</div>`
    +(list.length?list.map((t,i)=>`<div style="display:flex;align-items:center;gap:8px;padding:9px 4px;border-bottom:1px solid var(--input)"><span style="flex:1;font-size:13px;color:var(--text)">${esc(t)}</span><span style="cursor:pointer;padding:4px;display:inline-flex" onclick="editTaInteract(${i})">${ICO_EDIT}</span><span style="cursor:pointer;padding:4px;color:var(--danger);display:inline-flex" onclick="delTaInteract(${i})">${ICO_X}</span></div>`).join(''):'<div class="empty" style="padding:20px 0">这一类还没有内容</div>')
    +`<button class="btn-pill ghost" style="width:100%;margin-top:12px" onclick="addTaInteract()">＋ 新增一句</button>`,
    '<div class="modal-btn-row single"><button class="modal-btn" onclick="closeModal()">返回</button></div>');
}
function addTaInteract(){
  askText('新增一句','','TA 会怎么说',(v)=>{
    const t=(v||'').trim();if(!t)return;
    const pool=taInteract();
    if(pool[_tiKind].includes(t)){showToast('已经有这句了');return;}
    pool[_tiKind].push(t);saveKey('taInteract');manageTaInteract(_tiKind);
  });
}
function editTaInteract(i){
  const pool=taInteract();
  askText('修改这句',pool[_tiKind][i],'',(v)=>{
    const t=(v||'').trim();if(!t)return;
    if(pool[_tiKind].some((x,j)=>j!==i&&x===t)){showToast('已经有这句了');return;}
    pool[_tiKind][i]=t;saveKey('taInteract');manageTaInteract(_tiKind);
  });
}
function delTaInteract(i){
  const pool=taInteract();
  pool[_tiKind].splice(i,1);saveKey('taInteract');manageTaInteract(_tiKind);
}

window.maybeTaInteract=maybeTaInteract;
window.openTaInteractSettings=openTaInteractSettings;
window.toggleTaInteract=toggleTaInteract;
window.manageTaInteract=manageTaInteract;
window.addTaInteract=addTaInteract;
window.editTaInteract=editTaInteract;
window.delTaInteract=delTaInteract;
