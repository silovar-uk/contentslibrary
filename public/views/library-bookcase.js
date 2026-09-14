import { $, esc } from "../core/dom.js";
import { state, filteredWorks, subscribe } from "../core/store.js";
import { bindingFor, labelFromTitle } from "../core/work-face.js";
import { renderWorkList } from "./library.js";

const STORAGE_KEY = "sakuhin-log-library-view-v1";
const STATUS_ORDER = ["active", "want", "owned_unread", "paused", "dropped", "completed"];
const STATUS_TITLES = {
  active: "読書中・視聴中",
  want: "読みたい・見たい",
  owned_unread: "積読・未読",
  paused: "一時停止",
  dropped: "中断",
  completed: "完了"
};
const CHUNK_SIZE = 200;
const CHUNK_THRESHOLD_MS = 150;

let initialized = false;
let mode = "list";
let chunked = false;
const expandedStatuses = new Set();
let rendering = false;

function readMode() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "bookcase" ? "bookcase" : "list";
  } catch {
    return "list";
  }
}

function writeMode(next) {
  try { localStorage.setItem(STORAGE_KEY, next); } catch {}
}

export function spineWidth(work) {
  const cleanTitle = labelFromTitle(work?.title || "").title;
  const length = Array.from(cleanTitle).length;
  return Math.max(22, Math.min(34, 22 + Math.ceil(length / 4) * 2));
}

export function bookcaseShelfGroups(works = []) {
  const byStatus = new Map(STATUS_ORDER.map((status) => [status, []]));
  for (const work of works) {
    if (byStatus.has(work?.status)) byStatus.get(work.status).push(work);
  }
  return STATUS_ORDER
    .map((status) => ({ status, title: STATUS_TITLES[status], works: byStatus.get(status) }))
    .filter((shelf) => shelf.works.length > 0);
}

