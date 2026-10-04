/* =========================================================
   星迹 · 状态（心情）编辑
   ========================================================= */

function editStatus(who_){
  const p=who_==='me'?state.me:state.other;
  const list=['在线','忙碌中','休息中','学习中','已入睡','离开','充电中'];
  showModal('修改状态',list.map(s=>`<div class="modal-item" onclick="closeModal();saveStatus('${who_}','${s}')">${s}</div>`).join(''));
}
function saveStatus(who_,s){
  (who_==='me'?state.me:state.other).status=s;
  saveKey(who_==='me'?'me':'other');updateHome();renderProfile();showToast('状态已更新');
}
