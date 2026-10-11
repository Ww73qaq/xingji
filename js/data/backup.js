/* =========================================================
   星迹 · 数据备份：完整备份 / 选择性导出 / 导入 / 恢复出厂
   ========================================================= */

/* pokeGroups 不在 IndexedDB：存于 state.stats.pokeGroups（localStorage），导出/导入特殊读写
   v3.4.0：以 {分组名:[字卡…]} 结构读写，分组名不再被拍平成 gxxxxx */
/* ---- v3.9.5 新增：books 的二进制携带 + settings 深合并 + 备份内容白名单 ----
   books 记录里的 blob 是二进制，JSON.stringify(Blob) 会得到 {}，所以必须转成 dataURL 才能随备份走；
   单本超过 BOOK_BACKUP_LIMIT 的直接跳过（base64 还要再膨胀 33%，体积与内存都不可控），
   但绝不因此让整份备份失败。 */
const BOOK_BACKUP_LIMIT=8*1024*1024;
function _bkBlobToDataURL(blob){
  return new Promise(res=>{
    try{
      const fr=new FileReader();
      fr.onload=()=>res(typeof fr.result==='string'?fr.result:'');
      fr.onerror=()=>res('');
      fr.readAsDataURL(blob);
    }catch(e){res('');}
  });
}
function _bkDataURLToBlob(dataURL,mime){
  try{
    const i=dataURL.indexOf(',');
    if(i<0)return null;
    const head=dataURL.slice(0,i),body=dataURL.slice(i+1);
    const bin=/;base64/i.test(head)?atob(body):decodeURIComponent(body);
    const bytes=new Uint8Array(bin.length);
    for(let k=0;k<bin.length;k++)bytes[k]=bin.charCodeAt(k);
    return new Blob([bytes],{type:mime||'application/octet-stream'});
  }catch(e){return null;}
}
/* 只对「纯对象」递归合并，数组整体替换。用于 settings 每个键的值：
   避免覆盖导入时把备份里没有的字段抹成 undefined（典型：stats.taNoteLastAt → TA 便签冷却失效）。 */
function _deepMerge(cur,inc){
  if(!cur||typeof cur!=='object'||Array.isArray(cur))return inc;
  if(!inc||typeof inc!=='object'||Array.isArray(inc))return inc;
  const out={...cur};
  for(const k of Object.keys(inc)){
    const a=cur[k],b=inc[k];
    out[k]=(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b))?_deepMerge(a,b):b;
  }
  return out;
}
/* 备份内容白名单化：只接受本应用已知的 store 且形状正确（数组；pokeGroups 为对象）。
   此前只要顶层有个真值 .stores 就放行，任意第三方 JSON（例如 {"stores":{"questions":[...]}}）
   都能通过校验并在覆盖导入时把库洗成空的（v3.9.5 修）。 */
function _backupStores(data){
  if(!data||typeof data!=='object')return null;
  const raw=(data.stores&&typeof data.stores==='object'&&!Array.isArray(data.stores))?data.stores:data;
  if(!raw||typeof raw!=='object')return null;
  const out={};
  for(const k of Object.keys(raw)){
    if(STORES.indexOf(k)<0)continue;                 // 不认识的键一律丢弃
    const v=raw[k];
    if(k==='pokeGroups'){if(v&&typeof v==='object'&&!Array.isArray(v))out[k]=v;continue;}
    if(Array.isArray(v))out[k]=v;                    // 形状不对（对象/字符串/数字）一律丢弃
  }
  return Object.keys(out).length?out:null;
}

