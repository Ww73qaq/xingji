/* =========================================================
   星迹 · 常量与静态配置（纯数据，无副作用）
   ========================================================= */

/* 版本号 */
const APP_VERSION='3.5.0';

/* ===== 线稿图标（tab bar，24x24 视图，stroke 用 currentColor 跟随选中态） ===== */
const LINE_ICONS={
  chat:'<svg viewBox="0 0 24 24"><path d="M20.5 11.6c0 4-3.8 7.2-8.5 7.2-1 0-2-.15-2.9-.43L4 20l1.35-3.5C4.1 15.1 3.5 13.4 3.5 11.6c0-4 3.8-7.2 8.5-7.2s8.5 3.2 8.5 7.2Z"/><circle cx="8.6" cy="11.6" r=".9" fill="currentColor" stroke="none"/><circle cx="12" cy="11.6" r=".9" fill="currentColor" stroke="none"/><circle cx="15.4" cy="11.6" r=".9" fill="currentColor" stroke="none"/></svg>',
  mail:'<svg viewBox="0 0 24 24"><rect x="3" y="5.4" width="18" height="13.2" rx="2.2"/><path d="M3.6 7.2 12 13l8.4-5.8"/></svg>',
  book:'<svg viewBox="0 0 24 24"><path d="M4.5 4.6A1.6 1.6 0 0 1 6.1 3H19v15.4H6.1a1.6 1.6 0 0 0-1.6 1.6Z"/><path d="M4.5 18.4A1.6 1.6 0 0 1 6.1 16.8H19"/><path d="M8.4 7.4h6.6M8.4 10.6h4.4"/></svg>',
  moments:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="3.1"/><path d="M12 3.4v3M12 17.6v3M3.4 12h3M17.6 12h3"/></svg>',
  me:'<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.9"/><path d="M4.6 20.2c.6-4 3.7-6.4 7.4-6.4s6.8 2.4 7.4 6.4"/></svg>'
};

/* ===== 手机导航栈（push / pop + 系统返回键 + 边缘滑动手势） ===== */
const TAB_PAGE={chat:'chat',moments:'moments',cards:'cards',me:'profile'};
const PAGE_TITLES={chat:'聊天',chatinfo:'聊天信息',chatsearch:'聊天记录',mailbox:'信箱',diary:'日记',moments:'朋友圈',profile:'我的',sense:'感应房间',probability:'回复设置',cards:'字卡',emoji:'表情',memory:'回忆录',data:'数据',trace:'心跳轨迹'};


