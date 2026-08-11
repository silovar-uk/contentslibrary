import { $, esc, toast, setBusy } from "../core/dom.js";
import { api } from "../core/api.js";
import { mediaConfig, statusLabel } from "../core/format.js";
import { state, subscribe, setSelectedDetail } from "../core/store.js";

let initialized = false;
let frame = 0;
let observer = null;

function isMobile() { return matchMedia("(max-width:767px)").matches; }

function ensureStyle() {
  if ($('link[href="/styles/light-edit-surfaces.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/styles/light-edit-surfaces.css";
  document.head.append(link);
}

function ensureSheet() {
  let dialog = $("#lightEditSheet");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "lightEditSheet";
  dialog.className = "light-edit-sheet";
  dialog.innerHTML = `<div class="light-edit-sheet-card">
    <div class="light-edit-sheet-handle" aria-hidden="true"></div>
    <header><div><span id="lightEditSheetEyebrow">QUICK EDIT</span><h2 id="lightEditSheetTitle">変更</h2></div><button type="button" class="icon-button" data-light-sheet-close aria-label="閉じる">×</button></header>
    <div id="lightEditSheetBody" class="light-edit-sheet-body"></div>
  </div>`;
  document.body.append(dialog);
  return dialog;
}

export function lightSheetChoiceMarkup(items = []) {
  return items.map((item) => `<button type="button" class="light-edit-sheet-choice ${item.active ? "is-active" : ""}" data-light-sheet-value="${esc(item.value)}"><span>${esc(item.label)}</span>${item.active ? '<strong>✓</strong>' : '<i aria-hidden="true">›</i>'}</button>`).join("");
}

function openSheet({ title, eyebrow = "QUICK EDIT", items, onChoose }) {
  const dialog = ensureSheet();
  $("#lightEditSheetEyebrow").textContent = eyebrow;
  $("#lightEditSheetTitle").textContent = title;
  const body = $("#lightEditSheetBody");
  body.innerHTML = lightSheetChoiceMarkup(items);
  body.onclick = (event) => {
    const button = event.target.closest("[data-light-sheet-value]");
    if (!button) return;
    onChoose?.(button.dataset.lightSheetValue, button);
  };
  if (!dialog.open) dialog.showModal();
}

function closeSheet() {
  const dialog = $("#lightEditSheet");
  if (dialog?.open) dialog.close();
}

function priorityItems(surface) {
  return [...surface.querySelectorAll("[data-reading-priority-set]")].map((button) => ({
    value: button.dataset.readingPrioritySet,
    label: button.textContent.trim(),
    active: button.classList.contains("is-active")
  }));
}

function openPrioritySheet(surface) {
  const items = priorityItems(surface);
  openSheet({
    title: "読む優先度",
    eyebrow: "READING PRIORITY",
    items,
    onChoose: (value) => {
      const source = [...surface.querySelectorAll("[data-reading-priority-set]")].find((button) => button.dataset.readingPrioritySet === value);
      source?.click();
      closeSheet();
    }
  });
}

function statusSurfaceMarkup(work) {
  const statuses = mediaConfig(work.type).statuses || {};
  const choices = Object.entries(statuses).map(([value, label]) => `<button type="button" class="light-edit-popover-choice ${work.status === value ? "is-active" : ""}" data-light-status-set="${esc(value)}" data-work-id="${esc(work.id)}"><span>${esc(label)}</span>${work.status === value ? "<strong>✓</strong>" : ""}</button>`).join("");
  return `<details class="light-edit-popover light-edit-status" data-light-status-surface data-work-id="${esc(work.id)}" data-status="${esc(work.status)}">
    <summary><span>${esc(statusLabel(work.type, work.status))}</span><i aria-hidden="true">⌄</i></summary>
    <div class="light-edit-popover-menu" role="group" aria-label="状態を変更">${choices}</div>
  </details>`;
}

function decorateStatus() {
  const panel = $("#detailPanel");
  const preference = panel?.querySelector(".preference-panel");
  const work = state.selected?.work;
  if (!panel || !preference || !work) return;
  const old = preference.querySelector("[data-light-status-wrap]");
  if (old?.dataset.status === work.status && old.dataset.workId === String(work.id)) return;
  const wrap = document.createElement("div");
  wrap.className = "light-edit-status-wrap";
  wrap.dataset.lightStatusWrap = "";
  wrap.dataset.workId = String(work.id);
  wrap.dataset.status = work.status;
  wrap.innerHTML = `<span class="light-edit-property-label">状態</span>${statusSurfaceMarkup(work)}`;
  if (old) old.replaceWith(wrap); else preference.prepend(wrap);
}

async function updateStatus(button) {
  const work = state.selected?.work;
  const next = button.dataset.lightStatusSet;
  if (!work || !next || next === work.status) {
    closeSheet();
    button.closest("details")?.removeAttribute("open");
    return;
  }
  setBusy(button, true, "変更中…");
  try {
    const data = await api(`/api/works/${encodeURIComponent(work.id)}`, { method: "PATCH", body: JSON.stringify({ version: Number(work.version), status: next }) });
    setSelectedDetail(data);
    toast(`状態を「${statusLabel(data.work.type, data.work.status)}」に変更しました。`);
    closeSheet();
  } catch (error) {
    toast(error.message, "error");
  } finally {
    setBusy(button, false);
  }
}

function openStatusSheet(surface) {
  const work = state.selected?.work;
  if (!work) return;
  const items = Object.entries(mediaConfig(work.type).statuses || {}).map(([value, label]) => ({ value, label, active: value === work.status }));
  openSheet({
    title: "状態",
    eyebrow: "STATUS",
    items,
    onChoose: (value, sheetButton) => {
      const source = surface.querySelector(`[data-light-status-set="${CSS.escape(value)}"]`);
      if (source) void updateStatus(source);
      else setBusy(sheetButton, false);
    }
  });
}

function ensureMobileSortButton() {
  const tools = $(".list-tools");
  const select = $("#sortSelect");
  if (!tools || !select) return;
  let button = $("#mobileSortSheetButton");
  if (!button) {
    button = document.createElement("button");
    button.id = "mobileSortSheetButton";
    button.type = "button";
    button.className = "ghost-button mobile-sort-sheet-button";
    button.dataset.lightSortOpen = "";
    select.after(button);
  }
  button.textContent = `並び替え：${select.selectedOptions[0]?.textContent || "更新順"}`;
}

function openSortSheet() {
  const select = $("#sortSelect");
  if (!select) return;
  const items = [...select.options].map((option) => ({ value: option.value, label: option.textContent, active: option.selected }));
  openSheet({
    title: "並び替え",
    eyebrow: "SORT",
    items,
    onChoose: (value) => {
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      ensureMobileSortButton();
      closeSheet();
    }
  });
}

function ensureFilterBackdrop() {
  let backdrop = $("#filterSheetBackdrop");
  if (backdrop) return backdrop;
  backdrop = document.createElement("button");
  backdrop.id = "filterSheetBackdrop";
  backdrop.type = "button";
  backdrop.className = "filter-sheet-backdrop";
  backdrop.setAttribute("aria-label", "絞り込みを閉じる");
  document.body.append(backdrop);
  return backdrop;
}

function ensureFilterSheetChrome() {
  const panel = $(".filter-panel");
  if (!panel) return;
  panel.classList.add("light-filter-sheet");
  if (!panel.querySelector(".light-filter-sheet-handle")) {
    const handle = document.createElement("div");
    handle.className = "light-filter-sheet-handle";
    handle.setAttribute("aria-hidden", "true");
    panel.prepend(handle);
  }
  const heading = panel.querySelector(".panel-heading");
  if (heading && !heading.querySelector("[data-filter-sheet-close]")) {
    const close = document.createElement("button");
    close.type = "button";
    close.className = "icon-button filter-sheet-close";
    close.dataset.filterSheetClose = "";
    close.setAttribute("aria-label", "絞り込みを閉じる");
    close.textContent = "×";
    heading.append(close);
  }
  ensureFilterBackdrop();
}

function setFilterSheetOpen(open) {
  const panel = $(".filter-panel");
  if (!panel) return;
  panel.classList.toggle("is-open", open);
  document.body.classList.toggle("filter-sheet-open", open && isMobile());
}

function apply() {
  decorateStatus();
  ensureMobileSortButton();
  ensureFilterSheetChrome();
}

function scheduleApply() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(apply);
}

export function initLightEditSurfaces() {
  if (initialized) return;
  initialized = true;
  ensureStyle();
  ensureSheet();
  ensureFilterSheetChrome();

  observer = new MutationObserver(scheduleApply);
  [$("#detailPanel"), $("#workList"), $("#randomStage")].filter(Boolean).forEach((node) => observer.observe(node, { childList: true, subtree: true }));
  subscribe(scheduleApply);

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-light-sheet-close]")) { closeSheet(); return; }
    if (event.target.closest("#filterSheetBackdrop,[data-filter-sheet-close]")) { setFilterSheetOpen(false); return; }
    if (event.target.closest("[data-light-sort-open]")) { event.preventDefault(); openSortSheet(); return; }

    const statusChoice = event.target.closest("[data-light-status-set]");
    if (statusChoice) { event.preventDefault(); void updateStatus(statusChoice); return; }

    if (!isMobile()) return;

    const prioritySummary = event.target.closest(".reading-priority-surface > summary");
    if (prioritySummary) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const surface = prioritySummary.closest(".reading-priority-surface");
      surface?.removeAttribute("open");
      if (surface) openPrioritySheet(surface);
      return;
    }

    const statusSummary = event.target.closest(".light-edit-status > summary");
    if (statusSummary) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const surface = statusSummary.closest(".light-edit-status");
      surface?.removeAttribute("open");
      if (surface) openStatusSheet(surface);
      return;
    }

    if (event.target.closest("[data-action='toggle-filters']")) {
      requestAnimationFrame(() => setFilterSheetOpen($(".filter-panel")?.classList.contains("is-open")));
    }
  }, true);

  $("#lightEditSheet")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeSheet();
  });
  $("#lightEditSheet")?.addEventListener("cancel", () => closeSheet());
  $("#sortSelect")?.addEventListener("change", ensureMobileSortButton);

  scheduleApply();
}
