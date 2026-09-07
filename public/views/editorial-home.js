import { $ } from "../core/dom.js";
import { subscribe } from "../core/store.js";

let initialized = false;
let frame = 0;
let observer = null;
let randomScrollGrid = null;

function ensureStyle() {
  if ($('link[href="/styles/editorial-home.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/styles/editorial-home.css";
  document.head.append(link);
}

function ensureExploreGrid(home) {
  const genre = home.querySelector("#genreShelf");
  const theme = home.querySelector("#themeShelf");
  if (!genre || !theme) return;
  let grid = home.querySelector("#editorialExploreGrid");
  if (!grid) {
    grid = document.createElement("div");
    grid.id = "editorialExploreGrid";
    grid.className = "editorial-explore-grid";
    genre.before(grid);
  }
  if (genre.parentElement !== grid) grid.append(genre);
  if (theme.parentElement !== grid) grid.append(theme);
  genre.classList.add("editorial-card", "editorial-card-explore");
  theme.classList.add("editorial-card", "editorial-card-explore");
}

function ensureReadingFeature(home) {
  const strip = home.querySelector("#readingStrip");
  if (!strip) return;
  let feature = home.querySelector("#editorialReadingFeature");
  if (!feature) {
    const heading = strip.previousElementSibling?.classList.contains("section-heading") ? strip.previousElementSibling : null;
    feature = document.createElement("section");
    feature.id = "editorialReadingFeature";
    feature.className = "editorial-card editorial-reading-feature";
    (heading || strip).before(feature);
    if (heading) feature.append(heading);
    feature.append(strip);
  }
}

function movePriorityHub(home) {
  const hub = home.querySelector("#readingPriorityHomeHub");
  const random = home.querySelector("#randomStage");
  if (!hub || !random) return;
  hub.classList.add("editorial-card", "editorial-priority-feature");
  if (hub.previousElementSibling !== random) random.after(hub);
}

function decorateRecents(home) {
  const columns = home.querySelector(".home-columns");
  if (!columns) return;
  columns.classList.add("editorial-recents-grid");
  [...columns.children].forEach((section) => section.classList.add("editorial-card", "editorial-card-secondary"));
}

function ensureRandomSkeletonCount(home) {
  const grid = home.querySelector("#randomStage .random-pick-grid");
  if (!grid) return;
  const skeletons = [...grid.children].filter((item) => item.classList.contains("skeleton-card"));
  if (!skeletons.length || skeletons.length >= 6) return;
  const template = skeletons[skeletons.length - 1];
  for (let index = skeletons.length; index < 6; index += 1) grid.append(template.cloneNode(true));
}

function updateRandomScrollState() {
  const stage = $("#randomStage");
  const grid = stage?.querySelector(".random-pick-grid");
  if (!stage || !grid) return;
  const hasOverflow = grid.scrollWidth > grid.clientWidth + 2;
  const isAtEnd = !hasOverflow || grid.scrollLeft + grid.clientWidth >= grid.scrollWidth - 4;
  stage.classList.toggle("has-horizontal-overflow", hasOverflow);
  stage.classList.toggle("is-scroll-end", isAtEnd);
}

function ensureRandomScrollTracking(home) {
  const grid = home.querySelector("#randomStage .random-pick-grid");
  if (!grid) return;
  if (randomScrollGrid !== grid) {
    randomScrollGrid?.removeEventListener("scroll", updateRandomScrollState);
    randomScrollGrid = grid;
    randomScrollGrid.addEventListener("scroll", updateRandomScrollState, { passive: true });
  }
  updateRandomScrollState();
}

function decorateRandom(home) {
  const stage = home.querySelector("#randomStage");
  if (!stage) return;
  stage.classList.add("editorial-card", "editorial-random-feature");
  ensureRandomSkeletonCount(home);
  ensureRandomScrollTracking(home);
  const hero = home.querySelector(".hero-row");
  hero?.classList.add("editorial-hero");
  const topDraw = document.querySelector('.top-actions [data-action="draw-random"]');
  if (topDraw) topDraw.title = "候補を6件引き直す";
}

function decorateStats(home) {
  home.querySelector("#statsBar")?.classList.add("editorial-stats");
}

export function applyEditorialHome() {
  const home = $("#homeView");
  if (!home) return;
  home.classList.add("editorial-home");
  decorateRandom(home);
  movePriorityHub(home);
  ensureExploreGrid(home);
  ensureReadingFeature(home);
  decorateRecents(home);
  decorateStats(home);
}

function scheduleApply() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(applyEditorialHome);
}

export function initEditorialHome() {
  if (initialized) return;
  initialized = true;
  ensureStyle();
  const home = $("#homeView");
  if (home) {
    observer = new MutationObserver(scheduleApply);
    observer.observe(home, { childList: true, subtree: true });
  }
  window.addEventListener("resize", scheduleApply, { passive: true });
  subscribe(scheduleApply);
  scheduleApply();
}
