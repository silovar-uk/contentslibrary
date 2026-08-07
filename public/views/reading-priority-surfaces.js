import { $, esc } from "../core/dom.js";
import { state, subscribe, setView } from "../core/store.js";
import { READING_PRIORITY_LEVELS, isReadingPriorityEligible, readingPriority } from "./reading-priority.js";

let initialized = false;
let applyFrame = 0;
let observer = null;

const LEVEL_BY_VALUE = new Map(READING_PRIORITY_LEVELS.map((item) => [item.value, item]));

function ensureStyle() {
  if ($('link[href="/styles/reading-priority-surfaces.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/styles/reading-priority-surfaces.css";
  document.head.append(link);
}

export function prioritySummaryCounts(works = []) {
  const counts = { top: 0, high: 0, medium: 0, low: 0, unset: 0, total: 0 };
  for (const work of works) {
    if (!isReadingPriorityEligible(work)) continue;
    counts.total += 1;
    const value = readingPriority(work);
    if (value && Object.hasOwn(counts, value)) counts[value] += 1;
    else counts.unset += 1;
  }
  return counts;
}

function surfaceMarkup(work, context) {
  const value = readingPriority(work);
  const current = LEVEL_BY_VALUE.get(value);
  const label = current?.label || "優先度";
  const title = current ? `読む優先度：${current.label}` : "読む優先度を設定";
  const choices = READING_PRIORITY_LEVELS.map((item) => `
    <button type="button"
      class="reading-priority-choice is-${esc(item.value)} ${value === item.value ? "is-active" : ""}"
      data-reading-priority-set="${esc(item.value)}"
      data-work-id="${esc(work.id)}"
      aria-pressed="${value === item.value}">${esc(item.label)}</button>`).join("");
  return `<details class="reading-priority-surface reading-priority-surface-${esc(context)} is-${esc(value || "unset")}" data-reading-priority-surface="${esc(work.id)}" data-priority-value="${esc(value)}">
    <summary title="${esc(title)}" aria-label="${esc(title)}"><span>${esc(label)}</span><i aria-hidden="true">⌄</i></summary>
    <div class="reading-priority-surface-menu" role="group" aria-label="読む優先度を変更">
      ${choices}
      <button type="button" class="reading-priority-choice is-clear" data-reading-priority-set="" data-work-id="${esc(work.id)}" ${value ? "" : "disabled"}>解除</button>
    </div>
  </details>`;
}

function syncSurface(host, work, context, insert) {
  const current = host.querySelector(`:scope > [data-reading-priority-surface="${CSS.escape(String(work?.id || ""))}"]`);
  if (!work || !isReadingPriorityEligible(work)) {
    current?.remove();
    return;
  }
  const value = readingPriority(work);
  if (current?.dataset.priorityValue === value) return;
  const wrap = document.createElement("div");
  wrap.innerHTML = surfaceMarkup(work, context).trim();
  const next = wrap.firstElementChild;
  if (current) current.replaceWith(next);
  else insert(next);
}

function decorateLibraryCards() {
  document.querySelectorAll("#workList .work-card[data-work-id]").forEach((card) => {
    const work = state.works.get(String(card.dataset.workId));
    syncSurface(card, work, "library", (surface) => {
      const legacy = card.querySelector(":scope > .reading-priority-card-control");
      const rating = card.querySelector(":scope > .card-rating");
      if (legacy) legacy.before(surface);
      else if (rating) rating.before(surface);
      else card.append(surface);
    });
  });
}

function decorateRandomCards() {
  document.querySelectorAll("#randomStage .random-pick-card").forEach((card) => {
    const id = card.querySelector("[data-open-work]")?.dataset.openWork;
    const work = id ? state.works.get(String(id)) : null;
    syncSurface(card, work, "random", (surface) => {
      const main = card.querySelector(":scope > .random-pick-main");
      if (main) main.after(surface); else card.prepend(surface);
    });
  });
}

function decorateDetail() {
  const panel = $("#detailPanel");
  if (!panel) return;
  const preference = panel.querySelector(".preference-panel");
  const work = state.selected?.work;
  const old = panel.querySelector("[data-reading-priority-detail-wrap]");
  if (!preference || !work || !isReadingPriorityEligible(work)) {
    old?.remove();
    return;
  }
  const value = readingPriority(work);
  if (old?.dataset.priorityValue === value) return;
  const wrap = document.createElement("div");
  wrap.className = "reading-priority-detail-wrap";
  wrap.dataset.readingPriorityDetailWrap = "";
  wrap.dataset.priorityValue = value;
  wrap.innerHTML = `<span class="reading-priority-detail-label">読む優先度</span>${surfaceMarkup(work, "detail")}`;
  if (old) old.replaceWith(wrap); else preference.append(wrap);
}

function homeSummaryMarkup(counts, loaded) {
  const items = [
    ["top", "最優先"],
    ["high", "高"],
    ["medium", "中"],
    ["low", "低"],
    ["unset", "未設定"]
  ];
  return items.map(([value, label]) => `<button type="button" class="reading-priority-home-stat is-${value}" data-reading-priority-home-filter="${value}" ${loaded && counts.total === 0 ? "disabled" : ""}><span>${label}</span><strong>${loaded ? counts[value] : "…"}</strong></button>`).join("");
}

function ensureHomeHub() {
  const controls = document.querySelector("#homeView .random-controls");
  if (!controls) return;
  let hub = $("#readingPriorityHomeHub");
  if (!hub) {
    hub = document.createElement("section");
    hub.id = "readingPriorityHomeHub";
    hub.className = "reading-priority-home-hub";
    hub.setAttribute("aria-label", "読む優先度");
    hub.innerHTML = `<div class="reading-priority-home-head">
      <div><span>READING PRIORITY</span><strong>読む順番</strong></div>
      <button type="button" class="ghost-button reading-priority-home-organize" data-reading-priority-organize>読む順番を整理</button>
    </div><div class="reading-priority-home-stats" aria-live="polite"></div>`;
    controls.after(hub);
  }
  const counts = prioritySummaryCounts(Array.from(state.works.values()));
  const stats = hub.querySelector(".reading-priority-home-stats");
  const next = homeSummaryMarkup(counts, state.loaded);
  if (stats.innerHTML !== next) stats.innerHTML = next;
}

function emphasizeOrganizerEntry() {
  const button = document.querySelector(".list-tools [data-reading-priority-organize]");
  if (!button) return;
  button.textContent = "読む順番を整理";
  button.classList.add("reading-priority-organize-prominent");
}

function applySurfaces() {
  decorateLibraryCards();
  decorateRandomCards();
  decorateDetail();
  ensureHomeHub();
  emphasizeOrganizerEntry();
}

function scheduleApply() {
  cancelAnimationFrame(applyFrame);
  applyFrame = requestAnimationFrame(applySurfaces);
}

function goToPriorityFilter(value) {
  setView("library");
  requestAnimationFrame(() => {
    const select = $("#filterReadingPriority");
    if (!select) return;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    $("#libraryTitle")?.scrollIntoView({ block: "start", behavior: "smooth" });
  });
}

export function initReadingPrioritySurfaces() {
  if (initialized) return;
  initialized = true;
  ensureStyle();

  observer = new MutationObserver(scheduleApply);
  [$("#workList"), $("#randomStage"), $("#detailPanel")].filter(Boolean).forEach((node) => observer.observe(node, { childList: true, subtree: true }));
  subscribe(scheduleApply);

  document.addEventListener("click", (event) => {
    const filter = event.target.closest("[data-reading-priority-home-filter]");
    if (filter) {
      event.preventDefault();
      goToPriorityFilter(filter.dataset.readingPriorityHomeFilter);
      return;
    }
    const choice = event.target.closest(".reading-priority-surface [data-reading-priority-set]");
    if (choice) choice.closest("details")?.removeAttribute("open");
  });

  scheduleApply();
}