async function _readStoreData(name){
  if(name==='pokeGroups'){
    const g=(state.stats&&state.stats.pokeGroups)||{};
    const out={};
    for(const k of Object.keys(g))out[k]=Array.isArray(g[k])?g[k].slice():[];
    return out;
  }
  if(name==='books'){
    const list=await dbGetAll('books');
    const out=[];let skipped=0;
    for(const rec of list){
      const r={...rec};
      const blob=r.blob;delete r.blob;
      if(blob&&blob.size!==undefined){
        if(blob.size>BOOK_BACKUP_LIMIT){skipped++;continue;}
        const d=await _bkBlobToDataURL(blob);
        if(!d){skipped++;continue;}
        r.blobData=d;
      }
      out.push(r);
    }
    if(skipped)try{showToast(skipped+' 本超过 8MB 的书未写入备份');}catch(e){}
    return out;
  }
  return await dbGetAll(name);
}
async function _writeStoreData(name,items,mode){
  if(name==='pokeGroups'){
    // items 可能是新版的 {分组名:[…]}，也可能是旧版拍平后的 [[…],[…]]
    const obj={};
    if(Array.isArray(items)){
      items.forEach(arr=>{
        const k='g'+Math.random().toString(36).slice(2,7);
        obj[k]=Array.isArray(arr)?arr:[];
      });
    }else if(items&&typeof items==='object'){
      for(const k of Object.keys(items))obj[k]=Array.isArray(items[k])?items[k].slice():[];
    }
    state.stats.pokeGroups=obj;saveKey('stats');return;
  }
  /* v3.9.5：settings 一律「按键深合并」，绝不整段替换。
     备份里缺失的字段保留现值，否则用旧备份覆盖导入会把 stats.taNoteLastAt 之类字段抹成 undefined
     （表现为 TA 便签 90 分钟冷却失效、导入后立刻又写一张）。 */
  if(name==='settings'){
    for(const item of items){
      if(!item||item.key===undefined)continue;
      const cur=await dbGet('settings',item.key);
      await dbPut('settings',{key:item.key,value:_deepMerge(cur&&cur.value,item.value)});
    }
    return;
  }
  /* v3.9.5：books 含二进制文件本体，需把 dataURL 还原成 Blob。
     合并导入按「书名 + 大小」去重；覆盖/完整导入保留原 id。 */
  if(name==='books'){
    if(mode!=='merge'){
      const cur=await dbGetAll('books');
      for(const it of cur)await dbDelete('books',dbPrimaryKey('books',it));
    }
    const existing=mode==='merge'?await dbGetAll('books'):[];
    for(const item of items){
      const rec={...item};
      const data=rec.blobData;delete rec.blobData;
      if(data){const b=_bkDataURLToBlob(data,rec.mime);if(b)rec.blob=b;}
      if(!rec.blob)continue;                       // 备份里没有文件本体，恢复这条记录没有意义
      if(mode==='merge'){
        if(existing.some(x=>x&&x.name===rec.name&&x.size===rec.size))continue;
        delete rec.id;
      }
      await dbPut('books',rec);
    }
    return;
  }
  if(mode!=='merge'){const cur=await dbGetAll(name);for(const it of cur)await dbDelete(name,dbPrimaryKey(name,it));}
  const existing=mode==='merge'?await dbGetAll(name):[];
  const existKeys=new Set(existing.map(x=>dbPrimaryKey(name,x)));
  for(const item of items){
    const rec={...item};
    const pk=dbPrimaryKey(name,rec);
    if(pk!==undefined&&pk!==null&&!existKeys.has(pk)){await dbPut(name,rec);existKeys.add(pk);}
    else{delete rec.id;await dbPut(name,rec);}
  }
}
/* 备份里某个类别是否真的有数据（pokeGroups 是对象，其余是数组） */
function _storeHasPayload(v){
  if(Array.isArray(v))return v.length>0;
  if(v&&typeof v==='object')return Object.keys(v).length>0;
  return false;
}
/* 完整备份：schemaVersion / appVersion / exportedAt / stores，保留所有 ID */
async function exportData(){
  const name='星迹_完整备份_'+new Date().toISOString().slice(0,10)+'.json';
  confirmDownload(name,async()=>{
    showToast('正在打包数据…');
    const data={
      app:'xingji', schemaVersion:SCHEMA_VERSION, appVersion:APP_VERSION,
      exportedAt:new Date().toISOString(), stores:{}
    };
    for(const s of STORES)data.stores[s]=await _readStoreData(s);
    const blob=new Blob([JSON.stringify(data)],{type:'application/json'});
    return {blob,name};
  });
}
function showQqBackup(text,name){
  const size=(new Blob([text]).size/1024/1024).toFixed(2);
  const safeName=esc(name);
  const html='<div style="padding:2px 0 8px;font-size:13px;line-height:1.8;color:var(--sub)">QQ 内置浏览器不稳定支持网页文件下载，所以这次不再把“已发起下载”当成成功。<br><b style="color:var(--text)">'+safeName+'</b> · '+size+' MB<br>备份内容已经在本页面生成，<b style="color:var(--text)">不会修改或删除你现有的数据</b>。</div>'
    +'<textarea id="qq-backup-text" readonly style="width:100%;height:190px;border:1px solid var(--input);border-radius:10px;background:#f7f7f5;padding:10px;font-size:10px;line-height:1.5;color:#555;resize:none;box-sizing:border-box">'+esc(text)+'</textarea>'
    +'<div style="font-size:11px;color:var(--hint);margin-top:7px;line-height:1.6">推荐先点“系统分享/保存”。如果 QQ 不弹系统面板，再点“复制全部”，把备份文本保存到安全位置。</div>';
  showModal('QQ 数据备份',html,
    '<div class="modal-btn-row"><button class="modal-btn" onclick="qqCopyBackup()">复制全部</button><button class="modal-btn primary" onclick="qqShareBackup()">系统分享/保存</button></div>');
  window.__qqBackupText=text;window.__qqBackupName=name;
}
async function qqShareBackup(){
  const text=window.__qqBackupText||'',name=window.__qqBackupName||'星迹_备份.json';
  try{
    const file=new File([text],name,{type:'application/json'});
    if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){
      await navigator.share({title:'星迹数据备份',text:'星迹数据备份文件：'+name,files:[file]});
      showToast('已交给系统分享/保存');return;
    }
  }catch(e){}
  showToast('当前 QQ 不支持文件分享，请使用“复制全部”');
}
async function qqCopyBackup(){
  const text=window.__qqBackupText||'';
  try{
    if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);showToast('备份已复制，请立即保存到安全位置');}
    else{const ta=document.getElementById('qq-backup-text');ta.focus();ta.select();document.execCommand('copy');showToast('备份已复制，请立即保存到安全位置');}
  }catch(e){
    const ta=document.getElementById('qq-backup-text');if(ta){ta.focus();ta.select();}
    showToast('自动复制失败，请长按文本框后选择“全选/复制”');
  }
}
/* 选择性导出：按类别勾选（默认全选） */
let exportSel=new Set(STORES);
async function renderDataPage(targetId='data-body'){
  const body=document.getElementById(targetId)||document.getElementById('data-body');
  if(!body)return;
  const msgs=await dbGetAll('messages');
  const favs=msgs.filter(m=>m.fav).sort((a,b)=>b.time-a.time);
  body.innerHTML=`
    <div class="cs-group-title">收藏消息</div>
    <div class="list-card">
      ${favs.length?favs.map(m=>`<div class="fav-item" onclick="openFavMsg(${m.id})"><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc((m.content||'').slice(0,80))}</span><span style="font-size:11px;color:var(--hint);flex-shrink:0">${fmtFull(m.time)}</span></div>`).join(''):'<div class="empty" style="padding:24px 0">还没有收藏的消息<br>在聊天里长按消息可收藏</div>'}
    </div>`;
}
function showExportSelect(){
  exportSel=new Set(STORES);
  showModal('选择性导出',
    STORES.map(s=>`<label class="modal-item" style="display:flex;align-items:center;gap:10px;cursor:pointer">
      <input type="checkbox" class="card-select" checked onchange="toggleExportSel('${s}',this.checked)">
      <span style="flex:1;text-align:left">${STORE_LABELS[s]||s}</span></label>`).join('')
    +'<button class="btn-pill primary" style="width:100%;margin-top:6px" onclick="doExportSelect()">导出所选</button>');
}
function toggleExportSel(s,on){if(on)exportSel.add(s);else exportSel.delete(s);}
async function doExportSelect(){
  const sel=[...exportSel];
  if(!sel.length){showToast('请至少选择一项');return;}
  const data={app:'xingji',schemaVersion:SCHEMA_VERSION,appVersion:APP_VERSION,exportedAt:new Date().toISOString(),stores:{}};
  for(const s of sel)data.stores[s]=await _readStoreData(s);
  const blob=new Blob([JSON.stringify(data)],{type:'application/json'});
  const name=`星迹_自定义数据_${new Date().toISOString().slice(0,10)}.json`;
  // v3.5.1 去掉秒关closeModal；v3.5.3 返回 {blob,name} 由 confirmDownload 统一下载/分享
  confirmDownload(name,async()=>{showToast(`已导出 ${sel.length} 类数据`);return {blob,name};});
}
function showImportMenu(){
  showModal('选择性导入',
    '<div class="modal-item" onclick="closeModal();pickImportFile(\'merge\')">合并导入（保留现有，仅追加缺失）</div>'
    +'<div class="modal-item" onclick="closeModal();showImportOverwrite()">覆盖导入（替换所选类别）</div>'
    +'<div class="modal-item" onclick="closeModal();pickImportFile(\'full\')">完整导入（覆盖全部数据）</div>'
    +'<div class="modal-item" onclick="showImportText(\'merge\')">从备份文本恢复（QQ 兜底）</div>',
    '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button></div>');
}
let importMode='merge',importSel=new Set(STORES);
function showImportText(mode='merge'){
  importMode=mode;
  showModal('粘贴备份文本',
    '<div style="font-size:12px;color:var(--sub);line-height:1.7;margin-bottom:7px">把之前复制保存的「星迹数据备份」完整粘贴到下面。导入前不会自动清除现有数据。</div>'
    +'<textarea id="paste-backup-text" placeholder="在这里粘贴完整 JSON 备份文本" style="width:100%;height:210px;border:1px solid var(--input);border-radius:10px;padding:10px;font-size:10px;line-height:1.5;box-sizing:border-box;resize:none"></textarea>',
    '<div class="modal-btn-row"><button class="modal-btn" onclick="closeModal()">取消</button><button class="modal-btn primary" onclick="importBackupText()">恢复备份</button></div>');
}
async function importBackupText(){
  const el=document.getElementById('paste-backup-text'),txt=el&&el.value?el.value.trim():'';
  if(!txt){showToast('请先粘贴备份文本');return;}
  try{
    const data=JSON.parse(txt),stores=_backupStores(data);
    if(!stores)throw new Error('invalid');   // v3.9.5：白名单校验，非星迹备份/形状不对直接拒绝
    const sel=importMode==='overwrite'?[...importSel]:(importMode==='full'?STORES:Object.keys(stores));
    const dirty=sel.filter(s=>_storeHasPayload(stores[s]));
    if(!dirty.length){showToast('备份里没有可恢复的数据');return;}
    const doWrite=async()=>{
      showToast('正在恢复 '+dirty.length+' 类数据…');
      for(const s of dirty)await _writeStoreData(s,stores[s],importMode);
      if(dirty.includes('settings'))await loadSettings();
      closeModal();showToast('恢复完成，正在刷新…');setTimeout(()=>location.reload(),700);
    };
    if(importMode==='overwrite'||importMode==='full'){
      appConfirm('覆盖导入','将用备份覆盖现有数据（<b>'+dirty.length+'</b> 个类别），此操作不可撤销。建议先导出当前备份。是否继续？',doWrite);
    }else{
      doWrite();
    }
  }catch(e){showToast('备份文本无效或没有完整粘贴，请重新复制');}
}
function showImportOverwrite(){
  importSel=new Set(STORES);
  showModal('覆盖导入 · 选择类别',
    STORES.map(s=>`<label class="modal-item" style="display:flex;align-items:center;gap:10px;cursor:pointer">
      <input type="checkbox" class="card-select" checked onchange="toggleImportSel('${s}',this.checked)">
      <span style="flex:1;text-align:left">${STORE_LABELS[s]||s}</span></label>`).join('')
    +'<button class="btn-pill primary" style="width:100%;margin-top:6px" onclick="pickImportFile(\'overwrite\')">导入到所选类别</button>');
}
function toggleImportSel(s,on){if(on)importSel.add(s);else importSel.delete(s);}
function pickImportFile(mode){
  importMode=mode;
  const input=document.createElement('input');input.type='file';input.accept='.json,application/json';
  input.onchange=async e=>{
    const file=e.target.files[0];if(!file)return;
    try{
      const data=JSON.parse(await file.text());
      const stores=_backupStores(data);   // v3.9.5：白名单校验，避免第三方 JSON 洗库
      if(!stores){showToast('不是有效的星迹备份文件');return;}
      const sel=importMode==='overwrite'?[...importSel]:(importMode==='full'?STORES:Object.keys(stores));
      const dirty=sel.filter(s=>_storeHasPayload(stores[s]));
      if(!dirty.length){showToast('文件中没有所选类别的数据');return;}
      const doWrite=async()=>{
        showToast(`正在导入 ${dirty.length} 类…`);
        for(const s of dirty){
          await _writeStoreData(s,stores[s],importMode);
        }
        if(dirty.includes('settings')){await loadSettings();}
        showToast('导入完成');
        setTimeout(()=>location.reload(),600);
      };
      if(importMode==='overwrite'||importMode==='full'){
        appConfirm('覆盖导入','将用备份覆盖现有数据（<b>'+dirty.length+'</b> 个类别），此操作不可撤销。建议先导出当前备份。是否继续？',doWrite);
      }else{
        doWrite();
      }
    }catch(err){showToast('文件解析失败，请检查是否为导出的 JSON');}
  };
  input.click();
}
/* v3.9.5：恢复出厂 / 清空全部数据统一走这里。
   此前两处都遍历 STORES 硬编码列表 → events / books 清不掉；只 removeItem('xingji-room')
   → xingji-book-settings / xjLastVer / xingji-ver 等键残留；且都没有打「已清空」标记，
   于是 app.js 的 ensureTaDiary 会立刻重新生成 1~2 条 TA 加密日记（交接文档记过的老 bug）。 */
async function _wipeAllLocalData(){
  for(const s of dbStoreNames()){
    const all=await dbGetAll(s);
    for(const item of all)await dbDelete(s,dbPrimaryKey(s,item));
    dbMemoInvalidate(s);
  }
  if(state.stats)state.stats.pokeGroups={};          // 内存态一并归零（settings 行已被清掉，无需再 saveKey）
  try{Object.keys(localStorage).filter(k=>/^xingji-|^xj/.test(k)).forEach(k=>localStorage.removeItem(k));}catch(e){}
  try{sessionStorage.setItem('xingji-cleared','1');}catch(e){}
}
async function factoryReset(){
  appConfirm('恢复出厂设置','将清空全部数据并恢复默认设置，且会清除所有自定义配置。<b>此操作不可恢复！</b>建议先导出备份。',async()=>{
    await _wipeAllLocalData();
    location.reload();
  });
}
function nukeDB(){
  appConfirm('清空全部数据','确定要清空所有数据吗？<b>此操作不可恢复！</b>建议先导出备份。',async()=>{
    await _wipeAllLocalData();
    showToast('所有数据已清空，正在重启…');
    setTimeout(()=>location.reload(),700);
  });
}
