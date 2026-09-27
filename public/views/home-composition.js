import { $ } from "../core/dom.js";
import { state, subscribe, setHomeMode } from "../core/store.js";
import { readingPriority } from "./reading-priority.js";
import { readingPrioritySurfaceMarkup } from "./reading-priority-surfaces.js";

let initialized = false;
let frame = 0;

const ZONES = [
  { key: "continue", eyebrow: "CONTINUE", title: "続きを進める", description: "いま進めている作品へ、すぐ戻る。" },
  { key: "choose", eyebrow: "CHOOSE", title: "次の作品を、棚から引く。", description: "候補から、次の一歩だけ決める。" }
];
const HOME_MODES = new Set(ZONES.map(({ key }) => key));

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
  setText(eyebrow, "NOW / YOUR CULTURE");
  if (!title || !lead) return;

  const copy = {
    continue: "今日は、どれに戻る？",
    choose: "次は、何にする？"
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
    switcher.setAttribute("aria-label", "NOWの表示");
    switcher.innerHTML = `<button type="button" data-home-mode="continue" aria-pressed="false">続き</button><button type="button" data-home-mode="choose" aria-pressed="false">次を選ぶ</button>`;
  }
  const hero = home.querySelector(".hero-row");
  if (hero && switcher.parentElement !== hero) hero.append(switcher);
  else if (!hero && switcher.parentElement !== flow.parentElement) flow.before(switcher);
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
      const actions = card.querySelector(":scope > .decision-candidate-actions");
      if (actions) actions.before(host); else card.append(host);
    }
    host.dataset.priorityValue = value;
    host.innerHTML = markup;
  });
}

function composeChoose(zone) {
  const controls = document.querySelector("#homeView .random-controls");
  const stage = $("#randomStage");
  const body = zone.querySelector(".home-zone-body");
  if (!body) return;

  let toolbar = body.querySelector(".home-choose-toolbar");
  if (!toolbar) {
    toolbar = document.createElement("div");
    toolbar.className = "home-choose-toolbar";
    body.prepend(toolbar);
  }

  let scopeControl = toolbar.querySelector(".random-scope-control");
  if (!scopeControl) {
    scopeControl = document.createElement("div");
    scopeControl.className = "random-scope-control";
    toolbar.append(scopeControl);
  }
  const label = controls?.querySelector(":scope > label");
  if (label && label.parentElement !== scopeControl) scopeControl.append(label);

  let secondary = toolbar.querySelector(".home-choose-secondary-actions");
  if (!secondary) {
    secondary = document.createElement("div");
    secondary.className = "home-choose-secondary-actions";
    secondary.innerHTML = `<button type="button" class="text-button home-priority-link" data-reading-priority-organize>読む順番を整理 →</button>`;
    toolbar.append(secondary);
  }

  let rerollActions = toolbar.querySelector(".random-reroll-actions");
  if (!rerollActions) {
    rerollActions = document.createElement("div");
    rerollActions.className = "random-reroll-actions";
    toolbar.append(rerollActions);
  }
  const draw = controls?.querySelector(":scope > [data-action='draw-random']");
  if (draw && draw.parentElement !== rerollActions) {
    draw.textContent = "↻ 3件を引き直す";
    draw.dataset.rerollLabel = "↻ 3件を引き直す";
    rerollActions.append(draw);
  }

  if (stage) {
    stage.classList.add("home-featured-shelf", "home-featured-choose");
    moveIntoBody(zone, stage);
    enhanceChooseCards(stage);
  }
  if (controls && controls.childElementCount === 0) controls.remove();
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
  return "choose";
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

  const columns = home.querySelector(".home-columns");
  const stats = $("#statsBar");
  if (columns) columns.hidden = true;
  if (stats) stats.hidden = true;

  const requestedMode = HOME_MODES.has(state.homeMode) ? state.homeMode : null;
  const mode = requestedMode || (state.loaded ? recommendedHomeMode() : "continue");
  if (state.loaded && state.homeMode !== mode) {
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
  subscribe(scheduleApply);
  document.addEventListener("home:rendered", scheduleApply);
  window.addEventListener("resize", scheduleApply, { passive: true });

  document.addEventListener("click", (event) => {
    const modeButton = event.target.closest("[data-home-mode]");
    if (!modeButton) return;
    const next = modeButton.dataset.homeMode;
    if (!HOME_MODES.has(next)) return;
    setHomeMode(next);
  });
  scheduleApply();
}
