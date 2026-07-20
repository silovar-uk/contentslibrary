const IMPORT_API = '/api/admin';
const IMPORT_CHUNK_SIZE = 25;
let importPayload = null;
let importFile = null;
let selectedBatchId = null;
let importBusy = false;

const importEsc = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const importDate = (value) => value ? new Intl.DateTimeFormat('ja-JP',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value)) : '';

async function importApi(path, options = {}){
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

async function sha256File(file){
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest)).map((byte)=>byte.toString(16).padStart(2,'0')).join('');
}

function noteCount(payload){
  return (payload.items || []).reduce((total,item)=>total + (Array.isArray(item.notes) ? item.notes.length : 0),0);
}

function validateImportPayload(payload){
  if(!payload || typeof payload !== 'object' || !Array.isArray(payload.items)) throw new Error('items配列を持つJSONファイルを選んでください。');
  if(payload.items.length === 0) throw new Error('作品が1件もありません。');
  if(payload.items.length > 5000) throw new Error('1回の取込は5,000作品までです。');
  payload.items.forEach((item,index)=>{
    if(!item || typeof item !== 'object') throw new Error(`${index+1}件目の形式が正しくありません。`);
    for(const key of ['source_key','title','type','status']){
      if(typeof item[key] !== 'string' || !item[key].trim()) throw new Error(`${index+1}件目の${key}がありません。`);
    }
    item.ordinal = Number.isInteger(item.ordinal) ? item.ordinal : index;
    item.notes = Array.isArray(item.notes) ? item.notes : [];
  });
  return payload;
}

function statusLabel(status){
  return ({draft:'準備中',uploading:'アップロード中',review:'要確認',validated:'検証済み',committing:'反映中',committed:'反映済み',failed:'失敗',rolled_back:'取消済み'})[status] || status;
}

function renderImportCardShell(){
  const grid = document.querySelector('#settingsView .settings-grid');
  if(!grid || document.querySelector('#importCenterCard')) return false;
  grid.insertAdjacentHTML('afterbegin',`
    <article class="settings-card import-center-card" id="importCenterCard">
      <div class="import-center-heading">
        <div><h2>データ取込センター</h2><p>owner専用。ファイルは一度ステージングし、件数と重複を確認してから本番へ反映します。</p></div>
        <span class="import-lock-state" id="importLockState">確認中</span>
      </div>
      <div id="importCenterMessage" class="import-center-message" aria-live="polite"></div>
      <div id="importLockedPanel" class="import-locked-panel">
        <p>誤操作を防ぐため、取込操作は60分間だけ有効になります。</p>
        <button class="primary-button" type="button" id="enableImportCenter">60分間だけ有効にする</button>
      </div>
      <div id="importEnabledPanel" hidden>
        <div class="import-toolbar"><span id="importEnabledUntil"></span><button class="ghost-button" type="button" id="disableImportCenter">今すぐ閉じる</button></div>
        <label class="import-file-field">取込JSON
          <input id="importFileInput" type="file" accept="application/json,.json">
          <small>作品名・状態・source_keyを持つJSON。選択しただけでは本番へ反映されません。</small>
        </label>
        <div id="importFilePreview" class="import-file-preview" hidden></div>
        <div class="import-actions"><button class="primary-button" type="button" id="stageImportFile" disabled>ステージングへ送る</button></div>
      </div>
      <div class="import-batches-heading"><h3>取込履歴</h3><button class="text-button" type="button" id="refreshImportCenter">更新</button></div>
      <div id="importBatchList" class="import-batch-list"><p class="muted">読み込み中…</p></div>
      <div id="importBatchDetail" class="import-batch-detail" hidden></div>
    </article>`);
  return true;
}

function setImportMessage(message,type=''){
  const output = document.querySelector('#importCenterMessage');
  if(!output) return;
  output.textContent = message || '';
  output.dataset.type = type;
}

function setImportBusy(busy,message=''){
  importBusy = busy;
  document.querySelectorAll('#importCenterCard button,#importCenterCard input').forEach((control)=>{
    if(control.id === 'refreshImportCenter' && busy) control.disabled = true;
    else if(busy) control.disabled = true;
  });
  if(message) setImportMessage(message,'working');
}

function releaseImportBusy(){
  importBusy = false;
  document.querySelectorAll('#importCenterCard button,#importCenterCard input').forEach((control)=>control.disabled=false);
  const stage = document.querySelector('#stageImportFile');
  if(stage) stage.disabled = !importPayload;
}

