/* =========================================================
   星迹 · 寻踪（4.0 新增）
   —— 桌面第 2 页的第二个图标：看一眼 TA 此刻在哪、在做什么、什么心情、想对你说什么。
   —— 「在哪 / 在做什么」按当前时段取场景句（深夜他应该在家，不会在门诊）；
      「心情」走 MOOD_POOL；「想对你说」优先从你的字卡库抽一张，库里空才用兜底句。
   —— 只读展示，不写任何数据，也不伪造聊天记录。
   ========================================================= */

const XZ_PLACES = {
  late:  ['书房','卧室','窗边','客厅的沙发上','厨房倒水','阳台上'],
  early: ['门诊楼走廊','值班室','医院楼下的便利店','车里','洗手台前','更衣室'],
  day:   ['办公室','窗边','走廊尽头','楼下的咖啡店','会议室门口','停车场'],
  night: ['家里','书桌前','浴室门口','床边','阳台上吹风','厨房']
};
const XZ_DOING = {
  late:  ['还没睡，翻着一本书','刚把水烧上','在黑暗里躺着看手机','洗完澡，头发还湿着','把明天的衣服挂好'],
  early: ['刚交完班','在写病历','喝着今天第一杯水','把白大褂挂回门后','等电梯'],
  day:   ['在翻一份很厚的病历','刚下手术，靠着墙站了一会儿','在回一条很长的消息','把窗户开了一条缝','在纸上写了几行字又划掉'],
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

async function xzRefresh(){
  const box = document.getElementById('xz-body');
  if(!box) return;
  const per = xzPeriod();
  const pick = arr => arr[Math.floor(Math.random()*arr.length)];
  const moodPool = xzMoodPool(per);
  const say = await xzDrawCardText();
  const name = (state.other && state.other.name) || 'TA';

  box.innerHTML = `
    <div class="xz-card">
      <div class="xz-row"><span class="xz-k">在哪</span><span class="xz-v">${esc(pick(XZ_PLACES[per]))}</span></div>
      <div class="xz-row"><span class="xz-k">在做</span><span class="xz-v">${esc(pick(XZ_DOING[per]))}</span></div>
      <div class="xz-row"><span class="xz-k">心情</span><span class="xz-v">${esc(pick(moodPool))}</span></div>
    </div>
    <div class="xz-say">
      <div class="xz-say-label">${esc(name)} 想对你说</div>
      <div class="xz-say-text">${esc(say)}</div>
    </div>
    <div class="xz-hint">这是此刻的一点动静，不会写进聊天记录。</div>`;
}

function openXunzong(){
  showModal('寻踪',
    '<div id="xz-body"></div>',
    '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">关闭</button><button class="modal-btn primary" onclick="xzRefresh()">换一换</button></div>');
  xzRefresh();
}

window.openXunzong = openXunzong;
window.xzRefresh = xzRefresh;
