import { $ } from "../core/dom.js";
import { state, subscribe } from "../core/store.js";

let initialized = false;
let renderQueued = false;

function ensureStyle() {
  if ($('link[href="/styles/amazon-title-search.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/styles/amazon-title-search.css";
  document.head.append(link);
}

export function amazonTitleSearchUrl(title) {
  const params = new URLSearchParams({
    k: String(title || "").trim(),
    i: "stripbooks"
  });
  return `https://www.amazon.co.jp/s?${params.toString()}`;
}

function renderAmazonTitleSearch() {
  renderQueued = false;
  const panel = $("#detailPanel");
  if (!panel) return;

  const work = state.selected?.work;
  const existing = $("[data-amazon-title-search]", panel);
  if (!work || work.type !== "book" || !String(work.title || "").trim()) {
    existing?.remove();
    return;
  }

  const coverSection = $(".cover-section", panel);
  if (!coverSection) return;

  const href = amazonTitleSearchUrl(work.title);
  const label = `${work.title}をAmazonで検索（新しいタブ）`;
  if (existing) {
    existing.href = href;
    existing.setAttribute("aria-label", label);
    return;
  }

  const link = document.createElement("a");
  link.className = "secondary-button amazon-title-search-link";
  link.dataset.amazonTitleSearch = "";
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.setAttribute("aria-label", label);
  link.textContent = "Amazonでタイトル検索 ↗";

  const form = $("[data-cover-form]", coverSection);
  if (form) form.before(link);
  else coverSection.append(link);
}

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  queueMicrotask(renderAmazonTitleSearch);
}

export function initAmazonTitleSearch() {
  if (initialized) return;
  initialized = true;
  ensureStyle();
  subscribe(queueRender);
  requestAnimationFrame(queueRender);
}
