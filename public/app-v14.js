const V14_STYLE = '/v14-editorial.css';
const V14_FAVICON = '/favicon.svg';
const fetchBeforeV14 = window.fetch.bind(window);
const worksV14 = new Map();
let refreshQueuedV14 = false;

const ICONS_V14 = {
  home:'<path d="M3 11.5 12 4l9 7.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5v-8Z"/><path d="M9 21v-6h6v6"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  library:'<path d="M5 4h4v16H5zM10 4h4v16h-4zM15.5 5.2l3.6-1.1 4.1 14.8-3.7 1.1z"/>',
  bookmark:'<path d="M7 3h10a1 1 0 0 1 1 1v17l-6-4-6 4V4a1 1 0 0 1 1-1Z"/>',
  shuffle:'<path d="M16 3h5v5"/><path d="m4 20 6.5-6.5M21 3l-8 8M16 16h5v5M14.5 14.5 21 21M4 4l5.5 5.5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
  filter:'<path d="M4 6h16M7 12h10M10 18h4"/>',
  rotate:'<path d="M20 6v5h-5"/><path d="M18.5 16a8 8 0 1 1 .8-8.7L20 11"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  edit:'<path d="M13.5 6.5 17.5 10.5M4 20l4.5-1 10-10a2.8 2.8 0 0 0-4-4l-10 10L4 20Z"/>',
  note:'<path d="M5 3h11l3 3v15H5z"/><path d="M15 3v4h4M8 11h8M8 15h8"/>',
  download:'<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 19h16"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  spark:'<path d="m12 2 1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7L12 2Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/>',
  arrow:'<path d="M5 12h14M14 7l5 5-5 5"/>',
  play:'<path d="m8 5 11 7-11 7V5Z"/>',
  shield:'<path d="M12 3 5 6v5c0 4.6 2.8 8.3 7 10 4.2-1.7 7-5.4 7-10V6l-7-3Z"/>',
  list:'<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>'
};