function ensureStyle() {
  if ($('link[href="/styles/bookcase.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/styles/bookcase.css";
  document.head.append(link);
}

function ensureToggle() {
  const tools = $(".list-tools");
  if (!tools || $("[data-library-view-switch]", tools)) return;
  const group = document.createElement("div");
  group.className = "library-view-switch";
  group.dataset.libraryViewSwitch = "";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "一覧の表示方法");
  group.innerHTML = `<button type="button" data-library-view="list">一覧</button><button type="button" data-library-view="bookcase">書架</button>`;
  tools.prepend(group);
}

function syncToggle() {
  const group = $("[data-library-view-switch]");
  if (!group) return;
  for (const button of group.querySelectorAll("[data-library-view]")) {
    const active = button.dataset.libraryView === mode;
    button.setAttribute("aria-pressed", String(active));
    button.classList.toggle("is-active", active);
  }
  const selection = $("#selectionExportToggle");
  if (selection) selection.disabled = mode === "bookcase";
}

function endSelectionModeBeforeBookcase() {
  const toggle = $("#selectionExportToggle");
  if (toggle?.getAttribute("aria-pressed") === "true") toggle.click();
}

function spineTypeClass(type) {
  if (type === "book") return "spine--book";
  if (type === "manga") return "spine--manga";
  return "spine--media";
}

function spineMarkup(work) {
  const parsed = labelFromTitle(work.title);
  const binding = bindingFor(work);
  const label = parsed.label;
  const author = String(work.creator || "").trim();
  const aria = `${work.title}${author ? ` / ${author}` : ""}`;
  return `<button type="button" class="spine ${spineTypeClass(work.type)} ${label ? "has-band" : ""}" data-open-work="${esc(work.id)}" data-tone="${binding.tone}" aria-label="${esc(aria)}" style="--spine-w:${spineWidth(work)}px">
    <span class="spine-title">${esc(parsed.title || work.title)}</span>
    ${label ? `<span class="spine-band" aria-hidden="true">${esc(label)}</span>` : ""}
  </button>`;
}

function shelfMarkup(shelf) {
  const expanded = expandedStatuses.has(shelf.status);
  const visible = chunked && !expanded ? shelf.works.slice(0, CHUNK_SIZE) : shelf.works;
  const remaining = shelf.works.length - visible.length;
  return `<section class="bookcase-shelf" data-bookcase-status="${shelf.status}">
    <header class="bookcase-shelf-header">
      <div><h3>${esc(shelf.title)}</h3><span>${shelf.works.length}作品</span></div>
      <button type="button" class="text-button" data-bookcase-pick="${shelf.status}">この棚から1冊引く</button>
    </header>
    <div class="bookcase-row" role="list" aria-label="${esc(shelf.title)}">${visible.map(spineMarkup).join("")}</div>
    ${remaining > 0 ? `<button type="button" class="bookcase-more" data-bookcase-more="${shelf.status}">続きを並べる（残り${remaining}作品）</button>` : ""}
  </section>`;
}

function renderShelves(list, shelves) {
  list.classList.add("is-bookcase");
  list.innerHTML = shelves.length
    ? `<div class="bookcase" aria-label="作品の書架">${shelves.map(shelfMarkup).join("")}</div>`
    : '<div class="empty-state">条件に合う作品がありません。<br>検索条件を減らすか、新しい作品を追加してください。</div>';
}

export function renderBookcase() {
  if (rendering || mode !== "bookcase" || state.view !== "library" || !state.loaded) return;
  const list = $("#workList");
  if (!list) return;
  rendering = true;
  const shelves = bookcaseShelfGroups(filteredWorks());
  const started = performance.now();
  renderShelves(list, shelves);
  const elapsed = performance.now() - started;
  list.dataset.bookcaseRenderMs = elapsed.toFixed(1);

  if (!chunked && elapsed > CHUNK_THRESHOLD_MS && shelves.some((shelf) => shelf.works.length > CHUNK_SIZE)) {
    chunked = true;
    renderShelves(list, shelves);
    list.dataset.bookcaseChunked = "true";
  } else {
    list.dataset.bookcaseChunked = String(chunked);
  }
  const summary = $("#resultSummary");
  if (summary) summary.textContent = `${shelves.reduce((sum, shelf) => sum + shelf.works.length, 0)}件を書架で表示`;
  rendering = false;
}

function setMode(next) {
  const normalized = next === "bookcase" ? "bookcase" : "list";
  if (mode === normalized) return;
  if (normalized === "bookcase") endSelectionModeBeforeBookcase();
  mode = normalized;
  writeMode(mode);
  syncToggle();
  const list = $("#workList");
  list?.classList.toggle("is-bookcase", mode === "bookcase");
  if (mode === "bookcase") renderBookcase();
  else {
    if (list) {
      list.classList.remove("is-bookcase");
      delete list.dataset.bookcaseRenderMs;
      delete list.dataset.bookcaseChunked;
    }
    renderWorkList();
  }
}

function pickFromShelf(status, trigger) {
  const shelf = bookcaseShelfGroups(filteredWorks()).find((item) => item.status === status);
  if (!shelf?.works.length) return;
  const picked = shelf.works[Math.floor(Math.random() * shelf.works.length)];
  const spine = $(`.spine[data-open-work="${CSS.escape(String(picked.id))}"]`, trigger.closest(".bookcase-shelf"));
  if (!spine) return;
  spine.classList.add("is-picked");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) spine.click();
  else setTimeout(() => { if (spine.isConnected) spine.click(); }, 600);
}

export function initLibraryBookcase() {
  if (initialized) return;
  initialized = true;
  ensureStyle();
  ensureToggle();
  mode = readMode();
  if (mode === "bookcase") endSelectionModeBeforeBookcase();
  syncToggle();

  subscribe(() => {
    if (mode === "bookcase") renderBookcase();
  });

  document.addEventListener("click", (event) => {
    const view = event.target.closest("[data-library-view]")?.dataset.libraryView;
    if (view) { setMode(view); return; }
    const more = event.target.closest("[data-bookcase-more]")?.dataset.bookcaseMore;
    if (more) { expandedStatuses.add(more); renderBookcase(); return; }
    const pick = event.target.closest("[data-bookcase-pick]");
    if (pick) { pickFromShelf(pick.dataset.bookcasePick, pick); }
  });

  requestAnimationFrame(() => {
    syncToggle();
    if (mode === "bookcase") renderBookcase();
  });
}