function batchButtons(batch){
  const buttons = [`<button class="ghost-button" type="button" data-import-action="detail" data-batch-id="${importEsc(batch.id)}">内容</button>`];
  if(['draft','uploading','review'].includes(batch.status)) buttons.push(`<button class="ghost-button" type="button" data-import-action="validate" data-batch-id="${importEsc(batch.id)}">再検証</button>`);
  if(['validated','committing'].includes(batch.status)) buttons.push(`<button class="primary-button" type="button" data-import-action="commit" data-batch-id="${importEsc(batch.id)}">${batch.status==='committing'?'反映を続ける':'本番へ反映'}</button>`);
  if(['committing','committed','failed'].includes(batch.status)) buttons.push(`<button class="ghost-button" type="button" data-import-action="rollback" data-batch-id="${importEsc(batch.id)}">取込を取り消す</button>`);
  if(!['committing','committed'].includes(batch.status)) buttons.push(`<button class="text-button danger-text" type="button" data-import-action="delete" data-batch-id="${importEsc(batch.id)}">履歴を削除</button>`);
  return buttons.join('');
}

function renderBatchList(batches){
  const list = document.querySelector('#importBatchList');
  if(!list) return;
  if(!batches.length){list.innerHTML='<p class="muted">取込履歴はまだありません。</p>';return;}
  list.innerHTML=batches.map((batch)=>`
    <article class="import-batch-row" data-status="${importEsc(batch.status)}">
      <div class="import-batch-main">
        <span class="import-status">${importEsc(statusLabel(batch.status))}</span>
        <strong>${importEsc(batch.name)}</strong>
        <small>${importEsc(batch.source_filename||'ファイル名なし')}・${importDate(batch.updated_at)}</small>
      </div>
      <dl class="import-counts">
        <div><dt>作品</dt><dd>${batch.staged_works}/${batch.expected_works}</dd></div>
        <div><dt>追加</dt><dd>${batch.insert_count}</dd></div>
        <div><dt>統合</dt><dd>${batch.merge_count}</dd></div>
        <div><dt>競合</dt><dd>${batch.conflict_count}</dd></div>
      </dl>
      <div class="import-row-actions">${batchButtons(batch)}</div>
    </article>`).join('');
}

async function refreshImportCenter(){
  try{
    const data = await importApi(`${IMPORT_API}/import-center`);
    const lock = document.querySelector('#importLockState');
    const locked = document.querySelector('#importLockedPanel');
    const enabled = document.querySelector('#importEnabledPanel');
    if(lock) lock.textContent = data.enabled ? '有効' : '停止中';
    if(lock) lock.dataset.enabled = String(Boolean(data.enabled));
    if(locked) locked.hidden = data.enabled;
    if(enabled) enabled.hidden = !data.enabled;
    const until = document.querySelector('#importEnabledUntil');
    if(until) until.textContent = data.enabled_until ? `有効期限 ${importDate(data.enabled_until)}` : '';
    renderBatchList(data.batches || []);
  }catch(error){setImportMessage(error.message,'error');}
}

async function handleImportFile(file){
  importPayload=null;importFile=null;
  const preview=document.querySelector('#importFilePreview');
  const stage=document.querySelector('#stageImportFile');
  if(!file){if(preview)preview.hidden=true;if(stage)stage.disabled=true;return;}
  if(file.size > 20*1024*1024) throw new Error('ファイルは20MB以内にしてください。');
  const text=await file.text();
  const payload=validateImportPayload(JSON.parse(text));
  const hash=await sha256File(file);
  importPayload={...payload,__hash:hash};importFile=file;
  if(preview){
    preview.hidden=false;
    preview.innerHTML=`<strong>${importEsc(file.name)}</strong><dl><div><dt>作品</dt><dd>${payload.items.length}件</dd></div><div><dt>メモ</dt><dd>${noteCount(payload)}件</dd></div><div><dt>SHA-256</dt><dd><code>${hash.slice(0,16)}…</code></dd></div></dl><p>この段階では本番データは変わりません。</p>`;
  }
  if(stage)stage.disabled=false;
}

