const IMPORT_STEP_LABELS = [
  ['file', 'ファイル確認'],
  ['stage', 'ステージング'],
  ['validate', '重複・件数確認'],
  ['commit', '本番反映']
];

let progressStartedAt = null;
let lastProgressSignature = '';

function clampProgress(value){
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function formatElapsed(startedAt){
  if(!startedAt) return '—';
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  if(seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}分${String(seconds % 60).padStart(2,'0')}秒`;
}

function ensureProgressUI(){
  const card = document.querySelector('#importCenterCard');
  if(!card || card.querySelector('#importProgressGuide')) return false;
  const heading = card.querySelector('.import-center-heading');
  if(!heading) return false;
  heading.insertAdjacentHTML('afterend', `
    <section class="import-progress-guide" id="importProgressGuide" aria-label="取込の進行状況">
      <ol class="import-stepper" id="importStepper">
        ${IMPORT_STEP_LABELS.map(([key,label], index)=>`
          <li class="import-step" data-step="${key}" data-state="waiting">
            <span class="import-step-mark" aria-hidden="true">${index + 1}</span>
            <span class="import-step-copy"><strong>${label}</strong><small>${index===0?'JSONの内容と件数を確認':index===1?'本番と分けた場所へ送信':index===2?'重複・件数・統合先を検査':'確認後に作品一覧へ反映'}</small></span>
          </li>`).join('')}
      </ol>
      <div class="import-live-progress" id="importLiveProgress" data-state="idle">
        <div class="import-live-heading">
          <div><span class="import-live-kicker" id="importLiveKicker">準備</span><strong id="importLiveTitle">取込ファイルを選択してください</strong></div>
          <span class="import-safety-badge" id="importSafetyBadge" data-level="safe">本番未変更</span>
        </div>
        <p id="importLiveDescription">ファイルを選んでも、まだ作品一覧には反映されません。</p>
        <div class="import-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="importProgressTrack"><span id="importProgressFill"></span></div>
        <dl class="import-progress-metrics">
          <div><dt>進捗</dt><dd id="importProgressPercent">0%</dd></div>
          <div><dt>処理済み</dt><dd id="importProgressProcessed">0件</dd></div>
          <div><dt>残り</dt><dd id="importProgressRemaining">—</dd></div>
          <div><dt>経過</dt><dd id="importProgressElapsed">—</dd></div>
        </dl>
        <p class="import-next-guide" id="importNextGuide">次：取込JSONを選択</p>
      </div>
    </section>`);
  return true;
}

function setStepStates(activeKey, completedKeys = [], errorKey = null){
  document.querySelectorAll('#importStepper .import-step').forEach((step)=>{
    const key = step.dataset.step;
    const state = key === errorKey ? 'error' : completedKeys.includes(key) ? 'done' : key === activeKey ? 'active' : 'waiting';
    step.dataset.state = state;
    const mark = step.querySelector('.import-step-mark');
    if(mark) mark.textContent = state === 'done' ? '✓' : state === 'error' ? '!' : String(IMPORT_STEP_LABELS.findIndex(([value])=>value===key)+1);
  });
}

function setLiveProgress({state='idle', kicker='準備', title, description='', percent=0, processed='0件', remaining='—', next='', safety='本番未変更', safetyLevel='safe', indeterminate=false, resetTimer=false}){
  ensureProgressUI();
  const panel = document.querySelector('#importLiveProgress');
  if(!panel) return;
  if(resetTimer || (!progressStartedAt && ['working','committing','rollback'].includes(state))) progressStartedAt = Date.now();
  if(['idle','ready','done','error'].includes(state) && resetTimer) progressStartedAt = null;
  panel.dataset.state = state;
  panel.dataset.indeterminate = String(Boolean(indeterminate));
  const safePercent = clampProgress(percent);
  const elements = {
    '#importLiveKicker': kicker,
    '#importLiveTitle': title || '',
    '#importLiveDescription': description,
    '#importProgressPercent': indeterminate ? '処理中' : `${Math.round(safePercent)}%`,
    '#importProgressProcessed': processed,
    '#importProgressRemaining': remaining,
    '#importProgressElapsed': formatElapsed(progressStartedAt),
    '#importNextGuide': next
  };
  for(const [selector,value] of Object.entries(elements)){
    const node = document.querySelector(selector);
    if(node) node.textContent = value;
  }
  const badge = document.querySelector('#importSafetyBadge');
  if(badge){badge.textContent=safety;badge.dataset.level=safetyLevel;}
  const fill = document.querySelector('#importProgressFill');
  if(fill) fill.style.width = indeterminate ? '38%' : `${safePercent}%`;
  const track = document.querySelector('#importProgressTrack');
  if(track){track.setAttribute('aria-valuenow',String(Math.round(safePercent)));track.setAttribute('aria-valuetext',indeterminate?'処理中':`${Math.round(safePercent)}%`);}
}

function selectedFileInfo(){
  const preview = document.querySelector('#importFilePreview');
  if(!preview || preview.hidden) return null;
  const values = Array.from(preview.querySelectorAll('dd')).map((node)=>node.textContent?.trim() || '');
  const works = Number((values[0] || '').replace(/[^0-9]/g,''));
  const notes = Number((values[1] || '').replace(/[^0-9]/g,''));
  return {works:Number.isFinite(works)?works:0,notes:Number.isFinite(notes)?notes:0};
}

function detailExpectedWorks(){
  const detail = document.querySelector('#importBatchDetail');
  if(!detail || detail.hidden) return 0;
  const rows = Array.from(detail.querySelectorAll('.import-detail-counts > div'));
  const target = rows.find((row)=>row.querySelector('dt')?.textContent?.includes('取込予定'));
  return Number((target?.querySelector('dd')?.textContent || '').replace(/[^0-9]/g,'')) || 0;
}

function renderBatchGuidance(){
  document.querySelectorAll('.import-batch-row').forEach((row)=>{
    const status = row.dataset.status || '';
    let guide = row.querySelector('.import-batch-guide');
    if(!guide){
      guide = document.createElement('p');
      guide.className = 'import-batch-guide';
      row.querySelector('.import-batch-main')?.append(guide);
    }
    const copy = {
      draft:'次：作品をステージングへ送信',
      uploading:'進行中：ステージングの続き',
      review:'要確認：競合を解消して再検証',
      validated:'次：内容を確認して本番へ反映',
      committing:'進行中：本番への反映を続行',
      committed:'完了：作品一覧へ反映済み',
      failed:'失敗：内容を確認して再開または取消',
      rolled_back:'完了：今回の取込を取消済み'
    };
    guide.textContent = copy[status] || '状態を確認してください';
  });
}

function deriveProgressFromUI(){
  ensureProgressUI();
  renderBatchGuidance();
  const messageNode = document.querySelector('#importCenterMessage');
  const message = messageNode?.textContent?.trim() || '';
  const messageType = messageNode?.dataset.type || '';
  const file = selectedFileInfo();

  const staging = message.match(/ステージング中…\s*([0-9,]+)\s*\/\s*([0-9,]+)作品/);
  if(staging){
    const processed = Number(staging[1].replaceAll(',',''));
    const total = Number(staging[2].replaceAll(',',''));
    const percent = total ? processed / total * 100 : 0;
    setStepStates('stage',['file']);
    setLiveProgress({state:'working',kicker:'STEP 2 / 4',title:'作品をステージングへ送信中',description:`${total.toLocaleString()}作品を25件ずつ、安全な一時領域へ送っています。`,percent,processed:`${processed.toLocaleString()}件`,remaining:`${Math.max(0,total-processed).toLocaleString()}件`,next:'次：全件送信後、自動で重複と件数を検証',safety:'本番未変更',safetyLevel:'safe'});
    return;
  }

  if(/取込バッチを作成|アップロード中/.test(message)){
    setStepStates('stage',['file']);
    setLiveProgress({state:'working',kicker:'STEP 2 / 4',title:'ステージングを準備中',description:'取込専用の一時領域を作っています。',percent:0,processed:'0件',remaining:file?.works?`${file.works.toLocaleString()}件`:'—',next:'次：作品を25件ずつ送信',safety:'本番未変更',safetyLevel:'safe',indeterminate:true});
    return;
  }

  if(/重複と件数.*検証|再検証/.test(message)){
    setStepStates('validate',['file','stage']);
    setLiveProgress({state:'working',kicker:'STEP 3 / 4',title:'重複と件数を検証中',description:'同じ作品、source_key、既存作品との統合先を確認しています。',percent:75,processed:file?.works?`${file.works.toLocaleString()}件`:'全件',remaining:'検証のみ',next:'次：競合0件なら本番反映の確認へ',safety:'本番未変更',safetyLevel:'safe',indeterminate:true});
    return;
  }

  const committing = message.match(/反映中…\s*残り([0-9,]+)作品/);
  if(committing){
    const remainingCount = Number(committing[1].replaceAll(',',''));
    const total = detailExpectedWorks() || file?.works || remainingCount;
    const processed = Math.max(0,total-remainingCount);
    const percent = total ? processed / total * 100 : 0;
    setStepStates('commit',['file','stage','validate']);
    setLiveProgress({state:'committing',kicker:'STEP 4 / 4',title:'作品一覧へ反映中',description:'20作品ずつ本番へ反映しています。画面を閉じずにお待ちください。',percent,processed:`${processed.toLocaleString()}件`,remaining:`${remainingCount.toLocaleString()}件`,next:'次：完了後に作品数とメモ数を表示',safety:'本番変更中',safetyLevel:'live'});
    return;
  }

  const completed = message.match(/反映完了：([0-9,]+)作品・([0-9,]+)メモ|本番への反映が完了/);
  if(completed || /本番への反映が完了/.test(message)){
    setStepStates(null,['file','stage','validate','commit']);
    setLiveProgress({state:'done',kicker:'完了',title:'本番への反映が完了しました',description:'作品一覧を開くと、取り込んだ作品を確認できます。',percent:100,processed:completed?.[1]?`${completed[1]}作品`:'全件',remaining:'0件',next:'次：作品一覧で件数と漫画シリーズを確認',safety:'反映済み',safetyLevel:'done',resetTimer:true});
    return;
  }

  if(/取消中/.test(message)){
    setStepStates('commit',['file','stage','validate']);
    setLiveProgress({state:'rollback',kicker:'取消処理',title:'今回の取込だけを取り消し中',description:message,percent:50,processed:'処理中',remaining:'確認中',next:'次：取消完了後、既存作品が残っていることを確認',safety:'取消中',safetyLevel:'warning',indeterminate:true});
    return;
  }

  if(/取込を取り消しました|取消しました/.test(message)){
    setStepStates(null,[]);
    setLiveProgress({state:'done',kicker:'取消完了',title:'今回の取込を取り消しました',description:'取込前から存在した作品は変更していません。',percent:100,processed:'取消済み',remaining:'0件',next:'次：必要なら元ファイルを修正して再取込',safety:'本番復旧済み',safetyLevel:'safe',resetTimer:true});
    return;
  }

  if(messageType === 'error'){
    const batchStatus = document.querySelector('.import-batch-row')?.dataset.status;
    const errorStep = batchStatus === 'committing' ? 'commit' : batchStatus === 'review' ? 'validate' : file ? 'stage' : 'file';
    const completed = errorStep === 'commit' ? ['file','stage','validate'] : errorStep === 'validate' ? ['file','stage'] : errorStep === 'stage' ? ['file'] : [];
    setStepStates(errorStep,completed,errorStep);
    setLiveProgress({state:'error',kicker:'停止',title:'処理が停止しました',description:message,percent:0,processed:'停止',remaining:'未完了',next:'次：表示された内容を確認して再実行',safety:errorStep==='commit'?'状態を確認':'本番未変更',safetyLevel:'warning'});
    return;
  }

  if(/ステージングと検証が完了|検証が完了/.test(message)){
    const hasConflict = /競合/.test(message) && !/競合はありません/.test(message);
    setStepStates(hasConflict?'validate':'commit',['file','stage',...(hasConflict?[]:['validate'])],hasConflict?'validate':null);
    setLiveProgress({state:hasConflict?'error':'ready',kicker:hasConflict?'要確認':'STEP 3 / 4 完了',title:hasConflict?'競合を確認してください':'本番反映の準備ができました',description:hasConflict?'まだ本番には反映されていません。競合内容を確認してください。':'件数と重複の検証が完了しました。内容を確認してから本番へ反映します。',percent:hasConflict?75:75,processed:file?.works?`${file.works.toLocaleString()}件`:'全件',remaining:hasConflict?'競合あり':'本番反映のみ',next:hasConflict?'次：競合を解消して再アップロード':'次：「本番へ反映」を押し、確認文字を入力',safety:'本番未変更',safetyLevel:'safe',resetTimer:true});
    return;
  }

  if(file){
    setStepStates('stage',['file']);
    setLiveProgress({state:'ready',kicker:'STEP 1 / 4 完了',title:'ファイルの確認が完了しました',description:`${file.works.toLocaleString()}作品・${file.notes.toLocaleString()}メモを読み込みます。`,percent:25,processed:`${file.works.toLocaleString()}件確認`,remaining:`${file.works.toLocaleString()}件送信`,next:'次：「ステージングへ送る」を押す',safety:'本番未変更',safetyLevel:'safe',resetTimer:true});
    return;
  }

  setStepStates('file',[]);
  setLiveProgress({state:'idle',kicker:'STEP 1 / 4',title:'取込ファイルを選択してください',description:'ファイルを選んだだけでは本番の作品一覧は変わりません。',percent:0,processed:'0件',remaining:'—',next:'次：取込JSONを選択',safety:'本番未変更',safetyLevel:'safe',resetTimer:true});
}

function progressTick(){
  const signature = [
    document.querySelector('#importCenterMessage')?.textContent,
    document.querySelector('#importCenterMessage')?.dataset.type,
    document.querySelector('#importFilePreview')?.hidden,
    document.querySelector('#importBatchList')?.textContent,
    document.querySelector('#importBatchDetail')?.textContent
  ].join('|');
  if(signature !== lastProgressSignature){
    lastProgressSignature = signature;
    deriveProgressFromUI();
  }else if(progressStartedAt){
    const elapsed = document.querySelector('#importProgressElapsed');
    if(elapsed) elapsed.textContent = formatElapsed(progressStartedAt);
  }
}

function startImportProgressEnhancement(){
  if(!ensureProgressUI()){
    setTimeout(startImportProgressEnhancement,250);
    return;
  }
  deriveProgressFromUI();
  const card = document.querySelector('#importCenterCard');
  if(card){
    new MutationObserver(()=>queueMicrotask(progressTick)).observe(card,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','data-type','data-status','disabled']});
  }
  setInterval(progressTick,1000);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(startImportProgressEnhancement,100),{once:true});
else setTimeout(startImportProgressEnhancement,100);
