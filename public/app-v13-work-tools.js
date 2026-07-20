const V13_STYLE = '/v13-work-tools.css';
const v13NativeFetch = window.fetch.bind(window);
const v13Works = new Map();
let v13DetailId = null;
let v13FactContext = null;
let v13PreferenceBusy = false;

function v13Escape(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function v13SafeUrl(value) {
  try {
    const url = new URL(String(value));
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch { return ''; }
}

function v13Toast(message, type = 'success') {
  const region = document.querySelector('#toastRegion');
  if (!region) return;
  const item = document.createElement('div');
  item.className = `toast ${type === 'error' ? 'error' : ''}`;
  item.textContent = message;
  region.append(item);
  setTimeout(() => item.remove(), 4200);
}

function v13RequestInfo(input, init) {
  const source = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
  if (!source) return null;
  try {
    const url = new URL(source, location.origin);
    const method = String(init?.method || input?.method || 'GET').toUpperCase();
    return { url, method };
  } catch { return null; }
}

function v13AddListFilters(url) {
  const favorite = document.querySelector('#filterFavorite')?.value || '';
  const ratingExact = document.querySelector('#filterRatingExact')?.value || '';
  if (favorite) url.searchParams.set('favorite', favorite);
  else url.searchParams.delete('favorite');
  if (ratingExact) {
    url.searchParams.set('rating_exact', ratingExact);
    url.searchParams.delete('rating_min');
  } else {
    url.searchParams.delete('rating_exact');
  }
}

async function v13CaptureResponse(response, info) {
  if (!response.ok || !info) return;
  const type = response.headers.get('content-type') || '';
  if (!type.includes('application/json')) return;
  try {
    const data = await response.clone().json();
    if (info.method === 'GET' && info.url.pathname === '/api/works') {
      (data.items || []).forEach((work) => v13Works.set(String(work.id), work));
    }
    const match = info.url.pathname.match(/^\/api\/works\/([^/]+)$/);
    if (match && info.method === 'GET' && data.work) {
      v13DetailId = decodeURIComponent(match[1]);
      v13Works.set(String(data.work.id), data.work);
    }
    if ((info.url.pathname.endsWith('/preferences') || info.url.pathname.endsWith('/facts')) && data.work) {
      v13DetailId = String(data.work.id);
      v13Works.set(String(data.work.id), data.work);
    }
    queueMicrotask(v13RefreshUi);
  } catch {}
}

window.fetch = async function v13Fetch(input, init) {
  const info = v13RequestInfo(input, init);
  let nextInput = input;
  if (info && info.method === 'GET' && info.url.origin === location.origin && info.url.pathname === '/api/works') {
    v13AddListFilters(info.url);
    nextInput = info.url.toString();
  }
  const response = await v13NativeFetch(nextInput, init);
  void v13CaptureResponse(response, v13RequestInfo(nextInput, init));
  return response;
};

function v13EnsureStyle() {
  if (document.querySelector(`link[href="${V13_STYLE}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = V13_STYLE;
  document.head.append(link);
}

function v13SetLabelText(label, text) {
  if (!label) return;
  const textNode = Array.from(label.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.nodeValue.trim());
  if (textNode) textNode.nodeValue = `${text}\n`;
}

function v13EnsureFilters() {
  const rating = document.querySelector('#filterRating');
  const sort = document.querySelector('#sortSelect');
  const panel = document.querySelector('.filter-panel');
  if (!rating || !sort || !panel) return;

  if (!rating.dataset.v13Ready) {
    const current = rating.value;
    rating.innerHTML = '<option value="">指定なし</option><option value="5">5のみ</option><option value="4">4以上</option><option value="3">3以上</option><option value="2">2以上</option><option value="1">1以上</option>';
    rating.value = current;
    rating.dataset.v13Ready = 'true';
    v13SetLabelText(rating.closest('label'), '評価（以上）');
  }

  if (!document.querySelector('#filterRatingExact')) {
    const exactLabel = document.createElement('label');
    exactLabel.className = 'field-label v13-filter-field';
    exactLabel.innerHTML = '評価（ぴったり）<select id="filterRatingExact"><option value="">すべて</option><option value="5">5</option><option value="4">4</option><option value="3">3</option><option value="2">2</option><option value="1">1</option><option value="unrated">未評価</option></select>';
    rating.closest('label')?.after(exactLabel);
  }

  if (!document.querySelector('#filterFavorite')) {
    const favoriteLabel = document.createElement('label');
    favoriteLabel.className = 'field-label v13-filter-field';
    favoriteLabel.innerHTML = 'お気に入り<select id="filterFavorite"><option value="">すべて</option><option value="true">栞を付けた作品</option><option value="false">栞なし</option></select>';
    document.querySelector('#filterRatingExact')?.closest('label')?.after(favoriteLabel);
  }

  if (!sort.querySelector('option[value="favorite_first"]')) {
    sort.insertAdjacentHTML('beforeend', '<option value="favorite_first">お気に入り・評価順</option><option value="rating_asc">評価が低い順</option>');
  }

  if (!document.querySelector('#v13ShelfTemperature')) {
    const legend = document.createElement('section');
    legend.id = 'v13ShelfTemperature';
    legend.className = 'v13-temperature-legend';
    legend.innerHTML = '<strong>棚の温度</strong><div><i data-level="1"></i><i data-level="2"></i><i data-level="3"></i><i data-level="4"></i><i data-level="5"></i><span>評価が高いほど朱色が深くなる</span></div><small><b>栞</b>はお気に入り</small>';
    panel.append(legend);
  }

  if (!document.querySelector('#v13ExtraFilters')) {
    const box = document.createElement('div');
    box.id = 'v13ExtraFilters';
    box.className = 'v13-extra-filter-chips';
    document.querySelector('#activeFilters')?.after(box);
  }
  v13RenderExtraFilters();
}

function v13TriggerListReload() {
  document.querySelector('#sortSelect')?.dispatchEvent(new Event('change', { bubbles: true }));
}

function v13RenderExtraFilters() {
  const box = document.querySelector('#v13ExtraFilters');
  if (!box) return;
  const favorite = document.querySelector('#filterFavorite')?.value || '';
  const rating = document.querySelector('#filterRatingExact')?.value || '';
  const chips = [];
  if (favorite === 'true') chips.push('<button type="button" data-v13-clear="favorite">お気に入りのみ ×</button>');
  if (favorite === 'false') chips.push('<button type="button" data-v13-clear="favorite">お気に入り以外 ×</button>');
  if (rating) chips.push(`<button type="button" data-v13-clear="rating">${rating === 'unrated' ? '未評価' : `評価 ${v13Escape(rating)}`} ×</button>`);
  box.innerHTML = chips.join('');
}

function v13NormalizeRatingSelect(select) {
  if (!select || select.dataset.v13Scale === 'true') return;
  const value = select.value;
  select.innerHTML = '<option value="">未評価</option><option value="5">5｜何度でも戻りたい</option><option value="4">4｜かなり好き</option><option value="3">3｜よかった</option><option value="2">2｜合わなかった</option><option value="1">1｜かなり合わなかった</option>';
  select.value = ['1', '2', '3', '4', '5'].includes(String(Math.round(Number(value)))) ? String(Math.round(Number(value))) : '';
  select.dataset.v13Scale = 'true';
}

function v13RatingLevel(work) {
  const rating = Number(work?.rating);
  return Number.isFinite(rating) && rating > 0 ? Math.min(5, Math.max(1, Math.round(rating))) : 0;
}

function v13RatingMarkup(level) {
  if (!level) return '<span class="v13-no-rating">未評価</span>';
  return `<span class="v13-rating-marks" aria-label="評価 ${level}/5">${[1, 2, 3, 4, 5].map((value) => `<i class="${value <= level ? 'is-on' : ''}"></i>`).join('')}</span>`;
}

function v13DecorateCards() {
  document.querySelectorAll('#workList .work-card[data-work-id]').forEach((card) => {
    const work = v13Works.get(String(card.dataset.workId));
    if (!work) return;
    const level = v13RatingLevel(work);
    for (let index = 0; index <= 5; index += 1) card.classList.toggle(`v13-rating-${index}`, index === level);
    const favorite = work.metadata?.favorite === true;
    card.classList.toggle('v13-favorite', favorite);
    let mark = card.querySelector('.v13-favorite-mark');
    if (!mark) {
      mark = document.createElement('span');
      mark.className = 'v13-favorite-mark';
      mark.setAttribute('aria-label', 'お気に入り');
      card.append(mark);
    }
    mark.textContent = favorite ? '栞' : '';
    const rating = card.querySelector('.rating');
    if (rating) rating.innerHTML = v13RatingMarkup(level);
  });
}

function v13FactRows(work) {
  const facts = work?.metadata?.ai_facts;
  if (!facts || typeof facts !== 'object') return '';
  const item = facts.work && typeof facts.work === 'object' ? facts.work : {};
  const labels = {
    original_title: '原題', publisher: '出版社', publication_date: '刊行日', isbn_10: 'ISBN-10', isbn_13: 'ISBN-13', language: '言語', country: '国・地域', series_name: 'シリーズ', volume_number: '巻', page_count: 'ページ数', official_url: '公式URL'
  };
  const rows = Object.entries(labels).flatMap(([key, label]) => {
    const value = item[key];
    if (value === undefined || value === null || value === '') return [];
    if (key === 'official_url') {
      const url = v13SafeUrl(value);
      return url ? [`<dt>${label}</dt><dd><a href="${v13Escape(url)}" target="_blank" rel="noopener">公式ページ ↗</a></dd>`] : [];
    }
    return [`<dt>${label}</dt><dd>${v13Escape(value)}</dd>`];
  });
  const creators = Array.isArray(facts.creators) ? facts.creators : [];
  const sources = Array.isArray(facts.sources) ? facts.sources : [];
  if (!rows.length && !creators.length && !sources.length) return '';
  return `<section class="detail-section v13-fact-section"><div class="v13-fact-heading"><div><h3>作品ファクト</h3><p>公開情報をもとに補完した事実欄</p></div><button type="button" class="text-button" data-v13-fact-open>JSONで更新</button></div>${rows.length ? `<dl>${rows.join('')}</dl>` : ''}${creators.map((creator) => `<article class="v13-creator-fact"><strong>${v13Escape(creator.name || '')}</strong>${creator.reading ? `<small>${v13Escape(creator.reading)}</small>` : ''}<p>${[creator.birth_year && `${creator.birth_year}年生`, creator.death_year && `${creator.death_year}年没`, creator.nationality, ...(Array.isArray(creator.occupations) ? creator.occupations : [])].filter(Boolean).map(v13Escape).join('・')}</p>${creator.biography ? `<div>${v13Escape(creator.biography)}</div>` : ''}</article>`).join('')}${sources.length ? `<div class="v13-fact-sources"><strong>出典 ${sources.length}件</strong>${sources.map((source) => { const url = v13SafeUrl(source.url); return url ? `<a href="${v13Escape(url)}" target="_blank" rel="noopener">${v13Escape(source.title || source.publisher || '出典')} ↗</a>` : ''; }).join('')}</div>` : ''}</section>`;
}

function v13PreferenceMarkup(work) {
  const favorite = work?.metadata?.favorite === true;
  const level = v13RatingLevel(work);
  return `<section class="v13-preference-panel" id="v13PreferencePanel"><button type="button" class="v13-favorite-button ${favorite ? 'is-on' : ''}" data-v13-favorite aria-pressed="${favorite}"><span>栞</span><strong>${favorite ? 'お気に入り' : 'お気に入りにする'}</strong></button><div class="v13-rating-picker"><span>自分の評価</span><div>${[1, 2, 3, 4, 5].map((value) => `<button type="button" data-v13-rating="${value}" class="${value <= level ? 'is-on' : ''}" aria-label="評価 ${value}" aria-pressed="${level === value}">${value}</button>`).join('')}<button type="button" class="v13-rating-clear" data-v13-rating="">未評価</button></div></div></section>`;
}

function v13DecorateDetail() {
  const panel = document.querySelector('#detailPanel');
  const header = panel?.querySelector('.detail-header');
  const work = v13Works.get(String(v13DetailId));
  if (!panel || !header || !work) return;

  panel.querySelector('#v13PreferencePanel')?.remove();
  header.insertAdjacentHTML('afterend', v13PreferenceMarkup(work));

  if (!header.querySelector('[data-v13-fact-open]')) {
    const actions = header.querySelector('.detail-actions');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ghost-button';
    button.dataset.v13FactOpen = '';
    button.textContent = 'AIで事実を補完';
    actions?.insertBefore(button, actions.lastElementChild);
  }

  panel.querySelector('.v13-fact-section')?.remove();
  const markup = v13FactRows(work);
  if (markup) {
    const progress = Array.from(panel.querySelectorAll('.detail-section')).find((section) => section.querySelector('h3')?.textContent === '進捗・情報');
    if (progress) progress.insertAdjacentHTML('beforebegin', markup);
    else header.insertAdjacentHTML('afterend', markup);
  }

  const rating = header.querySelector('.rating');
  if (rating) rating.innerHTML = v13RatingMarkup(v13RatingLevel(work));
}

function v13RefreshUi() {
  v13EnsureFilters();
  v13DecorateCards();
  v13DecorateDetail();
  v13NormalizeRatingSelect(document.querySelector('#workForm select[name="rating"]'));
  v13NormalizeRatingSelect(document.querySelector('#quickEditForm select[name="rating"]'));
}

async function v13Api(path, options = {}) {
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

function v13RefreshBaseDetail(id) {
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.dataset.workId = id;
  trigger.hidden = true;
  document.body.append(trigger);
  trigger.click();
  trigger.remove();
}

async function v13UpdatePreference(changes) {
  if (v13PreferenceBusy || !v13DetailId) return;
  const work = v13Works.get(String(v13DetailId));
  if (!work) return;
  v13PreferenceBusy = true;
  document.querySelector('#v13PreferencePanel')?.setAttribute('aria-busy', 'true');
  try {
    const data = await v13Api(`/api/works/${encodeURIComponent(v13DetailId)}/preferences`, {
      method: 'PATCH',
      body: JSON.stringify({ version: Number(work.version), ...changes })
    });
    v13Works.set(String(data.work.id), data.work);
    v13Toast(changes.favorite !== undefined ? (changes.favorite ? 'お気に入りに追加しました。' : 'お気に入りを外しました。') : changes.rating == null ? '評価を未設定にしました。' : `評価を${changes.rating}にしました。`);
    v13RefreshUi();
    v13TriggerListReload();
    setTimeout(() => v13RefreshBaseDetail(String(data.work.id)), 20);
  } catch (error) {
    v13Toast(error instanceof Error ? error.message : '更新に失敗しました。', 'error');
  } finally {
    v13PreferenceBusy = false;
    document.querySelector('#v13PreferencePanel')?.removeAttribute('aria-busy');
  }
}

function v13EnsureFactDialog() {
  if (document.querySelector('#v13FactDialog')) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'v13FactDialog';
  dialog.className = 'app-dialog v13-fact-dialog';
  dialog.innerHTML = `<form method="dialog" class="dialog-form"><header><div><p class="eyebrow">FACT JSON</p><h2>AIで事実情報を補完</h2><p class="dialog-lead">感想・評価・お気に入り・分類は変更しません。作者・刊行・ISBNなどの事実だけを扱います。</p></div><button type="button" class="icon-button" data-v13-fact-close aria-label="閉じる">×</button></header><section><div class="v13-text-heading"><label for="v13FactOutput">AIへ渡すテキスト</label><span>プロンプト＋作品JSON</span></div><textarea id="v13FactOutput" readonly rows="14"></textarea><div class="v13-copy-actions"><button type="button" class="primary-button" data-v13-copy="all">プロンプト＋JSONをコピー</button><button type="button" class="ghost-button" data-v13-copy="json">JSONだけコピー</button></div></section><section><div class="v13-text-heading"><label for="v13FactInput">AIから返ったJSON</label><span>ファイルではなく、ここへ貼り付け</span></div><textarea id="v13FactInput" rows="14" spellcheck="false" placeholder="{ &quot;schema_version&quot;: 1, ... }"></textarea><p class="v13-fact-safety">反映対象はホワイトリスト化された事実項目だけです。推測や未確認情報は空欄のままにしてください。</p><div class="form-error" id="v13FactError" role="alert"></div></section><footer><button type="button" class="ghost-button" data-v13-fact-close>キャンセル</button><button type="button" class="primary-button" data-v13-fact-import>事実情報を反映</button></footer></form>`;
  document.body.append(dialog);
}

async function v13OpenFactDialog() {
  if (!v13DetailId) return;
  v13EnsureFactDialog();
  const dialog = document.querySelector('#v13FactDialog');
  const output = dialog.querySelector('#v13FactOutput');
  const input = dialog.querySelector('#v13FactInput');
  const error = dialog.querySelector('#v13FactError');
  output.value = '読み込み中…';
  input.value = '';
  error.textContent = '';
  dialog.showModal();
  try {
    const data = await v13Api(`/api/works/${encodeURIComponent(v13DetailId)}/fact-package`);
    v13FactContext = { workId: v13DetailId, ...data };
    const jsonText = JSON.stringify(data.template, null, 2);
    output.value = `${data.prompt}\n\n--- 入力JSON ---\n${jsonText}`;
    output.dataset.json = jsonText;
  } catch (err) {
    output.value = '';
    error.textContent = err instanceof Error ? err.message : '読み込みに失敗しました。';
  }
}

async function v13Copy(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  document.body.append(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}

function v13ParseReturnedJson(raw) {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('JSONオブジェクトを貼り付けてください。');
  const template = v13FactContext?.template || {};
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

async function v13ImportFacts() {
  const dialog = document.querySelector('#v13FactDialog');
  const input = dialog?.querySelector('#v13FactInput');
  const error = dialog?.querySelector('#v13FactError');
  const button = dialog?.querySelector('[data-v13-fact-import]');
  if (!input || !error || !v13FactContext) return;
  error.textContent = '';
  try {
    const payload = v13ParseReturnedJson(input.value);
    button.disabled = true;
    button.textContent = '反映中…';
    const data = await v13Api(`/api/works/${encodeURIComponent(v13FactContext.workId)}/facts`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    v13Works.set(String(data.work.id), data.work);
    dialog.close();
    v13Toast('作者・刊行などの事実情報を反映しました。');
    v13RefreshUi();
    setTimeout(() => v13RefreshBaseDetail(String(data.work.id)), 20);
  } catch (err) {
    error.textContent = err instanceof Error ? err.message : 'JSONの反映に失敗しました。';
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = '事実情報を反映';
    }
  }
}

function v13BindEvents() {
  document.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    if (target.id === 'filterRating' && target.value) {
      const exact = document.querySelector('#filterRatingExact');
      if (exact) exact.value = '';
      v13RenderExtraFilters();
    }
    if (target.id === 'filterRatingExact') {
      if (target.value) document.querySelector('#filterRating').value = '';
      v13RenderExtraFilters();
      v13TriggerListReload();
    }
    if (target.id === 'filterFavorite') {
      v13RenderExtraFilters();
      v13TriggerListReload();
    }
  }, true);

  document.addEventListener('click', async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const favorite = target.closest('[data-v13-favorite]');
    if (favorite) {
      event.preventDefault();
      const work = v13Works.get(String(v13DetailId));
      await v13UpdatePreference({ favorite: work?.metadata?.favorite !== true });
      return;
    }
    const rating = target.closest('[data-v13-rating]');
    if (rating) {
      event.preventDefault();
      const raw = rating.dataset.v13Rating;
      await v13UpdatePreference({ rating: raw === '' ? null : Number(raw) });
      return;
    }
    if (target.closest('[data-v13-fact-open]')) {
      event.preventDefault();
      await v13OpenFactDialog();
      return;
    }
    const clear = target.closest('[data-v13-clear]')?.dataset.v13Clear;
    if (clear === 'favorite') {
      document.querySelector('#filterFavorite').value = '';
      v13RenderExtraFilters();
      v13TriggerListReload();
    }
    if (clear === 'rating') {
      document.querySelector('#filterRatingExact').value = '';
      v13RenderExtraFilters();
      v13TriggerListReload();
    }
    if (target.closest('[data-action="clear-filters"]')) {
      const favoriteFilter = document.querySelector('#filterFavorite');
      const exactFilter = document.querySelector('#filterRatingExact');
      if (favoriteFilter) favoriteFilter.value = '';
      if (exactFilter) exactFilter.value = '';
      v13RenderExtraFilters();
    }
    if (target.closest('[data-v13-fact-close]')) document.querySelector('#v13FactDialog')?.close();
    const copy = target.closest('[data-v13-copy]')?.dataset.v13Copy;
    if (copy) {
      const output = document.querySelector('#v13FactOutput');
      try {
        await v13Copy(copy === 'json' ? output.dataset.json || '' : output.value);
        v13Toast(copy === 'json' ? '作品JSONをコピーしました。' : 'プロンプトと作品JSONをコピーしました。');
      } catch { v13Toast('コピーできませんでした。', 'error'); }
    }
    if (target.closest('[data-v13-fact-import]')) await v13ImportFacts();
  });
}

function v13Start() {
  v13EnsureStyle();
  v13EnsureFactDialog();
  v13EnsureFilters();
  v13BindEvents();
  const observer = new MutationObserver(() => v13RefreshUi());
  observer.observe(document.body, { childList: true, subtree: true });
  v13RefreshUi();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', v13Start, { once: true });
else v13Start();