function iconV14(name, label = '') {
  const body = ICONS_V14[name] || ICONS_V14.bookmark;
  const aria = label ? `role="img" aria-label="${escapeV14(label)}"` : 'aria-hidden="true"';
  return `<svg class="v14-icon" ${aria} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

function escapeV14(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

const GENRES_V14 = [
  ['小説','#8E3B46'],['エッセイ','#B65F47'],['漫画','#9B416C'],['ビジネス・経営','#31577A'],
  ['マーケティング・広報','#B44732'],['社会・政治','#4C6280'],['歴史','#9A6B32'],['哲学・思想','#72588A'],
  ['心理・認知','#39766F'],['科学','#356AA0'],['IT・テクノロジー','#267C8D'],['言語・文章','#526F82'],
  ['教育・学習','#63814A'],['スポーツ','#347A5A'],['将棋・ゲーム','#A36B21'],['健康・医療','#A65264'],
  ['芸術・デザイン','#7650A0'],['料理・生活','#71804A'],['その他','#737773']
];

function genreInfoV14(work) {
  const name = String(work?.labels?.genre?.[0] || 'その他');
  const match = GENRES_V14.find(([label]) => name === label || name.includes(label) || label.includes(name));
  return { name, color: match?.[1] || '#737773' };
}

function ensureAssetsV14() {
  if (!document.querySelector(`link[href="${V14_STYLE}"]`)) {
    const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = V14_STYLE; document.head.append(style);
  }
  let favicon = document.querySelector('link[rel="icon"]');
  if (!favicon) { favicon = document.createElement('link'); favicon.rel = 'icon'; document.head.append(favicon); }
  favicon.type = 'image/svg+xml'; favicon.href = V14_FAVICON;
  const theme = document.querySelector('meta[name="theme-color"]'); if (theme) theme.content = '#f3eee5';
}

function enhanceBrandV14() {
  const brand = document.querySelector('.brand');
  if (brand && brand.dataset.v14Ready !== 'true') {
    const mark = brand.querySelector('.brand-mark');
    if (mark) mark.innerHTML = `<img src="${V14_FAVICON}" alt="">`;
    const small = brand.querySelector('small'); if (small) small.textContent = 'MY CULTURE ARCHIVE';
    brand.classList.add('v14-brand'); brand.dataset.v14Ready = 'true';
  }
  const settings = document.querySelector('.avatar-button[data-action="open-settings"]');
  if (settings && settings.dataset.v14Ready !== 'true') {
    settings.innerHTML = iconV14('settings'); settings.title = '設定'; settings.dataset.v14Ready = 'true';
  }
}

const BUTTON_ICONS_V14 = {
  'open-work-dialog':'plus','open-settings':'settings','open-admin':'shield','clear-filters':'rotate','toggle-filters':'filter',
  'close-detail':'close','close-dialog':'close','edit-work':'edit','add-note':'note','add-experience':'plus',
  'go-home':'home','refresh-admin':'rotate','delete-work':'close'
};

function addButtonIconV14(button, name) {
  if (!button || button.querySelector(':scope > .v14-icon')) return;
  button.insertAdjacentHTML('afterbegin', iconV14(name));
}

function enhanceButtonsV14(root = document) {
  root.querySelectorAll?.('button[data-action]').forEach((button) => {
    const name = BUTTON_ICONS_V14[button.dataset.action]; if (name) addButtonIconV14(button, name);
  });
  root.querySelectorAll?.('button[data-export]').forEach((button) => addButtonIconV14(button, 'download'));
  root.querySelectorAll?.('[data-v13-fact-open]').forEach((button) => addButtonIconV14(button, 'spark'));
  const search = document.querySelector('.global-search > span[aria-hidden="true"]'); if (search) search.innerHTML = iconV14('search');
}

function mountHeaderRandomV14() {
  const actions = document.querySelector('.top-actions');
  if (!actions || document.querySelector('#v14HeaderRandom')) return;
  const button = document.createElement('button');
  button.id = 'v14HeaderRandom'; button.type = 'button'; button.className = 'v14-random-header'; button.dataset.v14Random = 'true';
  button.innerHTML = `${iconV14('shuffle')}<span>本を引く</span>`;
  actions.insertBefore(button, actions.querySelector('[data-action="open-work-dialog"]'));
}

function mountMobileNavV14() {
  const nav = document.querySelector('.mobile-nav'); if (!nav) return;
  const items = [
    ['[data-mobile-view="home"]','home','ホーム'],['[data-mobile-view="library"]','search','探す'],
    ['[data-mobile-view="records"]','list','記録'],['[data-mobile-view="settings"]','settings','設定']
  ];
  items.forEach(([selector,name,label]) => { const button = nav.querySelector(selector); if (button) button.innerHTML = `${iconV14(name)}<span>${label}</span>`; });
  const middle = nav.querySelector('.mobile-add');
  if (middle) {
    middle.removeAttribute('data-action'); middle.dataset.v14Random = 'true'; middle.classList.add('v14-mobile-random');
    middle.innerHTML = `${iconV14('shuffle')}<span>本を引く</span>`;
  }
}

function randomHeroMarkupV14() {
  return `<div class="v14-hero-copy"><p class="v14-kicker">PICK FROM YOUR SHELF</p><h1 id="homeTitle">次に読むものを、<br>棚から引く。</h1><p>積んだままの本を、偶然にもう一度手元へ。登録や検索より先に、作品と再会できるホームにしました。</p><div class="v14-random-controls"><label><span>抽選する棚</span><select id="v14RandomScope"><option value="next">所持・未読＋読みたい</option><option value="owned_unread">所持・未読だけ</option><option value="want">読みたい本だけ</option><option value="book">すべての本</option><option value="all">すべての作品</option></select></label><button type="button" class="v14-draw-button" data-v14-draw>${iconV14('shuffle')}<span><small>棚から偶然を</small><strong>1作品引く</strong></span>${iconV14('arrow')}</button></div><div class="v14-hero-links"><button type="button" class="v14-quiet-link" data-action="open-work-dialog">${iconV14('plus')}作品を追加</button><button type="button" class="v14-quiet-link" data-v14-open-library>${iconV14('library')}作品一覧を見る</button></div></div><div id="v14RandomStage" class="v14-random-stage" aria-live="polite"><div class="v14-random-empty">${iconV14('bookmark')}<strong>まだ引いていません</strong><p>ボタンを押すと、この棚から1作品だけ現れます。</p></div></div>`;
}

function mountRandomHeroV14() {
  const hero = document.querySelector('.hero-row');
  if (!hero || hero.dataset.v14Ready === 'true') return;
  hero.classList.add('v14-random-hero'); hero.innerHTML = randomHeroMarkupV14(); hero.dataset.v14Ready = 'true';
  enhanceButtonsV14(hero);
  const libraryButton = hero.querySelector('[data-v14-open-library]');
  libraryButton?.addEventListener('click', () => document.querySelector('[data-mobile-view="library"]')?.click());
}

async function apiV14(path, options = {}) {
  const method = options.method || 'GET'; const headers = new Headers(options.headers || {});
  if (!['GET','HEAD'].includes(method)) headers.set('X-App-Request','sakuhin-log');
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type','application/json');
  const response = await fetch(path, {...options, method, headers});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `エラー ${response.status}`);
  return data;
}

function previousRandomIdsV14() {
  try { const value = JSON.parse(localStorage.getItem('sakuhin-log-random-history-v14') || '[]'); return Array.isArray(value) ? value.slice(0, 9) : []; } catch { return []; }
}
function rememberRandomV14(id) { localStorage.setItem('sakuhin-log-random-history-v14', JSON.stringify([id, ...previousRandomIdsV14().filter((value) => value !== id)].slice(0, 9))); }

function toastV14(message, type = 'success') {
  const region = document.querySelector('#toastRegion'); if (!region) return;
  const item = document.createElement('div'); item.className = `toast ${type === 'error' ? 'error' : ''}`; item.textContent = message; region.append(item); setTimeout(() => item.remove(), 4200);
}

function randomResultMarkupV14(work) {
  const genre = genreInfoV14(work); const status = {want:'読みたい',owned_unread:'所持・未読',active:'進行中',completed:'完了',paused:'一時停止',dropped:'中断'}[work.status] || work.status;
  return `<article class="v14-random-result" style="--genre-color:${genre.color}"><p class="v14-result-label">TODAY'S PICK</p><div class="v14-result-mark">${iconV14('bookmark')}</div><div class="v14-result-body"><span class="v14-genre-badge">${escapeV14(genre.name)}</span><h2>${escapeV14(work.title)}</h2><p class="v14-result-creator">${escapeV14(work.creator || '作者情報なし')}</p><p class="v14-result-status">${escapeV14(status)}</p></div><div class="v14-result-actions">${work.type === 'book' && ['want','owned_unread'].includes(work.status) ? `<button type="button" class="primary-button" data-v14-start="${escapeV14(work.id)}" data-version="${Number(work.version)}">${iconV14('play')}読み始める</button>` : ''}<button type="button" class="secondary-button" data-work-id="${escapeV14(work.id)}">${iconV14('arrow')}詳細を見る</button><button type="button" class="v14-quiet-link" data-v14-draw>${iconV14('shuffle')}もう一度</button></div></article>`;
}

