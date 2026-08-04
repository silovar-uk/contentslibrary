import { $, $$, esc, fmtDate } from "../core/dom.js";
import { statusLabel } from "../core/format.js";
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

function mountRecentBooksSection() {
  if ($("#recentlyEditedBooksSection")) return;
  const randomStage = $("#randomStage");
  if (!randomStage) return;
  const section = document.createElement("section");
  section.id = "recentlyEditedBooksSection";
  section.className = "recent-books-section";
  section.setAttribute("aria-labelledby", "recentlyEditedBooksTitle");
  section.innerHTML = `
    <div class="home-feature-heading">
      <div>
        <p class="shelf-kicker">RECENTLY UPDATED</p>
        <h2 id="recentlyEditedBooksTitle">最近編集した本</h2>
        <p>手を入れたばかりの5冊を、新しい順に。</p>
      </div>
      <button type="button" class="text-button" data-mobile-view="library">作品一覧を見る →</button>
    </div>
    <div id="recentlyEditedBooks" class="recent-book-grid" aria-live="polite"></div>`;
  randomStage.after(section);
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

function recentBookMarkup(work) {
  const genre = work.labels?.genre?.[0] || "未分類";
  const updatedAt = work.updated_at || work.created_at || "";
  return `<article class="recent-book-card">
    <button type="button" class="recent-book-main" data-open-work="${esc(work.id)}">
      ${coverMarkup(work, "recent")}
      <span class="recent-book-copy">
        <span class="recent-book-meta"><span>${esc(genre)}</span><time datetime="${esc(updatedAt)}">${esc(fmtDate(updatedAt))}</time></span>
        <strong>${esc(work.title)}</strong>
        <small>${esc(work.creator || "著者・作者未設定")}</small>
        <em>${esc(statusLabel(work.type, work.status))}</em>
      </span>
    </button>
  </article>`;
}

function recentBooks() {
  return Array.from(state.works.values())
    .filter((work) => work.type === "book")
    .sort((a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")))
    .slice(0, 5);
}

function renderRecentBooks() {
  mountRecentBooksSection();
  const target = $("#recentlyEditedBooks");
  if (!target) return;
  if (!state.loaded) {
    target.innerHTML = Array.from({ length: 5 }, () => '<article class="recent-book-card recent-book-skeleton"><span class="skeleton-line"></span><span class="skeleton-line is-title"></span><span class="skeleton-line is-short"></span></article>').join("");
    return;
  }
  const books = recentBooks();
  target.innerHTML = books.length
    ? books.map(recentBookMarkup).join("")
    : '<div class="empty-state recent-books-empty">本を追加・編集すると、ここに新しい順で5冊表示されます。</div>';
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
  renderRecentBooks();
  queueMicrotask(decorateRandomCards);
}

export function initHomeExperience() {
  if (initialized) return;
  initialized = true;
  ensureStyle();
  mountRecentBooksSection();
  observeRandomStage();
  subscribe(refreshHomeExperience);
  requestAnimationFrame(refreshHomeExperience);
}
