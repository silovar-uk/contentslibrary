const V4_NOTE_LABELS={quick:'一言',summary:'要約',impression:'印象',quote:'引用',idea:'自分の考え',connection:'仕事・生活との接続',progress:'途中メモ'};
const V4_STATUS_LABELS={want:'読みたい・見たい',active:'進行中',completed:'完了',paused:'一時停止',dropped:'中断'};
let v4WorkId=null;
let v4Detail=null;
let v4NoteSort='manual';
let v4ExperienceSort='desc';
let v4Enhancing=false;
let v4RefreshTimer;

function v4Escape(value=''){
  return String(value).replace(/[&<>'"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

function v4Date(value){
  if(!value)return '—';
  return new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'short',day:'numeric'}).format(new Date(value));
}

function v4DateTime(value){
  if(!value)return '';
  return new Intl.DateTimeFormat('ja-JP',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
}

function v4Number(value){return value===null||value===undefined||value===''?null:Number(value);}

async function v4Api(path,options={}){
  const method=options.method||'GET';
  const headers=new Headers(options.headers||{});
  if(!['GET','HEAD'].includes(method))headers.set('X-App-Request','sakuhin-log');
  if(options.body&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');
  const response=await fetch(path,{...options,method,headers});
  const type=response.headers.get('content-type')||'';
  const data=type.includes('application/json')?await response.json().catch(()=>({})):null;
  if(!response.ok){const error=new Error(data?.error?.message||`エラー ${response.status}`);error.status=response.status;throw error;}
  return data;
}

function v4Toast(message,type='success'){
  const region=document.querySelector('#toastRegion');if(!region)return;
  const el=document.createElement('div');el.className=`toast ${type==='error'?'error':''}`;el.textContent=message;region.append(el);setTimeout(()=>el.remove(),4200);
}

function mountV4Dialogs(){
  if(document.getElementById('v4NoteDialog'))return;
  const note=document.createElement('dialog');note.id='v4NoteDialog';note.className='app-dialog small-dialog';
  note.innerHTML=`<form id="v4NoteForm" method="dialog" class="dialog-form"><header><div><p class="eyebrow">EDIT NOTE</p><h2>メモを編集</h2></div><button type="button" class="icon-button" data-v4-close>×</button></header><input type="hidden" name="id"><input type="hidden" name="version"><label class="field-label">メモ種別<select name="note_type">${Object.entries(V4_NOTE_LABELS).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label><label class="field-label">内容<textarea name="content" required rows="9" maxlength="50000"></textarea></label><label class="field-label">位置・出典<input name="position" maxlength="100" placeholder="p.128 / 第8話"></label><div class="form-error" role="alert"></div><footer><button type="button" class="ghost-button" data-v4-close>キャンセル</button><button type="submit" class="primary-button">更新する</button></footer></form>`;
  document.body.append(note);

  const experience=document.createElement('dialog');experience.id='v4ExperienceDialog';experience.className='app-dialog small-dialog';
  experience.innerHTML=`<form id="v4ExperienceForm" method="dialog" class="dialog-form"><header><div><p class="eyebrow">EDIT EXPERIENCE</p><h2>体験記録を編集</h2></div><button type="button" class="icon-button" data-v4-close>×</button></header><input type="hidden" name="id"><input type="hidden" name="version"><div class="form-row"><label class="field-label">開始日<input name="started_at" type="date"></label><label class="field-label">完了日<input name="completed_at" type="date"></label></div><div class="form-row"><label class="field-label">評価<select name="rating"><option value="">未評価</option>${[5,4.5,4,3.5,3,2.5,2,1.5,1,.5].map(v=>`<option>${v}</option>`).join('')}</select></label><label class="field-label">現在位置<input name="progress_current" type="number" min="0" step="0.1"></label><label class="field-label">全体<input name="progress_total" type="number" min="0" step="0.1"></label></div><label class="field-label">この回のメモ<textarea name="memo" rows="7" maxlength="50000"></textarea></label><div class="form-error" role="alert"></div><footer><button type="button" class="ghost-button" data-v4-close>キャンセル</button><button type="submit" class="primary-button">更新する</button></footer></form>`;
  document.body.append(experience);

  document.addEventListener('click',(event)=>{if(event.target.closest('[data-v4-close]'))event.target.closest('dialog')?.close();});
  document.getElementById('v4NoteForm').addEventListener('submit',submitV4Note);
  document.getElementById('v4ExperienceForm').addEventListener('submit',submitV4Experience);
}

function findDetailSection(title){
  return Array.from(document.querySelectorAll('#detailPanel .detail-section')).find(section=>section.querySelector('h3')?.textContent.trim()===title);
}

function ratingDelta(current,previous){
  if(current===null||current===undefined)return '';
  if(previous===null||previous===undefined)return '<span class="rating-change first">初回評価</span>';
  const delta=Number(current)-Number(previous);
  if(delta===0)return '<span class="rating-change same">変化なし</span>';
  const sign=delta>0?'+':'';
  return `<span class="rating-change ${delta>0?'up':'down'}">${delta>0?'↑':'↓'} ${sign}${delta.toFixed(1)}</span>`;
}

function experienceSummary(experiences){
  const chronological=[...experiences].sort((a,b)=>Number(a.sequence)-Number(b.sequence));
  const rated=chronological.filter(item=>item.rating!==null&&item.rating!==undefined);
  if(rated.length<2)return '';
  const first=Number(rated[0].rating);const latest=Number(rated.at(-1).rating);const delta=latest-first;
  return `<div class="rating-journey"><span>評価の変化</span><strong>初回 ${first.toFixed(1)} → 最新 ${latest.toFixed(1)}</strong><small class="${delta>0?'up':delta<0?'down':'same'}">${delta===0?'変化なし':`${delta>0?'↑ +':'↓ '}${delta.toFixed(1)}`}</small></div>`;
}

function sortedExperiences(){
  const items=[...(v4Detail?.experiences||[])];
  return items.sort((a,b)=>v4ExperienceSort==='asc'?Number(a.sequence)-Number(b.sequence):Number(b.sequence)-Number(a.sequence));
}

function sortedNotes(){
  const items=[...(v4Detail?.notes||[])];
  if(v4NoteSort==='newest')return items.sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at)));
  if(v4NoteSort==='oldest')return items.sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));
  if(v4NoteSort==='type')return items.sort((a,b)=>String(a.note_type).localeCompare(String(b.note_type),'ja')||String(b.updated_at).localeCompare(String(a.updated_at)));
  return items.sort((a,b)=>(Number(a.sort_order)||0)-(Number(b.sort_order)||0)||String(a.created_at).localeCompare(String(b.created_at)));
}