async function drawRandomV14(button) {
  const stage = document.querySelector('#v14RandomStage'); if (!stage) return;
  const scope = document.querySelector('#v14RandomScope')?.value || 'next';
  button?.setAttribute('aria-busy','true'); button?.setAttribute('disabled','');
  stage.innerHTML = `<div class="v14-random-loading">${iconV14('shuffle')}<strong>棚をたどっています</strong></div>`;
  try {
    const exclude = previousRandomIdsV14().join(',');
    const data = await apiV14(`/api/random-work?scope=${encodeURIComponent(scope)}&exclude=${encodeURIComponent(exclude)}`);
    if (!data.item) {
      stage.innerHTML = `<div class="v14-random-empty">${iconV14('bookmark')}<strong>この棚には候補がありません</strong><p>抽選する棚を切り替えるか、作品を追加してください。</p></div>`; return;
    }
    worksV14.set(String(data.item.id), data.item); rememberRandomV14(String(data.item.id));
    stage.innerHTML = randomResultMarkupV14(data.item);
  } catch (error) {
    stage.innerHTML = `<div class="v14-random-empty is-error"><strong>作品を引けませんでした</strong><p>${escapeV14(error.message)}</p></div>`;
  } finally { button?.removeAttribute('aria-busy'); button?.removeAttribute('disabled'); enhanceButtonsV14(stage); }
}

