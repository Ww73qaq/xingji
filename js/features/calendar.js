/* =========================================================
   星迹 · 日历（v3.6.4）
   - 联动心情便签：每天 0 点后自动把「我的便签 / TA 的便签」快照进当天
   - 月视图：每格显示日期 + 当天心情 emoji（我/TA 各至多一个）
   - 日视图：当天条目像日程一样竖向排列（角色 + 时间 + 心情 + 内容）
   - 一屏可切换：月视图 ↔ 日视图（点日期进入，返回/标题回月视图）
   ========================================================= */

let calView='month';          // 'month' | 'day'
let calCursor=new Date();      // 月视图所在月
let calDaySel=null;            // 选中的日期 'YYYY-MM-DD'
let calMonthCache=null;        // 当前月全部条目缓存

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
  calMonthCache=all;
  const byDate={};
  all.forEach(x=>{if(x&&x.date)(byDate[x.date]=byDate[x.date]||[]).push(x);});

  if(calView==='day'&&calDaySel){
    renderCalendarDay(body,byDate[calDaySel]||[]);
    return;
  }
  // 月视图
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
    const emos=[];
    if(items.length){items.forEach(it=>{const e=calMoodEmoji(it.mood);if(e)emos.push(e);});}
    const isToday=key===todayKey;
    cells+=`<span class="cal-cell${isToday?' today':''}${items.length?' has':''}" onclick="calOpenDay('${key}')">
      <b class="cal-num">${d}</b>
      ${emos.length?`<span class="cal-emos">${emos.map(e=>`<i>${e}</i>`).join('')}</span>`:''}
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
      <span><i style="background:var(--c-purple)"></i>我</span>
      <span><i style="background:var(--c-green)"></i>${esc(state.other.name||'TA')}</span>
      <span style="color:var(--hint)">心情 = 便签心情，每天 0 点后自动存档</span>
    </div>
    <div class="empty" style="font-size:12px;line-height:1.9;text-align:left;padding:14px 6px">
      点任意日期可查看当天两人的便签与心情。桌面的两张便签会在每天 0 点后自动记录到这里，像日程一样留存。${state.calLastSnapDate?`<br><span style="color:var(--hint)">最近一次存档：${state.calLastSnapDate.replace(/-/g,'/')}</span>`:''}
    </div>`;
}

/* 日视图：当天条目竖向排列（日程式） */
function renderCalendarDay(body,items){
  const y=calCursor.getFullYear(),m=calCursor.getMonth();
  const dsel=new Date(calDaySel);
  const whoName={me:state.me.name||'我',ta:state.other.name||'TA'};
  const whoColor={me:'var(--c-purple)',ta:'var(--c-green)'};
  const sorted=items.slice().sort((a,b)=>(a.at||0)-(b.at||0));
  body.innerHTML=`
    <div class="cal-head">
      <button class="cal-nav" onclick="calBackToMonth()">&#8249;</button>
      <span class="cal-title">${dsel.getMonth()+1} 月 ${dsel.getDate()} 日</span>
      <span class="cal-today" style="visibility:hidden">今天</span>
      <button class="cal-today" onclick="calBackToToday()">今天</button>
    </div>
    <div class="cal-daylist">
      ${sorted.length?sorted.map(it=>`
        <div class="cal-day-item">
          <span class="cal-day-dot" style="background:${whoColor[it.who]||'#888'}"></span>
          <div class="cal-day-main">
            <div class="cal-day-head"><b>${esc(whoName[it.who]||it.who)}</b>
              ${calMoodEmoji(it.mood)?`<span class="cal-day-mood">${calMoodEmoji(it.mood)}</span>`:''}
              <span class="cal-day-time">${calTimeLabel(it.at)}</span></div>
            ${(it.text||'').trim()?`<div class="cal-day-text">${esc(it.text)}</div>`:''}
          </div>
        </div>`).join('')
      :'<div class="empty" style="padding:30px 0">这一天还没有留下便签</div>'}
    </div>`;
}

/* ---------- 交互 ---------- */
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
