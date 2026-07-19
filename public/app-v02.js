const TYPE_LABELS = {book:'本',manga:'漫画',movie:'映画',anime:'アニメ',drama:'ドラマ',other:'その他'};
const STATUS_LABELS = {want:'読みたい・見たい',owned_unread:'所持・未読',active:'進行中',completed:'完了',paused:'一時停止',dropped:'中断'};
const NOTE_LABELS = {quick:'一言',summary:'要約',impression:'印象',quote:'引用',idea:'自分の考え',connection:'接続',progress:'途中メモ'};
const DRAFT_KEY = 'sakuhin-log-work-draft-v2';
const MEDIA_CONFIG = {
  book:{creator:'著者',creatorPlaceholder:'著者名',unit:'ページ',current:'読んだ位置',total:'総ページ数',statuses:{owned_unread:'所持・未読',want:'読みたい',active:'読書中',completed:'読了',paused:'保留',dropped:'読むのをやめた'}},
  manga:{creator:'作者',creatorPlaceholder:'作者名',unit:'巻',current:'読んだ巻',total:'既刊・全巻',statuses:{owned_unread:'所持・未読',want:'読みたい',active:'読書中',completed:'既刊読了',paused:'保留',dropped:'読むのをやめた'}},
  movie:{creator:'監督',creatorPlaceholder:'監督名',unit:'分',current:'鑑賞位置',total:'上映時間',statuses:{owned_unread:'所持・未読',want:'見たい',active:'鑑賞中',completed:'鑑賞済み',paused:'保留',dropped:'見るのをやめた'}},
  anime:{creator:'監督・制作',creatorPlaceholder:'監督名・制作会社',unit:'話',current:'見た話数',total:'全話数',statuses:{owned_unread:'所持・未読',want:'見たい',active:'視聴中',completed:'視聴済み',paused:'保留',dropped:'見るのをやめた'}},
  drama:{creator:'監督・制作',creatorPlaceholder:'監督名・制作会社',unit:'話',current:'見た話数',total:'全話数',statuses:{owned_unread:'所持・未読',want:'見たい',active:'視聴中',completed:'視聴済み',paused:'保留',dropped:'見るのをやめた'}},
  other:{creator:'作者・制作者',creatorPlaceholder:'作者・制作者名',unit:'件',current:'現在位置',total:'全体',statuses:STATUS_LABELS}
};

const state = {
  me:null, home:null, works:[], selectedId:null, selected:null, page:1, hasMore:false,
  filters:{q:'',type:'',status:'',rating_min:'',label:'',has_notes:false,sort:'updated_desc'},
  view:'home', loading:false, quickEditOpen:false, admin:{users:[],security:[]}
};

const $ = (s,root=document)=>root.querySelector(s);
const $$ = (s,root=document)=>Array.from(root.querySelectorAll(s));

function replaceLabelText(label,text,id){
  const control=label?.querySelector('input,select,textarea'); if(!label||!control)return;
  Array.from(label.childNodes).filter(node=>node.nodeType===Node.TEXT_NODE).forEach(node=>node.remove());
  let span=id?document.getElementById(id):null;
  if(!span){span=document.createElement('span');if(id)span.id=id;label.insertBefore(span,control);}
  span.textContent=text;
}

function addRequiredMark(label){
  const control=label?.querySelector('input,select,textarea'); if(!label||!control||label.querySelector('.required-mark'))return;
  const mark=document.createElement('span');mark.className='required-mark';mark.textContent='必須';label.insertBefore(mark,control);
}

function enhanceWorkFormMarkup(){
  if(!document.querySelector('link[href="/v02.css"]')){
    const link=document.createElement('link');link.rel='stylesheet';link.href='/v02.css';document.head.append(link);
  }
  const form=$('#workForm'); if(!form||form.dataset.enhanced==='true')return; form.dataset.enhanced='true';
  const header=$(':scope > header',form);
  if(header&&!$('.dialog-lead',header)){
    const lead=document.createElement('p');lead.className='dialog-lead';lead.textContent='タイトル・種別・状態だけで保存できます。詳細は後から追加できます。';
    header.firstElementChild?.append(lead);
  }
  const notice=document.createElement('div');notice.id='workDraftNotice';notice.className='draft-notice';notice.hidden=true;header?.after(notice);
  addRequiredMark(form.title.closest('label'));addRequiredMark(form.type.closest('label'));addRequiredMark(form.status.closest('label'));
  replaceLabelText(form.creator.closest('label'),'作者・監督','creatorLabelText');
  replaceLabelText(form.progress_current.closest('label'),'現在位置','progressCurrentLabelText');
  replaceLabelText(form.progress_total.closest('label'),'全体','progressTotalLabelText');
  form.progress_current.min='0';form.progress_total.min='0';form.progress_current.inputMode='decimal';form.progress_total.inputMode='decimal';form.release_year.inputMode='numeric';form.unit_label.maxLength=30;
  const details=$('.details-fields',form),inner=$('.details-inner',form);
  if(details){details.querySelector('summary').innerHTML='<span>詳細も追加する</span><small>作者・評価・分類・進捗</small>';}
  if(inner){
    const heading=(text)=>{const h=document.createElement('h3');h.className='form-section-title';h.textContent=text;return h;};
    inner.prepend(heading('作品情報'));
    inner.insertBefore(heading('分類'),form.genre.closest('label'));
    const progressRow=form.progress_current.closest('.form-row');progressRow?.classList.add('progress-fields');
    if(progressRow)inner.insertBefore(heading('進捗'),progressRow);
  }
  const footer=$(':scope > footer',form);
  if(footer){footer.classList.add('dialog-actions');const buttons=Array.from(footer.children);const hint=document.createElement('span');hint.className='shortcut-hint';hint.textContent='Ctrl / ⌘ + Enterで保存';const actions=document.createElement('div');buttons.forEach(button=>actions.append(button));footer.append(hint,actions);}
}
const esc = (v='')=>String(v).replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
const fmtDate = (v)=>v ? new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'short',day:'numeric'}).format(new Date(v)) : '';
const fmtDateTime = (v)=>v ? new Intl.DateTimeFormat('ja-JP',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(v)) : '';
const stars = (rating)=> rating ? `★ ${Number(rating).toFixed(1)}` : '未評価';
const mediaConfig = (type)=>MEDIA_CONFIG[type]||MEDIA_CONFIG.other;
const statusLabel = (type,status)=>mediaConfig(type).statuses[status]||STATUS_LABELS[status]||status;

