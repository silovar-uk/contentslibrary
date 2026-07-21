const IMPORT_CONTROL_API = '/api/admin';
const IMPORT_OPERATION_LIMIT = 100;
const IMPORT_STAGE_REQUEST_SIZE = 25;
const IMPORT_COMMIT_REQUEST_SIZE = 20;
const IMPORT_COMMIT_REQUESTS_PER_RUN = Math.ceil(IMPORT_OPERATION_LIMIT / IMPORT_COMMIT_REQUEST_SIZE);
const IMPORT_RENDER_YIELD_MS = 120;

let chunkOperationBusy = false;
let pauseRequested = false;
let activeChunkMode = null;
let cachedFileKey = '';
let cachedImportFile = null;
let capturedDisabledStates = new Map();

function importControlMessage(message, type = ''){
  const node = document.querySelector('#importCenterMessage');
  if(!node) return;
  node.textContent = message;
  node.dataset.type = type;
}

async function importControlApi(path, options = {}){
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

function importFileKey(file){
  return file ? [file.name,file.size,file.lastModified].join(':') : '';
}

function importNoteCount(payload){
  return payload.items.reduce((total,item)=>total + (Array.isArray(item.notes) ? item.notes.length : 0),0);
}

async function importFileHash(file){
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest)).map((byte)=>byte.toString(16).padStart(2,'0')).join('');
}