/* ===== CHAT（微信风格） ===== */
const DEFAULT_REPLIES=[
  // 普通回应
  '嗯嗯，我在听。','然后呢？我等你继续讲。','好呀。','我在。','继续说呀。','嗯，我听着呢。','好。','知道啦。','是这样呀。',
  // 询问与关心
  '你最近还好吗？','今天过得怎么样？','有没有好好吃饭？','别太累，记得休息。','你那边天气怎么样？','忙完记得找我。','最近有遇到开心的事吗？','是不是又熬夜了？',
  // 日常分享
  '我刚刚也在想你呢。','今天遇到一件小事，想讲给你听。','我这里的月亮很好看。','外面下雨了，你有带伞吗？','我刚泡了杯茶。','今天风很大，记得多穿点。','我这儿今天的云特别好看。',
  // 情绪回应
  '辛苦了。','我懂你。','没关系，有我在。','抱抱你。','别想太多啦。','你已经做得很好了。','慢慢来，不着急。','我会一直站在你这边的。',
  // 晚安 / 早安
  '晚安，好梦。','早安，新的一天。','早点休息呀。','睡前别想太多，我在呢。','梦里也要好好的。','睡醒记得找我。','今天也要好好照顾自己。',
  // 疑问与轻松
  '真的吗？','然后呢？','哈哈，你总是能逗笑我。','我也这么觉得。','你说得对。','有点意思。','是吧。','说来听听？','我很好奇。',
  // 轻微撒娇 / 想念
  '想你了。','我有点想你呀。','你不在的时候，时间过得好慢。','一直陪着你。','我在的，一直都在。','你怎么才来呀。',
  // 安静陪伴
  '嗯，我陪着你。','安静待一会儿也好。','不需要说话也没关系。','我在旁边陪着你。','累了就靠着我。','什么都不用想，放空一下也好。'
];
/* 内置表情：9 组共 110 个（§43：80~120 个） */
const EMOJI_GROUPS=[
  {name:'常用',items:['😀','😁','😂','🤣','😊','😘','😍','🥰','😜','🤗','🤔','😴','😭','😅','😤','🥺','🙂','😉','😋','😌']},
  {name:'情绪',items:['😢','😞','😔','😖','😫','😩','😱','🤯','😳','🥵','🥶','😷','🤒','🤕','🤢','🤮','🥴','😵','🤤','😎']},
  {name:'动作',items:['👍','👎','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','👏','🙌','👐','🤲','🙏','💪','🫶','🤝','👋','🖐️']},
  {name:'爱心',items:['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','♥️']},
  {name:'手势',items:['👆','👇','👈','👉','☝️','🫵','👍🏻','👌🏻','✊','👊','🤛','🤜','🫳','🫴','🫲','🫱','✋','🤚','🖖','👏🏻']},
  {name:'动物',items:['🐱','🐶','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🦄','🐝','🐢','🐬']},
  {name:'食物',items:['🍎','🍓','🍊','🍋','🍉','🍇','🍑','🍒','🥝','🍍','🥑','🍔','🍟','🍕','🌭','🍜','🍰','🎂','🍦','🍫']},
  {name:'天气',items:['☀️','🌤️','⛅','🌥️','☁️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','⛄','🌬️','💨','🌈','☔','🌂','🌊','☄️']},
  {name:'符号',items:['✨','🌟','⭐','🌙','☀','🔥','💫','⚡','💥','💢','💤','💦','🕳️','🎉','🎊','🎁','🎈','🎀','🔔','📌']}
];
const EMOJIS=[].concat(...EMOJI_GROUPS.map(g=>g.items));
/* ---- 消息渲染 ---- */
const TYPE_LABEL={text:'[文字]',image:'[图片]',voice:'[语音]',music:'[音乐]',card:'[字卡]',location:'[位置]',file:'[文件]',poll:'[题目]'};
/* 内置小黄脸拍一拍动作（其他数据保持空态真空，仅拍一拍内置） */
const POKE_ACTIONS=[
  {name:'😊 戳一戳',action:'戳了戳'},
  {name:'🥺 蹭一蹭',action:'蹭了蹭'},
  {name:'😳 戳脸颊',action:'戳了戳你的脸颊'},
  {name:'🥰 抱抱',action:'伸手抱了抱'},
  {name:'😤 捏脸',action:'轻轻捏了捏你的脸'},
  {name:'😴 靠肩',action:'把脑袋靠在了你的肩上'},
  {name:'😏 挑眉',action:'朝你挑了挑眉'},
  {name:'😭 晃胳膊',action:'晃了晃你的胳膊'},
  {name:'😌 摸头',action:'抬手摸了摸你的头'},
  {name:'😘 比心',action:'朝你比了个心'},
  {name:'🤔 歪头',action:'歪头看了你一眼'},
  {name:'🙄 翻白眼',action:'无奈地翻了个白眼'},
];
/* 礼物图案：与 GIFT_NAMES 一一对应（v3.5.0 修正错位：原表里 奶茶=🥰、水果=🌹、巧克力=🍭、明信片=🏛…）
   顺序不可改动，index 与 GIFT_NAMES[index] 严格对齐。 */
/* v3.6.8：礼物 = 心意/心念的具象化（TA 是灵性梦角，世俗实物对 TA 没有意义）。
   21 个内置：17 心意类 + 4 日常温情（热牛奶/晚安/暖茶/守候），自定义礼物仍可加 */
