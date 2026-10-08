/* =========================================================
   星迹 · 状态（心情）编辑 + 状态池管理（v3.5.9）
   状态池：内置 8 种带颜色小点，可新增/删除（字卡式管理）；
   TA 状态按概率自动切换（仿 TA 禁言检测），默认在线。
   ========================================================= */

function statusPool(){return Array.isArray(state.statusPool)&&state.statusPool.length?state.statusPool:STATUS_POOL_DEFAULT;}
function saveStatusPool(){state.statusPool=statusPool();saveKey('statusPool');}
function statusColor(s){const p=statusPool().find(x=>x.s===s);return p?p.c:'';}

/* 状态选择弹窗（我的 / TA 的）+ 池管理入口 */
function editStatus(who_){
  const p=who_==='me'?state.me:state.other;
  const cur=(who_==='other'?(state.taStatus||'在线'):(p.status||'在线'));
  const items=statusPool().map(x=>
    `<div class="modal-item" onclick="closeModal();saveStatus('${who_}','${esc(x.s)}')"><span class="status-dot" style="background:${x.c}"></span>${esc(x.s)}${x.s===cur?' <span style="color:var(--hint)">（当前）</span>':''}</div>`
  ).join('');
  const manage='<div class="modal-item" style="color:var(--hint)" onclick="closeModal();manageStatusPool()">⚙ 管理状态池（新增/删除）</div>';
  showModal(who_==='me'?'我的状态':'TA 的状态',items+manage,'<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button></div>');
}
function saveStatus(who_,s){
  if(who_==='me'){
    state.me.status=s;saveKey('me');
  }else{
    state.other.status=s;
    state.taStatus=s;
    state.taStatusUntil=Date.now()+30*60000;   // 手动设定后 30 分钟不被自动切换覆盖
    saveKey('other');saveKey('taStatusUntil');
  }
  updateHome();renderProfile();updateChatHeader();updateTaStatusBadge();
  showToast('状态已更新');
}
/* 状态池管理：新增 / 删除（至少保留 1 个） */
function manageStatusPool(){
  const items=statusPool().map(x=>
    `<div class="modal-item"><span class="status-dot" style="background:${x.c}"></span><span style="flex:1">${esc(x.s)}</span><span style="color:#c0392b;cursor:pointer;padding:2px 8px" onclick="delPoolStatus('${esc(x.s)}')">删除</span></div>`
  ).join('');
  showModal('管理状态池',items+'<div class="modal-item" onclick="closeModal();addPoolStatus()">＋ 新增状态</div>',
    '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">完成</button></div>');
}
function addPoolStatus(){
  appPrompt('新增状态','输入状态文字，如：冥想中',v=>{
    v=(v||'').trim();if(!v)return false;
    const pool=statusPool();
    if(pool.some(x=>x.s===v)){showToast('状态已存在');return true;}
    pool.push({s:v,c:'#8e8ea0'});state.statusPool=pool;saveStatusPool();
    manageStatusPool();return false;
  });
}
function delPoolStatus(s){
  const pool=statusPool().filter(x=>x.s!==s);
  if(!pool.length){showToast('至少保留一个状态');return;}
  state.statusPool=pool;saveStatusPool();
  manageStatusPool();
}
/* TA 状态自动切换（仿禁言检测）：心跳每 5 秒调用
   默认在线；非在线状态保持 30s~10min 到期回在线；回在线 60s 冷却后，
   每 5 秒 3% 概率（与 TA 禁言我同款）随机切到某个非在线状态 */
function maybeTaStatusChange(){
  if(state.taStatusUntil>Date.now())return;            // 当前状态保持中
  if(state.taStatus&&state.taStatus!=='在线'){           // 到期回在线
    state.taStatus='在线';state.other.status='在线';state.taStatusCoolAt=Date.now();
    saveKey('other');saveKey('taStatusUntil');saveKey('taStatusCoolAt');
    updateTaStatusBadge();return;
  }
  if(Date.now()-(state.taStatusCoolAt||0)<60000)return;
  if(Math.random()<0.03){                                // 仿 TA 禁言概率 3%
    const pool=statusPool().filter(x=>x.s!=='在线');
    if(!pool.length)return;
    const st=pool[Math.floor(Math.random()*pool.length)];
    state.taStatus=st.s;state.other.status=st.s;
    state.taStatusUntil=Date.now()+30000+Math.random()*570000;  // 保持 30s~10min
    saveKey('other');saveKey('taStatusUntil');
    updateTaStatusBadge();
    if(Math.random()<0.4)pushSys(state.other.name+' 现在的状态：'+st.s);   // 低频系统消息
  }
}
/* 聊天界面 TA 名字旁的状态点（点击可改 TA 状态） */
function updateTaStatusBadge(){
  const el=document.getElementById('chat-ta-status');
  if(!el)return;
  const s=state.taStatus||state.other.status||'在线';
  const c=statusColor(s)||'#4cd964';
  el.innerHTML='<span class="ts-dot" style="background:'+c+'"></span>'+esc(s);
  el.onclick=()=>editStatus('other');
}
