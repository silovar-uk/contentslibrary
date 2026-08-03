import { $, $$, esc, toast, skeletonCards } from "../core/dom.js";
import { api } from "../core/api.js";
import { TYPE_LABELS, STATUS_LABELS, statusLabel, cardRatingMarkup, cardNoteMarkup } from "../core/format.js";
import { state, setFilters, clearFilters as clearStoreFilters, filteredWorks, subscribe, setView, openNoteCardIds } from "../core/store.js";

let savedViews = [];
let defaultApplied = false;
const selectedWorkIds = new Set();
let selectionMode = false;

// 604件規模だと毎回全件描画が重い(実測: レイアウトだけで600ms超)ため、既定では先頭だけ描画し
// 「もっと見る」で追加表示する。絞り込み・並び替えが変わったら先頭からやり直す。
const PAGE_SIZE = 60;
let visibleCount = PAGE_SIZE;
let lastFiltersKey = "";

function syncControlsFromState() {
  $("#filterType").value = state.filters.type;
  $("#filterStatus").value = state.filters.statuses[0] || "";
  $("#filterRating").value = state.filters.rating_min;
  $("#filterRatingExact").value = state.filters.rating_exact;
  $("#filterFavorite").value = state.filters.favorite;
  $("#filterLabel").value = state.filters.label;
  $("#filterNotes").checked = state.filters.has_notes;
  $("#sortSelect").value = state.filters.sort;
  $("#globalSearch").value = state.filters.q;
}

function readControlsIntoFilters() {
  const status = $("#filterStatus").value;
  setFilters({
    type: $("#filterType").value,
    statuses: status ? [status] : [],
    rating_min: $("#filterRatingExact").value ? "" : $("#filterRating").value,
    rating_exact: $("#filterRatingExact").value,
    favorite: $("#filterFavorite").value,
    label: $("#filterLabel").value.trim(),
    has_notes: $("#filterNotes").checked,
    sort: $("#sortSelect").value,
    genreId: "",
    theme: ""
  });
}

function labelChip(text) {
  return `<span class="label-chip">${esc(text)}</span>`;
}

function progressText(work) {
  if (work.progress_current == null) return "";
  const total = work.progress_total != null ? ` / ${work.progress_total}` : "";
  return `${work.progress_current}${total}${work.unit_label ? ` ${work.unit_label}` : ""}`;
}

export function renderWorkList() {
  if (state.view !== "library") return; // 非表示ビューの全件再描画はしない(実測: 600件で600ms超)
  const list = $("#workList");
  if (!state.loaded) { list.innerHTML = skeletonCards(6); $("#resultSummary").textContent = "読み込み中…"; return; }
  const filtersKey = JSON.stringify(state.filters);
  if (filtersKey !== lastFiltersKey) { lastFiltersKey = filtersKey; visibleCount = PAGE_SIZE; }
  const works = filteredWorks();
  const visible = works.slice(0, visibleCount);
  const remaining = works.length - visible.length;
  list.innerHTML = visible.length
    ? visible.map((work) => {
        const labels = [...(work.labels?.genre || []), ...(work.labels?.theme || []), ...(work.labels?.tag || [])];
        const favorite = work.metadata?.favorite === true;
        const selected = selectedWorkIds.has(work.id);
        const isCurrent = state.selectedId === work.id;
        return `
    <article class="work-card ${selectionMode ? "is-selectable" : ""} ${selectionMode && selected ? "is-selected" : ""} ${isCurrent ? "is-current" : ""}" data-work-id="${esc(work.id)}">
      <button type="button" class="work-card-main" data-open-work="${esc(work.id)}" aria-current="${isCurrent}" ${selectionMode ? `aria-pressed="${selected}"` : ""}>
        ${selectionMode ? `<span class="select-mark" aria-hidden="true">${selected ? "✓" : ""}</span>` : ""}
        <div class="work-card-top"><div class="type-status"><span class="type-pill">${TYPE_LABELS[work.type]}</span><span>${statusLabel(work.type, work.status)}</span></div>${favorite ? '<span class="favorite-mark">栞</span>' : ""}</div>
        <h3>${esc(work.title)}</h3><div class="creator">${esc(work.creator || "")}</div>
        ${work.short_note ? `<p class="short-note">${esc(work.short_note)}</p>` : ""}
        <div class="label-row">${labels.slice(0, 6).map(labelChip).join("")}</div>
        <div class="card-footer"><span>${progressText(work) ? esc(progressText(work)) : "進捗未設定"}</span></div>
      </button>
      ${cardRatingMarkup(work)}
      ${cardNoteMarkup(work, openNoteCardIds.has(work.id))}
    </article>`;
      }).join("") + (remaining > 0 ? `<button type="button" class="load-more-button" data-action="load-more-works">もっと見る(残り${remaining}件)</button>` : "")
    : '<div class="empty-state">条件に合う作品がありません。<br>検索条件を減らすか、新しい作品を追加してください。</div>';
  $("#resultSummary").textContent = remaining > 0 ? `${visible.length}件を表示(全${works.length}件)` : `${works.length}件を表示`;
  renderActiveFilters();
  updateSelectionUi();
}