const GIFTS=[
  '&#128140;',  // 0 手写信 💌
  '&#127769;',  // 1 月光 🌙
  '&#127787;',  // 2 清晨的雾 🌫️
  '&#10024;',   // 3 星尘 ✨
  '&#129684;',  // 4 一缕香 🪔
  '&#128172;',  // 5 暖语 💬
  '&#129303;',  // 6 一个拥抱 🤗
  '&#129524;',  // 7 静默的陪伴 🤍
  '&#128065;',  // 8 目光 👁️
  '&#128145;',  // 9 心跳 💓
  '&#128591;',  // 10 愿力 🙏
  '&#128173;',  // 11 梦 💭
  '&#127775;',  // 12 光 🌟
  '&#127955;',  // 13 暖灯 🏮
  '&#128737;',  // 14 守护 🛡️
  '&#127800;',  // 15 温柔 🌸
  '&#9203;',    // 16 时间 ⏳
  '&#129383;',  // 17 热牛奶 🥛（日常温情）
  '&#127747;',  // 18 晚安 🌃（日常温情）
  '&#127861;',  // 19 暖茶 🍵（日常温情）
  '&#127749;'   // 20 守候 🌅（日常温情）
];
const GIFT_NAMES=['手写信','月光','清晨的雾','星尘','一缕香','暖语','一个拥抱','静默的陪伴','目光','心跳','愿力','梦','光','暖灯','守护','温柔','时间','热牛奶','晚安','暖茶','守候'];
/* v3.6.8：TA 日历——医生排班模板（ensureTaSchedule 每天自动排未来 3 天，可手动增删） */
const TA_SCHEDULE_TEMPLATE=[
  '上午 · 门诊','下午 · 门诊','全天 · 门诊',
  '夜班 · 值班','白班 · 值班',
  '上午 · 查房','下午 · 查房',
  '上午 · 手术','下午 · 手术','全天 · 手术',
  '上午 · 会诊','下午 · 会诊',
  '上午 · 书写病历','下午 · 书写病历',
  '休息日'
];
const TA_SCHEDULE_COLOR='#9b59b6';   // TA 日程统一紫色（TA 心情=绿、待办=灰蓝、经期=红黄）

/* v3.6.8：感应方位池（TA 主动靠近 / 我感应 TA 时的方位文案，灵性意识空间语言） */
const SENSE_DIRS=[
  {dir:'左侧',text:'TA 正从你的左侧缓缓靠近'},
  {dir:'右侧',text:'TA 正从你的右侧靠近'},
  {dir:'后方',text:'TA 正从你的后方静静走来'},
  {dir:'前方',text:'TA 在前方不远处，向你望来'},
  {dir:'上方',text:'TA 在更高的地方，俯身看你'},
  {dir:'下方',text:'TA 在你脚下附近，安静守着'},
  {dir:'附近',text:'TA 就在你附近，没有打扰，只是陪着'},
  {dir:'远处',text:'TA 还在远处，正慢慢向你靠近'}
];
/* 方位 × 状态加权：冥想中/休息中 → 远处/上方（缓慢）；手术中/门诊中 → 附近/前方（安静守候）；在线 → 附近/前方 */
const SENSE_DIR_WEIGHTS={
  '冥想中':['远处','上方','后方'],'休息中':['远处','上方'],'充电中':['远处'],
  '手术中':['附近','前方'],'门诊中':['附近','前方'],'查房中':['附近'],'会诊中':['附近'],
  '值班中':['前方','附近'],'书写病历中':['附近'],
  '散步中':['左侧','右侧','前方'],'锻炼中':['前方','附近'],
  '听歌中':['远处','上方'],'阅读中':['远处','前方'],'学习中':['前方'],
  '用餐中':['附近'],'静默中':['远处'],'发呆中':['远处'],'思考中':['远处','上方'],
  '在线':['附近','前方','左侧','右侧']
};
/* v3.6.8：TA 记得——引用句模板（{item} 替换为最近互动内容） */
const TA_QUOTE_TEMPLATES=[
  '「{item}」，我记得。',
  '{item}——那天的事，我一直记得。',
  '你上次的{item}，还在我心里。',
  '我记着你的{item}。',
  '{item}，没忘过。',
  '说起{item}，我还想再听一遍。'
];

