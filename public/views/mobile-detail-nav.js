import { $ } from "../core/dom.js";
import { state, subscribe, setView } from "../core/store.js";

let initialized = false;
let observer = null;
let frame = 0;

function ensureLink(href) {
  if ($(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.append(link);
}

function ensureStyle() {
  ensureLink("/styles/mobile-header-detail.css");
  // Must come last: this layer resolves accumulated layout conflicts without changing features.
  ensureLink("/styles/full-ui-polish.css");
}

function ensureDetailTopLink() {
  const panel = $("#detailPanel");
  if (!panel || !state.selected?.work) return;
  let nav = panel.querySelector(".mobile-detail-topnav");
  if (!nav) {
    nav = document.createElement("nav");
    nav.className = "mobile-detail-topnav";
    nav.setAttribute("aria-label", "作品詳細のナビゲーション");
    nav.innerHTML = `<button type="button" class="mobile-detail-home-link" data-mobile-detail-home><span aria-hidden="true">←</span><span>トップ</span></button><span class="mobile-detail-topnav-separator" aria-hidden="true">/</span><span class="mobile-detail-topnav-current">作品詳細</span>`;
    panel.prepend(nav);
  }
}

function apply() {
  const topbar = document.querySelector(".topbar");
  topbar?.classList.add("mobile-topbar-refined");
  ensureDetailTopLink();
}

function scheduleApply() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(apply);
}

export function initMobileDetailNav() {
  if (initialized) return;
  initialized = true;
  ensureStyle();
  const panel = $("#detailPanel");
  if (panel) {
    observer = new MutationObserver(scheduleApply);
    observer.observe(panel, { childList: true, subtree: true });
  }
  subscribe(scheduleApply);

  document.addEventListener("click", (event) => {
    const home = event.target.closest("[data-mobile-detail-home]");
    if (!home) return;
    event.preventDefault();
    setView("home");
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  });

  scheduleApply();
}