function renderActiveFilters() {
  const f = state.filters;
  const chips = [];
  if (f.q) chips.push(`検索「${f.q}」`);
  if (f.type) chips.push(TYPE_LABELS[f.type]);
  if (f.statuses[0]) chips.push(STATUS_LABELS[f.statuses[0]]);
  if (f.rating_exact) chips.push(f.rating_exact === "unrated" ? "未評価" : `評価 ${f.rating_exact}`);
  else if (f.rating_min) chips.push(`評価${f.rating_min}以上`);
  if (f.favorite === "true") chips.push("お気に入りのみ");
  if (f.favorite === "false") chips.push("栞なし");
  if (f.theme) chips.push(`テーマ：${f.theme}`);
  if (f.label) chips.push(`分類：${f.label}`);
  if (f.has_notes) chips.push("メモあり");
  $("#activeFilters").innerHTML = chips.map((c, i) => `<button type="button" class="filter-chip" data-chip-index="${i}">${esc(c)} <span aria-hidden="true">×</span></button>`).join("");
}

function clearChipByText(text) {
  const f = state.filters;
  if (text.startsWith("検索「")) { setFilters({ q: "" }); $("#globalSearch").value = ""; return; }
  if (text === TYPE_LABELS[f.type]) { setFilters({ type: "" }); $("#filterType").value = ""; return; }
  if (text === STATUS_LABELS[f.statuses[0]]) { setFilters({ statuses: [] }); $("#filterStatus").value = ""; return; }
  if (text.startsWith("評価")) { setFilters({ rating_min: "", rating_exact: "" }); $("#filterRating").value = ""; $("#filterRatingExact").value = ""; return; }
  if (text === "お気に入りのみ" || text === "栞なし") { setFilters({ favorite: "" }); $("#filterFavorite").value = ""; return; }
  if (text.startsWith("テーマ：")) { setFilters({ theme: "" }); return; }
  if (text.startsWith("分類：")) { setFilters({ label: "" }); $("#filterLabel").value = ""; return; }
  if (text === "メモあり") { setFilters({ has_notes: false }); $("#filterNotes").checked = false; return; }
}

function querySummary(query = {}) {
  const parts = [];
  if (query.q) parts.push(`「${query.q}」`);
  if (query.type) parts.push(TYPE_LABELS[query.type] || query.type);
  if (query.status) parts.push(STATUS_LABELS[query.status] || query.status);
  if (query.rating_min) parts.push(`評価${query.rating_min}以上`);
  if (query.label) parts.push(query.label);
  if (query.has_notes) parts.push("メモあり");
  return parts.join("・") || "絞り込みなし";
}

function currentQueryForSave() {
  const f = state.filters;
  const result = {};
  if (f.q) result.q = f.q;
  if (f.type) result.type = f.type;
  if (f.statuses[0]) result.status = f.statuses[0];
  if (f.rating_min) result.rating_min = f.rating_min;
  if (f.label) result.label = f.label;
  if (f.has_notes) result.has_notes = true;
  return result;
}

function applySavedQuery(query) {
  setFilters({
    q: query.q || "",
    type: query.type || "",
    statuses: query.status ? [query.status] : [],
    rating_min: query.rating_min || "",
    rating_exact: "",
    favorite: "",
    label: query.label || "",
    has_notes: query.has_notes === true,
    sort: "updated_desc",
    genreId: "",
    theme: ""
  });
  syncControlsFromState();
  setView("library");
}

function renderSavedViews() {
  const box = $("#customSavedViews");
  if (!box) return;
  box.innerHTML = savedViews.length
    ? savedViews.map((view) => `<article class="saved-view-item"><button type="button" class="saved-view-main" data-view-apply="${esc(view.id)}"><strong>${esc(view.name)}</strong><small>${esc(querySummary(view.query))}</small></button><button type="button" class="saved-view-star" data-view-default="${esc(view.id)}" aria-label="起動時の表示にする">${Number(view.is_default) === 1 ? "★" : "☆"}</button><button type="button" class="saved-view-delete" data-view-delete="${esc(view.id)}" aria-label="削除">×</button></article>`).join("")
    : '<p class="muted">保存した検索条件はありません。</p>';
}

