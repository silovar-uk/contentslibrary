const TYPE_LABELS = {book:'本',manga:'漫画',movie:'映画',anime:'アニメ',drama:'ドラマ',other:'その他'};
const STATUS_LABELS = {want:'読みたい・見たい',active:'進行中',completed:'完了',paused:'一時停止',dropped:'中断'};
const NOTE_LABELS = {quick:'一言',summary:'要約',impression:'印象',quote:'引用',idea:'自分の考え',connection:'接続',progress:'途中メモ'};
const DRAFT_KEY = 'sakuhin-log-work-draft-v1';

const state = {
  me:null, home:null, works:[], selectedId:null, selected:null, page:1, hasMore:false,
  filters:{q:'',type:'',status:'',rating_min:'',label:'',has_notes:false,sort:'updated_desc'},
  view:'home', loading:false, admin:{users:[],security:[]}
};

const $ = (s,root=document)=>root.querySelector(s);
const $$ = (s,root=document)=>Array.from(root.querySelectorAll(s));
const esc = (v='')=>String(v).replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
const fmtDate = (v)=>v ? new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'short',day:'numeric'}).format(new Date(v)) : '';
const fmtDateTime = (v)=>v ? new Intl.DateTimeFormat('ja-JP',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(v)) : '';
const stars = (rating)=> rating ? `★ ${Number(rating).toFixed(1)}` : '未評価';
const roleRank = {viewer:0,member:1,admin:2,owner:3};

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

async function loadHome(){
  state.home=await api('/api/home'); renderHome();
}

function renderHome(){
  const h=state.home||{};
  $('#readingStrip').innerHTML=(h.reading||[]).length ? h.reading.map(work=>`
    <button class="reading-card" data-work-id="${esc(work.id)}">
      <div class="type-status"><span class="type-pill">${TYPE_LABELS[work.type]}</span><span>${STATUS_LABELS[work.status]}</span><span class="rating">${stars(work.rating)}</span></div>
      <h3>${esc(work.title)}</h3><div class="creator">${esc(work.creator||'')}</div>
      <p class="short-note">${esc(work.short_note||'一言メモはまだありません。')}</p>
      ${work.progress_total?`<div class="progress-track" aria-label="進捗"><span style="width:${Math.min(100,Math.max(0,(work.progress_current||0)/work.progress_total*100))}%"></span></div>`:''}
    </button>`).join('') : `<div class="empty-state">現在読書中の本はありません。<br><button class="text-button" data-action="open-work-dialog">本を追加する</button></div>`;
  $('#recentNotes').innerHTML=(h.recentNotes||[]).length ? h.recentNotes.map(n=>`
    <button class="note-item" data-work-id="${esc(n.work_id)}"><time>${fmtDate(n.updated_at)}</time><strong>${esc(n.title)}</strong><p>${esc(n.content).slice(0,150)}</p></button>`).join('') : '<div class="empty-state">読書メモはまだありません。</div>';
  $('#recentOther').innerHTML=(h.recentOther||[]).length ? h.recentOther.map(w=>`
    <button class="compact-item" data-work-id="${esc(w.id)}"><span class="type-pill">${TYPE_LABELS[w.type]}</span><span><strong>${esc(w.title)}</strong><p>${esc(w.short_note||STATUS_LABELS[w.status])}</p></span><time>${fmtDate(w.updated_at)}</time></button>`).join('') : '<div class="empty-state">映画・漫画・アニメの記録はまだありません。</div>';
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
      <div class="work-card-top"><div class="type-status"><span class="type-pill">${TYPE_LABELS[work.type]}</span><span>${STATUS_LABELS[work.status]}</span></div><span class="rating">${stars(work.rating)}</span></div>
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
  state.selectedId=id; renderWorks();
  try{ state.selected=await api(`/api/works/${encodeURIComponent(id)}`); renderDetail(); $('#detailPanel').classList.add('is-open'); }
  catch(e){ toast(e.message,'error'); }
}

