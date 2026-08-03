import { $, $$, esc, toast, fmtDate, fmtDateTime, setBusy } from "../core/dom.js";
import { api } from "../core/api.js";
import { TYPE_LABELS, NOTE_LABELS, mediaConfig, statusLabel, stars, ratingLevel } from "../core/format.js";
import { state, setSelectedDetail, selectWork, setView, closeDetail, toggleQuickEdit, subscribe, removeWorkFromStore, setWorkCover } from "../core/store.js";
import { isAllowedCoverUrl, candidateCoverUrlFromWork, extractAsinFromProductUrl, amazonCoverUrlFromIsbn10, probeCoverImage } from "../core/cover.js";
import { openWorkDialog, openNoteDialog, openExperienceDialog } from "./dialogs.js";

let noteSort = "manual";
let experienceSort = "desc";
let factContext = null;

export async function openDetail(id) {
  selectWork(id);
  setView("library");
  try {
    const data = await api(`/api/works/${encodeURIComponent(id)}`);
    setSelectedDetail(data);
    $("#detailPanel").classList.add("is-open");
  } catch (e) { toast(e.message, "error"); }
}

function nullableNumber(value) { return value === "" ? null : Number(value); }

function ratingDelta(current, previous) {
  if (current == null) return "";
  if (previous == null) return '<span class="rating-change first">初回評価</span>';
  const delta = Number(current) - Number(previous);
  if (delta === 0) return '<span class="rating-change same">変化なし</span>';
  return `<span class="rating-change ${delta > 0 ? "up" : "down"}">${delta > 0 ? "↑" : "↓"} ${delta > 0 ? "+" : ""}${delta.toFixed(1)}</span>`;
}

function experienceSummary(experiences) {
  const chronological = [...experiences].sort((a, b) => Number(a.sequence) - Number(b.sequence));
  const rated = chronological.filter((x) => x.rating != null);
  if (rated.length < 2) return "";
  const first = Number(rated[0].rating);
  const latest = Number(rated.at(-1).rating);
  const delta = latest - first;
  return `<div class="rating-journey"><span>評価の変化</span><strong>初回 ${first.toFixed(1)} → 最新 ${latest.toFixed(1)}</strong><small class="${delta > 0 ? "up" : delta < 0 ? "down" : "same"}">${delta === 0 ? "変化なし" : `${delta > 0 ? "↑ +" : "↓ "}${delta.toFixed(1)}`}</small></div>`;
}

function sortedExperiences(experiences) {
  return [...experiences].sort((a, b) => (experienceSort === "asc" ? Number(a.sequence) - Number(b.sequence) : Number(b.sequence) - Number(a.sequence)));
}
function sortedNotes(notes) {
  const items = [...notes];
  if (noteSort === "newest") return items.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  if (noteSort === "oldest") return items.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  if (noteSort === "type") return items.sort((a, b) => String(a.note_type).localeCompare(String(b.note_type), "ja") || String(b.updated_at).localeCompare(String(a.updated_at)));
  return items.sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.created_at).localeCompare(String(b.created_at)));
}

function experiencesMarkup(experiences) {
  const chronological = [...experiences].sort((a, b) => Number(a.sequence) - Number(b.sequence));
  const previousRating = new Map();
  let last = null;
  for (const item of chronological) { previousRating.set(item.id, last); if (item.rating != null) last = Number(item.rating); }
  const items = sortedExperiences(experiences);
  return `<div class="section-heading-row"><h3>体験履歴</h3><div class="section-heading-tools"><button type="button" class="text-button" data-action="add-experience">＋ 体験を追加</button><label>並び順<select id="experienceSortSelect"><option value="desc" ${experienceSort === "desc" ? "selected" : ""}>新しい体験から</option><option value="asc" ${experienceSort === "asc" ? "selected" : ""}>初回から</option></select></label></div></div>
    ${experienceSummary(experiences)}
    <div class="timeline">${items.length ? items.map((x) => `<article class="timeline-item" data-experience-id="${esc(x.id)}"><div class="item-top"><div><strong>${x.sequence}回目${x.completed_at ? "・完了" : x.started_at ? "・進行中" : ""}</strong>${ratingDelta(x.rating, previousRating.get(x.id))}</div><div class="item-actions"><button type="button" data-edit-experience="${esc(x.id)}">編集</button><button type="button" class="danger-link" data-delete-experience="${esc(x.id)}">削除</button></div></div><p class="item-meta">${[x.started_at && `開始 ${fmtDate(x.started_at)}`, x.completed_at && `完了 ${fmtDate(x.completed_at)}`, x.rating != null && stars(x.rating), x.progress_current != null && `進捗 ${x.progress_current}${x.progress_total != null ? ` / ${x.progress_total}` : ""}`].filter(Boolean).join(" / ") || "日付・評価なし"}</p>${x.memo ? `<p class="item-memo">${esc(x.memo)}</p>` : ""}</article>`).join("") : '<p class="muted">まだ体験記録がありません。</p>'}</div>`;
}

