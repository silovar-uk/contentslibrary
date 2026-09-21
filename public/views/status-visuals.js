import { $, esc } from "../core/dom.js";
import { STATUS_LABELS, statusLabel } from "../core/format.js";
import { openChoiceSheet, closeChoiceSheet } from "./light-edit-surfaces.js";

export const STATUS_VISUALS = Object.freeze({
  want: { symbol: "○", group: "flow" },
  owned_unread: { symbol: "○", group: "flow" },
  active: { symbol: "▶", group: "flow" },
  completed: { symbol: "✓", group: "flow" },
  paused: { symbol: "Ⅱ", group: "stop" },
  dropped: { symbol: "■", group: "stop" }
});

const STATUS_SELECTORS = [
  "#workForm select[name='status']",
  "#filterStatus"
];

let initialized = false;
let openDesktopShell = null;

function ensureStyle() {
  if ($('link[href="/styles/status-visuals.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/styles/status-visuals.css";
  document.head.append(link);
}

export function statusSymbol(status) {
  return STATUS_VISUALS[status]?.symbol || "•";
}

export function statusChipMarkup(type, status) {
  const label = statusLabel(type, status);
  return `<span class="status-chip" data-status="${esc(status)}"><span class="status-symbol" aria-hidden="true">${esc(statusSymbol(status))}</span><span>${esc(label)}</span></span>`;
}

function selectStatusLabel(select, value) {
  const option = [...select.options].find((item) => item.value === value);
  return option?.textContent?.trim() || STATUS_LABELS[value] || value || "すべて";
}

function pickerItemMarkup(value, label, active) {
  if (!value) {
    return `<button type="button" class="status-picker-option is-neutral ${active ? "is-active" : ""}" data-status-picker-value=""><span class="status-option-main"><span class="status-symbol" aria-hidden="true">◇</span><span>${esc(label)}</span></span>${active ? '<strong aria-hidden="true">✓</strong>' : '<i aria-hidden="true">›</i>'}</button>`;
  }
  return `<button type="button" class="status-picker-option ${active ? "is-active" : ""}" data-status-picker-value="${esc(value)}" data-status="${esc(value)}"><span class="status-option-main"><span class="status-symbol" aria-hidden="true">${esc(statusSymbol(value))}</span><span>${esc(label)}</span></span>${active ? '<strong aria-hidden="true">✓</strong>' : '<i aria-hidden="true">›</i>'}</button>`;
}

function desktopMenuMarkup(select) {
  const current = select.value;
  const options = [...select.options].map((option) => ({
    value: option.value,
    label: option.textContent?.trim() || option.value
  }));
  const neutral = options.find((item) => !item.value);
  const flow = options.filter((item) => STATUS_VISUALS[item.value]?.group === "flow");
  const stop = options.filter((item) => STATUS_VISUALS[item.value]?.group === "stop");
  const rows = [];
  if (neutral) rows.push(pickerItemMarkup(neutral.value, neutral.label, current === neutral.value));
  if (flow.length) {
    rows.push('<div class="status-picker-group-label">通常の流れ</div>');
    rows.push(...flow.map((item) => pickerItemMarkup(item.value, item.label, current === item.value)));
  }
  if (stop.length) {
    rows.push('<div class="status-picker-group-label">止める</div>');
    rows.push(...stop.map((item) => pickerItemMarkup(item.value, item.label, current === item.value)));
  }
  return rows.join("");
}

function sheetItems(select) {
  const options = [...select.options].map((option) => ({
    value: option.value,
    label: option.textContent?.trim() || option.value
  }));
  const current = select.value;
  const items = [];
  const neutral = options.find((item) => !item.value);
  if (neutral) items.push({ value: "", label: neutral.label, active: current === "", status: "" });
  const flow = options.filter((item) => STATUS_VISUALS[item.value]?.group === "flow");
  const stop = options.filter((item) => STATUS_VISUALS[item.value]?.group === "stop");
  if (flow.length) {
    items.push({ heading: "通常の流れ" });
    flow.forEach((item) => items.push({ ...item, active: current === item.value, status: item.value, symbol: statusSymbol(item.value) }));
  }
  if (stop.length) {
    items.push({ heading: "止める" });
    stop.forEach((item) => items.push({ ...item, active: current === item.value, status: item.value, symbol: statusSymbol(item.value) }));
  }
  return items;
}

function applySelection(select, value) {
  if (select.value === value) return;
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function closeDesktopPicker({ restoreFocus = true } = {}) {
  const shell = openDesktopShell;
  if (!shell) return;
  const trigger = shell.querySelector("[data-status-picker-trigger]");
  shell.classList.remove("is-open");
  trigger?.setAttribute("aria-expanded", "false");
  openDesktopShell = null;
  if (restoreFocus) trigger?.focus();
}

function openDesktopPicker(shell) {
  if (openDesktopShell && openDesktopShell !== shell) closeDesktopPicker({ restoreFocus: false });
  const select = shell.querySelector("select");
  const menu = shell.querySelector(".status-picker-popover");
  const trigger = shell.querySelector("[data-status-picker-trigger]");
  if (!select || !menu || !trigger) return;
  menu.innerHTML = desktopMenuMarkup(select);
  shell.classList.add("is-open");
  trigger.setAttribute("aria-expanded", "true");
  openDesktopShell = shell;
  requestAnimationFrame(() => menu.querySelector(".status-picker-option.is-active, .status-picker-option")?.focus());
}

function openMobilePicker(select) {
  openChoiceSheet({
    title: "状態",
    eyebrow: "STATUS",
    items: sheetItems(select),
    onChoose: (value) => {
      applySelection(select, value);
      refreshStatusPicker(select);
      closeChoiceSheet();
    }
  });
}

function syncTrigger(select) {
  const shell = select.closest(".status-select-shell");
  const trigger = shell?.querySelector("[data-status-picker-trigger]");
  if (!trigger) return;
  const value = select.value;
  const label = selectStatusLabel(select, value);
  const symbol = value ? statusSymbol(value) : "◇";
  trigger.dataset.status = value;
  trigger.classList.toggle("is-neutral", !value);
  trigger.innerHTML = `<span class="status-option-main"><span class="status-symbol" aria-hidden="true">${esc(symbol)}</span><span>${esc(label)}</span></span><i aria-hidden="true">⌄</i>`;
  trigger.setAttribute("aria-label", `状態：${label}。変更する`);
  const menu = shell.querySelector(".status-picker-popover");
  if (menu && shell.classList.contains("is-open")) menu.innerHTML = desktopMenuMarkup(select);
}

export function refreshStatusPicker(select) {
  if (!select) return;
  syncTrigger(select);
}

export function enhanceStatusSelect(select) {
  if (!select || select.dataset.statusEnhanced === "true") {
    if (select) refreshStatusPicker(select);
    return;
  }

  const shell = document.createElement("div");
  shell.className = "status-select-shell";
  select.before(shell);
  shell.append(select);

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "status-picker-trigger";
  trigger.dataset.statusPickerTrigger = "";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");

  const menu = document.createElement("div");
  menu.className = "status-picker-popover";
  menu.setAttribute("role", "listbox");
  menu.setAttribute("aria-label", "状態");

  shell.append(trigger, menu);
  select.dataset.statusEnhanced = "true";
  select.classList.add("status-native-select", "is-enhanced");
  select.setAttribute("aria-hidden", "true");
  select.tabIndex = -1;
  syncTrigger(select);

  trigger.addEventListener("click", () => {
    if (matchMedia("(max-width:767px)").matches) {
      openMobilePicker(select);
      return;
    }
    if (shell.classList.contains("is-open")) closeDesktopPicker();
    else openDesktopPicker(shell);
  });

  menu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-status-picker-value]");
    if (!button) return;
    applySelection(select, button.dataset.statusPickerValue || "");
    refreshStatusPicker(select);
    closeDesktopPicker();
  });

  select.addEventListener("change", () => refreshStatusPicker(select));
}

function enhanceKnownSelects(root = document) {
  for (const selector of STATUS_SELECTORS) {
    root.querySelectorAll?.(selector).forEach(enhanceStatusSelect);
  }
}

export function initStatusVisuals() {
  if (initialized) return;
  initialized = true;
  ensureStyle();
  enhanceKnownSelects();

  document.addEventListener("click", (event) => {
    if (openDesktopShell && !event.target.closest(".status-select-shell")) closeDesktopPicker({ restoreFocus: false });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && openDesktopShell) {
      event.preventDefault();
      closeDesktopPicker();
    }
  });

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.matches?.("select[name='status'],#filterStatus")) enhanceStatusSelect(node);
        enhanceKnownSelects(node);
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