async function stageImportFile(){
  if(!importPayload||!importFile||importBusy)return;
  setImportBusy(true,'取込バッチを作成しています…');
  try{
    const created=await importApi(`${IMPORT_API}/import-batches`,{method:'POST',body:JSON.stringify({
      name:importPayload.batch||importFile.name.replace(/\.json$/i,''),
      source_filename:importFile.name,
      content_hash:importPayload.__hash,
      expected_works:importPayload.items.length,
      expected_notes:noteCount(importPayload)
    })});
    const batchId=created.batch.id;
    for(let offset=0;offset<importPayload.items.length;offset+=IMPORT_CHUNK_SIZE){
      const chunk=importPayload.items.slice(offset,offset+IMPORT_CHUNK_SIZE);
      setImportMessage(`ステージング中… ${Math.min(offset+chunk.length,importPayload.items.length)} / ${importPayload.items.length}作品`,'working');
      await importApi(`${IMPORT_API}/import-batches/${encodeURIComponent(batchId)}/items`,{method:'POST',body:JSON.stringify({items:chunk})});
    }
    setImportMessage('重複と件数を検証しています…','working');
    const detail=await importApi(`${IMPORT_API}/import-batches/${encodeURIComponent(batchId)}/validate`,{method:'POST',body:'{}'});
    selectedBatchId=batchId;
    renderBatchDetail(detail);
    setImportMessage(detail.batch.conflict_count===0?'ステージングと検証が完了しました。本番データはまだ変更されていません。':'検証が完了しました。競合を確認してください。',detail.batch.conflict_count===0?'success':'warning');
    await refreshImportCenter();
  }catch(error){setImportMessage(error.message,'error');}
  finally{releaseImportBusy();}
}

function renderBatchDetail(detail){
  const area=document.querySelector('#importBatchDetail');
  if(!area)return;
  const batch=detail.batch;
  area.hidden=false;
  area.innerHTML=`
    <div class="import-detail-heading"><div><span class="import-status">${importEsc(statusLabel(batch.status))}</span><h3>${importEsc(batch.name)}</h3></div><button class="icon-button" type="button" data-import-action="close-detail" aria-label="閉じる">×</button></div>
    <dl class="import-detail-counts">
      <div><dt>取込予定</dt><dd>${batch.expected_works}作品</dd></div><div><dt>メモ</dt><dd>${batch.expected_notes}件</dd></div><div><dt>新規</dt><dd>${batch.insert_count}</dd></div><div><dt>既存へ統合</dt><dd>${batch.merge_count}</dd></div><div><dt>スキップ</dt><dd>${batch.skip_count}</dd></div><div><dt>競合</dt><dd>${batch.conflict_count}</dd></div>
    </dl>
    ${detail.conflicts?.length?`<section><h4>要確認</h4><div class="import-conflict-list">${detail.conflicts.map((item)=>`<article><strong>${importEsc(item.message)}</strong><small>${importEsc(item.kind)}</small></article>`).join('')}</div></section>`:'<p class="import-ok">競合はありません。</p>'}
    <section><h4>抜き取り表示</h4><div class="import-sample-list">${(detail.samples||[]).map((item)=>`<div><span>${importEsc(item.action)}</span><strong>${importEsc(item.title)}</strong><small>${importEsc(item.creator||'')}</small></div>`).join('')||'<p class="muted">データなし</p>'}</div></section>`;
}

async function showBatchDetail(batchId){
  setImportMessage('取込内容を読み込んでいます…','working');
  try{const detail=await importApi(`${IMPORT_API}/import-batches/${encodeURIComponent(batchId)}`);selectedBatchId=batchId;renderBatchDetail(detail);setImportMessage('');}
  catch(error){setImportMessage(error.message,'error');}
}

async function validateBatch(batchId){
  setImportBusy(true,'重複と件数を再検証しています…');
  try{const detail=await importApi(`${IMPORT_API}/import-batches/${encodeURIComponent(batchId)}/validate`,{method:'POST',body:'{}'});renderBatchDetail(detail);setImportMessage(detail.batch.conflict_count?'競合があります。元ファイルを修正して再アップロードしてください。':'検証が完了しました。','success');await refreshImportCenter();}
  catch(error){setImportMessage(error.message,'error');}
  finally{releaseImportBusy();}
}

