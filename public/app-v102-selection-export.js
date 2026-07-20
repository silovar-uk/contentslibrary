const SELECTION_EXPORT_STYLE = '/v102-selection-export.css';
const selectedWorkIds = new Set();
let selectionMode = false;
let selectionExportBusy = false;

function selectionToast(message, type = 'success') {
  const region = document.querySelector('#toastRegion');
  if (!region) return;
  const element = document.createElement('div');
  element.className = `toast ${type === 'error' ? 'error' : ''}`;
  element.textContent = message;
  region.append(element);
  setTimeout(() => element.remove(), 4200);
}

function ensureSelectionStyle() {
  if (document.querySelector(`link[href="${SELECTION_EXPORT_STYLE}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = SELECTION_EXPORT_STYLE;
  document.head.append(link);
}

function ensureSelectionUi() {
  const tools = document.querySelector('.list-heading .list-tools');
  const filters = document.querySelector('#activeFilters');
  if (!tools || !filters) return false;

  if (!document.querySelector('#selectionExportToggle')) {
    const toggle = document.createElement('button');
    toggle.id = 'selectionExportToggle';
    toggle.className = 'ghost-button v102-selection-toggle';
    toggle.type = 'button';
    toggle.textContent = '選択してJSON';
    toggle.setAttribute('aria-pressed', 'false');
    tools.prepend(toggle);
  }

  if (!document.querySelector('#selectionExportBar')) {
    filters.insertAdjacentHTML('afterend', `
      <div class="v102-selection-bar" id="selectionExportBar" hidden aria-live="polite">
        <div class="v102-selection-summary">
          <strong id="selectionExportCount">0件選択中</strong>
          <small>作品をクリックして追加・解除</small>
        </div>
        <div class="v102-selection-subactions">
          <button type="button" class="text-button" data-selection-export-action="visible">表示中をすべて選択</button>
          <button type="button" class="text-button" data-selection-export-action="clear" disabled>選択解除</button>
        </div>
        <div class="v102-selection-mainactions">
          <button type="button" class="primary-button" data-selection-export-action="download" disabled>JSON書き出し</button>
          <button type="button" class="ghost-button" data-selection-export-action="finish">終了</button>
        </div>
      </div>`);
  }
  return true;
}

function visibleWorkCards() {
  return Array.from(document.querySelectorAll('#workList .work-card[data-work-id]'));
}

function decorateWorkCards() {
  visibleWorkCards().forEach((card) => {
    const id = card.dataset.workId;
    if (!id) return;
    let mark = card.querySelector('.v102-select-mark');
    if (!mark) {
      mark = document.createElement('span');
      mark.className = 'v102-select-mark';
      mark.setAttribute('aria-hidden', 'true');
      card.prepend(mark);
    }
    const selected = selectedWorkIds.has(id);
    card.classList.toggle('v102-selectable', selectionMode);
    card.classList.toggle('v102-selected', selectionMode && selected);
    mark.textContent = selected ? '✓' : '';
    if (selectionMode) card.setAttribute('aria-pressed', String(selected));
    else card.removeAttribute('aria-pressed');
  });
}

function updateSelectionUi() {
  if (!ensureSelectionUi()) return;
  const count = selectedWorkIds.size;
  const bar = document.querySelector('#selectionExportBar');
  const toggle = document.querySelector('#selectionExportToggle');
  const countLabel = document.querySelector('#selectionExportCount');
  const clear = document.querySelector('[data-selection-export-action="clear"]');
  const download = document.querySelector('[data-selection-export-action="download"]');
  const visibleToggle = document.querySelector('[data-selection-export-action="visible"]');
  const visibleIds = visibleWorkCards().map((card) => card.dataset.workId).filter(Boolean);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedWorkIds.has(id));

  if (bar) bar.hidden = !selectionMode;
  if (toggle) {
    toggle.textContent = selectionMode ? '選択を終了' : '選択してJSON';
    toggle.setAttribute('aria-pressed', String(selectionMode));
  }
  if (countLabel) countLabel.textContent = `${count}件選択中`;
  if (clear) clear.disabled = count === 0 || selectionExportBusy;
  if (download) {
    download.disabled = count === 0 || selectionExportBusy;
    download.textContent = selectionExportBusy ? '書き出し中…' : count > 0 ? `${count}件をJSON` : 'JSON書き出し';
  }
  if (visibleToggle) {
    visibleToggle.disabled = visibleIds.length === 0 || selectionExportBusy;
    visibleToggle.textContent = allVisibleSelected ? '表示中の選択を解除' : '表示中をすべて選択';
  }
  document.querySelector('#app')?.classList.toggle('v102-selection-mode', selectionMode);
  decorateWorkCards();
}

function setSelectionMode(enabled, { clear = true } = {}) {
  selectionMode = Boolean(enabled);
  if (!selectionMode && clear) selectedWorkIds.clear();
  updateSelectionUi();
  if (selectionMode) selectionToast('作品をクリックして、JSONに入れる作品を選べます。');
}

function toggleWorkSelection(id) {
  if (selectedWorkIds.has(id)) selectedWorkIds.delete(id);
  else selectedWorkIds.add(id);
  updateSelectionUi();
}

function toggleVisibleSelection() {
  const ids = visibleWorkCards().map((card) => card.dataset.workId).filter(Boolean);
  const allSelected = ids.length > 0 && ids.every((id) => selectedWorkIds.has(id));
  ids.forEach((id) => {
    if (allSelected) selectedWorkIds.delete(id);
    else selectedWorkIds.add(id);
  });
  updateSelectionUi();
}

function selectedFilename(response) {
  const disposition = response.headers.get('content-disposition') || '';
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try { return decodeURIComponent(encoded); } catch {}
  }
  const plain = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  return plain || `sakuhin-log-selected-${selectedWorkIds.size}-${new Date().toISOString().slice(0, 10)}.json`;
}

async function selectedExportError(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await response.json().catch(() => ({}));
    return data?.error?.message || `エラー ${response.status}`;
  }
  return (await response.text().catch(() => '')).trim() || `エラー ${response.status}`;
}

async function downloadSelectedJson() {
  if (selectionExportBusy || selectedWorkIds.size === 0) return;
  selectionExportBusy = true;
  updateSelectionUi();
  try {
    const response = await fetch('/api/export?format=json', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-App-Request': 'sakuhin-log'
      },
      body: JSON.stringify({ work_ids: Array.from(selectedWorkIds) })
    });
    if (!response.ok) throw new Error(await selectedExportError(response));

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = selectedFilename(response);
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    selectionToast(`選択した${selectedWorkIds.size}件をJSONで書き出しました。`);
  } catch (error) {
    selectionToast(error instanceof Error ? error.message : '選択作品の書き出しに失敗しました。', 'error');
  } finally {
    selectionExportBusy = false;
    updateSelectionUi();
  }
}

function bindSelectionActions() {
  document.addEventListener('click', (event) => {
    const toggle = event.target instanceof Element ? event.target.closest('#selectionExportToggle') : null;
    if (toggle) {
      event.preventDefault();
      setSelectionMode(!selectionMode);
      return;
    }

    const control = event.target instanceof Element ? event.target.closest('[data-selection-export-action]') : null;
    if (!control) return;
    event.preventDefault();
    const action = control.dataset.selectionExportAction;
    if (action === 'visible') toggleVisibleSelection();
    if (action === 'clear') {
      selectedWorkIds.clear();
      updateSelectionUi();
    }
    if (action === 'download') void downloadSelectedJson();
    if (action === 'finish') setSelectionMode(false);
  });

  // 通常時のクリックは詳細表示。選択モード中だけ、一覧カードのクリックを複数選択へ差し替える。
  document.addEventListener('click', (event) => {
    if (!selectionMode || !(event.target instanceof Element)) return;
    const card = event.target.closest('#workList .work-card[data-work-id]');
    const id = card?.dataset.workId;
    if (!card || !id) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    toggleWorkSelection(id);
  }, true);

  document.addEventListener('keydown', (event) => {
    if (selectionMode && event.key === 'Escape') {
      event.preventDefault();
      setSelectionMode(false);
    }
  });
}

function observeSelectionUi() {
  const list = document.querySelector('#workList');
  if (list) {
    new MutationObserver(() => updateSelectionUi()).observe(list, { childList: true });
  }
  const app = document.querySelector('#app');
  if (app) {
    new MutationObserver(() => {
      if (selectionMode && app.dataset.view !== 'library') setSelectionMode(false);
    }).observe(app, { attributes: true, attributeFilter: ['data-view'] });
  }
}

function startSelectionExport() {
  ensureSelectionStyle();
  ensureSelectionUi();
  bindSelectionActions();
  observeSelectionUi();
  updateSelectionUi();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startSelectionExport, { once: true });
} else {
  startSelectionExport();
}
