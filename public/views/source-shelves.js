import { esc } from "../core/dom.js";
import { allWorks, setFilters, setView, subscribe } from "../core/store.js";
import { sourceShelfData } from "../core/source-shelf.js";
import { workFaceMarkup } from "../core/work-face.js";

let mode = "label";
let expanded = false;
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

export function renderSourceShelves() {
  const body = document.querySelector('[data-home-zone="explore"] .home-zone-body');
  if (!body) return false;
  let host = document.querySelector("#sourceShelves");
  if (!host) {
    host = document.createElement("section");
    host.id = "sourceShelves";
    host.className = "source-shelves";
    body.prepend(host);
  } else if (body.firstElementChild !== host) {
    body.prepend(host);
  }

  const data = sourceShelfData(allWorks(), mode);
  const visible = expanded ? data : data.slice(0, 12);
  const label = mode === "label" ? "レーベル" : "著者";
  host.innerHTML = `<div class="source-shelves-head"><div><span>FROM YOUR LIBRARY</span><h3>${label}から探す</h3><p>分類を待たず、すでにあるタイトルと著者から棚をつくる。</p></div><div class="source-shelves-tabs" role="tablist" aria-label="棚の切り替え"><button type="button" role="tab" data-source-shelf-mode="label" aria-selected="${mode === "label"}">レーベル</button><button type="button" role="tab" data-source-shelf-mode="creator" aria-selected="${mode === "creator"}">著者</button></div></div>${visible.length ? `<div class="source-shelves-grid">${visible.map(stackMarkup).join("")}</div>${data.length > 12 ? `<button type="button" class="text-button source-shelves-more" data-source-shelf-more>${expanded ? "たたむ" : `もっと見る (${data.length})`}</button>` : ""}` : `<div class="source-shelves-empty">2作品以上まとまる${label}はまだありません。</div>`}`;
  return true;
}

function scheduleRender() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => requestAnimationFrame(renderSourceShelves));
}

export function initSourceShelves() {
  ensureStyle();
  subscribe(scheduleRender);
  document.addEventListener("click", (event) => {
    const modeButton = event.target.closest("[data-source-shelf-mode]");
    if (modeButton) {
      mode = modeButton.dataset.sourceShelfMode === "creator" ? "creator" : "label";
      expanded = false;
      renderSourceShelves();
      return;
    }
    if (event.target.closest("[data-source-shelf-more]")) {
      expanded = !expanded;
      renderSourceShelves();
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
  scheduleRender();
}
