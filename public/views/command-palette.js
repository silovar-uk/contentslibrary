import { $, esc } from "../core/dom.js";
import { state, clearFilters, setFilters, setView } from "../core/store.js";
import { openDetail } from "./detail.js";
import { openWorkDialog } from "./dialogs.js";

let initialized = false;
let activeIndex = 0;
let results = [];
let composing = false;

const ACTIONS = [
  { id: "new", label: "作品を追加", hint: "新しい本・映画などを登録", keywords: "追加 新規 new add", icon: "+" },
  { id: "owned", label: "所持・未読を見る", hint: "積読だけを表示", keywords: "積読 所持 未読 owned unread", icon: "▤" },
  { id: "want", label: "読みたいを見る", hint: "読みたい作品だけを表示", keywords: "読みたい want wishlist", icon: "♡" },
  { id: "top", label: "最優先を見る", hint: "読む優先度が最優先の作品", keywords: "最優先 優先度 top next", icon: "↑" },
  { id: "favorite", label: "お気に入りを見る", hint: "栞を付けた作品だけを表示", keywords: "お気に入り 栞 favorite", icon: "★" },
  { id: "notes", label: "メモがある作品を見る", hint: "記録を残した作品だけを表示", keywords: "メモ note notes", icon: "✎" },
  { id: "reading", label: "進行中を見る", hint: "現在読書・視聴中の作品", keywords: "読書中 進行中 active reading", icon: "▶" },
  { id: "organize", label: "読む順番を整理", hint: "読む優先度をまとめて変更", keywords: "読む順番 整理 優先度 organize priority", icon: "↕" },
  { id: "home", label: "ホームへ", hint: "抽選棚と本の束へ戻る", keywords: "ホーム home", icon: "⌂" }
];