async function api(path, options={}){
  const method = options.method || 'GET';
  const headers = new Headers(options.headers || {});
  if(!['GET','HEAD'].includes(method)) headers.set('X-App-Request','sakuhin-log');
  if(options.body && !headers.has('Content-Type')) headers.set('Content-Type','application/json');
  const response = await fetch(path,{...options,method,headers});
  const type = response.headers.get('content-type') || '';
  if(!response.ok){
    let data={};
    if(type.includes('application/json')) data=await response.json().catch(()=>({}));
    const error = new Error(data?.error?.message || `エラー ${response.status}`);
    error.status=response.status; error.code=data?.error?.code; error.details=data?.error?.details;
    if(response.status===401){ saveOpenDraft(); toast('ログイン状態を確認できません。再読み込みします。','error'); setTimeout(()=>location.reload(),1000); }
    throw error;
  }
  if(type.includes('application/json')) return response.json();
  return response;
}

function toast(message,type='success'){
  const el=document.createElement('div'); el.className=`toast ${type==='error'?'error':''}`; el.textContent=message;
  $('#toastRegion').append(el); setTimeout(()=>el.remove(),4200);
}

function setView(view){
  state.view=view; $('#app').dataset.view=view==='library'?'library':'home';
  $('#homeView').hidden=view!=='home'; $('#settingsView').hidden=view!=='settings'; $('#adminView').hidden=view!=='admin';
  if(view==='library') $('#main').focus({preventScroll:true});
  window.scrollTo({top:0,behavior:'smooth'});
}

async function init(){
  try{
    const meData=await api('/api/me'); state.me=meData.user;
    $('#avatarInitial').textContent=(state.me.display_name || state.me.email || 'U').slice(0,1).toUpperCase();
    $('#adminButton').hidden=!['owner','admin'].includes(state.me.role);
    renderAccount();
    await Promise.all([loadHome(),loadWorks(true)]);
    bindEvents();
  }catch(error){ toast(error.message,'error'); }
}

async function loadHome(){ state.home=await api('/api/home'); renderHome(); }

function renderHome(){
  const h=state.home||{};
  $('#readingStrip').innerHTML=(h.reading||[]).length ? h.reading.map(work=>`
    <button class="reading-card" data-work-id="${esc(work.id)}">
      <div class="type-status"><span class="type-pill">${TYPE_LABELS[work.type]}</span><span>${statusLabel(work.type,work.status)}</span><span class="rating">${stars(work.rating)}</span></div>
      <h3>${esc(work.title)}</h3><div class="creator">${esc(work.creator||'')}</div>
      <p class="short-note">${esc(work.short_note||'一言メモはまだありません。')}</p>
      ${work.progress_total?`<div class="progress-track" aria-label="進捗"><span style="width:${Math.min(100,Math.max(0,(work.progress_current||0)/work.progress_total*100))}%"></span></div>`:''}
    </button>`).join('') : `<div class="empty-state">現在読書中の本はありません。<br><button class="text-button" data-action="open-work-dialog">本を追加する</button></div>`;
  $('#recentNotes').innerHTML=(h.recentNotes||[]).length ? h.recentNotes.map(n=>`
    <button class="note-item" data-work-id="${esc(n.work_id)}"><time>${fmtDate(n.updated_at)}</time><strong>${esc(n.title)}</strong><p>${esc(n.content).slice(0,150)}</p></button>`).join('') : '<div class="empty-state">読書メモはまだありません。</div>';
  $('#recentOther').innerHTML=(h.recentOther||[]).length ? h.recentOther.map(w=>`
    <button class="compact-item" data-work-id="${esc(w.id)}"><span class="type-pill">${TYPE_LABELS[w.type]}</span><span><strong>${esc(w.title)}</strong><p>${esc(w.short_note||statusLabel(w.type,w.status))}</p></span><time>${fmtDate(w.updated_at)}</time></button>`).join('') : '<div class="empty-state">映画・漫画・アニメの記録はまだありません。</div>';
  const s=h.stats||{};
  $('#statsBar').innerHTML=[['全作品',s.total||0],['読了した本',s.completed_books||0],['進行中',s.active_count||0],['停止・中断',s.stopped_count||0]].map(([label,value])=>`<div class="stat"><strong>${value}</strong><span>${label}</span></div>`).join('');
  const banner=$('#securityBanner');
  if(h.openSecurityCount>0){ banner.hidden=false; banner.innerHTML=`<strong>要確認のセキュリティイベントが ${h.openSecurityCount} 件あります。</strong> <button class="text-button" data-action="open-admin">確認する →</button>`; }
  else banner.hidden=true;
}

