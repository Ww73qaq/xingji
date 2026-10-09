/* =========================================================
   星迹 · 通用工具函数（文本 / 时间 / 随机 / DOM / 图片 / 下载 / 通知能力探测）
   ========================================================= */
/* ---- 随机 / 数值：全项目唯一实现（调度器与引擎共用，勿再重复定义） ---- */
function _roll(pct){return Math.random()*100 < (Number.isFinite(pct)?pct:0);}
function _clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function _randomInt(min,max){min=Math.ceil(min);max=Math.floor(max);return Math.floor(Math.random()*(max-min+1))+min;}

/* =========================================================
   TA 输出统一门控（v3.7.0）——所有 TA 对外输出入口统一调用，替代原先散落各通道的重复判据
   ========================================================= */
/* 两种静默：muteEndTime（你把 TA 静音）/ taMuteMeEndTime（TA 收起声音、整理意识）。
   返回 true＝此刻 TA 不应输出（不发消息、不推送、不弹系统通知）。 */
function taOutputBlocked(){
  const now=Date.now();
  return now<Number(state.muteEndTime||0) || now<Number(state.taMuteMeEndTime||0);
}

/* 语义档位 → 底层数值映射（设置页内化；底层值不在 UI 暴露百分比/秒/分钟） */
const REPLY_PACE_VAL={slow:45,natural:20,fast:8};            // 说话节奏 → replyDelaySec
const PROACTIVE_FREQ_VAL={rare:120,occasional:30,frequent:10}; // 主动频率 → proactiveMinIntervalMin
const CARD_RATIO_VAL={mine:90,half:50,free:20};              // 用词比例 → customRatio
function setReplyPace(tier){
  if(!REPLY_PACE_VAL[tier])return;
  state.prob.replyPace=tier; state.prob.replyDelaySec=REPLY_PACE_VAL[tier];
}
function setProactiveFreqTier(tier){
  if(!PROACTIVE_FREQ_VAL[tier])return;
  state.prob.proactiveFreq=tier; state.prob.proactiveMinIntervalMin=PROACTIVE_FREQ_VAL[tier];
  if(typeof scheduleProactive==='function')scheduleProactive();
}
function setCardRatioTier(tier){
  if(!CARD_RATIO_VAL[tier])return;
  state.prob.cardRatio=tier; state.prob.customRatio=CARD_RATIO_VAL[tier];
}
/* 主动频率三档对应的全局间隔缩放：主动来信/朋友圈/便签/来电等内部冷却乘以此系数 */
function proactiveGapScale(){
  switch(state.prob&&state.prob.proactiveFreq){
    case 'rare':return 2;        // 安静独处：间隔拉长
    case 'frequent':return 0.5;  // 常来看看：间隔缩短
    default:return 1;
  }
}
/* 医生提醒选句（v3.70）：两次提醒至少间隔、不唠叨；返回一句或 null。
   由回复引擎在「夜间 / 长时间用眼」语境轻概率调用，不做定时闹钟、不刷存在感。 */
let _doctorRemindLast=0;
function pickDoctorReminder(force){
  if(typeof DOCTOR_REMINDERS==='undefined'||!DOCTOR_REMINDERS.length)return null;
  const now=Date.now();
  if(!force&&now-_doctorRemindLast<90*60000)return null;   // 至少间隔 90 分钟
  _doctorRemindLast=now;
  return DOCTOR_REMINDERS[Math.floor(Math.random()*DOCTOR_REMINDERS.length)];
}


