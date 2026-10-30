/* =========================================================
   星迹 · 占卜（塔罗 / 雷诺曼）
   4.0 新增：聊天附加功能里的一格「占卜」，也是独立页面 app-divination。
   —— 塔罗 78 张（22 大阿卡纳 + 56 小阿卡纳），带正逆位。
       **不使用「过去·现在·未来」牌阵**：默认抽 1 张，也可抽 3 张合读，
       三张不分配位置含义，只看整体。
   —— 雷诺曼 36 张（标准雷诺曼牌数），直接抽。
   —— 牌面用纯 CSS + 字形绘制，不使用任何第三方牌图（版权考虑）。
   —— 记录：复制 / 再提问（沿用同一副牌换问题重解）/ 修改问题 / 删除 / 清空 / 发给 TA。
   —— 解读文案为星迹自写，不照搬 mochi 文本。
   ========================================================= */

/* ---------- 塔罗 · 大阿卡纳（22） ---------- */
/* [罗马数字, 牌名, 正位, 逆位, 基调 g/m/w] */
const DV_MAJOR = [
  ['0',   '愚者',   '一个新的开始，你还不知道路，但脚已经抬起来了', '有点冒失，先看清再走', 'm'],
  ['I',   '魔术师', '你想做的事，手上有料，能成', '用力过猛，或者只是声势', 'g'],
  ['II',  '女祭司', '答案在你心里，安静下来就听得见', '你在骗自己，或者假装不知道', 'm'],
  ['III', '皇后',   '被善待，也有余力去善待别人', '付出过了头，自己空了', 'g'],
  ['IV',  '皇帝',   '立得住，事情有结构', '太硬，或者那个权威塌了', 'g'],
  ['V',   '教皇',   '有现成的路可以走，有人可以问', '不想再按别人的规矩来', 'm'],
  ['VI',  '恋人',   '对上了，也到了要选的时候', '错位，或者迟迟不选', 'g'],
  ['VII', '战车',   '往前推，方向在你手里', '有点失控，别硬冲', 'g'],
  ['VIII','力量',   '不是硬扛，是温和地按住', '在硬撑，内耗得厉害', 'g'],
  ['IX',  '隐者',   '需要一个人待一段，自己走', '关得太紧，成了躲', 'm'],
  ['X',   '命运之轮','转机来了，事情自己在动', '卡住了，时候还没到', 'g'],
  ['XI',  '正义',   '该怎样就怎样，秤是平的', '失衡，有一边被亏待了', 'm'],
  ['XII', '倒吊人', '暂停一下，换个角度看', '白等，牺牲得没有意义', 'm'],
  ['XIII','死神',   '一件事结束了，新的才有位置', '不肯放手，拖着', 'w'],
  ['XIV', '节制',   '刚刚好，不多不少', '过量了，或者失衡', 'g'],
  ['XV',  '恶魔',   '明知不该，还是被绑着', '开始松开了，看清了那根绳', 'w'],
  ['XVI', '塔',     '塌了，但塌的是不该留的', '勉强撑着，崩得晚一点', 'w'],
  ['XVII','星星',   '远处有光，会慢慢好起来', '看不到方向，先别急', 'g'],
  ['XVIII','月亮',  '看不清，情绪比事实大', '雾在散，真相浮出来了', 'w'],
  ['XIX', '太阳',   '明朗，被照亮，也照亮别人', '只是短暂的阴，还没全亮', 'g'],
  ['XX',  '审判',   '该清算的清算，可以重新开始', '不肯面对，一直绕开', 'm'],
  ['XXI', '世界',   '走完一站，圆满了', '差最后一步，还差一点', 'g']
];

