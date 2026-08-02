const IMPORT_V20_API = '/api/admin';
// ステージングはこの件数ごとにチェックポイント表示を挟むだけで、以前と違い
// 自動続行する(v21で分離実装していたが、v20側の1ループに統合した)。
// 本番反映(commit)は依然としてこの件数を1回の操作の上限として扱う。
const IMPORT_V20_CHECKPOINT_SIZE = 100;
const IMPORT_V20_STAGE_CHUNK = 25;
const IMPORT_V20_COMMIT_CHUNK = 20;
const IMPORT_V20_COMMIT_CALLS = IMPORT_V20_CHECKPOINT_SIZE / IMPORT_V20_COMMIT_CHUNK;
const IMPORT_V20_REQUEST_TIMEOUT = 30_000;
const IMPORT_V20_VALIDATE_TIMEOUT = 60_000;
const IMPORT_V20_YIELD_MS = 140;
const IMPORT_V20_CHECKPOINT_DELAY_MS = 600;

// Phase 1.5: label/tone/description stay client-side (the server contract
// doesn't carry them), but which actions are safe (reset/rollback) is read
// from allowed_actions via importV20RowActions() rather than duplicated
// here as a status-name set — see STATUS_LABELS in import-center.ts.
//
// descriptionは状態説明＋次の行動を1文にまとめている。以前はapp-v10.jsの
// renderBatchGuidance()が別枠(.import-batch-guide)で「次の行動」だけを
// 重ねて表示しており、同じ行に説明文が2つ並ぶ重複表示になっていたため統合した。
const IMPORT_V20_STATUS_COPY = {
  draft: { tone:'neutral', description:'まだ作品は送信されていません。本番データは変更されていません。次：作品をステージングへ送信してください。' },
  uploading: { tone:'working', description:'作品をステージングへ一時保存中です。本番データは変更されていません。進行中：ステージングの続きを送信してください。' },
  review: { tone:'warning', description:'件数または重複の確認が必要です。本番データは変更されていません。次：競合を解消して再検証してください。' },
  validated: { tone:'ready', description:'ステージングと検証は完了しています。本番への反映はまだです。次：内容を確認して本番へ反映してください。' },
  committing: { tone:'working', description:'一部の作品を本番へ反映済みです。続きから再開できます。進行中：本番への反映を続行してください。' },
  committed: { tone:'done', description:'今回の取込は本番へ反映済みです。完了：作品一覧で確認してください。' },
  failed: { tone:'error', description:'処理が途中で停止しました。取込を取り消してからやり直せます。失敗：内容を確認して再開または取消してください。' },
  rolled_back: { tone:'neutral', description:'今回の取込による本番変更は取り消し済みです。完了：送信状態をリセットできます。' }
};

const importV20State = {
  busy: false,
  mode: null,
  pauseRequested: false,
  activeButton: null,
  activeButtonHtml: '',
  selected: null,
  selectedKey: '',
  startedAt: 0,
  elapsedTimer: null,
  operationLog: [],
  lastLogKey: ''
};

