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
/* 月经量级：1=少(粉) 2=中(黄) 3=多(红) */
const CAL_PERIOD={1:{c:'#f2a8c4',t:'少'},2:{c:'#e6c24a',t:'中'},3:{c:'#e06060',t:'多'}};

/* ---------- 每日快照 ----------
   规则：跨天后（0 点过后）第一次心跳/打开时触发；
   两张便签只要「有内容」就快照进当天：当天已存在同人条目 → 覆盖更新（始终反映当天最新便签），否则新建。
   便签为空 → 当天不写该人条目（同时删除旧的空快照）。 */
async function calMaybeSnap(){
  try{
    if(!window.DB)return;
    const today=calDateKey(new Date());
    if(state.calLastSnapDate===today)return;
    state.calLastSnapDate=today;saveKey('calLastSnapDate');
    const all=await dbGetAll('calendar');
    const mine=(state.notes&&state.notes[0])||{};
    const ta=(state.notes&&state.notes[1])||{};
    const upsert=(who,n)=>{
      const old=all.find(x=>x.date===today&&x.who===who);
      const text=(n.text||'').trim(),mood=(n.mood||'').trim();
      if(!text&&!mood){
        if(old){dbDelete('calendar',old.id);}
        return;
      }
      if(old){
        old.text=text;old.mood=mood;old.at=n.at||Date.now();
        dbPut('calendar',old);
      }else{
        dbPut('calendar',{date:today,who,text,mood,at:n.at||Date.now()});
      }
    };
    upsert('me',mine);
    upsert('ta',ta);
  }catch(e){console.error('cal snap',e);}
}

/* ---------- 渲染 ---------- */
async function renderCalendar(){
  const body=document.getElementById('calendar-body');
  if(!body)return;
  try{await dbReady;}catch(e){}                 // 等 IndexedDB 就绪再渲染（避免异步静默失败）
  await calMaybeSnap();
  const all=await dbGetAll('calendar');
  const byDate={};
  all.forEach(x=>{if(x&&x.date)(byDate[x.date]=byDate[x.date]||[]).push(x);});

  if(calView==='day'&&calDaySel){
    renderCalendarDay(body,byDate[calDaySel]||[]);
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
    const myMood=calMoodEmoji((items.find(x=>x.who==='me')||{}).mood);
    const taMood=calMoodEmoji((items.find(x=>x.who==='ta')||{}).mood);
    const todos=items.filter(x=>x.type==='todo'&&!x.done);
    const period=items.find(x=>x.type==='period');
    const hasAny=items.length>0;
    const isToday=key===todayKey;
    const pdot=period?(CAL_PERIOD[period.level]||CAL_PERIOD[1]).c:'';
    cells+=`<span class="cal-cell${isToday?' today':''}${hasAny?' has':''}" onclick="calOpenDay('${key}')">
      <b class="cal-num">${d}</b>
      <span class="cal-moods">
        <i class="cal-mood ${myMood?'':'none'}">${myMood||''}</i>
        <i class="cal-mood ${taMood?'':'none'}">${taMood||''}</i>
      </span>
      <span class="cal-dots">
        ${todos.length?`<i class="cal-dot todo" title="${todos.length} 项待办"></i>`:''}
        ${pdot?`<i class="cal-dot period" style="background:${pdot}"></i>`:''}
      </span>
    </span>`;
  }
  body.innerHTML=`
    <div class="cal-head">
      <button class="cal-nav" onclick="calShift(-1)">&#8249;</button>
      <span class="cal-title" onclick="calBackToToday()">${y} 年 ${m+1} 月</span>
      <button class="cal-nav" onclick="calShift(1)">&#8250;</button>
      <button class="cal-today" onclick="calBackToToday()">今天</button>
    </div>
    <div class="cal-grid">${head}${cells}</div>
    <div class="cal-legend">
      <span><i style="background:var(--c-purple)"></i>我心情</span>
      <span><i style="background:var(--c-green)"></i>${esc(state.other.name||'TA')}心情</span>
      <span><i style="background:#8a9bb5"></i>待办</span>
      <span><i style="background:#f2a8c4"></i>经期·少</span>
      <span><i style="background:#e6c24a"></i>经期·中</span>
      <span><i style="background:#e06060"></i>经期·多</span>
    </div>
    <div class="empty" style="font-size:12px;line-height:1.9;text-align:left;padding:14px 6px">
      点任意日期可查看当天的便签、待办与经期记录。桌面的两张便签会在每天 0 点后自动记录到这里。${state.calLastSnapDate?`<br><span style="color:var(--hint)">最近一次存档：${state.calLastSnapDate.replace(/-/g,'/')}</span>`:''}
    </div>`;
}