function queryString(){
  const p=new URLSearchParams();
  Object.entries(state.filters).forEach(([k,v])=>{ if(v!=='' && v!==false) p.set(k,String(v)); });
  p.set('page',String(state.page)); p.set('limit','30'); return p.toString();
}

async function loadWorks(reset=false){
  if(state.loading) return; state.loading=true;
  if(reset){ state.page=1; state.works=[]; }
  try{
    const data=await api(`/api/works?${queryString()}`);
    state.works=reset?data.items:[...state.works,...data.items]; state.hasMore=data.hasMore;
    renderWorks();
  }catch(e){ toast(e.message,'error'); }
  finally{ state.loading=false; }
}

function renderWorks(){
  const list=$('#workList');
  list.innerHTML=state.works.length?state.works.map(work=>`
    <button class="work-card" data-work-id="${esc(work.id)}" aria-current="${state.selectedId===work.id}">
      <div class="work-card-top"><div class="type-status"><span class="type-pill">${TYPE_LABELS[work.type]}</span><span>${statusLabel(work.type,work.status)}</span></div><span class="rating">${stars(work.rating)}</span></div>
      <h3>${esc(work.title)}</h3><div class="creator">${esc(work.creator||'')}</div>
      ${work.short_note?`<p class="short-note">${esc(work.short_note)}</p>`:''}
      <div class="label-row">${[...(work.labels?.genre||[]),...(work.labels?.theme||[]),...(work.labels?.tag||[])].slice(0,6).map(x=>`<span class="label-chip">${esc(x)}</span>`).join('')}</div>
    </button>`).join(''):'<div class="empty-state">条件に合う作品がありません。<br>検索条件を減らすか、新しい作品を追加してください。</div>';
  $('#resultSummary').textContent=`${state.works.length}件を表示`;
  $('#loadMore').hidden=!state.hasMore;
  renderActiveFilters();
}

function renderActiveFilters(){
  const chips=[];
  if(state.filters.q) chips.push(`検索「${state.filters.q}」`);
  if(state.filters.type) chips.push(TYPE_LABELS[state.filters.type]);
  if(state.filters.status) chips.push(STATUS_LABELS[state.filters.status]);
  if(state.filters.rating_min) chips.push(`評価${state.filters.rating_min}以上`);
  if(state.filters.label) chips.push(`分類：${state.filters.label}`);
  if(state.filters.has_notes) chips.push('メモあり');
  $('#activeFilters').innerHTML=chips.map(c=>`<span class="filter-chip">${esc(c)}</span>`).join('');
}

async function openDetail(id){
  state.selectedId=id; state.quickEditOpen=false; renderWorks();
  try{ state.selected=await api(`/api/works/${encodeURIComponent(id)}`); renderDetail(); $('#detailPanel').classList.add('is-open'); }
  catch(e){ toast(e.message,'error'); }
}

function quickEditMarkup(w){
  if(!state.quickEditOpen) return '';
  const config=mediaConfig(w.type);
  return `<section class="quick-edit-card" aria-labelledby="quickEditTitle">
    <div class="quick-edit-heading"><div><p class="eyebrow">QUICK EDIT</p><h3 id="quickEditTitle">よく変える項目</h3></div><button class="icon-button" type="button" data-action="toggle-quick-edit" aria-label="クイック編集を閉じる">×</button></div>
    <form id="quickEditForm" class="quick-edit-form">
      <input type="hidden" name="version" value="${Number(w.version)}">
      <div class="quick-edit-grid">
        <label class="field-label">状態<select name="status">${Object.entries(config.statuses).map(([value,label])=>`<option value="${value}" ${w.status===value?'selected':''}>${esc(label)}</option>`).join('')}</select></label>
        <label class="field-label">評価<select name="rating"><option value="">未評価</option>${[5,4.5,4,3.5,3,2.5,2,1.5,1,.5].map(value=>`<option value="${value}" ${Number(w.rating)===value?'selected':''}>${value}</option>`).join('')}</select></label>
      </div>
      <label class="field-label">一言メモ<textarea name="short_note" maxlength="280" rows="4">${esc(w.short_note||'')}</textarea><small><span data-quick-counter>${(w.short_note||'').length}</span>/280</small></label>
      <div class="quick-edit-grid progress-grid">
        <label class="field-label">${esc(config.current)}<input name="progress_current" type="number" min="0" step="0.1" value="${w.progress_current??''}"></label>
        <label class="field-label">${esc(config.total)}<input name="progress_total" type="number" min="0" step="0.1" value="${w.progress_total??''}"></label>
        <label class="field-label">単位<input name="unit_label" maxlength="30" value="${esc(w.unit_label||config.unit)}"></label>
      </div>
      <div class="form-error" role="alert"></div>
      <div class="quick-edit-actions"><button class="ghost-button" type="button" data-action="edit-work">すべて編集</button><button class="primary-button" type="submit">変更を保存</button></div>
    </form>
  </section>`;
}