function renderV4Experiences(){
  const section=findDetailSection('体験履歴');if(!section||!v4Detail)return;
  const chronological=[...(v4Detail.experiences||[])].sort((a,b)=>Number(a.sequence)-Number(b.sequence));
  const previousRating=new Map();let lastRating=null;
  for(const item of chronological){previousRating.set(item.id,lastRating);if(item.rating!==null&&item.rating!==undefined)lastRating=Number(item.rating);}
  const items=sortedExperiences();
  section.dataset.v4='experiences';
  section.innerHTML=`<div class="v4-section-heading"><h3>体験履歴</h3><label>並び順<select id="v4ExperienceSort"><option value="desc" ${v4ExperienceSort==='desc'?'selected':''}>新しい体験から</option><option value="asc" ${v4ExperienceSort==='asc'?'selected':''}>初回から</option></select></label></div>${experienceSummary(v4Detail.experiences||[])}<div class="v4-timeline">${items.length?items.map(item=>`<article class="v4-experience" data-experience-id="${v4Escape(item.id)}"><div class="v4-item-top"><div><strong>${item.sequence}回目${item.completed_at?'・完了':item.started_at?'・進行中':''}</strong>${ratingDelta(item.rating,previousRating.get(item.id))}</div><div class="v4-item-actions"><button type="button" data-v4-edit-experience="${v4Escape(item.id)}">編集</button><button type="button" class="danger-link" data-v4-delete-experience="${v4Escape(item.id)}">削除</button></div></div><p class="v4-meta">${[item.started_at&&`開始 ${v4Date(item.started_at)}`,item.completed_at&&`完了 ${v4Date(item.completed_at)}`,item.rating!=null&&`★ ${Number(item.rating).toFixed(1)}`,item.progress_current!=null&&`進捗 ${item.progress_current}${item.progress_total!=null?` / ${item.progress_total}`:''}`].filter(Boolean).join(' / ')||'日付・評価なし'}</p>${item.memo?`<p class="v4-memo">${v4Escape(item.memo)}</p>`:''}</article>`).join(''):'<p class="muted">まだ体験記録がありません。</p>'}</div>`;
}

