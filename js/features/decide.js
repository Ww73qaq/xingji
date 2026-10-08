/* =========================================================
   星迹 · 帮我决定（v3.5.10）
   借鉴 mochi decision.js（小红书@FelixFelicis 设计思路）简化为单聊版：
   - 输入纠结问题 + 每行一个选项（自定义）
   - TA 思考 3~6 秒（倒计时提示，期间防连点）
   - 从选项池随机决定（含「这个我不选 / 正在忙，暂未回复」两个兜底）
   - 结果以 TA 消息推送到聊天（pushReply，含后台通知）
   ========================================================= */
let decideTimer=null;
function helpMeDecide(){
  showModal('帮我决定',`
    <div style="font-size:12px;color:var(--sub);margin-bottom:6px">输入你的纠结</div>
    <textarea class="app-input auto-grow" id="dec-question" placeholder="例如：我今晚该吃什么？" style="width:100%;resize:none;min-height:64px"></textarea>
    <div style="font-size:12px;color:var(--sub);margin:10px 0 6px">选项（每行一个）</div>
    <textarea class="app-input auto-grow" id="dec-opts" placeholder="火锅&#10;烧烤&#10;日料" style="width:100%;resize:none;min-height:96px"></textarea>
    <div class="dec-result" id="dec-result" style="display:none;margin-top:10px;padding:10px 12px;border-radius:12px;background:rgba(128,128,128,.1);font-size:14px;white-space:pre-wrap;word-break:break-word"></div>`,
    '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button><button class="modal-btn primary" onclick="decideGo()">让 TA 决定</button></div>');
  setTimeout(()=>{const el=document.getElementById('dec-question');if(el)el.focus();},80);
}
function decideGo(){
  if(decideTimer){showToast('TA 正在思考中，稍等一下…');return;}
  const q=(document.getElementById('dec-question').value||'').trim();
  const opts=(document.getElementById('dec-opts').value||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);
  if(!q){showToast('请输入你的纠结');return;}
  if(opts.length<2){showToast('至少需要 2 个选项');return;}
  const resultEl=document.getElementById('dec-result');
  resultEl.style.display='block';
  resultEl.textContent='TA 正在思考中…';
  const think=3000+Math.random()*3000;   // 3~6 秒思考
  decideTimer=setTimeout(async()=>{
    decideTimer=null;
    const pool=opts.slice().concat(['这个我不选','正在忙，暂未回复']);
    const shuffled=pool.slice().sort(()=>Math.random()-0.5);
    const pick=shuffled[0];
    resultEl.textContent='TA 选了：「'+pick+'」';
    const replyText='【帮我决定】'+q+'\n选项：\n'+opts.map((o,i)=>(i+1)+'. '+o).join('\n')+'\n→ '+pick;
    try{await pushReply(replyText);}catch(e){}
    closeModal();
    showToast('帮我决定已完成');
  },think);
}
