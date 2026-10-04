/* =========================================================
   星迹 · 陪伴模式计时与场景管理
   ========================================================= */

let companionTimer=null;
function allCompanionScenes(){
  return COMPANION_SCENES.concat(state.stats.customCompanion||[]);
}
let companionSession=null,companionTick=null;
function renderCompanion(){
  const body=document.getElementById('companion-body');body.innerHTML='';
  if(companionSession){renderCompanionTiming(body);return;}
  const extra=(state.stats.companionStart)?(Date.now()-state.stats.companionStart):0;
  body.innerHTML+=`<div class="companion-status">&#9889; 1 台设备已连接 · 已陪伴 ${fmtDuration((state.stats.companionTime||0)+extra)} · 连续 ${state.stats.companionStreak} 天</div>`;
  body.innerHTML+='<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px">';
  allCompanionScenes().forEach(sn=>{
    body.innerHTML+=`<div class="list-card" style="margin:0;display:flex;flex-direction:column;align-items:center;gap:8px;padding:18px 10px;text-align:center;cursor:pointer" onclick="enterCompanion('${sn.id}')"><div style="font-size:36px">${sn.icon}</div><div class="list-card-title">${esc(sn.name)}</div><div class="list-card-sub">${esc(sn.desc||'')}</div></div>`;
  });
  body.innerHTML+='</div>';
  body.innerHTML+=`<button class="btn-pill ghost" style="width:100%;margin-top:14px" onclick="addCompanionScene()">＋ 新增陪伴模式</button>`;
}
function renderCompanionTiming(body){
  const sc=allCompanionScenes().find(x=>x.id===companionSession.scene)||{name:'陪伴'};
  const remain=Math.max(0,companionSession.endAt-Date.now());
  const mm=String(Math.floor(remain/60000)).padStart(2,'0'),ss=String(Math.floor(remain%60000/1000)).padStart(2,'0');
  const act=sc.name.replace('一起','')||'陪伴';
  body.innerHTML=`
    <div class="cp-timing">
      <div class="cp-conn">&#9889; 1 台设备已连接</div>
      <div class="cp-ring"><div class="cp-ring-num" id="cp-ring-num">${mm}:${ss}</div><div class="cp-ring-tag">${esc(act)}</div></div>
      <div class="cp-slogan">正在一起${esc(act)} · 加油</div>
      <div style="display:flex;justify-content:center;gap:26px;margin-top:24px;font-size:20px">
        <span class="cp-quick" onclick="openApp('chat')">&#128172;<div style="font-size:11px;color:var(--hint)">聊天</div></span>
        <span class="cp-quick" onclick="endCompanion()">&#10006;<div style="font-size:11px;color:var(--hint)">结束</div></span>
      </div>
    </div>`;
}
function startCompanion(sc,minutes){
  companionSession={scene:sc.id,endAt:Date.now()+minutes*60000,total:minutes*60000};
  state.me.status=sc.name;saveKey('me');
  if(!state.stats.companionStart)state.stats.companionStart=Date.now();saveKey('stats');
  pushSys(`你和 ${state.other.name} 开始了「${sc.name}」，共 ${minutes} 分钟`);
  renderCompanion();
  if(companionTick)clearInterval(companionTick);
  companionTick=setInterval(()=>{
    if(!companionSession)return;
    if(Date.now()>=companionSession.endAt){
      clearInterval(companionTick);companionTick=null;
      companionSession=null;renderCompanion();
      pushSys('陪伴时间到，这次陪得刚刚好');
      setTimeout(()=>pushReply('陪你到时间刚好，下次继续。'),2500);
      showToast('本次陪伴结束');
      return;
    }
    const num=document.getElementById('cp-ring-num');
    if(num){
      const remain=companionSession.endAt-Date.now();
      num.textContent=String(Math.floor(remain/60000)).padStart(2,'0')+':'+String(Math.floor(remain%60000/1000)).padStart(2,'0');
    }
  },1000);
}
function endCompanion(){
  if(companionTick)clearInterval(companionTick);companionTick=null;
  companionSession=null;renderCompanion();showToast('已结束陪伴');
}
function enterCompanion(id){
  const sc=allCompanionScenes().find(x=>x.id===id);if(!sc)return;
  const act=sc.name.replace('一起','');
  showModal(sc.icon+' '+sc.name,'<div style="text-align:center;font-size:13px;color:var(--sub);padding-bottom:10px">这次陪你多久？</div><div class="cp-dur-grid" id="cp-dur-grid"></div>');
  const g=document.getElementById('cp-dur-grid');
  [5,10,15,20,25,30].forEach(m=>{
    const d=document.createElement('div');d.className='cp-dur';d.innerHTML='<b>'+m+'</b><span>分钟</span>';
    d.onclick=()=>{closeModal();startCompanion(sc,m);};
    g.appendChild(d);
  });
}
function openCompanionManage(){
  const list=state.stats.customCompanion||[];
  showModal('陪伴模式管理',list.map((sc,i)=>`<div style="display:flex;align-items:center;gap:8px;padding:12px 4px;border-bottom:1px solid var(--input)"><span style="font-size:22px">${sc.icon}</span><div style="flex:1"><div style="font-size:15px;font-weight:600">${esc(sc.name)}</div><div style="font-size:12px;color:var(--sub)">${esc(sc.desc||'')}</div></div><span style="cursor:pointer;padding:4px" onclick="closeModal();editCompanionScene(${i})">&#9998;</span><span style="cursor:pointer;padding:4px;color:#c0392b" onclick="closeModal();delCompanionScene(${i})">&#10005;</span></div>`).join('')
    +(list.length?'':'<div class="empty" style="padding:14px 4px">还没有自定义模式</div>'));
}
function addCompanionScene(){
  showModal('新增陪伴模式',`<input class="app-input" id="cp-name" placeholder="模式名称" style="width:100%;margin-bottom:10px"><textarea class="textarea-full" id="cp-desc" placeholder="说明（可选）" style="min-height:60px"></textarea><button class="btn-pill primary" style="width:100%" onclick="saveCompanionScene(-1)">保存</button>`);
}
function editCompanionScene(i){
  const sc=(state.stats.customCompanion||[])[i];if(!sc)return;
  showModal('编辑陪伴模式',`<input class="app-input" id="cp-name" value="${esc(sc.name)}" style="width:100%;margin-bottom:10px"><textarea class="textarea-full" id="cp-desc" placeholder="说明（可选）" style="min-height:60px">${esc(sc.desc||'')}</textarea><button class="btn-pill primary" style="width:100%" onclick="saveCompanionScene(${i})">保存</button>`);
}
function saveCompanionScene(i){
  const name=(document.getElementById('cp-name').value||'').trim();if(!name){showToast('请输入名称');return;}
  const desc=(document.getElementById('cp-desc').value||'').trim();
  const list=state.stats.customCompanion||[];
  if(i<0){list.push({id:'c'+Date.now(),name,icon:'&#10024;',desc});}
  else{list[i].name=name;list[i].desc=desc;}
  state.stats.customCompanion=list;saveKey('stats');closeModal();renderCompanion();showToast(i<0?'已新增陪伴模式':'已保存');
}
function delCompanionScene(i){
  const list=state.stats.customCompanion||[];list.splice(i,1);
  state.stats.customCompanion=list;saveKey('stats');renderCompanion();showToast('已删除');
}
