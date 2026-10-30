/* =========================================================
   星迹 · 选择器（问 TA）
   4.0 新增：聊天附加功能里的一格「问 TA」。
   —— 形态：选项组（胶囊横排，选项多了自动换行），不是转盘。
   —— 不填问题，点开即用；默认三选项「是 / 否 / 再想一想」，可自行增删。
   —— 点「问 TA」→ 选中一项高亮 → 下方直接显示一张字卡作为「他的意思」。
      「他的意思」默认就有，不需要勾选、不是投票，只是他从字卡库里给你的一句话。
   —— 只做展示与一次本地抽选；选项持久化在 state.selectorOptions。
   ========================================================= */

const SELECTOR_DEFAULT = ['是', '否', '再想一想'];
let selPicked = null;      // 本次抽中的选项
let selCard = null;        // 本次抽中的字卡文本
let selEditMode = false;   // 编辑模式：点胶囊即删除
let selRolling = false;    // 抽选中（防连点）
let selEditingIdx = -1;    // 4.1：正在就地修改的选项下标（-1 = 没在改）

function selectorOptions(){
  if(!Array.isArray(state.selectorOptions) || !state.selectorOptions.length){
    state.selectorOptions = SELECTOR_DEFAULT.slice();
  }
  /* 4.1：至少两个选项——历史数据被删到只剩 1 个时自动补回默认 */
  while(state.selectorOptions.length < 2){
    const add = SELECTOR_DEFAULT.find(d=>!state.selectorOptions.includes(d)) || ('选项'+(state.selectorOptions.length+1));
    state.selectorOptions.push(add);
  }
  return state.selectorOptions;
}

function openSelector(){
  selPicked = null; selCard = null; selEditMode = false; selRolling = false;
  showModal('问 TA',
    `<div class="sel-wrap">
       <div class="sel-hint">选不出来的时候，让他替你选一个。</div>
       <div class="sel-pills" id="sel-pills"></div>
       <div class="sel-add" id="sel-add" style="display:none">
         <input class="textarea-full" id="sel-newopt" maxlength="12" placeholder="写一个新选项"
                style="min-height:0;padding:9px 10px" onkeydown="if(event.key==='Enter'){event.preventDefault();selAddConfirm();}">
         <div class="sel-add-row">
           <button type="button" class="btn-pill ghost" onclick="selAddCancel()">取消</button>
           <button type="button" class="btn-pill primary" onclick="selAddConfirm()">加上</button>
         </div>
       </div>
       <div class="sel-result" id="sel-result" style="display:none"></div>
       <div class="sel-actions">
         <button type="button" class="btn-pill ghost" id="sel-edit-btn" onclick="selToggleEdit()">添加 / 修改</button>
         <button type="button" class="btn-pill primary" id="sel-ask-btn" onclick="selAsk()">问 TA</button>
       </div>
     </div>`,
    '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">关闭</button></div>');
  renderSelector();
}

function renderSelector(){
  const box = document.getElementById('sel-pills');
  if(!box) return;
  const opts = selectorOptions();
  box.innerHTML = opts.map((o,i)=>{
    if(selEditingIdx === i){
      return `<span class="sel-pill editing sel-editing">
        <input class="sel-inline" id="sel-inline" maxlength="12" value="${esc(o)}"
               onkeydown="if(event.key==='Enter'){event.preventDefault();selInlineOk(${i});}else if(event.key==='Escape'){selInlineCancel();}">
      </span>`;
    }
    return `<button type="button" class="btn-pill ${selPicked===o?'primary':'ghost'} sel-pill${selEditMode?' editing':''}"
             data-si="${i}">${esc(o)}${selEditMode?'<span class="sel-x" data-del="1"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></span>':''}</button>`;
  }).join('') + (selEditMode ? `<button type="button" class="btn-pill ghost sel-pill sel-plus" data-plus="1">＋ 新选项</button>` : '');
  /* 选项文本可能含引号，不能拼进 inline onclick；统一用 index 绑定 */
  box.querySelectorAll('.sel-pill').forEach(el=>{
    if(el.dataset.plus){
      el.onclick = ()=>{ selAddOpen(); };
      return;
    }
    const i = Number(el.dataset.si);
    el.onclick = (e)=>{
      /* × 才是删除；点胶囊本身是改文字（4.1：不用再「先删再建」） */
      if(selEditMode){
        if(e.target && e.target.dataset && e.target.dataset.del){ selDelete(i); return; }
        selEditOption(i); return;
      }
      /* 非编辑态点击：只切换高亮，不自动作答（作答是「问 TA」的事） */
      selPicked = selPicked === selectorOptions()[i] ? null : selectorOptions()[i];
      selCard = null; selRolling = false;
      renderSelector(); renderSelResult();
    };
    /* 双击也能直接改（不用先进编辑模式） */
    el.ondblclick = (e)=>{ e.preventDefault(); e.stopPropagation(); selEditOption(i); };
  });
}

