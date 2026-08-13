import { $, $$, toast, setBusy } from "../core/dom.js";
import { api } from "../core/api.js";
import { mediaConfig } from "../core/format.js";
import { state, upsertWork, setSelectedDetail, setView, selectWork } from "../core/store.js";

const DRAFT_KEY = "sakuhin-log-work-draft-v2";

function serializeForm(form) {
  const data = {};
  new FormData(form).forEach((value, key) => (data[key] = String(value)));
  return data;
}
function readDraft() {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try { const parsed = JSON.parse(raw); return parsed?.data ? parsed : { saved_at: null, data: parsed }; } catch { return null; }
}
function setDraftNotice(draft) {
  const notice = $("#workDraftNotice");
  if (!draft) { notice.hidden = true; notice.innerHTML = ""; return; }
  notice.hidden = false;
  notice.innerHTML = `<span><strong>前回の入力を復元しました。</strong></span><button type="button" class="text-button" data-action="discard-work-draft">破棄</button>`;
}
export function saveOpenDraft() {
  const dialog = $("#workDialog");
  if (!dialog?.open) return;
  const form = $("#workForm");
  if (form.id.value) return;
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ saved_at: new Date().toISOString(), data: serializeForm(form) }));
}
export function discardWorkDraft() {
  localStorage.removeItem(DRAFT_KEY);
  const form = $("#workForm");
  form.reset();
  form.dataset.mode = "create";
  syncWorkFormMedia(form, { forceUnit: true });
  $(".details-fields", form).open = false;
  $('[data-counter="short_note"]').textContent = "0";
  setDraftNotice(null);
  form.title.focus();
}

function syncWorkFormMedia(form, { forceUnit = false } = {}) {
  const config = mediaConfig(form.type.value);
  $("#creatorField").firstChild.textContent = config.creator;
  form.creator.placeholder = config.creatorPlaceholder;
  $("#progressCurrentField").firstChild.textContent = config.current;
  $("#progressTotalField").firstChild.textContent = config.total;
  form.unit_label.placeholder = config.unit;
  const previousAuto = form.dataset.autoUnit || "";
  if (forceUnit || !form.unit_label.value || form.unit_label.value === previousAuto) form.unit_label.value = config.unit;
  form.dataset.autoUnit = config.unit;
  Array.from(form.status.options).forEach((option) => { option.textContent = config.statuses[option.value] || option.textContent; });
}

export function openWorkDialog(edit = false) {
  const dialog = $("#workDialog");
  const form = $("#workForm");
  form.reset();
  form.id.value = "";
  form.version.value = "";
  form.dataset.mode = edit ? "edit" : "create";
  form.dataset.baseline = "";
  $("#workFormError").textContent = "";
  $$('#workForm [aria-invalid="true"]').forEach((el) => el.removeAttribute("aria-invalid"));
  $("#workDialogTitle").textContent = edit ? "作品を編集" : "作品を追加";
  setDraftNotice(null);
  if (edit && state.selected) {
    const w = state.selected.work;
    form.id.value = w.id;
    form.version.value = w.version;
    form.title.value = w.title;
    form.type.value = w.type;
    form.status.value = w.status;
    form.short_note.value = w.short_note || "";
    form.creator.value = w.creator || "";
    if (form.source_url) form.source_url.value = w.metadata?.source_url || "";
    form.release_year.value = w.release_year || "";
    form.rating.value = w.rating || "";
    form.genre.value = (w.labels?.genre || []).join(", ");
    form.theme.value = (w.labels?.theme || []).join(", ");
    form.tag.value = (w.labels?.tag || []).join(", ");
    form.progress_current.value = w.progress_current ?? "";
    form.progress_total.value = w.progress_total ?? "";
    form.unit_label.value = w.unit_label || "";
    $(".details-fields", form).open = true;
    syncWorkFormMedia(form);
    form.dataset.baseline = JSON.stringify(serializeForm(form));
  } else {
    const draft = readDraft();
    if (draft) { Object.entries(draft.data).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value; }); setDraftNotice(draft); }
    syncWorkFormMedia(form, { forceUnit: !draft });
    const hasDetail = ["creator", "release_year", "rating", "genre", "theme", "tag", "progress_current", "progress_total"].some((name) => form.elements[name].value);
    $(".details-fields", form).open = Boolean(hasDetail);
  }
  $('[data-counter="short_note"]').textContent = form.short_note.value.length;
  dialog.showModal();
  setTimeout(() => form.title.focus(), 50);
}

function formLabels(value) { return value.split(/[、,]/).map((v) => v.trim()).filter(Boolean); }
function nullableNumber(value) { return value === "" ? null : Number(value); }
function normalizeSourceUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch { return null; }
}

