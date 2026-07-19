const V07_STYLE = '/v07.css';
const workIndex = new Map();
let indexLoading = null;

function ensureStyle(){
  if(document.querySelector(`link[href="${V07_STYLE}"]`)) return;
  const link=document.createElement('link');
  link.rel='stylesheet';link.href=V07_STYLE;document.head.append(link);
}

const escV07=(value='')=>String(value).replace(/[&<>'"]/g,(ch)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const dateV07=(value)=>value?new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'short',day:'numeric'}).format(new Date(value)):'';

async function apiV07(path,options={}){
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

function practicalizeHero(){
  const eyebrow=document.querySelector('.hero-row .eyebrow');
  const title=document.querySelector('#homeTitle');
  const lead=document.querySelector('.hero-row>div>p:last-child');
  const quick=document.querySelector('.quick-card');
  if(eyebrow) eyebrow.textContent='ホーム';
  if(title) title.textContent='作品体験ログ';
  if(lead) lead.textContent='いま触れている作品と、最近残した記録をすぐ確認できます。';
  if(quick){
    const strong=quick.querySelector('strong');
    if(strong) strong.textContent='作品を追加';
  }
  if(document.querySelector('.v07-home-actions')) return;
  const actions=document.createElement('div');
  actions.className='v07-home-actions';
  actions.innerHTML=`
    <button type="button" data-v07-action="add-work">＋ 作品を追加</button>
    <button type="button" data-v07-action="show-library">作品一覧を見る</button>
    <button type="button" data-v07-action="focus-search">メモ・作品を検索</button>`;
  document.querySelector('.hero-row')?.after(actions);
}

function simplifyLabels(card){
  const row=card.querySelector('.label-row');
  if(!row||row.dataset.v07==='true') return;
  row.dataset.v07='true';
  const labels=Array.from(row.querySelectorAll('.label-chip'));
  labels.slice(2).forEach((label)=>label.hidden=true);
  if(labels.length>2){
    const more=document.createElement('span');
    more.className='v07-label-overflow';
    more.textContent=`＋${labels.length-2}`;
    row.append(more);
  }
}

function progressText(work){
  if(work.progress_current==null) return '';
  const total=work.progress_total!=null?` / ${work.progress_total}`:'';
  return `${work.progress_current}${total}${work.unit_label?` ${work.unit_label}`:''}`;
}

function enhanceWorkCards(){
  document.querySelectorAll('#workList .work-card').forEach((card)=>{
    const work=workIndex.get(card.dataset.workId);
    if(!work) return;
    simplifyLabels(card);
    if(card.querySelector('.v07-card-footer')) return;
    const footer=document.createElement('div');
    footer.className='v07-card-footer';
    footer.innerHTML=`<span>${progressText(work)?escV07(progressText(work)):'進捗未設定'}</span><time>更新 ${escV07(dateV07(work.updated_at))}</time>`;
    card.append(footer);
  });
}

function enhanceReadingCards(){
  document.querySelectorAll('#readingStrip .reading-card').forEach((card)=>{
    const work=workIndex.get(card.dataset.workId);
    if(!work||card.querySelector('.v07-card-footer')) return;
    const footer=document.createElement('div');
    footer.className='v07-card-footer';
    footer.innerHTML=`<span>${progressText(work)?escV07(progressText(work)):'記録を続ける'}</span><time>${escV07(dateV07(work.updated_at))}</time>`;
    card.append(footer);
  });
}

function selectedWork(){
  const selected=document.querySelector('#workList .work-card[aria-current="true"]');
  if(selected?.dataset.workId&&workIndex.has(selected.dataset.workId)) return workIndex.get(selected.dataset.workId);
  const title=document.querySelector('#detailPanel .detail-header h2')?.textContent?.trim();
  if(!title) return null;
  return Array.from(workIndex.values()).find((work)=>work.title===title)||null;
}

function enhanceDetail(){
  const header=document.querySelector('#detailPanel .detail-header');
  if(!header||header.dataset.v07==='true') return;
  header.dataset.v07='true';
  const work=selectedWork();
  const source=work?.metadata?.source_url||work?.metadata?.notion_page_url;
  if(source){
    const link=document.createElement('a');
    link.className='v07-source-link';link.href=source;link.target='_blank';link.rel='noreferrer';
    link.textContent=work?.metadata?.source_url?'元ページを開く ↗':'Notionの元データを開く ↗';
    header.querySelector('.creator')?.after(link);
  }
}

async function loadWorkIndex(){
  if(indexLoading) return indexLoading;
  indexLoading=(async()=>{
    workIndex.clear();
    for(let page=1;page<=20;page+=1){
      const data=await apiV07(`/api/works?page=${page}&limit=50&sort=updated_desc`);
      (data.items||[]).forEach((work)=>workIndex.set(work.id,work));
      if(!data.hasMore) break;
    }
    enhanceWorkCards();enhanceReadingCards();enhanceDetail();
  })().catch(()=>{}).finally(()=>{indexLoading=null;});
  return indexLoading;
}

function setupMobileNav(){
  const library=document.querySelector('[data-mobile-view="library"]');
  if(library) library.innerHTML='<span>☰</span>作品';
  const records=document.querySelector('[data-mobile-view="records"]');
  if(records) records.hidden=true;
}

function notionCardMarkup(){
  return `<article class="settings-card notion-import-card" id="notionImportCard">
    <h2>Notionのリストを取り込む</h2>
    <p>「📗 読書・コンテンツ」から、整形済みの最新20件を取り込みます。元URL・Notionページ・登録日は作品データ内に保持します。</p>
    <p class="notion-import-status" id="notionImportStatus">取り込み状況を確認しています…</p>
    <div class="notion-import-actions">
      <button class="primary-button" type="button" id="notionImportButton">Notionから取り込む</button>
      <a class="ghost-button" href="https://app.notion.com/p/8a9fc094a72842478822507136ba3587?v=0fd108080cff47a998b0af908cae8d91" target="_blank" rel="noreferrer">元のNotionを開く</a>
      <span class="notion-import-result" id="notionImportResult"></span>
    </div>
  </article>`;
}

async function refreshNotionStatus(){
  const status=document.querySelector('#notionImportStatus');
  const button=document.querySelector('#notionImportButton');
  if(!status||!button) return;
  try{
    const data=await apiV07('/api/admin/notion-import');
    status.textContent=`${data.available}件中 ${data.imported}件を取り込み済み。残り ${data.remaining}件。`;
    button.disabled=data.remaining===0;
    button.textContent=data.remaining===0?'取り込み済み':'Notionから取り込む';
  }catch(error){status.textContent=error.message;button.disabled=true;}
}

async function setupNotionImport(){
  let me;
  try{me=(await apiV07('/api/me')).user;}catch{return;}
  if(!['owner','admin'].includes(me?.role)) return;
  const grid=document.querySelector('#settingsView .settings-grid');
  if(!grid||document.querySelector('#notionImportCard')) return;
  grid.insertAdjacentHTML('afterbegin',notionCardMarkup());
  document.querySelector('#notionImportButton')?.addEventListener('click',async(event)=>{
    const button=event.currentTarget;
    if(!confirm('Notionの最新20件を作品一覧へ取り込みます。すでに取り込んだ項目は自動でスキップします。')) return;
    button.disabled=true;button.textContent='取り込み中…';
    const result=document.querySelector('#notionImportResult');
    try{
      const data=await apiV07('/api/admin/notion-import',{method:'POST',body:'{}'});
      result.textContent=`${data.inserted}件追加、${data.skipped}件スキップしました。`;
      await refreshNotionStatus();
      setTimeout(()=>location.reload(),900);
    }catch(error){result.textContent=error.message;button.disabled=false;button.textContent='Notionから取り込む';}
  });
  await refreshNotionStatus();
}

function bindV07Actions(){
  document.addEventListener('click',(event)=>{
    const button=event.target.closest('[data-v07-action]');
    if(!button) return;
    const action=button.dataset.v07Action;
    if(action==='add-work') document.querySelector('.top-actions [data-action="open-work-dialog"]')?.click();
    if(action==='show-library') document.querySelector('[data-mobile-view="library"]')?.click();
    if(action==='focus-search') document.querySelector('#globalSearch')?.focus();
  });
}

function observeDynamicContent(){
  const observer=new MutationObserver(()=>{
    enhanceWorkCards();enhanceReadingCards();enhanceDetail();
    if(document.querySelector('#workList .work-card:not(:has(.v07-card-footer))')) loadWorkIndex();
  });
  observer.observe(document.body,{childList:true,subtree:true});
}

async function startV07(){
  ensureStyle();
  practicalizeHero();
  setupMobileNav();
  bindV07Actions();
  observeDynamicContent();
  await Promise.all([loadWorkIndex(),setupNotionImport()]);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(startV07,0),{once:true});
else setTimeout(startV07,0);
