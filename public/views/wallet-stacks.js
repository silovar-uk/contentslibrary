import { $, esc } from "../core/dom.js";
import { state, subscribe, setFilters, setView } from "../core/store.js";
import { isAllowedCoverUrl, coverThumbUrl } from "../core/cover.js";
import { isReadingPriorityEligible, readingPriority } from "./reading-priority.js";

let initialized = false;
let frame = 0;
let observer = null;
const expanded = new Set();

const STACKS = [
  {
    key: "top",
    eyebrow: "NEXT",
    title: "最優先",
    description: "次に手を伸ばしたい作品",
    filter: (work) => isReadingPriorityEligible(work) && readingPriority(work) === "top"
  },
  {
    key: "owned",
    eyebrow: "ON YOUR SHELF",
    title: "積読",
    description: "手元にある、まだ触れていない作品",
    filter: (work) => ["book", "manga"].includes(work?.type) && work.status === "owned_unread"
  },
  {
    key: "want",
    eyebrow: "WISHLIST",
    title: "読みたい",
    description: "いつか手に取りたい作品",
    filter: (work) => ["book", "manga"].includes(work?.type) && work.status === "want"
  }
];

function ensureStyle() {
  if ($('link[href="/styles/wallet-stacks.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/styles/wallet-stacks.css";
  document.head.append(link);
}

export function walletStackWorks(works = [], filter, limit = 5) {
  return works
    .filter(filter)
    .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))
    .slice(0, limit);
}

function coverMarkup(work, index) {
  const cover = work?.metadata?.cover_url;
  const hasCover = cover && isAllowedCoverUrl(cover);
  const offset = index - 2;
  const face = hasCover
    ? `<img src="${esc(coverThumbUrl(cover))}" alt="" loading="lazy" decoding="async">`
    : `<span class="wallet-stack-title-fallback">${esc(work.title)}</span>`;
  return `<button type="button" class="wallet-stack-book ${hasCover ? "has-cover" : "no-cover"}" data-open-work="${esc(work.id)}" style="--stack-index:${index};--stack-offset:${offset};--stack-distance:${Math.abs(offset)}" aria-label="${esc(work.title)}を開く">${face}</button>`;
}

function stackMarkup(config, works, total) {
  const isOpen = expanded.has(config.key);
  const items = works.map(coverMarkup).join("");
  return `<article class="wallet-stack-card ${isOpen ? "is-expanded" : ""}" data-wallet-stack="${esc(config.key)}">
    <button type="button" class="wallet-stack-toggle" data-wallet-stack-toggle="${esc(config.key)}" aria-expanded="${isOpen}">
      <span class="wallet-stack-copy"><small>${esc(config.eyebrow)}</small><strong>${esc(config.title)}</strong><span>${esc(config.description)}</span></span>
      <span class="wallet-stack-count"><b>${total}</b><i aria-hidden="true">${isOpen ? "−" : "+"}</i></span>
    </button>
    <div class="wallet-stack-deck" aria-label="${esc(config.title)}の作品">
      ${items || '<div class="wallet-stack-empty">まだ作品がありません。</div>'}
    </div>
    ${total > works.length ? `<button type="button" class="wallet-stack-more" data-wallet-stack-more="${esc(config.key)}">すべて見る →</button>` : ""}
  </article>`;
}

function ensureSection(home) {
  let section = $("#walletStacks");
  if (section) return section;
  section = document.createElement("section");
  section.id = "walletStacks";
  section.className = "wallet-stacks-section";
  section.setAttribute("aria-labelledby", "walletStacksTitle");
  section.innerHTML = `<div class="wallet-stacks-heading"><div><span>YOUR STACKS</span><h2 id="walletStacksTitle">いまの本の束</h2><p>一覧ではなく、手元にあるまとまりとして眺める。</p></div></div><div id="walletStacksGrid" class="wallet-stacks-grid"></div>`;
  const priority = home.querySelector("#readingPriorityHomeHub");
  const explore = home.querySelector("#editorialExploreGrid");
  if (priority) priority.after(section);
  else if (explore) explore.before(section);
  else home.append(section);
  return section;
}

function renderStacks() {
  const home = $("#homeView");
  if (!home || !state.loaded || state.view !== "home") return;
  const section = ensureSection(home);
  const grid = section.querySelector("#walletStacksGrid");
  const all = Array.from(state.works.values());
  grid.innerHTML = STACKS.map((config) => {
    const matched = all.filter(config.filter);
    const visible = walletStackWorks(matched, () => true, 5);
    return stackMarkup(config, visible, matched.length);
  }).join("");
}

function scheduleRender() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(renderStacks);
}

function openStackInLibrary(key) {
  setView("library");
  if (key === "owned") setFilters({ statuses: ["owned_unread"] });
  if (key === "want") setFilters({ statuses: ["want"] });
  requestAnimationFrame(() => {
    const priority = $("#filterReadingPriority");
    if (priority) {
      priority.value = key === "top" ? "top" : "";
      priority.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
}

export function initWalletStacks() {
  if (initialized) return;
  initialized = true;
  ensureStyle();
  const home = $("#homeView");
  if (home) {
    observer = new MutationObserver(scheduleRender);
    observer.observe(home, { childList: true, subtree: true });
  }
  subscribe(scheduleRender);

  document.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-wallet-stack-toggle]");
    if (toggle) {
      const key = toggle.dataset.walletStackToggle;
      if (expanded.has(key)) expanded.delete(key); else expanded.add(key);
      renderStacks();
      return;
    }
    const more = event.target.closest("[data-wallet-stack-more]");
    if (more) {
      event.preventDefault();
      openStackInLibrary(more.dataset.walletStackMore);
    }
  });

  scheduleRender();
}
