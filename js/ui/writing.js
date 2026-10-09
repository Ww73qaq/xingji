/* =========================================================
   星迹 · 拼写画板
   ========================================================= */

let spellLetters=[];
let spellView='board';          // board | history
function spellTodayStr(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function loadSpellHistory(){try{return JSON.parse(localStorage.getItem('xingji-spelling')||'[]');}catch(e){return [];}}
function saveSpellHistory(h){try{localStorage.setItem('xingji-spelling',JSON.stringify(h));}catch(e){}}
function getTodaySpell(){
  const h=loadSpellHistory();const t=spellTodayStr();
  let d=h.find(x=>x.date===t);
  if(!d){d={date:t,startedAt:Date.now(),updatedAt:Date.now(),letters:[],completed:false};h.push(d);saveSpellHistory(h);}
  return d;
}
function persistTodaySpell(){
  const h=loadSpellHistory();const t=spellTodayStr();
  let d=h.find(x=>x.date===t);
  if(!d){d={date:t,startedAt:Date.now(),updatedAt:Date.now(),letters:[],completed:false};h.push(d);}
  d.letters=spellLetters.slice();d.updatedAt=Date.now();d.completed=spellLetters.length>0;
  saveSpellHistory(h);
}
function renderWriting(){   // 拼写画板：18 个字母固定三行六列，同时显示，不滚动
  const body=document.getElementById('writing-body');if(!body)return;
  const d=getTodaySpell();
  if(spellView==='history'){renderSpellHistory(body);return;}
  const cells=Array.from({length:SPELL_MAX},(_,i)=>{
    const ch=spellLetters[i];
    return ch?`<div class="spell-cell"><span class="spell-char">${esc(ch)}</span><span class="spell-del" onclick="delSpellLetter(${i})">&#10005;</span></div>`:'<div class="spell-cell empty">&#160;</div>';
  }).join('');
  body.innerHTML=`
    <div class="list-card" style="padding:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
        <span style="font-size:13px;color:var(--text)">${esc(state.other.name)} 在拼写</span>
        <span style="font-size:12px;color:var(--sub);cursor:pointer;display:flex;align-items:center;gap:3px" onclick="spellView='history';renderWriting()">${ICO.book} 记录</span>
      </div>
      <div style="font-size:11px;color:var(--hint);margin-bottom:8px">${d.date}${d.completed?' · 已完成':''}</div>
      <div class="spell-book"><div class="spell-cell-row">${cells}</div></div>
      <div style="font-size:11px;color:var(--hint);margin-top:6px">${spellLetters.length} / ${SPELL_MAX} 个字母${spellLetters.length>=SPELL_MAX?' · 已满，可点 × 修改':' · 一排 6 个，共 3 排'}</div>
    </div>
    <div class="list-card" style="padding:10px 12px">
      <div style="font-size:12px;color:var(--sub);margin-bottom:8px">陪他把今天的字母排一排，不是传讯</div>
      <div class="spell-keys">${ALPHABET.map(ch=>`<button class="spell-key" onclick="addSpellLetter('${ch}')">${ch}</button>`).join('')}</div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn-pill primary" style="flex:1" onclick="spellDone()">完成今天的拼写</button>
        <button class="btn-pill ghost" style="flex:1" onclick="clearSpell()">一键清除</button>
      </div>
    </div>`;
}
function renderSpellHistory(body){
  const h=loadSpellHistory().slice().reverse();
  body.innerHTML=`
    <div class="list-card" style="padding:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:13px;font-weight:600">拼写记录</span>
        <span style="font-size:12px;color:var(--sub);cursor:pointer" onclick="spellView='board';renderWriting()"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><path d="M15 5l-7 7 7 7"/></svg> 返回拼写</span>
      </div>
      ${h.length?h.map(r=>`<div class="fav-item"><span style="font-size:11px;color:var(--hint);flex-shrink:0">${esc(r.date)}</span><span style="flex:1;font-family:Georgia,serif;font-size:17px;letter-spacing:3px">${esc(r.letters.join('')||'—')}</span><span style="font-size:11px;color:${r.completed?'#27ae60':'var(--hint)'};flex-shrink:0">${r.completed?'已完成':'未完成'}</span></div>`).join(''):'<div class="empty" style="padding:20px 0">还没有拼写记录</div>'}
    </div>`;
}
function addSpellLetter(ch){
  if(spellLetters.length>=SPELL_MAX){showToast('最多拼写 '+SPELL_MAX+' 个字母');return;}
  spellLetters.push(ch);persistTodaySpell();renderWriting();
  haptic&&haptic();
}
function delSpellLetter(i){
  if(i<0||i>=spellLetters.length)return;
  spellLetters.splice(i,1);persistTodaySpell();renderWriting();
}
function clearSpell(){
  if(!spellLetters.length)return;
  spellLetters=[];persistTodaySpell();renderWriting();showToast('已清除');
}
function spellDone(){
  persistTodaySpell();
  if(!spellLetters.length){showToast('今天还没有拼写内容');return;}
  const d=getTodaySpell();d.completed=true;persistTodaySpell();
  showToast('今天的拼写已记录');
  renderWriting();
  // 他拼写完成后，小概率在聊天里轻轻说一句（统一回复引擎的候选之一）
  // v3.7.0：静音/收起声音期间不触发 TA 台词（记录已先落盘，不丢数据）
  if(Math.random()<0.5){
    if(taOutputBlocked())return;
    enqueueTaJob({type:'text',text:SPELL_PRAISES[Math.floor(Math.random()*SPELL_PRAISES.length)]});
  }
}