function ensureStyle() {
  if ($('link[href="/styles/command-palette.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/styles/command-palette.css";
  document.head.append(link);
}

function ensureDialog() {
  let dialog = $("#commandPalette");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "commandPalette";
  dialog.className = "command-palette";
  dialog.innerHTML = `<div class="command-palette-card">
    <label class="command-palette-search" for="commandPaletteInput"><span aria-hidden="true">⌕</span><input id="commandPaletteInput" type="search" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="作品名、作者、操作を検索…"><kbd>Esc</kbd></label>
    <div id="commandPaletteResults" class="command-palette-results" role="listbox" aria-label="候補"></div>
    <footer><span><kbd>↑</kbd><kbd>↓</kbd> 移動</span><span><kbd>Enter</kbd> 実行</span><span class="command-palette-footnote">作品検索と操作を同じ場所から</span></footer>
  </div>`;
  document.body.append(dialog);
  return dialog;
}

function normalized(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("ja").trim();
}

function workHaystack(work) {
  return normalized([
    work.title,
    work.creator,
    work.search_text,
    ...(work.labels?.genre || []),
    ...(work.labels?.theme || []),
    ...(work.labels?.tag || [])
  ].filter(Boolean).join(" "));
}

export function commandPaletteWorkResults(works = [], query = "", limit = 7) {
  const q = normalized(query);
  if (!q) return [];
  return works
    .filter((work) => workHaystack(work).includes(q))
    .sort((a, b) => {
      const at = normalized(a.title);
      const bt = normalized(b.title);
      const aStarts = at.startsWith(q) ? 1 : 0;
      const bStarts = bt.startsWith(q) ? 1 : 0;
      if (aStarts !== bStarts) return bStarts - aStarts;
      return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
    })
    .slice(0, limit);
}

function commandResults(query) {
  const q = normalized(query);
  const actions = ACTIONS
    .filter((action) => !q || normalized(`${action.label} ${action.hint} ${action.keywords}`).includes(q))
    .slice(0, q ? 5 : 7)
    .map((action) => ({ type: "action", ...action }));
  const works = commandPaletteWorkResults(Array.from(state.works.values()), query, 7)
    .map((work) => ({ type: "work", id: String(work.id), label: work.title, hint: work.creator || "作者・制作者未設定", meta: work.status }));
  const search = q ? [{ type: "search", id: "search", label: `「${query}」で作品を検索`, hint: "ライブラリ全体の検索結果へ", icon: "⌕" }] : [];
  return [...actions, ...works, ...search].slice(0, 12);
}

function resultMarkup(item, index) {
  const active = index === activeIndex;
  const icon = item.type === "work" ? "□" : (item.icon || "→");
  const group = item.type === "work" ? "作品" : item.type === "search" ? "検索" : "操作";
  return `<button type="button" class="command-palette-result ${active ? "is-active" : ""}" data-command-index="${index}" role="option" aria-selected="${active}">
    <span class="command-palette-icon" aria-hidden="true">${esc(icon)}</span>
    <span class="command-palette-copy"><strong>${esc(item.label)}</strong><small>${esc(item.hint || "")}</small></span>
    <span class="command-palette-group">${esc(group)}</span>
  </button>`;
}

function render() {
  const input = $("#commandPaletteInput");
  const box = $("#commandPaletteResults");
  if (!input || !box) return;
  results = commandResults(input.value);
  if (activeIndex >= results.length) activeIndex = Math.max(0, results.length - 1);
  box.innerHTML = results.length ? results.map(resultMarkup).join("") : '<div class="command-palette-empty">候補がありません。</div>';
  const active = box.querySelector(".is-active");
  active?.scrollIntoView({ block: "nearest" });
}

function resetLibraryFilters() {
  clearFilters();
  const priority = $("#filterReadingPriority");
  if (priority) {
    priority.value = "";
    priority.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function showLibrary(patch = {}) {
  resetLibraryFilters();
  setFilters(patch);
  setView("library");
}

function showPriorityTop() {
  resetLibraryFilters();
  setView("library");
  requestAnimationFrame(() => {
    const priority = $("#filterReadingPriority");
    if (!priority) return;
    priority.value = "top";
    priority.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function runAction(id) {
  if (id === "new") { openWorkDialog(false); return; }
  if (id === "owned") { showLibrary({ statuses: ["owned_unread"] }); return; }
  if (id === "want") { showLibrary({ statuses: ["want"] }); return; }
  if (id === "top") { showPriorityTop(); return; }
  if (id === "favorite") { showLibrary({ favorite: "true" }); return; }
  if (id === "notes") { showLibrary({ has_notes: true }); return; }
  if (id === "reading") { showLibrary({ statuses: ["active"] }); return; }
  if (id === "organize") {
    closePalette();
    requestAnimationFrame(() => document.querySelector("[data-reading-priority-organize]")?.click());
    return;
  }
  if (id === "home") { setView("home"); }
}

function execute(index = activeIndex) {
  const item = results[index];
  if (!item) return;
  closePalette();
  if (item.type === "work") { void openDetail(item.id); return; }
  if (item.type === "search") {
    const query = $("#commandPaletteInput")?.value || "";
    const global = $("#globalSearch");
    if (global) global.value = query;
    showLibrary({ q: query });
    return;
  }
  runAction(item.id);
}

export function openCommandPalette(initialValue = "") {
  const dialog = ensureDialog();
  const input = $("#commandPaletteInput");
  activeIndex = 0;
  input.value = initialValue;
  render();
  if (!dialog.open) dialog.showModal();
  requestAnimationFrame(() => {
    input.focus({ preventScroll: true });
    input.select();
  });
}

export function closePalette() {
  const dialog = $("#commandPalette");
  if (dialog?.open) dialog.close();
}

export function initCommandPalette() {
  if (initialized) return;
  initialized = true;
  ensureStyle();
  const dialog = ensureDialog();
  const input = $("#commandPaletteInput");

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      event.stopImmediatePropagation();
      openCommandPalette();
      return;
    }
    if (!dialog.open) return;
    if (event.isComposing || event.keyCode === 229 || composing) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      activeIndex = results.length ? (activeIndex + 1) % results.length : 0;
      render();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      activeIndex = results.length ? (activeIndex - 1 + results.length) % results.length : 0;
      render();
    } else if (event.key === "Enter" && document.activeElement === input) {
      event.preventDefault();
      execute();
    } else if (event.key === "Escape") {
      event.preventDefault();
      closePalette();
    }
  }, true);

  input.addEventListener("compositionstart", () => { composing = true; });
  input.addEventListener("compositionend", () => { composing = false; activeIndex = 0; render(); });
  input.addEventListener("input", (event) => {
    if (composing || event.isComposing) return;
    activeIndex = 0;
    render();
  });

  $("#commandPaletteResults").addEventListener("mousemove", (event) => {
    const button = event.target.closest("[data-command-index]");
    if (!button) return;
    const index = Number(button.dataset.commandIndex);
    if (index !== activeIndex) { activeIndex = index; render(); }
  });
  $("#commandPaletteResults").addEventListener("click", (event) => {
    const button = event.target.closest("[data-command-index]");
    if (!button) return;
    execute(Number(button.dataset.commandIndex));
  });
  dialog.addEventListener("click", (event) => { if (event.target === dialog) closePalette(); });
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); closePalette(); });
}