function renderDetail(){
  const d=state.selected; if(!d) return;
  const w=d.work; const labels=[...(w.labels?.genre||[]),...(w.labels?.theme||[]),...(w.labels?.tag||[])];
  $('#detailPanel').innerHTML=`
    <div class="detail-header">
      <div class="type-status"><span class="type-pill">${TYPE_LABELS[w.type]}</span><span>${STATUS_LABELS[w.status]}</span><span class="rating">${stars(w.rating)}</span></div>
      <h2>${esc(w.title)}</h2><div class="creator">${esc(w.creator||'')}</div>
      <div class="detail-actions"><button class="primary-button" data-action="add-note">メモ</button><button class="ghost-button" data-action="add-experience">体験を追加</button><button class="ghost-button" data-action="edit-work">編集</button><button class="ghost-button" data-action="close-detail">閉じる</button></div>
    </div>
    ${w.short_note?`<section class="detail-section"><h3>一言メモ</h3><div class="detail-short">${esc(w.short_note)}</div></section>`:''}
    <section class="detail-section"><h3>分類</h3><div class="label-row">${labels.length?labels.map(x=>`<span class="label-chip">${esc(x)}</span>`).join(''):'<span class="muted">未設定</span>'}</div></section>
    <section class="detail-section"><h3>体験履歴</h3>${d.experiences.length?d.experiences.map(x=>`<div class="timeline-item"><strong>${x.sequence}回目 ${x.completed_at?'・完了':''}</strong><p>${[x.started_at&&`開始 ${fmtDate(x.started_at)}`,x.completed_at&&`完了 ${fmtDate(x.completed_at)}`,x.rating&&stars(x.rating)].filter(Boolean).join(' / ')}</p>${x.memo?`<p>${esc(x.memo)}</p>`:''}</div>`).join(''):'<p class="muted">まだ体験記録がありません。</p>'}</section>
    <section class="detail-section"><h3>メモ</h3>${d.notes.length?d.notes.map(n=>`<article class="note-block"><header><span>${NOTE_LABELS[n.note_type]||n.note_type}${n.position?`・${esc(n.position)}`:''}</span><time>${fmtDateTime(n.updated_at)}</time></header><p>${esc(n.content)}</p></article>`).join(''):'<p class="muted">メモはまだありません。</p>'}</section>
    <section class="detail-section"><h3>進捗・情報</h3><p class="muted">${w.progress_current!=null?`${w.progress_current}${w.progress_total?` / ${w.progress_total}`:''} ${esc(w.unit_label||'')}`:'進捗未設定'}${w.release_year?`<br>発表年 ${w.release_year}`:''}</p></section>
    <section class="detail-section"><div class="danger-zone"><strong>作品を削除</strong><p class="muted">初期版では復元可能なソフト削除。</p><button class="ghost-button" data-action="delete-work">削除する</button></div></section>`;
}

function openWorkDialog(edit=false){
  const dialog=$('#workDialog'), form=$('#workForm'); form.reset(); form.id.value=''; form.version.value=''; $('#workFormError').textContent='';
  $('#workDialogTitle').textContent=edit?'作品を編集':'作品を追加';
  if(edit && state.selected){
    const w=state.selected.work; form.id.value=w.id; form.version.value=w.version; form.title.value=w.title; form.type.value=w.type; form.status.value=w.status; form.short_note.value=w.short_note||''; form.creator.value=w.creator||''; form.release_year.value=w.release_year||''; form.rating.value=w.rating||''; form.genre.value=(w.labels?.genre||[]).join(', '); form.theme.value=(w.labels?.theme||[]).join(', '); form.tag.value=(w.labels?.tag||[]).join(', '); form.progress_current.value=w.progress_current??''; form.progress_total.value=w.progress_total??''; form.unit_label.value=w.unit_label||''; $('.details-fields',form).open=true;
  }else{
    const saved=localStorage.getItem(DRAFT_KEY); if(saved){ try{ const draft=JSON.parse(saved); Object.entries(draft).forEach(([k,v])=>{ if(form.elements[k]) form.elements[k].value=v; }); toast('保存前の入力を復元しました。'); }catch{} }
  }
  $('[data-counter="short_note"]').textContent=form.short_note.value.length;
  dialog.showModal(); setTimeout(()=>form.title.focus(),50);
}

function formLabels(value){ return value.split(/[、,]/).map(v=>v.trim()).filter(Boolean); }
function nullableNumber(value){ return value===''?null:Number(value); }

async function submitWork(form){
  const payload={title:form.title.value,type:form.type.value,status:form.status.value,short_note:form.short_note.value,creator:form.creator.value||null,release_year:nullableNumber(form.release_year.value),rating:nullableNumber(form.rating.value),progress_current:nullableNumber(form.progress_current.value),progress_total:nullableNumber(form.progress_total.value),unit_label:form.unit_label.value||null,labels:{genre:formLabels(form.genre.value),theme:formLabels(form.theme.value),tag:formLabels(form.tag.value)}};
  try{
    let data;
    if(form.id.value){ payload.version=Number(form.version.value); data=await api(`/api/works/${encodeURIComponent(form.id.value)}`,{method:'PATCH',body:JSON.stringify(payload)}); }
    else data=await api('/api/works',{method:'POST',body:JSON.stringify(payload)});
    localStorage.removeItem(DRAFT_KEY); $('#workDialog').close(); toast(form.id.value?'更新しました。':'追加しました。');
    await Promise.all([loadHome(),loadWorks(true)]); state.selected=data; state.selectedId=data.work.id; renderDetail();
  }catch(e){ $('#workFormError').textContent=e.message; }
}

function saveOpenDraft(){
  const dialog=$('#workDialog'); if(!dialog.open) return; const form=$('#workForm'); if(form.id.value) return;
  const draft={}; new FormData(form).forEach((v,k)=>draft[k]=v); localStorage.setItem(DRAFT_KEY,JSON.stringify(draft));
}

