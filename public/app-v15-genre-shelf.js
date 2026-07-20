const V15_STYLE = '/v15-genre-shelf.css';
const fetchBeforeV15 = window.fetch.bind(window);
const shelfCacheV15 = new Map();
let shelfScopeV15 = 'all';
let shelfControllerV15 = null;
let shelfExpandedV15 = false;
let activeShelfFilterV15 = null;
let applyingShelfFilterV15 = false;
let refreshQueuedV15 = false;

const SCOPE_LABELS_V15 = {
  all: 'すべて',
  unread: '未読・読みたい',
  active: '進行中',
  completed: '完了',
  favorite: 'お気に入り'
};

const escapeV15 = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[char]));

function requestInfoV15(input, init) {
  const source = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
  if (!source) return null;
  try {
    return {
      url: new URL(source, location.origin),
      method: String(init?.method || input?.method || 'GET').toUpperCase()
    };
  } catch { return null; }
}

function addShelfFiltersV15(url) {
  if (!activeShelfFilterV15) return;
  url.searchParams.set('genre_id', activeShelfFilterV15.genreId);
  if (activeShelfFilterV15.statuses) url.searchParams.set('statuses', activeShelfFilterV15.statuses);
  else url.searchParams.delete('statuses');
  if (activeShelfFilterV15.favorite) url.searchParams.set('favorite', 'true');
}

function isWorkMutationV15(info) {
  if (!info || ['GET', 'HEAD'].includes(info.method)) return false;
  return /^\/api\/works(?:\/|$)/.test(info.url.pathname);
}

window.fetch = async function fetchV15(input, init) {
  const info = requestInfoV15(input, init);
  let nextInput = input;
  if (info && info.method === 'GET' && info.url.origin === location.origin && info.url.pathname === '/api/works') {
    addShelfFiltersV15(info.url);
    nextInput = info.url.toString();
  }
  const response = await fetchBeforeV15(nextInput, init);
  if (response.ok && isWorkMutationV15(info)) {
    shelfCacheV15.clear();
    document.dispatchEvent(new CustomEvent('sakuhin-log:data-changed', { detail: { entity: 'work' } }));
  }
  return response;
};

function iconV15(name) {
  const paths = {
    shelf: '<path d="M4 5h4v14H4zM10 4h4v15h-4zM16 6h4v13h-4z"/><path d="M3 21h18"/>',
    arrow: '<path d="M5 12h14M14 7l5 5-5 5"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
    expand: '<path d="M7 10l5 5 5-5"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>'
  };
  return `<svg class="v15-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.shelf}</svg>`;
}

