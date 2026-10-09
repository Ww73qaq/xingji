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

/* ---------- 渲染 ---------- */
async function renderCalendar(){
  const body=document.getElementById('calendar-body');
  if(!body)return;
  try{await dbReady;}catch(e){}                 // 等 IndexedDB 就绪再渲染（避免异步静默失败）
  await calMaybeSnap();
  await ensureTaSchedule();                      // v3.6.8：TA 排班自动补
  const all=await dbGetAll('calendar');
  const byDate={};
  all.forEach(x=>{if(x&&x.date)(byDate[x.date]=byDate[x.date]||[]).push(x);});
  byDate._periodSet=all.find(x=>x.type==='period_set');   // v3.6.6 周期设置（全局一条）

  if(calView==='day'&&calDaySel){
    renderCalendarDay(body,byDate[calDaySel]||[],byDate._periodSet);
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
function renderCalendarDay(body,items,pset){
  const dsel=new Date(calDaySel);
  const whoName={me:state.me.name||'我',ta:state.other.name||'TA'};
  const whoColor={me:'var(--c-purple)',ta:'var(--c-green)'};
  const notes=items.filter(x=>(!x.type||x.type==='note')&&(calScope==='all'||x.who===calScope)).sort((a,b)=>(a.at||0)-(b.at||0));
  const todos=(calScope==='ta')?[]:items.filter(x=>x.type==='todo').sort((a,b)=>((a.done||0)-(b.done||0))||((a.at||0)-(b.at||0)));
  const tasched=(calScope==='me')?[]:items.filter(x=>x.type==='ta_sched').sort((a,b)=>(a.at||0)-(b.at||0));
  const scopedPset=(calScope==='ta')?null:pset;
  const pInfo=scopedPset?calPeriodInfo(calDaySel,scopedPset):{inPeriod:0,ovu:false};
  const oldPeriod=items.find(x=>x.type==='period');
  const dayLevel=pInfo.inPeriod?pInfo.level:(oldPeriod?(oldPeriod.level||1):0);
  const plv=dayLevel?CAL_PERIOD[dayLevel]:null;
  const dayTag=pInfo.inPeriod?('经期 · 第 '+pInfo.inPeriod+' 天'):(pInfo.ovu?'排卵期':'');
  body.innerHTML=`
    ${calTabsHtml()}
    <div class="cal-head">
      <button class="cal-nav" onclick="calBackToMonth()">&#8249;</button>
      <span class="cal-title">${dsel.getMonth()+1} 月 ${dsel.getDate()} 日</span>
      <span class="cal-today" style="visibility:hidden">今天</span>
      <button class="cal-today" onclick="calBackToToday()">今天</button>
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
          <span class="cal-todo-text" onclick="calEditTodo(${it.id})">${esc(it.text)}</span>
          <span class="cal-todo-del" onclick="calDelTodo(${it.id})">&#10005;</span>
        </div>`).join('')
      :'<div class="empty" style="padding:12px 0">还没有待办，点上方「＋ 待办」添加</div>'}
    </div>`:''}
  `;
}

/* v3.6.8：TA 日历——医生排班模板自动排未来 3 天（每天 1~2 条，已有则跳过），心跳/渲染时调用 */
async function ensureTaSchedule(){
  try{await dbReady;}catch(e){}
  const all=await dbGetAll('calendar');
  for(let i=1;i<=3;i++){
    const key=calDateKey(new Date(Date.now()+i*86400000));
    if(all.some(x=>x.date===key&&x.type==='ta_sched'))continue;
    if(Math.random()<0.85){
      const n=1+Math.floor(Math.random()*2);
      const pool=[...TA_SCHEDULE_TEMPLATE];
      for(let k=0;k<n;k++){
        if(!pool.length)break;
        const idx=Math.floor(Math.random()*pool.length);
        const text=pool.splice(idx,1)[0];
        await dbPut('calendar',{date:key,type:'ta_sched',text,at:Date.now()+k});
      }
    }
  }
}

/* ---------- 待办：增删改（v3.6.7 支持批量：一行一件） ---------- */
function calAddTodo(date){
  showModal('新增待办',
    `<div style="font-size:12px;color:var(--hint);margin-bottom:4px">写一件要做的事（当天有效）</div>
     <textarea class="textarea-full" id="cal-todo-input" style="min-height:110px" placeholder="一行一件，可一次添加多件，如：&#10;给 TA 回信&#10;买牛奶&#10;预约挂号"></textarea>
     <div style="font-size:11px;color:var(--hint);margin-top:6px">每行一件，多行 = 批量添加；完成项会自动变灰。</div>`,
    '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button><button class="modal-btn primary" onclick="calAddTodoOk(\''+date+'\')">确定</button></div>');
  setTimeout(()=>{const i=document.getElementById('cal-todo-input');if(i)i.focus();},80);
}
function calAddTodoOk(date){
  const v=(document.getElementById('cal-todo-input')||{}).value||'';
  const lines=v.split(/\n+/).map(s=>s.trim()).filter(Boolean);
  if(!lines.length){showToast('请先输入待办内容');return;}
  closeModal();
  const now=Date.now();
  Promise.all(lines.map((text,i)=>dbPut('calendar',{date,type:'todo',text,done:0,at:now+i}))).then(()=>renderCalendar());
  showToast('已添加 '+lines.length+' 件待办');
}
function calToggleTodo(id){
  dbGetAll('calendar').then(all=>{
    const it=all.find(x=>x.id===id);if(!it)return;
    it.done=it.done?0:1;dbPut('calendar',it).then(()=>renderCalendar());
  });
}
function calEditTodo(id){
  dbGetAll('calendar').then(all=>{
    const it=all.find(x=>x.id===id);if(!it)return;
    appPrompt('编辑待办','修改内容：',v=>{
      v=(v||'').trim();if(!v)return false;
      it.text=v;dbPut('calendar',it).then(()=>renderCalendar());
      return true;
    },it.text);
  });
}
function calDelTodo(id){
  appConfirm('删除待办','确定删除这条待办吗？',async()=>{
    await dbDelete('calendar',id);renderCalendar();
  });
}
/* v3.6.8：TA 日程 手动增删 */
function calAddTaSched(date){
  showModal('添加 TA 日程',
    `<div style="font-size:12px;color:var(--hint);margin-bottom:4px">为 ${esc(state.other.name||'TA')} 安排一条日程</div>
     <input class="textarea-full" id="ta-sched-input" style="min-height:0;padding:9px 10px" placeholder="如：上午 · 门诊" list="ta-sched-list">
     <datalist id="ta-sched-list">${TA_SCHEDULE_TEMPLATE.map(t=>`<option value="${esc(t)}">`).join('')}</datalist>`,
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
  calCursor.setMonth(calCursor.getMonth()+dir);
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
