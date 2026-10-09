/* =========================================================
   星迹 · 心念轨迹（桌面图标「迹」）
   上半区：轨迹图卡（左右滑动）——意识距离 / 连接频率 / 双轨对比
   下半区：竖向轨迹线——TA 与我的意识动作节点（时间倒序，TA 色/我色）
   ========================================================= */
const TRACE_NODE_COLORS={ta:'#9b59b6',me:'#4a7dcf',sys:'#95a5a6'};
const TRACE_ICONS={sense:'⟡',status:'◍',msg:'✉',gift:'♥',note:'❝',todo:'✓',sched:'▧',call:'☏',diary:'✎',mood:'☺'};
const TRACE_DIST_LEVELS=[
  {min:0,max:0.25,label:'咫尺',desc:'近在咫尺，触手可及',icon:'✦'},
  {min:0.25,max:0.5,label:'近旁',desc:'在不远的地方陪着你',icon:'✧'},
  {min:0.5,max:0.75,label:'远处',desc:'在意识空间的远处',icon:'○'},
  {min:0.75,max:1,label:'彼岸',desc:'在很深的雾里，慢慢靠近',icon:'◇'}
];
let _traceDist=0.35;   // 意识距离 0~1（近→远），由最近感应/状态动态算
let _traceAnchor=new Date();   // v3.6.12 周锚点（切周用）
let _traceDay='';              // 选中日 yyyy-mm-dd（默认今天，渲染时初始化）
/* v3.6.12 周视图工具（全局，供 onclick 调用） */
function trKey(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function trMonOf(anchor){const m=new Date(anchor);m.setDate(m.getDate()-((m.getDay()+6)%7));m.setHours(0,0,0,0);return m;}
function traceWeekShift(delta){_traceAnchor=new Date(trMonOf(_traceAnchor).getTime()+delta*7*86400000);renderTrace();}
function tracePickDay(key){_traceDay=key;renderTrace();}

/* 收集轨迹节点：events + messages + calendar + diaries + 状态，统一 [{time,who,type,text}] */
async function collectTraceNodes(){
  const nodes=[];
  const evs=await dbGetAll('events').catch(()=>[]);
  evs.forEach(e=>nodes.push({time:e.time,who:e.who==='ta'?'ta':'me',type:e.type||'sense',text:e.text||''}));
  const msgs=await dbGetAll('messages').catch(()=>[]);
  msgs.forEach(m=>{
    // v3.6.11：只保留「动作类」轨迹（礼物/通话），普通聊天文本不进轨迹
    if(m.sender==='ta'||m.sender==='me'){
      if(m.type==='gift'){
        nodes.push({time:m.time,who:m.sender==='ta'?'ta':'me',type:'gift',text:'送出心意：'+(m.content||'').slice(0,40)});
      }else if(m.type==='poke'){
        nodes.push({time:m.time,who:m.sender==='ta'?'ta':'me',type:'poke',text:(m.content||'').slice(0,40)});
      }
    }else if(m.sender==='sys'&&m.content&&m.content.indexOf('通话')>=0){
      nodes.push({time:m.time,who:'sys',type:'call',text:(m.content||'').slice(0,40)});
    }
  });
  const cals=await dbGetAll('calendar').catch(()=>[]);
  cals.forEach(c=>{
    if(c.type==='todo')nodes.push({time:c.at||Date.now(),who:'me',type:'todo',text:'待办：'+(c.text||'').slice(0,30)});
    else if(c.type==='ta_sched')nodes.push({time:c.at||Date.now(),who:'ta',type:'sched',text:'日程：'+(c.text||'').slice(0,30)});
    else if(c.type==='note')nodes.push({time:c.at||Date.now(),who:c.who==='ta'?'ta':'me',type:'note',text:'便签'+(c.text?('：'+(c.text||'').slice(0,30)):'')});
  });
  const dias=await dbGetAll('diaries').catch(()=>[]);
  dias.forEach(d=>nodes.push({time:d.time,who:d.owner==='other'?'ta':'me',type:'diary',text:'日记：'+(d.content||'').slice(0,30)}));
  // 状态轨迹（TA 手动/自动切状态也入列——从 mood 的 events 或简化为最近一次）
  nodes.sort((a,b)=>b.time-a.time);
  return nodes.slice(0,80);
}

/* 意识距离动态值：最近一次感应方位 + 当前状态修正 */
function calcTraceDist(){
  let d=0.35;
  const st=state.taStatus||state.other.status||'在线';
  if(['冥想中','静默中','发呆中','休息中','充电中'].includes(st))d=0.72;
  else if(['手术中','门诊中','查房中','会诊中','值班中'].includes(st))d=0.55;
  else if(['散步中','锻炼中'].includes(st))d=0.25;
  else d=0.3;
  // 最近感应：远方类 → 更远
  const last=(state.lastSenseDir)||'';
  if(['远处','上方','后方'].includes(last))d=Math.min(0.95,d+0.15);
  else if(['附近','前方','左侧','右侧'].includes(last))d=Math.max(0.05,d-0.12);
  return d;
}
function distLevel(d){
  return TRACE_DIST_LEVELS.find(l=>d>=l.min&&d<l.max)||TRACE_DIST_LEVELS[0];
}

/* 连接频率：最近 14 天每日活跃次数（TA+我 的消息/事件），归一成 0~5 格 */
async function calcFreqSeries(){
  const days=[];
  const now=new Date();
  for(let i=13;i>=0;i--){
    const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()-i);
    days.push({key:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),cnt:0});
  }
  const evs=await dbGetAll('events').catch(()=>[]);
  const msgs=await dbGetAll('messages').catch(()=>[]);
  const keyOf=t=>{const d=new Date(t);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
  evs.forEach(e=>{const k=keyOf(e.time);const r=days.find(x=>x.key===k);if(r)r.cnt++;});
  msgs.forEach(m=>{const k=keyOf(m.time);const r=days.find(x=>x.key===k);if(r)r.cnt++;});
  const max=Math.max(1,...days.map(d=>d.cnt));
  return days.map(d=>({...d,bars:Math.max(1,Math.ceil(d.cnt/max*5))}));
}