/* 日视图：便签日程 + 待办（增删改）+ 月经记录 */
function renderCalendarDay(body,items){
  const dsel=new Date(calDaySel);
  const whoName={me:state.me.name||'我',ta:state.other.name||'TA'};
  const whoColor={me:'var(--c-purple)',ta:'var(--c-green)'};
  const notes=items.filter(x=>!x.type||x.type==='note').sort((a,b)=>(a.at||0)-(b.at||0));
  const todos=items.filter(x=>x.type==='todo').sort((a,b)=>((a.done||0)-(b.done||0))||((a.at||0)-(b.at||0)));
  const period=items.find(x=>x.type==='period');
  const plv=period?((CAL_PERIOD[period.level]||CAL_PERIOD[1])):null;
  body.innerHTML=`
    <div class="cal-head">
      <button class="cal-nav" onclick="calBackToMonth()">&#8249;</button>
      <span class="cal-title">${dsel.getMonth()+1} 月 ${dsel.getDate()} 日</span>
      <span class="cal-today" style="visibility:hidden">今天</span>
      <button class="cal-today" onclick="calBackToToday()">今天</button>
    </div>
    <div class="cal-ops">
      <button class="cal-op-btn" onclick="calAddTodo('${calDaySel}')">＋ 待办</button>
      <button class="cal-op-btn" onclick="calSetPeriod('${calDaySel}')">${period?'✎ 经期':'＋ 经期'}</button>
      ${period?`<span class="cal-op-tag" style="color:${plv.c};border-color:${plv.c}">经期 · ${plv.t}量</span>`:''}
    </div>
    <div class="cal-section-title">便签</div>
    <div class="cal-daylist">
      ${notes.length?notes.map(it=>`
        <div class="cal-day-item">
          <span class="cal-day-dot" style="background:${whoColor[it.who]||'#888'}"></span>
          <div class="cal-day-main">
            <div class="cal-day-head"><b>${esc(whoName[it.who]||it.who)}</b>
              ${calMoodEmoji(it.mood)?`<span class="cal-day-mood">${calMoodEmoji(it.mood)}</span>`:''}
              <span class="cal-day-time">${calTimeLabel(it.at)}</span></div>
            ${(it.text||'').trim()?`<div class="cal-day-text">${esc(it.text)}</div>`:''}
          </div>
        </div>`).join('')
      :'<div class="empty" style="padding:16px 0">这一天还没有留下便签</div>'}
    </div>
    <div class="cal-section-title">待办 <span style="color:var(--hint);font-size:11px;font-weight:400">（点击勾选完成，可编辑/删除）</span></div>
    <div class="cal-todolist">
      ${todos.length?todos.map(it=>`
        <div class="cal-todo-item${it.done?' done':''}">
          <span class="cal-todo-check${it.done?' on':''}" onclick="calToggleTodo(${it.id})">${it.done?'✓':''}</span>
          <span class="cal-todo-text" onclick="calEditTodo(${it.id})">${esc(it.text)}</span>
          <span class="cal-todo-del" onclick="calDelTodo(${it.id})">&#10005;</span>
        </div>`).join('')
      :'<div class="empty" style="padding:12px 0">还没有待办，点上方「＋ 待办」添加</div>'}
    </div>`;
}

/* ---------- 待办：增删改 ---------- */
function calAddTodo(date){
  appPrompt('新增待办','写一件要做的事（当天有效）：',v=>{
    v=(v||'').trim();if(!v)return false;
    dbPut('calendar',{date,type:'todo',text:v,done:0,at:Date.now()}).then(()=>renderCalendar());
    return true;
  });
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
/* ---------- 月经记录：粉·少 / 黄·中 / 红·多 ---------- */
function calSetPeriod(date){
  dbGetAll('calendar').then(all=>{
    const old=all.find(x=>x.date===date&&x.type==='period');
    const opts=[1,2,3].map(l=>{
      const c=CAL_PERIOD[l];
      return `<div class="modal-item" onclick="calPeriodPick('${date}',${l})"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c.c};vertical-align:middle;margin-right:8px"></span>经期 · ${c.t}量（${c.c}）</div>`;
    }).join('');
    showModal('经期记录',opts+(old?'<div class="modal-item" style="color:#c0392b" onclick="calPeriodClear(\''+date+'\')">清除今天的经期记录</div>':''),
      '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button></div>');
  });
}
function calPeriodPick(date,level){
  closeModal();
  dbGetAll('calendar').then(all=>{
    const old=all.find(x=>x.date===date&&x.type==='period');
    if(old){old.level=level;dbPut('calendar',old);}
    else dbPut('calendar',{date,type:'period',level,at:Date.now()});
    renderCalendar();
  });
}
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
