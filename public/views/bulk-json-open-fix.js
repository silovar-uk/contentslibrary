import { $, toast } from "../core/dom.js";
import { state, loadSnapshot } from "../core/store.js";
import { requestCloseDialog } from "./dialogs.js";

const DRAFT_KEY = "sakuhin-log-bulk-json-draft-v1";
let initialized = false;
let opening = false;

function jsonField(form) {
  return form?.elements?.namedItem("json") || null;
}

function duplicateField(form) {
  return form?.elements?.namedItem("allow_duplicates") || null;
}

function restoreDraft(form) {
  const textarea = jsonField(form);
  if (!textarea || textarea.value.trim()) return;
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (!draft || typeof draft !== "object") return;
    textarea.value = typeof draft.json === "string" ? draft.json : "";
    const checkbox = duplicateField(form);
    if (checkbox) checkbox.checked = Boolean(draft.allow_duplicates);
  } catch {
    // 壊れた下書きは開閉を妨げない。
  }
}

async function nextFrame() {
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

export async function openBulkJsonDialog() {
  const dialog = $("#bulkJsonAddDialog");
  const form = $("#bulkJsonAddForm");
  const textarea = jsonField(form);
  if (!dialog || !form || !textarea || opening) return;

  if (form.getAttribute("aria-busy") === "true") {
    toast("JSONの追加処理中です。完了までお待ちください。", "error");
    return;
  }
  if (dialog.open) {
    textarea.focus({ preventScroll: true });
    return;
  }

  opening = true;
  try {
    const workDialog = $("#workDialog");
    if (workDialog?.open) {
      requestCloseDialog(workDialog);
      if (workDialog.open) return;
    }

    const titleDialog = $("#bulkAddDialog");
    if (titleDialog?.open) titleDialog.close();

    if (!state.loaded) await loadSnapshot();

    restoreDraft(form);
    form.dispatchEvent(new Event("input", { bubbles: true }));

    // 開いていたdialogのcloseと次のshowModalを同一描画フレームに重ねない。
    await nextFrame();
    if (!dialog.open) dialog.showModal();
    setTimeout(() => textarea.focus({ preventScroll: true }), 40);
  } catch (error) {
    toast(`JSON追加画面を開けませんでした。${error?.message || "画面を再読み込みしてください。"}`, "error");
  } finally {
    opening = false;
  }
}

function handleOpenClick(event) {
  const target = event.target instanceof Element ? event.target.closest("[data-action='open-bulk-json-add']") : null;
  if (!target) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void openBulkJsonDialog();
}

export function initBulkJsonOpenFix() {
  if (initialized) return;
  initialized = true;
  // captureで先に受け、別モジュールとのイベント順競合を避ける。
  document.addEventListener("click", handleOpenClick, true);
}