async function commitBatch(batchId){
  if(prompt('本番へ反映します。確認のため「反映」と入力してください。')!=='反映')return;
  setImportBusy(true,'本番へ反映しています。画面を閉じずにお待ちください…');
  try{
    let done=false;
    while(!done){
      const result=await importApi(`${IMPORT_API}/import-batches/${encodeURIComponent(batchId)}/commit`,{method:'POST',body:'{}'});
      done=result.done;
      setImportMessage(done?`反映完了：${result.batch.applied_works}作品・${result.batch.applied_notes}メモ`:`反映中… 残り${result.remaining}作品`,'working');
    }
    setImportMessage('本番への反映が完了しました。取込センターは自動的に閉じました。','success');
    await Promise.all([refreshImportCenter(),showBatchDetail(batchId)]);
  }catch(error){setImportMessage(error.message,'error');}
  finally{releaseImportBusy();}
}

async function rollbackBatch(batchId){
  if(prompt('今回の取込だけを取り消します。確認のため「取消」と入力してください。')!=='取消')return;
  setImportBusy(true,'取込内容を取り消しています…');
  try{
    let done=false;
    while(!done){
      const result=await importApi(`${IMPORT_API}/import-batches/${encodeURIComponent(batchId)}/rollback`,{method:'POST',body:'{}'});
      done=result.done;
      setImportMessage(done?'取込を取り消しました。':`取消中… 残り${result.remaining}変更`,'working');
    }
    setImportMessage('今回の取込で追加した作品・メモ・分類を取り消しました。','success');
    await Promise.all([refreshImportCenter(),showBatchDetail(batchId)]);
  }catch(error){setImportMessage(error.message,'error');}
  finally{releaseImportBusy();}
}

async function deleteBatch(batchId){
  if(!confirm('このステージング履歴を削除しますか？本番作品は変更されません。'))return;
  setImportBusy(true,'履歴を削除しています…');
  try{await importApi(`${IMPORT_API}/import-batches/${encodeURIComponent(batchId)}`,{method:'DELETE'});document.querySelector('#importBatchDetail').hidden=true;setImportMessage('履歴を削除しました。','success');await refreshImportCenter();}
  catch(error){setImportMessage(error.message,'error');}
  finally{releaseImportBusy();}
}

function bindImportCenter(){
  document.querySelector('#enableImportCenter')?.addEventListener('click',async()=>{
    if(!confirm('取込操作を60分間だけ有効にします。続けますか？'))return;
    setImportBusy(true,'有効化しています…');
    try{await importApi(`${IMPORT_API}/import-center/enable`,{method:'POST',body:JSON.stringify({confirmation:'ENABLE_IMPORT'})});setImportMessage('60分間だけ有効にしました。','success');await refreshImportCenter();}
    catch(error){setImportMessage(error.message,'error');}
    finally{releaseImportBusy();}
  });
  document.querySelector('#disableImportCenter')?.addEventListener('click',async()=>{
    setImportBusy(true,'取込センターを閉じています…');
    try{await importApi(`${IMPORT_API}/import-center/disable`,{method:'POST',body:'{}'});setImportMessage('取込センターを閉じました。','success');await refreshImportCenter();}
    catch(error){setImportMessage(error.message,'error');}
    finally{releaseImportBusy();}
  });
  document.querySelector('#importFileInput')?.addEventListener('change',async(event)=>{
    try{setImportMessage('ファイルを確認しています…','working');await handleImportFile(event.target.files?.[0]);setImportMessage('ファイルの確認が完了しました。','success');}
    catch(error){importPayload=null;importFile=null;document.querySelector('#stageImportFile').disabled=true;setImportMessage(error.message,'error');}
  });
  document.querySelector('#stageImportFile')?.addEventListener('click',stageImportFile);
  document.querySelector('#refreshImportCenter')?.addEventListener('click',refreshImportCenter);
  document.querySelector('#importCenterCard')?.addEventListener('click',(event)=>{
    const button=event.target.closest('[data-import-action]');if(!button||importBusy)return;
    const action=button.dataset.importAction;const batchId=button.dataset.batchId;
    if(action==='close-detail'){document.querySelector('#importBatchDetail').hidden=true;return;}
    if(!batchId)return;
    if(action==='detail')showBatchDetail(batchId);
    if(action==='validate')validateBatch(batchId);
    if(action==='commit')commitBatch(batchId);
    if(action==='rollback')rollbackBatch(batchId);
    if(action==='delete')deleteBatch(batchId);
  });
}

async function startImportCenter(){
  let me;
  try{me=(await importApi('/api/me')).user;}catch{return;}
  if(me?.role!=='owner')return;
  if(!renderImportCardShell())return;
  bindImportCenter();
  await refreshImportCenter();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(startImportCenter,0),{once:true});
else setTimeout(startImportCenter,0);
