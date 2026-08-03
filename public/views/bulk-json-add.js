import { $, $$, toast } from "../core/dom.js";
import { api } from "../core/api.js";
import { state, loadSnapshot, setView } from "../core/store.js";
import { normalizeText } from "../shared/normalize.js";
import { requestCloseDialog } from "./dialogs.js";

const MAX_JSON_WORKS = 10;
const MAX_JSON_FILE_BYTES = 2 * 1024 * 1024;
const DRAFT_KEY = "sakuhin-log-bulk-json-draft-v1";
const WORK_TYPES = new Set(["book", "manga", "movie", "anime", "drama", "other"]);
const WORK_STATUSES = new Set(["want", "owned_unread", "active", "completed", "paused", "dropped"]);
const NOTE_TYPES = new Set(["quick", "summary", "impression", "quote", "idea", "connection", "progress"]);
const TYPE_LABELS = { book: "本", manga: "漫画", movie: "映画", anime: "アニメ", drama: "ドラマ", other: "その他" };
const STATUS_LABELS = { want: "読みたい・見たい", owned_unread: "所持・未読", active: "進行中", completed: "完了", paused: "一時停止", dropped: "中断" };
let bulkJsonBusy = false;
let lastFailureReport = [];

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));

function ensureStyle() {
  if ($('link[href="/styles/bulk-json-add.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/styles/bulk-json-add.css";
  document.head.append(link);
}

function mountTriggers() {
  const titleTopButton = $("#bulkAddTopButton");
  if (titleTopButton) titleTopButton.textContent = "タイトルで追加";
  if (titleTopButton && !$("#bulkJsonTopButton")) {
    const button = document.createElement("button");
    button.id = "bulkJsonTopButton";
    button.type = "button";
    button.className = "ghost-button bulk-json-top-trigger";
    button.dataset.action = "open-bulk-json-add";
    button.textContent = "JSONで追加";
    titleTopButton.after(button);
  }

  const titleDialogTrigger = $("#bulkAddDialogTrigger");
  if (titleDialogTrigger) titleDialogTrigger.textContent = "タイトルをまとめて追加 →";
  if (titleDialogTrigger && !$("#bulkJsonDialogTrigger")) {
    const button = document.createElement("button");
    button.id = "bulkJsonDialogTrigger";
    button.type = "button";
    button.className = "text-button bulk-json-dialog-trigger";
    button.dataset.action = "open-bulk-json-add";
    button.textContent = "JSONでまとめて追加 →";
    titleDialogTrigger.after(button);
  }
}

function mountDialog() {
  if ($("#bulkJsonAddDialog")) return;
  const dialog = document.createElement("dialog");
  dialog.id = "bulkJsonAddDialog";
  dialog.className = "app-dialog bulk-json-add-dialog";
  dialog.innerHTML = `
    <form id="bulkJsonAddForm" method="dialog" class="dialog-form">
      <header>
        <div>
          <p class="eyebrow">BULK JSON ADD</p>
          <h2>JSONでまとめて追加</h2>
          <p class="dialog-lead">最大${MAX_JSON_WORKS}作品。作品情報・分類・メモ・体験履歴を確認してから追加します。</p>
        </div>
        <button type="button" class="icon-button" data-action="close-dialog" aria-label="閉じる">×</button>
      </header>
      <div class="bulk-json-actions">
        <button type="button" class="ghost-button" data-bulk-json-action="select-file">JSONファイルを選択</button>
        <button type="button" class="text-button" data-bulk-json-action="copy-template">ひな形をコピー</button>
        <input id="bulkJsonFileInput" type="file" accept=".json,application/json" hidden>
        <small>配列 <code>[{...}]</code> と、書き出しJSONの <code>{"works":[...]}</code> に対応</small>
      </div>
      <label class="field-label bulk-json-source-field">JSON
        <textarea name="json" rows="13" spellcheck="false" placeholder='[{"title":"道は開ける","type":"book","status":"want"}]'></textarea>
        <small>ID・所有者・作成日時・公開範囲は引き継がず、新規の非公開作品として登録します。</small>
      </label>
      <label class="check-row bulk-json-duplicate-option">
        <input name="allow_duplicates" type="checkbox"> 同じ種別の同名作品も追加する
      </label>
      <section class="bulk-json-preview" aria-labelledby="bulkJsonPreviewTitle">
        <div class="bulk-json-preview-heading">
          <div><strong id="bulkJsonPreviewTitle">JSONの確認</strong><small id="bulkJsonSummary">JSONを貼り付けるか、ファイルを選択してください。</small></div>
          <span id="bulkJsonProgress" aria-live="polite"></span>
        </div>
        <ol id="bulkJsonPreviewList" aria-live="polite"></ol>
      </section>
      <div id="bulkJsonError" class="form-error" role="alert"></div>
      <details id="bulkJsonFailureDetails" class="bulk-json-failure-details" hidden>
        <summary>失敗内容を確認</summary>
        <pre id="bulkJsonFailureReport"></pre>
        <button type="button" class="text-button" data-bulk-json-action="copy-failures">失敗内容をコピー</button>
      </details>
      <footer class="dialog-actions">
        <span class="shortcut-hint">Ctrl / ⌘ + Enterで追加</span>
        <div>
          <button type="button" class="ghost-button" data-action="close-dialog">キャンセル</button>
          <button id="bulkJsonSubmit" class="primary-button" type="submit" disabled>0件を追加</button>
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
    json: form.json.value,
    allow_duplicates: form.allow_duplicates.checked
  }));
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

function stripCodeFence(value) {
  const text = String(value || "").replace(/^\uFEFF/, "").trim();
  if (!text.startsWith("```")) return text;
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function nullableNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

function stringValue(value, max, field, errors, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) errors.push(`${field}は必須です`);
    return null;
  }
  if (typeof value !== "string") {
    errors.push(`${field}は文字列で入力してください`);
    return null;
  }
  const text = value.trim();
  if (required && !text) errors.push(`${field}は必須です`);
  if (text.length > max) errors.push(`${field}は${max}文字以内です`);
  return text || null;
}

function numberValue(value, field, errors, options = {}) {
  const number = nullableNumber(value);
  if (number === null) return null;
  if (!Number.isFinite(number)) {
    errors.push(`${field}は数値で入力してください`);
    return null;
  }
  if (options.integer && !Number.isInteger(number)) errors.push(`${field}は整数で入力してください`);
  if (options.min !== undefined && number < options.min) errors.push(`${field}は${options.min}以上です`);
  if (options.max !== undefined && number > options.max) errors.push(`${field}は${options.max}以下です`);
  if (options.halfStep && Math.round(number * 2) !== number * 2) errors.push(`${field}は0.5刻みです`);
  return number;
}

function labelsValue(value, errors) {
  if (value === undefined || value === null) return { genre: [], theme: [], tag: [] };
  if (!plainObject(value)) {
    errors.push("labelsはオブジェクトで入力してください");
    return { genre: [], theme: [], tag: [] };
  }
  const output = { genre: [], theme: [], tag: [] };
  for (const kind of Object.keys(output)) {
    const source = value[kind] ?? [];
    if (!Array.isArray(source) || source.some((item) => typeof item !== "string")) {
      errors.push(`labels.${kind}は文字列の配列で入力してください`);
      continue;
    }
    const clean = Array.from(new Set(source.map((item) => item.trim()).filter(Boolean)));
    if (clean.length > 30) errors.push(`labels.${kind}は30件以内です`);
    if (clean.some((item) => item.length > 40)) errors.push(`labels.${kind}は1件40文字以内です`);
    output[kind] = clean.slice(0, 30);
  }
  return output;
}

function metadataValue(value, errors) {
  if (value === undefined || value === null) return {};
  if (!plainObject(value)) {
    errors.push("metadataはオブジェクトで入力してください");
    return {};
  }
  try {
    if (JSON.stringify(value).length > 10_000) errors.push("metadataが大きすぎます");
  } catch {
    errors.push("metadataをJSONとして扱えません");
    return {};
  }
  return value;
}

function experienceValue(value, index, errors) {
  const prefix = `体験${index + 1}`;
  if (!plainObject(value)) {
    errors.push(`${prefix}の形式が正しくありません`);
    return null;
  }
  const localErrors = [];
  const rating = numberValue(value.rating, `${prefix}.rating`, localErrors, { min: 0.5, max: 5, halfStep: true });
  const progressCurrent = numberValue(value.progress_current, `${prefix}.progress_current`, localErrors, { min: 0 });
  const progressTotal = numberValue(value.progress_total, `${prefix}.progress_total`, localErrors, { min: 0 });
  if (progressCurrent !== null && progressTotal !== null && progressCurrent > progressTotal) localErrors.push(`${prefix}の現在位置が全体を超えています`);
  const result = {
    source_id: value.id == null ? null : String(value.id),
    started_at: stringValue(value.started_at, 30, `${prefix}.started_at`, localErrors),
    completed_at: stringValue(value.completed_at, 30, `${prefix}.completed_at`, localErrors),
    rating,
    progress_current: progressCurrent,
    progress_total: progressTotal,
    memo: stringValue(value.memo, 50_000, `${prefix}.memo`, localErrors)
  };
  errors.push(...localErrors);
  return result;
}

function noteValue(value, index, errors) {
  const prefix = `メモ${index + 1}`;
  if (!plainObject(value)) {
    errors.push(`${prefix}の形式が正しくありません`);
    return null;
  }
  const localErrors = [];
  const noteType = value.note_type == null ? "quick" : String(value.note_type);
  if (!NOTE_TYPES.has(noteType)) localErrors.push(`${prefix}.note_typeが正しくありません`);
  const result = {
    source_id: value.id == null ? null : String(value.id),
    source_experience_id: value.experience_id == null ? null : String(value.experience_id),
    note_type: NOTE_TYPES.has(noteType) ? noteType : "quick",
    content: stringValue(value.content, 50_000, `${prefix}.content`, localErrors, { required: true }),
    position: stringValue(value.position, 100, `${prefix}.position`, localErrors)
  };
  errors.push(...localErrors);
  return result;
}

function parseContainer(rawText) {
  const text = stripCodeFence(rawText);
  if (!text) return { works: [], source: "empty", warnings: [] };
  let parsed;
  try { parsed = JSON.parse(text); }
  catch (error) { throw new Error(`JSONを解析できません。${error.message}`); }

  if (Array.isArray(parsed)) return { works: parsed, experiences: [], notes: [], source: "array", warnings: [] };
  if (!plainObject(parsed)) throw new Error("JSONは作品の配列、またはworks配列を持つオブジェクトにしてください。");
  if (Array.isArray(parsed.works)) {
    return {
      works: parsed.works,
      experiences: Array.isArray(parsed.experiences) ? parsed.experiences : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      source: "backup",
      warnings: []
    };
  }
  if (Array.isArray(parsed.items)) return { works: parsed.items, experiences: [], notes: [], source: "items", warnings: [] };
  if (typeof parsed.title === "string") return { works: [parsed], experiences: [], notes: [], source: "single", warnings: [] };
  throw new Error("works配列が見つかりません。配列そのものを貼り付けることもできます。");
}

function sourceChildren(container, rawWork, index) {
  const sourceId = rawWork?.id == null ? null : String(rawWork.id);
  const nestedExperiences = Array.isArray(rawWork?.experiences) ? rawWork.experiences : [];
  const nestedNotes = Array.isArray(rawWork?.notes) ? rawWork.notes : [];
  const topExperiences = sourceId ? container.experiences.filter((item) => String(item?.work_id ?? "") === sourceId) : [];
  const topNotes = sourceId ? container.notes.filter((item) => String(item?.work_id ?? "") === sourceId) : [];
  if (!sourceId && container.works.length === 1) {
    return {
      experiences: [...nestedExperiences, ...container.experiences],
      notes: [...nestedNotes, ...container.notes]
    };
  }
  return { experiences: [...nestedExperiences, ...topExperiences], notes: [...nestedNotes, ...topNotes], index };
}

function canonicalRetryValue(item) {
  return {
    ...item.payload,
    experiences: item.experiences.map(({ source_id, ...experience }) => ({ id: source_id, ...experience })),
    notes: item.notes.map(({ source_id, source_experience_id, ...note }) => ({ id: source_id, experience_id: source_experience_id, ...note }))
  };
}

function analyzeJson(form) {
  let container;
  try { container = parseContainer(form.json.value); }
  catch (error) { return { parseError: error.message, items: [], candidates: [], rawCount: 0, overLimit: false, warnings: [] }; }

  const allowDuplicates = form.allow_duplicates.checked;
  const existing = new Set(Array.from(state.works.values()).map((work) => `${work.type}::${normalizeText(work.title || "")}`));
  const seen = new Set();
  const items = container.works.map((rawWork, index) => {
    const errors = [];
    if (!plainObject(rawWork)) errors.push("作品はオブジェクトで入力してください");
    const source = plainObject(rawWork) ? rawWork : {};
    const title = stringValue(source.title, 300, "title", errors, { required: true }) || `作品${index + 1}`;
    const type = source.type == null ? "book" : String(source.type);
    const status = source.status == null ? "want" : String(source.status);
    if (!WORK_TYPES.has(type)) errors.push("typeが正しくありません");
    if (!WORK_STATUSES.has(status)) errors.push("statusが正しくありません");
    const progressCurrent = numberValue(source.progress_current, "progress_current", errors, { min: 0 });
    const progressTotal = numberValue(source.progress_total, "progress_total", errors, { min: 0 });
    if (progressCurrent !== null && progressTotal !== null && progressCurrent > progressTotal) errors.push("progress_currentがprogress_totalを超えています");
    const payload = {
      title,
      type: WORK_TYPES.has(type) ? type : "book",
      status: WORK_STATUSES.has(status) ? status : "want",
      creator: stringValue(source.creator, 300, "creator", errors),
      release_year: numberValue(source.release_year, "release_year", errors, { integer: true, min: 0, max: 3000 }),
      rating: numberValue(source.rating, "rating", errors, { min: 0.5, max: 5, halfStep: true }),
      short_note: stringValue(source.short_note, 280, "short_note", errors),
      progress_current: progressCurrent,
      progress_total: progressTotal,
      unit_label: stringValue(source.unit_label, 30, "unit_label", errors),
      metadata: metadataValue(source.metadata, errors),
      labels: labelsValue(source.labels, errors)
    };
    const children = sourceChildren(container, source, index);
    const experiences = children.experiences.map((value, childIndex) => experienceValue(value, childIndex, errors)).filter(Boolean);
    const notes = children.notes.map((value, childIndex) => noteValue(value, childIndex, errors)).filter(Boolean);
    const key = `${payload.type}::${normalizeText(payload.title)}`;
    const duplicateInInput = seen.has(key);
    seen.add(key);
    const alreadyExists = existing.has(key);
    const selectable = errors.length === 0 && !duplicateInInput && (allowDuplicates || !alreadyExists);
    const item = { index, raw: source, title: payload.title, payload, experiences, notes, errors, duplicateInInput, alreadyExists, selectable };
    item.retryValue = canonicalRetryValue(item);
    return item;
  });

  const matchedExperienceIds = new Set(items.flatMap((item) => item.experiences.map((experience) => experience.source_id).filter(Boolean)));
  const matchedNoteIds = new Set(items.flatMap((item) => item.notes.map((note) => note.source_id).filter(Boolean)));
  const unmatchedExperiences = container.experiences.filter((item) => item?.id != null && !matchedExperienceIds.has(String(item.id))).length;
  const unmatchedNotes = container.notes.filter((item) => item?.id != null && !matchedNoteIds.has(String(item.id))).length;
  const warnings = [];
  if (unmatchedExperiences) warnings.push(`work_idが一致しない体験${unmatchedExperiences}件は対象外です`);
  if (unmatchedNotes) warnings.push(`work_idが一致しないメモ${unmatchedNotes}件は対象外です`);

  return {
    parseError: null,
    source: container.source,
    rawCount: items.length,
    overLimit: items.length > MAX_JSON_WORKS,
    items,
    candidates: items.filter((item) => item.selectable).slice(0, MAX_JSON_WORKS),
    warnings
  };
}

function previewState(item) {
  if (item.errors.length) return ["error", item.errors[0]];
  if (item.duplicateInInput) return ["skip", "JSON内で重複"];
  if (item.alreadyExists && !item.selectable) return ["skip", "登録済みのため除外"];
  if (item.alreadyExists) return ["warning", "同名作品として追加"];
  return ["ready", "追加予定"];
}

function renderPreview() {
  const form = $("#bulkJsonAddForm");
  if (!form) return;
  const analysis = analyzeJson(form);
  const list = $("#bulkJsonPreviewList");
  const summary = $("#bulkJsonSummary");
  const error = $("#bulkJsonError");
  const submit = $("#bulkJsonSubmit");

  if (analysis.parseError) {
    list.innerHTML = '<li class="bulk-json-empty">正しいJSONを入力すると、ここに作品ごとの確認結果が出ます。</li>';
    summary.textContent = "JSONの形式を確認してください。";
    error.textContent = analysis.parseError;
    submit.disabled = true;
    submit.textContent = "0件を追加";
    saveDraft(form);
    return;
  }

  list.innerHTML = analysis.items.length
    ? analysis.items.map((item) => {
        const [stateName, label] = previewState(item);
        const childCopy = `${item.experiences.length ? `体験${item.experiences.length}` : ""}${item.experiences.length && item.notes.length ? "・" : ""}${item.notes.length ? `メモ${item.notes.length}` : ""}`;
        return `<li data-bulk-json-item="${item.index}" data-state="${stateName}"><span>${item.index + 1}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(TYPE_LABELS[item.payload.type])}・${escapeHtml(STATUS_LABELS[item.payload.status])}${childCopy ? `・${escapeHtml(childCopy)}` : ""}</small></div><em>${escapeHtml(label)}</em></li>`;
      }).join("")
    : '<li class="bulk-json-empty">JSONを貼り付けるか、ファイルを選択してください。</li>';

  const skipped = analysis.items.length - analysis.candidates.length;
  if (analysis.overLimit) summary.textContent = `${MAX_JSON_WORKS}件を超えています。${analysis.rawCount - MAX_JSON_WORKS}件減らしてください。`;
  else if (!analysis.rawCount) summary.textContent = "JSONを貼り付けるか、ファイルを選択してください。";
  else summary.textContent = `${analysis.candidates.length}件を追加${skipped ? `・${skipped}件を除外` : ""}${analysis.warnings.length ? `・注意${analysis.warnings.length}件` : ""}`;

  const invalidCount = analysis.items.filter((item) => item.errors.length).length;
  error.textContent = analysis.overLimit
    ? `一度に追加できるのは${MAX_JSON_WORKS}作品までです。`
    : invalidCount
      ? `${invalidCount}作品に入力エラーがあります。作品ごとの表示を確認してください。`
      : analysis.warnings.join("。 ");
  submit.disabled = bulkJsonBusy || analysis.overLimit || analysis.candidates.length === 0 || invalidCount > 0;
  submit.textContent = `${analysis.candidates.length}件を追加`;
  saveDraft(form);
}

function setBusy(busy, progressText = "") {
  bulkJsonBusy = busy;
  const form = $("#bulkJsonAddForm");
  if (!form) return;
  form.setAttribute("aria-busy", String(busy));
  $$("button,input,textarea", form).forEach((control) => { control.disabled = busy; });
  const progress = $("#bulkJsonProgress");
  progress.innerHTML = progressText ? `<i aria-hidden="true"></i>${escapeHtml(progressText)}` : "";
  if (!busy) renderPreview();
}

function autoGeneratedMemoNote(note, experiences) {
  if (note.note_type !== "impression" || !note.source_experience_id) return false;
  const experience = experiences.find((item) => item.source_id === note.source_experience_id);
  return Boolean(experience?.memo && experience.memo === note.content);
}

async function restoreWorkFields(workId, payload) {
  const detail = await api(`/api/works/${encodeURIComponent(workId)}`);
  await api(`/api/works/${encodeURIComponent(workId)}`, {
    method: "PATCH",
    body: JSON.stringify({ ...payload, version: Number(detail.work.version) })
  });
}

async function importChildren(workId, item) {
  const failures = [];
  const experienceMap = new Map();
  for (const experience of item.experiences) {
    const { source_id: sourceId, ...payload } = experience;
    try {
      const created = await api(`/api/works/${encodeURIComponent(workId)}/experiences`, { method: "POST", body: JSON.stringify(payload) });
      if (sourceId) experienceMap.set(sourceId, String(created.id));
    } catch (error) {
      failures.push(`体験: ${error.message}`);
    }
  }

  for (const note of item.notes) {
    if (autoGeneratedMemoNote(note, item.experiences)) continue;
    const { source_id: _sourceId, source_experience_id: sourceExperienceId, ...payload } = note;
    if (sourceExperienceId) {
      const mapped = experienceMap.get(sourceExperienceId);
      if (!mapped) {
        failures.push("メモ: 参照する体験を登録できなかったため保留");
        continue;
      }
      payload.experience_id = mapped;
    }
    try {
      await api(`/api/works/${encodeURIComponent(workId)}/notes`, { method: "POST", body: JSON.stringify(payload) });
    } catch (error) {
      failures.push(`メモ: ${error.message}`);
    }
  }

  if (item.experiences.length) {
    try { await restoreWorkFields(workId, item.payload); }
    catch (error) { failures.push(`作品状態の復元: ${error.message}`); }
  }
  return failures;
}

function updateFailureReport(failures) {
  lastFailureReport = failures;
  const details = $("#bulkJsonFailureDetails");
  const report = $("#bulkJsonFailureReport");
  if (!details || !report) return;
  details.hidden = failures.length === 0;
  details.open = failures.length > 0;
  report.textContent = failures.map((item) => `・${item.title}\n  ${item.messages.join("\n  ")}`).join("\n");
}

async function submitJson(form) {
  if (bulkJsonBusy) return;
  const analysis = analyzeJson(form);
  const invalidCount = analysis.items.filter((item) => item.errors.length).length;
  if (analysis.parseError || analysis.overLimit || invalidCount || !analysis.candidates.length) {
    renderPreview();
    return;
  }

  const workFailures = [];
  const childFailures = [];
  let createdCount = 0;
  let refreshError = null;
  updateFailureReport([]);
  setBusy(true, `追加中 0 / ${analysis.candidates.length}`);

  for (const [candidateIndex, item] of analysis.candidates.entries()) {
    const row = $(`[data-bulk-json-item="${item.index}"]`);
    try {
      const created = await api("/api/works", { method: "POST", body: JSON.stringify(item.payload) });
      createdCount += 1;
      const childErrors = await importChildren(String(created.work.id), item);
      if (childErrors.length) {
        childFailures.push({ title: item.title, messages: childErrors });
        if (row) { row.dataset.state = "warning"; row.querySelector("em").textContent = `作品追加済み・補足${childErrors.length}件要確認`; }
      } else if (row) {
        row.dataset.state = "done";
        row.querySelector("em").textContent = "追加済み";
      }
    } catch (error) {
      workFailures.push({ item, message: error.message });
      if (row) { row.dataset.state = "error"; row.querySelector("em").textContent = error.message; }
    }
    setBusy(true, `追加中 ${candidateIndex + 1} / ${analysis.candidates.length}`);
  }

  if (createdCount) {
    try { await loadSnapshot(); }
    catch (error) { refreshError = error; }
  }
  setBusy(false);
  updateFailureReport([
    ...workFailures.map(({ item, message }) => ({ title: item.title, messages: [`作品本体: ${message}`] })),
    ...childFailures
  ]);

  if (!workFailures.length && !childFailures.length) {
    clearDraft();
    form.reset();
    $("#bulkJsonAddDialog").close();
    setView("library");
    const excluded = analysis.items.length - analysis.candidates.length;
    if (refreshError) toast(`${createdCount}件を追加しました。一覧を更新できなかったため、画面を再読み込みしてください。`, "error");
    else toast(`${createdCount}件をJSONから追加しました。${excluded ? `${excluded}件は重複などのため除外しました。` : ""}`);
    return;
  }

  if (workFailures.length) {
    form.json.value = JSON.stringify(workFailures.map(({ item }) => item.retryValue), null, 2);
    saveDraft(form);
  } else {
    form.json.value = "";
    clearDraft();
  }
  renderPreview();
  const messages = [];
  if (workFailures.length) messages.push(`${workFailures.length}作品は追加できず、再試行用JSONだけを入力欄に残しました`);
  if (childFailures.length) messages.push(`${childFailures.length}作品は本体を追加済みですが、メモ・体験の一部を反映できませんでした`);
  $("#bulkJsonError").textContent = `${createdCount}作品を追加しました。${messages.join("。 ")}。下の失敗内容を確認してください。`;
  toast(`${createdCount}件を追加、${workFailures.length + childFailures.length}件は要確認です。`, "error");
}

async function openDialog() {
  const dialog = $("#bulkJsonAddDialog");
  const form = $("#bulkJsonAddForm");
  if (!dialog || !form || bulkJsonBusy) return;
  const singleDialog = $("#workDialog");
  if (singleDialog?.open) {
    requestCloseDialog(singleDialog);
    if (singleDialog.open) return;
  }
  const titleDialog = $("#bulkAddDialog");
  if (titleDialog?.open) titleDialog.close();

  if (!state.loaded) {
    try { await loadSnapshot(); }
    catch (error) {
      toast(`登録済みタイトルを確認できませんでした。${error.message}`, "error");
      return;
    }
  }

  form.reset();
  const draft = readDraft();
  if (draft) {
    form.json.value = draft.json || "";
    form.allow_duplicates.checked = Boolean(draft.allow_duplicates);
  }
  $("#bulkJsonError").textContent = "";
  $("#bulkJsonProgress").textContent = "";
  updateFailureReport([]);
  renderPreview();
  dialog.showModal();
  setTimeout(() => form.json.focus(), 40);
}

async function selectJsonFile(file, form) {
  if (!file) return;
  if (file.size > MAX_JSON_FILE_BYTES) {
    $("#bulkJsonError").textContent = "JSONファイルは2MB以内にしてください。";
    return;
  }
  try {
    form.json.value = await file.text();
    renderPreview();
  } catch (error) {
    $("#bulkJsonError").textContent = `ファイルを読み込めませんでした。${error.message}`;
  }
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    toast(successMessage);
  } catch {
    toast("コピーできませんでした。テキストを選択してコピーしてください。", "error");
  }
}

