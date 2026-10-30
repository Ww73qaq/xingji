/* =========================================================
   星迹 · 五子棋（4.2：与 TA 对弈）
   —— 桌面第 2 页第 4 格。15×15 极简棋盘，TA 用启发式（连三/连四优先 + 随机扰动）。
   —— 不做联机、不做存档；胜负后 TA 说一句字卡。
   ========================================================= */

let gb=null;
const GOBAN_N=15;

function gobanNew(){
  return {
    board:Array.from({length:GOBAN_N},()=>Array(GOBAN_N).fill(0)),
    turn:1,            // 1=我(黑) 2=TA(白)
    over:false,
    last:null,
    moves:0
  };
}
function gobanStart(){
  gb=gobanNew();
  renderGoban();
}

function gobanDirCount(b,r,c,dr,dc,who){
  let n=0; r+=dr; c+=dc;
  while(r>=0&&r<GOBAN_N&&c>=0&&c<GOBAN_N&&b[r][c]===who){n++;r+=dr;c+=dc;}
  return n;
}
function gobanWins(b,r,c,who){
  const dirs=[[1,0],[0,1],[1,1],[1,-1]];
  return dirs.some(([dr,dc])=>gobanDirCount(b,r,c,dr,dc,who)+gobanDirCount(b,r,c,-dr,-dc,who)+1>=5);
}

function gobanPlace(r,c,who){
  if(!gb||gb.over||gb.board[r][c]!==0)return false;
  gb.board[r][c]=who; gb.moves++; gb.last=[r,c];
  if(gobanWins(gb.board,r,c,who)){gb.over=true;gb.winner=who;}
  return true;
}

/* TA 落子：优先堵/成五，其次连四/活三，最后随机 */
function gobanTaMove(){
  const b=gb.board;
  let best=null,score=-1;
  for(let r=0;r<GOBAN_N;r++)for(let c=0;c<GOBAN_N;c++){
    if(b[r][c]!==0)continue;
    if(!gobanHasNeighbor(r,c))continue;
    let s=0;
    s+=gobanEval(b,r,c,2)*10;   // 自己成势
    s+=gobanEval(b,r,c,1)*9;    // 堵我
    s+=Math.random()*2;
    if(s>score){score=s;best=[r,c];}
  }
  if(!best){
    const empty=[];
    for(let r=0;r<GOBAN_N;r++)for(let c=0;c<GOBAN_N;c++)if(b[r][c]===0)empty.push([r,c]);
    best=empty[Math.floor(Math.random()*empty.length)];
  }
  if(!best)return;
  gobanPlace(best[0],best[1],2);
}
function gobanEval(b,r,c,who){
  let s=0;
  const dirs=[[1,0],[0,1],[1,1],[1,-1]];
  for(const [dr,dc] of dirs){
    const n=gobanDirCount(b,r,c,dr,dc,who)+gobanDirCount(b,r,c,-dr,-dc,who)+1;
    if(n>=5)s+=1000; else if(n===4)s+=100; else if(n===3)s+=10; else if(n===2)s+=2;
  }
  return s;
}
function gobanHasNeighbor(r,c){
  for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
    if(dr===0&&dc===0)continue;
    const rr=r+dr,cc=c+dc;
    if(rr>=0&&rr<GOBAN_N&&cc>=0&&cc<GOBAN_N&&gb.board[rr][cc]!==0)return true;
  }
  return false;
}

function renderGoban(){
  const body=document.getElementById('goban-body');
  if(!body)return;
  if(!gb)gb=gobanNew();
  const name=(state.other&&state.other.name)||'TA';
  let status;
  if(gb.over){
    status = gb.winner===1 ? '你赢了' : (name+' 赢了');
  }else{
    status = gb.turn===1 ? '轮到你落子' : (name+' 正在想…');
  }
  let board='';
  for(let r=0;r<GOBAN_N;r++){
    let row='';
    for(let c=0;c<GOBAN_N;c++){
      const v=gb.board[r][c];
      const last=gb.last&&gb.last[0]===r&&gb.last[1]===c;
      row+=`<div class="gob-cell${last?' last':''}" onclick="gobanTap(${r},${c})">${v?'<i class="go'+(v===1?'b':'w')+'"></i>':''}</div>`;
    }
    board+=`<div class="gob-row">${row}</div>`;
  }
  body.innerHTML=`
    <div class="gob-status">${esc(status)}</div>
    <div class="gob-board">${board}</div>
    <div class="gob-actions">
      <button class="btn-pill ghost" onclick="gobanStart()">重新开始</button>
      ${gb.over?`<button class="btn-pill primary" onclick="gobanTaSay()">听 TA 说一句</button>`:''}
    </div>`;
}

function gobanTap(r,c){
  if(!gb||gb.over||gb.turn!==1)return;
  if(!gobanPlace(r,c,1))return;
  renderGoban();
  if(gb.over)return;
  gb.turn=2;
  setTimeout(()=>{
    gobanTaMove();
    gb.turn=1;
    renderGoban();
  },450+Math.random()*700);
}

async function gobanTaSay(){
  if(!gb||!gb.over)return;
  let text='这局很有意思。';
  try{
    const cards=(await dbGetAll('cards')).filter(c=>c&&c.enabled!==false&&c.text);
    if(cards.length)text=cards[Math.floor(Math.random()*cards.length)].text;
  }catch(_){}
  const win=gb.winner===1;
  const lead=win?'我输了，':(gb.winner===2?'我赢了，':'平局，');
  showModal('TA 说','<div style="padding:6px 4px;font-size:14px;color:var(--text);line-height:1.8">'+esc(lead)+esc(text)+'</div>',
    '<div class="modal-btn-row single"><button class="modal-btn" onclick="closeModal()">好</button></div>');
}

window.gobanStart=gobanStart;
window.renderGoban=renderGoban;
window.gobanTap=gobanTap;
window.gobanTaSay=gobanTaSay;