function renderDetail(){
  const d=state.selected; if(!d) return;
  const w=d.work; const labels=[...(w.labels?.genre||[]),...(w.labels?.theme||[]),...(w.labels?.tag||[])];
  $('#detailPanel').innerHTML=`
    <div class="detail-header">
      <div class="type-status"><span class="type-pill">${TYPE_LABELS[w.type]}</span><span>${statusLabel(w.type,w.status)}</span><span class="rating">${stars(w.rating)}</span></div>
      <h2>${esc(w.title)}</h2><div class="creator">${esc(w.creator||'')}</div>
      <div class="detail-actions"><button class="primary-button" data-action="add-note">メモ</button><button class="ghost-button" data-action="add-experience">体験を追加</button><button class="ghost-button desktop-only" data-action="toggle-quick-edit">${state.quickEditOpen?'編集を閉じる':'クイック編集'}</button><button class="ghost-button" data-action="edit-work">すべて編集</button><button class="ghost-button" data-action="close-detail">閉じる</button></div>
    </div>
    ${quickEditMarkup(w)}
    ${w.short_note?`<section class="detail-section"><h3>一言メモ</h3><div class="detail-short">${esc(w.short_note)}</div></section>`:''}
    <section class="detail-section"><h3>分類</h3><div class="label-row">${labels.length?labels.map(x=>`<span class="label-chip">${esc(x)}</span>`).join(''):'<span class="muted">未設定</span>'}</div></section>
    <section class="detail-section"><h3>体験履歴</h3>${d.experiences.length?d.experiences.map(x=>`<div class="timeline-item"><strong>${x.sequence}回目 ${x.completed_at?'・完了':''}</strong><p>${[x.started_at&&`開始 ${fmtDate(x.started_at)}`,x.completed_at&&`完了 ${fmtDate(x.completed_at)}`,x.rating&&stars(x.rating)].filter(Boolean).join(' / ')}</p>${x.memo?`<p>${esc(x.memo)}</p>`:''}</div>`).join(''):'<p class="muted">まだ体験記録がありません。</p>'}</section>
    <section class="detail-section"><h3>メモ</h3>${d.notes.length?d.notes.map(n=>`<article class="note-block"><header><span>${NOTE_LABELS[n.note_type]||n.note_type}${n.position?`・${esc(n.position)}`:''}</span><time>${fmtDateTime(n.updated_at)}</time></header><p>${esc(n.content)}</p></article>`).join(''):'<p class="muted">メモはまだありません。</p>'}</section>
    <section class="detail-section"><h3>進捗・情報</h3><p class="muted">${w.progress_current!=null?`${w.progress_current}${w.progress_total?` / ${w.progress_total}`:''} ${esc(w.unit_label||'')}`:'進捗未設定'}${w.release_year?`<br>発表年 ${w.release_year}`:''}</p></section>
    <section class="detail-section"><div class="danger-zone"><strong>作品を削除</strong><p class="muted">初期版では復元可能なソフト削除。</p><button class="ghost-button" data-action="delete-work">削除する</button></div></section>`;
}

function serializeForm(form){
  const data={}; new FormData(form).forEach((value,key)=>data[key]=String(value)); return data;
}

function readDraft(){
  const raw=localStorage.getItem(DRAFT_KEY); if(!raw) return null;
  try{ const parsed=JSON.parse(raw); return parsed?.data ? parsed : {saved_at:null,data:parsed}; }catch{return null;}
}

function setDraftNotice(draft){
  const notice=$('#workDraftNotice');
  if(!draft){ notice.hidden=true; notice.innerHTML=''; return; }
  notice.hidden=false;
  notice.innerHTML=`<span><strong>前回の入力を復元しました。</strong>${draft.saved_at?` <small>${fmtDateTime(draft.saved_at)}</small>`:''}</span><button type="button" class="text-button" data-action="discard-work-draft">破棄</button>`;
}

function syncWorkFormMedia(form,{forceUnit=false}={}){
  const config=mediaConfig(form.type.value);
  $('#creatorLabelText').textContent=config.creator;
  form.creator.placeholder=config.creatorPlaceholder;
  $('#progressCurrentLabelText').textContent=config.current;
  $('#progressTotalLabelText').textContent=config.total;
  form.unit_label.placeholder=config.unit;
  const previousAuto=form.dataset.autoUnit||'';
  if(forceUnit || !form.unit_label.value || form.unit_label.value===previousAuto) form.unit_label.value=config.unit;
  form.dataset.autoUnit=config.unit;
  Array.from(form.status.options).forEach(option=>{ option.textContent=config.statuses[option.value]||STATUS_LABELS[option.value]; });
}

