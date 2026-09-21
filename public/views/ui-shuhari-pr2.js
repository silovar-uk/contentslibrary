import { subscribe } from "../core/store.js";

const STYLE_HREF = "/styles/ui-shuhari-pr2.css";
let frame = 0;

function ensureStyle() {
  if (document.querySelector(`link[href="${STYLE_HREF}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = STYLE_HREF;
  document.head.append(link);
}

function hasHorizontalOverflow(node) {
  return Boolean(node && node.scrollWidth > node.clientWidth + 2);
}

export function syncShuhariSwipeHints() {
  const continueZone = document.querySelector('[data-home-zone="continue"]');
  const chooseZone = document.querySelector('[data-home-zone="choose"]');
  const reading = document.querySelector("#readingStrip");
  const random = document.querySelector("#randomStage .random-pick-grid");
  const continueHint = continueZone?.querySelector(".home-swipe-hint");
  const chooseHint = chooseZone?.querySelector(".home-swipe-hint");
  if (continueHint) continueHint.hidden = !hasHorizontalOverflow(reading);
  if (chooseHint) chooseHint.hidden = !hasHorizontalOverflow(random);
}

function scheduleSync() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(syncShuhariSwipeHints);
}


export function initUiShuhariPr2() {
  ensureStyle();
  subscribe(scheduleSync);
  window.addEventListener("resize", scheduleSync, { passive: true });
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-action='draw-random'],[data-random-mode],[data-home-zone]")) scheduleSync();
  });
  scheduleSync();
}