/* ---------- 塔罗 · 小阿卡纳（4 花色 × 14） ---------- */
/* 每个花色：名称、字、牌组基调修正 */
const DV_SUITS = [
  { name:'权杖', ch:'杖', domain:'行动与热情', ranks:[
    ['王牌','一个念头点着了','还没动手就熄了','g'],
    ['二','站在岔口，先看远处','迟迟不选','m'],
    ['三','已经在路上了','进展被拖住','g'],
    ['四','安稳一下，值得','待不住','g'],
    ['五','小摩擦，别放大','无谓的争','w'],
    ['六','被看见了，赢了这一场','赢在外，空在内','g'],
    ['七','守住你的位置','守得太累','m'],
    ['八','一切在加速','快了，但乱','g'],
    ['九','撑到最后一点','太戒备了','m'],
    ['十','背得太多','该放下了','w'],
    ['侍从','有个新消息在路上','只是想想而已','m'],
    ['骑士','冲出去','莽','g'],
    ['王后','热烈又大方','烧过头了','g'],
    ['国王','有主见地带着走','太强势','g']
  ]},
  { name:'圣杯', ch:'杯', domain:'情感与关系', ranks:[
    ['王牌','心被打开了','关起来了','g'],
    ['二','两个人对上了','错位','g'],
    ['三','一起庆祝','热闹里的孤单','g'],
    ['四','有点腻了，别看漏','重新看见','m'],
    ['五','为洒掉的难过','转身还有两杯','w'],
    ['六','旧人旧事回来了','困在过去','m'],
    ['七','选择太多，都是幻','看清了','m'],
    ['八','离开熟悉的，去找更好的','舍不得走','m'],
    ['九','如愿','得到了还是空','g'],
    ['十','圆满安稳','表面和睦','g'],
    ['侍从','一点小小的温柔','幼稚的情绪','m'],
    ['骑士','跟着心走','一时冲动','g'],
    ['王后','柔软，也容得下','付出过头','g'],
    ['国王','情绪稳得住','压着不说','m']
  ]},
  { name:'宝剑', ch:'剑', domain:'思考与言语', ranks:[
    ['王牌','看清了，也痛','说不清','m'],
    ['二','僵持，两边都不想伤','不得不选','m'],
    ['三','一句话扎进来','慢慢在好','w'],
    ['四','该歇了','停不下来','m'],
    ['五','赢了也难受','算了','w'],
    ['六','离开动荡，往前渡','走不动','g'],
    ['七','有所保留','被拆穿','w'],
    ['八','自己把自己困住','松了一点','w'],
    ['九','夜里想太多','天亮了','w'],
    ['十','到底了，可以翻页','还没到底','w'],
    ['侍从','留意消息和细节','多疑','m'],
    ['骑士','直说，快','话太利','m'],
    ['王后','清醒又体谅','冷','m'],
    ['国王','讲道理，定规矩','太硬','m']
  ]},
  { name:'星币', ch:'币', domain:'现实与身体', ranks:[
    ['王牌','一个实在的开始','落不了地','g'],
    ['二','两头顾，先排一下','失衡','m'],
    ['三','有人一起做','配合不好','g'],
    ['四','守住已有的','攥得太紧','m'],
    ['五','缺，先顾眼前','有人递手','w'],
    ['六','给与受，都坦然','付出不平衡','g'],
    ['七','先看着，别急着收','白等','m'],
    ['八','手上的事，一点点做','重复得厌倦','g'],
    ['九','自己过得不错','只是表面体面','g'],
    ['十','落定，长久','家里的裂缝','g'],
    ['侍从','学起来，慢慢来','眼高手低','m'],
    ['骑士','稳着推','太慢，或者太固执','m'],
    ['王后','照顾得妥帖','操心过度','g'],
    ['国王','做成事的人','只认数字','g']
  ]}
];