function openWorkDialog(edit=false){
  const dialog=$('#workDialog'), form=$('#workForm');
  form.reset(); form.id.value=''; form.version.value=''; form.dataset.mode=edit?'edit':'create'; form.dataset.baseline=''; $('#workFormError').textContent='';
  $$('#workForm [aria-invalid="true"]').forEach(el=>el.removeAttribute('aria-invalid'));
  $('#workDialogTitle').textContent=edit?'作品を編集':'作品を追加';
  setDraftNotice(null);
  if(edit && state.selected){
    const w=state.selected.work;
    form.id.value=w.id; form.version.value=w.version; form.title.value=w.title; form.type.value=w.type; form.status.value=w.status; form.short_note.value=w.short_note||''; form.creator.value=w.creator||''; form.release_year.value=w.release_year||''; form.rating.value=w.rating||''; form.genre.value=(w.labels?.genre||[]).join(', '); form.theme.value=(w.labels?.theme||[]).join(', '); form.tag.value=(w.labels?.tag||[]).join(', '); form.progress_current.value=w.progress_current??''; form.progress_total.value=w.progress_total??''; form.unit_label.value=w.unit_label||''; $('.details-fields',form).open=true;
    syncWorkFormMedia(form);
    form.dataset.baseline=JSON.stringify(serializeForm(form));
  }else{
    const draft=readDraft();
    if(draft){ Object.entries(draft.data).forEach(([key,value])=>{ if(form.elements[key]) form.elements[key].value=value; }); setDraftNotice(draft); }
    syncWorkFormMedia(form,{forceUnit:!draft});
    const hasDetail=['creator','release_year','rating','genre','theme','tag','progress_current','progress_total'].some(name=>form.elements[name].value);
    $('.details-fields',form).open=Boolean(hasDetail);
  }
  $('[data-counter="short_note"]').textContent=form.short_note.value.length;
  dialog.showModal(); setTimeout(()=>form.title.focus(),50);
}

function formLabels(value){ return value.split(/[、,]/).map(v=>v.trim()).filter(Boolean); }
function nullableNumber(value){ return value===''?null:Number(value); }

function clearValidation(form){
  $$('.form-error',form).forEach(el=>el.textContent='');
  $$('[aria-invalid="true"]',form).forEach(el=>el.removeAttribute('aria-invalid'));
}

function validateProgress(form){
  const current=nullableNumber(form.progress_current.value), total=nullableNumber(form.progress_total.value);
  if(current!==null && current<0) return {field:'progress_current',message:'進捗は0以上で入力してください。'};
  if(total!==null && total<0) return {field:'progress_total',message:'全体は0以上で入力してください。'};
  if(current!==null && total!==null && current>total) return {field:'progress_current',message:'現在の進捗は全体以下にしてください。'};
  return null;
}

function validateWorkForm(form){
  clearValidation(form);
  if(!form.title.value.trim()) return {field:'title',message:'タイトルは必須です。'};
  const progressError=validateProgress(form); if(progressError) return progressError;
  return null;
}

function showValidation(form,error){
  const output=$('.form-error',form); if(output) output.textContent=error.message;
  const field=form.elements[error.field]; if(field){ field.setAttribute('aria-invalid','true'); field.focus(); }
}

function buildWorkPayload(form){
  return {title:form.title.value.trim(),type:form.type.value,status:form.status.value,short_note:form.short_note.value.trim(),creator:form.creator.value.trim()||null,release_year:nullableNumber(form.release_year.value),rating:nullableNumber(form.rating.value),progress_current:nullableNumber(form.progress_current.value),progress_total:nullableNumber(form.progress_total.value),unit_label:form.unit_label.value.trim()||null,labels:{genre:formLabels(form.genre.value),theme:formLabels(form.theme.value),tag:formLabels(form.tag.value)}};
}

function setBusy(button,busy,busyLabel='保存中…'){
  if(!button) return;
  if(busy){ button.dataset.label=button.textContent; button.textContent=busyLabel; button.disabled=true; button.setAttribute('aria-busy','true'); }
  else{ button.textContent=button.dataset.label||button.textContent; button.disabled=false; button.removeAttribute('aria-busy'); }
}

async function submitWork(form){
  const validation=validateWorkForm(form); if(validation){showValidation(form,validation);return;}
  const payload=buildWorkPayload(form); const button=$('[type="submit"]',form); setBusy(button,true);
  try{
    let data;
    if(form.id.value){ payload.version=Number(form.version.value); data=await api(`/api/works/${encodeURIComponent(form.id.value)}`,{method:'PATCH',body:JSON.stringify(payload)}); }
    else data=await api('/api/works',{method:'POST',body:JSON.stringify(payload)});
    localStorage.removeItem(DRAFT_KEY); form.dataset.baseline=JSON.stringify(serializeForm(form)); $('#workDialog').close(); toast(form.id.value?'更新しました。':'追加しました。');
    state.selected=data; state.selectedId=data.work.id; state.quickEditOpen=false;
    await Promise.all([loadHome(),loadWorks(true)]); renderDetail(); $('#detailPanel').classList.add('is-open'); setView('library');
  }catch(e){ showValidation(form,{field:e.details?.field||'',message:e.message}); }
  finally{setBusy(button,false);}
}

function saveOpenDraft(){
  const dialog=$('#workDialog'); if(!dialog?.open) return; const form=$('#workForm'); if(form.id.value) return;
  localStorage.setItem(DRAFT_KEY,JSON.stringify({saved_at:new Date().toISOString(),data:serializeForm(form)}));
}

