/* =========================================================
   星迹 · 此间（4.2：氛围页）
   —— 桌面第 2 页第 3 格。此刻的房间氛围 + TA 在做什么 + 一句意象。
   —— 只读展示，按时段换场景，可「换一换」。
   ========================================================= */

const CJ_ROOMS={
  late:['灯还亮着一盏','窗帘没拉严，透进一点夜色','桌上摊着没合上的书','杯子里的水凉了'],
  early:['晨光从窗帘缝里漏进来','屋里还安静着','水壶刚响过','被子还带着温度'],
  day:['光线从窗子斜进来','风把窗帘吹起来一点','房间很静，只有翻页声','阳光落在桌角'],
  night:['灯开了一半','窗外有零星的灯','屋里暖烘烘的','晚饭的碗还没收']
};
const CJ_DOING={
  late:['还没睡，翻着书','坐在窗边','把手机调成了静音','在黑暗里想事情'],
  early:['刚醒，还没完全睁开眼','在烧水','站在窗边透气','又把被子往上拉了拉'],
  day:['在看书，很久没翻页','把窗户开了一条缝','在回消息','在纸上写写划划'],
  night:['在收拾厨房','躺着，什么都没做','把灯调暗了一点','在阳台吹风']
};
const CJ_IMAGES=['空气里有一点很轻的味道，说不上来。','这里很安静，安静得能听见自己的呼吸。','时间在这个房间里走得比别处慢。','像是一个只属于你们两个人的角落。'];

function cjPeriod(){
  const h=new Date().getHours();
  if(h>=23||h<5)return 'late';
  if(h<10)return 'early';
  if(h>=18)return 'night';
  return 'day';
}
function cjLabel(per){return per==='late'?'深夜':per==='early'?'清晨':per==='night'?'夜里':'白天';}

function renderCijian(){
  const body=document.getElementById('cijian-body');
  if(!body)return;
  const per=cjPeriod();
  const pick=a=>a[Math.floor(Math.random()*a.length)];
  const name=(state.other&&state.other.name)||'TA';
  body.innerHTML=`
    <div class="cj-hero">
      <div class="cj-hero-top"><span>${cjLabel(per)} · 此间</span><span>${fmtTime(Date.now())}</span></div>
      <div class="cj-mood">${esc(pick(CJ_ROOMS[per]))}</div>
    </div>
    <div class="list-card">
      <div class="list-card-title">${esc(name)} 在做什么</div>
      <div class="cj-doing">${esc(pick(CJ_DOING[per]))}</div>
    </div>
    <div class="list-card cj-image-card">
      <div class="list-card-title">此刻的意象</div>
      <div class="cj-image">${esc(pick(CJ_IMAGES))}</div>
    </div>
    <button class="btn-pill ghost cj-again" onclick="renderCijian()">换一换</button>
    <div class="cj-hint">这是此刻房间的一点气氛，不会写进聊天记录。</div>`;
}

window.renderCijian=renderCijian;
