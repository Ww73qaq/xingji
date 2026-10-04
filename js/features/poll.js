/* =========================================================
   星迹 · 题目系统（单选 / 多选 / 问卷）
   - v3.4.0：多选数量上下限、问卷作答期限/提前交卷，全部收到「发送弹窗」里，
     「回复设置」页不再出现问卷卡片（设置跟着题目走，不再是全局项）。
   - 长按我方题目/问卷 → 「修改并重发」：新建一条消息，原消息保持不变。
   ========================================================= */

/* 读取上一次用过的弹窗默认值（state.surveySettings 仅作为「默认值来源」保留） */
function _surveyDefault(key,fb){
  const v=Number((state.surveySettings||{})[key]);
  return Number.isFinite(v)?v:fb;
}
let pollEditing=false, surveyEditing=false;

/* ---------- 表单构造 ---------- */
function buildPollFormHtml(question,optionsText,multi,minV,maxV){
  const optCount=String(optionsText||'').split(/\n+/).map(x=>x.trim()).filter(Boolean).length;
  return '<input class="app-input" id="poll-q" placeholder="题目" value="'+esc(question)+'" style="width:100%;margin-bottom:10px">'
    +'<textarea class="textarea-full" id="poll-opts" placeholder="选项，一行一个（最多 6 个）" style="min-height:110px" oninput="syncPollLimits()">'+esc(optionsText)+'</textarea>'
    +(multi
      ?'<div style="display:flex;gap:8px;align-items:center;margin-top:10px;font-size:12px;color:var(--sub);flex-wrap:wrap">'
        +'<span>TA 最少选</span><input class="app-input" id="poll-min" type="number" min="1" max="8" value="'+minV+'" style="width:64px;text-align:center" oninput="syncPollLimits()">'
        +'<span>最多选</span><input class="app-input" id="poll-max" type="number" min="1" max="8" value="'+maxV+'" style="width:64px;text-align:center" oninput="syncPollLimits()">'
        +'<span>项</span><span id="poll-limit-hint" style="color:var(--hint)">（当前 '+optCount+' 个选项）</span></div>'
        +'<div style="font-size:11px;color:var(--hint);margin-top:6px">TA 作答时选中的数量会落在这个区间内；选项少于上限时自动收敛。</div>'
      :'<div style="font-size:11px;color:var(--hint);margin-top:8px">单选：TA 会直接选中其中一个选项并作答。</div>');
}
/* 选项数量变化时，把最少/最多收敛到合法范围，避免出现「最少 5 项但只有 3 个选项」 */
function syncPollLimits(){
  const ta=document.getElementById('poll-opts');if(!ta)return;
  const n=ta.value.split(/\n+/).map(x=>x.trim()).filter(Boolean).length;
  const mn=document.getElementById('poll-min'),mx=document.getElementById('poll-max');
  if(!mn||!mx)return;
  const max=Math.max(1,n);
  mn.max=String(max);mx.max=String(max);
  let a=Math.max(1,Math.min(parseInt(mn.value)||1,max));
  let b=Math.max(1,Math.min(parseInt(mx.value)||1,max));
  if(a>b){const t=a;a=b;b=t;}
  mn.value=String(a);mx.value=String(b);
  const info=document.getElementById('poll-limit-hint');
  if(info)info.textContent='（当前 '+n+' 个选项）';
}
function buildSurveyFormHtml(raw,deadline,earlyPct){
  return '<div style="font-size:12px;color:var(--sub);margin-bottom:8px">问卷 = 一个消息、多个题目、每题单选、一次性提交。支持直接粘贴 AI 生成的问卷。</div>'
    +'<button class="btn-pill ghost" style="padding:6px 12px;font-size:12px;margin-bottom:8px" onclick="toggleSurveyHint()">格式示例 ▾</button>'
    +'<div id="survey-hint" style="display:none;background:var(--input);border-radius:12px;padding:10px 12px;font-size:12px;color:var(--hint);line-height:1.9;margin-bottom:10px">[题目] 周末想去哪里？<br>家里<br>公园<br>咖啡店<br>[题目] 想吃什么？<br>火锅<br>面<br>甜点</div>'
    +'<textarea class="textarea-full" id="survey-raw" placeholder="在此粘贴或输入问卷内容…" style="min-height:150px;max-height:38vh">'+esc(raw)+'</textarea>'
    +'<div style="display:flex;gap:8px;align-items:center;margin-top:10px;font-size:12px;color:var(--sub);flex-wrap:wrap">'
      +'<span>作答期限</span><input class="app-input" id="survey-deadline" type="number" min="10" max="600" value="'+deadline+'" style="width:72px;text-align:center">'
      +'<span>秒</span>'
      +'<span style="margin-left:6px">提前交卷</span><input class="app-input" id="survey-early" type="number" min="0" max="100" value="'+earlyPct+'" style="width:64px;text-align:center">'
      +'<span>%</span></div>'
    +'<div id="survey-preview" style="font-size:12px;color:var(--sub);margin-top:8px"></div>'
    +'<div style="display:flex;align-items:center;gap:10px;margin-top:8px">'
      +'<span style="flex:1;font-size:11px;color:var(--hint);line-height:1.5">期限写在这条问卷上：TA 会在期限内作答，部分情况提前交卷。</span>'
      +'<button class="btn-pill ghost" style="padding:7px 14px;font-size:12px;flex-shrink:0" onclick="parseSurveyText()">解析</button></div>';
}
/* 格式示例折叠：默认收起，保证「发送」按钮留在首屏 */
function toggleSurveyHint(){
  const h=document.getElementById('survey-hint');
  if(h)h.style.display=(h.style.display==='none'||!h.style.display)?'block':'none';
}

