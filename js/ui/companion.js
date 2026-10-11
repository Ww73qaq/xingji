/* =========================================================
   星迹 · 陪伴模式计时与场景管理
   ========================================================= */

let companionTimer=null;
function allCompanionScenes(){
  return COMPANION_SCENES.concat(state.stats.customCompanion||[]);
}
/* v3.7.0：场景与控件 emoji 一律改线性 SVG（fill:none;stroke）。
   复用 config ICO.*（按目标尺寸缩放）；运动/睡觉/吃饭/摸鱼 config 无对应图标，
   本地内联描边路径。 */
function _cpSvg(inner,size,sw){
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw||1.6}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}
function _cpScale(icoStr,size){return icoStr.replace('width="17" height="17"',`width="${size}" height="${size}"`);}
function CP_BOLT(size){return _cpSvg('<path d="M13 2L4 14h6l-1 8 9-12h-6l1-8Z"/>',size,1.8);}
function CP_CLOSE(size){return _cpSvg('<path d="M6 6l12 12M18 6L6 18"/>',size,1.9);}
function companionSceneIcon(scn,size){
  size=size||34;
  const id=(scn&&scn.id)||'';
  switch(id){
    case 'study':return _cpScale(ICO.book,size);
    case 'work':return _cpScale(ICO.chat,size);
    case 'sport':return _cpSvg('<circle cx="13.5" cy="4.5" r="1.8"/><path d="M6 9l3.2-.8 2.3 3.1L14 12l3.2 4.2"/><path d="M8.5 13l-1.7 6M12 14l2.2 6"/>',size);
    case 'sleep':return _cpSvg('<path d="M20 14.5A8 8 0 1 1 9.5 4.2 6.3 6.3 0 0 0 20 14.5Z"/>',size);
    case 'eat':return _cpSvg('<path d="M4 11h16a8 8 0 0 1-16 0Z"/><path d="M12 19v2"/>',size);
    case 'fish':return _cpSvg('<path d="M3 12c3-4 7-4 9 0s6 4 9 0c-3 4-7 4-9 0s-6-4-9 0Z"/><circle cx="7.5" cy="11" r=".9" fill="currentColor" stroke="none"/>',size);
    default:return _cpScale(ICO.smile,size); /* 自定义场景回退中性线性图标 */
  }
}
let companionSession=null,companionTick=null;
/* v3.9.5 陪伴结算：把这一次的时长落进 companionTime 并清掉 companionStart——
   app.js 心跳只认 companionStart（真值时把挂钟差累加进去并重新盖章），
   所以会话结束后不清它，「已陪伴」就会一直涨。
   顺带维护「第 N 天」：同一自然日只算 1 天；上次陪伴不是昨天则从 1 重新开始（断档重置）。 */