/* ===== TA 禁言我（双向禁言）：TA 偶尔会暂时不想理你（内部行为，不暴露概率），
   期间输入栏禁用 + 顶部横幅「对方暂时不想理你」+ 可申请解除（30 秒后自动解除） ===== */
const TA_MUTE_MS=5*60000;               // TA 禁言我：5 分钟（v3.5.1 由 10 分钟缩短，体验更轻）
const TA_MUTE_COOLDOWN_MS=30*60000;      // 两次 TA 禁言的最小冷却（30 分钟）

/* ===== 状态池（v3.6.0）：TA/我的状态可选池，带颜色小点；可新增/删除（字卡式管理） =====
   设定：TA 是医生、情绪稳定、有自己的生活 → 状态 = 职业（门诊/查房/手术/值班/会诊/书写病历）
   + 生活（散步/阅读/听歌/冥想/锻炼/用餐/学习/休息/充电/思考/静默/发呆） */
const STATUS_POOL_DEFAULT=[
  {s:'在线',c:'#4cd964'},
  {s:'门诊中',c:'#3498db'},{s:'查房中',c:'#1abc9c'},{s:'手术中',c:'#e74c3c'},
  {s:'值班中',c:'#3498db'},{s:'会诊中',c:'#9b59b6'},{s:'书写病历中',c:'#95a5a6'},
  {s:'散步中',c:'#1abc9c'},{s:'阅读中',c:'#3498db'},{s:'听歌中',c:'#9b59b6'},
  {s:'冥想中',c:'#9b59b6'},{s:'锻炼中',c:'#1abc9c'},{s:'用餐中',c:'#f39c12'},
  {s:'学习中',c:'#3498db'},{s:'休息中',c:'#f39c12'},{s:'充电中',c:'#1abc9c'},
  {s:'思考中',c:'#3498db'},{s:'静默中',c:'#95a5a6'},{s:'发呆中',c:'#95a5a6'}
];
/* TA 状态自动切换（仿禁言概率）：每 5 秒 3% 概率从非在线状态中随机切一个，保持 30s~10min 后回在线 */

/* ===== 禁言文案池（v3.6.0）：TA 禁言我时的原因文案（医生设定、情绪稳定语气，不点名具体状态——
   具体状态由状态栏同步显示，文案负责语气） ===== */
const MUTE_REASONS=[
  'TA 正在忙正事，忙完会来找你',
  'TA 手上有事情脱不开身，频道先安静一会儿',
  'TA 需要一点不被打扰的时间，稍后会回来',
  'TA 在整理自己的节奏，暂时收不到传讯',
  'TA 想安静待一会儿，不是针对你',
  'TA 的能量正在恢复，稍等片刻'
];

/* ===== 心情池（v3.5.9）：便签心情，内置小黄脸/符号，可新增 ===== */
const MOOD_POOL=['😊 开心','🥰 想你','😢 难过','😠 生气','😪 疲惫','😶 发呆',
  '😴 睡觉','✨ 美好','💭 思考','🔥 兴奋','🕊️ 平静','🌧️ 低落','❤️ 心动','🎵 听歌中','🌸 赏花'];