function renderV4Notes(){
  const section=findDetailSection('メモ');if(!section||!v4Detail)return;
  const items=sortedNotes();
  section.dataset.v4='notes';
  section.innerHTML=`<div class="v4-section-heading"><h3>メモ</h3><label>並び順<select id="v4NoteSort"><option value="manual" ${v4NoteSort==='manual'?'selected':''}>自分の順番</option><option value="newest" ${v4NoteSort==='newest'?'selected':''}>更新が新しい順</option><option value="oldest" ${v4NoteSort==='oldest'?'selected':''}>作成が古い順</option><option value="type" ${v4NoteSort==='type'?'selected':''}>メモ種別順</option></select></label></div><div class="v4-note-list">${items.length?items.map((note,index)=>`<article class="v4-note" data-note-id="${v4Escape(note.id)}"><header><div><span class="v4-note-kind">${v4Escape(V4_NOTE_LABELS[note.note_type]||note.note_type)}</span>${note.position?`<span>${v4Escape(note.position)}</span>`:''}<time>${v4DateTime(note.updated_at)}</time></div><div class="v4-item-actions">${v4NoteSort==='manual'?`<button type="button" data-v4-move-note="up" data-note-id="${v4Escape(note.id)}" ${index===0?'disabled':''} aria-label="上へ移動">↑</button><button type="button" data-v4-move-note="down" data-note-id="${v4Escape(note.id)}" ${index===items.length-1?'disabled':''} aria-label="下へ移動">↓</button>`:''}<button type="button" data-v4-edit-note="${v4Escape(note.id)}">編集</button><button type="button" class="danger-link" data-v4-delete-note="${v4Escape(note.id)}">削除</button></div></header><p>${v4Escape(note.content)}</p></article>`).join(''):'<p class="muted">メモはまだありません。</p>'}</div>`;
}

function renderV4Sections(){
  if(!v4Detail)return;
  v4Enhancing=true;
  renderV4Experiences();renderV4Notes();
  v4Enhancing=false;
}

async function loadV4Detail(){
  if(!v4WorkId)return;
  try{v4Detail=await v4Api(`/api/works/${encodeURIComponent(v4WorkId)}`);renderV4Sections();}
  catch(error){if(error.status!==404)v4Toast(error.message,'error');}
}

function scheduleV4Enhance(){
  if(v4Enhancing)return;
  clearTimeout(v4RefreshTimer);v4RefreshTimer=setTimeout(()=>{const selected=document.querySelector('.work-card[aria-current="true"]')?.dataset.workId;if(selected)v4WorkId=selected;if(v4WorkId)loadV4Detail();},80);
}

function openV4Note(noteId){
  const note=(v4Detail?.notes||[]).find(item=>item.id===noteId);if(!note)return;
  const form=document.getElementById('v4NoteForm');form.reset();form.id.value=note.id;form.version.value=note.version||1;form.note_type.value=note.note_type;form.content.value=note.content;form.position.value=note.position||'';form.querySelector('.form-error').textContent='';document.getElementById('v4NoteDialog').showModal();setTimeout(()=>form.content.focus(),40);
}

function openV4Experience(experienceId){
  const item=(v4Detail?.experiences||[]).find(row=>row.id===experienceId);if(!item)return;
  const form=document.getElementById('v4ExperienceForm');form.reset();form.id.value=item.id;form.version.value=item.version||1;form.started_at.value=(item.started_at||'').slice(0,10);form.completed_at.value=(item.completed_at||'').slice(0,10);form.rating.value=item.rating??'';form.progress_current.value=item.progress_current??'';form.progress_total.value=item.progress_total??'';form.memo.value=item.memo||'';form.querySelector('.form-error').textContent='';document.getElementById('v4ExperienceDialog').showModal();
}

async function submitV4Note(event){
  event.preventDefault();const form=event.currentTarget;const error=form.querySelector('.form-error');error.textContent='';
  try{await v4Api(`/api/notes/${encodeURIComponent(form.id.value)}`,{method:'PATCH',body:JSON.stringify({version:Number(form.version.value),note_type:form.note_type.value,content:form.content.value,position:form.position.value||null})});document.getElementById('v4NoteDialog').close();v4Toast('メモを更新しました。');await loadV4Detail();}
  catch(err){error.textContent=err.message;}
}

