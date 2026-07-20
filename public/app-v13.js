const V13_STYLE = '/v13-work-tools.css';
const nativeFetchV13 = window.fetch.bind(window);
const worksV13 = new Map();
let detailIdV13 = null;
let factContextV13 = null;
let preferenceBusyV13 = false;
let refreshPendingV13 = false;

const escV13 = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

function safeUrlV13(value) {
  try {
    const url = new URL(String(value));
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch { return ''; }
}

function toastV13(message, type = 'success') {
  const region = document.querySelector('#toastRegion');
  if (!region) return;
  const item = document.createElement('div');
  item.className = `toast ${type === 'error' ? 'error' : ''}`;
  item.textContent = message;
  region.append(item);
  setTimeout(() => item.remove(), 4200);
}

function requestInfoV13(input, init) {
  const source = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
  if (!source) return null;
  try {
    return {
      url: new URL(source, location.origin),
      method: String(init?.method || input?.method || 'GET').toUpperCase()
    };
  } catch { return null; }
}

function addListFiltersV13(url) {
  const favorite = document.querySelector('#filterFavorite')?.value || '';
  const ratingExact = document.querySelector('#filterRatingExact')?.value || '';
  if (favorite) url.searchParams.set('favorite', favorite);
  else url.searchParams.delete('favorite');
  if (ratingExact) {
    url.searchParams.set('rating_exact', ratingExact);
    url.searchParams.delete('rating_min');
  } else url.searchParams.delete('rating_exact');
}

function scheduleRefreshV13() {
  if (refreshPendingV13) return;
  refreshPendingV13 = true;
  requestAnimationFrame(() => {
    refreshPendingV13 = false;
    refreshUiV13();
  });
}

async function captureResponseV13(response, info) {
  if (!response.ok || !info || !(response.headers.get('content-type') || '').includes('application/json')) return;
  try {
    const data = await response.clone().json();
    if (info.method === 'GET' && info.url.pathname === '/api/works') {
      (data.items || []).forEach((work) => worksV13.set(String(work.id), work));
    }
    const detailMatch = info.url.pathname.match(/^\/api\/works\/([^/]+)$/);
    if (detailMatch && info.method === 'GET' && data.work) {
      detailIdV13 = decodeURIComponent(detailMatch[1]);
      worksV13.set(String(data.work.id), data.work);
    }
    if ((info.url.pathname.endsWith('/preferences') || info.url.pathname.endsWith('/facts')) && data.work) {
      detailIdV13 = String(data.work.id);
      worksV13.set(String(data.work.id), data.work);
    }
    scheduleRefreshV13();
  } catch {}
}

window.fetch = async function fetchV13(input, init) {
  const originalInfo = requestInfoV13(input, init);
  let nextInput = input;
  if (originalInfo && originalInfo.method === 'GET' && originalInfo.url.origin === location.origin && originalInfo.url.pathname === '/api/works') {
    addListFiltersV13(originalInfo.url);
    nextInput = originalInfo.url.toString();
  }
  const response = await nativeFetchV13(nextInput, init);
  void captureResponseV13(response, requestInfoV13(nextInput, init));
  return response;
};

function ensureStyleV13() {
  if (document.querySelector(`link[href="${V13_STYLE}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = V13_STYLE;
  document.head.append(link);
}

function setLabelTextV13(label, text) {
  if (!label) return;
  const node = Array.from(label.childNodes).find((item) => item.nodeType === Node.TEXT_NODE && item.nodeValue.trim());
  if (node && node.nodeValue.trim() !== text) node.nodeValue = `${text}\n`;
}

function ensureFiltersV13() {
  const rating = document.querySelector('#filterRating');
  const sort = document.querySelector('#sortSelect');
  const panel = document.querySelector('.filter-panel');
  if (!rating || !sort || !panel) return;

  if (rating.dataset.v13Ready !== 'true') {
    const current = rating.value;
    rating.innerHTML = '<option value="">指定なし</option><option value="5">5のみ</option><option value="4">4以上</option><option value="3">3以上</option><option value="2">2以上</option><option value="1">1以上</option>';
    rating.value = current;
    rating.dataset.v13Ready = 'true';
    setLabelTextV13(rating.closest('label'), '評価（以上）');
  }

  if (!document.querySelector('#filterRatingExact')) {
    const label = document.createElement('label');
    label.className = 'field-label v13-filter-field';
    label.innerHTML = '評価（ぴったり）<select id="filterRatingExact"><option value="">すべて</option><option value="5">5</option><option value="4">4</option><option value="3">3</option><option value="2">2</option><option value="1">1</option><option value="unrated">未評価</option></select>';
    rating.closest('label')?.after(label);
  }

  if (!document.querySelector('#filterFavorite')) {
    const label = document.createElement('label');
    label.className = 'field-label v13-filter-field';
    label.innerHTML = 'お気に入り<select id="filterFavorite"><option value="">すべて</option><option value="true">栞を付けた作品</option><option value="false">栞なし</option></select>';
    document.querySelector('#filterRatingExact')?.closest('label')?.after(label);
  }

  if (!sort.querySelector('option[value="favorite_first"]')) {
    sort.insertAdjacentHTML('beforeend', '<option value="favorite_first">お気に入り・評価順</option><option value="rating_asc">評価が低い順</option>');
  }

  if (!document.querySelector('#v13ShelfTemperature')) {
    const legend = document.createElement('section');
    legend.id = 'v13ShelfTemperature';
    legend.className = 'v13-temperature-legend';
    legend.innerHTML = '<strong>棚の温度</strong><div><i data-level="1"></i><i data-level="2"></i><i data-level="3"></i><i data-level="4"></i><i data-level="5"></i></div><p>評価が高いほど朱色が深くなる。<b>栞</b>はお気に入り。</p>';
    panel.append(legend);
  }

  if (!document.querySelector('#v13ExtraFilters')) {
    const chips = document.createElement('div');
    chips.id = 'v13ExtraFilters';
    chips.className = 'v13-extra-filter-chips';
    document.querySelector('#activeFilters')?.after(chips);
  }
  renderExtraFiltersV13();
}

function renderExtraFiltersV13() {
  const box = document.querySelector('#v13ExtraFilters');
  if (!box) return;
  const favorite = document.querySelector('#filterFavorite')?.value || '';
  const rating = document.querySelector('#filterRatingExact')?.value || '';
  const markup = [
    favorite === 'true' ? '<button type="button" data-v13-clear="favorite">お気に入りのみ ×</button>' : '',
    favorite === 'false' ? '<button type="button" data-v13-clear="favorite">栞なし ×</button>' : '',
    rating ? `<button type="button" data-v13-clear="rating">${rating === 'unrated' ? '未評価' : `評価 ${escV13(rating)}`} ×</button>` : ''
  ].join('');
  if (box.innerHTML !== markup) box.innerHTML = markup;
}

function triggerListReloadV13() {
  document.querySelector('#sortSelect')?.dispatchEvent(new Event('change', { bubbles: true }));
}

function normalizeRatingSelectV13(select) {
  if (!select || select.dataset.v13Scale === 'true') return;
  const current = Number(select.value);
  select.innerHTML = '<option value="">未評価</option><option value="5">5｜何度でも戻りたい</option><option value="4">4｜かなり好き</option><option value="3">3｜よかった</option><option value="2">2｜合わなかった</option><option value="1">1｜かなり合わなかった</option>';
  const rounded = Math.round(current);
  select.value = rounded >= 1 && rounded <= 5 ? String(rounded) : '';
  select.dataset.v13Scale = 'true';
}

function ratingLevelV13(work) {
  const value = Number(work?.rating);
  return Number.isFinite(value) && value > 0 ? Math.min(5, Math.max(1, Math.round(value))) : 0;
}

function ratingMarkupV13(level) {
  if (!level) return '<span class="v13-no-rating">未評価</span>';
  return `<span class="v13-rating-marks" aria-label="評価 ${level}/5">${[1, 2, 3, 4, 5].map((value) => `<i class="${value <= level ? 'is-on' : ''}"></i>`).join('')}</span>`;
}

function decorateCardsV13() {
  document.querySelectorAll('#workList .work-card[data-work-id]').forEach((card) => {
    const work = worksV13.get(String(card.dataset.workId));
    if (!work) return;
    const level = ratingLevelV13(work);
    if (card.dataset.v13Level !== String(level)) {
      for (let value = 0; value <= 5; value += 1) card.classList.toggle(`v13-rating-${value}`, value === level);
      const rating = card.querySelector('.rating');
      if (rating) rating.innerHTML = ratingMarkupV13(level);
      card.dataset.v13Level = String(level);
    }
    const favorite = work.metadata?.favorite === true;
    if (card.dataset.v13Favorite !== String(favorite)) {
      card.classList.toggle('v13-favorite', favorite);
      let mark = card.querySelector('.v13-favorite-mark');
      if (!mark) {
        mark = document.createElement('span');
        mark.className = 'v13-favorite-mark';
        mark.setAttribute('aria-label', 'お気に入り');
        card.append(mark);
      }
      mark.textContent = favorite ? '栞' : '';
      card.dataset.v13Favorite = String(favorite);
    }
  });
}

function preferenceMarkupV13(work) {
  const favorite = work?.metadata?.favorite === true;
  const level = ratingLevelV13(work);
  return `<section class="v13-preference-panel" id="v13PreferencePanel" data-signature="${escV13(`${work.version}:${favorite}:${level}`)}"><button type="button" class="v13-favorite-button ${favorite ? 'is-on' : ''}" data-v13-favorite aria-pressed="${favorite}"><span>栞</span><strong>${favorite ? 'お気に入り' : 'お気に入りにする'}</strong></button><div class="v13-rating-picker"><span>自分の評価</span><div>${[1, 2, 3, 4, 5].map((value) => `<button type="button" data-v13-rating="${value}" class="${value <= level ? 'is-on' : ''}" aria-label="評価 ${value}" aria-pressed="${level === value}">${value}</button>`).join('')}<button type="button" class="v13-rating-clear" data-v13-rating="">未評価</button></div></div></section>`;
}

function factMarkupV13(work) {
  const facts = work?.metadata?.ai_facts;
  if (!facts || typeof facts !== 'object') return '';
  const item = facts.work && typeof facts.work === 'object' ? facts.work : {};
  const labelMap = {
    original_title: '原題', publisher: '出版社', publication_date: '刊行日', isbn_10: 'ISBN-10', isbn_13: 'ISBN-13', language: '言語', country: '国・地域', series_name: 'シリーズ', volume_number: '巻', page_count: 'ページ数', official_url: '公式URL'
  };
  const rows = Object.entries(labelMap).flatMap(([key, label]) => {
    const value = item[key];
    if (value === undefined || value === null || value === '') return [];
    if (key === 'official_url') {
      const url = safeUrlV13(value);
      return url ? [`<dt>${label}</dt><dd><a href="${escV13(url)}" target="_blank" rel="noopener">公式ページ ↗</a></dd>`] : [];
    }
    return [`<dt>${label}</dt><dd>${escV13(value)}</dd>`];
  });
  const creators = Array.isArray(facts.creators) ? facts.creators : [];
  const sources = Array.isArray(facts.sources) ? facts.sources : [];
  if (!rows.length && !creators.length && !sources.length) return '';
  const signature = escV13(String(facts.updated_at || work.version));
  return `<section class="detail-section v13-fact-section" data-signature="${signature}"><div class="v13-fact-heading"><div><h3>作品ファクト</h3><p>公開情報をもとに補完した事実欄</p></div><button type="button" class="text-button" data-v13-fact-open>JSONで更新</button></div>${rows.length ? `<dl>${rows.join('')}</dl>` : ''}${creators.map((creator) => `<article class="v13-creator-fact"><strong>${escV13(creator.name || '')}</strong>${creator.reading ? `<small>${escV13(creator.reading)}</small>` : ''}<p>${[creator.birth_year && `${creator.birth_year}年生`, creator.death_year && `${creator.death_year}年没`, creator.nationality, ...(Array.isArray(creator.occupations) ? creator.occupations : [])].filter(Boolean).map((value) => escV13(value)).join('・')}</p>${creator.biography ? `<div>${escV13(creator.biography)}</div>` : ''}</article>`).join('')}${sources.length ? `<div class="v13-fact-sources"><strong>出典 ${sources.length}件</strong>${sources.map((source) => { const url = safeUrlV13(source.url); return url ? `<a href="${escV13(url)}" target="_blank" rel="noopener">${escV13(source.title || source.publisher || '出典')} ↗</a>` : ''; }).join('')}</div>` : ''}</section>`;
}

function decorateDetailV13() {
  const panel = document.querySelector('#detailPanel');
  const header = panel?.querySelector('.detail-header');
  const work = worksV13.get(String(detailIdV13));
  if (!panel || !header || !work) return;

  const preference = panel.querySelector('#v13PreferencePanel');
  const preferenceSignature = `${work.version}:${work.metadata?.favorite === true}:${ratingLevelV13(work)}`;
  if (!preference || preference.dataset.signature !== preferenceSignature) {
    if (preference) preference.outerHTML = preferenceMarkupV13(work);
    else header.insertAdjacentHTML('afterend', preferenceMarkupV13(work));
  }

  if (!header.querySelector('[data-v13-fact-open]')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ghost-button';
    button.dataset.v13FactOpen = '';
    button.textContent = 'AIで事実を補完';
    const actions = header.querySelector('.detail-actions');
    actions?.insertBefore(button, actions.lastElementChild);
  }

  const expectedFact = factMarkupV13(work);
  const factSection = panel.querySelector('.v13-fact-section');
  if (!expectedFact && factSection) factSection.remove();
  if (expectedFact) {
    const signature = String(work.metadata?.ai_facts?.updated_at || work.version);
    if (!factSection || factSection.dataset.signature !== signature) {
      if (factSection) factSection.outerHTML = expectedFact;
      else {
        const progress = Array.from(panel.querySelectorAll('.detail-section')).find((section) => section.querySelector('h3')?.textContent === '進捗・情報');
        if (progress) progress.insertAdjacentHTML('beforebegin', expectedFact);
        else header.insertAdjacentHTML('afterend', expectedFact);
      }
    }
  }

  const rating = header.querySelector('.rating');
  const level = ratingLevelV13(work);
  if (rating && rating.dataset.v13Level !== String(level)) {
    rating.innerHTML = ratingMarkupV13(level);
    rating.dataset.v13Level = String(level);
  }
}

function refreshUiV13() {
  ensureFiltersV13();
  decorateCardsV13();
  decorateDetailV13();
  normalizeRatingSelectV13(document.querySelector('#workForm select[name="rating"]'));
  normalizeRatingSelectV13(document.querySelector('#quickEditForm select[name="rating"]'));
}

async function apiV13(path, options = {}) {
  const method = options.method || 'GET';
  const headers = new Headers(options.headers || {});
  if (!['GET', 'HEAD'].includes(method)) headers.set('X-App-Request', 'sakuhin-log');
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...options, method, headers });
  const type = response.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await response.json().catch(() => ({})) : null;
  if (!response.ok) throw new Error(data?.error?.message || `エラー ${response.status}`);
  return data;
}

function refreshBaseDetailV13(id) {
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.dataset.workId = id;
  trigger.hidden = true;
  document.body.append(trigger);
  trigger.click();
  trigger.remove();
}

async function updatePreferenceV13(changes) {
  if (preferenceBusyV13 || !detailIdV13) return;
  const work = worksV13.get(String(detailIdV13));
  if (!work) return;
  preferenceBusyV13 = true;
  document.querySelector('#v13PreferencePanel')?.setAttribute('aria-busy', 'true');
  try {
    const data = await apiV13(`/api/works/${encodeURIComponent(detailIdV13)}/preferences`, {
      method: 'PATCH',
      body: JSON.stringify({ version: Number(work.version), ...changes })
    });
    worksV13.set(String(data.work.id), data.work);
    toastV13(changes.favorite !== undefined ? (changes.favorite ? 'お気に入りに追加しました。' : 'お気に入りを外しました。') : changes.rating == null ? '評価を未設定にしました。' : `評価を${changes.rating}にしました。`);
    scheduleRefreshV13();
    triggerListReloadV13();
    setTimeout(() => refreshBaseDetailV13(String(data.work.id)), 20);
  } catch (error) {
    toastV13(error instanceof Error ? error.message : '更新に失敗しました。', 'error');
  } finally {
    preferenceBusyV13 = false;
    document.querySelector('#v13PreferencePanel')?.removeAttribute('aria-busy');
  }
}

function ensureFactDialogV13() {
  if (document.querySelector('#v13FactDialog')) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'v13FactDialog';
  dialog.className = 'app-dialog v13-fact-dialog';
  dialog.innerHTML = `<form method="dialog" class="dialog-form"><header><div><p class="eyebrow">FACT JSON</p><h2>AIで事実情報を補完</h2><p class="dialog-lead">感想・評価・お気に入り・分類は変更しません。作者・刊行・ISBNなどの事実だけを扱います。</p></div><button type="button" class="icon-button" data-v13-fact-close aria-label="閉じる">×</button></header><section><div class="v13-text-heading"><label for="v13FactOutput">AIへ渡すテキスト</label><span>プロンプト＋作品JSON</span></div><textarea id="v13FactOutput" readonly rows="14"></textarea><div class="v13-copy-actions"><button type="button" class="primary-button" data-v13-copy="all">プロンプト＋JSONをコピー</button><button type="button" class="ghost-button" data-v13-copy="json">JSONだけコピー</button></div></section><section><div class="v13-text-heading"><label for="v13FactInput">AIから返ったJSON</label><span>ファイルではなく、ここへ貼り付け</span></div><textarea id="v13FactInput" rows="14" spellcheck="false" placeholder="{ &quot;schema_version&quot;: 1, ... }"></textarea><p class="v13-fact-safety">反映対象はホワイトリスト化された事実項目だけです。推測や未確認情報は空欄のままにしてください。</p><div class="form-error" id="v13FactError" role="alert"></div></section><footer><button type="button" class="ghost-button" data-v13-fact-close>キャンセル</button><button type="button" class="primary-button" data-v13-fact-import>事実情報を反映</button></footer></form>`;
  document.body.append(dialog);
}

async function openFactDialogV13() {
  if (!detailIdV13) return;
  ensureFactDialogV13();
  const dialog = document.querySelector('#v13FactDialog');
  const output = dialog.querySelector('#v13FactOutput');
  const input = dialog.querySelector('#v13FactInput');
  const error = dialog.querySelector('#v13FactError');
  output.value = '読み込み中…';
  input.value = '';
  error.textContent = '';
  dialog.showModal();
  try {
    const data = await apiV13(`/api/works/${encodeURIComponent(detailIdV13)}/fact-package`);
    factContextV13 = { workId: detailIdV13, ...data };
    const jsonText = JSON.stringify(data.template, null, 2);
    output.value = `${data.prompt}\n\n--- 入力JSON ---\n${jsonText}`;
    output.dataset.json = jsonText;
  } catch (errorValue) {
    output.value = '';
    error.textContent = errorValue instanceof Error ? errorValue.message : '読み込みに失敗しました。';
  }
}

async function copyV13(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const area = document.createElement('textarea');
  area.value = text;
  document.body.append(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}

function parseReturnedJsonV13(raw) {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('JSONオブジェクトを貼り付けてください。');
  const template = factContextV13?.template || {};
  if (!parsed.facts && (parsed.work || parsed.creators || parsed.sources || parsed.creator_display || parsed.release_year)) {
    parsed.facts = {
      creator_display: parsed.creator_display ?? null,
      release_year: parsed.release_year ?? null,
      work: parsed.work ?? {},
      creators: parsed.creators ?? [],
      sources: parsed.sources ?? []
    };
  }
  parsed.schema_version ??= template.schema_version ?? 1;
  parsed.work_id ??= template.work_id;
  parsed.version ??= template.version;
  return parsed;
}

async function importFactsV13() {
  const dialog = document.querySelector('#v13FactDialog');
  const input = dialog?.querySelector('#v13FactInput');
  const error = dialog?.querySelector('#v13FactError');
  const button = dialog?.querySelector('[data-v13-fact-import]');
  if (!input || !error || !factContextV13) return;
  error.textContent = '';
  try {
    const payload = parseReturnedJsonV13(input.value);
    button.disabled = true;
    button.textContent = '反映中…';
    const data = await apiV13(`/api/works/${encodeURIComponent(factContextV13.workId)}/facts`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    worksV13.set(String(data.work.id), data.work);
    dialog.close();
    toastV13('作者・刊行などの事実情報を反映しました。');
    scheduleRefreshV13();
    setTimeout(() => refreshBaseDetailV13(String(data.work.id)), 20);
  } catch (errorValue) {
    error.textContent = errorValue instanceof Error ? errorValue.message : 'JSONの反映に失敗しました。';
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = '事実情報を反映';
    }
  }
}

function bindEventsV13() {
  document.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    if (target.id === 'filterRating' && target.value) {
      const exact = document.querySelector('#filterRatingExact');
      if (exact) exact.value = '';
      renderExtraFiltersV13();
    }
    if (target.id === 'filterRatingExact') {
      if (target.value) document.querySelector('#filterRating').value = '';
      renderExtraFiltersV13();
      triggerListReloadV13();
    }
    if (target.id === 'filterFavorite') {
      renderExtraFiltersV13();
      triggerListReloadV13();
    }
  }, true);

  document.addEventListener('click', async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('[data-v13-favorite]')) {
      event.preventDefault();
      const work = worksV13.get(String(detailIdV13));
      await updatePreferenceV13({ favorite: work?.metadata?.favorite !== true });
      return;
    }
    const rating = target.closest('[data-v13-rating]');
    if (rating) {
      event.preventDefault();
      await updatePreferenceV13({ rating: rating.dataset.v13Rating === '' ? null : Number(rating.dataset.v13Rating) });
      return;
    }
    if (target.closest('[data-v13-fact-open]')) {
      event.preventDefault();
      await openFactDialogV13();
      return;
    }
    const clear = target.closest('[data-v13-clear]')?.dataset.v13Clear;
    if (clear === 'favorite') {
      document.querySelector('#filterFavorite').value = '';
      renderExtraFiltersV13();
      triggerListReloadV13();
    }
    if (clear === 'rating') {
      document.querySelector('#filterRatingExact').value = '';
      renderExtraFiltersV13();
      triggerListReloadV13();
    }
    if (target.closest('[data-action="clear-filters"]')) {
      const favorite = document.querySelector('#filterFavorite');
      const ratingExact = document.querySelector('#filterRatingExact');
      if (favorite) favorite.value = '';
      if (ratingExact) ratingExact.value = '';
      renderExtraFiltersV13();
    }
    if (target.closest('[data-v13-fact-close]')) document.querySelector('#v13FactDialog')?.close();
    const copyMode = target.closest('[data-v13-copy]')?.dataset.v13Copy;
    if (copyMode) {
      const output = document.querySelector('#v13FactOutput');
      try {
        await copyV13(copyMode === 'json' ? output.dataset.json || '' : output.value);
        toastV13(copyMode === 'json' ? '作品JSONをコピーしました。' : 'プロンプトと作品JSONをコピーしました。');
      } catch { toastV13('コピーできませんでした。', 'error'); }
    }
    if (target.closest('[data-v13-fact-import]')) await importFactsV13();
  });
}

function startV13() {
  ensureStyleV13();
  ensureFactDialogV13();
  ensureFiltersV13();
  bindEventsV13();
  const observer = new MutationObserver(scheduleRefreshV13);
  observer.observe(document.body, { childList: true, subtree: true });
  refreshUiV13();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startV13, { once: true });
else startV13();