async function loadSavedViews(applyDefault) {
  try {
    const data = await api("/api/saved-views");
    savedViews = data.items || [];
    renderSavedViews();
    const defaultView = savedViews.find((v) => Number(v.is_default) === 1 || v.is_default === true);
    if (applyDefault && !defaultApplied && defaultView) {
      defaultApplied = true;
      applySavedQuery(defaultView.query);
      toast(`「${defaultView.name}」を表示しました。`);
    }
  } catch {
    $("#customSavedViews").innerHTML = '<p class="muted">保存ビューを読み込めませんでした。</p>';
  }
}

async function loadLabelSuggestions(q = "") {
  try {
    const data = await api(`/api/labels?limit=30&q=${encodeURIComponent(q)}`);
    $("#labelSuggestions").innerHTML = (data.items || []).map((item) => `<option value="${esc(item.name)}" label="${item.kind}・${item.usage_count}件"></option>`).join("");
  } catch {}
}

// --- 選択してJSON書き出し ---

function visibleWorkIds() {
  return $$("#workList .work-card[data-work-id]").map((card) => card.dataset.workId);
}

function updateSelectionUi() {
  const count = selectedWorkIds.size;
  const bar = $("#selectionExportBar");
  const toggle = $("#selectionExportToggle");
  const download = $('[data-selection-action="download"]');
  const clear = $('[data-selection-action="clear"]');
  const visibleToggle = $('[data-selection-action="visible"]');
  const ids = visibleWorkIds();
  const allSelected = ids.length > 0 && ids.every((id) => selectedWorkIds.has(id));
  if (bar) bar.hidden = !selectionMode;
  if (toggle) { toggle.textContent = selectionMode ? "選択を終了" : "選択してJSON"; toggle.setAttribute("aria-pressed", String(selectionMode)); }
  $("#selectionExportCount").textContent = `${count}件選択中`;
  if (clear) clear.disabled = count === 0;
  if (download) { download.disabled = count === 0; download.textContent = count > 0 ? `${count}件をJSON` : "JSON書き出し"; }
  if (visibleToggle) { visibleToggle.disabled = ids.length === 0; visibleToggle.textContent = allSelected ? "表示中の選択を解除" : "表示中をすべて選択"; }
}

function setSelectionMode(on) {
  selectionMode = Boolean(on);
  if (!selectionMode) selectedWorkIds.clear();
  renderWorkList();
  if (selectionMode) toast("作品をクリックして、JSONに入れる作品を選べます。");
}

