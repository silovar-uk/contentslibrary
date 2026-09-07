import { $ } from "../core/dom.js";
import { state, subscribe } from "../core/store.js";

let initialized = false;
let frame = 0;
let observer = null;
let exploreMode = "genre";

const ZONES = [
  { key: "continue", eyebrow: "CONTINUE", title: "続きを進める", description: "始めた作品に、まず戻る。" },
  { key: "choose", eyebrow: "CHOOSE", title: "次の作品を、棚から引く。", description: "自分では選ばなかった候補にも、偶然もう一度出会う。" },
  { key: "explore", eyebrow: "EXPLORE", title: "興味から探す", description: "ジャンルやテーマから、棚を横断する。" },
  { key: "reflect", eyebrow: "REFLECT", title: "振り返る", description: "最近のメモや記録から、体験をもう一度拾う。" }
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

function activeWorks() {
  return Array.from(state.works.values()).filter((work) => work?.status === "active");
}

function setText(node, value) {
  if (node && node.textContent !== value) node.textContent = value;
}

function updateIntro(home, hasActive, chooseAvailable) {
  const eyebrow = home.querySelector(".hero-copy .eyebrow");
  const title = home.querySelector(".hero-copy h1");
  const lead = home.querySelector(".hero-copy > p:last-of-type");
  setText(eyebrow, "YOUR CULTURE, NEXT MOVE");
  if (!title || !lead) return;

  if (hasActive) {
    setText(title, "今日は、どれに戻る？");
    setText(lead, "続きを進める。次を選ぶ。まだ決まらなければ、興味から探す。");
    return;
  }
  if (chooseAvailable) {
    setText(title, "次は、何にする？");
    setText(lead, "棚から引くか、興味から探すか。次の一歩だけ決める。");
    return;
  }
  setText(title, "興味から、次を探す。");
  setText(lead, "ジャンルやテーマを入口に、次に触れる作品を見つける。");
}

function composeContinue(zone) {
  const feature = $("#editorialReadingFeature");
  if (feature) moveIntoBody(zone, feature);
  const actions = zone.querySelector(".home-zone-actions");
  if (actions && !actions.querySelector('[data-preset="reading"]')) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "text-button";
    button.dataset.preset = "reading";
    button.textContent = "進行中をすべて見る →";
    actions.append(button);
  }
}

function composeChoose(zone) {
  const controls = document.querySelector("#homeView .random-controls");
  const stage = $("#randomStage");
  if (controls) moveIntoBody(zone, controls);
  if (stage) moveIntoBody(zone, stage);

  const actions = zone.querySelector(".home-zone-actions");
  if (actions && !actions.querySelector("[data-reading-priority-organize]")) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "text-button home-priority-link";
    button.dataset.readingPriorityOrganize = "";
    button.textContent = "読む順番を整理 →";
    actions.append(button);
  }
}

function ensureExploreTabs(zone) {
  const actions = zone.querySelector(".home-zone-actions");
  if (!actions || actions.querySelector(".home-explore-tabs")) return;
  const tabs = document.createElement("div");
  tabs.className = "home-explore-tabs";
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "探し方を切り替える");
  tabs.innerHTML = `<button type="button" role="tab" data-home-explore-mode="genre">ジャンル</button><button type="button" role="tab" data-home-explore-mode="theme">テーマ</button>`;
  actions.append(tabs);
}

function syncExploreTabs(zone) {
  if (zone.dataset.exploreMode !== exploreMode) zone.dataset.exploreMode = exploreMode;
  zone.querySelectorAll("[data-home-explore-mode]").forEach((button) => {
    const selected = String(button.dataset.homeExploreMode === exploreMode);
    if (button.getAttribute("aria-selected") !== selected) button.setAttribute("aria-selected", selected);
  });
}

function composeExplore(zone) {
  const grid = $("#editorialExploreGrid");
  if (grid) moveIntoBody(zone, grid);
  ensureExploreTabs(zone);
  syncExploreTabs(zone);
}

function composeReflect(zone) {
  const columns = document.querySelector("#homeView .home-columns");
  const stats = $("#statsBar");
  if (columns) moveIntoBody(zone, columns);
  if (stats) moveIntoBody(zone, stats);
}

function removeLegacyHomeSurfaces() {
  $("#readingPriorityHomeHub")?.remove();
  $("#walletStacks")?.remove();
  $("#recentlyEditedBooksSection")?.remove();
}

function chooseHasCandidates() {
  if (!state.loaded) return true;
  const stage = $("#randomStage");
  if (!stage) return false;
  return Boolean(stage.querySelector(".random-pick-card, .skeleton-card")) && !stage.querySelector(".random-empty");
}

export function applyHomeComposition() {
  const home = $("#homeView");
  if (!home) return;
  removeLegacyHomeSurfaces();

  const flow = ensureFlow(home);
  const zones = ensureZones(flow);
  const banner = $("#securityBanner");
  if (banner && banner.nextElementSibling !== flow) flow.before(banner);

  composeContinue(zones.continue);
  composeChoose(zones.choose);
  composeExplore(zones.explore);
  composeReflect(zones.reflect);

  const hasActive = activeWorks().length > 0;
  const chooseAvailable = chooseHasCandidates();
  const hideContinue = state.loaded && !hasActive;
  const hideChoose = state.loaded && !chooseAvailable;
  if (zones.continue.hidden !== hideContinue) zones.continue.hidden = hideContinue;
  if (zones.choose.hidden !== hideChoose) zones.choose.hidden = hideChoose;
  if (zones.explore.hidden) zones.explore.hidden = false;
  if (zones.reflect.hidden) zones.reflect.hidden = false;
  updateIntro(home, hasActive, chooseAvailable);
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
  document.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-home-explore-mode]");
    if (!tab) return;
    exploreMode = tab.dataset.homeExploreMode === "theme" ? "theme" : "genre";
    const zone = document.querySelector('[data-home-zone="explore"]');
    if (zone) syncExploreTabs(zone);
  });
  scheduleApply();
}
