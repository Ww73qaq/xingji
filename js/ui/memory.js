/* =========================================================
   星迹 · 回忆录：收藏 / 统计 / 数据清理入口
   ========================================================= */

/* ===== MEMORY（回忆录） ===== */
/* ===== MEMORY（数据与回忆：两个 Tab [回忆][数据]） ===== */
let memdataTab='memory';
/* v3.7.0：备份/迁移/导入属于工程数据入口，统一归到「数据」Tab，
   「回忆」Tab 只保留相遇叙事 / 数字宫格 / 收藏。按钮本身不删，只是换位置。 */
function backupMigrateHtml(){
  return `<div class="cs-group-title">备份与迁移</div>
    <div class="cs-group">
      <div class="cs-item" onclick="exportCards()"><span class="cs-ico">${ICO.card}</span><span class="cs-label">导出字卡</span><span class="cs-val">只导出字卡与分组</span><span class="cs-arrow">&#8250;</span></div>
      <div class="cs-item" onclick="importCards()"><span class="cs-ico">${ICO.book}</span><span class="cs-label">导入字卡</span><span class="cs-val">合并到当前字卡库</span><span class="cs-arrow">&#8250;</span></div>
      <div class="cs-item" onclick="exportData()"><span class="cs-ico">${ICO.mail}</span><span class="cs-label">完整备份</span><span class="cs-val">聊天 / 信件 / 日记 / 朋友圈等</span><span class="cs-arrow">&#8250;</span></div>
      <div class="cs-item" onclick="showExportSelect()"><span class="cs-ico">${ICO.chart}</span><span class="cs-label">自定义导出</span><span class="cs-val">按类别选择数据</span><span class="cs-arrow">&#8250;</span></div>
      <div class="cs-item" onclick="showImportMenu()"><span class="cs-ico">${ICO.book}</span><span class="cs-label">导入数据</span><span class="cs-val">合并 / 覆盖 / 完整</span><span class="cs-arrow">&#8250;</span></div>
    </div>`;
}
/* 「数据」Tab：先渲染收藏消息（renderDataPage 在 backup.js），再把备份/迁移入口追加在下面 */
async function renderMemoryDataTab(){
  await renderDataPage('memory-body');
  const body=document.getElementById('memory-body');
  if(body)body.insertAdjacentHTML('beforeend',backupMigrateHtml());
}
function switchMemdataTab(t,btn){
  memdataTab=t;
  document.querySelectorAll('#memdata-tabs .tab').forEach(x=>x.classList.toggle('active',x===btn));
  if(t==='data') renderMemoryDataTab();
  else renderMemory();
}
async function renderMemory(){
  const body=document.getElementById('memory-body');
  if(!body)return;
  if(memdataTab==='data'){await renderMemoryDataTab();return;}
  const msgs=await dbGetAll('messages');
  const letters=await dbGetAll('letters');
  const diaries=await dbGetAll('diaries');
  const moments=await dbGetAll('moments');
  const cards=await dbGetAll('cards');
  const emojis=await dbGetAll('emojis');
  const days=state.meetTime?Math.max(1,Math.floor((Date.now()-state.meetTime)/86400000)):null;
  const first=msgs.length?new Date(Math.min(...msgs.map(m=>m.time))):null;
  const pokeCount=Array.isArray(state.stats?.pokeGroups)?state.stats.pokeGroups.length:0;
  const favCount=msgs.filter(m=>m.fav).length;
  body.innerHTML=`
    <div class="list-card" style="text-align:center;padding:22px 16px">
      <div style="font-size:13px;color:var(--sub)">第一次说话</div>
      <div style="font-size:16px;font-weight:600;margin:6px 0;color:var(--text)">${first?fmtFull(first.getTime()):'还没有留下记录'}</div>
    </div>
    <div class="list-card"><div class="list-card-title" style="display:flex;align-items:center;justify-content:space-between"><span>相遇天数</span><span style="font-size:12px;font-weight:400;color:var(--sub);cursor:pointer;display:inline-flex;align-items:center;gap:3px" onclick="setMeetTime()">${ICO_EDIT} 修改日期</span></div>
      <div style="font-size:34px;font-weight:700;letter-spacing:2px;margin-top:4px">${days?days:'—'}<span style="font-size:14px;font-weight:400;color:var(--sub)"> 天</span></div></div>
    <div class="list-card">
      <div class="list-card-title">我们的数字</div>
      <div class="mem-stats">
        <div class="mem-stat" onclick="openApp('chat')"><b>${msgs.length}</b><span>条消息</span></div>
        <div class="mem-stat" onclick="openApp('diary')"><b>${diaries.length}</b><span>篇日记</span></div>
        <div class="mem-stat" onclick="openApp('mailbox')"><b>${letters.length}</b><span>封信件</span></div>
        <div class="mem-stat" onclick="openApp('moments')"><b>${moments.length}</b><span>条动态</span></div>
        <div class="mem-stat" onclick="openApp('cards')"><b>${cards.length}</b><span>张字卡</span></div>
        <div class="mem-stat"><b>${pokeCount}</b><span>组拍一拍</span></div>
        <div class="mem-stat" onclick="openApp('emoji')"><b>${emojis.length}</b><span>个表情包</span></div>
        <div class="mem-stat" onclick="switchMemdataTab('data',document.querySelector('#memdata-tabs .tab:nth-child(2)'))"><b>${favCount}</b><span>条收藏</span></div>
      </div>
    </div>
    <div class="empty" style="font-size:12px;line-height:1.8;text-align:left">备份、迁移与导入入口已移到「数据」Tab。</div>`;
}
function openFavMsg(id){chatPageSize=99999;saveScrollTop();navStack=['chat'];navRoot='chat';renderNav();enterPage('chat');setTimeout(()=>jumpToMsg(id),180);}

/* ===== 清除全部星迹数据 ===== */
async function clearAllXingjiData(){
  appConfirm('清除全部数据','这会删除聊天、信件、日记、朋友圈、字卡、表情包、拍一拍和收藏等本机数据，且不可恢复。',async()=>{
    try{
      for(const store of ['messages','letters','diaries','moments','cardGroups','cards','emojis','settings']){
        const all=await dbGetAll(store);
        for(const it of all) if(it&&it.id!==undefined) await dbDelete(store,it.id);
      }
      localStorage.clear();
      // v3.5.1：打标记阻止 app 启动时 ensureTaDiary 自动重生 TA 加密日记（本次会话 TA 不再凭空写日记）
      try{sessionStorage.setItem('xingji-cleared','1');}catch(e){}
      location.reload();
    }catch(e){console.error(e);showToast('清除失败，请重试');}
  });
}