function openNoteDialog(){ if(!state.selectedId)return; const f=$('#noteForm'); f.reset(); f.work_id.value=state.selectedId; $('.form-error',f).textContent=''; $('#noteDialog').showModal(); setTimeout(()=>f.content.focus(),50); }
function openExperienceDialog(){ if(!state.selectedId)return; const f=$('#experienceForm'); f.reset(); f.work_id.value=state.selectedId; f.started_at.value=new Date().toISOString().slice(0,10); $('.form-error',f).textContent=''; $('#experienceDialog').showModal(); }

async function submitNote(form){
  try{ await api(`/api/works/${encodeURIComponent(form.work_id.value)}/notes`,{method:'POST',body:JSON.stringify({note_type:form.note_type.value,content:form.content.value,position:form.position.value||null})}); $('#noteDialog').close(); toast('メモを保存しました。'); await Promise.all([openDetail(form.work_id.value),loadHome(),loadWorks(true)]); }
  catch(e){ $('.form-error',form).textContent=e.message; }
}
async function submitExperience(form){
  const payload={started_at:form.started_at.value||null,completed_at:form.completed_at.value||null,rating:nullableNumber(form.rating.value),progress_current:nullableNumber(form.progress_current.value),progress_total:nullableNumber(form.progress_total.value),memo:form.memo.value||null};
  try{ await api(`/api/works/${encodeURIComponent(form.work_id.value)}/experiences`,{method:'POST',body:JSON.stringify(payload)}); $('#experienceDialog').close(); toast('体験を追加しました。'); await Promise.all([openDetail(form.work_id.value),loadHome(),loadWorks(true)]); }
  catch(e){ $('.form-error',form).textContent=e.message; }
}

async function deleteSelected(){
  if(!state.selected || !confirm(`「${state.selected.work.title}」を削除しますか？`)) return;
  try{ await api(`/api/works/${encodeURIComponent(state.selectedId)}`,{method:'DELETE'}); toast('削除しました。'); state.selected=null; state.selectedId=null; $('#detailPanel').classList.remove('is-open'); $('#detailPanel').innerHTML='<div class="detail-empty"><strong>作品を選択</strong></div>'; await Promise.all([loadHome(),loadWorks(true)]); }
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

function closeDialogs(){ $$('dialog[open]').forEach(d=>d.close()); }

function bindEvents(){
  let timer;
  $('#globalSearch').addEventListener('input',e=>{ clearTimeout(timer); state.filters.q=e.target.value; timer=setTimeout(()=>{setView('library');loadWorks(true);},220); });
  ['#filterType','#filterStatus','#filterRating','#filterNotes','#sortSelect'].forEach(sel=>$(sel).addEventListener('change',applyFiltersFromControls));
  $('#filterLabel').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(applyFiltersFromControls,220);});
  $('#loadMore').addEventListener('click',()=>{state.page++;loadWorks(false);});
  $('#workForm').addEventListener('submit',e=>{e.preventDefault();submitWork(e.currentTarget);});
  $('#workForm').addEventListener('input',e=>{ if(e.target.name==='short_note')$('[data-counter="short_note"]').textContent=e.target.value.length; saveOpenDraft(); });
  $('#noteForm').addEventListener('submit',e=>{e.preventDefault();submitNote(e.currentTarget);});
  $('#experienceForm').addEventListener('submit',e=>{e.preventDefault();submitExperience(e.currentTarget);});
  $('#dangerForm').addEventListener('submit',e=>{e.preventDefault();submitDanger(e.currentTarget);});
  $('#inviteForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;try{await api('/api/admin/invitations',{method:'POST',body:JSON.stringify({email:f.email.value,role:f.role.value})});f.reset();toast('招待を作成しました。');await loadAdmin();}catch(err){toast(err.message,'error');}});
  document.addEventListener('click',async e=>{
    const action=e.target.closest('[data-action]')?.dataset.action;
    const workId=e.target.closest('[data-work-id]')?.dataset.workId;
    if(workId){setView('library');await openDetail(workId);return;}
    if(action==='go-home'){setView('home');await loadHome();}
    if(action==='open-work-dialog')openWorkDialog(false);
    if(action==='close-dialog')e.target.closest('dialog').close();
    if(action==='edit-work')openWorkDialog(true);
    if(action==='add-note')openNoteDialog();
    if(action==='add-experience')openExperienceDialog();
    if(action==='delete-work')deleteSelected();
    if(action==='close-detail')$('#detailPanel').classList.remove('is-open');
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
    if(!typing&&!e.metaKey&&!e.ctrlKey&&e.key.toLowerCase()==='n'){e.preventDefault();openWorkDialog(false);}
    if(!typing&&!e.metaKey&&!e.ctrlKey&&e.key.toLowerCase()==='e'&&state.selected){e.preventDefault();openWorkDialog(true);}
    if(e.key==='Escape'&&!$$('dialog[open]').length)$('#detailPanel').classList.remove('is-open');
  });
  window.addEventListener('beforeunload',saveOpenDraft);
}

init();
