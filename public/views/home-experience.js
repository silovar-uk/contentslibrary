import { $, $$, esc } from "../core/dom.js";
import { state, subscribe } from "../core/store.js";
import { isAllowedCoverUrl, coverThumbUrl } from "../core/cover.js";

let randomStageObserver = null;
let initialized = false;

function ensureStyle() {
  if ($('link[href="/styles/home-experience.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/styles/home-experience.css";
  document.head.append(link);
}

function coverMarkup(work, context) {
  const rawUrl = work?.metadata?.cover_url || "";
  const validCover = isAllowedCoverUrl(rawUrl);
  const title = String(work?.title || "作品");
  const shortTitle = title.length > 28 ? `${title.slice(0, 27)}…` : title;
  return `<span class="home-cover-frame home-cover-frame--${context}" data-home-cover-for="${esc(work.id)}">
    ${validCover
      ? `<img src="${esc(coverThumbUrl(rawUrl))}" alt="${esc(title)}の表紙" loading="lazy" decoding="async" width="220" height="330">`
      : `<span class="home-cover-fallback" aria-label="表紙未設定"><small>MY SHELF</small><strong>${esc(shortTitle)}</strong><i aria-hidden="true"></i></span>`}
  </span>`;
}

function decorateRandomCards() {
  $$("#randomStage .random-pick-card").forEach((card) => {
    const main = $(".random-pick-main", card);
    const workId = main?.dataset.openWork;
    const work = workId ? state.works.get(String(workId)) : null;
    if (!main || !work) return;
    const current = $(".home-cover-frame", main);
    const next = coverMarkup(work, "random");
    if (current) current.outerHTML = next;
    else main.insertAdjacentHTML("afterbegin", next);
    main.classList.add("is-cover-led");
    card.classList.add("has-home-cover");
  });
}

function observeRandomStage() {
  const stage = $("#randomStage");
  if (!stage || randomStageObserver) return;
  randomStageObserver = new MutationObserver(() => {
    randomStageObserver.disconnect();
    decorateRandomCards();
    randomStageObserver.observe(stage, { childList: true });
  });
  randomStageObserver.observe(stage, { childList: true });
}

function refreshHomeExperience() {
  if (state.view !== "home") return;
  queueMicrotask(decorateRandomCards);
}

export function initHomeExperience() {
  if (initialized) return;
  initialized = true;
  ensureStyle();
  observeRandomStage();
  subscribe(refreshHomeExperience);
  requestAnimationFrame(refreshHomeExperience);
}
