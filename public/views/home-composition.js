import { $ } from "../core/dom.js";
import { state, subscribe, setHomeMode } from "../core/store.js";
import { renderSourceShelves } from "./source-shelves.js";
import { readingPriority } from "./reading-priority.js";
import { readingPrioritySurfaceMarkup } from "./reading-priority-surfaces.js";

let initialized = false;
let frame = 0;
let observer = null;
let exploreMode = "genre";
const EXPLORE_MODES = ["genre", "theme", "creator", "label"];
const EXPLORE_STORAGE_KEY = "contents-library-home-explore-mode-v1";

const ZONES = [
  { key: "continue", eyebrow: "CONTINUE", title: "続きを進める", description: "いま進めている作品へ、すぐ戻る。" },
  { key: "choose", eyebrow: "CHOOSE", title: "次の作品を、棚から引く。", description: "候補から、次の一歩だけ決める。" },
  { key: "explore", eyebrow: "EXPLORE", title: "興味から探す", description: "ジャンル、テーマ、著者、レーベルから探す。" }
];

function ensureStyle() {
  if ($('link[href="/styles/home-decision-surface.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/styles/home-decision-surface.css";
  document.head.append(link);
}

function ensureFlow(home) {
  let flow = $("#homeDecisionFlow");
  if (flow) return flow;
  flow = document.createElement("div");
  flow.id = "homeDecisionFlow";
  flow.className = "home-decision-flow";
  const hero = home.querySelector(".hero-row");
  if (hero) hero.after(flow); else home.prepend(flow);
  return flow;
}

function zoneMarkup(config) {
  return `<div class="home-zone-heading">
    <div><p>${config.eyebrow}</p><h2>${config.title}</h2><span>${config.description}</span></div>
    <div class="home-zone-actions"></div>
  </div><div class="home-zone-body"></div>`;
}

function ensureZones(flow) {
  const zones = {};
  for (const config of ZONES) {
    let zone = flow.querySelector(`[data-home-zone="${config.key}"]`);
    if (!zone) {
      zone = document.createElement("section");
      zone.className = `home-zone home-zone-${config.key}`;
      zone.dataset.homeZone = config.key;
      zone.innerHTML = zoneMarkup(config);
      flow.append(zone);
    }
    zones[config.key] = zone;
  }
  ZONES.forEach(({ key }, index) => {
    const zone = zones[key];
    if (flow.children[index] !== zone) flow.insertBefore(zone, flow.children[index] || null);
  });
  return zones;
}

function moveIntoBody(zone, node) {
  if (!zone || !node) return;
  const body = zone.querySelector(".home-zone-body");
  if (node.parentElement !== body) body.append(node);
}

function hasContinueItems() {
  if (!state.loaded) return false;
  return [...state.works.values()].some((work) => work.status === "active");
}

function setText(node, value) {
  if (node && node.textContent !== value) node.textContent = value;
}

function updateIntro(home, mode) {
  const eyebrow = home.querySelector(".hero-copy .eyebrow");
  const title = home.querySelector(".hero-copy h1");
  const lead = home.querySelector(".hero-copy > p:last-of-type");
  setText(eyebrow, "YOUR CULTURE, NEXT MOVE");
  if (!title || !lead) return;

  const copy = {
    continue: "今日は、どれに戻る？",
    choose: "次は、何にする？",
    explore: "興味から探す。"
  };
  setText(title, copy[mode] || copy.continue);
  setText(lead, "");
}

function ensureModeSwitcher(home, flow) {
  let switcher = home.querySelector("#homeModeSwitcher");
  if (!switcher) {
    switcher = document.createElement("nav");
    switcher.id = "homeModeSwitcher";
    switcher.className = "home-mode-switcher";
    switcher.setAttribute("aria-label", "ホームの表示");
    switcher.innerHTML = `<button type="button" data-home-mode="continue" aria-pressed="false">続き</button><button type="button" data-home-mode="choose" aria-pressed="false">次を選ぶ</button><button type="button" data-home-mode="explore" aria-pressed="false">探す</button>`;
    flow.before(switcher);
  }
  return switcher;
}

function syncModeSwitcher(home, mode) {
  home.querySelectorAll("[data-home-mode]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.homeMode === mode));
  });
}

function enhanceContinueCards(zone) {
  zone.querySelectorAll(".reading-card[data-work-id]").forEach((card) => {
    card.querySelector(":scope > .card-rating")?.remove();
    const main = card.querySelector(".reading-card-main");
    if (!main) return;
    let cue = main.querySelector(".reading-card-cue");
    if (!cue) {
      cue = document.createElement("span");
      cue.className = "reading-card-cue";
      cue.textContent = "作品へ戻る →";
      main.append(cue);
    }
  });
}

function composeContinue(zone) {
  const feature = $("#editorialReadingFeature");
  if (feature) {
    feature.classList.add("home-featured-shelf", "home-featured-continue");
    moveIntoBody(zone, feature);
  }
  enhanceContinueCards(zone);
}

function enhanceChooseCards(stage) {
  stage.querySelectorAll(".random-pick-card").forEach((card) => {
    const workId = card.querySelector("[data-open-work]")?.dataset.openWork;
    if (!workId) return;
    card.dataset.workId = workId;
    card.classList.add("home-choice-card");

    // TOPは「次候補を決める」面に絞る。開始・評価・メモは詳細/一覧へ委ねる。
    card.querySelector("[data-random-start]")?.remove();
    card.querySelector(":scope > .card-rating")?.remove();
    card.querySelector(":scope > .card-note-row")?.remove();

    const work = state.works.get(String(workId));
    const markup = work ? readingPrioritySurfaceMarkup(work, "choose") : "";
    let host = card.querySelector(":scope > .home-choice-priority");
    if (!markup) {
      host?.remove();
      return;
    }

    const value = readingPriority(work);
    if (host?.dataset.priorityValue === value) return;
    if (!host) {
      host = document.createElement("div");
      host.className = "home-choice-priority";
      card.append(host);
    }
    host.dataset.priorityValue = value;
    host.innerHTML = markup;
  });
}

function composeChoose(zone) {
  const controls = document.querySelector("#homeView .random-controls");
  const stage = $("#randomStage");
  const body = zone.querySelector(".home-zone-body");
  let scopeControl = zone.querySelector(".random-scope-control");
  let rerollActions = zone.querySelector(".random-reroll-actions");

  if (controls && body) {
    if (!scopeControl) {
      scopeControl = document.createElement("div");
      scopeControl.className = "random-scope-control";
      const label = controls.querySelector(":scope > label");
      if (label) scopeControl.append(label);
    }
    const modeToggle = controls.querySelector(":scope > .random-mode-toggle");
    if (modeToggle && modeToggle.parentElement !== scopeControl) scopeControl.append(modeToggle);
    if (!rerollActions) {
      rerollActions = document.createElement("div");
      rerollActions.className = "random-reroll-actions";
      const draw = controls.querySelector(":scope > [data-action='draw-random']");
      if (draw) {
        draw.textContent = "↻ 候補を引き直す";
        draw.dataset.rerollLabel = "↻ 候補を引き直す";
        rerollActions.append(draw);
      }
    }
    if (scopeControl?.parentElement !== body) body.append(scopeControl);
  }

  if (stage) {
    stage.classList.add("home-featured-shelf", "home-featured-choose");
    moveIntoBody(zone, stage);
    enhanceChooseCards(stage);
  }

  if (rerollActions && body && rerollActions.parentElement !== body) body.append(rerollActions);
  if (controls && controls.childElementCount === 0) controls.remove();

  if (body && !body.querySelector(".home-choose-secondary-actions")) {
    const actions = document.createElement("div");
    actions.className = "home-choose-secondary-actions";
    actions.innerHTML = '<button type="button" class="text-button home-priority-link" data-reading-priority-organize>読む順番を整理 →</button>';
    body.append(actions);
  }
}

function ensureExploreTabs(zone) {
  const body = zone.querySelector(".home-zone-body");
  if (!body) return;
  let tabs = body.querySelector(".home-explore-tabs");
  if (!tabs) {
    tabs = document.createElement("nav");
    tabs.className = "home-explore-tabs";
    tabs.setAttribute("aria-label", "探し方を切り替える");
    tabs.innerHTML = `<button type="button" data-home-explore-mode="genre" aria-pressed="false">ジャンル</button><button type="button" data-home-explore-mode="theme" aria-pressed="false">テーマ</button><button type="button" data-home-explore-mode="creator" aria-pressed="false">著者</button><button type="button" data-home-explore-mode="label" aria-pressed="false">レーベル</button>`;
    body.prepend(tabs);
  }
}

function syncExploreTabs(zone) {
  zone.dataset.exploreMode = exploreMode;
  zone.querySelectorAll("[data-home-explore-mode]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.homeExploreMode === exploreMode));
  });
  const genre = zone.querySelector("#genreShelf");
  const theme = zone.querySelector("#themeShelf");
  if (genre) genre.hidden = exploreMode !== "genre";
  if (theme) theme.hidden = exploreMode !== "theme";
  renderSourceShelves(exploreMode);
}