function renderSelResult(){
  const box = document.getElementById('sel-result');
  if(!box) return;
  if(selRolling){
    box.style.display = 'block';
    box.innerHTML = `<div class="sel-res-line">他正在选……</div>`;
    return;
  }
  if(!selPicked){ box.style.display='none'; box.innerHTML=''; return; }
  box.style.display = 'block';
  box.innerHTML =
    `<div class="sel-res-head">TA 的选择</div>
     <div class="sel-res-pick">${esc(selPicked)}</div>
     ${selCard?`<div class="sel-res-card"><span class="sel-res-label">他的意思</span><div>${esc(selCard)}</div></div>`:''}
     ${selCard?`<button type="button" class="btn-pill ghost sel-send" onclick="selSendToChat()">发到聊天</button>`:''}`;
}

/* 抽一张字卡当「他的意思」：优先短句、按使用次数均衡（与引擎同一套加权），抽不到退回系统池 */
async function _selDrawCardText(){
  try{
    const cards = await dbGetAll('cards');
    if(cards && cards.length){
      const short = cards.filter(c=>c&&c.text&&String(c.text).length<=32&&!String(c.text).includes('\n'));
      const pool = short.length ? short : cards;
      const pick = (typeof _pickBalanced==='function') ? _pickBalanced(pool, null) : pool[Math.floor(Math.random()*pool.length)];
      if(pick&&pick.text){
        try{
          pick.useCount=(pick.useCount||0)+1;
          pick.lastUsedAt=Date.now();
          if(pick.id)await dbPut('cards',pick);
        }catch(e){}
        return pick.text;
      }
    }
  }catch(e){}
  const sys=(typeof SYSTEM_TEXT_POOL==='function')?SYSTEM_TEXT_POOL():['嗯，我在听。'];
  return sys[Math.floor(Math.random()*sys.length)];
}

async function selAsk(){
  if(selRolling) return;
  const opts = selectorOptions();
  if(opts.length<2){ showToast('至少留两个选项'); return; }
  selRolling = true; selCard = null;
  const btn = document.getElementById('sel-ask-btn');
  if(btn){ btn.disabled = true; btn.textContent = '……'; }
  const box = document.getElementById('sel-pills');
  const pills = box ? [...box.querySelectorAll('.sel-pill')] : [];
  /* 短促的「滚动」过一遍，最后停在一个选项上——只动高亮，不改文案 */
  const total = 8 + Math.floor(Math.random()*5);
  for(let i=0;i<total;i++){
    const idx = i % opts.length;
    pills.forEach((p,j)=>p.classList.toggle('primary', j===idx));
    await new Promise(r=>setTimeout(r, 45 + i*6));
  }
  const finalIdx = Math.floor(Math.random()*opts.length);
  selPicked = opts[finalIdx];
  selRolling = false;
  renderSelector();
  selCard = await _selDrawCardText();
  renderSelResult();
  if(btn){ btn.disabled = false; btn.textContent = '再问一次'; }
}

