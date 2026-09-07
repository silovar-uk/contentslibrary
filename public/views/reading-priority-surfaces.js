import { $, esc } from "../core/dom.js";
import { state, subscribe } from "../core/store.js";
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

export function readingPrioritySurfaceMarkup(work, context = "library") {
  if (!isReadingPriorityEligible(work)) return "";
  const value = readingPriority(work);
  const current = LEVEL_BY_VALUE.get(value);
  const label = current?.label || (context === "choose" ? "優先度を決める" : "優先度");
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
  wrap.innerHTML = readingPrioritySurfaceMarkup(work, context).trim();
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
  wrap.innerHTML = `<span class="reading-priority-detail-label">読む優先度</span>${readingPrioritySurfaceMarkup(work, "detail")}`;
  if (old) old.replaceWith(wrap); else preference.append(wrap);
}

function emphasizeOrganizerEntry() {
  const button = document.querySelector(".list-tools [data-reading-priority-organize]");
  if (!button) return;
  button.textContent = "読む順番を整理";
  button.classList.add("reading-priority-organize-prominent");
}

function applySurfaces() {
  decorateLibraryCards();
  decorateDetail();
  emphasizeOrganizerEntry();
}

function scheduleApply() {
  cancelAnimationFrame(applyFrame);
  applyFrame = requestAnimationFrame(applySurfaces);
}

export function initReadingPrioritySurfaces() {
  if (initialized) return;
  initialized = true;
  ensureStyle();

  observer = new MutationObserver(scheduleApply);
  [$("#workList"), $("#detailPanel")].filter(Boolean).forEach((node) => observer.observe(node, { childList: true, subtree: true }));
  subscribe(scheduleApply);

  document.addEventListener("click", (event) => {
    const choice = event.target.closest(".reading-priority-surface [data-reading-priority-set]");
    if (choice) choice.closest("details")?.removeAttribute("open");
  });

  scheduleApply();
}
