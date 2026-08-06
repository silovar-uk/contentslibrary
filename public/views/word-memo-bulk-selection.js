import { $ } from "../core/dom.js";

let initialized = false;
let observer = null;

function ensureStyle() {
  if ($('link[href="/styles/word-memo-bulk-selection.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/styles/word-memo-bulk-selection.css";
  document.head.append(link);
}

function eligibleCheckboxes() {
  return Array.from(document.querySelectorAll(
    "#wordMemoResearchDialog [data-word-memo-candidate-index]:not(:disabled)"
  ));
}

function updateControls() {
  const controls = $("[data-word-memo-selection-tools]");
  if (!controls) return;
  const checkboxes = eligibleCheckboxes();
  const selected = checkboxes.filter((checkbox) => checkbox.checked).length;
  const selectAll = $("[data-word-memo-select-all]", controls);
  const clear = $("[data-word-memo-clear-all]", controls);
  selectAll.disabled = checkboxes.length === 0 || selected === checkboxes.length;
  clear.disabled = selected === 0;
  selectAll.setAttribute("aria-label", `追加できる単語候補${checkboxes.length}件をすべて選択`);
  clear.setAttribute("aria-label", `選択中の単語候補${selected}件をすべて解除`);
}

function mountControls() {
  const preview = $("#wordMemoResearchPreview");
  const heading = $(".word-memo-preview-heading", preview);
  if (!heading) return;
  let controls = $("[data-word-memo-selection-tools]", heading);
  if (!controls) {
    controls = document.createElement("div");
    controls.className = "word-memo-selection-tools";
    controls.dataset.wordMemoSelectionTools = "";
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "単語候補の一括選択");
    controls.innerHTML = `
      <button type="button" class="ghost-button" data-word-memo-select-all>すべて選択</button>
      <button type="button" class="ghost-button" data-word-memo-clear-all>選択解除</button>`;
    const count = $("#wordMemoSelectedCount", heading);
    if (count) count.before(controls);
    else heading.append(controls);
  }
  updateControls();
}

function setAll(checked) {
  const checkboxes = eligibleCheckboxes();
  let changed = null;
  for (const checkbox of checkboxes) {
    if (checkbox.checked === checked) continue;
    checkbox.checked = checked;
    changed = checkbox;
  }
  if (changed) changed.dispatchEvent(new Event("change", { bubbles: true }));
  updateControls();
}

export function initWordMemoBulkSelection() {
  if (initialized) return;
  initialized = true;
  ensureStyle();
  mountControls();

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-word-memo-select-all]")) {
      event.preventDefault();
      setAll(true);
      return;
    }
    if (event.target.closest("[data-word-memo-clear-all]")) {
      event.preventDefault();
      setAll(false);
    }
  });

  document.addEventListener("change", (event) => {
    if (event.target?.matches("[data-word-memo-candidate-index]")) updateControls();
  });

  const dialog = $("#wordMemoResearchDialog");
  if (dialog) {
    observer = new MutationObserver(() => {
      mountControls();
      updateControls();
    });
    observer.observe(dialog, { childList: true, subtree: true });
  }
}