function notesMarkup(notes) {
  const items = sortedNotes(notes);
  return `<div class="section-heading-row"><h3>メモ</h3><label>並び順<select id="noteSortSelect"><option value="manual" ${noteSort === "manual" ? "selected" : ""}>自分の順番</option><option value="newest" ${noteSort === "newest" ? "selected" : ""}>更新が新しい順</option><option value="oldest" ${noteSort === "oldest" ? "selected" : ""}>作成が古い順</option><option value="type" ${noteSort === "type" ? "selected" : ""}>メモ種別順</option></select></label></div>
    <div class="note-item-list">${items.length ? items.map((note, index) => `<article class="note-block" data-note-id="${esc(note.id)}"><header><div><span class="note-kind">${esc(NOTE_LABELS[note.note_type] || note.note_type)}</span>${note.position ? `<span>${esc(note.position)}</span>` : ""}<time>${fmtDateTime(note.updated_at)}</time></div><div class="item-actions">${noteSort === "manual" ? `<button type="button" data-move-note="up" data-note-id="${esc(note.id)}" ${index === 0 ? "disabled" : ""} aria-label="上へ移動">↑</button><button type="button" data-move-note="down" data-note-id="${esc(note.id)}" ${index === items.length - 1 ? "disabled" : ""} aria-label="下へ移動">↓</button>` : ""}<button type="button" data-edit-note="${esc(note.id)}">編集</button><button type="button" class="danger-link" data-delete-note="${esc(note.id)}">削除</button></div></header><p>${esc(note.content)}</p></article>`).join("") : '<p class="muted">メモはまだありません。</p>'}</div>`;
}

// 表紙はAmazon商品画像への直リンク(個人の記録用途)。本・漫画はISBNがあれば1クリックで取得でき、
// それ以外は商品ページURL/画像URLを貼る。取得の可否は貼り付け側(cover.jsのprobeCoverImage)で確認する。
function coverMarkup(work) {
  const cover = work?.metadata?.cover_url;
  if (cover && isAllowedCoverUrl(cover)) {
    return `<section class="detail-section cover-section">
      <div class="cover-current"><img src="${esc(cover)}" alt="" loading="lazy" decoding="async" class="detail-cover-image"><button type="button" class="ghost-button" data-action="remove-cover">表紙を削除</button></div>
    </section>`;
  }
  const candidate = candidateCoverUrlFromWork(work);
  return `<section class="detail-section cover-section">
    <h3>表紙</h3>
    <p class="muted">Amazonの商品画像を登録できます(個人の記録用)。</p>
    ${candidate ? `<button type="button" class="secondary-button" data-action="fetch-cover-from-isbn" data-cover-candidate="${esc(candidate)}">ISBNから表紙を取得</button>` : ""}
    <form class="cover-form" data-cover-form>
      <input type="text" name="cover_input" placeholder="Amazon商品ページURL、または画像URLを貼り付け">
      <button type="submit" class="primary-button">設定</button>
    </form>
    <div class="form-error cover-error" role="alert"></div>
  </section>`;
}