function clearValidation(form) {
  $$(".form-error", form).forEach((el) => (el.textContent = ""));
  $$('[aria-invalid="true"]', form).forEach((el) => el.removeAttribute("aria-invalid"));
}
function validateProgress(form) {
  const current = nullableNumber(form.progress_current.value);
  const total = nullableNumber(form.progress_total.value);
  if (current !== null && current < 0) return { field: "progress_current", message: "進捗は0以上で入力してください。" };
  if (total !== null && total < 0) return { field: "progress_total", message: "全体は0以上で入力してください。" };
  if (current !== null && total !== null && current > total) return { field: "progress_current", message: "現在の進捗は全体以下にしてください。" };
  return null;
}
function showValidation(form, error) {
  const output = $(".form-error", form);
  if (output) output.textContent = error.message;
  const field = form.elements[error.field];
  if (field) { field.setAttribute("aria-invalid", "true"); field.focus(); }
}

async function submitWork(form) {
  clearValidation(form);
  if (!form.title.value.trim()) return showValidation(form, { field: "title", message: "タイトルは必須です。" });
  const progressError = validateProgress(form);
  if (progressError) return showValidation(form, progressError);
  const sourceUrl = normalizeSourceUrl(form.source_url?.value);
  if (sourceUrl === null) return showValidation(form, { field: "source_url", message: "URLはhttp:// または https:// から始まる形式で入力してください。" });
  const metadata = { ...(form.id.value ? state.selected?.work?.metadata || {} : {}) };
  if (sourceUrl) metadata.source_url = sourceUrl;
  else delete metadata.source_url;
  const payload = {
    title: form.title.value.trim(), type: form.type.value, status: form.status.value, short_note: form.short_note.value.trim(),
    creator: form.creator.value.trim() || null, release_year: nullableNumber(form.release_year.value), rating: nullableNumber(form.rating.value),
    progress_current: nullableNumber(form.progress_current.value), progress_total: nullableNumber(form.progress_total.value), unit_label: form.unit_label.value.trim() || null,
    metadata,
    labels: { genre: formLabels(form.genre.value), theme: formLabels(form.theme.value), tag: formLabels(form.tag.value) }
  };
  const button = $('[type="submit"]', form);
  setBusy(button, true);
  try {
    let data;
    if (form.id.value) { payload.version = Number(form.version.value); data = await api(`/api/works/${encodeURIComponent(form.id.value)}`, { method: "PATCH", body: JSON.stringify(payload) }); }
    else data = await api("/api/works", { method: "POST", body: JSON.stringify(payload) });
    localStorage.removeItem(DRAFT_KEY);
    form.dataset.baseline = JSON.stringify(serializeForm(form));
    $("#workDialog").close();
    toast(form.id.value ? "更新しました。" : "追加しました。");
    setSelectedDetail(data);
    selectWork(data.work.id);
    setView("library");
  } catch (e) { showValidation(form, { field: e.details?.field || "", message: e.message }); }
  finally { setBusy(button, false); }
}

export function requestCloseDialog(dialog) {
  if (dialog.id !== "workDialog") { dialog.close(); return; }
  const form = $("#workForm");
  if (form.id.value) {
    const dirty = form.dataset.baseline && form.dataset.baseline !== JSON.stringify(serializeForm(form));
    if (dirty && !confirm("未保存の変更があります。破棄して閉じますか？")) return;
  } else saveOpenDraft();
  dialog.close();
}

// --- メモ(作成・編集を1つのダイアログで扱う) ---

export function openNoteDialog(workId, note = null) {
  const form = $("#noteForm");
  form.reset();
  form.work_id.value = workId;
  form.id.value = note?.id || "";
  form.version.value = note?.version || "";
  const noteType = note?.note_type || "quick";
  form.note_type.value = noteType;
  $$(".note-type-chips [data-note-type]").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.noteType === noteType));
  form.content.value = note?.content || "";
  form.position.value = note?.position || "";
  $(".form-error", form).textContent = "";
  $("#noteDialogTitle").textContent = note ? "メモを編集" : "メモを追加";
  $("#noteDialog").showModal();
  setTimeout(() => form.content.focus(), 50);
}

async function submitNote(form) {
  const error = $(".form-error", form);
  error.textContent = "";
  const workId = form.work_id.value;
  const isEdit = Boolean(form.id.value);
  try {
    if (isEdit) {
      await api(`/api/notes/${encodeURIComponent(form.id.value)}`, { method: "PATCH", body: JSON.stringify({ version: Number(form.version.value), note_type: form.note_type.value, content: form.content.value, position: form.position.value || null }) });
    } else {
      await api(`/api/works/${encodeURIComponent(workId)}/notes`, { method: "POST", body: JSON.stringify({ note_type: form.note_type.value, content: form.content.value, position: form.position.value || null }) });
    }
    $("#noteDialog").close();
    toast(isEdit ? "メモを更新しました。" : "メモを保存しました。");
    document.dispatchEvent(new CustomEvent("app:refresh-detail", { detail: workId }));
  } catch (e) { error.textContent = e.message; }
}

