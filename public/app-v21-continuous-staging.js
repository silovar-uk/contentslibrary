const IMPORT_V21_API = '/api/admin';
const IMPORT_V21_CHUNK_SIZE = 25;
const IMPORT_V21_CHECKPOINT_SIZE = 100;
const IMPORT_V21_REQUEST_TIMEOUT = 30_000;
const IMPORT_V21_VALIDATE_TIMEOUT = 60_000;
const IMPORT_V21_YIELD_MS = 140;
const IMPORT_V21_CHECKPOINT_DELAY_MS = 600;

const importV21State = {
  busy: false,
  pauseRequested: false,
  startButton: null,
  startButtonHtml: '',
  startedAt: 0,
  elapsedTimer: null
};

function importV21Escape(value = ''){
  return String(value).replace(/[&<>'"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

function importV21SetText(selector,value){
  const node = document.querySelector(selector);
  if(node && node.textContent !== value) node.textContent = value;
}

function importV21Message(message,type=''){
  const node = document.querySelector('#importCenterMessage');
  if(!node) return;
  node.textContent = message;
  node.dataset.type = type;
}

function importV21Elapsed(){
  if(!importV21State.startedAt) return '—';
  const seconds = Math.max(0,Math.floor((Date.now()-importV21State.startedAt)/1000));
  return seconds < 60 ? `${seconds}秒` : `${Math.floor(seconds/60)}分${String(seconds%60).padStart(2,'0')}秒`;
}

function importV21Log(message){
  const list = document.querySelector('#importV20Log');
  if(!list || !message) return;
  const time = new Intl.DateTimeFormat('ja-JP',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date());
  const item = document.createElement('li');
  item.innerHTML = `<time>${importV21Escape(time)}</time><span>${importV21Escape(message)}</span>`;
  list.prepend(item);
  while(list.children.length > 4) list.lastElementChild?.remove();
}

function importV21Panel({
  state='working',kicker='ステージング中',title='',description='',processed=0,total=0,
  current=0,currentTotal=IMPORT_V21_CHECKPOINT_SIZE,remaining=null,indeterminate=false,log=''
} = {}){
  const panel = document.querySelector('#importV20OperationPanel');
  if(panel){
    panel.dataset.state = state;
    panel.dataset.indeterminate = String(Boolean(indeterminate));
  }
  importV21SetText('#importV20Kicker',kicker);
  importV21SetText('#importV20Title',title);
  importV21SetText('#importV20Description',description);
  importV21SetText('#importV20Processed',total > 0 ? `${processed.toLocaleString()} / ${total.toLocaleString()}` : '0 / —');
  importV21SetText('#importV20Current',`${current.toLocaleString()} / ${Math.max(0,currentTotal).toLocaleString()}`);
  importV21SetText('#importV20Remaining',remaining === null ? '—' : `${Math.max(0,remaining).toLocaleString()}件`);
  importV21SetText('#importV20Elapsed',importV21Elapsed());
  importV21SetText('#importV20Safety','本番未変更');
  const safety = document.querySelector('#importV20Safety');
  if(safety) safety.dataset.level = 'safe';
  const progress = document.querySelector('#importV20Progress');
  const fill = progress?.querySelector('span');
  const percent = total > 0 ? Math.max(0,Math.min(100,processed/total*100)) : 0;
  if(progress){
    progress.setAttribute('aria-valuenow',String(Math.round(percent)));
    progress.setAttribute('aria-valuetext',indeterminate ? '処理中' : `${Math.round(percent)}%`);
  }
  if(fill) fill.style.width = indeterminate ? '38%' : `${percent}%`;
  if(log) importV21Log(log);
}

function importV21FocusPanel(){
  const panel = document.querySelector('#importV20OperationPanel');
  panel?.scrollIntoView({behavior:'smooth',block:'nearest'});
  panel?.focus({preventScroll:true});
}

function importV21Yield(ms = IMPORT_V21_YIELD_MS){
  return new Promise((resolve)=>{
    if(typeof requestAnimationFrame === 'function') requestAnimationFrame(()=>setTimeout(resolve,ms));
    else setTimeout(resolve,ms);
  });
}

async function importV21Api(path,options = {}){
  const method = options.method || 'GET';
  const timeoutMs = options.timeoutMs || IMPORT_V21_REQUEST_TIMEOUT;
  const headers = new Headers(options.headers || {});
  if(!['GET','HEAD'].includes(method)) headers.set('X-App-Request','sakuhin-log');
  if(options.body && !headers.has('Content-Type')) headers.set('Content-Type','application/json');
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort('timeout'),timeoutMs);
  try{
    const response = await fetch(path,{...options,method,headers,signal:controller.signal});
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json().catch(()=>({})) : null;
    if(!response.ok){
      const error = new Error(data?.error?.message || `エラー ${response.status}`);
      error.code = data?.error?.code || null;
      error.safeState = data?.error?.safe_state || null;
      error.confirmedCount = data?.error?.confirmed_count ?? null;
      throw error;
    }
    return data;
  }catch(error){
    if(error?.name === 'AbortError') throw new Error(`通信が${Math.round(timeoutMs/1000)}秒以内に完了しませんでした。取込履歴を更新してから再開してください。`);
    throw error;
  }finally{
    clearTimeout(timer);
  }
}

function importV21ValidatePayload(payload){
  if(!payload || typeof payload !== 'object' || !Array.isArray(payload.items)){
    if(payload && typeof payload === 'object' && Array.isArray(payload.works)){
      throw new Error(`選択したファイルはバックアップ書き出し形式です（${payload.works.length.toLocaleString()}作品）。items配列を持つ取込用JSONを選んでください。`);
    }
    throw new Error('取込用JSONではありません。items配列を持つJSONを選んでください。');
  }
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

function importV21NoteCount(payload){
  return payload.items.reduce((sum,item)=>sum+(Array.isArray(item.notes)?item.notes.length:0),0);
}

async function importV21Hash(file){
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest)).map((byte)=>byte.toString(16).padStart(2,'0')).join('');
}

function importV21EnsureControls(){
  const legacy = document.querySelector('#stageImportFile');
  if(!legacy) return false;
  legacy.hidden = true;
  legacy.setAttribute('aria-hidden','true');
  legacy.tabIndex = -1;

  let start = document.querySelector('#stageImportFileContinuous');
  if(!start){
    start = legacy.cloneNode(true);
    start.id = 'stageImportFileContinuous';
    start.hidden = false;
    start.removeAttribute('aria-hidden');
    start.removeAttribute('data-file-state');
    start.tabIndex = 0;
    legacy.insertAdjacentElement('afterend',start);
  }
  importV21State.startButton = start;

  let pause = document.querySelector('#pauseImportContinuous');
  if(!pause){
    pause = document.createElement('button');
    pause.className = 'ghost-button';
    pause.type = 'button';
    pause.id = 'pauseImportContinuous';
    pause.textContent = '現在の25件後に一時停止';
    pause.hidden = true;
    start.insertAdjacentElement('afterend',pause);
  }

  if(!importV21State.busy){
    const hasFile = Boolean(document.querySelector('#importFileInput')?.files?.length);
    start.disabled = !hasFile;
    start.textContent = hasFile ? 'ステージングを開始／続きから再開' : '取込JSONを選択してください';
  }
  return true;
}

function importV21StartBusy(){
  const button = importV21State.startButton;
  importV21State.busy = true;
  importV21State.pauseRequested = false;
  importV21State.startedAt = Date.now();
  importV21State.startButtonHtml = button?.innerHTML || '';
  if(button){
    button.disabled = true;
    button.setAttribute('aria-busy','true');
    button.innerHTML = '<span class="import-v20-button-spinner" aria-hidden="true"></span><span>ステージング中…</span>';
  }
  const input = document.querySelector('#importFileInput');
  if(input) input.disabled = true;
  const pause = document.querySelector('#pauseImportContinuous');
  if(pause){
    pause.hidden = false;
    pause.disabled = false;
    pause.textContent = '現在の25件後に一時停止';
  }
  const card = document.querySelector('#importCenterCard');
  if(card){
    card.dataset.operationState = 'stage';
    card.setAttribute('aria-busy','true');
  }
  clearInterval(importV21State.elapsedTimer);
  importV21State.elapsedTimer = setInterval(()=>importV21SetText('#importV20Elapsed',importV21Elapsed()),1000);
}

function importV21ReleaseBusy(){
  clearInterval(importV21State.elapsedTimer);
  importV21State.elapsedTimer = null;
  const button = importV21State.startButton;
  if(button?.isConnected){
    button.innerHTML = importV21State.startButtonHtml;
    button.removeAttribute('aria-busy');
  }
  const input = document.querySelector('#importFileInput');
  if(input) input.disabled = false;
  const pause = document.querySelector('#pauseImportContinuous');
  if(pause){
    pause.hidden = true;
    pause.disabled = false;
    pause.textContent = '現在の25件後に一時停止';
  }
  const card = document.querySelector('#importCenterCard');
  if(card){
    delete card.dataset.operationState;
    card.removeAttribute('aria-busy');
  }
  importV21State.busy = false;
  importV21State.pauseRequested = false;
  importV21State.startedAt = 0;
  importV21EnsureControls();
}

function importV21Pause(){
  if(!importV21State.busy) return;
  importV21State.pauseRequested = true;
  const pause = document.querySelector('#pauseImportContinuous');
  if(pause){
    pause.disabled = true;
    pause.textContent = '停止予約済み';
  }
  importV21Message('一時停止を予約しました。現在処理中の25件が終わり次第停止します。','working');
  importV21Log('現在の25件終了後に一時停止します');
}

function importV21RefreshHistory(){
  const refresh = document.querySelector('#refreshImportCenter');
  if(refresh){
    refresh.disabled = false;
    refresh.click();
  }
}

async function importV21Stage(){
  if(importV21State.busy){
    importV21Message('ステージングを処理中です。進捗欄をご確認ください。','working');
    importV21FocusPanel();
    return;
  }
  const file = document.querySelector('#importFileInput')?.files?.[0];
  if(!file){
    importV21Message('取込JSONを選択してください。','error');
    return;
  }

  let processed = 0;
  let total = 0;
  let checkpointStart = 0;
  importV21StartBusy();
  importV21Message('取込JSONと再開位置を確認しています…','working');
  importV21Panel({state:'working',kicker:'ステージング準備',title:'ファイルと再開位置を確認しています',description:'送信済みデータがある場合は、その続きから最後まで自動で進みます。',indeterminate:true,log:'ステージング準備を開始しました'});
  importV21FocusPanel();

  try{
    if(file.size > 20*1024*1024) throw new Error('ファイルは20MB以内にしてください。');
    const [text,hash] = await Promise.all([file.text(),importV21Hash(file)]);
    let parsed;
    try{ parsed = JSON.parse(text); }catch{ throw new Error('JSONとして読み込めませんでした。'); }
    const payload = importV21ValidatePayload(parsed);
    total = payload.items.length;
    const notes = importV21NoteCount(payload);

    const created = await importV21Api(`${IMPORT_V21_API}/import-batches`,{
      method:'POST',
      body:JSON.stringify({
        name:payload.batch || file.name.replace(/\.json$/i,''),
        source_filename:file.name,
        content_hash:hash,
        expected_works:total,
        expected_notes:notes
      })
    });
    const batch = created.batch;
    if(['validated','committing','committed'].includes(batch.status)){
      throw new Error(batch.status === 'committed' ? 'このJSONはすでに本番反映済みです。' : 'ステージングは完了済みです。取込履歴から次の操作へ進んでください。');
    }
    if(['failed','rolled_back'].includes(batch.status)) throw new Error('同じJSONの過去バッチが残っています。先に送信状態をリセットしてください。');

    processed = Math.min(Number(batch.staged_works || 0),total);
    checkpointStart = processed;
    importV21Log(processed > 0 ? `${processed.toLocaleString()}作品目から再開します` : '先頭から送信します');

    while(processed < total && !importV21State.pauseRequested){
      const chunk = payload.items.slice(processed,Math.min(processed+IMPORT_V21_CHUNK_SIZE,total));
      const next = processed + chunk.length;
      const checkpointTarget = Math.min(IMPORT_V21_CHECKPOINT_SIZE,total-checkpointStart);
      importV21Message(`ステージング中… ${next} / ${total}作品`,'working');
      importV21Panel({
        state:'working',kicker:'ステージング中',title:`${next.toLocaleString()} / ${total.toLocaleString()}作品を送信中`,
        description:'25件単位で保存しています。100件ごとに画面を更新し、そのまま自動で続行します。',
        processed,total,current:processed-checkpointStart,currentTotal:checkpointTarget,remaining:total-processed,
        log:`${next.toLocaleString()}作品まで送信中`
      });
      const result = await importV21Api(`${IMPORT_V21_API}/import-batches/${encodeURIComponent(batch.id)}/items`,{
        method:'POST',body:JSON.stringify({items:chunk})
      });
      processed = Number(result.batch?.staged_works ?? next);
      importV21Panel({
        state:'working',kicker:'ステージング中',title:`${processed.toLocaleString()} / ${total.toLocaleString()}作品を保存済み`,
        description:'保存済み位置から再開できます。次の25件へ進みます。',processed,total,
        current:processed-checkpointStart,currentTotal:checkpointTarget,remaining:total-processed,
        log:`${processed.toLocaleString()}作品をステージング済み`
      });
      await importV21Yield();

      if(processed < total && processed-checkpointStart >= IMPORT_V21_CHECKPOINT_SIZE && !importV21State.pauseRequested){
        importV21Message(`100件を保存しました。${processed.toLocaleString()} / ${total.toLocaleString()}作品。自動で続行します。`,'working');
        importV21Panel({
          state:'working',kicker:'100件チェックポイント',title:`${processed.toLocaleString()} / ${total.toLocaleString()}作品を保存済み`,
          description:'画面の描画と通信負荷を整えてから、自動で次の100件へ進みます。',processed,total,
          current:IMPORT_V21_CHECKPOINT_SIZE,currentTotal:IMPORT_V21_CHECKPOINT_SIZE,remaining:total-processed,
          log:'100件チェックポイントを通過しました'
        });
        await importV21Yield(IMPORT_V21_CHECKPOINT_DELAY_MS);
        checkpointStart = processed;
      }
    }

    if(importV21State.pauseRequested && processed < total){
      importV21Message(`一時停止しました。${processed.toLocaleString()} / ${total.toLocaleString()}作品を保存済みです。`,'success');
      importV21Panel({
        state:'paused',kicker:'一時停止',title:`${processed.toLocaleString()} / ${total.toLocaleString()}作品を保存済み`,
        description:'同じJSONを選んだまま「ステージングを開始／続きから再開」を押すと続行します。',processed,total,
        current:processed-checkpointStart,currentTotal:Math.min(IMPORT_V21_CHECKPOINT_SIZE,total-checkpointStart),remaining:total-processed,
        log:'ステージングを一時停止しました'
      });
      importV21RefreshHistory();
      return;
    }

    importV21Message('全作品を保存しました。重複と件数を検証しています…','working');
    importV21Panel({
      state:'working',kicker:'検証中',title:'重複・件数・統合先を確認しています',
      description:'全作品のステージングが完了しました。本番データはまだ変更されていません。',
      processed,total,current:Math.max(0,processed-checkpointStart),currentTotal:Math.max(0,total-checkpointStart),remaining:0,
      indeterminate:true,log:'全作品の検証を開始しました'
    });
    const detail = await importV21Api(`${IMPORT_V21_API}/import-batches/${encodeURIComponent(batch.id)}/validate`,{
      method:'POST',body:'{}',timeoutMs:IMPORT_V21_VALIDATE_TIMEOUT
    });
    const conflicts = Number(detail.batch?.conflict_count || 0);
    importV21Message(conflicts === 0 ? 'ステージングと検証が完了しました。本番データはまだ変更されていません。' : '検証が完了しました。競合を確認してください。',conflicts === 0 ? 'success' : 'warning');
    importV21Panel({
      state:conflicts === 0 ? 'ready' : 'warning',kicker:conflicts === 0 ? '検証完了' : '要確認',
      title:conflicts === 0 ? '本番反映の準備ができました' : `${conflicts.toLocaleString()}件の競合があります`,
      description:conflicts === 0 ? '取込履歴の内容を確認し、本番反映へ進んでください。' : '競合内容を確認してください。本番データはまだ変更されていません。',
      processed,total,current:Math.max(0,processed-checkpointStart),currentTotal:Math.max(0,total-checkpointStart),remaining:0,
      log:conflicts === 0 ? 'ステージングと検証が完了しました' : '競合を検出しました'
    });
    importV21RefreshHistory();
  }catch(error){
    const locked = error?.code === 'IMPORT_CENTER_LOCKED';
    const confirmed = Number.isFinite(error?.confirmedCount) ? Number(error.confirmedCount) : processed;
    importV21Message(locked ? '取込の有効期限が切れました。再度有効にすると続きから再開できます。' : error.message,'error');
    importV21Panel({
      state:'error',kicker:locked ? '取込の有効期限切れ' : '処理停止',
      title:locked ? '取込を再度有効にしてください' : 'ステージングを完了できませんでした',
      description:`原因：${error.message} ${confirmed.toLocaleString()}件までは保存されています。同じJSONで続きから再開できます。`,
      processed:confirmed,total,remaining:total ? total-confirmed : null,
      log:locked ? '有効期限切れで停止しました' : 'ステージングが停止しました'
    });
    importV21RefreshHistory();
  }finally{
    importV21ReleaseBusy();
  }
}

function importV21HandleClick(event){
  const button = event.target.closest('button');
  if(!button) return;
  if(button.id === 'stageImportFileContinuous'){
    event.preventDefault();
    event.stopImmediatePropagation();
    void importV21Stage();
    return;
  }
  if(button.id === 'pauseImportContinuous'){
    event.preventDefault();
    event.stopImmediatePropagation();
    importV21Pause();
  }
}

function importV21HandleChange(event){
  const input = event.target;
  if(!(input instanceof HTMLInputElement) || input.id !== 'importFileInput') return;
  setTimeout(importV21EnsureControls,0);
}

function importV21Start(){
  if(!importV21EnsureControls()){
    setTimeout(importV21Start,200);
    return;
  }
  document.addEventListener('click',importV21HandleClick,true);
  document.addEventListener('change',importV21HandleChange,true);
  const card = document.querySelector('#importCenterCard');
  if(card){
    const observer = new MutationObserver(()=>{
      observer.disconnect();
      importV21EnsureControls();
      observer.observe(card,{subtree:true,childList:true});
    });
    observer.observe(card,{subtree:true,childList:true});
  }
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(importV21Start,180),{once:true});
else setTimeout(importV21Start,180);