/* ---------- 雷诺曼（36 张标准牌） ---------- */
/* [序号, 牌名, 图案, 正意, 提醒面] */
const DV_LENOR = [
  [1,'骑士','🐎','消息要来了，而且来得快','消息迟到，或只是空跑一趟'],
  [2,'四叶草','🍀','小运气，短但够用','运气一闪就过，别指望太久'],
  [3,'船','⛵','远方的事在动，可能要离开一段','船没来，或者你还没上'],
  [4,'房子','🏠','家、安稳、可以待着的地方','家里的裂缝，或者待不住'],
  [5,'树','🌳','慢慢长，身体和关系都需要时间','长歪了，或者停在那里不动'],
  [6,'云','☁️','不明朗，先别下判断','雾在散，慢慢能看清'],
  [7,'蛇','🐍','有拐弯，有人绕了路','绕的弯被看清了'],
  [8,'棺材','⚰️','一件事真的结束了','拖着不肯埋'],
  [9,'花束','💐','被示好，被善待','好意有点表面'],
  [10,'镰刀','🌾','突然切断，很快','伤口还在，别急着碰'],
  [11,'鞭子','🪢','反复、争执、绕回同一个点','争累了，开始停'],
  [12,'鸟','🐦','消息多，闲话也多','说得太多，听不见重点'],
  [13,'孩子','🧒','新的、小的、刚开始','太幼稚，或者不负责任'],
  [14,'狐狸','🦊','要看清楚，有人不一定直说','看穿了，也就不用再猜'],
  [15,'熊','🐻','力量、权威、有人镇得住','压得太重'],
  [16,'星星','⭐','有指引，远处有光','光太远，先自己走'],
  [17,'鹳','🕊️','变化、搬迁、换一个地方','该变没变'],
  [18,'狗','🐕','忠诚、可靠的朋友','依赖过头'],
  [19,'塔','🗼','隔开、体制、独自站高','那道墙开始松'],
  [20,'花园','🌷','公开的场合、社交、被看见','表面热闹'],
  [21,'山','⛰️','阻碍，绕不过去只能翻','阻碍在变小'],
  [22,'十字路口','🛤️','要选，而且必须选','终于选了'],
  [23,'老鼠','🐁','损耗、被一点点啃掉','止住了'],
  [24,'心','❤️','爱，真心','爱里掺了别的东西'],
  [25,'戒指','💍','约定、承诺、绕成一个圈','约定松了，或者循环'],
  [26,'书','📖','未知、还没揭开的部分','要揭开了'],
  [27,'信','✉️','文字的消息，会留下痕迹','消息没到，或者被压下'],
  [28,'男人','👤','关键的那个他','他不在场，或退开了'],
  [29,'女人','👩','关键的那个她','她不在场，或退开了'],
  [30,'百合','🌼','平静、成熟、年长的护持','太淡了，缺一点火'],
  [31,'太阳','☀️','明朗、成功、被照亮','云遮了一下，还会出来'],
  [32,'月亮','🌙','名声、情绪、被很多人看着','情绪退了，看清了'],
  [33,'钥匙','🗝️','关键、确定、门能开','钥匙不对，或者还没找到'],
  [34,'鱼','🐟','钱、流动、丰足','流走了，或者没接住'],
  [35,'锚','⚓','稳定、扎根、留得住','锚松了'],
  [36,'十字架','✝️','承担、宿命、不得不背','可以放下了']
];

/* 雷诺曼不分正逆位（传统如此）；每张牌的基调单独给，避免所有解读都落在同一句 */
const DV_LENOR_TONE = {
  1:'g', 2:'g', 4:'g', 9:'g', 16:'g', 17:'g', 18:'g', 20:'g', 24:'g',
  25:'g', 30:'g', 31:'g', 33:'g', 34:'g', 35:'g',
  6:'w', 7:'w', 8:'w', 10:'w', 11:'w', 14:'w', 19:'w', 21:'w', 23:'w', 36:'w'
};

/* 牌阶短字（只用于牌面主字形，不影响牌名） */
const DV_RANK_CH = {
  '王牌':'A','二':'2','三':'3','四':'4','五':'5','六':'6','七':'7',
  '八':'8','九':'9','十':'10','侍从':'侍','骑士':'骑','王后':'后','国王':'国'
};

/* ---------- 模块状态 ---------- */
let dvMode = 'tarot';       // tarot | lenormand
let dvCount = 1;            // 1 | 3
let dvQuestion = '';
let dvDrawn = [];           // [{name, rev, meaning, tone, glyph}]
let dvReading = null;       // {headline, body, action}
let dvBusy = false;
let dvRecordId = null;      // 当前这次抽牌对应的记录 id

function dvWait(ms){ return new Promise(r=>setTimeout(r,ms)); }

/* ---------- 牌库构造 ---------- */
function dvDeck(){
  if(dvMode === 'lenormand'){
    /* 雷诺曼：主字形直接是图案 emoji */
    return DV_LENOR.map(c=>({
      name: c[1], top: '', big: c[2],
      upright: c[3], reversed: c[4],
      tone: DV_LENOR_TONE[c[0]] || 'm'
    }));
  }
  /* 塔罗大阿卡纳：角标 ✦，主字形用罗马数字（最接近真牌的观感） */
  const out = DV_MAJOR.map(c=>({
    name: c[1], top: '✦', big: c[0],
    upright: c[2], reversed: c[3], tone: c[4]
  }));
  /* 小阿卡纳：角标是花色字，主字形是牌阶字 */
  DV_SUITS.forEach(s=>{
    s.ranks.forEach(r=>{
      out.push({
        name: s.name + r[0],
        top: s.ch,
        big: DV_RANK_CH[r[0]] || r[0][0],
        upright: r[1],
        reversed: r[2],
        tone: r[3]
      });
    });
  });
  return out;
}