async function startRandomWorkV14(button) {
  const id = button.dataset.v14Start; const version = Number(button.dataset.version); if (!id || !version) return;
  button.disabled = true;
  try {
    const data = await apiV14(`/api/works/${encodeURIComponent(id)}`, {method:'PATCH', body:JSON.stringify({version,status:'active'})});
    if (data.work) worksV14.set(String(data.work.id), data.work);
    button.innerHTML = `${iconV14('play')}読み始めました`; toastV14('読書中に変更しました。');
  } catch (error) { button.disabled = false; toastV14(error.message,'error'); }
}

function openRandomV14() {
  document.querySelector('.brand')?.click();
  setTimeout(() => document.querySelector('#v14RandomStage')?.scrollIntoView({behavior:'smooth',block:'center'}), 100);
}

function captureResponseV14(response, info) {
  if (!response.ok || !info || !(response.headers.get('content-type') || '').includes('application/json')) return;
  response.clone().json().then((data) => {
    if (info.pathname === '/api/works') (data.items || []).forEach((work) => worksV14.set(String(work.id), work));
    if (info.pathname === '/api/home') [...(data.reading || []), ...(data.recentOther || [])].forEach((work) => worksV14.set(String(work.id), work));
    if (info.pathname === '/api/random-work' && data.item) worksV14.set(String(data.item.id), data.item);
    const match = info.pathname.match(/^\/api\/works\/([^/]+)$/); if (match && data.work) worksV14.set(String(data.work.id), data.work);
    scheduleRefreshV14();
  }).catch(() => {});
}

window.fetch = async function fetchV14(input, init) {
  const response = await fetchBeforeV14(input, init);
  try { const source = typeof input === 'string' || input instanceof URL ? String(input) : input.url; captureResponseV14(response, new URL(source, location.origin)); } catch {}
  return response;
};

function decorateCardV14(card) {
  const work = worksV14.get(String(card.dataset.workId)); if (!work) return;
  const genre = genreInfoV14(work); card.style.setProperty('--genre-color', genre.color); card.dataset.v14Genre = genre.name;
  const chips = card.querySelectorAll('.label-chip'); chips.forEach((chip) => chip.classList.toggle('v14-primary-genre', chip.textContent.trim() === genre.name));
  if (!card.querySelector('.v14-card-genre')) {
    const top = card.querySelector('.work-card-top .type-status');
    top?.insertAdjacentHTML('beforeend', `<span class="v14-card-genre"><i></i>${escapeV14(genre.name)}</span>`);
  }
}

function decorateUiV14() {
  document.querySelectorAll('#workList .work-card[data-work-id]').forEach(decorateCardV14);
  document.querySelectorAll('.reading-card[data-work-id],.compact-item[data-work-id]').forEach((card) => {
    const work = worksV14.get(String(card.dataset.workId)); if (!work) return; card.style.setProperty('--genre-color', genreInfoV14(work).color); card.classList.add('v14-genre-surface');
  });
  const selected = document.querySelector('#detailPanel');
  const selectedId = document.querySelector('#workList .work-card[aria-current="true"]')?.dataset.workId;
  if (selected && selectedId && worksV14.has(String(selectedId))) selected.style.setProperty('--genre-color', genreInfoV14(worksV14.get(String(selectedId))).color);
  enhanceButtonsV14(document);
}

function scheduleRefreshV14() {
  if (refreshQueuedV14) return; refreshQueuedV14 = true;
  requestAnimationFrame(() => { refreshQueuedV14 = false; enhanceBrandV14(); enhanceButtonsV14(document); decorateUiV14(); });
}

function bindV14() {
  document.addEventListener('click', (event) => {
    const random = event.target.closest('[data-v14-random]'); if (random) { event.preventDefault(); event.stopPropagation(); openRandomV14(); return; }
    const draw = event.target.closest('[data-v14-draw]'); if (draw) { event.preventDefault(); drawRandomV14(draw); return; }
    const start = event.target.closest('[data-v14-start]'); if (start) { event.preventDefault(); startRandomWorkV14(start); }
  }, true);
  new MutationObserver(scheduleRefreshV14).observe(document.body, {childList:true,subtree:true});
}

function initV14() {
  ensureAssetsV14(); enhanceBrandV14(); mountHeaderRandomV14(); mountMobileNavV14(); mountRandomHeroV14(); enhanceButtonsV14(document); bindV14(); scheduleRefreshV14();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initV14, {once:true}); else initV14();