/* ===== 入口：+ 面板里的「单选 / 多选 / 问卷」 ===== */
function openPollModal(type){
  pollEditing=false;surveyEditing=false;
  if(type==='survey'){
    showModal('发送问卷',buildSurveyFormHtml('',_surveyDefault('deadlineSec',60),_surveyDefault('earlySubmitProb',30)),
      '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button>'
      +'<button class="modal-btn primary" onclick="submitSurvey(false)">发送问卷</button></div>');
    return;
  }
  const multi=(type==='multipoll');
  showModal(multi?'发送多选题':'发送单选题',
    buildPollFormHtml('','',multi,_surveyDefault('multiMin',1),_surveyDefault('multiMax',6)),
    '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button>'
    +'<button class="modal-btn primary" onclick="submitPoll('+(multi?1:0)+',false)">发送</button></div>');
}

/* 「修改并重发」：以原消息内容回填弹窗，提交后作为新消息发送（原消息不变） */
async function editPollAndResend(m){
  if(m.type==='survey'||(m.survey&&m.survey.questions)){
    const p=m.survey||{};
    const raw=p.rawText||(p.questions||[]).map(q=>'[题目] '+(q.q||'')+'\n'+(q.options||[]).join('\n')).join('\n\n');
    const deadline=Number(p.deadlineSec)||_surveyDefault('deadlineSec',60);
    const early=Number(p.earlySubmitProb);
    const earlyPct=Number.isFinite(early)?early:_surveyDefault('earlySubmitProb',30);
    surveyEditing=true;pollEditing=false;surveyParsed=null;
    showModal('修改问卷（将作为新消息发出）',buildSurveyFormHtml(raw,deadline,earlyPct),
      '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button>'
      +'<button class="modal-btn primary" onclick="submitSurvey(true)">重新发送</button></div>');
    return;
  }
  const p=m.poll||{};
  const multi=!!p.multi;
  pollEditing=true;surveyEditing=false;
  showModal(multi?'修改多选题（将作为新消息发出）':'修改单选题（将作为新消息发出）',
    buildPollFormHtml(p.question||'',(p.options||[]).join('\n'),multi,
      Number(p.multiMin)||_surveyDefault('multiMin',1),Number(p.multiMax)||_surveyDefault('multiMax',6)),
    '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button>'
    +'<button class="modal-btn primary" onclick="submitPoll('+(multi?1:0)+',true)">重新发送</button></div>');
}