/* 逆位时基调翻转：吉转慎、慎转吉、中保持中 */
function dvFlipTone(t){
  if(t === 'g') return 'w';
  if(t === 'w') return 'g';
  return 'm';
}

/* ---------- 页码壳：抽牌 / 渲染 ---------- */
function openDivination(){
  if(typeof openApp === 'function') openApp('divination');
}

function dvSetMode(m){
  if(dvBusy || dvMode === m) return;
  dvMode = m;
  dvDrawn = []; dvReading = null; dvRecordId = null;
  renderDivination();
}

function dvSetCount(n){
  if(dvBusy || dvCount === n) return;
  dvCount = n;
  dvDrawn = []; dvReading = null; dvRecordId = null;
  renderDivination();
}

function renderDivination(){
  const body = document.getElementById('divination-body');
  if(!body) return;
  const tabBtn = (k,label)=>`<button type="button" class="tab${dvMode===k?' active':''}" onclick="dvSetMode('${k}')">${label}</button>`;

  body.innerHTML = `
    <div class="list-card">
      <div class="tabs" style="margin:0 0 10px">${tabBtn('tarot','塔罗')}${tabBtn('lenormand','雷诺曼')}</div>
      <div class="dv-note">${dvMode==='tarot'
        ? '塔罗 78 张，带正逆位。不摆「过去·现在·未来」，抽到哪张就看哪张。'
        : '雷诺曼 36 张，讲的是很具体的事。一张就够。'}</div>
    </div>

    <div class="list-card">
      <div class="dv-label">你想问的<span class="dv-opt">（可以不填）</span></div>
      <textarea class="textarea-full" id="dv-q" maxlength="120" placeholder="写在心里也行，写下来会更清楚"
        style="min-height:64px" oninput="dvQuestion=this.value">${esc(dvQuestion)}</textarea>
      <div class="dv-row" style="margin-top:10px">
        <button type="button" class="btn-pill ${dvCount===1?'primary':'ghost'} dv-count" onclick="dvSetCount(1)">一张</button>
        <button type="button" class="btn-pill ${dvCount===3?'primary':'ghost'} dv-count" onclick="dvSetCount(3)">三张</button>
      </div>
      <button type="button" class="btn-pill primary dv-draw${dvBusy?' off':''}" onclick="dvDraw()">抽牌</button>
    </div>

    <div class="dv-stage" id="dv-stage"></div>
    <div id="dv-read"></div>

    <div class="list-card" id="dv-records"></div>
  `;
  renderDvStage();
  renderDvReading();
  renderDvRecords();
}

/* 牌面：背面 → 逐张翻开 */
function renderDvStage(){
  const stage = document.getElementById('dv-stage');
  if(!stage) return;
  if(!dvDrawn.length){ stage.innerHTML = ''; return; }
  stage.innerHTML = dvDrawn.map((c,i)=>`
    <div class="dv-card" id="dv-c${i}">
      <div class="dv-face dv-back"><span class="dv-back-mark">✦</span></div>
      <div class="dv-face dv-front">
        <div class="dv-num">${esc(c.top||'')}</div>
        <div class="dv-glyph${c.rev?' rev':''}">${esc(c.big||'✦')}</div>
        <div class="dv-name">${esc(c.name)}</div>
        <div class="dv-pos${c.rev?' rev':''}">${c.rev?'逆位':'正位'}</div>
      </div>
    </div>`).join('');
}

/* 解读区 */
function renderDvReading(){
  const box = document.getElementById('dv-read');
  if(!box) return;
  if(!dvReading){ box.innerHTML = ''; return; }
  const cards = dvDrawn.map(c=>`
    <div class="dv-line">
      <span class="dv-line-name">${esc(c.name)}</span>
      <span class="dv-line-pos">${c.rev?'逆位':'正位'}</span>
      <div class="dv-line-mean">${esc(c.meaning)}</div>
    </div>`).join('');
  box.innerHTML = `
    <div class="list-card dv-result">
      <div class="dv-res-head">${esc(dvReading.headline)}</div>
      <div class="dv-res-body">${esc(dvReading.body)}</div>
      <div class="dv-cards-detail">${cards}</div>
      <div class="dv-res-action">${esc(dvReading.action)}</div>
      <div class="dv-res-btns">
        <button type="button" class="btn-pill ghost" onclick="dvCopy()">复制</button>
        <button type="button" class="btn-pill ghost" onclick="dvSendToChat()">发给 TA</button>
        <button type="button" class="btn-pill ghost" onclick="dvReask()">再提问</button>
      </div>
    </div>`;
}

