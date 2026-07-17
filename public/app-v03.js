const V3_FILTER_IDS = {
  q:'globalSearch', type:'filterType', status:'filterStatus', rating_min:'filterRating', label:'filterLabel', has_notes:'filterNotes', sort:'sortSelect'
};
let savedViews = [];
let defaultApplied = false;
let labelTimer;

function v3Escape(value=''){
  return String(value).replace(/[&<>'"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

async function v3Api(path, options={}){
  const method=options.method||'GET';
  const headers=new Headers(options.headers||{});
  if(!['GET','HEAD'].includes(method)) headers.set('X-App-Request','sakuhin-log');
  if(options.body&&!headers.has('Content-Type')) headers.set('Content-Type','application/json');
  const response=await fetch(path,{...options,method,headers});
  const type=response.headers.get('content-type')||'';
  const data=type.includes('application/json')?await response.json().catch(()=>({})):null;
  if(!response.ok) throw new Error(data?.error?.message||`エラー ${response.status}`);
  return data;
}

function v3Toast(message,type='success'){
  const region=document.querySelector('#toastRegion');
  if(!region)return;
  const el=document.createElement('div');el.className=`toast ${type==='error'?'error':''}`;el.textContent=message;
  region.append(el);setTimeout(()=>el.remove(),4200);
}

function currentQuery(){
  const result={};
  for(const [key,id] of Object.entries(V3_FILTER_IDS)){
    const control=document.getElementById(id);if(!control)continue;
    const value=control.type==='checkbox'?control.checked:control.value.trim();
    if(value!==''&&value!==false&&!(key==='sort'&&value==='updated_desc'))result[key]=value;
  }
  return result;
}

function applyQuery(query={}){
  const search=document.getElementById('globalSearch');
  const type=document.getElementById('filterType');
  const status=document.getElementById('filterStatus');
  const rating=document.getElementById('filterRating');
  const label=document.getElementById('filterLabel');
  const notes=document.getElementById('filterNotes');
  const sort=document.getElementById('sortSelect');
  search.value=query.q||'';type.value=query.type||'';status.value=query.status||'';rating.value=query.rating_min||'';label.value=query.label||'';notes.checked=query.has_notes===true;sort.value=query.sort||'updated_desc';
  type.dispatchEvent(new Event('change',{bubbles:true}));
  search.dispatchEvent(new Event('input',{bubbles:true}));
  document.querySelector('#app').dataset.view='library';
  document.querySelector('#homeView').hidden=true;
  document.querySelector('#main')?.focus({preventScroll:true});
}

function querySummary(query={}){
  const parts=[];
  if(query.q)parts.push(`「${query.q}」`);
  if(query.type)parts.push(document.querySelector(`#filterType option[value="${CSS.escape(query.type)}"]`)?.textContent||query.type);
  if(query.status)parts.push(document.querySelector(`#filterStatus option[value="${CSS.escape(query.status)}"]`)?.textContent||query.status);
  if(query.rating_min)parts.push(`評価${query.rating_min}以上`);
  if(query.label)parts.push(query.label);
  if(query.has_notes)parts.push('メモあり');
  return parts.join('・')||'絞り込みなし';
}

function mountSavedViewUi(){
  const panel=document.querySelector('.filter-panel');
  const presets=panel?.querySelector('.saved-views');
  if(!panel||!presets||document.getElementById('customSavedViews'))return;
  presets.previousElementSibling.textContent='クイックビュー';
  const section=document.createElement('section');section.className='custom-view-section';
  section.innerHTML=`<div class="custom-view-heading"><h3>保存ビュー</h3><button type="button" id="saveCurrentView" class="text-button">＋ 現在の条件を保存</button></div><div id="customSavedViews" class="custom-saved-views"><p class="muted">読み込み中</p></div>`;
  presets.after(section);

  const dialog=document.createElement('dialog');dialog.id='savedViewDialog';dialog.className='app-dialog small-dialog';
  dialog.innerHTML=`<form id="savedViewForm" method="dialog" class="dialog-form"><header><div><p class="eyebrow">SAVED VIEW</p><h2>検索条件を保存</h2><p class="dialog-lead">よく使う絞り込みを、名前付きで呼び出せます。</p></div><button type="button" class="icon-button" data-v3-close>×</button></header><label class="field-label">ビュー名<input name="name" required maxlength="40" placeholder="例：仕事に関係する本"></label><label class="check-row"><input name="is_default" type="checkbox"> 起動時の表示にする</label><div id="savedViewPreview" class="saved-view-preview"></div><div class="form-error" role="alert"></div><footer><button type="button" class="ghost-button" data-v3-close>キャンセル</button><button type="submit" class="primary-button">保存する</button></footer></form>`;
  document.body.append(dialog);

  document.getElementById('saveCurrentView').addEventListener('click',()=>{
    const form=document.getElementById('savedViewForm');form.reset();form.querySelector('.form-error').textContent='';
    document.getElementById('savedViewPreview').textContent=querySummary(currentQuery());dialog.showModal();setTimeout(()=>form.name.focus(),40);
  });
  dialog.addEventListener('click',(event)=>{if(event.target.closest('[data-v3-close]'))dialog.close();});
  document.getElementById('savedViewForm').addEventListener('submit',saveCurrentView);
  document.getElementById('customSavedViews').addEventListener('click',handleSavedViewClick);
}

async function saveCurrentView(event){
  event.preventDefault();const form=event.currentTarget;const error=form.querySelector('.form-error');error.textContent='';
  try{
    await v3Api('/api/saved-views',{method:'POST',body:JSON.stringify({name:form.name.value,query:currentQuery(),is_default:form.is_default.checked})});
    document.getElementById('savedViewDialog').close();v3Toast('検索条件を保存しました。');await loadSavedViews(false);
  }catch(err){error.textContent=err.message;}
}

async function loadSavedViews(applyDefault=false){
  try{
    const data=await v3Api('/api/saved-views');savedViews=data.items||[];renderSavedViews();
    const defaultView=savedViews.find((view)=>Number(view.is_default)===1||view.is_default===true);
    if(applyDefault&&!defaultApplied&&defaultView&&!hasActiveQuery()){
      defaultApplied=true;applyQuery(defaultView.query);v3Toast(`「${defaultView.name}」を表示しました。`);
    }
  }catch(err){const box=document.getElementById('customSavedViews');if(box)box.innerHTML='<p class="muted">保存ビューを読み込めませんでした。</p>';}
}

function hasActiveQuery(){return Object.keys(currentQuery()).length>0;}

function renderSavedViews(){
  const box=document.getElementById('customSavedViews');if(!box)return;
  box.innerHTML=savedViews.length?savedViews.map((view)=>`<article class="saved-view-item"><button type="button" class="saved-view-main" data-view-apply="${v3Escape(view.id)}"><strong>${v3Escape(view.name)}</strong><small>${v3Escape(querySummary(view.query))}</small></button><button type="button" class="saved-view-star" data-view-default="${v3Escape(view.id)}" aria-label="起動時の表示にする">${Number(view.is_default)===1?'★':'☆'}</button><button type="button" class="saved-view-delete" data-view-delete="${v3Escape(view.id)}" aria-label="削除">×</button></article>`).join(''):'<p class="muted">保存した検索条件はありません。</p>';
}

async function handleSavedViewClick(event){
  const applyId=event.target.closest('[data-view-apply]')?.dataset.viewApply;
  const defaultId=event.target.closest('[data-view-default]')?.dataset.viewDefault;
  const deleteId=event.target.closest('[data-view-delete]')?.dataset.viewDelete;
  if(applyId){const view=savedViews.find((item)=>item.id===applyId);if(view){applyQuery(view.query);v3Toast(`「${view.name}」を適用しました。`);}return;}
  if(defaultId){try{await v3Api(`/api/saved-views/${encodeURIComponent(defaultId)}`,{method:'PATCH',body:JSON.stringify({is_default:true})});v3Toast('起動時の表示に設定しました。');await loadSavedViews(false);}catch(err){v3Toast(err.message,'error');}return;}
  if(deleteId){const view=savedViews.find((item)=>item.id===deleteId);if(!view||!confirm(`「${view.name}」を削除しますか？`))return;try{await v3Api(`/api/saved-views/${encodeURIComponent(deleteId)}`,{method:'DELETE'});v3Toast('保存ビューを削除しました。');await loadSavedViews(false);}catch(err){v3Toast(err.message,'error');}}
}

function mountSearchHelp(){
  const search=document.querySelector('.global-search');if(search&&!document.getElementById('searchAndHint')){
    const hint=document.createElement('span');hint.id='searchAndHint';hint.className='search-and-hint';hint.textContent='複数語はAND検索';search.append(hint);
  }
  const datalist=document.createElement('datalist');datalist.id='labelSuggestions';document.body.append(datalist);
  for(const name of ['filterLabel','genre','theme','tag']){
    const control=name==='filterLabel'?document.getElementById(name):document.querySelector(`#workForm [name="${name}"]`);
    if(control)control.setAttribute('list','labelSuggestions');
  }
  const controls=[document.getElementById('filterLabel'),...['genre','theme','tag'].map((name)=>document.querySelector(`#workForm [name="${name}"]`))].filter(Boolean);
  controls.forEach((control)=>{
    control.addEventListener('focus',()=>loadLabelSuggestions(control.value));
    control.addEventListener('input',()=>{clearTimeout(labelTimer);labelTimer=setTimeout(()=>loadLabelSuggestions(control.value.split(/[、,]/).at(-1)?.trim()||''),180);});
  });
}

async function loadLabelSuggestions(q=''){
  try{
    const data=await v3Api(`/api/labels?limit=30&q=${encodeURIComponent(q)}`);
    document.getElementById('labelSuggestions').innerHTML=(data.items||[]).map((item)=>`<option value="${v3Escape(item.name)}" label="${item.kind}・${item.usage_count}件"></option>`).join('');
  }catch{}
}

function enhanceFilterChips(){
  const box=document.getElementById('activeFilters');if(!box)return;
  box.querySelectorAll('.filter-chip:not([data-v3-ready])').forEach((chip)=>{chip.dataset.v3Ready='true';chip.setAttribute('role','button');chip.setAttribute('tabindex','0');chip.title='クリックして解除';chip.insertAdjacentHTML('beforeend',' <span aria-hidden="true">×</span>');});
}

function clearChip(chip){
  const text=chip.textContent.replace(/×\s*$/,'').trim();
  const type=document.getElementById('filterType'),status=document.getElementById('filterStatus'),rating=document.getElementById('filterRating'),label=document.getElementById('filterLabel'),notes=document.getElementById('filterNotes'),search=document.getElementById('globalSearch');
  if(text.startsWith('検索「')){search.value='';search.dispatchEvent(new Event('input',{bubbles:true}));return;}
  if(text===type.options[type.selectedIndex]?.textContent){type.value='';type.dispatchEvent(new Event('change',{bubbles:true}));return;}
  if(text===status.options[status.selectedIndex]?.textContent){status.value='';status.dispatchEvent(new Event('change',{bubbles:true}));return;}
  if(text.startsWith('評価')){rating.value='';rating.dispatchEvent(new Event('change',{bubbles:true}));return;}
  if(text.startsWith('分類：')){label.value='';label.dispatchEvent(new Event('input',{bubbles:true}));return;}
  if(text==='メモあり'){notes.checked=false;notes.dispatchEvent(new Event('change',{bubbles:true}));}
}

function waitForBaseApp(){
  return new Promise((resolve)=>{
    let count=0;const timer=setInterval(()=>{count++;if(document.getElementById('resultSummary')?.textContent!=='読み込み中'||count>100){clearInterval(timer);resolve();}},100);
  });
}

async function initV03(){
  if(!document.querySelector('link[href="/v03.css"]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/v03.css';document.head.append(link);}
  mountSavedViewUi();mountSearchHelp();
  const chips=document.getElementById('activeFilters');if(chips){new MutationObserver(enhanceFilterChips).observe(chips,{childList:true});chips.addEventListener('click',(event)=>{const chip=event.target.closest('.filter-chip');if(chip)clearChip(chip);});chips.addEventListener('keydown',(event)=>{if((event.key==='Enter'||event.key===' ')&&event.target.matches('.filter-chip')){event.preventDefault();clearChip(event.target);}});}
  await waitForBaseApp();await Promise.all([loadSavedViews(true),loadLabelSuggestions('')]);
}

initV03();
