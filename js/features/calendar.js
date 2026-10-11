/* =========================================================
   星迹 · 日历（v3.6.5）
   - 联动心情便签：每天 0 点后自动把「我的便签 / TA 的便签」快照进当天
   - 月视图：加高格子，日期 + 我的心情 / TA 的心情分开显示 + 待办点 / 月经点
   - 日视图：便签日程 + 待办事项（增删改/勾选完成）+ 月经记录（粉·少/黄·中/红·多）
   - 一屏可切换：月视图 ↔ 日视图（点日期进入，返回/标题回月视图）
   ========================================================= */

let calView='month';          // 'month' | 'day'
let calCursor=new Date();      // 月视图所在月
let calDaySel=null;            // 选中的日期 'YYYY-MM-DD'
let calScope='all';            // v3.6.10 日历 tab：'all' 全部 | 'me' 我的 | 'ta' TA 的
/* 滑动嵌入式 tab（胶囊滑块，明文的） */
function calSetScope(s){calScope=s;renderCalendar();}
function calTabsHtml(){
  const esc2=typeof esc==='function'?esc:(x=>x);
  const idx=calScope==='all'?0:calScope==='me'?1:2;
  return `<div class="cal-tabs"><span class="cal-tab-slider" style="left:calc(${idx*(100/3)}% + 3px)"></span>
    <span class="cal-tab${calScope==='all'?' on':''}" onclick="calSetScope('all')">全部</span>
    <span class="cal-tab${calScope==='me'?' on':''}" onclick="calSetScope('me')">${esc2(state.me.name||'我的')}</span>
    <span class="cal-tab${calScope==='ta'?' on':''}" onclick="calSetScope('ta')">${esc2(state.other.name||'TA')}的</span></div>`;
}