function requestCloseDialog(dialog){
  if(dialog.id!=='workDialog'){dialog.close();return;}
  const form=$('#workForm');
  if(form.id.value){
    const dirty=form.dataset.baseline && form.dataset.baseline!==JSON.stringify(serializeForm(form));
    if(dirty && !confirm('未保存の変更があります。破棄して閉じますか？')) return;
  }else saveOpenDraft();
  dialog.close();
}

function discardWorkDraft(){
  localStorage.removeItem(DRAFT_KEY); const form=$('#workForm'); form.reset(); form.dataset.mode='create'; syncWorkFormMedia(form,{forceUnit:true}); $('.details-fields',form).open=false; $('[data-counter="short_note"]').textContent='0'; setDraftNotice(null); toast('下書きを破棄しました。'); form.title.focus();
}

async function submitQuickEdit(form){
  clearValidation(form); const progressError=validateProgress(form); if(progressError){showValidation(form,progressError);return;}
  const payload={version:Number(form.version.value),status:form.status.value,rating:nullableNumber(form.rating.value),short_note:form.short_note.value.trim(),progress_current:nullableNumber(form.progress_current.value),progress_total:nullableNumber(form.progress_total.value),unit_label:form.unit_label.value.trim()||null};
  const button=$('[type="submit"]',form); setBusy(button,true);
  try{
    const data=await api(`/api/works/${encodeURIComponent(state.selectedId)}`,{method:'PATCH',body:JSON.stringify(payload)});
    state.selected=data; state.quickEditOpen=false; toast('クイック編集を保存しました。');
    await Promise.all([loadHome(),loadWorks(true)]); renderDetail();
  }catch(e){showValidation(form,{field:e.details?.field||'',message:e.message});}
  finally{setBusy(button,false);}
}

function openNoteDialog(){ if(!state.selectedId)return; const f=$('#noteForm'); f.reset(); f.work_id.value=state.selectedId; $('.form-error',f).textContent=''; $('#noteDialog').showModal(); setTimeout(()=>f.content.focus(),50); }
function openExperienceDialog(){ if(!state.selectedId)return; const f=$('#experienceForm'); f.reset(); f.work_id.value=state.selectedId; f.started_at.value=new Date().toISOString().slice(0,10); $('.form-error',f).textContent=''; $('#experienceDialog').showModal(); }

async function submitNote(form){
  try{ await api(`/api/works/${encodeURIComponent(form.work_id.value)}/notes`,{method:'POST',body:JSON.stringify({note_type:form.note_type.value,content:form.content.value,position:form.position.value||null})}); $('#noteDialog').close(); toast('メモを保存しました。'); await Promise.all([openDetail(form.work_id.value),loadHome(),loadWorks(true)]); }
  catch(e){ $('.form-error',form).textContent=e.message; }
}
async function submitExperience(form){
  const progressError=validateProgress(form); if(progressError){showValidation(form,progressError);return;}
  const payload={started_at:form.started_at.value||null,completed_at:form.completed_at.value||null,rating:nullableNumber(form.rating.value),progress_current:nullableNumber(form.progress_current.value),progress_total:nullableNumber(form.progress_total.value),memo:form.memo.value||null};
  try{ await api(`/api/works/${encodeURIComponent(form.work_id.value)}/experiences`,{method:'POST',body:JSON.stringify(payload)}); $('#experienceDialog').close(); toast('体験を追加しました。'); await Promise.all([openDetail(form.work_id.value),loadHome(),loadWorks(true)]); }
  catch(e){ $('.form-error',form).textContent=e.message; }
}

async function deleteSelected(){
  if(!state.selected || !confirm(`「${state.selected.work.title}」を削除しますか？`)) return;
  try{ await api(`/api/works/${encodeURIComponent(state.selectedId)}`,{method:'DELETE'}); toast('削除しました。'); state.selected=null; state.selectedId=null; state.quickEditOpen=false; $('#detailPanel').classList.remove('is-open'); $('#detailPanel').innerHTML='<div class="detail-empty"><strong>作品を選択</strong></div>'; await Promise.all([loadHome(),loadWorks(true)]); }
  catch(e){toast(e.message,'error');}
}

function renderAccount(){
  $('#accountInfo').innerHTML=`<dt>メール</dt><dd>${esc(state.me.email)}</dd><dt>権限</dt><dd>${esc(state.me.role)}</dd><dt>状態</dt><dd>${esc(state.me.status)}</dd><dt>認証</dt><dd>${state.me.is_dev?'ローカル開発用':'Cloudflare Access'}</dd>`;
}

async function exportFile(format){
  try{ const response=await api(`/api/export?format=${format}`); const blob=await response.blob(); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`sakuhin-log-${new Date().toISOString().slice(0,10)}.${format==='markdown'?'md':format}`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); toast(`${format.toUpperCase()}を書き出しました。`); }
  catch(e){toast(e.message,'error');}
}

async function loadAdmin(){
  if(!['owner','admin'].includes(state.me.role)) return;
  try{ const [users,security]=await Promise.all([api('/api/admin/users'),api('/api/admin/security-events?status=open')]); state.admin.users=users.items; state.admin.security=security.items; renderAdmin(); }
  catch(e){toast(e.message,'error');}
}