function preferenceMarkup(work) {
  const favorite = work?.metadata?.favorite === true;
  const level = ratingLevel(work);
  return `<section class="preference-panel"><button type="button" class="favorite-button ${favorite ? "is-on" : ""}" data-toggle-favorite aria-pressed="${favorite}"><span>栞</span><strong>${favorite ? "お気に入り" : "お気に入りにする"}</strong></button><div class="rating-picker"><span>自分の評価</span><div>${[1, 2, 3, 4, 5].map((v) => `<button type="button" data-set-rating="${v}" class="${v <= level ? "is-on" : ""}" aria-label="評価 ${v}" aria-pressed="${level === v}">${v}</button>`).join("")}<button type="button" class="rating-clear" data-set-rating="">未評価</button></div></div></section>`;
}

function safeUrl(value) {
  try { const url = new URL(String(value)); return ["http:", "https:"].includes(url.protocol) ? url.toString() : ""; } catch { return ""; }
}
function factMarkup(work) {
  const facts = work?.metadata?.ai_facts;
  if (!facts || typeof facts !== "object") return "";
  const item = facts.work && typeof facts.work === "object" ? facts.work : {};
  const labelMap = { original_title: "原題", publisher: "出版社", publication_date: "刊行日", isbn_10: "ISBN-10", isbn_13: "ISBN-13", language: "言語", country: "国・地域", series_name: "シリーズ", volume_number: "巻", page_count: "ページ数", official_url: "公式URL" };
  const rows = Object.entries(labelMap).flatMap(([key, label]) => {
    const value = item[key];
    if (value == null || value === "") return [];
    if (key === "official_url") { const url = safeUrl(value); return url ? [`<dt>${label}</dt><dd><a href="${esc(url)}" target="_blank" rel="noopener">公式ページ ↗</a></dd>`] : []; }
    return [`<dt>${label}</dt><dd>${esc(value)}</dd>`];
  });
  const creators = Array.isArray(facts.creators) ? facts.creators : [];
  const sources = Array.isArray(facts.sources) ? facts.sources : [];
  if (!rows.length && !creators.length && !sources.length) return "";
  return `<section class="detail-section fact-section"><div class="fact-heading"><div><h3>作品ファクト</h3><p>公開情報をもとに補完した事実欄</p></div></div>${rows.length ? `<dl>${rows.join("")}</dl>` : ""}${creators.map((c) => `<article class="creator-fact"><strong>${esc(c.name || "")}</strong>${c.reading ? `<small>${esc(c.reading)}</small>` : ""}<p>${[c.birth_year && `${c.birth_year}年生`, c.death_year && `${c.death_year}年没`, c.nationality, ...(Array.isArray(c.occupations) ? c.occupations : [])].filter(Boolean).map(esc).join("・")}</p>${c.biography ? `<div>${esc(c.biography)}</div>` : ""}</article>`).join("")}${sources.length ? `<div class="fact-sources"><strong>出典 ${sources.length}件</strong>${sources.map((s) => { const url = safeUrl(s.url); return url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(s.title || s.publisher || "出典")} ↗</a>` : ""; }).join("")}</div>` : ""}</section>`;
}

function quickEditMarkup(w) {
  if (!state.quickEditOpen) return "";
  const config = mediaConfig(w.type);
  return `<section class="quick-edit-card"><div class="quick-edit-heading"><h3>よく変える項目</h3><button class="icon-button" type="button" data-action="toggle-quick-edit" aria-label="閉じる">×</button></div>
    <form id="quickEditForm" class="quick-edit-form">
      <input type="hidden" name="version" value="${Number(w.version)}">
      <div class="quick-edit-grid">
        <label class="field-label">状態<select name="status">${Object.entries(config.statuses).map(([value, label]) => `<option value="${value}" ${w.status === value ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></label>
      </div>
      <label class="field-label">一言メモ<textarea name="short_note" maxlength="280" rows="4">${esc(w.short_note || "")}</textarea><small><span data-quick-counter>${(w.short_note || "").length}</span>/280</small></label>
      <div class="quick-edit-grid progress-grid">
        <label class="field-label">${esc(config.current)}<input name="progress_current" type="number" min="0" step="0.1" value="${w.progress_current ?? ""}"></label>
        <label class="field-label">${esc(config.total)}<input name="progress_total" type="number" min="0" step="0.1" value="${w.progress_total ?? ""}"></label>
        <label class="field-label">単位<input name="unit_label" maxlength="30" value="${esc(w.unit_label || config.unit)}"></label>
      </div>
      <div class="form-error" role="alert"></div>
      <div class="quick-edit-actions"><button class="primary-button" type="submit">変更を保存</button></div>
    </form>
  </section>`;
}

function classificationMarkup(labels = {}) {
  const group = (kind, name) => `<div class="classification-group"><strong>${name}</strong><div>${(labels[kind] || []).length ? labels[kind].map((l) => `<span class="label-chip kind-${kind}">${esc(l)}</span>`).join("") : '<span class="muted">未設定</span>'}</div></div>`;
  return `<h3>分類</h3><div class="classification-grid">${group("genre", "ジャンル")}${group("theme", "テーマ")}${group("tag", "タグ")}</div>`;
}

// 記録を書き足す動線: メモ入力欄はパネル内に常設する(ダイアログを開く手間をなくす)。
function inlineNoteFormMarkup(workId) {
  return `<section class="detail-section inline-note-section">
    <h3>いま書き足す</h3>
    <form id="inlineNoteForm" class="inline-note-form">
      <input type="hidden" name="work_id" value="${esc(workId)}">
      <div class="note-type-chips inline-chips" role="group" aria-label="メモ種別">
        ${Object.entries(NOTE_LABELS).map(([value, label], i) => `<button type="button" data-inline-note-type="${value}" class="${i === 0 ? "is-active" : ""}">${esc(label)}</button>`).join("")}
      </div>
      <input type="hidden" name="note_type" value="quick">
      <textarea name="content" rows="3" placeholder="あとから戻りたい言葉を残す(Ctrl/⌘+Enterで保存)"></textarea>
      <div class="inline-note-footer"><input name="position" placeholder="p.128 / 第8話" class="inline-position"><button type="submit" class="primary-button">書き足す</button></div>
    </form>
  </section>`;
}

export function renderDetail() {
  const d = state.selected;
  const panel = $("#detailPanel");
  if (!d) { panel.classList.remove("is-open"); panel.innerHTML = '<div class="detail-empty"><span>↗</span><strong>作品を選択</strong><p>一覧から作品を選ぶと、体験履歴やメモをここで確認できる。</p></div>'; return; }
  const w = d.work;
  const labels = w.labels || { genre: [], theme: [], tag: [] };
  panel.innerHTML = `
    <div class="detail-header">
      <div class="type-status"><span class="type-pill">${TYPE_LABELS[w.type]}</span><span>${statusLabel(w.type, w.status)}</span></div>
      <h2>${esc(w.title)}</h2><div class="creator">${esc(w.creator || "")}</div>
      <div class="detail-actions"><button class="ghost-button desktop-only" data-action="toggle-quick-edit">${state.quickEditOpen ? "編集を閉じる" : "クイック編集"}</button><button class="ghost-button" data-action="edit-work">すべて編集</button><button class="ghost-button" data-action="open-fact-dialog">AIで事実を補完</button><button class="ghost-button" data-action="close-detail">閉じる</button></div>
    </div>
    ${coverMarkup(w)}
    ${preferenceMarkup(w)}
    ${quickEditMarkup(w)}
    ${inlineNoteFormMarkup(w.id)}
    ${w.short_note ? `<section class="detail-section"><h3>一言メモ</h3><div class="detail-short">${esc(w.short_note)}</div></section>` : ""}
    <section class="detail-section classification-section">${classificationMarkup(labels)}</section>
    ${factMarkup(w)}
    <section class="detail-section">${experiencesMarkup(d.experiences || [])}</section>
    <section class="detail-section">${notesMarkup(d.notes || [])}</section>
    <section class="detail-section"><h3>進捗・情報</h3><p class="muted">${w.progress_current != null ? `${w.progress_current}${w.progress_total ? ` / ${w.progress_total}` : ""} ${esc(w.unit_label || "")}` : "進捗未設定"}${w.release_year ? `<br>発表年 ${w.release_year}` : ""}</p></section>
    <section class="detail-section"><div class="danger-zone"><strong>作品を削除</strong><p class="muted">復元可能なソフト削除。</p><button class="ghost-button" data-action="delete-work">削除する</button></div></section>`;
}

async function submitQuickEdit(form) {
  $(".form-error", form).textContent = "";
  const current = nullableNumber(form.progress_current.value);
  const total = nullableNumber(form.progress_total.value);
  if (current !== null && total !== null && current > total) { $(".form-error", form).textContent = "現在の進捗は全体以下にしてください。"; return; }
  const payload = { version: Number(form.version.value), status: form.status.value, short_note: form.short_note.value.trim(), progress_current: current, progress_total: total, unit_label: form.unit_label.value.trim() || null };
  const button = $('[type="submit"]', form);
  setBusy(button, true);
  try {
    const data = await api(`/api/works/${encodeURIComponent(state.selectedId)}`, { method: "PATCH", body: JSON.stringify(payload) });
    toggleQuickEdit(false);
    setSelectedDetail(data);
    toast("クイック編集を保存しました。");
  } catch (e) { $(".form-error", form).textContent = e.message; }
  finally { setBusy(button, false); }
}

async function updatePreference(changes) {
  const work = state.selected?.work;
  if (!work) return;
  try {
    const data = await api(`/api/works/${encodeURIComponent(work.id)}/preferences`, { method: "PATCH", body: JSON.stringify({ version: Number(work.version), ...changes }) });
    setSelectedDetail(data);
    toast(changes.favorite !== undefined ? (changes.favorite ? "お気に入りに追加しました。" : "お気に入りを外しました。") : changes.rating == null ? "評価を未設定にしました。" : `評価を${changes.rating}にしました。`);
  } catch (error) { toast(error.message, "error"); }
}

// 表紙が無いISBN/ASINは200・43バイトの透明GIFを返す(onerrorが発火しない)ため、
// 保存する前に一度実際に読み込んで確認する(cover.jsのprobeCoverImage)。
async function applyCoverUrl(workId, candidateUrl, statusEl, button) {
  statusEl.textContent = "";
  setBusy(button, true, "確認中…");
  try {
    const ok = await probeCoverImage(candidateUrl);
    if (!ok) {
      statusEl.textContent = "この画像は取得できませんでした。商品ページで画像を右クリックし「画像アドレスをコピー」から貼り付けてください。";
      return;
    }
    await setWorkCover(workId, candidateUrl);
    toast("表紙を設定しました。");
  } catch (e) {
    statusEl.textContent = e.message;
  } finally {
    setBusy(button, false);
  }
}

async function submitCoverForm(form) {
  const workId = state.selectedId;
  const raw = form.cover_input.value.trim();
  const errorEl = $(".cover-error", form.closest(".cover-section"));
  errorEl.textContent = "";
  if (!raw) { errorEl.textContent = "URLを入力してください。"; return; }
  const button = $('[type="submit"]', form);

  if (isAllowedCoverUrl(raw)) { await applyCoverUrl(workId, raw, errorEl, button); return; }
  const asin = extractAsinFromProductUrl(raw);
  if (asin) {
    const candidate = amazonCoverUrlFromIsbn10(asin);
    if (candidate) { await applyCoverUrl(workId, candidate, errorEl, button); return; }
    // ASINの抽出自体は成功したが、書籍のISBN-10形式(数字10桁)ではない = 映像作品など自動化できない対象。
    errorEl.textContent = "この商品は自動で取得できません。商品ページで画像を右クリックし「画像アドレスをコピー」から貼り付けてください。";
    return;
  }
  errorEl.textContent = "Amazonの商品ページURL、またはAmazon画像のURLを貼り付けてください。";
}

async function removeCover() {
  const work = state.selected?.work;
  if (!work) return;
  try { await setWorkCover(work.id, null); toast("表紙を削除しました。"); }
  catch (e) { toast(e.message, "error"); }
}

async function submitInlineNote(form) {
  const button = $('[type="submit"]', form);
  if (!form.content.value.trim()) { form.content.focus(); return; }
  setBusy(button, true, "書き足し中…");
  try {
    await api(`/api/works/${encodeURIComponent(form.work_id.value)}/notes`, { method: "POST", body: JSON.stringify({ note_type: form.note_type.value, content: form.content.value, position: form.position.value || null }) });
    toast("メモを書き足しました。");
    await openDetail(form.work_id.value);
  } catch (e) { toast(e.message, "error"); }
  finally { setBusy(button, false); }
}

async function deleteNote(noteId) {
  const note = (state.selected?.notes || []).find((n) => n.id === noteId);
  if (!note || !confirm(`このメモを削除しますか？\n\n${note.content.slice(0, 80)}`)) return;
  try { await api(`/api/notes/${encodeURIComponent(noteId)}`, { method: "DELETE" }); toast("メモを削除しました。"); await openDetail(state.selectedId); }
  catch (e) { toast(e.message, "error"); }
}
async function deleteExperience(experienceId) {
  const item = (state.selected?.experiences || []).find((x) => x.id === experienceId);
  if (!item || !confirm(`${item.sequence}回目の体験記録を削除しますか？\n作品自体は削除されません。`)) return;
  try { await api(`/api/experiences/${encodeURIComponent(experienceId)}`, { method: "DELETE" }); toast("体験記録を削除しました。"); await openDetail(state.selectedId); }
  catch (e) { toast(e.message, "error"); }
}
async function moveNote(noteId, direction) {
  const items = sortedNotes(state.selected?.notes || []);
  const index = items.findIndex((n) => n.id === noteId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= items.length) return;
  [items[index], items[target]] = [items[target], items[index]];
  try { await api(`/api/works/${encodeURIComponent(state.selectedId)}/notes/reorder`, { method: "POST", body: JSON.stringify({ ids: items.map((n) => n.id) }) }); await openDetail(state.selectedId); }
  catch (e) { toast(e.message, "error"); }
}
async function deleteSelectedWork() {
  const w = state.selected?.work;
  if (!w || !confirm(`「${w.title}」を削除しますか？`)) return;
  try { await api(`/api/works/${encodeURIComponent(w.id)}`, { method: "DELETE" }); toast("削除しました。"); removeWorkFromStore(w.id); closeDetail(); }
  catch (e) { toast(e.message, "error"); }
}

// --- AI事実・分類の貼り付け取込 ---

function normalizeLabel(value = "") { return String(value).normalize("NFKC").trim().toLowerCase(); }

function factPrompt() { return "GET /api/works/:id/fact-package が返すpromptをそのまま使う。"; }

function currentLabels() { return state.selected?.work?.labels || factContext?.template?.classification?.current_labels || { genre: [], theme: [], tag: [] }; }

function parseReturnedJson(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const source = fenced ? fenced[1] : text;
  const parsed = JSON.parse(source);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
}

function previewOption(kind, value, currentSet, vocabularySet) {
  const normalized = normalizeLabel(value);
  const current = currentSet.has(normalized);
  const known = vocabularySet.has(normalized);
  const blocked = kind === "tag" && !known && !current;
  const checked = current; // 新規候補は初期OFF(v211の安全策を踏襲)
  const state = current ? "現在使用中" : known ? "既存語彙・確認して追加" : blocked ? "新規タグは対象外" : "新規候補・確認して追加";
  return `<label class="preview-option ${known || current ? "is-known" : "is-new"} ${blocked ? "is-blocked" : ""}"><input type="checkbox" data-label-kind="${kind}" data-label-value="${esc(value)}" ${checked ? "checked" : ""} ${blocked ? "disabled" : ""}><span><strong>${esc(value)}</strong><small>${state}</small></span></label>`;
}

function renderFactPreview() {
  const preview = $("#factPreview");
  const input = $("#factInput");
  let parsed;
  try { parsed = parseReturnedJson(input.value); }
  catch { preview.hidden = false; preview.innerHTML = '<strong>分類の確認</strong><p class="preview-error">JSONを読み取れると、ここに分類候補を表示します。</p>'; return; }
  const labels = parsed?.facts?.labels;
  if (!labels || typeof labels !== "object") { preview.hidden = true; preview.innerHTML = ""; return; }
  const current = currentLabels();
  const vocabulary = factContext?.template?.classification?.vocabulary || { genre: [], theme: [], tag: [] };
  const groups = ["genre", "theme", "tag"].map((kind) => {
    const values = Array.from(new Set(Array.isArray(labels[kind]) ? labels[kind].map((v) => String(v).trim()).filter(Boolean) : []));
    const currentSet = new Set((current[kind] || []).map(normalizeLabel));
    const vocabularySet = new Set((vocabulary[kind] || []).map(normalizeLabel));
    return `<div class="preview-group"><strong>${{ genre: "ジャンル", theme: "テーマ", tag: "タグ" }[kind]}</strong><div class="preview-options">${values.length ? values.map((v) => previewOption(kind, v, currentSet, vocabularySet)).join("") : '<span class="muted">候補なし</span>'}</div></div>`;
  }).join("");
  preview.hidden = false;
  preview.innerHTML = `<div class="preview-heading"><strong>分類の確認</strong><span>チェックした候補だけを反映用JSONへ残す</span></div>${groups}`;
}

async function openFactDialog() {
  const workId = state.selectedId;
  if (!workId) return;
  const output = $("#factOutput");
  const input = $("#factInput");
  const error = $("#factError");
  output.value = "読み込み中…";
  input.value = "";
  error.textContent = "";
  $("#factDialog").showModal();
  try {
    const data = await api(`/api/works/${encodeURIComponent(workId)}/fact-package`);
    factContext = { workId, ...data };
    const jsonText = JSON.stringify(data.template, null, 2);
    output.value = `${data.prompt}\n\n--- 入力JSON ---\n${jsonText}`;
    output.dataset.json = jsonText;
  } catch (e) { output.value = ""; error.textContent = e.message; }
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const area = document.createElement("textarea");
  area.value = text;
  document.body.append(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

function sanitizeFactLabels() {
  const input = $("#factInput");
  let parsed;
  try { parsed = parseReturnedJson(input.value); } catch { return; }
  if (!parsed?.facts?.labels) return;
  const selected = { genre: [], theme: [], tag: [] };
  $$("#factDialog [data-label-kind]:checked").forEach((control) => {
    const kind = control.dataset.labelKind;
    const value = control.dataset.labelValue;
    if (selected[kind] && value) selected[kind].push(value);
  });
  parsed.facts.labels = selected;
  input.value = JSON.stringify(parsed, null, 2);
}

async function importFacts() {
  const input = $("#factInput");
  const error = $("#factError");
  const button = $("[data-fact-import]");
  if (!factContext) return;
  error.textContent = "";
  try {
    const payload = parseReturnedJson(input.value);
    if (!payload) throw new Error("JSONオブジェクトを貼り付けてください。");
    payload.schema_version ??= factContext.template?.schema_version ?? 1;
    payload.work_id ??= factContext.template?.work_id;
    payload.version ??= factContext.template?.version;
    setBusy(button, true, "反映中…");
    const data = await api(`/api/works/${encodeURIComponent(factContext.workId)}/facts`, { method: "POST", body: JSON.stringify(payload) });
    $("#factDialog").close();
    toast("作者・刊行などの事実情報を反映しました。");
    setSelectedDetail(data);
  } catch (e) { error.textContent = e.message; }
  finally { setBusy(button, false, "事実情報を反映"); }
}

export function initDetail() {
  subscribe(renderDetail);

  document.addEventListener("click", async (event) => {
    if (event.target.closest("[data-action='toggle-quick-edit']")) { toggleQuickEdit(); if (state.quickEditOpen) setTimeout(() => $('#quickEditForm select[name="status"]')?.focus(), 20); }
    if (event.target.closest("[data-action='add-experience']")) openExperienceDialog(state.selectedId);
    if (event.target.closest("[data-action='delete-work']")) void deleteSelectedWork();
    if (event.target.closest("[data-action='close-detail']")) closeDetail();
    if (event.target.closest("[data-action='open-fact-dialog']")) void openFactDialog();
    if (event.target.closest("[data-action='remove-cover']")) void removeCover();
    const fetchCoverButton = event.target.closest("[data-action='fetch-cover-from-isbn']");
    if (fetchCoverButton) {
      const errorEl = $(".cover-error", fetchCoverButton.closest(".cover-section"));
      void applyCoverUrl(state.selectedId, fetchCoverButton.dataset.coverCandidate, errorEl, fetchCoverButton);
    }

    const editNote = event.target.closest("[data-edit-note]")?.dataset.editNote;
    if (editNote) { const note = (state.selected?.notes || []).find((n) => n.id === editNote); if (note) openNoteDialog(state.selectedId, note); }
    const deleteNoteId = event.target.closest("[data-delete-note]")?.dataset.deleteNote;
    if (deleteNoteId) void deleteNote(deleteNoteId);
    const editExperience = event.target.closest("[data-edit-experience]")?.dataset.editExperience;
    if (editExperience) { const item = (state.selected?.experiences || []).find((x) => x.id === editExperience); if (item) openExperienceDialog(state.selectedId, item); }
    const deleteExperienceId = event.target.closest("[data-delete-experience]")?.dataset.deleteExperience;
    if (deleteExperienceId) void deleteExperience(deleteExperienceId);
    const move = event.target.closest("[data-move-note]");
    if (move) void moveNote(move.dataset.noteId, move.dataset.moveNote);

    if (event.target.closest("[data-toggle-favorite]")) { const work = state.selected?.work; await updatePreference({ favorite: work?.metadata?.favorite !== true }); }
    const ratingButton = event.target.closest("[data-set-rating]");
    if (ratingButton) await updatePreference({ rating: ratingButton.dataset.setRating === "" ? null : Number(ratingButton.dataset.setRating) });

    const inlineType = event.target.closest("[data-inline-note-type]");
    if (inlineType) { $$(".inline-chips [data-inline-note-type]").forEach((b) => b.classList.toggle("is-active", b === inlineType)); $("#inlineNoteForm").note_type.value = inlineType.dataset.inlineNoteType; }

    if (event.target.closest("[data-fact-copy]")) {
      const mode = event.target.closest("[data-fact-copy]").dataset.factCopy;
      const output = $("#factOutput");
      try { await copyText(mode === "json" ? output.dataset.json || "" : output.value); toast(mode === "json" ? "作品JSONをコピーしました。" : "プロンプトと作品JSONをコピーしました。"); }
      catch { toast("コピーできませんでした。", "error"); }
    }
    if (event.target.closest("[data-fact-import]")) { sanitizeFactLabels(); void importFacts(); }
  });

  document.addEventListener("submit", (event) => {
    if (event.target.id === "quickEditForm") { event.preventDefault(); submitQuickEdit(event.target); }
    if (event.target.id === "inlineNoteForm") { event.preventDefault(); submitInlineNote(event.target); }
    if (event.target.hasAttribute("data-cover-form")) { event.preventDefault(); void submitCoverForm(event.target); }
  });

  document.addEventListener("input", (event) => {
    if (event.target.closest("#quickEditForm") && event.target.name === "short_note") { const c = $("[data-quick-counter]", event.target.closest("#quickEditForm")); if (c) c.textContent = event.target.value.length; }
    if (event.target.id === "factInput") renderFactPreview();
  });

  document.addEventListener("change", (event) => {
    if (event.target.id === "experienceSortSelect") { experienceSort = event.target.value; renderDetail(); }
    if (event.target.id === "noteSortSelect") { noteSort = event.target.value; renderDetail(); }
  });

  document.addEventListener("app:refresh-detail", (event) => { if (event.detail) void openDetail(event.detail); });
}