/* 解析 [题目] 格式：遇到 [题目] 开始新题，下一行非空文本为选项 */
function parseSurveyText(){
  const el=document.getElementById('survey-raw');
  const raw=(el?el.value:'').replace(/\r/g,'');
  const lines=raw.split('\n').map(x=>x.trim()).filter(Boolean);
  const questions=[];let cur=null;
  for(const ln of lines){
    // 兼容三种写法：[题目] 题干在同行 / [题目] 换行题干 / 题目：题干
    const mk=ln.match(/^(?:\[题目\]|\[题\]|题目[:：])\s*(.*)$/);
    if(mk){
      if(cur&&cur.q&&cur.options.length>=2)questions.push(cur);
      cur={q:(mk[1]||'').trim(),options:[]};
    }else if(cur){
      if(!cur.q)cur.q=ln;
      else if(cur.options.length<8)cur.options.push(ln);
    }
  }
  if(cur&&cur.q&&cur.options.length>=2)questions.push(cur);
  surveyParsed={rawText:raw,questions};
  const pre=document.getElementById('survey-preview');
  if(!pre)return;
  if(!questions.length){pre.innerHTML='<span style="color:#c0392b">未识别到有效题目。格式：每行 [题目] 开头，下一行起是选项（每题至少 2 个选项）。</span>';return;}
  pre.innerHTML='已解析 <b>'+questions.length+'</b> 题：'+questions.map((q,i)=>'<div style="margin-top:4px">'+(i+1)+'. '+esc(q.q)+' <span style="color:var(--hint)">（'+q.options.length+' 选项）</span></div>').join('');
}
let surveyParsed=null;
/* 单选/多选：统一写入 messages → enqueueTaJob → 统一等待 → 必答 */
async function submitPoll(multi,isEdit){
  const qEl=document.getElementById('poll-q');
  const oEl=document.getElementById('poll-opts');
  const question=(qEl?qEl.value:'').trim();
  const opts=(oEl?oEl.value:'').split(/\n+/).map(x=>x.trim()).filter(Boolean).slice(0,6);
  if(!question){showToast('请输入题目');return;}
  if(opts.length<2){showToast('至少 2 个选项');return;}
  const poll={question,options:opts,multi:!!multi};
  if(multi){
    const mn=document.getElementById('poll-min'),mx=document.getElementById('poll-max');
    let a=_clamp(parseInt(mn?mn.value:'')||1,1,opts.length);
    let b=_clamp(parseInt(mx?mx.value:'')||opts.length,a,opts.length);
    if(a>b){const t=a;a=b;b=t;}
    poll.multiMin=a;poll.multiMax=b;
  }
  closeModal();
  await sendMessageObject({type:'poll',content:question,poll});
  showToast(isEdit?'修改后的题目已重新发送（原消息保留）':'题目已发送，等待 TA 作答');
  pollEditing=false;
}
async function submitSurvey(isEdit){
  const el=document.getElementById('survey-raw');
  const raw=(el?el.value:'').replace(/\r/g,'');
  const dlEl=document.getElementById('survey-deadline');
  const eEl=document.getElementById('survey-early');
  const deadline=_clamp(parseInt(dlEl?dlEl.value:'')||60,10,600);
  const earlyRaw=eEl?parseInt(eEl.value):NaN;
  const earlyPct=Number.isFinite(earlyRaw)?_clamp(earlyRaw,0,100):_surveyDefault('earlySubmitProb',30);
  surveyParsed=null;
  parseSurveyText();
  const questions=(surveyParsed&&surveyParsed.rawText===raw)?surveyParsed.questions:null;
  if(!questions||!questions.length){showToast('请先输入有效的问卷内容（[题目] + 选项）');return;}
  if(questions.length>20){showToast('最多 20 题');return;}
  closeModal();
  surveyParsed=null;
  await sendMessageObject({
    type:'survey',
    content:questions[0].q+' 等 '+questions.length+' 题',
    survey:{questions,rawText:raw,deadlineSec:deadline,earlySubmitProb:earlyPct}
  });
  showToast(isEdit?'修改后的问卷已重新发送（原消息保留）':'问卷已发送，TA 会在 '+deadline+' 秒内作答');
  surveyEditing=false;
}
/* 旧调用名保留（历史代码/收藏脚本可能用到） */
window.submitPoll=submitPoll;
window.submitSurvey=submitSurvey;
window.sendPoll=(multi)=>submitPoll(multi,false);
window.sendSurvey=()=>submitSurvey(false);

/* 题目未作答（或等太久）时「再问一遍」：把同一份题目作为新消息重发，走正常回复调度。
   原消息标记 retried，气泡文案随之变成「已重新问过」（内容保留，不覆盖）。 */
async function pollRetry(id){
  const all=await dbGetAll('messages');
  const m=all.find(x=>String(x.id)===String(id));
  if(!m){showToast('题目已不存在');return;}
  const pp=m.poll||m.survey;
  if(!pp){showToast('题目内容已丢失');return;}
  const isSurvey=m.type==='survey'||!!m.survey;
  // 防连点：15 秒内重复点同一道题不再重发（比对的是「上次重问时间」，不是发题时间）
  if(m.retriedAt&&Date.now()-m.retriedAt<15000){showToast('刚刚才问过，等 TA 一下');return;}
  m.retried=1;m.retriedAt=Date.now();await dbPut('messages',m);
  await sendMsgObj({type:isSurvey?'survey':'poll',content:m.content||pp.question||'问卷',
    ...(isSurvey?{survey:pp}:{poll:pp})},false);
  if(state.currentApp==='chat')refreshMsgRow(m.id);
  showToast('已再问一遍');
}