const IMPORT_RESET_API = '/api/admin';
const SAFE_RESET_STATUSES = new Set(['draft','uploading','review','validated','rolled_back']);
const ROLLBACK_RESET_STATUSES = new Set(['committing','committed','failed']);

let importResetBusy = false;

async function importResetApi(path, options = {}){
  const method = options.method || 'GET';
  const headers = new Headers(options.headers || {});
  if(!['GET','HEAD'].includes(method)) headers.set('X-App-Request','sakuhin-log');
  if(options.body && !headers.has('Content-Type')) headers.set('Content-Type','application/json');
  const response = await fetch(path,{...options,method,headers});
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json().catch(()=>({})) : null;
  if(!response.ok) throw new Error(data?.error?.message || `エラー ${response.status}`);
  return data;
}

function setImportResetMessage(message,type=''){
  const node = document.querySelector('#importCenterMessage');
  if(!node) return;
  node.textContent = message;
  node.dataset.type = type;
}

function importResetRowStatus(button){
  return button.closest('.import-batch-row')?.dataset.status || '';
}

function clearSelectedImportFile(){
  const input = document.querySelector('#importFileInput');
  if(input) input.value = '';
  const preview = document.querySelector('#importFilePreview');
  if(preview){preview.hidden=true;preview.innerHTML='';}
  const stage = document.querySelector('#stageImportFile');
  if(stage) stage.disabled=true;
}

function refreshAfterImportReset(){
  document.querySelector('#refreshImportCenter')?.click();
  setTimeout(decorateImportResetActions,300);
}

async function resetStagedImport(button){
  if(importResetBusy) return;
  const batchId = button.dataset.batchId;
  const status = importResetRowStatus(button);
  if(!batchId || !SAFE_RESET_STATUSES.has(status)) return;
  const confirmation = prompt('本番の作品・メモは変更せず、この取込の送信途中データと履歴だけを消します。確認のため「リセット」と入力してください。');
  if(confirmation !== 'リセット') return;
  importResetBusy=true;
  button.disabled=true;
  setImportResetMessage('送信途中のデータをリセットしています…','working');
  try{
    await importResetApi(`${IMPORT_RESET_API}/import-batches/${encodeURIComponent(batchId)}`,{method:'DELETE'});
    clearSelectedImportFile();
    const detail = document.querySelector('#importBatchDetail');
    if(detail) detail.hidden=true;
    setImportResetMessage('送信状態をリセットしました。本番の作品・メモは変更していません。新しいJSONを選び直してください。','success');
    refreshAfterImportReset();
  }catch(error){
    setImportResetMessage(error.message,'error');
  }finally{
    importResetBusy=false;
    if(button.isConnected) button.disabled=false;
  }
}

async function rollbackImportForReset(button){
  if(importResetBusy) return;
  const batchId = button.dataset.batchId;
  const status = importResetRowStatus(button);
  if(!batchId || !ROLLBACK_RESET_STATUSES.has(status)) return;
  const confirmation = prompt('今回の取込で本番へ追加した作品・メモ・分類を100変更ずつ取り消します。既存データは残ります。確認のため「取消」と入力してください。');
  if(confirmation !== '取消') return;
  importResetBusy=true;
  button.disabled=true;
  setImportResetMessage('今回の取込内容を100変更ずつ取り消しています…','working');
  try{
    const result = await importResetApi(`${IMPORT_RESET_API}/import-batches/${encodeURIComponent(batchId)}/rollback`,{method:'POST',body:'{}'});
    if(result.done){
      setImportResetMessage('今回の取込を取り消しました。続けて「送信状態をリセット」を押すと、最初からやり直せます。','success');
    }else{
      setImportResetMessage(`100変更を取り消しました。残り${Number(result.remaining||0).toLocaleString()}変更です。同じボタンでもう一度続けてください。`,'success');
    }
    refreshAfterImportReset();
  }catch(error){
    setImportResetMessage(`${error.message} 取り消し済みの変更は保存されています。`,'error');
  }finally{
    importResetBusy=false;
    if(button.isConnected) button.disabled=false;
  }
}

function setImportResetText(node,text){
  if(node && node.textContent !== text) node.textContent=text;
}

function decorateImportResetActions(){
  const card = document.querySelector('#importCenterCard');
  if(!card) return false;
  card.querySelectorAll('.import-batch-row').forEach((row)=>{
    const status = row.dataset.status || '';
    const deleteButton = row.querySelector('[data-import-action="delete"]');
    const rollbackButton = row.querySelector('[data-import-action="rollback"]');

    if(deleteButton){
      if(SAFE_RESET_STATUSES.has(status)){
        deleteButton.hidden=false;
        deleteButton.dataset.importResetAction='staging';
        delete deleteButton.dataset.importAction;
        setImportResetText(deleteButton,status === 'rolled_back' ? '送信状態をリセット' : '送信状態をリセット');
        deleteButton.title='本番データを残したまま、この送信途中のバッチだけを削除します';
      }else if(status === 'failed'){
        deleteButton.hidden=true;
        delete deleteButton.dataset.importResetAction;
      }
    }

    if(rollbackButton && ROLLBACK_RESET_STATUSES.has(status)){
      rollbackButton.dataset.importResetAction='rollback';
      delete rollbackButton.dataset.importAction;
      setImportResetText(rollbackButton,'100件ずつ取込を取り消す');
      rollbackButton.title='今回の取込で本番へ追加した変更だけを100件ずつ取り消します';
    }

    const guide = row.querySelector('.import-batch-guide');
    if(guide && SAFE_RESET_STATUSES.has(status) && status !== 'rolled_back' && /ステージング|競合|本番へ反映/.test(guide.textContent||'')){
      guide.title='最初からやり直す場合は「送信状態をリセット」を使用できます';
    }
    if(guide && status === 'rolled_back') setImportResetText(guide,'次：送信状態をリセットして最初からやり直せます');
    if(guide && status === 'failed') setImportResetText(guide,'次：取込を取り消してから送信状態をリセット');
  });
  return true;
}

function captureImportResetClick(event){
  const button = event.target.closest('[data-import-reset-action]');
  if(!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if(button.dataset.importResetAction === 'staging') void resetStagedImport(button);
  if(button.dataset.importResetAction === 'rollback') void rollbackImportForReset(button);
}

function startImportResetEnhancement(){
  if(!decorateImportResetActions()){
    setTimeout(startImportResetEnhancement,250);
    return;
  }
  document.addEventListener('click',captureImportResetClick,true);
  const card = document.querySelector('#importCenterCard');
  if(card) new MutationObserver(()=>queueMicrotask(decorateImportResetActions)).observe(card,{subtree:true,childList:true,attributes:true,attributeFilter:['data-status','hidden']});
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(startImportResetEnhancement,220),{once:true});
else setTimeout(startImportResetEnhancement,220);
