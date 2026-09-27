import { $, $$ } from "../core/dom.js";
import { state, subscribe } from "../core/store.js";
import { workFaceMarkup } from "../core/work-face.js";
import { initWorkFaceSurfaces } from "./work-face-surfaces.js";

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
  return `<span class="home-cover-frame home-cover-frame--${context}" data-home-cover-for="${work.id}" data-shuhari-face="choose">${workFaceMarkup(work)}</span>`;
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
  initWorkFaceSurfaces();
  observeRandomStage();
  subscribe(refreshHomeExperience);
  requestAnimationFrame(refreshHomeExperience);
}