async function downloadSelected() {
  if (selectedWorkIds.size === 0) return;
  const button = $('[data-selection-action="download"]');
  button.disabled = true;
  const original = button.textContent;
  button.textContent = "書き出し中…";
  try {
    const response = await fetch("/api/export?format=json", {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-App-Request": "sakuhin-log" },
      body: JSON.stringify({ work_ids: Array.from(selectedWorkIds) })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error?.message || `エラー ${response.status}`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sakuhin-log-selected-${selectedWorkIds.size}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`選択した${selectedWorkIds.size}件をJSONで書き出しました。`);
  } catch (error) {
    toast(error.message, "error");
  } finally {
    button.disabled = selectedWorkIds.size === 0;
    button.textContent = original;
    updateSelectionUi();
  }
}

export function initLibrary() {
  subscribe(renderWorkList);

  let timer;
  $("#globalSearch").addEventListener("input", (e) => {
    const value = e.target.value;
    clearTimeout(timer);
    // 打鍵ごとに604件を再描画すると重い(実測145ms/回)ため、指を止めてから反映する。
    timer = setTimeout(() => { setFilters({ q: value }); setView("library"); }, 80);
  });
  ["#filterType", "#filterStatus", "#filterRating", "#filterRatingExact", "#filterFavorite", "#filterNotes", "#sortSelect"].forEach((sel) => {
    $(sel).addEventListener("change", readControlsIntoFilters);
  });
  $("#filterLabel").addEventListener("focus", () => loadLabelSuggestions($("#filterLabel").value));
  $("#filterLabel").addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => { readControlsIntoFilters(); loadLabelSuggestions($("#filterLabel").value.split(/[、,]/).at(-1)?.trim() || ""); }, 60);
  });

  $("#activeFilters").addEventListener("click", (event) => {
    const chip = event.target.closest(".filter-chip");
    if (!chip) return;
    clearChipByText(chip.textContent.replace(/×\s*$/, "").trim());
    syncControlsFromState();
  });

  $("#saveCurrentView").addEventListener("click", () => {
    const form = $("#savedViewForm");
    form.reset();
    $(".form-error", form).textContent = "";
    $("#savedViewPreview").textContent = querySummary(currentQueryForSave());
    $("#savedViewDialog").showModal();
    setTimeout(() => form.name.focus(), 40);
  });
  $("#savedViewForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = $(".form-error", form);
    error.textContent = "";
    try {
      await api("/api/saved-views", { method: "POST", body: JSON.stringify({ name: form.name.value, query: currentQueryForSave(), is_default: form.is_default.checked }) });
      $("#savedViewDialog").close();
      toast("検索条件を保存しました。");
      await loadSavedViews(false);
    } catch (err) { error.textContent = err.message; }
  });
  $("#customSavedViews").addEventListener("click", async (event) => {
    const applyId = event.target.closest("[data-view-apply]")?.dataset.viewApply;
    const defaultId = event.target.closest("[data-view-default]")?.dataset.viewDefault;
    const deleteId = event.target.closest("[data-view-delete]")?.dataset.viewDelete;
    if (applyId) {
      const view = savedViews.find((v) => v.id === applyId);
      if (view) { applySavedQuery(view.query); toast(`「${view.name}」を適用しました。`); }
      return;
    }
    if (defaultId) {
      try { await api(`/api/saved-views/${encodeURIComponent(defaultId)}`, { method: "PATCH", body: JSON.stringify({ is_default: true }) }); toast("起動時の表示に設定しました。"); await loadSavedViews(false); }
      catch (err) { toast(err.message, "error"); }
      return;
    }
    if (deleteId) {
      const view = savedViews.find((v) => v.id === deleteId);
      if (!view || !confirm(`「${view.name}」を削除しますか？`)) return;
      try { await api(`/api/saved-views/${encodeURIComponent(deleteId)}`, { method: "DELETE" }); toast("保存ビューを削除しました。"); await loadSavedViews(false); }
      catch (err) { toast(err.message, "error"); }
    }
  });

  $("#loadMore")?.remove(); // 全件常駐のため「続きを表示」は不要

  $("#selectionExportToggle").addEventListener("click", () => setSelectionMode(!selectionMode));
  $("#selectionExportBar").addEventListener("click", (event) => {
    const action = event.target.closest("[data-selection-action]")?.dataset.selectionAction;
    if (!action) return;
    if (action === "visible") {
      const ids = visibleWorkIds();
      const allSelected = ids.length > 0 && ids.every((id) => selectedWorkIds.has(id));
      ids.forEach((id) => (allSelected ? selectedWorkIds.delete(id) : selectedWorkIds.add(id)));
      renderWorkList();
    }
    if (action === "clear") { selectedWorkIds.clear(); renderWorkList(); }
    if (action === "download") void downloadSelected();
    if (action === "finish") setSelectionMode(false);
  });

  // 選択モード中はカード内のどこを押しても選択トグルにする(★・メモ操作も含めて)。
  // 通常時はここでは何もせず、data-open-workの委譲(app.js)にクリックを委ねる。
  $("#workList").addEventListener("click", (event) => {
    const card = event.target.closest(".work-card[data-work-id]");
    if (!card || !selectionMode) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const id = card.dataset.workId;
    if (selectedWorkIds.has(id)) selectedWorkIds.delete(id); else selectedWorkIds.add(id);
    renderWorkList();
  }, true);

  document.addEventListener("keydown", (event) => {
    if (selectionMode && event.key === "Escape") { event.preventDefault(); setSelectionMode(false); }
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-action='clear-filters']")) {
      clearStoreFilters();
      syncControlsFromState();
    }
    const preset = event.target.closest("[data-preset]")?.dataset.preset;
    if (preset) {
      const map = {
        reading: { type: "book", statuses: ["active"] },
        completed: { statuses: ["completed"] },
        stopped: { statuses: ["paused"] },
        "high-rating": { rating_min: "4" }
      };
      clearStoreFilters();
      setFilters(map[preset] || {});
      syncControlsFromState();
      setView("library");
    }
    if (event.target.closest("[data-action='toggle-filters']")) $(".filter-panel").classList.toggle("is-open");

    if (event.target.closest("[data-action='load-more-works']")) { visibleCount += PAGE_SIZE; renderWorkList(); }
  });

  syncControlsFromState();
  void loadSavedViews(true);
  void loadLabelSuggestions("");
}

export function shelfNavigateToGenre(genreId, statuses, favorite) {
  clearStoreFilters();
  setFilters({ genreId, statuses: statuses || [], favorite: favorite ? "true" : "" });
  syncControlsFromState();
  $(".mobile-nav [data-mobile-view='library']")?.click();
  setView("library");
}

export function shelfClearGenreFilter() {
  setFilters({ genreId: "" });
}

export function themeNavigate(name) {
  clearStoreFilters();
  setFilters({ theme: name });
  syncControlsFromState();
  $(".mobile-nav [data-mobile-view='library']")?.click();
  setView("library");
}
