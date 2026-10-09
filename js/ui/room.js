/* =========================================================
   星迹 · 感应房间：家具 / 布局 / 预设 / 感应 TA
   ========================================================= */

let roomState={preset:'房间',cols:6,rows:4,grid:Array(24).fill(null),taPos:-1};
let roomPresets={'房间':{cols:6,rows:4,grid:Array(24).fill(null)}};
let roomPickerOpen=false,dragFromIdx=-1;
let _sensing=false,_senseTimer=null;   // v3.5.9：感应中标志（防连点 + 延迟显示）

function initRoom(){
  // 感应页：布局系统。默认 4 行 × 6 列、格子里没有任何字（方案：房间只是默认首个布局，内容由用户放置）
  roomState.cols=6;roomState.rows=4;roomState.grid=Array(24).fill(null);roomState.taPos=-1;roomState.preset='房间';
  const saved=localStorage.getItem('xingji-room');
  if(saved){
    try{const d=JSON.parse(saved);roomPresets=Object.assign(roomPresets,d.presets||{});roomState.preset=d.preset||'房间';}catch(e){}
    const p=roomPresets[roomState.preset]||roomPresets['房间'];
    roomState.cols=p.cols||6;roomState.rows=p.rows||4;
    roomState.grid=(p.grid&&p.grid.length>=p.cols*p.rows)?p.grid.slice(0,p.cols*p.rows):Array(p.cols*p.rows).fill(null);
  }else{
    saveRoom();   // 首次：建立空布局结构
  }
  renderRoom();
}
function showLayoutMenu(){
  const names=Object.keys(roomPresets);
  const rows=names.map(n=>`<div class="modal-item" onclick="loadLayout('${esc(n)}')">${esc(n)}${n===roomState.preset?' <span style="color:var(--hint)">（当前）</span>':''}</div>`).join('');
  showModal('布局',`<div style="font-size:11px;color:var(--hint);padding:0 2px 6px">房间只是默认布局，可新增/切换/保存/删除</div>${rows}
    <div class="modal-item" onclick="closeModal();newLayout()">＋ 新增布局</div>
    <div class="modal-item" onclick="closeModal();saveRoom();showToast('已保存当前布局')">保存当前布局</div>
    <div class="modal-item" style="color:#c0392b" onclick="closeModal();delLayoutMenu()">删除布局…</div>`,
    '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button></div>');
}
function loadLayout(name){
  const p=roomPresets[name];if(!p)return;
  roomState.preset=name;roomState.cols=p.cols||6;roomState.rows=p.rows||4;
  roomState.grid=(p.grid&&p.grid.length>=p.cols*p.rows)?p.grid.slice(0,p.cols*p.rows):Array(p.cols*p.rows).fill(null);
  if(roomState.taPos>=roomState.grid.length)roomState.taPos=-1;
  saveRoom();renderRoom();showToast('已切换到「'+name+'」');
}
function newLayout(){
  appPrompt('新增布局','布局名称',n=>{
    const v=(n||'').trim();
    if(!v)return false;
    if(roomPresets[v]){showToast('同名布局已存在');return true;}
    roomPresets[v]={cols:roomState.cols,rows:roomState.rows,grid:[...roomState.grid]};
    roomState.preset=v;saveRoom();renderRoom();showToast('已创建布局「'+v+'」');
    return false;
  });
}
function delLayoutMenu(){
  const names=Object.keys(roomPresets).filter(n=>n!=='房间');
  if(!names.length){showToast('只有默认「房间」布局，不能删除');return;}
  showModal('删除布局',names.map(n=>`<div class="modal-item" onclick="closeModal();confirmDelLayout('${esc(n)}')">${esc(n)}</div>`).join(''),
    '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button></div>');
}
function confirmDelLayout(name){
  showModal('删除布局「'+name+'」？','<div style="padding:6px 2px 4px;font-size:13px;color:var(--sub)">删除后该布局的家具摆放不可恢复。</div>',
    '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button><button class="modal-btn primary" style="color:#fff;background:#c0392b" onclick="doDelLayout(\''+name+'\')">确认删除</button></div>');
}
function doDelLayout(name){
  if(!roomPresets[name])return;
  delete roomPresets[name];
  if(roomState.preset===name){roomState.preset='房间';const p=roomPresets['房间'];roomState.cols=p.cols;roomState.rows=p.rows;roomState.grid=[...p.grid];}
  saveRoom();closeModal();renderRoom();showToast('布局已删除');
}
function roomDims(){return{cols:roomState.cols,rows:roomState.rows,total:roomState.cols*roomState.rows};}
function saveRoom(){
  roomPresets[roomState.preset]={cols:roomState.cols,rows:roomState.rows,grid:[...roomState.grid]};
  localStorage.setItem('xingji-room',JSON.stringify({presets:roomPresets,preset:roomState.preset}));
}
function roomResize(delta,type){
  const old=roomDims();
  let cols=roomState.cols,rows=roomState.rows;
  if(type==='cols')cols=Math.max(2,Math.min(12,cols+delta));
  else rows=Math.max(2,Math.min(20,rows+delta));
  if(cols===roomState.cols&&rows===roomState.rows){showToast('已达边界');return;}
  const ng=Array(cols*rows).fill(null);
  for(let r=0;r<Math.min(rows,roomState.rows);r++)for(let c=0;c<Math.min(cols,roomState.cols);c++)ng[r*cols+c]=roomState.grid[r*old.cols+c];
  roomState.cols=cols;roomState.rows=rows;roomState.grid=ng;
  if(roomState.taPos>=ng.length)roomState.taPos=-1;
  saveRoom();renderRoom();showToast(type==='cols'?`列数调整为 ${cols}`:`行数调整为 ${rows}`);
}
function renderRoom(){
  const grid=document.getElementById('room-grid');if(!grid)return;
  let placed=false;
  grid.style.gridTemplateColumns=`repeat(${roomState.cols},1fr)`;
  grid.innerHTML='';
  roomState.grid.forEach((item,i)=>{
    const cell=document.createElement('div');
    cell.className='room-cell'+(item?' has-item':'')+(i===roomState.taPos?' ta-active':'');
    cell.textContent=item||'';
    if(i===roomState.taPos){const badge=document.createElement('span');badge.className='ta-badge';badge.textContent='TA';cell.appendChild(badge);}
    cell.onclick=()=>onRoomCellClick(i);
    cell.draggable=!!item;
    cell.ondragstart=e=>{dragFromIdx=i;e.dataTransfer.effectAllowed='move';cell.classList.add('dragging');};
    cell.ondragend=()=>{cell.classList.remove('dragging');document.querySelectorAll('#room-grid .room-cell').forEach(c=>c.classList.remove('drag-over'));};
    cell.ondragover=e=>{if(dragFromIdx>=0&&dragFromIdx!==i){e.preventDefault();cell.classList.add('drag-over');}};
    cell.ondragleave=()=>cell.classList.remove('drag-over');
    cell.ondrop=e=>{e.preventDefault();if(dragFromIdx<0||dragFromIdx===i)return;
      const from=roomState.grid[dragFromIdx];roomState.grid[dragFromIdx]=roomState.grid[i];roomState.grid[i]=from;
      if(roomState.taPos===dragFromIdx)roomState.taPos=i;else if(roomState.taPos===i)roomState.taPos=dragFromIdx;
      dragFromIdx=-1;saveRoom();renderRoom();showToast('已移动');};
    grid.appendChild(cell);
  });
  document.getElementById('room-title').textContent=roomState.preset;
  document.getElementById('room-info-title').textContent=roomState.preset;
  document.getElementById('room-rows-n').textContent=roomState.rows;
  document.getElementById('room-cols-n').textContent=roomState.cols;
  if((placed||roomState.taPos>=0)&&!_sensing){
    const item=roomState.grid[roomState.taPos];
    const actions=ROOM_ACTIONS[item]||['正静静地在这里'];
    const action=actions[Math.floor(Math.random()*actions.length)];
    document.getElementById('room-info-sub').textContent=`TA ${action}`;
  }
}
function onRoomCellClick(i){
  if(roomPickerOpen)return;
  const item=roomState.grid[i];
  if(!item){pendingRoomCell=i;showRoomPickerAt(i);return;}
  roomState.taPos=i;
  const actions=ROOM_ACTIONS[item]||['正静静地在这里'];
  const action=actions[Math.floor(Math.random()*actions.length)];
  document.getElementById('room-info-sub').textContent=`TA ${action}`;
  showRoomEdit(i,item);
  renderRoom();
}
let pendingRoomCell=-1;
function showRoomPickerAt(i){pendingRoomCell=i;showRoomPicker();}
function showRoomPicker(){
  if(roomPickerOpen)return;roomPickerOpen=true;
  showModal('添加内容','<div class="room-picker" id="room-picker"></div>');
  const picker=document.getElementById('room-picker');
  FURNITURE_ITEMS.forEach(item=>{
    const div=document.createElement('div');div.className='room-picker-item';div.textContent=item;
    div.onclick=()=>{placeFurniture(item);};
    picker.appendChild(div);
  });
  const custom=document.createElement('div');custom.className='room-picker-item';custom.textContent='✏️ 文字';
  custom.onclick=()=>{
    const mbody=document.getElementById('modal-body');
    mbody.innerHTML='<input class="app-input" id="room-text-input" placeholder="输入2-6个字，如：时光" maxlength="8">'
      +'<button class="modal-confirm" onclick="confirmRoomText()">放入房间</button>';
  };
  picker.appendChild(custom);
}
function confirmRoomText(){
  const val=(document.getElementById('room-text-input').value||'').trim();
  if(!val){showToast('请输入文字');return;}
  placeFurniture(val.slice(0,8));
}
function placeFurniture(item){
  if(pendingRoomCell>=0&&roomState.grid[pendingRoomCell]===null){
    roomState.grid[pendingRoomCell]=item;pendingRoomCell=-1;
  }else{
    pendingRoomCell=-1;
    const emptyIdx=roomState.grid.findIndex(x=>x===null);
    if(emptyIdx===-1){showToast('房间已满，请先移除或增加行列');return;}
    roomState.grid[emptyIdx]=item;
  }
  saveRoom();renderRoom();closeModal();showToast(`已放置「${item}」`);
}
function showRoomEdit(i,item){
  showModal('编辑格子',`<div style="text-align:center;padding:6px 0 14px;font-size:28px;letter-spacing:2px">${esc(item)}</div>`
    +'<div class="modal-item" onclick="editCellText()">✏️ 修改文字</div>'
    +'<div class="modal-item" onclick="clearCell()">🗑 清空此格</div>');
  pendingRoomCell=i;
}
function editCellText(){
  if(pendingRoomCell<0)return;
  appPrompt('修改文字（2-8字）',roomState.grid[pendingRoomCell]||'',t=>{
    const v=(t||'').trim();if(!v){closeModal();return false;}
    roomState.grid[pendingRoomCell]=v.slice(0,8);pendingRoomCell=-1;saveRoom();renderRoom();closeModal();showToast('已修改');
  });
}
function clearCell(){
  if(pendingRoomCell<0)return;
  roomState.grid[pendingRoomCell]=null;
  if(roomState.taPos===pendingRoomCell)roomState.taPos=-1;
  pendingRoomCell=-1;saveRoom();renderRoom();closeModal();showToast('已清空');
}
function switchRoomPreset(){
  const names=Object.keys(roomPresets);
  if(names.length<=1){showToast('只有一个预设');return;}
  let idx=names.indexOf(roomState.preset);idx=(idx+1)%names.length;
  roomState.preset=names[idx];roomState.grid=[...roomPresets[names[idx]].grid];roomState.cols=roomPresets[names[idx]].cols||6;roomState.rows=roomPresets[names[idx]].rows||4;roomState.taPos=-1;
  saveRoom();renderRoom();showToast(`已切换到：${roomState.preset}`);
}
function saveRoomPreset(){
  appPrompt('预设名称',roomState.preset+' 副本',name=>{
    name=(name||'').trim();if(!name){showToast('请输入名称');return false;}
    roomPresets[name]={cols:roomState.cols,rows:roomState.rows,grid:[...roomState.grid]};roomState.preset=name;saveRoom();renderRoom();showToast('已保存新预设');
  });
}
function renameRoomPreset(){
  appPrompt('新名称',roomState.preset,name=>{
    name=(name||'').trim();if(!name){showToast('请输入名称');return false;}
    if(name===roomState.preset)return;
    if(roomPresets[name]){showToast('名称已存在');return false;}
    const old=roomState.preset;roomPresets[name]=roomPresets[old];delete roomPresets[old];roomState.preset=name;saveRoom();renderRoom();showToast('已重命名');
  });
}
function deleteRoomPreset(){
  if(Object.keys(roomPresets).length<=1){showToast('至少保留一个预设');return;}
  appConfirm('删除预设',`确定删除预设"${roomState.preset}"？`,()=>{
    delete roomPresets[roomState.preset];const first=Object.keys(roomPresets)[0];roomState.preset=first;roomState.grid=[...roomPresets[first].grid];roomState.cols=roomPresets[first].cols||6;roomState.rows=roomPresets[first].rows||4;roomState.taPos=-1;saveRoom();renderRoom();showToast('已删除');
  });
}
function doSense(){initRoom();}
/* v3.6.8：方位加权——按 TA 当前状态从 SENSE_DIR_WEIGHTS 挑候选，否则全池随机 */
function pickSenseDir(){
  const st=state.taStatus||state.other.status||'在线';
  const fav=SENSE_DIR_WEIGHTS[st]||[];
  let pool;
  if(fav.length&&Math.random()<0.7)pool=fav.map(d=>SENSE_DIRS.find(x=>x.dir===d)).filter(Boolean);
  else pool=[...SENSE_DIRS];
  return pool[Math.floor(Math.random()*pool.length)];
}
/* 记录一次感应事件（供心念轨迹 / TA 记得） */
async function pushSenseEvent(who,dir,text){
  await dbPut('events',{who,type:'sense',dir,text,time:Date.now()});
}
/* v3.5.9：感应 TA——点击后「正在感应…」，10~15 秒延迟才出结果（防连点/防瞬变）
   v3.6.8：结果带方位（状态加权）+ 记录事件 + 系统消息 */