async function submitV4Experience(event){
  event.preventDefault();const form=event.currentTarget;const error=form.querySelector('.form-error');error.textContent='';
  const current=v4Number(form.progress_current.value),total=v4Number(form.progress_total.value);
  if(current!==null&&total!==null&&current>total){error.textContent='現在位置は全体以下にしてください。';form.progress_current.focus();return;}
  try{await v4Api(`/api/experiences/${encodeURIComponent(form.id.value)}`,{method:'PATCH',body:JSON.stringify({version:Number(form.version.value),started_at:form.started_at.value||null,completed_at:form.completed_at.value||null,rating:v4Number(form.rating.value),progress_current:current,progress_total:total,memo:form.memo.value||null})});document.getElementById('v4ExperienceDialog').close();v4Toast('体験記録を更新しました。');await refreshV4Base();}
  catch(err){error.textContent=err.message;}
}

async function deleteV4Note(noteId){
  const note=(v4Detail?.notes||[]).find(item=>item.id===noteId);if(!note||!confirm(`このメモを削除しますか？\n\n${note.content.slice(0,80)}`))return;
  try{await v4Api(`/api/notes/${encodeURIComponent(noteId)}`,{method:'DELETE'});v4Toast('メモを削除しました。');await loadV4Detail();}
  catch(err){v4Toast(err.message,'error');}
}

async function deleteV4Experience(experienceId){
  const item=(v4Detail?.experiences||[]).find(row=>row.id===experienceId);if(!item||!confirm(`${item.sequence}回目の体験記録を削除しますか？\n作品自体は削除されません。`))return;
  try{await v4Api(`/api/experiences/${encodeURIComponent(experienceId)}`,{method:'DELETE'});v4Toast('体験記録を削除しました。');await refreshV4Base();}
  catch(err){v4Toast(err.message,'error');}
}

async function moveV4Note(noteId,direction){
  const items=sortedNotes();const index=items.findIndex(item=>item.id===noteId);const target=direction==='up'?index-1:index+1;if(index<0||target<0||target>=items.length)return;
  [items[index],items[target]]=[items[target],items[index]];
  try{await v4Api(`/api/works/${encodeURIComponent(v4WorkId)}/notes/reorder`,{method:'POST',body:JSON.stringify({ids:items.map(item=>item.id)})});v4Toast('メモの順番を変更しました。');await loadV4Detail();}
  catch(err){v4Toast(err.message,'error');}
}

async function refreshV4Base(){
  const selector=`[data-work-id="${CSS.escape(v4WorkId||'')}"]`;const trigger=document.querySelector(`.work-card${selector}`)||document.querySelector(selector);
  if(trigger){trigger.click();return;}
  await loadV4Detail();
}

function bindV4Events(){
  document.addEventListener('click',(event)=>{
    const work=event.target.closest('[data-work-id]');if(work)v4WorkId=work.dataset.workId;
    const editNote=event.target.closest('[data-v4-edit-note]')?.dataset.v4EditNote;if(editNote){openV4Note(editNote);return;}
    const deleteNote=event.target.closest('[data-v4-delete-note]')?.dataset.v4DeleteNote;if(deleteNote){deleteV4Note(deleteNote);return;}
    const editExperience=event.target.closest('[data-v4-edit-experience]')?.dataset.v4EditExperience;if(editExperience){openV4Experience(editExperience);return;}
    const deleteExperience=event.target.closest('[data-v4-delete-experience]')?.dataset.v4DeleteExperience;if(deleteExperience){deleteV4Experience(deleteExperience);return;}
    const move=event.target.closest('[data-v4-move-note]');if(move){moveV4Note(move.dataset.noteId,move.dataset.v4MoveNote);}
  },true);
  document.addEventListener('change',(event)=>{
    if(event.target.id==='v4ExperienceSort'){v4ExperienceSort=event.target.value;renderV4Experiences();}
    if(event.target.id==='v4NoteSort'){v4NoteSort=event.target.value;renderV4Notes();}
  });
  const panel=document.getElementById('detailPanel');if(panel)new MutationObserver(scheduleV4Enhance).observe(panel,{childList:true,subtree:true});
}

function initV04(){
  if(!document.querySelector('link[href="/v04.css"]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/v04.css';document.head.append(link);}
  mountV4Dialogs();bindV4Events();
}

initV04();