function validateChunkPayload(payload){
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

async function loadChunkImportFile(){
  const file = document.querySelector('#importFileInput')?.files?.[0];
  if(!file) throw new Error('取込JSONを選択してください。');
  if(file.size > 20*1024*1024) throw new Error('ファイルは20MB以内にしてください。');
  const key = importFileKey(file);
  if(cachedImportFile && cachedFileKey === key) return cachedImportFile;
  const [text,hash] = await Promise.all([file.text(),importFileHash(file)]);
  const payload = validateChunkPayload(JSON.parse(text));
  cachedFileKey = key;
  cachedImportFile = {file,payload,hash};
  return cachedImportFile;
}

function yieldImportControl(ms = IMPORT_RENDER_YIELD_MS){
  return new Promise((resolve)=>requestAnimationFrame(()=>setTimeout(resolve,ms)));
}

function setImportControlsBusy(mode){
  chunkOperationBusy = true;
  pauseRequested = false;
  activeChunkMode = mode;
  capturedDisabledStates = new Map();
  document.querySelectorAll('#importCenterCard button,#importCenterCard input').forEach((control)=>{
    if(['refreshImportCenter','pauseImportChunk'].includes(control.id)) return;
    capturedDisabledStates.set(control,control.disabled);
    control.disabled = true;
  });
  const pause = document.querySelector('#pauseImportChunk');
  if(pause){
    pause.hidden = false;
    pause.disabled = false;
    pause.textContent = mode === 'stage' ? '現在の25件後に一時停止' : '現在の20件後に一時停止';
  }
  const card = document.querySelector('#importCenterCard');
  if(card) card.dataset.chunkBusy = 'true';
}

function releaseImportControls(){
  for(const [control,wasDisabled] of capturedDisabledStates){
    if(control.isConnected) control.disabled = wasDisabled;
  }
  capturedDisabledStates.clear();
  const pause = document.querySelector('#pauseImportChunk');
  if(pause){pause.hidden=true;pause.disabled=false;}
  const stage = document.querySelector('#stageImportFile');
  if(stage) stage.disabled = !document.querySelector('#importFileInput')?.files?.length;
  const card = document.querySelector('#importCenterCard');
  if(card) delete card.dataset.chunkBusy;
  chunkOperationBusy = false;
  pauseRequested = false;
  activeChunkMode = null;
  decorateChunkedImportCenter();
}

function setStepState(activeKey, completedKeys = []){
  document.querySelectorAll('#importStepper .import-step').forEach((step)=>{
    const key = step.dataset.step;
    const state = completedKeys.includes(key) ? 'done' : key === activeKey ? 'active' : 'waiting';
    step.dataset.state = state;
    const mark = step.querySelector('.import-step-mark');
    if(mark && state === 'done') mark.textContent = '✓';
  });
}

function showChunkCheckpoint({mode,processed,total,paused=false}){
  const remaining = Math.max(0,total-processed);
  const percent = total ? processed/total*100 : 0;
  setStepState(mode === 'stage' ? 'stage' : 'commit',mode === 'stage' ? ['file'] : ['file','stage','validate']);
  const panel = document.querySelector('#importLiveProgress');
  if(panel){
    panel.dataset.state = 'ready';
    panel.dataset.indeterminate = 'false';
  }
  const values = {
    '#importLiveKicker': mode === 'stage' ? 'STEP 2 / 4' : 'STEP 4 / 4',
    '#importLiveTitle': paused ? '一時停止しました' : `${Math.min(IMPORT_OPERATION_LIMIT,processed)}件単位の処理が完了しました`,
    '#importLiveDescription': mode === 'stage'
      ? '送信済みの作品はステージングへ保存されています。画面を閉じても、同じJSONを選べば続きから再開できます。'
      : '反映済みの作品は本番へ保存されています。画面を閉じても、取込履歴から続きの100件を反映できます。',
    '#importProgressPercent': `${Math.round(percent)}%`,
    '#importProgressProcessed': `${processed.toLocaleString()}件`,
    '#importProgressRemaining': `${remaining.toLocaleString()}件`,
    '#importNextGuide': mode === 'stage' ? '次：同じボタンで次の100件をステージング' : '次：「次の100件を反映」を押す'
  };
  for(const [selector,value] of Object.entries(values)){
    const node = document.querySelector(selector);
    if(node) node.textContent = value;
  }
  const fill = document.querySelector('#importProgressFill');
  if(fill) fill.style.width = `${Math.max(0,Math.min(100,percent))}%`;
  const track = document.querySelector('#importProgressTrack');
  if(track) track.setAttribute('aria-valuenow',String(Math.round(percent)));
  const badge = document.querySelector('#importSafetyBadge');
  if(badge){
    badge.textContent = mode === 'stage' ? '本番未変更' : '途中まで反映済み';
    badge.dataset.level = mode === 'stage' ? 'safe' : 'warning';
  }
}

function requestImportRefresh(){
  document.querySelector('#refreshImportCenter')?.click();
  setTimeout(decorateChunkedImportCenter,300);
}

async function stageImportChunk(){
  if(chunkOperationBusy) return;
  let processed = 0;
  let total = 0;
  setImportControlsBusy('stage');
  importControlMessage('取込バッチと再開位置を確認しています…','working');
  try{
    const {file,payload,hash} = await loadChunkImportFile();
    total = payload.items.length;
    const created = await importControlApi(`${IMPORT_CONTROL_API}/import-batches`,{method:'POST',body:JSON.stringify({
      name:payload.batch || file.name.replace(/\.json$/i,''),
      source_filename:file.name,
      content_hash:hash,
      expected_works:total,
      expected_notes:importNoteCount(payload)
    })});
    const batch = created.batch;
    if(['validated','committing','committed'].includes(batch.status)){
      throw new Error(batch.status === 'committed' ? 'このJSONはすでに本番反映済みです。' : 'このJSONはステージング済みです。取込履歴から次の操作へ進んでください。');
    }
    processed = Math.min(Number(batch.staged_works || 0),total);
    const stopAt = Math.min(total,processed + IMPORT_OPERATION_LIMIT);
    while(processed < stopAt && !pauseRequested){
      const chunk = payload.items.slice(processed,Math.min(processed + IMPORT_STAGE_REQUEST_SIZE,stopAt));
      const nextProcessed = processed + chunk.length;
      importControlMessage(`ステージング中… ${nextProcessed} / ${total}作品`,'working');
      const result = await importControlApi(`${IMPORT_CONTROL_API}/import-batches/${encodeURIComponent(batch.id)}/items`,{method:'POST',body:JSON.stringify({items:chunk})});
      processed = Number(result.batch?.staged_works ?? nextProcessed);
      await yieldImportControl();
    }
    if(processed >= total){
      importControlMessage('重複と件数を検証しています…','working');
      const detail = await importControlApi(`${IMPORT_CONTROL_API}/import-batches/${encodeURIComponent(batch.id)}/validate`,{method:'POST',body:'{}'});
      const conflict = Number(detail.batch?.conflict_count || 0);
      importControlMessage(conflict === 0 ? 'ステージングと検証が完了しました。本番データはまだ変更されていません。' : '検証が完了しました。競合を確認してください。',conflict === 0 ? 'success' : 'warning');
    }else{
      const paused = pauseRequested;
      importControlMessage(`${paused?'一時停止':'100件分完了'}：${processed} / ${total}作品をステージング済み。画面を閉じても送信済み分は保存されています。`,'success');
      setTimeout(()=>showChunkCheckpoint({mode:'stage',processed,total,paused}),0);
    }
    requestImportRefresh();
  }catch(error){
    importControlMessage(`${error.message} 送信済みの${processed.toLocaleString()}件は保存されています。`,'error');
    requestImportRefresh();
  }finally{
    releaseImportControls();
  }
}

function batchStatusForButton(button){
  return button.closest('.import-batch-row')?.dataset.status || (button.textContent?.includes('次の') ? 'committing' : 'validated');
}

async function commitImportChunk(button){
  if(chunkOperationBusy) return;
  const batchId = button.dataset.batchId;
  if(!batchId) return;
  const status = batchStatusForButton(button);
  if(status === 'validated'){
    if(prompt('本番へ最初の100件を反映します。確認のため「反映」と入力してください。') !== '反映') return;
  }else if(!confirm('続きの最大100作品を本番へ反映します。続けますか？')) return;
  let remaining = 0;
  let total = 0;
  let processed = 0;
  let done = false;
  setImportControlsBusy('commit');
  importControlMessage('本番への分割反映を開始しています…','working');
  try{
    for(let requestCount=0;requestCount<IMPORT_COMMIT_REQUESTS_PER_RUN && !done && !pauseRequested;requestCount+=1){
      const result = await importControlApi(`${IMPORT_CONTROL_API}/import-batches/${encodeURIComponent(batchId)}/commit`,{method:'POST',body:'{}'});
      done = Boolean(result.done);
      remaining = Number(result.remaining || 0);
      total = Number(result.batch?.expected_works || (Number(result.batch?.applied_works || 0) + remaining));
      processed = Number(result.batch?.applied_works ?? Math.max(0,total-remaining));
      importControlMessage(done ? `反映完了：${processed}作品・${Number(result.batch?.applied_notes || 0)}メモ` : `反映中… 残り${remaining}作品`,'working');
      await yieldImportControl();
    }
    if(done){
      importControlMessage('本番への反映が完了しました。取込センターは自動的に閉じました。','success');
    }else{
      const paused = pauseRequested;
      importControlMessage(`${paused?'一時停止':'100件分完了'}：${processed.toLocaleString()}作品を反映済み。残り${remaining.toLocaleString()}作品。画面を閉じても反映済み分は保存されています。`,'success');
      setTimeout(()=>showChunkCheckpoint({mode:'commit',processed,total:Math.max(total,processed+remaining),paused}),0);
    }
    requestImportRefresh();
  }catch(error){
    importControlMessage(`${error.message} すでに反映された作品は保存されています。取込履歴から続行できます。`,'error');
    requestImportRefresh();
  }finally{
    releaseImportControls();
  }
}

function requestChunkPause(){
  if(!chunkOperationBusy) return;
  pauseRequested = true;
  const unit = activeChunkMode === 'stage' ? '25件' : '20件';
  importControlMessage(`一時停止を予約しました。現在処理中の${unit}が終わり次第停止します。`,'working');
  const button = document.querySelector('#pauseImportChunk');
  if(button){button.disabled=true;button.textContent='停止予約済み';}
}

function decorateChunkedImportCenter(){
  const card = document.querySelector('#importCenterCard');
  if(!card) return false;
  const actions = card.querySelector('.import-actions');
  if(actions && !card.querySelector('#pauseImportChunk')){
    actions.insertAdjacentHTML('beforeend','<button class="ghost-button" type="button" id="pauseImportChunk" hidden>一時停止</button>');
  }
  if(actions && !card.querySelector('#importChunkNotice')){
    actions.insertAdjacentHTML('afterend','<p class="muted" id="importChunkNotice">大量データは100件ごとに自動停止します。画面を閉じても、送信済み・反映済みの位置から再開できます。</p>');
  }
  const stage = card.querySelector('#stageImportFile');
  if(stage && !chunkOperationBusy) stage.textContent = '100件ずつステージングへ送る';
  card.querySelectorAll('[data-import-action="commit"]').forEach((button)=>{
    const status = button.closest('.import-batch-row')?.dataset.status;
    button.textContent = status === 'committing' ? '次の100件を反映' : '最初の100件を反映';
  });
  card.querySelectorAll('.import-batch-row[data-status="uploading"] .import-batch-guide').forEach((guide)=>guide.textContent='次：同じJSONを選び、次の100件をステージング');
  card.querySelectorAll('.import-batch-row[data-status="committing"] .import-batch-guide').forEach((guide)=>guide.textContent='次：次の100件を本番へ反映');
  return true;
}

function captureChunkedImportClick(event){
  const button = event.target.closest('button');
  if(!button) return;
  if(button.id === 'pauseImportChunk'){
    event.preventDefault();
    event.stopImmediatePropagation();
    requestChunkPause();
    return;
  }
  if(button.id === 'stageImportFile'){
    event.preventDefault();
    event.stopImmediatePropagation();
    void stageImportChunk();
    return;
  }
  if(button.dataset.importAction === 'commit'){
    event.preventDefault();
    event.stopImmediatePropagation();
    void commitImportChunk(button);
  }
}

function startChunkedImportControl(){
  if(!decorateChunkedImportCenter()){
    setTimeout(startChunkedImportControl,250);
    return;
  }
  document.addEventListener('click',captureChunkedImportClick,true);
  const card = document.querySelector('#importCenterCard');
  if(card) new MutationObserver(()=>queueMicrotask(decorateChunkedImportCenter)).observe(card,{subtree:true,childList:true,attributes:true,attributeFilter:['data-status','hidden','disabled']});
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(startChunkedImportControl,180),{once:true});
else setTimeout(startChunkedImportControl,180);