/* ---------- 抽牌 ---------- */
async function dvDraw(){
  if(dvBusy) return;
  const qEl = document.getElementById('dv-q');
  if(qEl) dvQuestion = qEl.value || '';
  dvBusy = true;
  dvDrawn = []; dvReading = null; dvRecordId = null;
  renderDvStage(); renderDvReading();
  const drawBtn = document.querySelector('.dv-draw');
  if(drawBtn){ drawBtn.classList.add('off'); drawBtn.textContent = '洗牌中…'; }

  /* 洗牌：先摆出牌背，抖一下 */
  const stage = document.getElementById('dv-stage');
  if(stage){
    const n = dvCount === 3 ? 5 : 3;
    stage.innerHTML = Array.from({length:n},(_,i)=>`
      <div class="dv-card dv-shuffling" style="animation-delay:${i*70}ms">
        <div class="dv-face dv-back"><span class="dv-back-mark">✦</span></div>
      </div>`).join('');
  }
  await dvWait(720);

  const deck = dvDeck();
  /* Fisher–Yates 洗牌，再取前 N 张 */
  for(let i=deck.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [deck[i],deck[j]] = [deck[j],deck[i]];
  }
  dvDrawn = deck.slice(0, dvCount).map(c=>{
    /* 塔罗有正逆位；雷诺曼传统上不分正逆，永远按正位算 */
    const rev = dvMode === 'tarot' && Math.random() < 0.36;
    return {
      name: c.name,
      top: c.top,
      big: c.big,
      rev,
      meaning: rev ? c.reversed : c.upright,
      tone: rev ? dvFlipTone(c.tone) : c.tone
    };
  });

  renderDvStage();
  await dvWait(120);
  for(let i=0;i<dvDrawn.length;i++){
    const el = document.getElementById('dv-c'+i);
    if(el) el.classList.add('flipped');
    await dvWait(430);
  }

  dvReading = dvComposeReading();
  renderDvReading();
  dvSaveRecord();
  if(drawBtn){ drawBtn.classList.remove('off'); drawBtn.textContent = '再抽一次'; }
  dvBusy = false;
}

/* ---------- 解读生成（自写文案，按基调组合） ---------- */
function dvComposeReading(){
  const q = (dvQuestion||'').trim();
  const goods = dvDrawn.filter(c=>c.tone==='g').length;
  const warns = dvDrawn.filter(c=>c.tone==='w').length;
  const revs = dvDrawn.filter(c=>c.rev).length;
  const score = goods - warns;

  let headline;
  if(score >= 2) headline = '这一次，牌是站在你这边。';
  else if(score === 1) headline = '偏顺，但还需要你自己走。';
  else if(score === 0) headline = '不好也不坏，看你怎么落子。';
  else if(score === -1) headline = '有一点阻力，别急着硬推。';
  else headline = '牌面不太顺，先收一收。';

  const lines = [];
  if(q) lines.push(`你问的是「${q}」。`);
  else lines.push('你没有写下具体的问题，那就当它是一句提醒。');

  if(dvDrawn.length === 1){
    const c = dvDrawn[0];
    lines.push(`抽到${c.name}${c.rev?'（逆位）':''}：${c.meaning}。`);
  }else{
    lines.push('三张一起看：');
    dvDrawn.forEach(c=>lines.push(`· ${c.name}${c.rev?'（逆位）':''}——${c.meaning}`));
    if(score >= 1) lines.push('它们指向同一个方向，没有互相打架。');
    else if(score <= -1) lines.push('三张里有拉扯，说明这件事还卡在一个没解决的点上。');
    else lines.push('它们的意思不完全一致，说明现在还不是下判断的时候。');
  }
  if(revs >= 2) lines.push('逆位偏多——不是不好，是「还没到时候」或者「你其实知道，只是没承认」。');

  const actions = {
    good: ['先动那一步，别等全都想清楚。','把已经有的先握住，再谈别的。','可以直接说出口，这次不会说错。'],
    mid:  ['先看清楚再动，不用今天就决定。','把问题写下来，写的过程会给你答案。','等一两天，让事情自己显出形状。'],
    warn: ['先停一下，别在情绪里做决定。','守好现有的，别在这个时候开新的口子。','把该放下的放下，位置才空得出来。']
  };
  const key = score >= 1 ? 'good' : score <= -1 ? 'warn' : 'mid';
  const pool = actions[key];
  const action = pool[Math.floor(Math.random()*pool.length)];

  return { headline, body: lines.join('\n'), action };
}

