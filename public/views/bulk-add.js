import { $, $$, toast } from "../core/dom.js";
import { api } from "../core/api.js";
import { state, loadSnapshot, setView } from "../core/store.js";
import { normalizeText } from "../shared/normalize.js";

const MAX_TITLES = 10;
const MAX_TITLE_LENGTH = 300;
const DRAFT_KEY = "sakuhin-log-bulk-add-draft-v1";
let bulkAddBusy = false;

const TYPE_OPTIONS = [
  ["book", "本"], ["manga", "漫画"], ["movie", "映画"],
  ["anime", "アニメ"], ["drama", "ドラマ"], ["other", "その他"]
];
const STATUS_OPTIONS = [
  ["want", "読みたい・見たい"], ["owned_unread", "所持・未読"], ["active", "進行中"],
  ["completed", "完了"], ["paused", "一時停止"], ["dropped", "中断"]
];

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));

function ensureBulkAddStyle() {
  if ($('link[href="/styles/bulk-add.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/styles/bulk-add.css";
  document.head.append(link);
}

function selectOptions(options) {
  return options.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
}

function mountBulkAddTriggers() {
  const singleAdd = $(".top-actions [data-action='open-work-dialog']");
  if (singleAdd && !$("#bulkAddTopButton")) {
    const button = document.createElement("button");
    button.id = "bulkAddTopButton";
    button.type = "button";
    button.className = "ghost-button bulk-add-top-trigger";
    button.dataset.action = "open-bulk-add";
    button.textContent = "まとめて追加";
    singleAdd.before(button);
  }

  const lead = $("#workDialog .dialog-lead");
  if (lead && !$("#bulkAddDialogTrigger")) {
    const button = document.createElement("button");
    button.id = "bulkAddDialogTrigger";
    button.type = "button";
    button.className = "text-button bulk-add-dialog-trigger";
    button.dataset.action = "open-bulk-add";
    button.textContent = "複数タイトルをまとめて追加 →";
    lead.after(button);
  }
}

function mountBulkAddDialog() {
  if ($("#bulkAddDialog")) return;
  const dialog = document.createElement("dialog");
  dialog.id = "bulkAddDialog";
  dialog.className = "app-dialog bulk-add-dialog";
  dialog.innerHTML = `
    <form id="bulkAddForm" method="dialog" class="dialog-form">
      <header>
        <div>
          <p class="eyebrow">BULK ADD</p>
          <h2>タイトルをまとめて追加</h2>
          <p class="dialog-lead">1行に1タイトル。最大${MAX_TITLES}件を、同じ種別・状態で追加します。</p>
        </div>
        <button type="button" class="icon-button" data-action="close-dialog" aria-label="閉じる">×</button>
      </header>
      <div class="bulk-add-toolbar">
        <label class="field-label">種別
          <select name="type">${selectOptions(TYPE_OPTIONS)}</select>
        </label>
        <label class="field-label">状態
          <select name="status">${selectOptions(STATUS_OPTIONS)}</select>
        </label>
      </div>
      <label class="field-label bulk-add-title-field">タイトル
        <textarea name="titles" rows="10" maxlength="3200" spellcheck="false" placeholder="例：\n道は開ける\n夜と霧\n暇と退屈の倫理学"></textarea>
        <small><strong id="bulkAddCount">0</strong> / ${MAX_TITLES}件　空行は数えません。</small>
      </label>
      <label class="check-row bulk-add-duplicate-option">
        <input name="allow_duplicates" type="checkbox"> 同じ種別の同名作品も追加する
      </label>
      <section class="bulk-add-preview" aria-labelledby="bulkAddPreviewTitle">
        <div class="bulk-add-preview-heading">
          <div><strong id="bulkAddPreviewTitle">追加内容の確認</strong><small id="bulkAddSummary">タイトルを入力してください。</small></div>
          <span id="bulkAddProgress" aria-live="polite"></span>
        </div>
        <ol id="bulkAddPreviewList" aria-live="polite"></ol>
      </section>
      <div id="bulkAddError" class="form-error" role="alert"></div>
      <footer class="dialog-actions">
        <span class="shortcut-hint">登録済みの同名作品は初期状態では除外します</span>
        <div>
          <button type="button" class="ghost-button" data-action="close-dialog">キャンセル</button>
          <button id="bulkAddSubmit" class="primary-button" type="submit" disabled>0件を追加</button>
        </div>
      </footer>
    </form>`;
  document.body.append(dialog);
}

function readDraft() {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function saveDraft(form) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify({
    titles: form.titles.value,
    type: form.type.value,
    status: form.status.value,
    allow_duplicates: form.allow_duplicates.checked
  }));
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

function existingTitleKeys(type) {
  const keys = new Set();
  for (const work of state.works.values()) {
    if (work.type === type) keys.add(normalizeText(work.title || ""));
  }
  return keys;
}

function analyzeTitles(form) {
  const rawLines = form.titles.value.split(/\r?\n/).map((title) => title.trim()).filter(Boolean);
  const seen = new Set();
  const existing = existingTitleKeys(form.type.value);
  const allowDuplicates = form.allow_duplicates.checked;
  const items = rawLines.map((title, index) => {
    const key = normalizeText(title);
    const duplicateInInput = seen.has(key);
    seen.add(key);
    const tooLong = title.length > MAX_TITLE_LENGTH;
    const alreadyExists = existing.has(key);
    const selectable = !duplicateInInput && !tooLong && (allowDuplicates || !alreadyExists);
    return { index, title, key, duplicateInInput, tooLong, alreadyExists, selectable };
  });
  return {
    rawCount: rawLines.length,
    overLimit: rawLines.length > MAX_TITLES,
    items,
    candidates: items.filter((item) => item.selectable).slice(0, MAX_TITLES)
  };
}

function itemState(item) {
  if (item.tooLong) return ["error", `${MAX_TITLE_LENGTH}文字を超えています`];
  if (item.duplicateInInput) return ["skip", "入力内で重複"];
  if (item.alreadyExists && !item.selectable) return ["skip", "登録済みのため除外"];
  if (item.alreadyExists) return ["warning", "同名作品として追加"];
  return ["ready", "追加予定"];
}

function renderBulkAddPreview() {
  const form = $("#bulkAddForm");
  if (!form) return;
  const analysis = analyzeTitles(form);
  $("#bulkAddCount").textContent = String(analysis.rawCount);
  $("#bulkAddCount").classList.toggle("is-over", analysis.overLimit);

  const list = $("#bulkAddPreviewList");
  list.innerHTML = analysis.items.length
    ? analysis.items.map((item) => {
        const [stateName, label] = itemState(item);
        return `<li data-bulk-item="${item.index}" data-state="${stateName}"><span>${item.index + 1}</span><strong>${escapeHtml(item.title)}</strong><small>${label}</small></li>`;
      }).join("")
    : '<li class="bulk-add-empty">1行に1タイトルずつ入力すると、ここに確認結果が出ます。</li>';

  const skipped = analysis.items.length - analysis.candidates.length;
  const summary = $("#bulkAddSummary");
  if (analysis.overLimit) summary.textContent = `${MAX_TITLES}件を超えています。${analysis.rawCount - MAX_TITLES}件減らしてください。`;
  else if (!analysis.rawCount) summary.textContent = "タイトルを入力してください。";
  else summary.textContent = `${analysis.candidates.length}件を追加${skipped ? `・${skipped}件を除外` : ""}`;

  const error = $("#bulkAddError");
  error.textContent = analysis.overLimit ? `一度に追加できるのは${MAX_TITLES}件までです。` : analysis.items.some((item) => item.tooLong) ? `タイトルは${MAX_TITLE_LENGTH}文字以内にしてください。` : "";

  const submit = $("#bulkAddSubmit");
  submit.disabled = bulkAddBusy || analysis.overLimit || analysis.candidates.length === 0 || analysis.items.some((item) => item.tooLong);
  submit.textContent = `${analysis.candidates.length}件を追加`;
  saveDraft(form);
}

function setBulkAddBusy(busy, progressText = "") {
  bulkAddBusy = busy;
  const form = $("#bulkAddForm");
  if (!form) return;
  form.setAttribute("aria-busy", String(busy));
  $$('button,input,select,textarea', form).forEach((control) => { control.disabled = busy; });
  const progress = $("#bulkAddProgress");
  progress.innerHTML = progressText ? `<i aria-hidden="true"></i>${escapeHtml(progressText)}` : "";
  if (!busy) renderBulkAddPreview();
}

function openBulkAddDialog() {
  const dialog = $("#bulkAddDialog");
  const form = $("#bulkAddForm");
  if (!dialog || !form || bulkAddBusy) return;
  const singleDialog = $("#workDialog");
  if (singleDialog?.open) singleDialog.close();
  form.reset();
  const draft = readDraft();
  if (draft) {
    form.titles.value = draft.titles || "";
    form.type.value = draft.type || "book";
    form.status.value = draft.status || "want";
    form.allow_duplicates.checked = Boolean(draft.allow_duplicates);
  } else {
    form.type.value = "book";
    form.status.value = "want";
  }
  $("#bulkAddError").textContent = "";
  $("#bulkAddProgress").textContent = "";
  renderBulkAddPreview();
  dialog.showModal();
  setTimeout(() => form.titles.focus(), 40);
}

async function submitBulkAdd(form) {
  if (bulkAddBusy) return;
  const analysis = analyzeTitles(form);
  if (analysis.overLimit || !analysis.candidates.length || analysis.items.some((item) => item.tooLong)) {
    renderBulkAddPreview();
    return;
  }

  const type = form.type.value;
  const status = form.status.value;
  const failures = [];
  let created = 0;
  setBulkAddBusy(true, `追加中 0 / ${analysis.candidates.length}`);

  for (const [index, item] of analysis.candidates.entries()) {
    try {
      await api("/api/works", {
        method: "POST",
        body: JSON.stringify({ title: item.title, type, status })
      });
      created += 1;
      const row = $(`[data-bulk-item="${item.index}"]`);
      if (row) { row.dataset.state = "done"; row.querySelector("small").textContent = "追加済み"; }
    } catch (error) {
      failures.push({ title: item.title, message: error.message });
      const row = $(`[data-bulk-item="${item.index}"]`);
      if (row) { row.dataset.state = "error"; row.querySelector("small").textContent = error.message; }
    }
    setBulkAddBusy(true, `追加中 ${index + 1} / ${analysis.candidates.length}`);
  }

  if (created) await loadSnapshot();
  setBulkAddBusy(false);

  if (!failures.length) {
    clearDraft();
    form.reset();
    $("#bulkAddDialog").close();
    setView("library");
    const excluded = analysis.items.length - analysis.candidates.length;
    toast(`${created}件を追加しました。${excluded ? `${excluded}件は重複などのため除外しました。` : ""}`);
    return;
  }

  form.titles.value = failures.map((item) => item.title).join("\n");
  saveDraft(form);
  $("#bulkAddError").textContent = `${created}件を追加し、${failures.length}件は追加できませんでした。失敗したタイトルだけ残しています。`;
  renderBulkAddPreview();
  toast(`${created}件を追加、${failures.length}件は要確認です。`, "error");
}

export function initBulkAdd() {
  ensureBulkAddStyle();
  mountBulkAddTriggers();
  mountBulkAddDialog();

  const form = $("#bulkAddForm");
  form.addEventListener("input", renderBulkAddPreview);
  form.addEventListener("change", renderBulkAddPreview);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitBulkAdd(event.currentTarget);
  });
  $("#bulkAddDialog").addEventListener("cancel", () => saveDraft(form));

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-action='open-bulk-add']")) {
      event.preventDefault();
      openBulkAddDialog();
    }
  });
}
