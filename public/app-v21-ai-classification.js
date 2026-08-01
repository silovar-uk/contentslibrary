const V21_STYLE = '/v21-ai-classification.css';
const fetchBeforeV21 = window.fetch.bind(window);
const worksV21 = new Map();
const vocabularyV21 = { genre: [], theme: [], tag: [] };
let detailIdV21 = null;
let factPackageV21 = null;
let refreshQueuedV21 = false;
let vocabularyLoadedV21 = false;

const LABEL_NAMES_V21 = { genre: 'ジャンル', theme: 'テーマ', tag: 'タグ' };
const LABEL_HELP_V21 = {
  genre: '作品の一般的な分野。1〜3件を目安にします。',
  theme: '作品が扱う主題や問題意識。1〜5件を目安にします。',
  tag: '自分用の管理印。AIは既存タグ以外を新しく作りません。'
};

const escapeV21 = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[char]));

const normalizeV21 = (value = '') => String(value).normalize('NFKC').trim().toLowerCase();

function requestInfoV21(input, init) {
  const source = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
  if (!source) return null;
  try {
    return {
      url: new URL(source, location.origin),
      method: String(init?.method || input?.method || 'GET').toUpperCase()
    };
  } catch { return null; }
}

async function captureResponseV21(response, info) {
  if (!response.ok || !info || !(response.headers.get('content-type') || '').includes('application/json')) return;
  try {
    const data = await response.clone().json();
    if (info.method === 'GET' && info.url.pathname === '/api/works') {
      (data.items || []).forEach((work) => worksV21.set(String(work.id), work));
    }
    const detailMatch = info.url.pathname.match(/^\/api\/works\/([^/]+)$/);
    if (detailMatch && data.work) {
      detailIdV21 = decodeURIComponent(detailMatch[1]);
      worksV21.set(String(data.work.id), data.work);
    }
    const factsMatch = info.url.pathname.match(/^\/api\/works\/([^/]+)\/facts$/);
    if (factsMatch && data.work) {
      detailIdV21 = String(data.work.id);
      worksV21.set(String(data.work.id), data.work);
    }
    const packageMatch = info.url.pathname.match(/^\/api\/works\/([^/]+)\/fact-package$/);
    if (packageMatch && data.template) {
      factPackageV21 = { workId: decodeURIComponent(packageMatch[1]), ...data };
    }
    scheduleRefreshV21();
  } catch {}
}

window.fetch = async function fetchV21(input, init) {
  const response = await fetchBeforeV21(input, init);
  void captureResponseV21(response, requestInfoV21(input, init));
  return response;
};