function settleCompanion(){
  if(state.stats.companionStart){
    state.stats.companionTime=(state.stats.companionTime||0)+(Date.now()-state.stats.companionStart);
    state.stats.companionStart=0;
  }
  const cpDay=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const today=cpDay(new Date());
  if(state.stats.companionLastDay!==today){
    const y=new Date();y.setDate(y.getDate()-1);
    state.stats.companionStreak=(state.stats.companionLastDay===cpDay(y))?(Number(state.stats.companionStreak)||0)+1:1;
    state.stats.companionLastDay=today;
  }
  saveKey('stats');
}
function renderCompanion(){
  const body=document.getElementById('companion-body');body.innerHTML='';
  if(companionSession){renderCompanionTiming(body);return;}
  const extra=(state.stats.companionStart)?(Date.now()-state.stats.companionStart):0;
  body.innerHTML+=`<div class="companion-status" style="color:var(--hint);font-size:12px;opacity:.9">${CP_BOLT(13)} <span style="vertical-align:-1px">已陪伴 ${fmtDuration((state.stats.companionTime||0)+extra)}<span style="opacity:.65"> · 第 ${state.stats.companionStreak||1} 天</span></span></div>`;
  body.innerHTML+='<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px">';
  allCompanionScenes().forEach(sn=>{
    body.innerHTML+=`<div class="list-card" style="margin:0;display:flex;flex-direction:column;align-items:center;gap:8px;padding:18px 10px;text-align:center;cursor:pointer" onclick="enterCompanion('${sn.id}')"><div style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;color:var(--sub)">${companionSceneIcon(sn,34)}</div><div class="list-card-title">${esc(sn.name)}</div><div class="list-card-sub">${esc(sn.desc||'')}</div></div>`;
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
      <div class="cp-conn">${CP_BOLT(13)} <span style="vertical-align:-1px">1 台设备已连接</span></div>
      <div class="cp-ring"><div class="cp-ring-num" id="cp-ring-num">${mm}:${ss}</div><div class="cp-ring-tag">${esc(act)}</div></div>
      <div class="cp-slogan">正在一起${esc(act)} · 加油</div>
      <div style="display:flex;justify-content:center;gap:26px;margin-top:24px;font-size:20px">
        <span class="cp-quick" onclick="openApp('chat')">${_cpScale(ICO.chat,20)}<div style="font-size:11px;color:var(--hint)">聊天</div></span>
        <span class="cp-quick" onclick="endCompanion()">${CP_CLOSE(20)}<div style="font-size:11px;color:var(--hint)">结束</div></span>
      </div>
    </div>`;
}
function startCompanion(sc,minutes){
  companionSession={scene:sc.id,endAt:Date.now()+minutes*60000,total:minutes*60000};
  state.me.status=sc.name;saveKey('me');
  // v3.9.5：会话起点一律重新盖章——旧数据/刷新残留的 companionStart 不能再把空闲时间算进来
  state.stats.companionStart=Date.now();saveKey('stats');
  pushSys(`你和 ${state.other.name} 开始了「${sc.name}」，共 ${minutes} 分钟`);
  renderCompanion();
  if(companionTick)clearInterval(companionTick);
  companionTick=setInterval(()=>{
    if(!companionSession)return;
    if(Date.now()>=companionSession.endAt){
      clearInterval(companionTick);companionTick=null;
      companionSession=null;settleCompanion();renderCompanion();
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
  companionSession=null;settleCompanion();renderCompanion();showToast('已结束陪伴');
}
function enterCompanion(id){
  const sc=allCompanionScenes().find(x=>x.id===id);if(!sc)return;
  const act=sc.name.replace('一起','');
  showModal(sc.name,'<div style="display:flex;justify-content:center;margin-bottom:6px;color:var(--sub)">'+companionSceneIcon(sc,30)+'</div><div style="text-align:center;font-size:13px;color:var(--sub);padding-bottom:10px">这次陪你多久？</div><div class="cp-dur-grid" id="cp-dur-grid"></div>');
  const g=document.getElementById('cp-dur-grid');
  [5,10,15,20,25,30].forEach(m=>{
    const d=document.createElement('div');d.className='cp-dur';d.innerHTML='<b>'+m+'</b><span>分钟</span>';
    d.onclick=()=>{closeModal();startCompanion(sc,m);};
    g.appendChild(d);
  });
}
function openCompanionManage(){
  const list=state.stats.customCompanion||[];
  showModal('陪伴模式管理',list.map((sc,i)=>`<div style="display:flex;align-items:center;gap:8px;padding:12px 4px;border-bottom:1px solid var(--input)"><span style="color:var(--sub);display:inline-flex">${companionSceneIcon(sc,22)}</span><div style="flex:1"><div style="font-size:15px;font-weight:600">${esc(sc.name)}</div><div style="font-size:12px;color:var(--sub)">${esc(sc.desc||'')}</div></div><span style="cursor:pointer;padding:4px;color:var(--sub)" onclick="closeModal();editCompanionScene(${i})">${ICO_EDIT}</span><span style="cursor:pointer;padding:4px;color:#c0392b;display:inline-flex" onclick="closeModal();delCompanionScene(${i})">${CP_CLOSE(14)}</span></div>`).join('')
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
  if(i<0){list.push({id:'c'+Date.now(),name,icon:'',desc});}
  else{list[i].name=name;list[i].desc=desc;}
  state.stats.customCompanion=list;saveKey('stats');closeModal();renderCompanion();showToast(i<0?'已新增陪伴模式':'已保存');
}
function delCompanionScene(i){
  const list=state.stats.customCompanion||[];list.splice(i,1);
  state.stats.customCompanion=list;saveKey('stats');renderCompanion();showToast('已删除');
}