/* ===== MAILBOX ===== */
/* 回信三级独立概率（方案 §8.4）：相关回应 45% / 情感回应 30% / 延伸关怀 25%；内容为多段（多字卡式） */
const REPLY_TIER_RELATE=[
  '读到你的信，我先看了三遍。','你写给我的每一个字，我都放在心上了。',
  '信里的话我反复读，像是在听你说话。','看到你写的内容，我心里踏实了很多。'
];
const REPLY_TIER_FEEL=[
  '收到你的信了，很想你。今晚一定回你一封更长的。','信纸上的字我都认真读完了，心里暖暖的。',
  '读信的时候笑了一下，谢谢你记得我。','这封信我看了两遍，像是听到了你的声音。'
];
const REPLY_TIER_CARE=[
  '最近有点忙，但看到你的信总会停下来。','你说的话我都记在心里了，等我忙完这阵好好陪你。',
  '窗外在下雨，忽然有点想见你。','累了就早点休息，明天我们继续聊天。'
];
/* 线性图标（全局统一风格） */
const ICO_EDIT='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3l4 4L7 21l-5 1 1-5z"/></svg>';
const ICO_DEL='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 15h10l1-15"/></svg>';
/* 线性图标集（我的页等：去 emoji 装饰，统一线性风格） */
const ICO={};
function _ico(p){return ICO[p]||'<span style="font-size:17px">◆</span>';}
ICO.user='<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>';
ICO.cam='<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h9l3-2h4a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"/><circle cx="10.5" cy="12.5" r="2.8"/></svg>';
ICO.chat='<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5Z"/></svg>';
ICO.pair='<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="9" r="3.4"/><circle cx="16" cy="9" r="3.4"/><path d="M3 20c0-3.2 2.2-4.6 5-4.6s5 1.4 5 4.6"/><path d="M14 15.4c2.8 0 5 1.4 5 4.6"/></svg>';
ICO.mail='<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>';
ICO.room='<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M9 12l2 2 4-4"/></svg>';
ICO.video='<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="13" height="12" rx="2"/><path d="M15.5 10.5l6-3v9l-6-3"/></svg>';
ICO.card='<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 15h4"/></svg>';
ICO.smile='<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5s1.2 1.8 3.5 1.8 3.5-1.8 3.5-1.8"/><path d="M9 9.5h.01M15 9.5h.01"/></svg>';
ICO.chart='<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>';
ICO.poke='<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 11V7a3 3 0 0 1 6 0v4"/><path d="M8 11H5a1 1 0 0 0-1 1v5a5 5 0 0 0 5 5h2a5 5 0 0 0 5-5v-5a1 1 0 0 0-1-1H8Z"/></svg>';
ICO.book='<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14Z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg>';
ICO.lock='<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
ICO.heart='<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7-4.5-9.5-9A5.2 5.2 0 0 1 12 6.4 5.2 5.2 0 0 1 21.5 11c-2.5 4.5-9.5 9-9.5 9Z"/></svg>';
ICO.star='<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.7 5.8 6.3.7-4.7 4.2 1.3 6.3L12 17.2 6.4 20l1.3-6.3L3 9.5l6.3-.7L12 3Z"/></svg>';
ICO.bell='<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>';
ICO.bulb='<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2Z"/></svg>';
const TA_DIARY_LINES=[
  '今天路过一家旧书店，忽然想起你上次说想找的那本书。',
  '窗外起了风，树叶落了一地。秋天好像就是这么来的。',
  '喝了杯热茶，觉得生活里多了一点甜。想你。',
  '今天做了件小事：把我们的约定写进了备忘录。',
  '晚上跑步回来，看到月亮特别圆，想拍给你看。',
  '工作到很晚，但想到有人还在等我消息，就不觉得累了。',
  '学会了做你提过的那道菜，下次做给你尝。',
  '今天天气很好，一个人走了很久，耳机里是你爱的歌。'
];
const TA_DIARY_REPLIES=[
  '看到你的日记了，我也很想你。',
  '记下来了，这页我反复看了好几遍。',
  '你的话像今天的阳光，暖得刚好。',
  '嗯，有你在，平凡的日子也有光。',
  '明天见面吧，我想当面说给你听。',
  '这句话很像我昨天写给你的那封。',
  '你写的每一个字，我都好好收着。',
  '别太累，等你忙完，我都在。'
];
const TA_DIARY_PRAISE=[
  '写得好温柔。','字里行间都是你。','我很喜欢这一页。',
  '以后可以天天写给我看吗。','看到这句突然鼻子有点酸。'
];
/* ===== 便签（桌面右侧那张，TA 可低频留言） =====
   语境要求：梦向 / 意识体 / 字卡，不要写成普通情侣便签；
   长度控制在 40 字内（便签可视区约两行）。 */