function importV20Escape(value = ''){
  return String(value).replace(/[&<>'"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

function importV20FileKey(file){
  return file ? `${file.name}:${file.size}:${file.lastModified}` : '';
}

function importV20FormatElapsed(startedAt){
  if(!startedAt) return '—';
  const seconds = Math.max(0,Math.floor((Date.now()-startedAt)/1000));
  if(seconds < 60) return `${seconds}秒`;
  return `${Math.floor(seconds/60)}分${String(seconds%60).padStart(2,'0')}秒`;
}

function importV20EnsureUi(){
  const card = document.querySelector('#importCenterCard');
  if(!card) return false;
  const actions = card.querySelector('.import-actions');
  if(!actions) return false;

  if(!card.querySelector('#pauseImportChunk')){
    actions.insertAdjacentHTML('beforeend','<button class="ghost-button" type="button" id="pauseImportChunk" hidden>現在の処理後に一時停止</button>');
  }

  if(!card.querySelector('#importV20OperationPanel')){
    actions.insertAdjacentHTML('afterend',`
      <section class="import-v20-panel" id="importV20OperationPanel" data-state="idle" tabindex="-1" aria-live="polite">
        <div class="import-v20-panel-heading">
          <span class="import-v20-spinner" id="importV20Spinner" aria-hidden="true"></span>
          <div class="import-v20-panel-copy">
            <span class="import-v20-kicker" id="importV20Kicker">待機中</span>
            <strong id="importV20Title">取込JSONを選択してください</strong>
            <p id="importV20Description">ファイルを選択すると、取込用かバックアップ用かをここで確認します。</p>
          </div>
          <span class="import-v20-safety" id="importV20Safety" data-level="safe">本番未変更</span>
        </div>
        <div class="import-v20-progress" id="importV20Progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div>
        <dl class="import-v20-metrics">
          <div><dt>全体</dt><dd id="importV20Processed">0 / —</dd></div>
          <div><dt>今回</dt><dd id="importV20Current">0 / 100</dd></div>
          <div><dt>残り</dt><dd id="importV20Remaining">—</dd></div>
          <div><dt>経過</dt><dd id="importV20Elapsed">—</dd></div>
        </dl>
        <ol class="import-v20-log" id="importV20Log" aria-label="直近の処理状況"></ol>
      </section>`);
  }
  return true;
}

function importV20Log(message,key = message){
  if(!message || importV20State.lastLogKey === key) return;
  importV20State.lastLogKey = key;
  const time = new Intl.DateTimeFormat('ja-JP',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date());
  importV20State.operationLog.unshift({time,message});
  importV20State.operationLog = importV20State.operationLog.slice(0,4);
  const list = document.querySelector('#importV20Log');
  if(list){
    list.innerHTML = importV20State.operationLog.map((entry)=>`<li><time>${importV20Escape(entry.time)}</time><span>${importV20Escape(entry.message)}</span></li>`).join('');
  }
}

function importV20SetPanel({
  state='idle',kicker='待機中',title='',description='',processed=0,total=0,current=0,currentTotal=IMPORT_V20_CHECKPOINT_SIZE,
  remaining=null,safety='本番未変更',safetyLevel='safe',indeterminate=false,log='',logKey=''
} = {}){
  if(!importV20EnsureUi()) return;
  const panel = document.querySelector('#importV20OperationPanel');
  if(!panel) return;
  panel.dataset.state = state;
  panel.dataset.indeterminate = String(Boolean(indeterminate));
  const percent = total > 0 ? Math.max(0,Math.min(100,processed/total*100)) : 0;
  const textMap = {
    '#importV20Kicker': kicker,
    '#importV20Title': title,
    '#importV20Description': description,
    '#importV20Processed': total > 0 ? `${processed.toLocaleString()} / ${total.toLocaleString()}` : '0 / —',
    '#importV20Current': `${current.toLocaleString()} / ${currentTotal.toLocaleString()}`,
    '#importV20Remaining': remaining === null ? '—' : `${Math.max(0,remaining).toLocaleString()}件`,
    '#importV20Elapsed': importV20FormatElapsed(importV20State.startedAt)
  };
  for(const [selector,value] of Object.entries(textMap)){
    const node = document.querySelector(selector);
    if(node && node.textContent !== value) node.textContent = value;
  }
  const safetyNode = document.querySelector('#importV20Safety');
  if(safetyNode){
    safetyNode.textContent = safety;
    safetyNode.dataset.level = safetyLevel;
  }
  const progress = document.querySelector('#importV20Progress');
  const fill = progress?.querySelector('span');
  if(progress){
    progress.setAttribute('aria-valuenow',String(Math.round(percent)));
    progress.setAttribute('aria-valuetext',indeterminate ? '処理中' : `${Math.round(percent)}%`);
  }
  if(fill) fill.style.width = indeterminate ? '38%' : `${percent}%`;
  if(log) importV20Log(log,logKey || log);
}

function importV20FocusPanel(){
  const panel = document.querySelector('#importV20OperationPanel');
  panel?.scrollIntoView({behavior:'smooth',block:'nearest'});
  panel?.focus({preventScroll:true});
}

function importV20SetMessage(message,type=''){
  const node = document.querySelector('#importCenterMessage');
  if(!node) return;
  node.textContent = message;
  node.dataset.type = type;
}

function importV20StartElapsed(){
  importV20State.startedAt = Date.now();
  clearInterval(importV20State.elapsedTimer);
  importV20State.elapsedTimer = setInterval(()=>{
    const node = document.querySelector('#importV20Elapsed');
    if(node) node.textContent = importV20FormatElapsed(importV20State.startedAt);
  },1000);
}

function importV20StopElapsed(){
  clearInterval(importV20State.elapsedTimer);
  importV20State.elapsedTimer = null;
}

function importV20SetButtonBusy(button,label){
  if(!button) return;
  importV20State.activeButton = button;
  importV20State.activeButtonHtml = button.innerHTML;
  button.disabled = true;
  button.setAttribute('aria-busy','true');
  button.innerHTML = `<span class="import-v20-button-spinner" aria-hidden="true"></span><span>${importV20Escape(label)}</span>`;
}

function importV20RestoreButton(){
  const button = importV20State.activeButton;
  if(button?.isConnected){
    button.innerHTML = importV20State.activeButtonHtml;
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
  importV20State.activeButton = null;
  importV20State.activeButtonHtml = '';
}

function importV20SetBusy(mode,button,label){
  importV20State.busy = true;
  importV20State.mode = mode;
  importV20State.pauseRequested = false;
  importV20StartElapsed();
  importV20SetButtonBusy(button,label);
  document.querySelectorAll('#importCenterCard button').forEach((control)=>{
    if(control === button) return;
    if(control.id === 'refreshImportCenter' || control.id === 'pauseImportChunk' || control.dataset.importAction === 'close-detail' || control.dataset.importAction === 'detail') return;
    control.dataset.v20WasDisabled = String(Boolean(control.disabled));
    control.disabled = true;
  });
  const fileInput = document.querySelector('#importFileInput');
  if(fileInput){
    fileInput.dataset.v20WasDisabled = String(Boolean(fileInput.disabled));
    fileInput.disabled = true;
  }
  const pause = document.querySelector('#pauseImportChunk');
  if(pause){
    const canPause = ['stage','commit'].includes(mode);
    pause.hidden = !canPause;
    pause.disabled = !canPause;
    pause.textContent = mode === 'stage' ? '現在の25件後に一時停止' : '現在の20件後に一時停止';
  }
  const card = document.querySelector('#importCenterCard');
  if(card){
    card.dataset.operationState = mode;
    card.setAttribute('aria-busy','true');
  }
}

function importV20ReleaseBusy(){
  document.querySelectorAll('#importCenterCard [data-v20-was-disabled]').forEach((control)=>{
    control.disabled = control.dataset.v20WasDisabled === 'true';
    delete control.dataset.v20WasDisabled;
  });
  const fileInput = document.querySelector('#importFileInput');
  if(fileInput?.dataset.v20WasDisabled !== undefined){
    fileInput.disabled = fileInput.dataset.v20WasDisabled === 'true';
    delete fileInput.dataset.v20WasDisabled;
  }
  const pause = document.querySelector('#pauseImportChunk');
  if(pause){
    pause.hidden = true;
    pause.disabled = false;
    pause.textContent = '現在の処理後に一時停止';
  }
  const card = document.querySelector('#importCenterCard');
  if(card){
    delete card.dataset.operationState;
    card.removeAttribute('aria-busy');
  }
  importV20RestoreButton();
  importV20StopElapsed();
  importV20State.busy = false;
  importV20State.mode = null;
  importV20State.pauseRequested = false;
  importV20Decorate();
}

function importV20BusyFeedback(){
  const modeCopy = {stage:'ステージング',commit:'本番反映',validate:'検証',rollback:'取込取消',reset:'送信状態リセット'}[importV20State.mode] || '処理';
  importV20SetMessage(`${modeCopy}を処理中です。進捗欄をご確認ください。`,'working');
  importV20FocusPanel();
}

async function importV20Api(path,options = {}){
  const method = options.method || 'GET';
  const timeoutMs = options.timeoutMs || IMPORT_V20_REQUEST_TIMEOUT;
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
      error.status = response.status;
      error.code = data?.error?.code || null;
      error.safeState = data?.error?.safe_state || null;
      error.confirmedCount = data?.error?.confirmed_count ?? null;
      error.nextActions = data?.error?.next_actions || [];
      throw error;
    }
    return data;
  }catch(error){
    if(error?.name === 'AbortError') throw new Error(`通信が${Math.round(timeoutMs/1000)}秒以内に完了しませんでした。処理状況を更新してから再実行してください。`);
    throw error;
  }finally{
    clearTimeout(timer);
  }
}

// Phase 1.5 / 2: every catch path renders the same 4-part error —
// cause / confirmed-so-far / production impact / next action — instead of
// each operation inventing its own shape. The 423 (import window expired)
// case gets a dedicated re-enable panel; everything else uses the caller's
// fallback copy unless the server sent structured context
// (HttpErrorContext in src/http.ts) to override it.
//
// Phase 1-C origin: the import window expiring mid-loop used to surface as
// a generic, unexplained failure — the root cause of "画面が固まったように
// 見える" identified in the improvement plan §1.1.
function importV20HandleApiError(error,{
  processed=0,total=0,remaining=null,kicker='処理停止',title='操作を完了できませんでした',
  confirmedText='確定済みの分は保存されています。',fallbackSafety='状態を要確認',fallbackSafetyLevel='warning',
  nextActionText='状態を確認してから、もう一度実行してください。',logKeyPrefix='api-error'
} = {}){
  if(error?.code === 'IMPORT_CENTER_LOCKED'){
    const confirmedNote = Number.isFinite(error.confirmedCount) && error.confirmedCount !== null
      ? `画面を閉じても、${Number(error.confirmedCount).toLocaleString()}件までは保存されています。`
      : '確定済みの分は保存されています。';
    importV20SetMessage('取込の有効期限が切れました。もう一度有効にすると続きから再開できます。','error');
    importV20SetPanel({
      state:'locked',
      kicker:'取込の有効期限切れ',
      title:'取込を再度有効にしてください',
      description:`原因：取込の有効化から時間が経過しました。${confirmedNote} 次の行動：下のボタンで再度有効にすると、続きから反映できます。`,
      processed,total,current:0,currentTotal:IMPORT_V20_CHECKPOINT_SIZE,remaining,
      safety:error.safeState||'一部反映済みの可能性',safetyLevel:'warning',
      log:'取込の有効期限切れで停止しました',logKey:`window-locked:${Date.now()}`
    });
    const panel = document.querySelector('#importV20OperationPanel');
    if(panel && !panel.querySelector('#importV20ReenableButton')){
      panel.insertAdjacentHTML('beforeend','<button class="primary-button" type="button" id="importV20ReenableButton">取込をもう一度有効にする</button>');
      panel.querySelector('#importV20ReenableButton').addEventListener('click',importV20Reenable);
    }
    importV20FocusPanel();
    importV20RequestRefresh();
    return true;
  }
  const confirmedNote = Number.isFinite(error.confirmedCount) && error.confirmedCount !== null
    ? `${Number(error.confirmedCount).toLocaleString()}件までは保存されています。`
    : confirmedText;
  const safety = error.safeState || fallbackSafety;
  const safetyLevel = error.safeState ? 'warning' : fallbackSafetyLevel;
  importV20SetMessage(error.message,'error');
  importV20SetPanel({
    state:'error',kicker,title,
    description:`原因：${error.message} ${confirmedNote} 次の行動：${nextActionText}`,
    processed,total,remaining,safety,safetyLevel,
    log:title,logKey:`${logKeyPrefix}:${error.message}`
  });
  importV20FocusPanel();
  importV20RequestRefresh();
  return true;
}

async function importV20Reenable(){
  const confirmation = prompt('取込を再度有効にします。確認のため「ENABLE_IMPORT」と入力してください。');
  if(confirmation !== 'ENABLE_IMPORT') return;
  try{
    await importV20Api(`${IMPORT_V20_API}/import-center/enable`,{method:'POST',body:JSON.stringify({confirmation:'ENABLE_IMPORT'})});
    importV20SetMessage('取込を再度有効にしました。続きの操作を実行してください。','success');
    document.querySelector('#importV20ReenableButton')?.remove();
    importV20RequestRefresh();
  }catch(error){
    importV20SetMessage(error.message,'error');
  }
}

function importV20Yield(ms = IMPORT_V20_YIELD_MS){
  return new Promise((resolve)=>{
    if(typeof requestAnimationFrame === 'function') requestAnimationFrame(()=>setTimeout(resolve,ms));
    else setTimeout(resolve,ms);
  });
}

function importV20NoteCount(payload){
  return payload.items.reduce((total,item)=>total+(Array.isArray(item.notes)?item.notes.length:0),0);
}

function importV20ValidateItems(payload){
  if(!payload || typeof payload !== 'object' || !Array.isArray(payload.items)){
    if(payload && typeof payload === 'object' && Array.isArray(payload.works)){
      const count = payload.works.length;
      throw new Error(`選択したファイルはバックアップ書き出し形式です（${count.toLocaleString()}作品）。この取込には items 配列を持つ取込用JSONを選んでください。`);
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

async function importV20Hash(file){
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest)).map((byte)=>byte.toString(16).padStart(2,'0')).join('');
}

async function importV20InspectFile(file){
  importV20State.selected = null;
  importV20State.selectedKey = '';
  const stage = document.querySelector('#stageImportFile');
  const preview = document.querySelector('#importFilePreview');
  if(!file){
    if(stage){stage.disabled=true;stage.textContent='ステージングを開始／続きから再開';delete stage.dataset.fileState;}
    if(preview){preview.hidden=true;preview.innerHTML='';}
    importV20SetPanel({state:'idle',title:'取込JSONを選択してください',description:'取込用JSONには items 配列が必要です。バックアップ書き出しJSONとは形式が異なります。'});
    return;
  }
  if(stage){
    stage.disabled=false;
    stage.textContent='ファイルを確認中…';
    stage.dataset.fileState='checking';
  }
  importV20SetPanel({state:'working',kicker:'ファイル確認',title:'JSONの内容を確認しています',description:file.name,indeterminate:true,log:'ファイル確認を開始しました',logKey:`file:${importV20FileKey(file)}`});
  try{
    if(file.size > 20*1024*1024) throw new Error('ファイルは20MB以内にしてください。');
    const [text,hash] = await Promise.all([file.text(),importV20Hash(file)]);
    let parsed;
    try{parsed=JSON.parse(text);}catch{throw new Error('JSONとして読み込めませんでした。ファイルが壊れていないか確認してください。');}
    if(parsed && typeof parsed === 'object' && Array.isArray(parsed.works) && !Array.isArray(parsed.items)){
      const works = parsed.works.length;
      const notes = Array.isArray(parsed.notes) ? parsed.notes.length : 0;
      importV20State.selected = {kind:'backup',file,payload:parsed,hash,works,notes};
      importV20State.selectedKey = importV20FileKey(file);
      if(stage){
        stage.disabled=false;
        stage.textContent='このファイルは取込用ではありません';
        stage.dataset.fileState='backup';
      }
      if(preview){
        preview.hidden=false;
        preview.innerHTML=`<strong>${importV20Escape(file.name)}</strong><p class="import-v20-file-warning">バックアップ書き出し形式：${works.toLocaleString()}作品・${notes.toLocaleString()}メモ</p><p>本番の退避用ファイルです。取込には <code>items</code> 配列を持つ元JSONを選択してください。</p>`;
      }
      importV20SetMessage('選択したファイルはバックアップ書き出し形式のため、この取込には使用できません。','warning');
      importV20SetPanel({state:'warning',kicker:'ファイル形式が違います',title:'バックアップJSONが選択されています',description:`${works.toLocaleString()}作品のバックアップです。取込用の items 配列を持つJSONを選び直してください。`,processed:works,total:works,current:0,currentTotal:100,remaining:0,safety:'本番未変更',safetyLevel:'safe',log:'バックアップJSONを検出しました',logKey:`backup:${importV20FileKey(file)}`});
      return;
    }
    const payload = importV20ValidateItems(parsed);
    const works = payload.items.length;
    const notes = importV20NoteCount(payload);
    importV20State.selected = {kind:'import',file,payload,hash,works,notes};
    importV20State.selectedKey = importV20FileKey(file);
    if(stage){
      stage.disabled=false;
      stage.textContent='ステージングを開始／続きから再開';
      stage.dataset.fileState='valid';
    }
    if(preview){
      preview.hidden=false;
      preview.innerHTML=`<strong>${importV20Escape(file.name)}</strong><dl><div><dt>作品</dt><dd>${works.toLocaleString()}件</dd></div><div><dt>メモ</dt><dd>${notes.toLocaleString()}件</dd></div><div><dt>形式</dt><dd>取込用JSON</dd></div><div><dt>SHA-256</dt><dd><code>${hash.slice(0,16)}…</code></dd></div></dl><p>ファイル確認済み。本番データはまだ変更されていません。</p>`;
    }
    importV20SetMessage('取込用JSONの確認が完了しました。','success');
    importV20SetPanel({state:'ready',kicker:'ファイル確認完了',title:'ステージングへ送信できます',description:`${works.toLocaleString()}作品・${notes.toLocaleString()}メモ。100件ごとに自動停止します。`,processed:0,total:works,current:0,currentTotal:Math.min(100,works),remaining:works,safety:'本番未変更',safetyLevel:'safe',log:`取込用JSONを確認：${works.toLocaleString()}作品`,logKey:`valid:${importV20FileKey(file)}`});
  }catch(error){
    importV20State.selected = {kind:'invalid',file,error:error.message};
    importV20State.selectedKey = importV20FileKey(file);
    if(stage){
      stage.disabled=false;
      stage.textContent='ファイル形式を確認';
      stage.dataset.fileState='invalid';
    }
    if(preview){
      preview.hidden=false;
      preview.innerHTML=`<strong>${importV20Escape(file.name)}</strong><p class="import-v20-file-error">${importV20Escape(error.message)}</p>`;
    }
    importV20SetMessage(error.message,'error');
    importV20SetPanel({state:'error',kicker:'ファイル確認エラー',title:'このファイルは送信できません',description:error.message,safety:'本番未変更',safetyLevel:'safe',log:'ファイル確認で停止しました',logKey:`invalid:${importV20FileKey(file)}`});
  }
}

async function importV20SelectedImport(){
  const input = document.querySelector('#importFileInput');
  const file = input?.files?.[0];
  if(!file) throw new Error('取込JSONを選択してください。');
  if(importV20State.selectedKey !== importV20FileKey(file)) await importV20InspectFile(file);
  if(importV20State.selected?.kind === 'backup') throw new Error(`このファイルはバックアップ書き出し形式です（${importV20State.selected.works.toLocaleString()}作品）。items配列を持つ取込用JSONを選び直してください。`);
  if(importV20State.selected?.kind !== 'import') throw new Error(importV20State.selected?.error || '取込用JSONを確認できませんでした。');
  return importV20State.selected;
}

function importV20RequestRefresh(){
  const refresh = document.querySelector('#refreshImportCenter');
  if(refresh){
    refresh.disabled=false;
    refresh.click();
  }
  setTimeout(importV20Decorate,350);
}

async function importV20Stage(button){
  if(importV20State.busy){importV20BusyFeedback();return;}
  let processed=0;
  let total=0;
  let checkpointStart=0;
  try{
    const selected = await importV20SelectedImport();
    total=selected.works;
    importV20SetBusy('stage',button,'送信を開始中…');
    importV20SetMessage('取込バッチと再開位置を確認しています…','working');
    importV20SetPanel({state:'working',kicker:'ステージング準備',title:'再開位置を確認しています',description:'送信済みデータがある場合は、その続きから最後まで自動で進みます。',processed:0,total,current:0,currentTotal:Math.min(IMPORT_V20_CHECKPOINT_SIZE,total),remaining:total,indeterminate:true,log:'ステージング準備を開始しました',logKey:`stage-start:${Date.now()}`});
    importV20FocusPanel();
    const created=await importV20Api(`${IMPORT_V20_API}/import-batches`,{method:'POST',body:JSON.stringify({
      name:selected.payload.batch || selected.file.name.replace(/\.json$/i,''),
      source_filename:selected.file.name,
      content_hash:selected.hash,
      expected_works:total,
      expected_notes:selected.notes
    })});
    const batch=created.batch;
    if(['validated','committing','committed'].includes(batch.status)) throw new Error(batch.status==='committed'?'このJSONはすでに本番反映済みです。':'このJSONはステージング済みです。取込履歴から次の操作へ進んでください。');
    if(['failed','rolled_back'].includes(batch.status)) throw new Error('同じJSONの過去バッチが残っています。先に「送信状態をリセット」してください。');
    processed=Math.min(Number(batch.staged_works||0),total);
    checkpointStart=processed;
    while(processed<total && !importV20State.pauseRequested){
      const chunk=selected.payload.items.slice(processed,Math.min(processed+IMPORT_V20_STAGE_CHUNK,total));
      const next=processed+chunk.length;
      const checkpointTarget=Math.min(IMPORT_V20_CHECKPOINT_SIZE,total-checkpointStart);
      importV20SetMessage(`ステージング中… ${next} / ${total}作品`,'working');
      importV20SetPanel({state:'working',kicker:'ステージング中',title:`${next.toLocaleString()} / ${total.toLocaleString()}作品を送信中`,description:'25件単位で保存しています。100件ごとに画面を更新し、そのまま自動で続行します。',processed,total,current:processed-checkpointStart,currentTotal:checkpointTarget,remaining:total-processed,safety:'本番未変更',safetyLevel:'safe',log:`${next.toLocaleString()}作品まで送信中`,logKey:`stage:${next}`});
      const result=await importV20Api(`${IMPORT_V20_API}/import-batches/${encodeURIComponent(batch.id)}/items`,{method:'POST',body:JSON.stringify({items:chunk})});
      processed=Number(result.batch?.staged_works??next);
      importV20SetPanel({state:'working',kicker:'ステージング中',title:`${processed.toLocaleString()} / ${total.toLocaleString()}作品を保存済み`,description:'保存済み位置から再開できます。次の25件へ進みます。',processed,total,current:processed-checkpointStart,currentTotal:checkpointTarget,remaining:total-processed,safety:'本番未変更',safetyLevel:'safe',log:`${processed.toLocaleString()}作品をステージング済み`,logKey:`staged:${processed}`});
      await importV20Yield();

      if(processed<total && processed-checkpointStart>=IMPORT_V20_CHECKPOINT_SIZE && !importV20State.pauseRequested){
        importV20SetMessage(`${IMPORT_V20_CHECKPOINT_SIZE}件を保存しました。${processed.toLocaleString()} / ${total.toLocaleString()}作品。自動で続行します。`,'working');
        importV20SetPanel({state:'working',kicker:`${IMPORT_V20_CHECKPOINT_SIZE}件チェックポイント`,title:`${processed.toLocaleString()} / ${total.toLocaleString()}作品を保存済み`,description:'画面の描画と通信負荷を整えてから、自動で次の100件へ進みます。',processed,total,current:IMPORT_V20_CHECKPOINT_SIZE,currentTotal:IMPORT_V20_CHECKPOINT_SIZE,remaining:total-processed,safety:'本番未変更',safetyLevel:'safe',log:`${IMPORT_V20_CHECKPOINT_SIZE}件チェックポイントを通過しました`,logKey:`checkpoint:${processed}`});
        await importV20Yield(IMPORT_V20_CHECKPOINT_DELAY_MS);
        checkpointStart=processed;
      }
    }
    if(processed>=total){
      importV20SetMessage('重複と件数を検証しています…','working');
      importV20SetPanel({state:'working',kicker:'検証中',title:'重複・件数・統合先を確認しています',description:'全作品のステージングが完了しました。検証中も本番データは変更されません。',processed,total,current:Math.max(0,processed-checkpointStart),currentTotal:Math.max(0,total-checkpointStart),remaining:0,safety:'本番未変更',safetyLevel:'safe',indeterminate:true,log:'全作品の検証を開始しました',logKey:'validate-start'});
      const detail=await importV20Api(`${IMPORT_V20_API}/import-batches/${encodeURIComponent(batch.id)}/validate`,{method:'POST',body:'{}',timeoutMs:IMPORT_V20_VALIDATE_TIMEOUT});
      const conflicts=Number(detail.batch?.conflict_count||0);
      importV20SetMessage(conflicts===0?'ステージングと検証が完了しました。本番データはまだ変更されていません。':'検証が完了しました。競合を確認してください。',conflicts===0?'success':'warning');
      importV20SetPanel({state:conflicts===0?'ready':'warning',kicker:conflicts===0?'検証完了':'要確認',title:conflicts===0?'本番反映の準備ができました':`${conflicts.toLocaleString()}件の競合があります`,description:conflicts===0?'取込履歴の「最初の100件を反映」から進めてください。':'競合内容を確認してください。本番データはまだ変更されていません。',processed,total,current:Math.max(0,processed-checkpointStart),currentTotal:Math.max(0,total-checkpointStart),remaining:0,safety:'本番未変更',safetyLevel:'safe',log:conflicts===0?'検証が完了しました':'競合を検出しました',logKey:`validate:${conflicts}`});
    }else{
      importV20SetMessage(`一時停止しました。${processed.toLocaleString()} / ${total.toLocaleString()}作品を保存済みです。`,'success');
      importV20SetPanel({state:'paused',kicker:'一時停止',title:`${processed.toLocaleString()} / ${total.toLocaleString()}作品を保存済み`,description:'同じJSONを選んだまま、もう一度ボタンを押すと続きから最後まで自動で進みます。',processed,total,current:processed-checkpointStart,currentTotal:Math.min(IMPORT_V20_CHECKPOINT_SIZE,total-checkpointStart),remaining:total-processed,safety:'本番未変更',safetyLevel:'safe',log:'ステージングを一時停止しました',logKey:`stage-pause:${processed}`});
    }
    importV20RequestRefresh();
  }catch(error){
    importV20HandleApiError(error,{
      processed,total,remaining:total?total-processed:null,
      title:'ステージングを完了できませんでした',
      confirmedText:'送信済み分は保存されています。',
      fallbackSafety:'本番未変更',fallbackSafetyLevel:'safe',
      nextActionText:'もう一度同じJSONを選び直すと、保存済み位置から再開できます。',
      logKeyPrefix:'stage-error'
    });
  }finally{
    if(importV20State.busy) importV20ReleaseBusy();
  }
}

function importV20RowStatus(button){
  return button.closest('.import-batch-row')?.dataset.status || '';
}

function importV20RowActions(row){
  return new Set((row?.dataset.allowedActions || '').split(' ').filter(Boolean));
}

async function importV20Commit(button){
  if(importV20State.busy){importV20BusyFeedback();return;}
  const batchId=button.dataset.batchId;
  const status=importV20RowStatus(button);
  if(!batchId) return;
  if(status==='validated'){
    if(prompt('本番へ最初の100作品を反映します。確認のため「反映」と入力してください。')!=='反映') return;
  }else if(!confirm('続きの最大100作品を本番へ反映します。続けますか？')) return;
  let processed=0;
  let total=0;
  let remaining=null;
  let runStart=0;
  let done=false;
  importV20SetBusy('commit',button,status==='validated'?'最初の100件を反映中…':'次の100件を反映中…');
  importV20SetMessage('本番への分割反映を開始しています…','working');
  importV20SetPanel({state:'working',kicker:'本番反映準備',title:'反映位置を確認しています',description:'20作品単位で、最大100作品を本番へ反映します。',indeterminate:true,safety:'本番変更中',safetyLevel:'live',log:'本番反映を開始しました',logKey:`commit-start:${Date.now()}`});
  importV20FocusPanel();
  try{
    for(let call=0;call<IMPORT_V20_COMMIT_CALLS && !done && !importV20State.pauseRequested;call+=1){
      const result=await importV20Api(`${IMPORT_V20_API}/import-batches/${encodeURIComponent(batchId)}/commit`,{method:'POST',body:'{}'});
      done=Boolean(result.done);
      remaining=Number(result.remaining||0);
      total=Number(result.batch?.expected_works||(Number(result.batch?.applied_works||0)+remaining));
      processed=Number(result.batch?.applied_works??Math.max(0,total-remaining));
      if(call===0) runStart=Math.max(0,processed-Number(result.processed||0));
      const current=Math.max(0,processed-runStart);
      importV20SetMessage(done?`反映完了：${processed}作品・${Number(result.batch?.applied_notes||0)}メモ`:`反映中… 残り${remaining}作品`,'working');
      importV20SetPanel({state:'working',kicker:'本番反映中',title:`${processed.toLocaleString()} / ${total.toLocaleString()}作品を反映済み`,description:done?'最後の確認をしています。':'20作品単位で本番へ反映しています。反映済み分は保存されています。',processed,total,current,currentTotal:Math.min(IMPORT_V20_CHECKPOINT_SIZE,total-runStart),remaining,safety:'一部反映済み',safetyLevel:'live',log:`${processed.toLocaleString()}作品を本番へ反映済み`,logKey:`commit:${processed}`});
      await importV20Yield();
    }
    if(done){
      importV20SetMessage('本番への反映が完了しました。','success');
      importV20SetPanel({state:'done',kicker:'反映完了',title:'本番への反映が完了しました',description:'作品一覧で件数を確認してください。',processed,total,current:Math.max(0,processed-runStart),currentTotal:Math.min(IMPORT_V20_CHECKPOINT_SIZE,total-runStart),remaining:0,safety:'反映済み',safetyLevel:'done',log:'本番反映が完了しました',logKey:'commit-done'});
    }else{
      const paused=importV20State.pauseRequested;
      importV20SetMessage(`${paused?'一時停止':'100件分完了'}：${processed.toLocaleString()}作品を反映済み。残り${Number(remaining||0).toLocaleString()}作品。`,'success');
      importV20SetPanel({state:paused?'paused':'ready',kicker:paused?'一時停止':'今回分完了',title:`${processed.toLocaleString()} / ${total.toLocaleString()}作品を反映済み`,description:'取込履歴の「次の100件を反映」から続けられます。',processed,total,current:Math.max(0,processed-runStart),currentTotal:Math.min(IMPORT_V20_CHECKPOINT_SIZE,total-runStart),remaining,safety:'一部反映済み',safetyLevel:'warning',log:paused?'本番反映を一時停止しました':'100件分の本番反映が完了しました',logKey:`commit-stop:${processed}:${paused}`});
    }
    importV20RequestRefresh();
  }catch(error){
    importV20HandleApiError(error,{
      processed,total,remaining,
      title:'本番反映を完了できませんでした',
      confirmedText:'反映済み分は保存されています。',
      fallbackSafety:'一部反映済みの可能性',fallbackSafetyLevel:'warning',
      nextActionText:'取込履歴で状態を確認し、問題がなければ「次の100件を反映」からやり直してください。',
      logKeyPrefix:'commit-error'
    });
  }finally{
    importV20ReleaseBusy();
  }
}

async function importV20Validate(button){
  if(importV20State.busy){importV20BusyFeedback();return;}
  const batchId=button.dataset.batchId;
  if(!batchId) return;
  importV20SetBusy('validate',button,'重複と件数を確認中…');
  importV20SetMessage('重複と件数を再検証しています…','working');
  importV20SetPanel({state:'working',kicker:'再検証中',title:'重複・件数・統合先を確認しています',description:'検証中は本番データを変更しません。',indeterminate:true,safety:'本番未変更',safetyLevel:'safe',log:'再検証を開始しました',logKey:`revalidate-start:${Date.now()}`});
  importV20FocusPanel();
  try{
    const detail=await importV20Api(`${IMPORT_V20_API}/import-batches/${encodeURIComponent(batchId)}/validate`,{method:'POST',body:'{}',timeoutMs:IMPORT_V20_VALIDATE_TIMEOUT});
    const conflicts=Number(detail.batch?.conflict_count||0);
    const total=Number(detail.batch?.expected_works||detail.batch?.staged_works||0);
    const processed=Number(detail.batch?.staged_works||0);
    importV20SetMessage(conflicts===0?'検証が完了しました。':'競合があります。内容を確認してください。',conflicts===0?'success':'warning');
    importV20SetPanel({state:conflicts===0?'ready':'warning',kicker:conflicts===0?'再検証完了':'要確認',title:conflicts===0?'本番反映の準備ができました':`${conflicts.toLocaleString()}件の競合があります`,description:conflicts===0?'「最初の100件を反映」から進められます。':'取込内容の競合を確認してください。本番データは変更されていません。',processed,total,current:0,currentTotal:100,remaining:Math.max(0,total-processed),safety:'本番未変更',safetyLevel:'safe',log:conflicts===0?'再検証が完了しました':'再検証で競合を検出しました',logKey:`revalidate:${conflicts}`});
    importV20RequestRefresh();
  }catch(error){
    importV20HandleApiError(error,{
      title:'再検証を完了できませんでした',
      confirmedText:'本番データへの影響はありません。',
      fallbackSafety:'本番未変更',fallbackSafetyLevel:'safe',
      nextActionText:'内容を確認してから、もう一度「再検証」を実行してください。',
      logKeyPrefix:'revalidate-error'
    });
  }finally{
    importV20ReleaseBusy();
  }
}

async function importV20Rollback(button){
  if(importV20State.busy){importV20BusyFeedback();return;}
  const batchId=button.dataset.batchId;
  if(!batchId) return;
  if(prompt('今回の取込で追加した作品・メモ・分類を最大100変更取り消します。確認のため「取消」と入力してください。')!=='取消') return;
  importV20SetBusy('rollback',button,'100変更を取り消し中…');
  importV20SetMessage('今回の取込内容を100変更ずつ取り消しています…','working');
  importV20SetPanel({state:'rollback',kicker:'取込取消中',title:'最大100変更を取り消しています',description:'今回の取込で追加した変更だけを対象にします。既存データは残ります。',indeterminate:true,safety:'取消中',safetyLevel:'warning',log:'取込取消を開始しました',logKey:`rollback-start:${Date.now()}`});
  importV20FocusPanel();
  try{
    const result=await importV20Api(`${IMPORT_V20_API}/import-batches/${encodeURIComponent(batchId)}/rollback`,{method:'POST',body:'{}'});
    const remaining=Number(result.remaining||0);
    const processed=Number(result.processed||0);
    if(result.done){
      importV20SetMessage('今回の取込を取り消しました。続けて送信状態をリセットできます。','success');
      importV20SetPanel({state:'done',kicker:'取消完了',title:'今回の取込を取り消しました',description:'続けて「送信状態をリセット」を押すと、最初からやり直せます。',processed,current:processed,currentTotal:100,remaining:0,safety:'本番復旧済み',safetyLevel:'safe',log:'取込取消が完了しました',logKey:'rollback-done'});
    }else{
      importV20SetMessage(`${processed.toLocaleString()}変更を取り消しました。残り${remaining.toLocaleString()}変更です。`,'success');
      importV20SetPanel({state:'ready',kicker:'今回分完了',title:`${processed.toLocaleString()}変更を取り消しました`,description:'同じボタンをもう一度押すと、次の最大100変更を取り消します。',processed:0,total:0,current:processed,currentTotal:100,remaining,safety:'一部取消済み',safetyLevel:'warning',log:`${processed.toLocaleString()}変更を取消済み`,logKey:`rollback:${remaining}`});
    }
    importV20RequestRefresh();
  }catch(error){
    importV20HandleApiError(error,{
      title:'取込取消を完了できませんでした',
      confirmedText:'取消済み分は保存されています。',
      fallbackSafety:'状態を要確認',fallbackSafetyLevel:'warning',
      nextActionText:'状態を確認してから、もう一度「100件ずつ取込を取り消す」を実行してください。',
      logKeyPrefix:'rollback-error'
    });
  }finally{
    importV20ReleaseBusy();
  }
}

async function importV20Reset(button){
  if(importV20State.busy){importV20BusyFeedback();return;}
  const batchId=button.dataset.batchId;
  const row=button.closest('.import-batch-row');
  if(!batchId) return;
  if(!importV20RowActions(row).has('delete')){
    importV20SetMessage('本番へ反映された変更があるため、先に「100件ずつ取込を取り消す」を実行してください。','warning');
    return;
  }
  if(prompt('本番データは変更せず、この送信途中データと取込履歴だけを消します。確認のため「リセット」と入力してください。')!=='リセット') return;
  importV20SetBusy('reset',button,'送信状態をリセット中…');
  importV20SetMessage('送信途中のデータをリセットしています…','working');
  importV20SetPanel({state:'working',kicker:'送信状態リセット',title:'ステージングと取込履歴を削除しています',description:'本番の作品・メモは変更しません。',indeterminate:true,safety:'本番未変更',safetyLevel:'safe',log:'送信状態のリセットを開始しました',logKey:`reset-start:${Date.now()}`});
  importV20FocusPanel();
  try{
    await importV20Api(`${IMPORT_V20_API}/import-batches/${encodeURIComponent(batchId)}`,{method:'DELETE'});
    const input=document.querySelector('#importFileInput');
    if(input) input.value='';
    importV20State.selected=null;
    importV20State.selectedKey='';
    const preview=document.querySelector('#importFilePreview');
    if(preview){preview.hidden=true;preview.innerHTML='';}
    const detail=document.querySelector('#importBatchDetail');
    if(detail) detail.hidden=true;
    importV20SetMessage('送信状態をリセットしました。本番の作品・メモは変更していません。','success');
    importV20SetPanel({state:'done',kicker:'リセット完了',title:'送信状態をリセットしました',description:'取込用JSONを選び直すと、最初から送信できます。',safety:'本番未変更',safetyLevel:'safe',log:'送信状態をリセットしました',logKey:'reset-done'});
    importV20RequestRefresh();
  }catch(error){
    importV20HandleApiError(error,{
      title:'送信状態をリセットできませんでした',
      confirmedText:'本番の作品・メモは変更していません。',
      fallbackSafety:'本番状態は維持',fallbackSafetyLevel:'safe',
      nextActionText:'状態を確認してから、もう一度「送信状態をリセット」を実行してください。',
      logKeyPrefix:'reset-error'
    });
  }finally{
    importV20ReleaseBusy();
  }
}

function importV20Pause(){
  if(!importV20State.busy || !['stage','commit'].includes(importV20State.mode)) return;
  importV20State.pauseRequested=true;
  const unit=importV20State.mode==='stage'?'25件':'20件';
  const pause=document.querySelector('#pauseImportChunk');
  if(pause){pause.disabled=true;pause.textContent='停止予約済み';}
  importV20SetMessage(`一時停止を予約しました。現在処理中の${unit}が終わり次第停止します。`,'working');
  importV20Log(`現在の${unit}終了後に一時停止します`,`pause:${Date.now()}`);
}

function importV20CloseDetail(){
  const detail=document.querySelector('#importBatchDetail');
  if(detail) detail.hidden=true;
}

function importV20SetText(node,text){
  if(node && node.textContent!==text) node.textContent=text;
}

// data-*も同値の再代入でMutationRecordが生成されるため、observerが監視する
// 属性は必ず差分チェックしてから書き込む(自己発火ループの再発防止)。
function importV20SetAttr(node,name,value){
  if(node && node.getAttribute(name)!==value) node.setAttribute(name,value);
}

function importV20DecorateRows(){
  document.querySelectorAll('#importCenterCard .import-batch-row').forEach((row)=>{
    const status=row.dataset.status||'';
    const actions=importV20RowActions(row);
    const copy=IMPORT_V20_STATUS_COPY[status]||{tone:'neutral',description:'状態を確認してください。'};
    const statusNode=row.querySelector('.import-status');
    if(statusNode){
      importV20SetText(statusNode,row.dataset.statusLabel||status);
      importV20SetAttr(statusNode,'data-tone',copy.tone);
      importV20SetAttr(statusNode,'data-active',String(['uploading','committing'].includes(status)));
    }
    const main=row.querySelector('.import-batch-main');
    let explanation=main?.querySelector('.import-v20-row-status');
    if(main && !explanation){
      explanation=document.createElement('p');
      explanation.className='import-v20-row-status';
      main.append(explanation);
    }
    if(explanation){
      importV20SetText(explanation,copy.description);
      importV20SetAttr(explanation,'data-tone',copy.tone);
    }

    const commit=row.querySelector('[data-import-action="commit"]');
    if(commit){
      if(commit !== importV20State.activeButton) importV20SetText(commit,status==='committing'?'次の100件を反映':'最初の100件を反映');
      commit.dataset.v20Action='commit';
    }

    const remove=row.querySelector('[data-import-action="delete"], [data-v20-action="reset"]');
    if(remove){
      if(actions.has('delete')){
        remove.hidden=false;
        remove.dataset.v20Action='reset';
        delete remove.dataset.importAction;
        if(remove !== importV20State.activeButton) importV20SetText(remove,'送信状態をリセット');
        remove.title='本番データを残したまま、送信途中データと履歴だけを削除します';
      }else{
        remove.hidden=true;
      }
    }

    const rollback=row.querySelector('[data-import-action="rollback"], [data-v20-action="rollback"]');
    if(rollback && actions.has('rollback')){
      rollback.hidden=false;
      rollback.dataset.v20Action='rollback';
      delete rollback.dataset.importAction;
      if(rollback !== importV20State.activeButton) importV20SetText(rollback,'100件ずつ取込を取り消す');
      rollback.title='今回の取込で追加した変更だけを最大100件ずつ取り消します';
    }
  });
}

function importV20Decorate(){
  if(!importV20EnsureUi()) return false;
  const stage=document.querySelector('#stageImportFile');
  const input=document.querySelector('#importFileInput');
  if(stage && !importV20State.busy){
    const hasFile=Boolean(input?.files?.length);
    if(!hasFile){
      stage.disabled=true;
      importV20SetText(stage,'ステージングを開始／続きから再開');
    }else if(importV20State.selected?.kind==='import'){
      stage.disabled=false;
      importV20SetText(stage,'ステージングを開始／続きから再開');
    }else if(importV20State.selected?.kind==='backup'){
      stage.disabled=false;
      importV20SetText(stage,'このファイルは取込用ではありません');
    }else{
      stage.disabled=false;
      importV20SetText(stage,'ファイル形式を確認');
    }
  }
  document.querySelectorAll('[data-import-action="close-detail"]').forEach((button)=>{
    button.disabled=false;
    button.title='詳細を閉じる';
  });
  importV20DecorateRows();
  return true;
}

function importV20HandleClick(event){
  const button=event.target.closest('button');
  if(!button) return;
  const action=button.dataset.v20Action || button.dataset.importAction;
  if(button.id==='stageImportFile'){
    event.preventDefault();event.stopImmediatePropagation();void importV20Stage(button);return;
  }
  if(button.id==='pauseImportChunk'){
    event.preventDefault();event.stopImmediatePropagation();importV20Pause();return;
  }
  if(action==='close-detail'){
    event.preventDefault();event.stopImmediatePropagation();importV20CloseDetail();return;
  }
  if(action==='commit'){
    event.preventDefault();event.stopImmediatePropagation();void importV20Commit(button);return;
  }
  if(action==='validate'){
    event.preventDefault();event.stopImmediatePropagation();void importV20Validate(button);return;
  }
  if(action==='rollback'){
    event.preventDefault();event.stopImmediatePropagation();void importV20Rollback(button);return;
  }
  if(action==='reset' || action==='delete'){
    event.preventDefault();event.stopImmediatePropagation();void importV20Reset(button);
  }
}

function importV20HandleChange(event){
  const input=event.target;
  if(!(input instanceof HTMLInputElement) || input.id!=='importFileInput') return;
  event.stopImmediatePropagation();
  void importV20InspectFile(input.files?.[0] || null);
}

document.addEventListener('click',importV20HandleClick,true);
document.addEventListener('change',importV20HandleChange,true);

function importV20Start(){
  if(!importV20Decorate()){
    setTimeout(importV20Start,200);
    return;
  }
  const card=document.querySelector('#importCenterCard');
  if(card){
    // importV20Decorate自身がdata-status/hidden/disabledを書き換えるため、
    // 素朴なobserve→callbackだと自分の書き込みで再度発火し続ける
    // (属性やtextContentは同値の再代入でもMutationRecordが生成される)。
    // callback内でdisconnect→処理→observeと囲み、処理中に発生した変更を
    // 記録させないことで自己発火のループを断つ。
    const observeOptions={subtree:true,childList:true,attributes:true,attributeFilter:['data-status','hidden','disabled']};
    const observer=new MutationObserver(()=>{
      observer.disconnect();
      importV20Decorate();
      observer.observe(card,observeOptions);
    });
    observer.observe(card,observeOptions);
  }
  const input=document.querySelector('#importFileInput');
  if(input?.files?.[0]) void importV20InspectFile(input.files[0]);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(importV20Start,100),{once:true});
else setTimeout(importV20Start,100);