/* 双轨对比：今日/本周 TA vs 我 的活跃（消息数） */
async function calcDualStats(){
  const msgs=await dbGetAll('messages').catch(()=>[]);
  const evs=await dbGetAll('events').catch(()=>[]);
  const weekAgo=Date.now()-7*86400000;
  const today=new Date();today.setHours(0,0,0,0);
  let meToday=0,taToday=0,meWeek=0,taWeek=0;
  msgs.forEach(m=>{
    if(m.sender==='ta'||m.sender==='me'){
      if(m.time>=today.getTime()){m.sender==='ta'?taToday++:meToday++;}
      if(m.time>=weekAgo){m.sender==='ta'?taWeek++:meWeek++;}
    }
  });
  evs.forEach(e=>{
    if(e.time>=today.getTime()){e.who==='ta'?taToday++:meToday++;}
    if(e.time>=weekAgo){e.who==='ta'?taWeek++:meWeek++;}
  });
  return {meToday,taToday,meWeek,taWeek};
}

/* 主渲染 */
async function renderTrace(){
  const body=document.getElementById('trace-body');
  if(!body)return;
  try{await dbReady;}catch(e){}
  if(!_traceDay)_traceDay=(function(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})(new Date());
  const nodes=await collectTraceNodes();
  const freq=await calcFreqSeries();
  const dual=await calcDualStats();
  const dist=calcTraceDist();
  const lv=distLevel(dist);
  const st=state.taStatus||state.other.status||'在线';
  const taC=TRACE_NODE_COLORS.ta,meC=TRACE_NODE_COLORS.me;
  const whoName={ta:state.other.name||'TA',me:state.me.name||'我'};
  // 图卡 1：意识距离
  const distCard=`<div class="tr-card">
    <div class="tr-card-title">意识距离</div>
    <div class="tr-dist-main"><span class="tr-dist-icon">${lv.icon}</span><b>${lv.label}</b><em>${lv.desc}</em></div>
    <div class="tr-dist-bar"><i style="width:${Math.round((1-dist)*100)}%"></i></div>
    <div class="tr-dist-sub">${esc(st)} · 方位：${esc(state.lastSenseDir||'附近')}</div>
  </div>`;
  // 图卡 2：连接频率（14 天）
  const maxBar=Math.max(...freq.map(d=>d.bars));
  const freqCard=`<div class="tr-card">
    <div class="tr-card-title">连接频率 · 近 14 天</div>
    <div class="tr-freq">
      ${freq.map(d=>`<div class="tr-freq-col" title="${d.key} · ${d.cnt} 次"><span class="tr-freq-bars">${Array.from({length:d.bars},()=>'<i></i>').join('')}</span><span class="tr-freq-day">${d.key.slice(8)}</span></div>`).join('')}
    </div>
    <div class="tr-dist-sub">格子越多 = 那天连接越频繁</div>
  </div>`;
  // 图卡 3：双轨对比
  const mkBar=(a,b)=>Math.round(a/Math.max(1,a+b)*100);
  const dualCard=`<div class="tr-card">
    <div class="tr-card-title">双轨对比 · 本周</div>
    <div class="tr-dual">
      <div class="tr-dual-row"><span style="color:${meC}">${esc(whoName.me)}</span><div class="tr-dual-track"><i style="width:${mkBar(dual.meWeek,dual.taWeek)}%;background:${meC}"></i></div><b>${dual.meWeek}</b></div>
      <div class="tr-dual-row"><span style="color:${taC}">${esc(whoName.ta)}</span><div class="tr-dual-track"><i style="width:${mkBar(dual.taWeek,dual.meWeek)}%;background:${taC}"></i></div><b>${dual.taWeek}</b></div>
    </div>
    <div class="tr-dist-sub">今天：${esc(whoName.me)} ${dual.meToday} 次 · ${esc(whoName.ta)} ${dual.taToday} 次</div>
  </div>`;
  // v3.6.12 轨迹线：周视图 + 点线时间轴（左我蓝/右TA紫，按天查看，不含聊天内容）
  const nodeHtml=(n)=>{
    const c=TRACE_NODE_COLORS[n.who]||TRACE_NODE_COLORS.sys;
    const t=new Date(n.time);
    const tl=String(t.getHours()).padStart(2,'0')+':'+String(t.getMinutes()).padStart(2,'0');
    return `<div class="tr-node"><span class="tr-node-dot" style="background:${c}"></span><div class="tr-node-main"><span class="tr-node-time">${tl}</span><div class="tr-node-text">${esc(n.text||'')}</div></div></div>`;
  };
  // 选中当天 00:00~24:00 的节点
  const dayStart=new Date(_traceDay).getTime();
  const dayEnd=dayStart+86400000;
  const dayNodes=nodes.filter(n=>n.time>=dayStart&&n.time<dayEnd);
  const meNodes=dayNodes.filter(n=>n.who==='me').slice(0,20);
  const taNodes=dayNodes.filter(n=>n.who==='ta').slice(0,20);
  const colHtml=(arr,color,title)=>`<div class="tr-col"><div class="tr-col-head" style="color:${color}">${esc(title)}</div>
    ${arr.length?arr.map(nodeHtml).join(''):'<div class="empty" style="padding:16px 4px;font-size:12px">这一天没有轨迹</div>'}
  </div>`;
  const lineHtml=`<div class="tr-cols">
    ${colHtml(meNodes,TRACE_NODE_COLORS.me,whoName.me)}
    ${colHtml(taNodes,TRACE_NODE_COLORS.ta,whoName.ta)}
  </div>`;
  // 周选择器：横排一周 7 天，今天高亮，左右切周，点某天切换
  const mon=trMonOf(_traceAnchor);
  const nowKey=trKey(new Date());
  let wk='';
  for(let i=0;i<7;i++){
    const d=new Date(mon.getTime()+i*86400000);
    const key=trKey(d);
    const wd=['日','一','二','三','四','五','六'][d.getDay()];
    const isToday=key===nowKey,isSel=key===_traceDay;
    wk+=`<span class="trw-day${isToday?' today':''}${isSel?' sel':''}" onclick="tracePickDay('${key}')">
      <em>${wd}</em><b>${d.getDate()}</b>${isToday?'<i>今</i>':''}
    </span>`;
  }
  const monEnd=new Date(mon.getTime()+6*86400000);
  const weekHtml=`<div class="trw">
    <button class="trw-nav" onclick="traceWeekShift(-1)">&#8249;</button>
    <div class="trw-days">${wk}</div>
    <button class="trw-nav" onclick="traceWeekShift(1)">&#8250;</button>
  </div>
  <div class="trw-label">${mon.getMonth()+1} 月 ${mon.getDate()} 日 ~ ${monEnd.getMonth()+1} 月 ${monEnd.getDate()} 日${_traceDay===nowKey?' · 今天':''}${_traceDay!==nowKey?' · '+Number(_traceDay.slice(5,7))+'月'+Number(_traceDay.slice(8))+'日':''}</div>`;
  body.innerHTML=`
    <div class="tr-cards">
      ${distCard}${freqCard}${dualCard}
    </div>
    <div class="tr-line-title">轨迹线 <span style="color:var(--hint);font-size:11px;font-weight:400">（左 ${esc(whoName.me)} 蓝 / 右 ${esc(whoName.ta)} 紫，按天查看，不含聊天内容）</span></div>
    ${weekHtml}
    ${lineHtml}
  `;
}