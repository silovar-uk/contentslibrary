import { $ } from "../core/dom.js";

const STORAGE_KEY = "sakuhin-log-random-mode-v1";
let initialized = false;
let currentMode = "random";

export function normalizeRandomMode(mode) {
  return mode === "priority" ? "priority" : "random";
}

export function getRandomMode() {
  return currentMode;
}

function ensureStyle() {
  if ($('link[href="/styles/random-mode.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/styles/random-mode.css";
  document.head.append(link);
}

function renderButtons() {
  document.querySelectorAll("[data-random-mode]").forEach((button) => {
    const active = button.dataset.randomMode === currentMode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function mount() {
  const controls = $(".random-controls");
  if (!controls || $("#randomModeToggle")) return;
  const wrap = document.createElement("div");
  wrap.id = "randomModeToggle";
  wrap.className = "random-mode-toggle";
  wrap.setAttribute("role", "group");
  wrap.setAttribute("aria-label", "抽選モード");
  wrap.innerHTML = `
    <button type="button" data-random-mode="random" aria-pressed="true" title="対象作品をすべて同じ確率で抽選">ランダム</button>
    <button type="button" data-random-mode="priority" aria-pressed="false" title="読む優先度が高い作品ほど当たりやすくする。未設定も抽選対象">優先度</button>`;
  const draw = $("[data-action='draw-random']", controls);
  if (draw) draw.before(wrap); else controls.append(wrap);
  renderButtons();
}

export function setRandomMode(mode, { notify = true } = {}) {
  const next = normalizeRandomMode(mode);
  const changed = next !== currentMode;
  currentMode = next;
  try { localStorage.setItem(STORAGE_KEY, currentMode); } catch {}
  renderButtons();
  if (changed && notify) document.dispatchEvent(new CustomEvent("random-mode-change", { detail: { mode: currentMode } }));
}

export function initRandomMode() {
  if (initialized) return;
  initialized = true;
  ensureStyle();
  try { currentMode = normalizeRandomMode(localStorage.getItem(STORAGE_KEY)); } catch { currentMode = "random"; }
  mount();
  renderButtons();
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-random-mode]");
    if (!button) return;
    event.preventDefault();
    setRandomMode(button.dataset.randomMode);
  });
}