function ensureStyleV15() {
  if (document.querySelector(`link[href="${V15_STYLE}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = V15_STYLE;
  document.head.append(link);
}

function shelfShellV15() {
  return `<div class="v15-shelf-heading"><div><p class="v15-shelf-kicker">YOUR GENRE SHELF</p><h2>${iconV15('shelf')}あなたのジャンル棚</h2><p>作品数ではなく、いまの興味の厚みとして眺める棚。</p></div><div class="v15-shelf-summary" id="v15ShelfSummary" aria-live="polite"></div></div><div class="v15-scope-tabs" role="tablist" aria-label="棚の対象">${Object.entries(SCOPE_LABELS_V15).map(([value, label]) => `<button type="button" role="tab" aria-selected="${value === 'all'}" data-v15-scope="${value}">${escapeV15(label)}</button>`).join('')}</div><div id="v15ShelfBody" class="v15-shelf-body" aria-live="polite"></div><div id="v15ShelfInsights" class="v15-shelf-insights"></div>`;
}

function mountShelfV15() {
  const hero = document.querySelector('.hero-row');
  if (!hero || document.querySelector('#genreShelfV15')) return;
  const section = document.createElement('section');
  section.id = 'genreShelfV15';
  section.className = 'v15-genre-shelf';
  section.setAttribute('aria-labelledby', 'v15GenreShelfTitle');
  section.innerHTML = shelfShellV15();
  const title = section.querySelector('h2');
  if (title) title.id = 'v15GenreShelfTitle';
  hero.after(section);
  loadShelfV15('all');
}

function renderLoadingV15() {
  const body = document.querySelector('#v15ShelfBody');
  if (!body) return;
  body.innerHTML = `<div class="v15-shelf-loading" aria-label="ジャンル棚を読み込み中">${Array.from({ length: 8 }, (_, index) => `<i style="--delay:${index}"></i>`).join('')}</div>`;
}

function spineCountV15(count, maxCount) {
  if (count <= 0 || maxCount <= 0) return 2;
  return Math.max(2, Math.min(8, Math.round(2 + Math.sqrt(count / maxCount) * 6)));
}

function gridSpanV15(count, maxCount) {
  if (maxCount <= 0) return 2;
  const ratio = count / maxCount;
  if (ratio >= 0.72) return 4;
  if (ratio >= 0.38) return 3;
  return 2;
}

function shelfItemV15(genre, maxCount, index) {
  const spines = Array.from({ length: spineCountV15(genre.count, maxCount) }, (_, spineIndex) => `<i style="--spine:${spineIndex}" aria-hidden="true"></i>`).join('');
  const percent = Math.round(Number(genre.share || 0) * 100);
  return `<button type="button" class="v15-shelf-item ${index >= 6 ? 'is-secondary' : ''}" data-v15-genre="${escapeV15(genre.id)}" data-v15-name="${escapeV15(genre.name)}" style="--genre-color:${escapeV15(genre.color)};--shelf-span:${gridSpanV15(genre.count, maxCount)}"><span class="v15-spines">${spines}</span><span class="v15-shelf-item-copy"><strong>${escapeV15(genre.name)}</strong><small><b>${Number(genre.count).toLocaleString('ja-JP')}</b>作品・${percent}%</small></span>${iconV15('arrow')}</button>`;
}

function unclassifiedItemV15(data, index) {
  if (!data.unclassified) return '';
  return `<button type="button" class="v15-shelf-item is-unclassified ${index >= 6 ? 'is-secondary' : ''}" data-v15-genre="unclassified" data-v15-name="未分類" style="--genre-color:#858681;--shelf-span:2"><span class="v15-spines"><i></i><i></i><i></i></span><span class="v15-shelf-item-copy"><strong>未分類</strong><small><b>${Number(data.unclassified).toLocaleString('ja-JP')}</b>作品・整理前の棚</small></span>${iconV15('arrow')}</button>`;
}

function renderShelfV15(data) {
  const body = document.querySelector('#v15ShelfBody');
  const summary = document.querySelector('#v15ShelfSummary');
  const insights = document.querySelector('#v15ShelfInsights');
  if (!body || !summary || !insights) return;
  const genres = Array.isArray(data.genres) ? data.genres : [];
  const maxCount = Math.max(1, ...genres.map((genre) => Number(genre.count) || 0));
  summary.innerHTML = `<span><strong>${Number(data.total || 0).toLocaleString('ja-JP')}</strong>対象作品</span><span><strong>${Number(data.classified || 0).toLocaleString('ja-JP')}</strong>分類済み</span><span><strong>${Number(data.unclassified || 0).toLocaleString('ja-JP')}</strong>未分類</span>`;
  const items = genres.map((genre, index) => shelfItemV15(genre, maxCount, index)).join('') + unclassifiedItemV15(data, genres.length);
  body.innerHTML = items ? `<div class="v15-shelf-grid ${shelfExpandedV15 ? 'is-expanded' : ''}">${items}</div><button type="button" class="v15-shelf-expand" data-v15-expand aria-expanded="${shelfExpandedV15}">${iconV15('expand')}<span>${shelfExpandedV15 ? '棚をたたむ' : 'ほかの棚も見る'}</span></button>` : '<div class="v15-shelf-empty">この条件の作品はまだありません。</div>';
  const messages = Array.isArray(data.insights) ? data.insights : [];
  insights.innerHTML = messages.map((item, index) => `<article><span>${String(index + 1).padStart(2, '0')}</span><p>${escapeV15(item.text)}</p></article>`).join('');
  document.querySelectorAll('[data-v15-scope]').forEach((button) => button.setAttribute('aria-selected', String(button.dataset.v15Scope === data.scope)));
}

function renderShelfErrorV15(error) {
  const body = document.querySelector('#v15ShelfBody');
  if (!body) return;
  body.innerHTML = `<div class="v15-shelf-error"><strong>ジャンル棚を読み込めませんでした</strong><p>${escapeV15(error.message)}</p><button type="button" data-v15-retry>もう一度試す</button></div>`;
}

async function loadShelfV15(scope) {
  shelfScopeV15 = scope;
  const cached = shelfCacheV15.get(scope);
  if (cached) {
    renderShelfV15(cached);
    return;
  }
  shelfControllerV15?.abort();
  shelfControllerV15 = new AbortController();
  renderLoadingV15();
  try {
    const response = await fetch(`/api/insights/genres?scope=${encodeURIComponent(scope)}`, { signal: shelfControllerV15.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || `エラー ${response.status}`);
    shelfCacheV15.set(scope, data);
    renderShelfV15(data);
  } catch (error) {
    if (error.name !== 'AbortError') renderShelfErrorV15(error);
  }
}

function scopeFilterV15(scope) {
  if (scope === 'unread') return { statuses: 'want,owned_unread', favorite: false };
  if (scope === 'active') return { statuses: 'active', favorite: false };
  if (scope === 'completed') return { statuses: 'completed', favorite: false };
  if (scope === 'favorite') return { statuses: '', favorite: true };
  return { statuses: '', favorite: false };
}

function syncVisibleControlsV15(scope) {
  const status = document.querySelector('#filterStatus');
  const type = document.querySelector('#filterType');
  const label = document.querySelector('#filterLabel');
  const rating = document.querySelector('#filterRating');
  const ratingExact = document.querySelector('#filterRatingExact');
  const favorite = document.querySelector('#filterFavorite');
  const notes = document.querySelector('#filterNotes');
  if (type) type.value = '';
  if (status) status.value = scope === 'active' ? 'active' : scope === 'completed' ? 'completed' : '';
  if (label) label.value = '';
  if (rating) rating.value = '';
  if (ratingExact) ratingExact.value = '';
  if (favorite) favorite.value = scope === 'favorite' ? 'true' : '';
  if (notes) notes.checked = false;
}

function renderShelfFilterChipV15() {
  let chip = document.querySelector('#v15ShelfFilterChip');
  const anchor = document.querySelector('#activeFilters');
  if (!anchor) return;
  if (!chip) {
    chip = document.createElement('div');
    chip.id = 'v15ShelfFilterChip';
    chip.className = 'v15-shelf-filter-chip';
    anchor.after(chip);
  }
  if (!activeShelfFilterV15) {
    chip.hidden = true;
    chip.innerHTML = '';
    return;
  }
  chip.hidden = false;
  chip.innerHTML = `<span>${iconV15('layers')}棚から絞り込み</span><strong>${escapeV15(activeShelfFilterV15.name)}</strong><small>${escapeV15(SCOPE_LABELS_V15[activeShelfFilterV15.scope] || '')}</small><button type="button" data-v15-clear-filter aria-label="ジャンル棚の絞り込みを解除">${iconV15('close')}</button>`;
}

function navigateShelfV15(genreId, name) {
  const scopeFilter = scopeFilterV15(shelfScopeV15);
  activeShelfFilterV15 = { genreId, name, scope: shelfScopeV15, ...scopeFilter };
  applyingShelfFilterV15 = true;
  syncVisibleControlsV15(shelfScopeV15);
  document.querySelector('[data-mobile-view="library"]')?.click();
  document.querySelector('#sortSelect')?.dispatchEvent(new Event('change', { bubbles: true }));
  renderShelfFilterChipV15();
  queueMicrotask(() => { applyingShelfFilterV15 = false; });
}

function clearShelfFilterV15({ reload = true } = {}) {
  activeShelfFilterV15 = null;
  renderShelfFilterChipV15();
  if (reload) document.querySelector('[data-action="clear-filters"]')?.click();
}

function scheduleRefreshV15() {
  if (refreshQueuedV15) return;
  refreshQueuedV15 = true;
  requestAnimationFrame(() => {
    refreshQueuedV15 = false;
    mountShelfV15();
    renderShelfFilterChipV15();
  });
}

function bindShelfV15() {
  document.addEventListener('click', (event) => {
    const scope = event.target.closest('[data-v15-scope]')?.dataset.v15Scope;
    if (scope) { shelfExpandedV15 = false; loadShelfV15(scope); return; }
    const genre = event.target.closest('[data-v15-genre]');
    if (genre) { navigateShelfV15(genre.dataset.v15Genre, genre.dataset.v15Name); return; }
    if (event.target.closest('[data-v15-expand]')) {
      shelfExpandedV15 = !shelfExpandedV15;
      const data = shelfCacheV15.get(shelfScopeV15);
      if (data) renderShelfV15(data);
      return;
    }
    if (event.target.closest('[data-v15-retry]')) { shelfCacheV15.delete(shelfScopeV15); loadShelfV15(shelfScopeV15); return; }
    if (event.target.closest('[data-v15-clear-filter]')) { clearShelfFilterV15(); return; }
    if (!applyingShelfFilterV15 && activeShelfFilterV15 && event.target.closest('[data-action="clear-filters"],[data-preset]')) clearShelfFilterV15({ reload: false });
  }, true);
  document.addEventListener('change', (event) => {
    if (applyingShelfFilterV15 || !activeShelfFilterV15) return;
    if (event.target.matches('#filterType,#filterStatus,#filterRating,#filterRatingExact,#filterFavorite,#filterNotes,#sortSelect')) clearShelfFilterV15({ reload: false });
  }, true);
  document.addEventListener('input', (event) => {
    if (applyingShelfFilterV15 || !activeShelfFilterV15) return;
    if (event.target.matches('#globalSearch,#filterLabel')) clearShelfFilterV15({ reload: false });
  }, true);
  document.addEventListener('sakuhin-log:data-changed', () => {
    shelfCacheV15.clear();
    if (!document.querySelector('#homeView')?.hidden) loadShelfV15(shelfScopeV15);
  });
  new MutationObserver(scheduleRefreshV15).observe(document.body, { childList: true, subtree: true });
}

function initShelfV15() {
  ensureStyleV15();
  mountShelfV15();
  bindShelfV15();
  scheduleRefreshV15();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initShelfV15, { once: true });
else initShelfV15();