// --- 体験(作成・編集を1つのダイアログで扱う) ---

export function openExperienceDialog(workId, experience = null) {
  const form = $("#experienceForm");
  form.reset();
  form.work_id.value = workId;
  form.id.value = experience?.id || "";
  form.version.value = experience?.version || "";
  form.started_at.value = (experience?.started_at || (experience ? "" : new Date().toISOString().slice(0, 10))).slice(0, 10);
  form.completed_at.value = (experience?.completed_at || "").slice(0, 10);
  form.rating.value = experience?.rating ?? "";
  form.progress_current.value = experience?.progress_current ?? "";
  form.progress_total.value = experience?.progress_total ?? "";
  form.memo.value = experience?.memo || "";
  $(".form-error", form).textContent = "";
  $("#experienceDialogTitle").textContent = experience ? "体験記録を編集" : "体験を追加";
  $("#experienceDialog").showModal();
}

async function submitExperience(form) {
  const error = $(".form-error", form);
  error.textContent = "";
  const progressError = validateProgress(form);
  if (progressError) { error.textContent = progressError.message; return; }
  const workId = form.work_id.value;
  const isEdit = Boolean(form.id.value);
  const payload = {
    started_at: form.started_at.value || null, completed_at: form.completed_at.value || null, rating: nullableNumber(form.rating.value),
    progress_current: nullableNumber(form.progress_current.value), progress_total: nullableNumber(form.progress_total.value), memo: form.memo.value || null
  };
  try {
    if (isEdit) payload.version = Number(form.version.value);
    const path = isEdit ? `/api/experiences/${encodeURIComponent(form.id.value)}` : `/api/works/${encodeURIComponent(workId)}/experiences`;
    await api(path, { method: isEdit ? "PATCH" : "POST", body: JSON.stringify(payload) });
    $("#experienceDialog").close();
    toast(isEdit ? "体験記録を更新しました。" : "体験を追加しました。");
    document.dispatchEvent(new CustomEvent("app:refresh-detail", { detail: workId }));
  } catch (e) { error.textContent = e.message; }
}

// --- 危険操作(ユーザー停止・ブロック) ---

export function openDangerDialog(action, userId, email) {
  const f = $("#dangerForm");
  f.reset();
  f.action.value = action;
  f.user_id.value = userId;
  f.dataset.email = email;
  $(".email-confirm", f).hidden = action !== "block";
  $(".suspend-until", f).hidden = action !== "suspend";
  const title = { block: "ユーザーをブロック", suspend: "ユーザーを一時停止", unblock: "利用を再開" }[action];
  $("#dangerTitle").textContent = title;
  $("#dangerDescription").textContent = action === "block" ? "次のAPI通信から即時拒否します。作品・メモは削除しません。" : action === "suspend" ? "期限まで全APIを停止します。作品・メモは保持します。" : "利用を再開し、過去の作品・メモを再表示します。";
  $(".form-error", f).textContent = "";
  $("#dangerDialog").showModal();
}

export function initDialogs() {
  $("#workForm").addEventListener("submit", (e) => { e.preventDefault(); submitWork(e.currentTarget); });
  $("#workForm").addEventListener("input", (e) => {
    if (e.target.name === "short_note") $('[data-counter="short_note"]').textContent = e.target.value.length;
    if (e.target.name === "type") syncWorkFormMedia(e.currentTarget);
    saveOpenDraft();
  });
  $("#workDialog").addEventListener("cancel", (e) => { e.preventDefault(); requestCloseDialog(e.currentTarget); });

  $(".note-type-chips").addEventListener("click", (event) => {
    const chip = event.target.closest("[data-note-type]");
    if (!chip) return;
    $$(".note-type-chips [data-note-type]").forEach((btn) => btn.classList.toggle("is-active", btn === chip));
    $("#noteForm").note_type.value = chip.dataset.noteType;
  });
  $("#noteForm").addEventListener("submit", (e) => { e.preventDefault(); submitNote(e.currentTarget); });
  $("#experienceForm").addEventListener("submit", (e) => { e.preventDefault(); submitExperience(e.currentTarget); });

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-action='open-work-dialog']")) openWorkDialog(false);
    if (event.target.closest("[data-action='close-dialog']")) requestCloseDialog(event.target.closest("dialog"));
    if (event.target.closest("[data-action='discard-work-draft']")) discardWorkDraft();
    if (event.target.closest("[data-action='edit-work']")) openWorkDialog(true);
  });

  window.addEventListener("beforeunload", saveOpenDraft);
}