function ensureStyleV21() {
  if (document.querySelector(`link[href="${V21_STYLE}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = V21_STYLE;
  document.head.append(link);
}

function scheduleRefreshV21() {
  if (refreshQueuedV21) return;
  refreshQueuedV21 = true;
  requestAnimationFrame(() => {
    refreshQueuedV21 = false;
    refreshUiV21();
  });
}

async function loadVocabularyV21() {
  if (vocabularyLoadedV21) return;
  vocabularyLoadedV21 = true;
  await Promise.all(['genre', 'theme', 'tag'].map(async (kind) => {
    try {
      const response = await fetch(`/api/labels?kind=${kind}&limit=50`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return;
      vocabularyV21[kind] = Array.from(new Set((data.items || []).map((item) => String(item.name || '').trim()).filter(Boolean)));
    } catch {}
  }));
  renderDatalistsV21();
  renderFactPreviewV21();
}

function renderDatalistsV21() {
  for (const kind of ['genre', 'theme', 'tag']) {
    const list = document.querySelector(`#v21-${kind}-list`);
    if (!list) continue;
    const markup = vocabularyV21[kind].map((value) => `<option value="${escapeV21(value)}"></option>`).join('');
    if (list.innerHTML !== markup) list.innerHTML = markup;
  }
}

function ensureLabelFieldV21(form, kind) {
  const input = form.elements[kind];
  const label = input?.closest('label');
  if (!input || !label) return;
  input.setAttribute('list', `v21-${kind}-list`);
  input.placeholder = kind === 'genre' ? '例：ビジネス・経済, ミステリー' : kind === 'theme' ? '例：組織, 意思決定' : '例：再読したい, 仕事で使う';
  if (!label.querySelector('.v21-label-help')) {
    const help = document.createElement('small');
    help.className = 'v21-label-help';
    help.textContent = LABEL_HELP_V21[kind];
    input.after(help);
  }
  if (!document.querySelector(`#v21-${kind}-list`)) {
    const list = document.createElement('datalist');
    list.id = `v21-${kind}-list`;
    document.body.append(list);
  }
}

function enhanceWorkFormV21() {
  const form = document.querySelector('#workForm');
  if (!form) return;
  const creatorLabel = form.creator?.closest('label');
  const titleLabel = form.title?.closest('label');
  if (creatorLabel && titleLabel && creatorLabel.dataset.v21Primary !== 'true') {
    creatorLabel.dataset.v21Primary = 'true';
    creatorLabel.classList.add('v21-primary-creator');
    titleLabel.after(creatorLabel);
  }
  const details = form.querySelector('.details-fields');
  const summarySmall = details?.querySelector('summary small');
  if (summarySmall && summarySmall.textContent !== '評価・分類・進捗') summarySmall.textContent = '評価・分類・進捗';
  for (const kind of ['genre', 'theme', 'tag']) ensureLabelFieldV21(form, kind);
  renderDatalistsV21();
}

function classificationGroupV21(kind, labels) {
  return `<div class="v21-classification-group" data-kind="${kind}"><strong>${LABEL_NAMES_V21[kind]}</strong><div>${labels.length ? labels.map((label) => `<span class="label-chip v21-${kind}-chip">${escapeV21(label)}</span>`).join('') : '<span class="muted">未設定</span>'}</div></div>`;
}

function classificationMarkupV21(labels = {}) {
  return `<h3>分類</h3><div class="v21-classification-grid">${classificationGroupV21('genre', labels.genre || [])}${classificationGroupV21('theme', labels.theme || [])}${classificationGroupV21('tag', labels.tag || [])}</div>`;
}

function decorateDetailV21() {
  const panel = document.querySelector('#detailPanel');
  const work = worksV21.get(String(detailIdV21));
  if (!panel || !work) return;
  const section = Array.from(panel.querySelectorAll('.detail-section')).find((item) => item.querySelector('h3')?.textContent.trim() === '分類');
  if (!section) return;
  const labels = work.labels || { genre: [], theme: [], tag: [] };
  const signature = JSON.stringify(labels);
  if (section.dataset.v21Signature === signature) return;
  section.dataset.v21Signature = signature;
  section.classList.add('v21-classification-section');
  section.innerHTML = classificationMarkupV21(labels);
}

function decorateCardsV21() {
  document.querySelectorAll('#workList .work-card[data-work-id]').forEach((card) => {
    const work = worksV21.get(String(card.dataset.workId));
    if (!work) return;
    const sets = {
      genre: new Set((work.labels?.genre || []).map(normalizeV21)),
      theme: new Set((work.labels?.theme || []).map(normalizeV21)),
      tag: new Set((work.labels?.tag || []).map(normalizeV21))
    };
    card.querySelectorAll('.label-chip').forEach((chip) => {
      const value = normalizeV21(chip.textContent);
      const kind = ['genre', 'theme', 'tag'].find((candidate) => sets[candidate].has(value));
      chip.classList.remove('v21-genre-chip', 'v21-theme-chip', 'v21-tag-chip');
      if (kind) {
        chip.classList.add(`v21-${kind}-chip`);
        chip.title = LABEL_NAMES_V21[kind];
      }
    });
  });
}

function enhanceFactDialogV21() {
  const dialog = document.querySelector('#v13FactDialog');
  if (!dialog) return;
  const title = dialog.querySelector('h2');
  if (title) title.textContent = 'AIで事実・分類を補完';
  const lead = dialog.querySelector('.dialog-lead');
  if (lead) lead.textContent = '作者・刊行などの事実に加え、既存の分類語彙を優先してジャンル・テーマを補完します。評価・お気に入り・一言メモは変更しません。';
  const outputHeading = dialog.querySelector('label[for="v13FactOutput"]')?.parentElement?.querySelector('span');
  if (outputHeading) outputHeading.textContent = 'AIはJSONコードブロック1個だけで返答';
  const safety = dialog.querySelector('.v13-fact-safety');
  if (safety) safety.textContent = '既存の分類は保持します。新しいジャンル・テーマ候補は、下の確認欄で選んだものだけを送ります。タグは既存語彙以外を取り込みません。';
  if (!dialog.querySelector('#v21ClassificationPreview')) {
    const preview = document.createElement('section');
    preview.id = 'v21ClassificationPreview';
    preview.className = 'v21-classification-preview';
    preview.hidden = true;
    safety?.after(preview);
  }
}

function parseReturnedJsonV21(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const source = fenced ? fenced[1] : text;
  const parsed = JSON.parse(source);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
}

function currentLabelsV21() {
  return worksV21.get(String(detailIdV21))?.labels || factPackageV21?.template?.classification?.current_labels || { genre: [], theme: [], tag: [] };
}

function packageVocabularyV21() {
  const supplied = factPackageV21?.template?.classification?.vocabulary || {};
  return {
    genre: Array.from(new Set([...(supplied.genre || []), ...vocabularyV21.genre])),
    theme: Array.from(new Set([...(supplied.theme || []), ...vocabularyV21.theme])),
    tag: Array.from(new Set([...(supplied.tag || []), ...vocabularyV21.tag]))
  };
}

function previewOptionV21(kind, value, currentSet, vocabularySet) {
  const normalized = normalizeV21(value);
  const current = currentSet.has(normalized);
  const known = vocabularySet.has(normalized);
  const blocked = kind === 'tag' && !known && !current;
  const checked = current || known;
  const state = current ? '現在使用中' : known ? '既存語彙' : blocked ? '新規タグは対象外' : '新しい候補';
  return `<label class="v21-preview-option ${known || current ? 'is-known' : 'is-new'} ${blocked ? 'is-blocked' : ''}"><input type="checkbox" data-v21-label-kind="${kind}" data-v21-label-value="${escapeV21(value)}" ${checked ? 'checked' : ''} ${blocked ? 'disabled' : ''}><span><strong>${escapeV21(value)}</strong><small>${state}</small></span></label>`;
}

function renderFactPreviewV21() {
  const dialog = document.querySelector('#v13FactDialog');
  const preview = dialog?.querySelector('#v21ClassificationPreview');
  const input = dialog?.querySelector('#v13FactInput');
  if (!preview || !input) return;
  let parsed;
  try { parsed = parseReturnedJsonV21(input.value); }
  catch {
    preview.hidden = false;
    preview.innerHTML = '<strong>分類の確認</strong><p class="v21-preview-error">JSONを読み取れると、ここに分類候補を表示します。</p>';
    return;
  }
  const labels = parsed?.facts?.labels;
  if (!labels || typeof labels !== 'object') {
    preview.hidden = true;
    preview.innerHTML = '';
    return;
  }
  const current = currentLabelsV21();
  const vocabulary = packageVocabularyV21();
  const groups = ['genre', 'theme', 'tag'].map((kind) => {
    const values = Array.from(new Set(Array.isArray(labels[kind]) ? labels[kind].map((value) => String(value).trim()).filter(Boolean) : []));
    const currentSet = new Set((current[kind] || []).map(normalizeV21));
    const vocabularySet = new Set((vocabulary[kind] || []).map(normalizeV21));
    return `<div class="v21-preview-group"><div><strong>${LABEL_NAMES_V21[kind]}</strong><small>${LABEL_HELP_V21[kind]}</small></div><div class="v21-preview-options">${values.length ? values.map((value) => previewOptionV21(kind, value, currentSet, vocabularySet)).join('') : '<span class="muted">候補なし</span>'}</div></div>`;
  }).join('');
  preview.hidden = false;
  preview.innerHTML = `<div class="v21-preview-heading"><div><strong>分類の確認</strong><p>チェックした候補だけを反映用JSONへ残します。</p></div><span>新規候補は初期OFF</span></div>${groups}`;
}

function sanitizeFactLabelsV21() {
  const dialog = document.querySelector('#v13FactDialog');
  const input = dialog?.querySelector('#v13FactInput');
  if (!input) return;
  let parsed;
  try { parsed = parseReturnedJsonV21(input.value); }
  catch { return; }
  if (!parsed?.facts?.labels) return;
  const selected = { genre: [], theme: [], tag: [] };
  dialog.querySelectorAll('[data-v21-label-kind]:checked').forEach((control) => {
    const kind = control.dataset.v21LabelKind;
    const value = control.dataset.v21LabelValue;
    if (selected[kind] && value) selected[kind].push(value);
  });
  parsed.facts.labels = selected;
  input.value = JSON.stringify(parsed, null, 2);
}

function refreshUiV21() {
  ensureStyleV21();
  enhanceWorkFormV21();
  enhanceFactDialogV21();
  decorateDetailV21();
  decorateCardsV21();
}

function bindEventsV21() {
  document.addEventListener('input', (event) => {
    if (event.target?.id === 'v13FactInput') renderFactPreviewV21();
  });
  document.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('[data-v13-fact-import]')) sanitizeFactLabelsV21();
    if (event.target instanceof Element && event.target.closest('[data-v13-fact-open]')) {
      factPackageV21 = null;
      setTimeout(renderFactPreviewV21, 50);
    }
  }, true);
  document.addEventListener('change', (event) => {
    if (event.target instanceof Element && event.target.matches('[data-v21-label-kind]')) {
      const preview = document.querySelector('#v21ClassificationPreview');
      preview?.classList.add('is-reviewed');
    }
  });
}

function startV21() {
  ensureStyleV21();
  bindEventsV21();
  void loadVocabularyV21();
  const observer = new MutationObserver(scheduleRefreshV21);
  observer.observe(document.body, { childList: true, subtree: true });
  refreshUiV21();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startV21, { once: true });
else startV21();
