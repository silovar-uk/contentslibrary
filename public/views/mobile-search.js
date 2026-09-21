import { $ } from "../core/dom.js";
import { state, setFilters, setView, subscribe } from "../core/store.js";

const SEARCH_DELAY_MS = 140;
let searchTimer = null;
let composing = false;
let initialized = false;

function ensureStyle() {
  if ($('link[href="/styles/mobile-search.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/styles/mobile-search.css";
  document.head.append(link);
}

function updateClearButton() {
  const input = $("#globalSearch");
  const button = $("#globalSearchClear");
  if (!input || !button) return;
  button.hidden = input.value.length === 0;
}

function setMobileSearchOpen(open) {
  const app = $("#app");
  const toggle = document.querySelector("[data-action='toggle-mobile-search']");
  if (!app) return;
  app.classList.toggle("mobile-search-open", Boolean(open));
  toggle?.setAttribute("aria-expanded", String(Boolean(open) || state.view === "library"));
}

function syncMobileSearchState() {
  if (!matchMedia("(max-width:767px)").matches) {
    setMobileSearchOpen(false);
    return;
  }
  const app = $("#app");
  const toggle = document.querySelector("[data-action='toggle-mobile-search']");
  if (state.view === "library") {
    toggle?.setAttribute("aria-expanded", "true");
    return;
  }
  toggle?.setAttribute("aria-expanded", String(app?.classList.contains("mobile-search-open") || false));
}

function applySearch(value) {
  clearTimeout(searchTimer);
  searchTimer = null;
  const query = String(value ?? "");
  const queryChanged = state.filters.q !== query;
  const viewChanged = state.view !== "library";

  if (queryChanged) setFilters({ q: query });
  if (viewChanged) setView("library");
  updateClearButton();
}

function scheduleSearch(value, immediate = false) {
  clearTimeout(searchTimer);
  if (immediate || value === "") {
    applySearch(value);
    return;
  }
  searchTimer = setTimeout(() => applySearch(value), SEARCH_DELAY_MS);
}

function mountClearButton(input) {
  if ($("#globalSearchClear")) return;
  const button = document.createElement("button");
  button.id = "globalSearchClear";
  button.type = "button";
  button.className = "global-search-clear";
  button.setAttribute("aria-label", "検索文字を消去");
  button.textContent = "×";
  button.hidden = true;
  input.after(button);

  button.addEventListener("click", () => {
    composing = false;
    delete input.dataset.composing;
    input.value = "";
    applySearch("");
    input.focus({ preventScroll: true });
  });
}

export function initMobileSearch() {
  if (initialized) return;
  const input = $("#globalSearch");
  if (!input) return;
  initialized = true;

  ensureStyle();
  mountClearButton(input);
  input.enterKeyHint = "search";
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("autocorrect", "off");
  input.setAttribute("spellcheck", "false");
  input.setAttribute("aria-controls", "workList");

  // 既存のinputハンドラーより前のcapture段階で受け取り、
  // 日本語IMEの変換途中を一覧検索へ流さない。
  document.addEventListener("compositionstart", (event) => {
    if (event.target !== input) return;
    composing = true;
    input.dataset.composing = "true";
    clearTimeout(searchTimer);
  }, true);

  document.addEventListener("compositionend", (event) => {
    if (event.target !== input) return;
    event.stopImmediatePropagation();
    composing = false;
    delete input.dataset.composing;
    scheduleSearch(input.value, true);
  }, true);

  document.addEventListener("input", (event) => {
    if (event.target !== input) return;
    event.stopImmediatePropagation();
    updateClearButton();
    if (composing || event.isComposing || event.inputType === "insertCompositionText") return;
    scheduleSearch(input.value, input.value === "");
  }, true);

  // type=searchのネイティブ消去やブラウザー側の検索確定にも対応する。
  document.addEventListener("search", (event) => {
    if (event.target !== input) return;
    event.stopImmediatePropagation();
    if (!composing) scheduleSearch(input.value, true);
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.target !== input) return;
    if (event.isComposing || event.keyCode === 229 || composing) return;
    if (event.key === "Enter") scheduleSearch(input.value, true);
  }, true);

  input.addEventListener("focus", () => {
    updateClearButton();
    if (matchMedia("(max-width:767px)").matches && state.view !== "library") setMobileSearchOpen(true);
  });

  document.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-action='toggle-mobile-search']");
    if (!toggle) return;
    event.preventDefault();
    if (!matchMedia("(max-width:767px)").matches || state.view === "library") {
      input.focus({ preventScroll: true });
      return;
    }
    const app = $("#app");
    const opening = !app?.classList.contains("mobile-search-open");
    setMobileSearchOpen(opening);
    if (opening) requestAnimationFrame(() => input.focus({ preventScroll: true }));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || state.view === "library") return;
    if (!$("#app")?.classList.contains("mobile-search-open")) return;
    setMobileSearchOpen(false);
    document.querySelector("[data-action='toggle-mobile-search']")?.focus();
  });

  subscribe(() => {
    updateClearButton();
    syncMobileSearchState();
  });
  requestAnimationFrame(() => {
    updateClearButton();
    syncMobileSearchState();
  });
}
