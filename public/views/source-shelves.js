import { esc } from "../core/dom.js";
import { allWorks, setFilters, setView, subscribe } from "../core/store.js";
import { sourceShelfData } from "../core/source-shelf.js";
import { workFaceMarkup } from "../core/work-face.js";

let expanded = false;
let renderedMode = "";
let lastSignature = "";
let frame = 0;

function ensureStyle() {
  if (document.querySelector('link[href="/styles/source-shelves.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/styles/source-shelves.css";
  document.head.append(link);
}

function fanMarkup(works) {
  return `<span class="source-shelf-fan">${works.slice(0, 3).map((work) => `<span class="source-shelf-mini">${workFaceMarkup(work)}</span>`).join("")}</span>`;
}

function stackMarkup(item) {
  return `<button type="button" class="source-shelf-stack" data-source-shelf-name="${esc(item.name)}">${fanMarkup(item.works)}<span><strong>${esc(item.name)}</strong><small>${item.count}作品</small></span></button>`;
}

function sourceHost() {
  return document.querySelector("#sourceShelves");
}

function ensureHost() {
  const body = document.querySelector('[data-home-zone="explore"] .home-zone-body');
  if (!body) return null;
  let host = sourceHost();
  if (!host) {
    host = document.createElement("section");
    host.id = "sourceShelves";
    host.className = "source-shelves";
    const tabs = body.querySelector(".home-explore-tabs");
    if (tabs) tabs.after(host);
    else body.prepend(host);
  }
  return host;
}

export function renderSourceShelves(mode = null) {
  const host = ensureHost();
  if (!host) return false;

  if (!["creator", "label"].includes(mode)) {
    host.hidden = true;
    lastSignature = "";
    return true;
  }

  if (renderedMode !== mode) {
    expanded = false;
    renderedMode = mode;
  }

  host.hidden = false;
  host.dataset.sourceMode = mode;

  const data = sourceShelfData(allWorks(), mode);
  const visible = expanded ? data : data.slice(0, 12);
  const label = mode === "label" ? "レーベル" : "著者";
  const signature = JSON.stringify({
    mode,
    expanded,
    items: data.map((item) => [item.name, item.count, item.works.slice(0, 3).map((work) => String(work.id))])
  });
  if (signature === lastSignature && host.dataset.sourceMode === mode && !host.hidden) return true;

  lastSignature = signature;
  host.innerHTML = `<div class="source-shelves-head"><div><span>FROM YOUR LIBRARY</span><h3>${label}から探す</h3><p>分類を待たず、すでにある作品から棚をつくる。</p></div></div>${visible.length ? `<div class="source-shelves-grid">${visible.map(stackMarkup).join("")}</div>${data.length > 12 ? `<button type="button" class="text-button source-shelves-more" data-source-shelf-more>${expanded ? "たたむ" : `もっと見る (${data.length})`}</button>` : ""}` : `<div class="source-shelves-empty">2作品以上まとまる${label}はまだありません。</div>`}`;
  return true;
}

function scheduleRender() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    const host = sourceHost();
    const mode = host?.dataset.sourceMode;
    if (mode && !host.hidden) renderSourceShelves(mode);
  });
}

export function initSourceShelves() {
  ensureStyle();
  subscribe(scheduleRender);

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-source-shelf-more]")) {
      expanded = !expanded;
      renderSourceShelves(renderedMode);
      return;
    }

    const stack = event.target.closest("[data-source-shelf-name]");
    if (!stack) return;
    const value = stack.dataset.sourceShelfName || "";
    setFilters({ q: value });
    const search = document.querySelector("#globalSearch");
    if (search) search.value = value;
    setView("library");
  });
}