function enhanceGenreShelf(zone) {
  const genre = zone.querySelector("#genreShelf");
  if (!genre) return;
  genre.classList.add("genre-shelf-complete");
  genre.querySelector("[data-shelf-expand]")?.remove();
  genre.querySelectorAll(".shelf-item").forEach((item) => {
    item.classList.remove("is-secondary");
    item.style.removeProperty("--shelf-span");
  });

  if (!state.loaded) return;
  const count = genre.querySelectorAll(".shelf-item[data-genre-id]").length;
  const summary = genre.querySelector("#shelfSummary");
  if (!summary) return;
  let countNode = summary.querySelector("[data-genre-count]");
  if (!countNode) {
    countNode = document.createElement("span");
    countNode.dataset.genreCount = "";
    countNode.innerHTML = "<strong></strong>ジャンル";
    summary.prepend(countNode);
  }
  setText(countNode.querySelector("strong"), String(count));
}

function composeExplore(zone) {
  const grid = $("#editorialExploreGrid");
  if (grid) moveIntoBody(zone, grid);
  ensureExploreTabs(zone);
  syncExploreTabs(zone);
  enhanceGenreShelf(zone);
}

function removeLegacyHomeSurfaces() {
  $("#readingPriorityHomeHub")?.remove();
  $("#walletStacks")?.remove();
  $("#recentlyEditedBooksSection")?.remove();
}