/* ---------- 记录 ---------- */
function dvRecords(){
  if(!Array.isArray(state.divinations)) state.divinations = [];
  return state.divinations;
}

function dvSaveRecord(){
  if(!dvReading || !dvDrawn.length) return;
  const rec = {
    id: Date.now(),
    deck: dvMode,
    question: (dvQuestion||'').trim(),
    cards: dvDrawn.map(c=>({name:c.name,rev:c.rev,meaning:c.meaning})),
    headline: dvReading.headline,
    body: dvReading.body,
    action: dvReading.action,
    time: Date.now()
  };
  const list = dvRecords();
  /* 同一副牌「再提问 / 改问题」时原地更新这条，而不是再塞一条重复记录 */
  const exist = dvRecordId ? list.find(r=>r.id === dvRecordId) : null;
  if(exist){
    exist.deck = rec.deck;
    exist.question = rec.question;
    exist.cards = rec.cards;
    exist.headline = rec.headline;
    exist.body = rec.body;
    exist.action = rec.action;
    exist.time = rec.time;
  }else{
    dvRecordId = rec.id;
    list.unshift(rec);
  }
  if(list.length > 60) list.length = 60;   /* 只留最近 60 条，避免本地存储膨胀 */
  saveKey('divinations');
  renderDvRecords();
}

function dvBuildText(rec){
  const deckName = rec.deck === 'lenormand' ? '雷诺曼' : '塔罗';
  const d = new Date(rec.time);
  const pad = n => String(n).padStart(2,'0');
  const when = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const cards = rec.cards.map(c=>`${c.name}${c.rev?'（逆位）':''}`).join(' · ');
  return `${deckName} · ${when}${rec.question?`\n问：${rec.question}`:''}\n牌：${cards}\n\n${rec.headline}\n${rec.body}\n\n${rec.action}\n\n—— 星迹占卜`;
}

function renderDvRecords(){
  const box = document.getElementById('dv-records');
  if(!box) return;
  const list = dvRecords();
  if(!list.length){
    box.innerHTML = `<div class="list-card-title">占卜记录</div>
      <div class="dv-empty">还没有记录。抽过的牌会留在这里。</div>`;
    return;
  }
  box.innerHTML = `<div class="list-card-title">占卜记录</div>
    <div class="dv-rec-list">` + list.map(r=>{
      const deckName = r.deck === 'lenormand' ? '雷诺曼' : '塔罗';
      const cards = r.cards.map(c=>c.name+(c.rev?'(逆)':'')).join(' · ');
      return `<div class="dv-rec">
        <div class="dv-rec-top"><span class="dv-rec-deck">${deckName}</span><span class="dv-rec-time">${fmtFull(r.time)}</span></div>
        <div class="dv-rec-q">${r.question?esc(r.question):'<span class="dv-rec-noq">没有写下问题</span>'}</div>
        <div class="dv-rec-cards">${esc(cards)}</div>
        <div class="dv-rec-btns">
          <button type="button" class="dv-mini" onclick="dvRecCopy(${r.id})">复制</button>
          <button type="button" class="dv-mini" onclick="dvRecReask(${r.id})">再提问</button>
          <button type="button" class="dv-mini" onclick="dvRecEdit(${r.id})">改问题</button>
          <button type="button" class="dv-mini danger" onclick="dvRecDelete(${r.id})">删除</button>
        </div>
      </div>`;
    }).join('') + `</div>
    <button type="button" class="btn-pill ghost" style="width:100%;margin-top:10px" onclick="dvClearRecords()">清空记录</button>`;
}

function dvFindRec(id){
  return dvRecords().find(r=>r.id === Number(id));
}

function dvCopyText(text){
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(()=>showToast('已复制'),()=>dvCopyFallback(text));
    }else dvCopyFallback(text);
  }catch(e){ dvCopyFallback(text); }
}
function dvCopyFallback(text){
  try{
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('已复制');
  }catch(e){ showToast('复制失败，请长按选择'); }
}