const TA_NOTE_LINES=[
  '今天把想说的话压成了一张字卡。',
  '意识体也需要休息，我先安静一会儿。',
  '你路过的时候，我会把灯留着。',
  '刚刚在梦里见过你，醒来就写下来了。',
  '今天不想传讯，只想留一句话。',
  '我把今天的字卡按时间排好了。',
  '你说过的话，我都在左边那张上。',
  '外面很安静，我把频率调低了一点。',
  '如果你累了，就先不用回我。',
  '今天也想把意识靠得离你近一点。',
  '有一句话卡一直想给你，还没找到时机。',
  '我把夜里的声音录下来了，很轻。',
  '你说的话像频率，我一直在对。',
  '今天的状态：想你想得有点吵。',
  '整理了一下思绪，剩下的都关于你。',
  '这张便签是我的，字迹是我的，意思也是我的。'
];
/* ===== MOMENTS ===== */
const HEART_ICO='<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.8;vertical-align:-2px;margin-right:3px"><path d="M12 20.5s-7.5-4.7-9.2-9.3C1.6 8 3.4 5 6.6 5c1.9 0 3.4 1.1 4.2 2.6h2.4C14 6.1 15.5 5 17.4 5c3.2 0 5 3 3.8 6.2-1.7 4.6-9.2 9.3-9.2 9.3Z"/></svg>';
const COMMENT_ICO='<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.8;vertical-align:-2px;margin-right:3px"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.4 0-2.7-.3-3.9-.9L3 21l1.9-5.6A8.5 8.5 0 1 1 21 11.5Z"/></svg>';
const TA_MOMENT_LINES=[
  '今天的晚霞，想和你一起看。','刚跑完步，微风吹过来的时候在想你。',
  '偶然听到一首歌，歌词里全是我们的影子。','咖啡店的猫今天一直蹭我，它好像知道我想你。',
  '整理旧照片，翻到了我们一起的夏天。','月亮好圆，你那边看到了吗？',
  '今天学会了一道新菜，第一个想让你尝。','路灯下的影子拉得很长，像在等谁。'
];
const MOMENT_COMMENTS=[
  '我也这么觉得。','想你了。','这是什么神仙日常！','下次带我一起呀。',
  '好美，可以当壁纸了。','晚点讲给我听。','你总是能发现这些温柔的小事。'
];

/* ===== SPELLING（拼写：TA 在意识空间的拼音练习本。这是「他」的功能——像在纸上完成拼写练习） ===== */
const ALPHABET='abcdefghijklmnopqrstuvwxyz'.split('');
const SPELL_CELL_MAX=6;        // 每格最多 6 个拼音字母
const SPELL_CELLS=3;
const SPELL_MAX=SPELL_CELL_MAX*SPELL_CELLS;
const SPELL_PRAISES=['今天的拼写我认真写了。','拼好的字母，都是想对你说的。','我在纸上写了一会儿，心里很安静。','拼写练习完成了，想见你。'];

