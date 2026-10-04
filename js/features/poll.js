/* =========================================================
   星迹 · 题目系统（单选 / 多选 / 问卷）
   ========================================================= */

/* ===== 问卷系统（单选 / 多选 / 问卷，三态独立，统一进回复调度） ===== */
function openPollModal(type){
  if(type==='survey'){
    showModal('发送问卷',`<div style="font-size:12px;color:var(--sub);margin-bottom:8px">问卷 = 一个消息、多个题目、每题一个单选、一次性提交。<br>支持直接粘贴 AI 生成的问卷：</div>
      <div style="background:var(--input);border-radius:12px;padding:10px 12px;font-size:12px;color:var(--hint);line-height:1.9;margin-bottom:10px">[题目] 周末想去哪里？<br>家里<br>公园<br>咖啡店<br>[题目] 想吃什么？<br>火锅<br>面<br>甜点</div>
      <textarea class="textarea-full" id="survey-raw" placeholder="在此粘贴或输入问卷内容…" style="min-height:220px;max-height:55vh"></textarea>
      <div id="survey-preview" style="font-size:12px;color:var(--sub);margin-top:8px"></div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn-pill" style="flex:1" onclick="parseSurveyText()">解析问卷</button>
        <button class="btn-pill" style="flex:1" onclick="closeModal()">取消</button>
      </div>
      <button class="btn-pill primary" style="width:100%;margin-top:10px" onclick="sendSurvey()">发送问卷</button>`);
    return;
  }
  const multi=type==='multipoll';
  showModal(multi?'发送多选题':'发送单选题',`<input class="app-input" id="poll-q" placeholder="题目" style="width:100%;margin-bottom:10px">
    <textarea class="textarea-full" id="poll-opts" placeholder="选项，一行一个（最多 6 个）" style="min-height:110px"></textarea>
    <div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button><button class="modal-btn primary" onclick="sendPoll(${multi?1:0})">发送</button></div>`);
}
/* 解析 [题目] 格式：遇到 [题目] 开始新题，下一行非空文本为选项 */
function parseSurveyText(){
  const raw=(document.getElementById('survey-raw').value||'').replace(/\r/g,'');
  const lines=raw.split('\n').map(x=>x.trim()).filter(Boolean);
  const questions=[];let cur=null;
  for(const ln of lines){
    if(/^\[题目\]|^\[题\]|^题目[:：]/.test(ln)){
      if(cur&&cur.q&&cur.options.length>=2)questions.push(cur);
      cur={q:'',options:[]};
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
async function sendPoll(multi){
  const question=(document.getElementById('poll-q').value||'').trim();
  const opts=(document.getElementById('poll-opts').value||'').split(/\n+/).map(x=>x.trim()).filter(Boolean).slice(0,6);
  if(!question){showToast('请输入题目');return;}
  if(opts.length<2){showToast('至少 2 个选项');return;}
  closeModal();
  await sendMessageObject({type:'poll',content:question,poll:{question,options:opts,multi:!!multi}});
  showToast('题目已发送，等待 TA 作答');
}
async function sendSurvey(){
  const raw=(document.getElementById('survey-raw')?document.getElementById('survey-raw').value:'').replace(/\r/g,'');
  let questions=null;
  if(surveyParsed&&surveyParsed.rawText===raw){questions=surveyParsed.questions;}
  if(!questions||!questions.length){
    // 兜底：仍按行解析一次
    parseSurveyText();
    if(surveyParsed&&surveyParsed.rawText===raw)questions=surveyParsed.questions;
  }
  if(!questions||!questions.length){showToast('请先输入有效的问卷内容（[题目] + 选项）');return;}
  if(questions.length>20){showToast('最多 20 题');return;}
  closeModal();
  surveyParsed=null;
  const title=questions[0].q+' 等 '+questions.length+' 题';
  await sendMessageObject({type:'survey',content:title,survey:{questions,rawText:raw}});
  showToast('问卷已发送，等待 TA 作答');
}

/* 题目未作答时「点击可再问一遍」：把同一份题目重新发一次，走正常回复调度 */
async function pollRetry(id){
  const all=await dbGetAll('messages');
  const m=all.find(x=>String(x.id)===String(id));
  if(!m){showToast('题目已不存在');return;}
  const pp=m.poll||m.survey;
  if(!pp){showToast('题目内容已丢失');return;}
  await sendMsgObj({type:'poll',content:m.content||pp.question||'问卷',poll:pp},false);
  showToast('已再问一遍');
}
