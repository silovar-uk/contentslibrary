const V5_VERSION='0.5';

function v5MountStyles(){
  for(const href of ['/v05.css','/v05-polish.css']){
    if(document.querySelector(`link[href="${href}"]`))continue;
    const link=document.createElement('link');
    link.rel='stylesheet';link.href=href;
    document.head.append(link);
  }
}

function v5MountFolio(){
  if(document.querySelector('.archive-folio'))return;
  const folio=document.createElement('div');
  folio.className='archive-folio';
  folio.setAttribute('aria-hidden','true');
  folio.textContent=`PRIVATE CULTURE ARCHIVE · VOL ${V5_VERSION}`;
  document.body.append(folio);
}

function v5EnhanceHero(){
  const hero=document.querySelector('.hero-row');
  if(!hero||hero.dataset.v5Ready==='true')return;
  hero.dataset.v5Ready='true';
  const note=document.createElement('aside');
  note.className='hero-editorial-note';
  note.setAttribute('aria-label','このアーカイブについて');
  note.innerHTML='<span>PERSONAL INDEX / TEXT FIRST</span><strong>作品を集めるのではなく、変化した自分を残す。</strong><span>READING · WATCHING · THINKING</span>';
  const quick=hero.querySelector('.quick-card');
  if(quick)hero.insertBefore(note,quick);
  else hero.append(note);
}

function v5SetCardOrder(root=document){
  root.querySelectorAll('.reading-card,.work-card,.note-item,.compact-item,.settings-card').forEach((item,index)=>{
    item.style.setProperty('--entry-order',String(index));
  });
}

const v5Observer='IntersectionObserver' in window?new IntersectionObserver((entries,observer)=>{
  entries.forEach((entry)=>{
    if(!entry.isIntersecting)return;
    const order=Number(entry.target.style.getPropertyValue('--entry-order')||0);
    entry.target.style.transitionDelay=`${Math.min(order*28,180)}ms`;
    entry.target.classList.add('is-visible');
    observer.unobserve(entry.target);
  });
},{threshold:.08,rootMargin:'0px 0px -7% 0px'}):null;

function v5RevealElements(root=document){
  const candidates=root.querySelectorAll('.section-heading,.reading-card,.home-columns>section,.stats-bar,.work-card,.detail-section,.settings-card');
  candidates.forEach((item)=>{
    if(item.dataset.v5Reveal==='true')return;
    item.dataset.v5Reveal='true';
    item.classList.add('reveal-entry');
    if(v5Observer)v5Observer.observe(item);
    else item.classList.add('is-visible');
  });
}

function v5EnhanceDynamicContent(){
  v5SetCardOrder();
  v5RevealElements();
  document.querySelectorAll('.work-card').forEach((card)=>{
    if(card.dataset.v5Label)return;
    card.dataset.v5Label='catalogue-entry';
  });
  const detail=document.getElementById('detailPanel');
  if(detail&&!detail.dataset.v5Page){detail.dataset.v5Page='right-page';}
}

function v5UpdateMobileNav(){
  const iconMap={home:'⌂',library:'⌕',records:'¶',settings:'◦'};
  document.querySelectorAll('.mobile-nav [data-mobile-view]').forEach((button)=>{
    const span=button.querySelector('span');
    if(span&&iconMap[button.dataset.mobileView])span.textContent=iconMap[button.dataset.mobileView];
  });
  const add=document.querySelector('.mobile-nav .mobile-add span');
  if(add){add.innerHTML='<i aria-hidden="true">＋</i>';}
}

function v5SetActiveNavigation(){
  const app=document.getElementById('app');if(!app)return;
  const view=app.dataset.view||'home';
  document.querySelectorAll('.mobile-nav button').forEach((button)=>{
    const buttonView=button.dataset.mobileView;
    button.toggleAttribute('aria-current',buttonView===view||(buttonView==='home'&&view==='home'));
  });
}

function v5MountMeta(){
  document.documentElement.dataset.visual='editorial-archive';
  document.body.dataset.version=V5_VERSION;
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.content='#efede5';
}

let v5Queued=false;
function v5QueueEnhance(){
  if(v5Queued)return;v5Queued=true;
  requestAnimationFrame(()=>{v5Queued=false;v5EnhanceDynamicContent();v5SetActiveNavigation();});
}

function initV05(){
  v5MountStyles();v5MountMeta();v5MountFolio();v5EnhanceHero();v5UpdateMobileNav();v5EnhanceDynamicContent();v5SetActiveNavigation();
  const app=document.getElementById('app');
  if(app)new MutationObserver(v5QueueEnhance).observe(app,{subtree:true,childList:true,attributes:true,attributeFilter:['data-view','aria-current','hidden']});
  document.addEventListener('click',v5QueueEnhance,true);
}

initV05();