function templateJson() {
  return JSON.stringify([
    {
      title: "作品名",
      type: "book",
      status: "want",
      creator: "著者名",
      release_year: 2026,
      rating: null,
      short_note: "",
      labels: { genre: ["小説"], theme: [], tag: [] },
      metadata: {},
      experiences: [],
      notes: [{ note_type: "quick", content: "あとから戻りたいメモ", position: null }]
    }
  ], null, 2);
}

export function initBulkJsonAdd() {
  ensureStyle();
  mountTriggers();
  mountDialog();

  const form = $("#bulkJsonAddForm");
  const fileInput = $("#bulkJsonFileInput");
  form.addEventListener("input", renderPreview);
  form.addEventListener("change", renderPreview);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitJson(event.currentTarget);
  });
  $("#bulkJsonAddDialog").addEventListener("cancel", () => saveDraft(form));
  fileInput.addEventListener("change", () => {
    void selectJsonFile(fileInput.files?.[0], form);
    fileInput.value = "";
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-action='open-bulk-json-add']")) {
      event.preventDefault();
      void openDialog();
      return;
    }
    const action = event.target.closest("[data-bulk-json-action]")?.dataset.bulkJsonAction;
    if (action === "select-file") fileInput.click();
    if (action === "copy-template") void copyText(templateJson(), "JSONのひな形をコピーしました。");
    if (action === "copy-failures") void copyText(lastFailureReport.map((item) => `${item.title}: ${item.messages.join(" / ")}`).join("\n"), "失敗内容をコピーしました。");
  });
}