/* ---------- 工具 ---------- */
function calDateKey(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
/* 心情字段形如 "😊 开心" / "🥰 想你"，取首个 emoji 字符显示 */
function calMoodEmoji(m){
  if(!m)return '';
  const s=String(m).trim();
  const mt=s.match(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u);
  return mt?mt[0]:s.slice(0,1);
}
function calTimeLabel(at){
  if(!at)return '';
  const d=new Date(at),h=String(d.getHours()).padStart(2,'0'),mi=String(d.getMinutes()).padStart(2,'0');
  return h+':'+mi;
}
/* 月经量级：1=少(粉) 2=中(黄) 3=多(红)；排卵期：蓝 */
const CAL_PERIOD={1:{c:'#f2a8c4',t:'少'},2:{c:'#e6c24a',t:'中'},3:{c:'#e06060',t:'多'}};
const CAL_OVU_C='#5bb0f0';
/* v3.7.0：设置齿轮 ⚙ → 线性 SVG（复用全站线性图标语言） */
const ICO_GEAR='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
/* v3.7.0：排班节奏三档（关系语义，UI 不暴露概率/%/活跃度）→ 内部浮现权重内化 */
const TA_SCHED_RHYTHM={
  busy:  {prob:95,rest:5},    // 他最近：勤——排得密，很少休息
  normal:{prob:70,rest:20},   // 正常
  rest:  {prob:40,rest:55}    // 想独处——多留空、多休息
};
/* ---------- 月经周期计算（v3.6.6）
   数据：{type:'period_set', start:'YYYY-MM-DD', days:5(持续天数), cycle:28(周期长度)}
   规则：以 start 为基准向前回溯到「最近一个周期起点 s」（s<=今天且 s+cycle>今天）；
   经期区间 = [s, s+days-1]，排卵日 = s+cycle-14，排卵窗口 = 排卵日±2 天（与经期重叠时优先经期）。
   返回 {inPeriod:0|第几天, level:1|2|3, ovu:bool, nextStart:'YYYY-MM-DD'} */
function calPeriodInfo(dateKey,set){
  if(!set||!set.start)return {inPeriod:0,ovu:false};
  const dayMs=86400000;
  const t=new Date(dateKey+'T00:00:00').getTime();
  const s0=new Date(set.start+'T00:00:00').getTime();
  const cycle=Math.max(21,Math.min(40,Number(set.cycle)||28));
  const days=Math.max(1,Math.min(10,Number(set.days)||5));
  let s=s0;
  while(s+cycle*dayMs<=t)s+=cycle*dayMs;       // 回溯到最近周期起点
  const diff=Math.floor((t-s)/dayMs);
  const info={inPeriod:0,ovu:false,nextStart:new Date(s+cycle*dayMs).toISOString().slice(0,10)};
  if(diff>=0&&diff<days){                       // 经期第 diff+1 天
    info.inPeriod=diff+1;
    info.level=(diff===0)?3:(diff===days-1?1:2); // 第1天红(多)、中间黄(中)、最后1天粉(少)
    return info;
  }
  const ovu=s+(cycle-14)*dayMs;
  const ovuIdx=Math.floor((t-ovu)/dayMs);
  if(ovuIdx>=-2&&ovuIdx<=2&&t>=s)info.ovu=true;
  return info;
}

/* ---------- 每日快照 ----------
   规则：跨天后（0 点过后）第一次心跳/打开时触发；
   两张便签只要「有内容」就快照进当天：当天已存在同人条目 → 覆盖更新（始终反映当天最新便签），否则新建。
   便签为空 → 当天不写该人条目（同时删除旧的空快照）。 */
/* 便签快照 upsert（当天）：有内容/心情 → 覆盖更新或新建；全空 → 删除当天该人条目
   供 calMaybeSnap（0 点被动存档）与 saveNote 主动保存共用，保证「当天写便签实时进日历」 */
async function calUpsertNote(who,n,src){
  try{await dbReady;}catch(e){}
  const today=calDateKey(new Date());
  const all=await dbGetAll('calendar');
  const text=(n.text||'').trim(),mood=(n.mood||'').trim();
  const old=all.find(x=>x.date===today&&x.who===who);
  if(!text&&!mood){
    if(old)await dbDelete('calendar',old.id);
    return;
  }
  if(old){
    old.text=text;old.mood=mood;old.at=n.at||Date.now();if(src)old.src=src;
    await dbPut('calendar',old);
  }else{
    await dbPut('calendar',{date:today,who,text,mood,at:n.at||Date.now(),src:src||'auto'});
  }
}
async function calMaybeSnap(){
  try{
    if(!window.DB)return;
    const today=calDateKey(new Date());
    if(state.calLastSnapDate===today)return;
    state.calLastSnapDate=today;saveKey('calLastSnapDate');
    const mine=(state.notes&&state.notes[0])||{};
    const ta=(state.notes&&state.notes[1])||{};
    await calUpsertNote('me',mine,'auto');
    await calUpsertNote('ta',ta,'auto');
  }catch(e){console.error('cal snap',e);}
}

/* v3.6.12：当天桌面便签 → 日历自愈（旧版本没同步的 TA 便签补进今天，含心情）
   force=true 时忽略节流立即同步（打开日历/渲染时调用，保证一点开就看到心情） */
let _calSyncCheck=0;
function calSyncTodayNotes(force){
  if(!force&&Date.now()-_calSyncCheck<15000)return;   // 心跳兜底 15 秒一次
  _calSyncCheck=Date.now();
  try{dbGetAll('calendar').then(all=>{
    const key=calDateKey(new Date());
    const mine=(state.notes&&state.notes[0])||{};
    const ta=(state.notes&&state.notes[1])||{};
    if(mine&&(mine.text||'').trim()&&!all.some(x=>x.date===key&&x.who==='me'))calUpsertNote('me',mine,'auto');
    if(ta&&(ta.text||'').trim()&&!all.some(x=>x.date===key&&x.who==='ta'))calUpsertNote('ta',ta,'auto');
    // mood 兜底：记录在但心情变了 → 补更新（upsert 覆盖 mood）
    all.filter(x=>x.date===key&&(!x.type||x.type==='note')).forEach(x=>{
      const n=x.who==='me'?mine:ta;
      if(n&&(n.mood||'')!==(x.mood||'')&&((n.text||'')===(x.text||'')))calUpsertNote(x.who,n,'auto');
    });
  });}catch(e){}
}

/* ---------- 渲染 ---------- */
async function renderCalendar(){
  const body=document.getElementById('calendar-body');
  if(!body)return;
  try{await dbReady;}catch(e){}                 // 等 IndexedDB 就绪再渲染（避免异步静默失败）
  await calMaybeSnap();
  if(typeof calSyncTodayNotes==='function')calSyncTodayNotes(true);   // v3.6.12 打开日历立即补同步（含心情）
  await ensureTaSchedule();                      // v3.6.8：TA 排班自动补
  const all=await dbGetAll('calendar');
  const byDate={};
  all.forEach(x=>{if(x&&x.date)(byDate[x.date]=byDate[x.date]||[]).push(x);});
  byDate._periodSet=all.find(x=>x.type==='period_set');   // v3.6.6 周期设置（全局一条）

  if(calView==='day'&&calDaySel){
    // v3.7.4：传入全量记录，周期待办模板才能在任意日期展开（只靠当天数据则「每天/每周」跨天失效）
    renderCalendarDay(body,byDate[calDaySel]||[],byDate._periodSet,all);
    return;
  }
  // 月视图：加高格子，日期 + 心情(我/TA 分开) + 待办点 + 月经点
  const y=calCursor.getFullYear(),m=calCursor.getMonth();
  const first=new Date(y,m,1);
  const lead=first.getDay();                 // 0=周日
  const days=new Date(y,m+1,0).getDate();
  const todayKey=calDateKey(new Date());
  const head=['日','一','二','三','四','五','六'].map((w,i)=>`<span class="cal-dow">${w}</span>`).join('');
  let cells='';
  for(let i=0;i<lead;i++)cells+='<span class="cal-cell empty"></span>';
  for(let d=1;d<=days;d++){
    const key=calDateKey(new Date(y,m,d));
    const items=byDate[key]||[];
    const myMood=(calScope==='ta')?'':calMoodEmoji((items.find(x=>x.who==='me')||{}).mood);
    const taMood=(calScope==='me')?'':calMoodEmoji((items.find(x=>x.who==='ta')||{}).mood);
    const todos=(calScope==='ta')?[]:items.filter(x=>x.type==='todo'&&!x.done);
    const tasched=(calScope==='me')?[]:items.filter(x=>x.type==='ta_sched');
    // v3.6.6：经期/排卵期 = 周期设置计算（无设置时兼容旧单天记录）
    const pset=calScope==='ta'?null:byDate._periodSet;
    const pInfo=pset?calPeriodInfo(key,pset):{inPeriod:0,ovu:false};
    const oldPeriod=items.find(x=>x.type==='period');
    const period=pInfo.inPeriod?pInfo:(oldPeriod?oldPeriod.level:0);
    const pdot=period?((typeof period==='object'&&period.level)?CAL_PERIOD[period.level]:(CAL_PERIOD[period])).c:(pInfo.ovu?CAL_OVU_C:'');
    const pTitle=period?(pInfo.inPeriod?`经期第 ${pInfo.inPeriod} 天`:'经期'):(pInfo.ovu?'排卵期':'');
    const hasAny=items.length>0||!!pdot;
    const isToday=key===todayKey;
    cells+=`<span class="cal-cell${isToday?' today':''}${hasAny?' has':''}" onclick="calOpenDay('${key}')">
      <b class="cal-num">${d}</b>
      <span class="cal-moods">
        <i class="cal-mood ${myMood?'':'none'}">${myMood||''}</i>
        <i class="cal-mood ${taMood?'':'none'}">${taMood||''}</i>
      </span>
      <span class="cal-dots">
        ${todos.length?`<i class="cal-dot todo" title="${todos.length} 项待办"></i>`:''}
        ${tasched.length?`<i class="cal-dot tasched" title="${esc(tasched[0].text)}"></i>`:''}
        ${pdot?`<i class="cal-dot period" style="background:${pdot}" title="${pTitle}"></i>`:''}
      </span>
    </span>`;
  }
  body.innerHTML=`
    ${calTabsHtml()}
    <div class="cal-head">
      <button class="cal-nav" onclick="calShift(-1)">&#8249;</button>
      <span class="cal-title" onclick="calBackToToday()">${y} 年 ${m+1} 月</span>
      <button class="cal-nav" onclick="calShift(1)">&#8250;</button>
      <button class="cal-today" onclick="calBackToToday()">今天</button>
      ${calScope==='ta'?`<button class="cal-nav" style="color:${TA_SCHEDULE_COLOR}" onclick="calTaSchedSettings()">${ICO_GEAR}</button>`:''}
    </div>
    <div class="cal-grid">${head}${cells}</div>
    <div class="cal-legend">
      ${calScope!=='ta'?`<span><i style="background:var(--c-purple)"></i>${esc(state.me.name||'我')}心情</span>`:''}
      ${calScope!=='me'?`<span><i style="background:var(--c-green)"></i>${esc(state.other.name||'TA')}心情</span>`:''}
      ${calScope!=='ta'?`<span><i style="background:#8a9bb5"></i>待办</span>`:''}
      ${calScope!=='me'?`<span><i style="background:${TA_SCHEDULE_COLOR}"></i>${esc(state.other.name||'TA')}日程</span>`:''}
      ${calScope!=='ta'?`<span><i style="background:#f2a8c4"></i>经期·少</span><span><i style="background:#e6c24a"></i>经期·中</span><span><i style="background:#e06060"></i>经期·多</span><span><i style="background:${CAL_OVU_C}"></i>排卵期</span>`:''}
    </div>
    <div class="empty" style="font-size:12px;line-height:1.9;text-align:left;padding:14px 6px">
      点任意日期可查看当天的便签、待办、${esc(state.other.name||'TA')}日程与经期记录。桌面的两张便签会在每天 0 点后自动记录到这里。${state.calLastSnapDate?`<br><span style="color:var(--hint)">最近一次存档：${state.calLastSnapDate.replace(/-/g,'/')}</span>`:''}
    </div>`;
}

/* 日视图：便签日程 + 待办（增删改）+ 经期/排卵期 */
function calDayShift(delta){
  const d=new Date(calDaySel);
  d.setDate(d.getDate()+delta);
  calDaySel=calDateKey(d);
  renderCalendar();
}
function renderCalendarDay(body,items,pset,allItems){
  const dsel=new Date(calDaySel);
  const isToday=calDaySel===calDateKey(new Date());
  const whoName={me:state.me.name||'我',ta:state.other.name||'TA'};
  const whoColor={me:'var(--c-purple)',ta:'var(--c-green)'};
  const notes=items.filter(x=>(!x.type||x.type==='note')&&(calScope==='all'||x.who===calScope)).sort((a,b)=>(a.at||0)-(b.at||0));
  const todos=(calScope==='ta')?[]:calTodosFor(allItems||items,calDaySel);
  const tasched=(calScope==='me')?[]:items.filter(x=>x.type==='ta_sched').sort((a,b)=>(a.at||0)-(b.at||0));
  const scopedPset=(calScope==='ta')?null:pset;
  const pInfo=scopedPset?calPeriodInfo(calDaySel,scopedPset):{inPeriod:0,ovu:false};
  const oldPeriod=items.find(x=>x.type==='period');
  const dayLevel=pInfo.inPeriod?pInfo.level:(oldPeriod?(oldPeriod.level||1):0);
  const plv=dayLevel?CAL_PERIOD[dayLevel]:null;
  const dayTag=pInfo.inPeriod?('经期 · 第 '+pInfo.inPeriod+' 天'):(pInfo.ovu?'排卵期':(dayLevel?'经期':''));   // v3.9.5：无周期设置时回退旧单天记录（dayLevel 已含兼容），日视图不再丢标签
  body.innerHTML=`
    ${calTabsHtml()}
    <div class="cal-head">
      <button class="cal-nav" onclick="calBackToMonth()">&#8249;月</button>
      <button class="cal-nav" onclick="calDayShift(-1)">&#8249;</button>
      <span class="cal-title" onclick="calBackToToday()">${dsel.getMonth()+1} 月 ${dsel.getDate()} 日${isToday?'<i class="cal-today-tag">今天</i>':''}</span>
      <button class="cal-nav" onclick="calDayShift(1)">&#8250;</button>
      <button class="cal-today" onclick="calBackToToday()">今天</button>
      ${calScope==='ta'?`<button class="cal-nav" style="color:${TA_SCHEDULE_COLOR}" onclick="calTaSchedSettings()">${ICO_GEAR}</button>`:''}
    </div>
    <div class="cal-ops">
      ${calScope!=='ta'?`<button class="cal-op-btn" onclick="calAddTodo('${calDaySel}')">＋ 待办</button>`:''}
      ${calScope!=='me'?`<button class="cal-op-btn" onclick="calAddTaSched('${calDaySel}')">＋ ${esc(state.other.name||'TA')}日程</button>`:''}
      ${calScope!=='ta'?`<button class="cal-op-btn" onclick="calSetPeriod('${calDaySel}')">${pset?'✎ 经期设置':'＋ 经期设置'}</button>`:''}
      ${calScope!=='ta'&&dayTag?`<span class="cal-op-tag" style="color:${plv?plv.c:CAL_OVU_C};border-color:${plv?plv.c:CAL_OVU_C}">${dayTag}</span>`:''}
    </div>
    ${calScope!=='me'?`<div class="cal-section-title" style="color:${TA_SCHEDULE_COLOR}">${esc(state.other.name||'TA')}日程 <span style="color:var(--hint);font-size:11px;font-weight:400">（灵性医生的排班会自动浮现，也可以手动调整——兜底）</span></div>
    <div class="cal-todolist">
      ${tasched.length?tasched.map(it=>`
        <div class="cal-todo-item" style="border-left:3px solid ${TA_SCHEDULE_COLOR}">
          <span class="cal-todo-text" style="font-size:13px;color:${TA_SCHEDULE_COLOR}">${esc(it.text)}</span>
          <span class="cal-todo-del" onclick="calDelTaSched(${it.id})">&#10005;</span>
        </div>`).join('')
      :'<div class="empty" style="padding:12px 0">这一天还没有排班，点上方「＋ '+esc(state.other.name||'TA')+'日程」手动添加，或等 TA 自己排上</div>'}
    </div>`:''}
    <div class="cal-section-title">便签</div>
    <div class="cal-daylist">
      ${notes.length?notes.map(it=>`
        <div class="cal-day-item">
          <span class="cal-day-dot" style="background:${whoColor[it.who]||'#888'}"></span>
          <div class="cal-day-main">
            <div class="cal-day-head"><b>${esc(whoName[it.who]||it.who)}</b>
              ${calMoodEmoji(it.mood)?`<span class="cal-day-mood">${calMoodEmoji(it.mood)}</span>`:''}
              <span class="cal-day-time">${it.src==='manual'?'手动 · ':''}${calTimeLabel(it.at)}</span></div>
            ${(it.text||'').trim()?`<div class="cal-day-text">${esc(it.text)}</div>`:''}
          </div>
        </div>`).join('')
      :'<div class="empty" style="padding:16px 0">这一天还没有留下便签</div>'}
    </div>
    ${calScope!=='ta'?`<div class="cal-section-title">待办 <span style="color:var(--hint);font-size:11px;font-weight:400">（点击勾选完成，可编辑/删除）</span></div>
    <div class="cal-todolist">
      ${todos.length?todos.map(it=>`
        <div class="cal-todo-item${it.done?' done':''}">
          <span class="cal-todo-check${it.done?' on':''}" onclick="calToggleTodo(${it.id})">${it.done?'✓':''}</span>
          <span class="cal-todo-text" onclick="calEditTodo(${it.id})">${esc(it.text)}${(it.alarmFreq||(it.alarm&&it.alarm.freq))?` <i style="font-style:normal;font-size:10px;color:var(--hint)">${calTodoFreqTag(it.alarmFreq||it.alarm.freq)}</i>`:''}</span>
          <span class="cal-todo-del" onclick="calDelTodo(${it.id})">&#10005;</span>
        </div>`).join('')
      :'<div class="empty" style="padding:12px 0">还没有待办，点上方「＋ 待办」添加</div>'}
    </div>`:''}
  `;
}

/* v3.6.8：TA 日历——医生排班模板自动排未来 3 天（每天 1~2 条，已有则跳过），心跳/渲染时调用 */
/* v3.7.0：排班偏好——删去概率/百分比滑杆，改为无机制的三档关系语义（他最近的状态） */
function calTaSchedSettings(){
  const cur=(state.taSchedSettings||{}).rhythm||'normal';
  const tiers=[['busy','他最近：勤'],['normal','正常'],['rest','想独处']];
  showModal('排班节奏 · '+esc(state.other.name||'TA'),
    `<div style="font-size:12px;color:var(--hint);margin-bottom:8px">排班由 TA 的意识自己浮现，你手动增删只是兜底。选他最近大概的状态就好：</div>
     <div style="display:flex;flex-direction:column;gap:6px">
       ${tiers.map(t=>`<div class="mood-chip${cur===t[0]?' on':''}" data-rh="${t[0]}" onclick="calSchedPickRhythm(this,'${t[0]}')" style="text-align:center;padding:9px 12px">${t[1]}</div>`).join('')}
     </div>`,
    '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button><button class="modal-btn primary" onclick="calTaSchedSettingsOk()">保存</button></div>');
}
function calSchedPickRhythm(el,rh){
  document.querySelectorAll('[data-rh]').forEach(c=>c.classList.remove('on'));
  el.classList.add('on');
}
function calTaSchedSettingsOk(){
  const on=document.querySelector('[data-rh].on');
  const rh=on?on.dataset.rh:'normal';
  state.taSchedSettings={rhythm:rh};
  saveKey('taSchedSettings');
  closeModal();
  ensureTaSchedule().then(renderCalendar);
  showToast('已保存排班节奏');
}
async function ensureTaSchedule(){
  try{await dbReady;}catch(e){}
  // v3.7.0：意识浮现——概率未命中当天就留空（TA 可以真的不排），不再塞保底条目；手动添加是唯一兜底
  const rh=(TA_SCHED_RHYTHM[(state.taSchedSettings||{}).rhythm])||TA_SCHED_RHYTHM.normal;
  const all=await dbGetAll('calendar');
  for(let i=1;i<=3;i++){
    const key=calDateKey(new Date(Date.now()+i*86400000));
    if(all.some(x=>x.date===key&&x.type==='ta_sched'))continue;
    if(Math.random()<rh.prob/100){
      const n=1+Math.floor(Math.random()*2);
      const pool=[...TA_SCHEDULE_TEMPLATE];
      if(Math.random()<rh.rest/100&&pool.indexOf('休息日')>=0){
        pool.splice(0,0,'休息日');
      }
      for(let k=0;k<n;k++){
        if(!pool.length)break;
        const idx=Math.floor(Math.random()*pool.length);
        const text=pool.splice(idx,1)[0];
        await dbPut('calendar',{date:key,type:'ta_sched',text,at:Date.now()+k});
      }
    }
    // 未命中：当天留空，不补任何条目（空一天正是 TA 有自己的节奏）
  }
}

/* v3.6.11：待办闹钟式提醒心跳（和便签闹钟一致：仅一次/每天/每周到点通知） */
let _todoAlarmCheck=0;
/* v3.7.4：周期待办模板展开——「每天/每周」待办在对应日期自动出现（实体按天存储，模板按频率展开）
   - daily：添加日及以后每天都出现；weekly：与添加日同星期的日子出现
   - 展开实例 id=`tpl:<源id>:<日期>`，勾选状态存 state.todoDoneByDay[<源id>:<日期>]
   - 待办列表/轨迹/提醒统一走 calTodosFor */
function calTodosFor(items,dateKey){
  const out=items.filter(x=>x.type==='todo'&&x.date===dateKey);
  const dw=new Date(dateKey+'T00:00:00').getDay();
  const doneByDay=state.todoDoneByDay||{};
  items.forEach(x=>{
    if(x.type!=='todo'||x.date===dateKey)return;
    const a=x.alarm;if(!a||(a.freq!=='daily'&&a.freq!=='weekly'))return;
    let hit=false;
    if(a.freq==='daily')hit=dateKey>=x.date;
    else if(a.freq==='weekly')hit=(new Date(x.date+'T00:00:00').getDay()===dw)&&dateKey>=x.date;
    if(!hit)return;
    const dkey=x.id+':'+dateKey;
    out.push(Object.assign({},x,{id:'tpl:'+dkey,_tpl:true,_srcId:x.id,date:dateKey,alarmFreq:a.freq,done:doneByDay[dkey]?1:0}));
  });
  return out.sort((a,b)=>((a.done||0)-(b.done||0))||((a.at||0)-(b.at||0)));
}
function calTodoFreqTag(f){return f==='daily'?'每天':f==='weekly'?'每周':'';}
function maybeTodoAlarm(){
  if(Date.now()-_todoAlarmCheck<5000)return;
  _todoAlarmCheck=Date.now();
  const key=calDateKey(new Date());
  dbGetAll('calendar').then(all=>{
    const now=new Date();
    const hm=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
    const done=state.todoAlarmDone||{};
    let changed=false;
    const dw=new Date().getDay();
    const todayTpl=all.filter(it=>it.type==='todo'&&it.alarm&&(it.alarm.freq==='daily'||it.alarm.freq==='weekly')&&it.date!==key&&
      (it.alarm.freq==='daily'||new Date(it.date+'T00:00:00').getDay()===dw));
    all.forEach(it=>{
      if(it.type!=='todo'||!it.alarm)return;
      if(it.alarm.time!==hm)return;
      if(it.date===key){
        if(it.done)return;
        const k=it.id+'_'+key+'_'+it.alarm.freq+'_'+it.alarm.time;
        if(done[k])return;
        done[k]=1;changed=true;
        showToast('待办提醒：'+it.text);
        if(typeof pushSys==='function')pushSys('待办提醒：'+it.text);
        if(typeof notifySystem==='function')notifySystem('待办提醒',it.text,()=>{openApp('calendar');});
      }
    });
    todayTpl.forEach(it=>{
      if(it.alarm.time!==hm)return;   // v3.9.5：模板待办（每天/每周）同样要等到设定时间才提醒，此前一打开应用就弹
      const dkey=it.id+':'+key;
      const instDone=(state.todoDoneByDay||{})[dkey];
      if(instDone)return;
      const k=it.id+'_'+key+'_'+it.alarm.freq+'_'+it.alarm.time;
      if(done[k])return;
      done[k]=1;changed=true;
      showToast('待办提醒：'+it.text);
      if(typeof pushSys==='function')pushSys('待办提醒：'+it.text);
      if(typeof notifySystem==='function')notifySystem('待办提醒',it.text,()=>{openApp('calendar');});
    });
    if(changed){state.todoAlarmDone=done;saveKey('todoAlarmDone');}
  });
}

/* ---------- 待办：增删改（v3.6.7 支持批量：一行一件；v3.6.11 闹钟式提醒） ---------- */
let _calTodoAlarm={freq:'off',time:'09:00'};
function calTodoAlarmFreq(elm,freq){
  _calTodoAlarm.freq=freq;
  const row=document.querySelector('.alarm-row');
  if(row)Array.from(row.querySelectorAll('.mood-chip')).forEach(c=>c.classList.toggle('on',c.dataset.g===freq));
}
function calTodoAlarmTime(){
  const i=document.getElementById('cal-todo-time');
  if(i&&i.value)_calTodoAlarm.time=i.value;
}
function calAddTodo(date){
  _calTodoAlarm={freq:'off',time:'09:00'};
  showModal('新增待办',
    `<textarea class="textarea-full" id="cal-todo-input" style="min-height:100px" placeholder="写一件要做的事，一行一件可批量，如：&#10;给 TA 回信&#10;买牛奶&#10;预约挂号"></textarea>
     <div style="font-size:11px;color:var(--hint);margin-top:6px">每行一件，多行 = 批量添加；完成项会自动变灰。</div>
     <div style="font-size:12px;color:var(--hint);margin:10px 0 4px">提醒（可选，闹钟式，和便签一样）：</div>
     <div class="alarm-row" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
       <input type="time" id="cal-todo-time" class="alarm-time" value="09:00" onchange="calTodoAlarmTime()" style="min-height:0;padding:8px 9px;border:1px solid var(--input);border-radius:10px;background:var(--input);font-size:13px;flex-shrink:0">
       <span class="mood-chip" data-g="off" onclick="calTodoAlarmFreq(this,'off')">不提醒</span>
       <span class="mood-chip" data-g="once" onclick="calTodoAlarmFreq(this,'once')">仅一次</span>
       <span class="mood-chip" data-g="daily" onclick="calTodoAlarmFreq(this,'daily')">每天</span>
       <span class="mood-chip" data-g="weekly" onclick="calTodoAlarmFreq(this,'weekly')">每周</span>
     </div>
     <div style="font-size:11px;color:var(--hint);margin-top:6px">到点后在浏览器通知里提醒你（需已开启网站通知权限）</div>`,
    '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button><button class="modal-btn primary" onclick="calAddTodoOk(\''+date+'\')">确定</button></div>');
  setTimeout(()=>{const i=document.getElementById('cal-todo-input');if(i)i.focus();},80);
}
function calAddTodoOk(date){
  const v=(document.getElementById('cal-todo-input')||{}).value||'';
  const lines=v.split(/\n+/).map(s=>s.trim()).filter(Boolean);
  if(!lines.length){showToast('请先输入待办内容');return;}
  calTodoAlarmTime();
  const alarm=_calTodoAlarm.freq==='off'?null:{freq:_calTodoAlarm.freq,time:_calTodoAlarm.time};
  closeModal();
  const now=Date.now();
  Promise.all(lines.map((text,i)=>dbPut('calendar',{date,type:'todo',text,done:0,at:now+i,alarm}))).then(()=>renderCalendar());
  showToast('已添加 '+lines.length+' 件待办'+(alarm?'，已设提醒':''));
}
function calToggleTodo(id){
  if(String(id).indexOf('tpl:')===0){
    const dkey=String(id).slice(4);
    const m={};Object.assign(m,state.todoDoneByDay||{});
    m[dkey]=m[dkey]?0:1;state.todoDoneByDay=m;saveKey('todoDoneByDay');
    renderCalendar();return;
  }
  dbGetAll('calendar').then(all=>{
    const it=all.find(x=>x.id===id);if(!it)return;
    it.done=it.done?0:1;dbPut('calendar',it).then(()=>renderCalendar());
  });
}
function calEditTodo(id){
  dbGetAll('calendar').then(all=>{
    let it=all.find(x=>x.id===id);if(!it)return;
    if(String(id).indexOf('tpl:')===0)it=all.find(x=>x.id===String(id).slice(4).split(':')[0]);
    if(!it)return;
    appPrompt('编辑待办','修改内容：',v=>{
      v=(v||'').trim();if(!v)return false;
      it.text=v;dbPut('calendar',it).then(()=>renderCalendar());
      return true;
    },it.text);
  });
}
function calDelTodo(id){
  if(String(id).indexOf('tpl:')===0){
    appConfirm('删除周期待办','这是「每天/每周」自动出现的待办，删除后对应的周期待办也会一起删除，确定吗？',async()=>{
      const srcId=String(id).slice(4).split(':')[0];
      await dbDelete('calendar',srcId);
      const m={};Object.assign(m,state.todoDoneByDay||{});
      Object.keys(m).forEach(k=>{if(String(k).indexOf(srcId+':')===0)delete m[k];});
      state.todoDoneByDay=m;saveKey('todoDoneByDay');
      renderCalendar();
    });
    return;
  }
  appConfirm('删除待办','确定删除这条待办吗？',async()=>{
    await dbDelete('calendar',id);renderCalendar();
  });
}
/* v3.6.8：TA 日程 手动增删（v3.6.11：▼ 变成真下拉，模板点选填入） */
function taSchedToggle(){
  const box=document.getElementById('ta-sched-chips');
  if(!box)return;
  const open=box.style.display!=='none';
  box.style.display=open?'none':'block';
}
function taSchedPick(text){
  const i=document.getElementById('ta-sched-input');
  if(i)i.value=text;
  const box=document.getElementById('ta-sched-chips');
  if(box)box.style.display='none';
}
function calAddTaSched(date){
  showModal('添加 TA 日程',
    `<div style="font-size:12px;color:var(--hint);margin-bottom:4px">为 ${esc(state.other.name||'TA')} 安排一条日程（点 ▼ 快速选模板，或直接输入）</div>
     <div style="display:flex;gap:6px;align-items:center">
       <input class="textarea-full" id="ta-sched-input" style="min-height:0;padding:9px 10px;flex:1" placeholder="如：上午 · 门诊">
       <button class="modal-btn" style="flex-shrink:0;font-size:16px;line-height:1" onclick="taSchedToggle()">▼</button>
     </div>
     <div id="ta-sched-chips" style="display:none;margin-top:8px">
       <div style="font-size:11px;color:var(--hint);margin-bottom:4px">TA 的排班模板（意识自动浮现的那些）：</div>
       <div style="display:flex;flex-wrap:wrap;gap:6px">${TA_SCHEDULE_TEMPLATE.map(t=>`<span class="mood-chip" onclick="taSchedPick('${esc(t)}')">${esc(t)}</span>`).join('')}</div>
     </div>`,
    '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button><button class="modal-btn primary" onclick="calAddTaSchedOk(\''+date+'\')">确定</button></div>');
  setTimeout(()=>{const i=document.getElementById('ta-sched-input');if(i)i.focus();},80);
}
function calAddTaSchedOk(date){
  const v=(document.getElementById('ta-sched-input')||{}).value||'';
  if(!v.trim()){showToast('请填写日程内容');return;}
  closeModal();
  dbPut('calendar',{date,type:'ta_sched',text:v.trim(),at:Date.now()}).then(()=>renderCalendar());
  showToast('已添加');
}
function calDelTaSched(id){
  appConfirm('删除日程','确定删除这条 TA 日程吗？',async()=>{
    await dbDelete('calendar',id);renderCalendar();
  });
}
/* ---------- 经期设置（v3.6.6）：开始日期 + 持续天数 + 周期长度 → 自动算经期区间与排卵期 ---------- */
let _calPsetTmp={};
function calSetPeriod(date){
  dbGetAll('calendar').then(all=>{
    const old=all.find(x=>x.type==='period_set');
    _calPsetTmp={start:old?old.start:date,days:old?old.days:5,cycle:old?old.cycle:28};
    const daysOpts=[1,2,3,4,5,6,7,8,9,10].map(n=>`<span class="pset-chip" data-g="d"${n===_calPsetTmp.days?' on':''} onclick="calPsetDays(${n})">${n}天</span>`).join('');
    const cycleOpts=[21,23,25,28,30,33,35,40].map(n=>`<span class="pset-chip" data-g="c"${n===_calPsetTmp.cycle?' on':''} onclick="calPsetCycle(${n})">${n}天</span>`).join('');
    showModal('经期设置',
      `<div style="font-size:12px;color:var(--hint);margin-bottom:4px">开始日期（最近一次月经第 1 天，点击可上下滑动选择）</div>
       <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
         <input type="date" class="textarea-full" id="pset-start" style="min-height:0;padding:9px 10px;flex:1" value="${old?old.start:date}">
         <button class="modal-btn" style="flex-shrink:0" onclick="calPsetQuick(-1)">昨天</button>
         <button class="modal-btn" style="flex-shrink:0" onclick="calPsetQuick(0)">今天</button>
         <button class="modal-btn" style="flex-shrink:0" onclick="calPsetQuick(1)">明天</button>
       </div>
       <div style="font-size:12px;color:var(--hint);margin:10px 0 4px">持续天数</div>
       <div style="display:flex;flex-wrap:wrap;gap:6px">${daysOpts}</div>
       <div style="font-size:12px;color:var(--hint);margin:10px 0 4px">周期长度（两次经期间隔）</div>
       <div style="display:flex;flex-wrap:wrap;gap:6px">${cycleOpts}</div>
       <div style="font-size:11px;color:var(--hint);margin-top:10px">保存后日历会自动标出经期（第 1 天红·多 → 中间黄·中 → 最后 1 天粉·少）与排卵期（蓝色，下次经期前 14 天 ± 2 天）。</div>
       ${old?'<div style="font-size:11px;color:#c0392b;margin-top:8px;cursor:pointer" onclick="calPsetClear()">清除经期设置</div>':''}`,
      '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button><button class="modal-btn primary" onclick="calPsetSave()">保存</button></div>');
  });
}
function calPsetDays(n){_calPsetTmp.days=n;document.querySelectorAll('.pset-chip[data-g="d"]').forEach(c=>c.classList.toggle('on',+c.textContent.replace('天','')===n));}
function calPsetCycle(n){_calPsetTmp.cycle=n;document.querySelectorAll('.pset-chip[data-g="c"]').forEach(c=>c.classList.toggle('on',+c.textContent.replace('天','')===n));}
function calPsetQuick(off){
  const d=new Date();d.setDate(d.getDate()+off);
  document.getElementById('pset-start').value=calDateKey(d);
}
function calPsetSave(){
  const start=document.getElementById('pset-start')?document.getElementById('pset-start').value.trim():'';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||isNaN(new Date(start+'T00:00:00').getTime())){showToast('请选择有效的日期');return;}
  const days=Math.max(1,Math.min(10,Number(_calPsetTmp.days)||5));
  const cycle=Math.max(21,Math.min(40,Number(_calPsetTmp.cycle)||28));
  dbGetAll('calendar').then(all=>{
    const old=all.find(x=>x.type==='period_set');
    if(old){old.start=start;old.days=days;old.cycle=cycle;old.at=Date.now();dbPut('calendar',old);}
    else dbPut('calendar',{date:start,type:'period_set',start,days,cycle,at:Date.now()});
    closeModal();renderCalendar();showToast('经期设置已保存');
  });
}
function calPsetClear(){
  closeModal();
  dbGetAll('calendar').then(all=>{
    const old=all.find(x=>x.type==='period_set');
    if(old)dbDelete('calendar',old.id);
    renderCalendar();showToast('已清除经期设置');
  });
}
/* 旧单天记录（v3.6.5 兼容）：仍可单独清除 */
function calPeriodClear(date){
  closeModal();
  dbGetAll('calendar').then(all=>{
    const old=all.find(x=>x.date===date&&x.type==='period');
    if(old)dbDelete('calendar',old.id);
    renderCalendar();
  });
}

/* ---------- 视图切换 ---------- */
function calShift(dir){
  calCursor=new Date(calCursor.getFullYear(),calCursor.getMonth()+dir,1);   // v3.9.5：先归一到 1 号再换月，避免 31 日跨到没有 31 号的月份时跳月
  calView='month';calDaySel=null;
  renderCalendar();
}
function calOpenDay(key){
  calView='day';calDaySel=key;
  const d=new Date(key+'T00:00:00');
  if(!isNaN(d))calCursor=new Date(d.getFullYear(),d.getMonth(),1);
  renderCalendar();
}
function calBackToMonth(){calView='month';calDaySel=null;renderCalendar();}
function calBackToToday(){
  calView='month';calDaySel=null;calCursor=new Date();
  renderCalendar();
}