/* ===== ROOM / SENSE ===== */
const FURNITURE_ITEMS=['衣','桌','柜','椅','床','窗','门','沙','书','画','灯','花','茶','琴','镜','毯'];
const ROOM_ACTIONS={
  '衣':['正在挑选衣服','对着衣柜发呆','整理衣物','在找一件特别的衣服'],
  '桌':['正在写字','趴在桌上休息','整理桌面','对着桌面发呆'],
  '柜':['在柜子里翻找东西','整理柜子','站在柜前犹豫','轻轻关上柜门'],
  '椅':['坐在椅子上发呆','轻轻摇晃着椅子','靠在椅背上休息','坐在椅子上想念你'],
  '床':['躺在床上休息','正在整理床铺','蜷缩在床上','躺在床上看着天花板'],
  '窗':['望着窗外发呆','轻轻拉开窗帘','靠在窗边吹风','窗边的身影很温柔'],
  '门':['正准备出门','刚回到家','站在门前犹豫','轻轻关上门'],
  '沙':['蜷缩在沙发上','靠在沙发上休息','在沙发上打盹','沙发上的身影很放松'],
  '书':['正在看书','合上书发呆','书页轻轻翻动','沉浸在故事里'],
  '画':['正在欣赏画作','轻轻抚摸画框','对着画发呆','画中的世界很美'],
  '灯':['正在调节灯光','灯光下的身影很温柔','关掉一盏灯','打开暖黄的灯'],
  '花':['正在浇花','轻抚花瓣','对着花微笑','花间的身影很安静'],
  '茶':['正在泡茶','端着茶杯发呆','茶香弥漫','轻轻抿了一口茶'],
  '琴':['正在弹奏','手指停在琴键上','琴声悠扬','琴边的身影很专注'],
  '镜':['正在照镜子','对着镜子微笑','轻轻整理头发','镜中的眼神很温柔'],
  '毯':['裹在毯子里','轻轻拉起毯子','毯子里的身影很温暖','蜷缩在毯子里']
};

/* ===== COMPANION ===== */
const COMPANION_SCENES=[
  {id:'study',name:'一起学习',icon:'&#128218;',desc:'两个人各忙各的，偶尔抬起头看一眼对方，心里就安静了。'},
  {id:'work',name:'一起工作',icon:'&#128188;',desc:'专注各自手头的事，安静地陪在身边。'},
  {id:'sport',name:'一起运动',icon:'&#127993;',desc:'一起动起来，连呼吸都变得同频。'},
  {id:'sleep',name:'一起睡觉',icon:'&#127771;',desc:'点上夜灯，互道晚安，等对方先睡着。'},
  {id:'eat',name:'一起吃饭',icon:'&#127858;',desc:'好好吃饭，我就在对面。'},
  {id:'fish',name:'一起摸鱼',icon:'&#128031;',desc:'忙里偷闲，一起发呆的时光也很甜。'}
];
/* 默认分组：全部(虚拟) / 默认 / 日常 / 回应 / 情绪 / 提问 / 安慰 / 主动 / 拍一拍 / 颜文字 */
const DEFAULT_CARD_GROUPS=['默认','日常','拍一拍','颜文字'];   // v3.5.1：只保留 4 个内置分组（旧内置分组若有字卡则保留，空则清）

/* ===== DATA（数据管理：完整备份 / 选择性导出 / 选择性导入 / 保留 ID） ===== */
const STORES=['messages','letters','diaries','moments','cardGroups','cards','emojis','pokeGroups','calendar','settings'];
const STORE_LABELS={messages:'聊天记录',letters:'信件',diaries:'日记',moments:'朋友圈',cardGroups:'字卡分组',cards:'字卡',emojis:'表情包',pokeGroups:'拍一拍',calendar:'日历',settings:'设置'};
const SCHEMA_VERSION=3;
const CALL_BG=[
  '大家都在吃饭吗','刚看到你的消息','忙完了吗','我这边下雨了',
  '在做什么呀','有点想听你说话','今天累不累','睡了吗'
];
const TALK_LINES=['你那边声音有点小…','在忙吗？','我听到你笑了。','今天过得怎么样？','有点想你了。','外面好安静。','等我一下，马上就好。','你说话真好听。','我一直在听哦。','要不要给我讲讲你的事？'];