function selSendToChat(){
  if(!selPicked) return;
  const text = selCard
    ? `问 TA：${selPicked}\n他的意思：${selCard}`
    : `问 TA：${selPicked}`;
  closeModal();
  /* 走统一发送通道：作为我的一条消息落地，TA 会照常接话 */
  sendMessageObject({type:'text', content:text});
  showToast('已发到聊天');
}

function selToggleEdit(){
  selEditMode = !selEditMode;
  if(selEditMode){
    /* 改选项就把上一轮结果清掉，别让旧结果挂在新选项下面 */
    selPicked = null; selCard = null; renderSelResult();
    const askBtn = document.getElementById('sel-ask-btn');
    if(askBtn){ askBtn.disabled = false; askBtn.textContent = '问 TA'; }
  }
  if(selEditingIdx >= 0) selEditingIdx = -1;
  const btn = document.getElementById('sel-edit-btn');
  if(btn) btn.textContent = selEditMode ? '完成' : '添加 / 修改';
  if(!selEditMode) selEditingIdx = -1;
  if(!selEditMode){ const add=document.getElementById('sel-add'); if(add) add.style.display='none'; }
  renderSelector();
}

/* 4.1：就地改选项文字——单击/双击胶囊即可，改完回车或点别处生效 */
function selEditOption(i){
  const opts = selectorOptions();
  if(opts[i] === undefined) return;
  selEditingIdx = i;
  renderSelector();
  setTimeout(()=>{
    const inp = document.getElementById('sel-inline');
    if(!inp) return;
    inp.focus();
    try{ inp.setSelectionRange(inp.value.length, inp.value.length); }catch(_){}
    inp.onblur = ()=>{ setTimeout(()=>{ if(selEditingIdx===i) selInlineOk(i); }, 120); };
  }, 60);
}
function selInlineOk(i){
  const inp = document.getElementById('sel-inline');
  const v = inp ? String(inp.value || '').trim() : '';
  const opts = selectorOptions();
  if(!v){ showToast('选项不能为空'); selEditingIdx = -1; renderSelector(); return; }
  if(opts.some((o, idx) => idx !== i && o === v)){ showToast('这个选项已经有了'); selEditingIdx = -1; renderSelector(); return; }
  if(selPicked === opts[i]) selPicked = v;
  opts[i] = v;
  selEditingIdx = -1;
  saveKey('selectorOptions');
  renderSelector(); renderSelResult();
}
function selInlineCancel(){
  selEditingIdx = -1;
  renderSelector();
}

function selDelete(i){
  const opts = selectorOptions();
  if(opts.length<=2){ showToast('至少留两个选项'); return; }
  opts.splice(i,1);
  saveKey('selectorOptions');
  renderSelector();
}

function selAddOpen(){
  const add = document.getElementById('sel-add');
  if(add) add.style.display = 'block';
  setTimeout(()=>{const inp=document.getElementById('sel-newopt'); if(inp) inp.focus();}, 80);
}

function selAddCancel(){
  const add = document.getElementById('sel-add');
  if(add) add.style.display = 'none';
  const inp = document.getElementById('sel-newopt');
  if(inp) inp.value = '';
}

function selAddConfirm(){
  const inp = document.getElementById('sel-newopt');
  const v = (inp && inp.value || '').trim();
  if(!v){ showToast('先写一个选项'); return; }
  const opts = selectorOptions();
  if(opts.length >= 12){ showToast('选项最多 12 个'); return; }
  if(opts.includes(v)){ showToast('这个选项已经有了'); return; }
  opts.push(v);
  saveKey('selectorOptions');
  if(inp) inp.value = '';
  const add = document.getElementById('sel-add');
  if(add) add.style.display = 'none';
  selEditMode = true;
  const btn = document.getElementById('sel-edit-btn');
  if(btn) btn.textContent = '完成';
  renderSelector();
}

window.openSelector = openSelector;
window.selAsk = selAsk;
window.selSendToChat = selSendToChat;
window.selToggleEdit = selToggleEdit;
window.selAddConfirm = selAddConfirm;
window.selAddCancel = selAddCancel;
window.selEditOption = selEditOption;
window.selInlineOk = selInlineOk;
window.selInlineCancel = selInlineCancel;