function dvCopy(){
  if(!dvReading) return;
  const rec = {deck:dvMode, question:dvQuestion, cards:dvDrawn.map(c=>({name:c.name,rev:c.rev})), headline:dvReading.headline, body:dvReading.body, action:dvReading.action, time:Date.now()};
  dvCopyText(dvBuildText(rec));
}

function dvSendToChat(){
  if(!dvReading || !dvDrawn.length) return;
  const rec = {deck:dvMode, question:dvQuestion, cards:dvDrawn.map(c=>({name:c.name,rev:c.rev})), headline:dvReading.headline, body:dvReading.body, action:dvReading.action, time:Date.now()};
  const text = dvBuildText(rec);
  if(typeof sendMessageObject === 'function'){
    sendMessageObject({type:'text', content:text});
    showToast('已发给 TA');
  }else showToast('暂时发不出去');
}

/* 「再提问」：沿用同一副牌，换一个问题重新解读 */
async function dvReask(){
  if(dvBusy || !dvDrawn.length) return;
  askText('换个问题', dvQuestion || '', '牌不变，重新解读', (q)=>{
    dvQuestion = q;
    dvReading = dvComposeReading();
    const qEl = document.getElementById('dv-q');
    if(qEl) qEl.value = dvQuestion;
    renderDvReading();
    dvSaveRecord();
  });
}

/* 记录上的「再提问」：把那副牌载回牌桌，再问 */
async function dvRecReask(id){
  const r = dvFindRec(id);
  if(!r) return;
  askText('换个问题', r.question || '', '沿用这次的牌', (q)=>{ dvRecReaskGo(r, q); });
}
async function dvRecReaskGo(r, q){
  dvMode = r.deck; dvCount = r.cards.length;
  dvDrawn = r.cards.map(c=>({name:c.name, top:'', big:'✦', rev:!!c.rev, meaning:c.meaning, tone:'m'}));
  dvQuestion = q;
  dvReading = dvComposeReading();
  dvRecordId = r.id;
  renderDivination();
  /* 已翻开的态：直接给翻开的样子 */
  dvDrawn.forEach((_,i)=>{ const el=document.getElementById('dv-c'+i); if(el) el.classList.add('flipped','no-anim'); });
  renderDvReading();
  dvSaveRecord();
  window.scrollTo({top:0,behavior:'smooth'});
}

/* 「改问题」：改这一条记录的问题并重新解读 */
async function dvRecEdit(id){
  const r = dvFindRec(id);
  if(!r) return;
  askText('修改这次的问题', r.question || '', '改完会重新解读', (q)=>{ dvRecEditGo(r, q); });
}
function dvRecEditGo(r, q){
  r.question = q;
  /* 用记录里的牌重算解读 */
  const saved = {mode:dvMode, q:dvQuestion, drawn:dvDrawn};
  dvMode = r.deck; dvQuestion = r.question;
  dvDrawn = r.cards.map(c=>({name:c.name, top:'', big:'✦', rev:!!c.rev, meaning:c.meaning, tone:'m'}));
  const reading = dvComposeReading();
  dvDrawn = saved.drawn; dvMode = saved.mode; dvQuestion = saved.q;
  r.headline = reading.headline; r.body = reading.body; r.action = reading.action;
  saveKey('divinations');
  renderDvRecords();
  showToast('已更新');
}

function dvRecCopy(id){
  const r = dvFindRec(id);
  if(r) dvCopyText(dvBuildText(r));
}

function dvRecDelete(id){
  const list = dvRecords();
  const i = list.findIndex(r=>r.id === Number(id));
  if(i < 0) return;
  list.splice(i,1);
  saveKey('divinations');
  renderDvRecords();
  showToast('已删除');
}

function dvClearRecords(){
  if(!dvRecords().length){ showToast('本来就没有记录'); return; }
  appConfirm('清空占卜记录','所有占卜记录都会被删除，不可恢复。',()=>{
    state.divinations = [];
    saveKey('divinations');
    renderDvRecords();
    showToast('已清空');
  });
}

window.openDivination = openDivination;
window.dvSetMode = dvSetMode;
window.dvSetCount = dvSetCount;
window.dvDraw = dvDraw;
window.dvCopy = dvCopy;
window.dvSendToChat = dvSendToChat;
window.dvReask = dvReask;
window.dvRecCopy = dvRecCopy;
window.dvRecReask = dvRecReask;
window.dvRecEdit = dvRecEdit;
window.dvRecDelete = dvRecDelete;
window.dvClearRecords = dvClearRecords;