function renderAdmin(){
  $('#userTable').innerHTML=`<table class="admin-table"><thead><tr><th>ユーザー</th><th>権限</th><th>状態</th><th>最終ログイン</th><th>操作</th></tr></thead><tbody>${state.admin.users.map(u=>`<tr><td><strong>${esc(u.display_name||u.email)}</strong><br><span class="muted">${esc(u.email)}</span></td><td>${esc(u.role)}</td><td>${esc(u.status)}${u.suspended_until?`<br><small>${fmtDateTime(u.suspended_until)}まで</small>`:''}</td><td>${fmtDateTime(u.last_login_at)||'—'}</td><td><div class="user-actions">${u.role==='owner'?'<span class="muted">保護対象</span>':u.status==='blocked'||u.status==='suspended'?`<button data-admin-action="unblock" data-user-id="${u.id}" data-email="${esc(u.email)}">解除</button>`:`<button data-admin-action="suspend" data-user-id="${u.id}" data-email="${esc(u.email)}">一時停止</button><button class="danger-link" data-admin-action="block" data-user-id="${u.id}" data-email="${esc(u.email)}">ブロック</button><button data-admin-action="revoke" data-user-id="${u.id}" data-email="${esc(u.email)}">セッション失効</button>`}</div></td></tr>`).join('')}</tbody></table>`;
  $('#securityEvents').innerHTML=state.admin.security.length?state.admin.security.map(e=>`<article class="security-event"><span class="risk ${esc(e.risk)}">${esc(e.risk)}</span><div><strong>${esc(e.event_type)}</strong><p>${esc(e.email||'未登録ユーザー')} / ${esc(e.country||'国不明')} / ${esc(e.ip_mask||'IP不明')}</p><small>${fmtDateTime(e.created_at)}</small></div><button class="ghost-button" data-security-resolve="${e.id}">確認済み</button></article>`).join(''):'<div class="empty-state">未確認イベントはありません。</div>';
}

function openDanger(action,userId,email){
  const f=$('#dangerForm'); f.reset(); f.action.value=action; f.user_id.value=userId; f.dataset.email=email;
  $('.email-confirm',f).hidden=action!=='block'; $('.suspend-until',f).hidden=action!=='suspend';
  const title={block:'ユーザーをブロック',suspend:'ユーザーを一時停止',unblock:'利用を再開'}[action]; $('#dangerTitle').textContent=title;
  $('#dangerDescription').textContent=action==='block'?'次のAPI通信から即時拒否します。作品・メモは削除しません。':action==='suspend'?'期限まで全APIを停止します。作品・メモは保持します。':'利用を再開し、過去の作品・メモを再表示します。';
  $('.form-error',f).textContent=''; $('#dangerDialog').showModal();
}

async function submitDanger(form){
  const action=form.action.value,id=form.user_id.value;
  const payload={reason:form.reason.value}; if(action==='block')payload.email_confirm=form.email_confirm.value; if(action==='suspend')payload.suspended_until=form.suspended_until.value?new Date(form.suspended_until.value).toISOString():null;
  try{ const result=await api(`/api/admin/users/${encodeURIComponent(id)}/${action}`,{method:'POST',body:JSON.stringify(payload)}); $('#dangerDialog').close(); toast(result.session_revoke?.attempted===false?'アプリ内の利用を停止しました。Cloudflareセッション失効は未設定です。':'操作を完了しました。'); await Promise.all([loadAdmin(),loadHome()]); }
  catch(e){$('.form-error',form).textContent=e.message;}
}

async function revokeUser(id){
  if(!confirm('このユーザーを全端末からログアウトさせますか？'))return;
  try{await api(`/api/admin/users/${encodeURIComponent(id)}/revoke`,{method:'POST',body:'{}'});toast('セッションを失効しました。');await loadAdmin();}catch(e){toast(e.message,'error');}
}

function applyFiltersFromControls(){
  state.filters.type=$('#filterType').value; state.filters.status=$('#filterStatus').value; state.filters.rating_min=$('#filterRating').value; state.filters.label=$('#filterLabel').value.trim(); state.filters.has_notes=$('#filterNotes').checked; state.filters.sort=$('#sortSelect').value; loadWorks(true);
}

function applyPreset(name){
  state.filters={...state.filters,type:'',status:'',rating_min:'',label:'',has_notes:false};
  if(name==='reading'){state.filters.type='book';state.filters.status='active';}
  if(name==='completed')state.filters.status='completed';
  if(name==='stopped')state.filters.status='paused';
  if(name==='high-rating')state.filters.rating_min='4';
  syncControls(); loadWorks(true); setView('library');
}

function syncControls(){ $('#filterType').value=state.filters.type; $('#filterStatus').value=state.filters.status; $('#filterRating').value=state.filters.rating_min; $('#filterLabel').value=state.filters.label; $('#filterNotes').checked=state.filters.has_notes; $('#sortSelect').value=state.filters.sort; $('#globalSearch').value=state.filters.q; }
function clearFilters(){ state.filters={q:'',type:'',status:'',rating_min:'',label:'',has_notes:false,sort:'updated_desc'}; syncControls(); loadWorks(true); }