function senseTA(){
  if(_sensing){showToast('正在感应中，稍等一下…');return;}
  _sensing=true;
  const sub=document.getElementById('room-info-sub');
  if(sub)sub.textContent='正在感应…';
  const delay=10000+Math.random()*5000;   // 10~15 秒
  _senseTimer=setTimeout(()=>{
    _sensing=false;_senseTimer=null;
    const idx=Math.floor(Math.random()*24);
    roomState.taPos=idx;
    const item=roomState.grid[idx];
    const actions=item?ROOM_ACTIONS[item]:['在房间的某个角落','正在房间里走动','好像刚进房间','在房间发呆','在房间的窗边站着'];
    const action=actions[Math.floor(Math.random()*actions.length)];
    const dir=pickSenseDir();
    const text='TA 从'+dir.dir+'靠近，'+action;
    document.getElementById('room-info-sub').textContent=text;
    saveRoom();renderRoom();showToast('感应完成');
    pushSenseEvent('ta',dir.dir,text);
    pushSys(text);
  },delay);
}
/* v3.6.8：TA 主动感应你——心跳每 5 秒调用；冷却 20~40 分钟；触发时全局通知 + 站内横幅 + 聊天记录 */
function maybeTaSense(){
  if(Date.now()<(state.taSenseCoolAt||0))return;
  if(Math.random()>0.008)return;             // 每 5 秒 0.8% 机会；配合冷却实际约 20~40 分钟一次
  state.taSenseCoolAt=Date.now()+1200000+Math.random()*1200000;   // 冷却 20~40 分钟
  saveKey('taSenseCoolAt');
  const dir=pickSenseDir();
  const text=dir.text;
  pushSenseEvent('ta',dir.dir,text);
  pushSys(text);
  notifySystem((state.other.name||'TA')+' 感应到你',text);
  if(Math.random()<0.5)pushReply('感应到你在附近，就来看看你。');
}
function saveRoomLayout(){saveRoom();showToast('布局已保存');}
