import { $, esc, toast } from "../core/dom.js";
import { api } from "../core/api.js";
import { state, setFilters, setSelectedDetail, subscribe, upsertWork } from "../core/store.js";

export const READING_PRIORITY_LEVELS = [
  { value: "top", label: "最優先", short: "最優先", weight: 4 },
  { value: "high", label: "高", short: "高", weight: 3 },
  { value: "medium", label: "中", short: "中", weight: 2 },
  { value: "low", label: "低", short: "低", weight: 1 }
];

const PRIORITY_BY_VALUE = new Map(READING_PRIORITY_LEVELS.map((item) => [item.value, item]));
const CYCLE = ["", "low", "medium", "high", "top"];
let initialized = false;
let priorityFilter = "";
let observer = null;
let applyFrame = 0;
let expanding = false;
let applyingOrder = false;

function ensureStyle() {
  if ($('link[href="/styles/reading-priority.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/styles/reading-priority.css";
  document.head.append(link);
}

export function normalizeReadingPriority(value) {
  const key = String(value || "").trim();
  return PRIORITY_BY_VALUE.has(key) ? key : "";
}

export function readingPriority(work) {
  return normalizeReadingPriority(work?.metadata?.reading_priority);
}

export function isReadingPriorityEligible(work) {
  return ["book", "manga"].includes(work?.type) && ["want", "owned_unread"].includes(work?.status);
}

export function readingPriorityWeight(work) {
  if (!isReadingPriorityEligible(work)) return -1;
  return PRIORITY_BY_VALUE.get(readingPriority(work))?.weight || 0;
}

export function nextReadingPriority(value) {
  const current = normalizeReadingPriority(value);
  const index = CYCLE.indexOf(current);
  return CYCLE[(index + 1) % CYCLE.length];
}

function priorityLabel(value, unset = "未設定") {
  return PRIORITY_BY_VALUE.get(normalizeReadingPriority(value))?.label || unset;
}

function filterLabel(value) {
  return value === "unset" ? "未設定" : priorityLabel(value);
}

function ensureFilterControl() {
  if ($("#filterReadingPriority")) return;
  const favorite = $("#filterFavorite")?.closest(".field-label");
  if (!favorite) return;
  const label = document.createElement("label");
  label.className = "field-label reading-priority-filter-field";
  label.innerHTML = `読む優先度
    <select id="filterReadingPriority">
      <option value="">すべて</option>
      <option value="top">最優先</option>
      <option value="high">高</option>
      <option value="medium">中</option>
      <option value="low">低</option>
      <option value="unset">未設定</option>
    </select>`;
  favorite.after(label);
}

function ensureSortOption() {
  const select = $("#sortSelect");
  if (!select || select.querySelector('option[value="reading_priority_desc"]')) return;
  const option = document.createElement("option");
  option.value = "reading_priority_desc";
  option.textContent = "読む優先度が高い順";
  const favorite = select.querySelector('option[value="favorite_first"]');
  if (favorite) favorite.after(option); else select.append(option);
}

function ensureOrganizerButton() {
  if ($("[data-reading-priority-organize]")) return;
  const tools = $(".list-tools");
  if (!tools) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ghost-button reading-priority-organize-button";
  button.dataset.readingPriorityOrganize = "";
  button.textContent = "優先度整理";
  const sort = $("#sortSelect", tools);
  if (sort) sort.before(button); else tools.append(button);
}

function ensureOrganizerDialog() {
  if ($("#readingPriorityDialog")) return;
  const dialog = document.createElement("dialog");
  dialog.id = "readingPriorityDialog";
  dialog.className = "reading-priority-dialog";
  dialog.innerHTML = `<div class="reading-priority-dialog-shell">
    <header class="reading-priority-dialog-header">
      <div><p>READING QUEUE</p><h2>読む優先度を整理</h2><span>未読の本・漫画だけを、続けてランク付けできます。</span></div>
      <button type="button" class="icon-button" data-reading-priority-close aria-label="閉じる">×</button>
    </header>
    <div id="readingPriorityStats" class="reading-priority-stats"></div>
    <div id="readingPriorityOrganizerList" class="reading-priority-organizer-list"></div>
    <footer class="reading-priority-dialog-footer"><button type="button" class="primary-button" data-reading-priority-close>閉じる</button></footer>
  </div>`;
  document.body.append(dialog);
}

function controlMarkup(work) {
  const value = readingPriority(work);
  const label = priorityLabel(value);
  const next = priorityLabel(nextReadingPriority(value));
  return `<button type="button" class="reading-priority-card-control is-${value || "unset"}" data-reading-priority-cycle="${esc(work.id)}" data-reading-priority-value="${esc(value)}" title="クリックで ${esc(next)} へ変更" aria-label="読む優先度 ${esc(label)}。クリックで${esc(next)}へ変更"><span>読む優先度</span><strong>${esc(label)}</strong></button>`;
}

function decorateLibraryCards() {
  document.querySelectorAll("#workList .work-card[data-work-id]").forEach((card) => {
    const work = state.works.get(String(card.dataset.workId));
    const current = $("[data-reading-priority-cycle]", card);
    if (!work || !isReadingPriorityEligible(work)) {
      current?.remove();
      return;
    }
    const value = readingPriority(work);
    if (current?.dataset.readingPriorityValue === value) return;
    const wrap = document.createElement("div");
    wrap.innerHTML = controlMarkup(work);
    const next = wrap.firstElementChild;
    if (current) current.replaceWith(next);
    else {
      const rating = $("[data-card-rating]", card)?.closest(".card-rating") || $(".card-rating", card);
      if (rating) rating.before(next); else card.append(next);
    }
  });
}

function priorityFilterMatches(work) {
  if (!priorityFilter) return true;
  if (!isReadingPriorityEligible(work)) return false;
  const value = readingPriority(work);
  return priorityFilter === "unset" ? !value : value === priorityFilter;
}

function compareWorksByPriority(a, b) {
  return readingPriorityWeight(b) - readingPriorityWeight(a)
    || String(b.updated_at || "").localeCompare(String(a.updated_at || ""))
    || String(a.title || "").localeCompare(String(b.title || ""), "ja");
}

async function expandAllLibraryCards() {
  if (expanding) return;
  expanding = true;
  try {
    for (let i = 0; i < 100; i += 1) {
      const button = $("#workList [data-action='load-more-works']");
      if (!button) break;
      button.click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  } finally {
    expanding = false;
  }
}

function renderPriorityFilterChip() {
  const active = $("#activeFilters");
  if (!active) return;
  $("[data-reading-priority-filter-chip]", active)?.remove();
  if (!priorityFilter) return;
  active.insertAdjacentHTML("beforeend", `<button type="button" class="filter-chip" data-reading-priority-filter-chip>読む優先度：${esc(filterLabel(priorityFilter))} <span aria-hidden="true">×</span></button>`);
}

function applyPriorityDomViewNow() {
  if (applyingOrder || state.view !== "library") return;
  decorateLibraryCards();
  const list = $("#workList");
  if (!list) return;
  const cards = Array.from(list.querySelectorAll(".work-card[data-work-id]"));
  if (!cards.length) { renderPriorityFilterChip(); return; }

  let visible = 0;
  for (const card of cards) {
    const work = state.works.get(String(card.dataset.workId));
    const show = Boolean(work) && priorityFilterMatches(work);
    card.hidden = !show;
    if (show) visible += 1;
  }

  if ($("#sortSelect")?.value === "reading_priority_desc") {
    const ordered = cards.slice().sort((a, b) => {
      const wa = state.works.get(String(a.dataset.workId));
      const wb = state.works.get(String(b.dataset.workId));
      return compareWorksByPriority(wa || {}, wb || {});
    });
    const currentIds = cards.map((card) => card.dataset.workId).join("|");
    const nextIds = ordered.map((card) => card.dataset.workId).join("|");
    if (currentIds !== nextIds) {
      applyingOrder = true;
      ordered.forEach((card) => list.append(card));
      queueMicrotask(() => { applyingOrder = false; });
    }
  }

  if (priorityFilter) {
    const summary = $("#resultSummary");
    if (summary) summary.textContent = `${visible}件を表示（読む優先度：${filterLabel(priorityFilter)}）`;
  }
  renderPriorityFilterChip();
}

async function applyPriorityDomView() {
  const active = Boolean(priorityFilter) || $("#sortSelect")?.value === "reading_priority_desc";
  if (active) await expandAllLibraryCards();
  applyPriorityDomViewNow();
}

function scheduleApply() {
  cancelAnimationFrame(applyFrame);
  applyFrame = requestAnimationFrame(() => { void applyPriorityDomView(); });
}

async function saveReadingPriority(workId, value, retry = true) {
  const work = state.works.get(String(workId));
  if (!work) throw new Error("作品が見つかりません。");
  const nextValue = normalizeReadingPriority(value);
  const metadata = { ...(work.metadata || {}) };
  if (nextValue) metadata.reading_priority = nextValue;
  else delete metadata.reading_priority;
  try {
    const data = await api(`/api/works/${encodeURIComponent(workId)}`, {
      method: "PATCH",
      body: JSON.stringify({ version: Number(work.version), metadata })
    });
    const merged = { ...work, ...(data.work || {}), metadata: data.work?.metadata || metadata };
    upsertWork(merged);
    if (state.selectedId === String(workId) && state.selected && data.work) {
      setSelectedDetail({ ...state.selected, work: data.work });
    }
    return merged;
  } catch (error) {
    if (error.status === 409 && retry) {
      const latest = await api(`/api/works/${encodeURIComponent(workId)}`);
      if (latest?.work) {
        if (state.selectedId === String(workId) && state.selected) setSelectedDetail(latest);
        else upsertWork({ ...work, ...latest.work });
        return saveReadingPriority(workId, nextValue, false);
      }
    }
    throw error;
  }
}

function organizerWorks() {
  return Array.from(state.works.values()).filter(isReadingPriorityEligible).sort(compareWorksByPriority);
}

function organizerRow(work) {
  const current = readingPriority(work);
  const buttons = [
    ...READING_PRIORITY_LEVELS.map((item) => `<button type="button" data-reading-priority-set="${esc(item.value)}" data-work-id="${esc(work.id)}" class="is-${item.value} ${current === item.value ? "is-active" : ""}" aria-pressed="${current === item.value}">${esc(item.label)}</button>`),
    `<button type="button" data-reading-priority-set="" data-work-id="${esc(work.id)}" class="is-unset ${!current ? "is-active" : ""}" aria-pressed="${!current}">未設定</button>`
  ].join("");
  const status = work.status === "owned_unread" ? "所持・未読" : "読みたい";
  return `<article class="reading-priority-organizer-row" data-organizer-work-id="${esc(work.id)}">
    <div class="reading-priority-organizer-copy"><span>${esc(status)}</span><strong>${esc(work.title || "")}</strong><small>${esc(work.creator || "著者・作者未設定")}</small></div>
    <div class="reading-priority-rank-buttons" role="group" aria-label="${esc(work.title || "作品")}の読む優先度">${buttons}</div>
  </article>`;
}

function renderOrganizer() {
  const list = $("#readingPriorityOrganizerList");
  const stats = $("#readingPriorityStats");
  if (!list || !stats) return;
  const works = organizerWorks();
  const counts = new Map(READING_PRIORITY_LEVELS.map((item) => [item.value, 0]));
  let unset = 0;
  works.forEach((work) => {
    const value = readingPriority(work);
    if (value) counts.set(value, (counts.get(value) || 0) + 1); else unset += 1;
  });
  stats.innerHTML = `<span><strong>${works.length}</strong>未読</span>${READING_PRIORITY_LEVELS.map((item) => `<span class="is-${item.value}">${esc(item.label)} <strong>${counts.get(item.value) || 0}</strong></span>`).join("")}<span>未設定 <strong>${unset}</strong></span>`;
  list.innerHTML = works.length ? works.map(organizerRow).join("") : '<div class="empty-state">優先度を付けられる未読の本・漫画はありません。</div>';
}

function openOrganizer() {
  ensureOrganizerDialog();
  renderOrganizer();
  $("#readingPriorityDialog").showModal();
}

function syncControls() {
  ensureFilterControl();
  ensureSortOption();
  ensureOrganizerButton();
  const select = $("#filterReadingPriority");
  if (select && select.value !== priorityFilter) select.value = priorityFilter;
}

export function initReadingPriority() {
  if (initialized) return;
  initialized = true;
  ensureStyle();
  ensureFilterControl();
  ensureSortOption();
  ensureOrganizerButton();
  ensureOrganizerDialog();

  const workList = $("#workList");
  if (workList) {
    observer = new MutationObserver(scheduleApply);
    observer.observe(workList, { childList: true, subtree: true });
  }

  subscribe(() => {
    syncControls();
    if ($("#readingPriorityDialog")?.open) renderOrganizer();
    scheduleApply();
  });

  document.addEventListener("change", (event) => {
    if (event.target?.id === "filterReadingPriority") {
      priorityFilter = event.target.value;
      setFilters({});
      scheduleApply();
    }
    if (event.target?.id === "sortSelect") scheduleApply();
  });

  document.addEventListener("click", async (event) => {
    if (event.target.closest("[data-reading-priority-organize]")) { openOrganizer(); return; }
    if (event.target.closest("[data-reading-priority-close]")) { $("#readingPriorityDialog")?.close(); return; }
    if (event.target.closest("[data-reading-priority-filter-chip]")) {
      priorityFilter = "";
      const select = $("#filterReadingPriority");
      if (select) select.value = "";
      setFilters({});
      scheduleApply();
      return;
    }
    if (event.target.closest("[data-action='clear-filters']")) {
      setTimeout(() => {
        priorityFilter = "";
        const select = $("#filterReadingPriority");
        if (select) select.value = "";
        scheduleApply();
      }, 0);
      return;
    }

    const cycleButton = event.target.closest("[data-reading-priority-cycle]");
    if (cycleButton) {
      event.preventDefault();
      event.stopPropagation();
      const id = cycleButton.dataset.readingPriorityCycle;
      const work = state.works.get(String(id));
      if (!work) return;
      const next = nextReadingPriority(readingPriority(work));
      cycleButton.disabled = true;
      try {
        await saveReadingPriority(id, next);
        toast(next ? `読む優先度を「${priorityLabel(next)}」にしました。` : "読む優先度を未設定にしました。");
      } catch (error) {
        cycleButton.disabled = false;
        toast(error.message, "error");
      }
      return;
    }

    const rankButton = event.target.closest("[data-reading-priority-set][data-work-id]");
    if (rankButton) {
      const id = rankButton.dataset.workId;
      const value = rankButton.dataset.readingPrioritySet;
      rankButton.disabled = true;
      try {
        await saveReadingPriority(id, value);
      } catch (error) {
        rankButton.disabled = false;
        toast(error.message, "error");
      }
    }
  });

  scheduleApply();
}