function bindEvents(){
  let timer;
  $('#globalSearch').addEventListener('input',e=>{ clearTimeout(timer); state.filters.q=e.target.value; timer=setTimeout(()=>{setView('library');loadWorks(true);},220); });
  ['#filterType','#filterStatus','#filterRating','#filterNotes','#sortSelect'].forEach(sel=>$(sel).addEventListener('change',applyFiltersFromControls));
  $('#filterLabel').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(applyFiltersFromControls,220);});
  $('#loadMore').addEventListener('click',()=>{state.page++;loadWorks(false);});
  $('#workForm').addEventListener('submit',e=>{e.preventDefault();submitWork(e.currentTarget);});
  $('#workForm').addEventListener('input',e=>{ if(e.target.name==='short_note')$('[data-counter="short_note"]').textContent=e.target.value.length; if(e.target.name==='type')syncWorkFormMedia(e.currentTarget); saveOpenDraft(); });
  $('#noteForm').addEventListener('submit',e=>{e.preventDefault();submitNote(e.currentTarget);});
  $('#experienceForm').addEventListener('submit',e=>{e.preventDefault();submitExperience(e.currentTarget);});
  $('#dangerForm').addEventListener('submit',e=>{e.preventDefault();submitDanger(e.currentTarget);});
  $('#inviteForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;try{await api('/api/admin/invitations',{method:'POST',body:JSON.stringify({email:f.email.value,role:f.role.value})});f.reset();toast('招待を作成しました。');await loadAdmin();}catch(err){toast(err.message,'error');}});
  $('#workDialog').addEventListener('cancel',e=>{e.preventDefault();requestCloseDialog(e.currentTarget);});
  document.addEventListener('submit',e=>{ if(e.target.id==='quickEditForm'){e.preventDefault();submitQuickEdit(e.target);} });
  document.addEventListener('input',e=>{if(e.target.closest('#quickEditForm')&&e.target.name==='short_note'){const counter=$('[data-quick-counter]',e.target.closest('#quickEditForm'));if(counter)counter.textContent=e.target.value.length;}});
  document.addEventListener('click',async e=>{
    const action=e.target.closest('[data-action]')?.dataset.action;
    const workId=e.target.closest('[data-work-id]')?.dataset.workId;
    if(workId){setView('library');await openDetail(workId);return;}
    if(action==='go-home'){setView('home');await loadHome();}
    if(action==='open-work-dialog')openWorkDialog(false);
    if(action==='close-dialog')requestCloseDialog(e.target.closest('dialog'));
    if(action==='discard-work-draft')discardWorkDraft();
    if(action==='edit-work')openWorkDialog(true);
    if(action==='toggle-quick-edit'){state.quickEditOpen=!state.quickEditOpen;renderDetail();if(state.quickEditOpen)setTimeout(()=>$('#quickEditForm select[name="status"]')?.focus(),20);}
    if(action==='add-note')openNoteDialog();
    if(action==='add-experience')openExperienceDialog();
    if(action==='delete-work')deleteSelected();
    if(action==='close-detail'){state.quickEditOpen=false;$('#detailPanel').classList.remove('is-open');}
    if(action==='open-settings')setView('settings');
    if(action==='open-admin'){setView('admin');await loadAdmin();}
    if(action==='refresh-admin')loadAdmin();
    if(action==='clear-filters')clearFilters();
    if(action==='toggle-filters')$('.filter-panel').classList.toggle('is-open');
    if(action==='show-reading')applyPreset('reading');
    const preset=e.target.closest('[data-preset]')?.dataset.preset;if(preset)applyPreset(preset);
    const exportFormat=e.target.closest('[data-export]')?.dataset.export;if(exportFormat)exportFile(exportFormat);
    const mobile=e.target.closest('[data-mobile-view]')?.dataset.mobileView;
    if(mobile==='home')setView('home'); if(mobile==='library'){setView('library');$('#globalSearch').focus();} if(mobile==='records'){state.filters.status='completed';syncControls();setView('library');loadWorks(true);} if(mobile==='settings')setView('settings');
    const adminAction=e.target.closest('[data-admin-action]');
    if(adminAction){const {adminAction:act,userId,email}=adminAction.dataset;if(act==='revoke')revokeUser(userId);else openDanger(act,userId,email);}
    const resolve=e.target.closest('[data-security-resolve]')?.dataset.securityResolve;
    if(resolve){try{await api(`/api/admin/security-events/${encodeURIComponent(resolve)}/resolve`,{method:'POST',body:JSON.stringify({status:'resolved'})});toast('確認済みにしました。');await Promise.all([loadAdmin(),loadHome()]);}catch(err){toast(err.message,'error');}}
  });
  document.addEventListener('keydown',e=>{
    const typing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#globalSearch').focus();}
    if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){
      const form=document.activeElement?.closest('form');
      if(form&&['workForm','quickEditForm'].includes(form.id)){e.preventDefault();form.requestSubmit();}
    }
    if(!typing&&!e.metaKey&&!e.ctrlKey&&e.key.toLowerCase()==='n'){e.preventDefault();openWorkDialog(false);}
    if(!typing&&!e.metaKey&&!e.ctrlKey&&e.key.toLowerCase()==='e'&&state.selected){e.preventDefault();if(matchMedia('(min-width:1200px)').matches){state.quickEditOpen=!state.quickEditOpen;renderDetail();}else openWorkDialog(true);}
    if(e.key==='Escape'&&!$$('dialog[open]').length){state.quickEditOpen=false;$('#detailPanel').classList.remove('is-open');}
  });
  window.addEventListener('beforeunload',saveOpenDraft);
}

enhanceWorkFormMarkup();
init();