function chooseHasCandidates() {
  if (!state.loaded) return false;
  return [...state.works.values()].some((work) => ["want", "owned_unread"].includes(work.status));
}

function recommendedHomeMode() {
  if (hasContinueItems()) return "continue";
  if (chooseHasCandidates()) return "choose";
  return "explore";
}

export function applyHomeComposition() {
  const home = $("#homeView");
  if (!home) return;
  removeLegacyHomeSurfaces();

  const flow = ensureFlow(home);
  const zones = ensureZones(flow);
  const switcher = ensureModeSwitcher(home, flow);
  const banner = $("#securityBanner");
  if (banner && banner.nextElementSibling !== switcher) switcher.before(banner);

  composeContinue(zones.continue);
  composeChoose(zones.choose);
  composeExplore(zones.explore);

  const columns = home.querySelector(".home-columns");
  const stats = $("#statsBar");
  if (columns) columns.hidden = true;
  if (stats) stats.hidden = true;

  const mode = state.homeMode || (state.loaded ? recommendedHomeMode() : "continue");
  if (state.loaded && !state.homeMode) {
    setHomeMode(mode);
    return;
  }

  Object.entries(zones).forEach(([key, zone]) => {
    zone.hidden = key !== mode;
  });
  syncModeSwitcher(home, mode);
  updateIntro(home, mode);
}

function scheduleApply() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(applyHomeComposition);
}

export function initHomeComposition() {
  if (initialized) return;
  initialized = true;
  ensureStyle();
  const home = $("#homeView");
  if (home) {
    observer = new MutationObserver(scheduleApply);
    observer.observe(home, { childList: true, subtree: true });
  }
  subscribe(scheduleApply);
  window.addEventListener("resize", scheduleApply, { passive: true });
  try {
    const stored = localStorage.getItem(EXPLORE_STORAGE_KEY);
    if (EXPLORE_MODES.includes(stored)) exploreMode = stored;
  } catch {}

  document.addEventListener("click", (event) => {
    const modeButton = event.target.closest("[data-home-mode]");
    if (modeButton) {
      setHomeMode(modeButton.dataset.homeMode);
      return;
    }

    const tab = event.target.closest("[data-home-explore-mode]");
    if (!tab) return;
    const next = tab.dataset.homeExploreMode;
    if (!EXPLORE_MODES.includes(next)) return;
    exploreMode = next;
    try { localStorage.setItem(EXPLORE_STORAGE_KEY, exploreMode); } catch {}
    const zone = document.querySelector('[data-home-zone="explore"]');
    if (zone) syncExploreTabs(zone);
  });
  scheduleApply();
}