/* =========================================================
   星迹 · 寻踪（4.1：独立页面，不再是弹窗）
   —— 看一眼 TA 此刻在哪、在做什么、什么心情、想对你说什么。
   —— 「在哪 / 在做」按当前时段取场景句：深夜他应该在家，不会在上班。
   —— 「心情」走 MOOD_POOL 并按时段过滤；「想对你说」优先从你的字卡库抽一张。
   —— 只读展示，不写任何数据，也不伪造聊天记录。
   ========================================================= */

const XZ_PLACES = {
  late:  ['书房','卧室','窗边','客厅的沙发上','厨房','阳台上'],
  early: ['床上','窗边','厨房','浴室门口','阳台上','客厅'],
  day:   ['窗边','书桌前','楼下的巷子口','常去的咖啡店','公园长椅上','回来的路上'],
  night: ['家里','书桌前','厨房','床边','阳台上','客厅地板上']
};
const XZ_DOING = {
  late:  ['还没睡，翻着一本书','刚把水烧上','在黑暗里躺着看手机','洗完澡，头发还湿着','把明天的衣服挂好'],
  early: ['刚醒，还没完全睁开眼','喝着今天第一杯水','在窗边站了一会儿','把窗帘拉开','又躺回去五分钟'],
  day:   ['在翻一本书，很久没翻页','把窗户开了一条缝','在回一条很长的消息','在纸上写了几行字又划掉','刚出门，没什么目的'],
  night: ['在收拾厨房','躺着，什么都没做','把灯关了一半','在阳台吹风','刚洗完澡']
};

function xzPeriod(){
  const h = new Date().getHours();
  if(h >= 23 || h < 5) return 'late';
  if(h >= 5 && h < 10) return 'early';
  if(h >= 18) return 'night';
  return 'day';
}

async function xzDrawCardText(){
  try{
    const cards = await dbGetAll('cards');
    if(cards && cards.length){
      const pool = cards.filter(c=>c && c.text && String(c.text).length <= 30);
      const src = pool.length ? pool : cards;
      const pick = src[Math.floor(Math.random()*src.length)];
      if(pick && pick.text) return pick.text;
    }
  }catch(e){}
  const fb = ['今天有点想你，不太想承认。','你那边冷不冷。','早点睡，别熬。','我在，不用回。','慢慢来，不急。'];
  return fb[Math.floor(Math.random()*fb.length)];
}

/* 心情也要跟时段对齐：下午三点写「睡觉」会很假，深夜写「兴奋」也不像他 */
function xzMoodPool(per){
  const all = (typeof MOOD_POOL !== 'undefined' && MOOD_POOL.length) ? MOOD_POOL : ['😶 发呆','🕊️ 平静'];
  const noSleep = all.filter(m=>!/睡觉/.test(m));
  let pool;
  if(per === 'late') pool = noSleep.filter(m=>/发呆|疲惫|平静|思考|想你|低落/.test(m));
  else if(per === 'night') pool = noSleep.filter(m=>!/兴奋/.test(m));
  else if(per === 'early') pool = noSleep.filter(m=>/开心|平静|思考|美好|听歌/.test(m));
  else pool = noSleep.filter(m=>!/疲惫|低落/.test(m));
  return (pool && pool.length) ? pool : noSleep.filter(Boolean);
}

/* 时段标签：让「此刻」这件事有实感，不是一堆随机的句子 */
function xzPeriodLabel(per){
  return per==='late' ? '深夜' : per==='early' ? '清早' : per==='night' ? '夜里' : '白天';
}

async function xzRefresh(){
  const box = document.getElementById('xz-body');
  if(!box) return;
  const per = xzPeriod();
  const pick = arr => arr[Math.floor(Math.random()*arr.length)];
  const moodPool = xzMoodPool(per);
  const say = await xzDrawCardText();
  const name = (state.other && state.other.name) || 'TA';

  box.innerHTML = `
    <div class="xz-hero">
      <div class="xz-hero-top"><span class="xz-hero-period">${xzPeriodLabel(per)}</span><span class="xz-hero-time">${fmtTime(Date.now())}</span></div>
      <div class="xz-hero-main">
        <div class="xz-hero-ava" id="xz-hero-ava"></div>
        <div class="xz-hero-text">
          <div class="xz-hero-name">${esc(name)}</div>
          <div class="xz-hero-state">${esc(pick(moodPool))}</div>
        </div>
      </div>
    </div>

    <div class="list-card">
      <div class="xz-row"><span class="xz-k">在哪</span><span class="xz-v">${esc(pick(XZ_PLACES[per]))}</span></div>
      <div class="xz-row"><span class="xz-k">在做</span><span class="xz-v">${esc(pick(XZ_DOING[per]))}</span></div>
      <div class="xz-row"><span class="xz-k">心情</span><span class="xz-v">${esc(pick(moodPool))}</span></div>
    </div>

    <div class="xz-say">
      <div class="xz-say-label">${esc(name)} 想对你说</div>
      <div class="xz-say-text">${esc(say)}</div>
    </div>

    <button class="btn-pill ghost xz-again" onclick="xzRefresh()">换一换</button>
    <div class="xz-hint">这是此刻的一点动静，不会写进聊天记录。</div>`;

  /* 头像同步（与桌面/聊天同一个 TA 头像） */
  try{
    const ava=document.getElementById('xz-hero-ava');
    if(ava){
      const src=(state.other&&state.other.avatar)||'';
      ava.innerHTML=src?`<img src="${esc(src)}" alt="">`:'';
      if(!src)ava.textContent=((state.other&&state.other.name)||'TA').slice(0,1);
    }
  }catch(e){}
}

/* 独立页面渲染入口（nav.js 注册 openApp('whereabouts') 时调用） */
function renderWhereabouts(){ return xzRefresh(); }

/* 兼容旧入口：桌面图标/旧调用点仍然叫 openXunzong，但改为进页面 */
function openXunzong(){ openApp('whereabouts'); }

window.openXunzong = openXunzong;
window.xzRefresh = xzRefresh;
window.renderWhereabouts = renderWhereabouts;