function haptic(){try{navigator.vibrate&&navigator.vibrate(12);}catch(e){}}
function fmtChatDate(t){
  const d=new Date(t),now=new Date();
  const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const that=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  const diff=Math.round((today-that)/86400000);
  if(diff===0)return '今天';if(diff===1)return '昨天';
  if(d.getFullYear()===now.getFullYear())return (d.getMonth()+1)+'月'+d.getDate()+'日';
  return d.getFullYear()+'年'+(d.getMonth()+1)+'月'+d.getDate()+'日';
}
function fmtChatTime(t){const d=new Date(t);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
function fmtChatTimeSec(t){const d=new Date(t);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0');}
function linkify(t){return t.replace(/(https?:\/\/[^\s]+)/g,'<a href="$1" target="_blank" rel="noopener" style="color:#07c160">$1</a>');}

/* =========================================================
   聊天状态桥接（统一任务调度器 chat-scheduler.js + 引擎 chat-engine.js）
   - 顶部副标题唯一来源：_scheduler.activeJob.phase
   - 名字永远是名字；状态永远是副标题；删除独立 chat-typing 横条
   ========================================================= */
function num(v,fb=0){const n=Number(v);return Number.isFinite(n)?n:fb;}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function randomInt(min,max){min=Math.ceil(min);max=Math.floor(max);return Math.floor(Math.random()*(max-min+1))+min;}
function autoGrow(el){
  el.style.height='auto';
  el.style.height=Math.min(96,el.scrollHeight)+'px';
}

/* 图片：导入即压缩（防存储爆满） */
function compressImage(file){
  return new Promise((res,rej)=>{
    const reader=new FileReader();
    reader.onload=e=>{
      const img=new Image();
      img.onload=()=>{
        const MAX=1080;let w=img.width,h=img.height;
        if(w>MAX||h>MAX){const r=Math.min(MAX/w,MAX/h);w=Math.round(w*r);h=Math.round(h*r);}
        const c=document.createElement('canvas');c.width=w;c.height=h;
        c.getContext('2d').drawImage(img,0,0,w,h);
        let q=0.72,url=c.toDataURL('image/jpeg',q);
        let guard=0;
        while(url.length>1.3*1024*1024&&q>0.35&&guard<6){q-=0.12;url=c.toDataURL('image/jpeg',q);guard++;}
        res(url);
      };
      img.onerror=rej;img.src=e.target.result;
    };
    reader.onerror=rej;reader.readAsDataURL(file);
  });
}
function fmtDuration(ms){
  if(!ms)return '0 分钟';
  const m=Math.floor(ms/60000);if(m<60)return m+' 分钟';
  const h=Math.floor(m/60);const r=m%60;return r>0?h+' 小时 '+r+' 分钟':h+' 小时';
}
function autosize(ta){if(!ta)return;ta.style.height='auto';ta.style.height=Math.min(340,Math.max(90,ta.scrollHeight+2))+'px';}
/* ===== 系统通知（真正的浏览器/手机级通知，Notification API） ===== */
function notifySupported(){return typeof Notification!=='undefined';}
function notifyPermGranted(){return notifySupported()&&Notification.permission==='granted';}
function confirmDownload(name,onConfirm){
  showModal('确认下载',`<div style="padding:10px 6px 4px;text-align:center;line-height:1.8;font-size:13px;color:var(--sub)">将保存为<br><b style="display:inline-block;margin-top:4px;color:var(--text);font-size:13px;word-break:break-all">${esc(name)}</b></div><div style="font-size:11px;color:var(--hint);line-height:1.7;margin:6px 2px 2px;text-align:center">确认后文件开始下载<br>手机浏览器请到「浏览器下载列表 / 下载管理」查看</div>`,
    '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button><button class="modal-btn" onclick="confirmDownloadShare()">分享/保存</button><button class="modal-btn primary" onclick="confirmDownloadGo()">确认下载</button></div>');
  window.__downloadConfirm=onConfirm;
}
/* 解析 onConfirm：统一返回 {blob,name}，下载与分享共用 */
async function confirmDownloadResolve(){
  const cb=window.__downloadConfirm;window.__downloadConfirm=null;
  closeModal();
  if(!cb)return null;
  return await cb();
}
async function confirmDownloadGo(){
  const res=await confirmDownloadResolve();
  if(res&&res.blob){downloadBlob(res.blob,res.name);showToast('已发起下载，请到浏览器下载列表查看');}
}
async function confirmDownloadShare(){
  const res=await confirmDownloadResolve();
  if(!res||!res.blob)return;
  await shareBlob(res.blob,res.name||'星迹_备份.json');
}
async function shareBlob(blob,name){
  try{
    const file=new File([blob],name,{type:blob.type||'application/json'});
    if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){
      await navigator.share({files:[file],title:'星迹数据备份'});
      showToast('已交给系统保存/分享');return;
    }
  }catch(e){}
  downloadBlob(blob,name);
  showToast('当前浏览器不支持文件分享，已改为下载');
}
/* 直接下载：同步触发 a.click() 保留用户手势，兼容老版 Edge msSaveBlob */
function downloadBlob(blob,name){
  const isQQ=/QQ\//i.test(navigator.userAgent)||/MQQBrowser/i.test(navigator.userAgent);
  if(isQQ){
    blob.text().then(t=>showQqBackup(t,name)).catch(()=>showToast('QQ 内置浏览器暂时无法读取备份，请改用系统浏览器'));
    return;
  }
  if(typeof navigator!=='undefined'&&navigator.msSaveBlob){navigator.msSaveBlob(blob,name);return;}
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=name;a.rel='noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}

/* ===== UTILS ===== */
function esc(s){return(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fmtTime(t){const d=new Date(t);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
function fmtFull(t){const d=new Date(t);return (d.getMonth()+1)+'月'+d.getDate()+'日 '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
function showToast(msg){const t=document.getElementById('toast');if(!t)return;t.textContent=msg;t.classList.add('show');clearTimeout(showToast._t);showToast._t=setTimeout(()=>t.classList.remove('show'),2000);}
