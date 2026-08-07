import { $, $$, esc, toast, fmtDate, skeletonCards, skeletonShelf } from "../core/dom.js";
import { api } from "../core/api.js";
import { TYPE_LABELS, statusLabel, cardRatingMarkup, cardNoteMarkup } from "../core/format.js";
import { state, shelfData, themeData, subscribe, setView, openNoteCardIds } from "../core/store.js";
import { pickRandomWorks } from "../core/random-pick.js";
import { getRandomMode, initRandomMode } from "./random-mode.js";
import { shelfNavigateToGenre, shelfClearGenreFilter, themeNavigate } from "./library.js";

let homeData = null;
let shelfScope = "all";
let shelfExpanded = false;
let activeShelfFilter = null;
let themeExpanded = false;
let randomPickIds = []; // ★を押しても顔ぶれが変わらないよう、IDだけ保持し表示のたびstate.worksから引く

const RANDOM_HISTORY_KEY = "sakuhin-log-random-history-v2";
function previousRandomIds() {
  try { const v = JSON.parse(localStorage.getItem(RANDOM_HISTORY_KEY) || "[]"); return Array.isArray(v) ? v.slice(0, 9) : []; } catch { return []; }
}
function rememberRandom(ids) {
  const merged = [...ids, ...previousRandomIds().filter((v) => !ids.includes(v))].slice(0, 9);
  localStorage.setItem(RANDOM_HISTORY_KEY, JSON.stringify(merged));
}

function randomPickMarkup(work) {
  const genre = work.labels?.genre?.[0] || "未分類";
  const canStart = work.type === "book" && ["want", "owned_unread"].includes(work.status);
  return `<article class="random-pick-card">
    <button type="button" class="random-pick-main" data-open-work="${esc(work.id)}">
      <span class="genre-badge">${esc(genre)}</span>
      <h3>${esc(work.title)}</h3>
      <p class="random-pick-creator">${esc(work.creator || "作者情報なし")}</p>
      <p class="random-pick-status">${esc(statusLabel(work.type, work.status))}</p>
    </button>
    ${canStart ? `<button type="button" class="text-button" data-random-start="${esc(work.id)}" data-version="${Number(work.version)}">読み始める</button>` : ""}
    ${cardRatingMarkup(work)}
    ${cardNoteMarkup(work, openNoteCardIds.has(work.id))}
  </article>`;
}

// randomPickIdsが指すIDをstate.worksから引き直して描画するだけの関数。抽選のやり直しはしない。
// renderHome()の末尾から呼ぶことで、表示中(state.view==="home")のときだけ動く一括描画に乗せる。
function renderRandomPicks() {
  const stage = $("#randomStage");
  if (!state.loaded) { stage.innerHTML = `<div class="random-pick-grid">${skeletonCards(5)}</div>`; return; }
  const picks = randomPickIds.map((id) => state.works.get(id)).filter(Boolean);
  stage.innerHTML = picks.length
    ? `<div class="random-pick-grid">${picks.map(randomPickMarkup).join("")}</div>`
    : '<div class="random-empty">この棚には候補がありません。抽選する棚を切り替えるか、作品を追加してください。</div>';
}

// ホーム表示のたびに呼ばれるrenderHome()と違い、抽選のやり直しは初回読み込みと
// 「引き直す」を押したときだけ行う。★の変更などstate全体のnotifyに反応してしまうと、
// そのたびに5冊の顔ぶれが変わってしまうため。
export function drawRandomPicks() {
  const scope = $("#randomScope").value;
  const mode = getRandomMode();
  randomPickIds = pickRandomWorks(scope, 5, previousRandomIds(), mode).map((w) => String(w.id));
  if (randomPickIds.length) rememberRandom(randomPickIds);
  renderRandomPicks();
}

async function startFromRandom(button) {
  const id = button.dataset.randomStart;
  const version = Number(button.dataset.version);
  button.disabled = true;
  try {
    const data = await api(`/api/works/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ version, status: "active" }) });
    if (data.work) state.works.set(String(data.work.id), data.work);
    button.textContent = "読み始めました";
    toast("読書中に変更しました。");
  } catch (error) { button.disabled = false; toast(error.message, "error"); }
}

function shelfItemMarkup(genre, maxCount, index) {
  const percent = Math.round((genre.share || 0) * 100);
  const spineCount = Math.max(2, Math.min(8, Math.round(2 + Math.sqrt(genre.count / maxCount) * 6)));
  const span = genre.count / maxCount >= 0.72 ? 4 : genre.count / maxCount >= 0.38 ? 3 : 2;
  const spines = Array.from({ length: spineCount }, () => "<i></i>").join("");
  return `<button type="button" class="shelf-item ${index >= 6 ? "is-secondary" : ""}" data-genre-id="${esc(genre.id)}" style="--genre-color:${esc(genre.color)};--shelf-span:${span}">
    <span class="spines">${spines}</span>
    <span class="shelf-item-copy"><strong>${esc(genre.name)}</strong><small>${genre.count}作品・${percent}%</small></span>
  </button>`;
}

function renderShelf() {
  const body = $("#shelfBody");
  const summary = $("#shelfSummary");
  if (!state.loaded) { summary.innerHTML = ""; body.innerHTML = `<div class="shelf-grid">${skeletonShelf(8)}</div>`; return; }
  const data = shelfData(shelfScope);
  summary.innerHTML = `<span><strong>${data.total}</strong>対象作品</span><span><strong>${data.classified}</strong>分類済み</span><span><strong>${data.unclassified}</strong>未分類</span>`;
  const maxCount = Math.max(1, ...data.genres.map((g) => g.count));
  const items = data.genres.map((g, i) => shelfItemMarkup(g, maxCount, i)).join("");
  const unclassifiedItem = data.unclassified
    ? `<button type="button" class="shelf-item is-unclassified" data-genre-id="unclassified" style="--genre-color:#858681;--shelf-span:2"><span class="spines"><i></i><i></i></span><span class="shelf-item-copy"><strong>未分類</strong><small>${data.unclassified}作品・整理前の棚</small></span></button>`
    : "";
  body.innerHTML = items || unclassifiedItem
    ? `<div class="shelf-grid ${shelfExpanded ? "is-expanded" : ""}">${items}${unclassifiedItem}</div><button type="button" class="shelf-expand" data-shelf-expand>${shelfExpanded ? "棚をたたむ" : "ほかの棚も見る"}</button>`
    : '<div class="shelf-empty">この条件の作品はまだありません。</div>';
  $$("[data-shelf-scope]").forEach((btn) => btn.setAttribute("aria-selected", String(btn.dataset.shelfScope === shelfScope)));
}

function themeChipMarkup(theme) {
  return `<button type="button" class="theme-chip" data-theme-name="${esc(theme.name)}"><strong>${esc(theme.name)}</strong><small>${theme.count}</small></button>`;
}

function renderThemeShelf() {
  const body = $("#themeShelfBody");
  if (!body) return;
  if (!state.loaded) {
    body.innerHTML = `<div class="theme-chip-grid">${Array.from({ length: 6 }, () => '<div class="skeleton-line" style="width:80px;height:28px;border-radius:999px"></div>').join("")}</div>`;
    return;
  }
  const themes = themeData("all");
  if (!themes.length) { body.innerHTML = '<div class="shelf-empty">テーマが設定された作品はまだありません。</div>'; return; }
  const visible = themeExpanded ? themes : themes.slice(0, 12);
  const items = visible.map(themeChipMarkup).join("");
  const canExpand = themes.length > 12;
  body.innerHTML = `<div class="theme-chip-grid">${items}</div>${canExpand ? `<button type="button" class="shelf-expand" data-theme-expand>${themeExpanded ? "テーマをたたむ" : "ほかのテーマも見る"}</button>` : ""}`;
}

function renderShelfFilterChip() {
  const chip = $("#shelfFilterChip");
  if (!activeShelfFilter) { chip.hidden = true; chip.innerHTML = ""; return; }
  chip.hidden = false;
  chip.innerHTML = `<span>棚から絞り込み：<strong>${esc(activeShelfFilter.name)}</strong></span><button type="button" data-clear-shelf-filter aria-label="解除">×</button>`;
}

function shelfScopeStatuses(scope) {
  if (scope === "unread") return ["want", "owned_unread"];
  if (scope === "active") return ["active"];
  if (scope === "completed") return ["completed"];
  return [];
}

export function renderHome() {
  if (state.view !== "home") return; // 非表示ビューの再描画はしない
  const h = homeData || {};
  // ★はstate.worksを直接更新する(home.jsのデータはloadHome時点のスナップショット)ため、
  // 描画のたびにstate.worksから引き直して最新の評価を表示する。
  $("#readingStrip").innerHTML = (h.reading || []).length
    ? h.reading.map((item) => state.works.get(String(item.id)) || item).map((work) => `
    <article class="reading-card" data-work-id="${esc(work.id)}">
      <button type="button" class="reading-card-main" data-open-work="${esc(work.id)}">
        <div class="type-status"><span class="type-pill">${TYPE_LABELS[work.type]}</span><span>${statusLabel(work.type, work.status)}</span></div>
        <h3>${esc(work.title)}</h3><div class="creator">${esc(work.creator || "")}</div>
        <p class="short-note">${esc(work.short_note || "一言メモはまだありません。")}</p>
        ${work.progress_total ? `<div class="progress-track"><span style="width:${Math.min(100, Math.max(0, ((work.progress_current || 0) / work.progress_total) * 100))}%"></span></div>` : ""}
      </button>
      ${cardRatingMarkup(work)}
    </article>`).join("")
    : '<div class="empty-state">現在読書中の本はありません。<br><button class="text-button" data-action="open-work-dialog">本を追加する</button></div>';

  $("#recentNotes").innerHTML = (h.recentNotes || []).length
    ? h.recentNotes.map((n) => `<button class="note-item" data-open-work="${esc(n.work_id)}"><time>${fmtDate(n.updated_at)}</time><strong>${esc(n.title)}</strong><p>${esc(n.content).slice(0, 150)}</p></button>`).join("")
    : '<div class="empty-state">読書メモはまだありません。</div>';

  $("#recentOther").innerHTML = (h.recentOther || []).length
    ? h.recentOther.map((w) => `<button class="compact-item" data-open-work="${esc(w.id)}"><span class="type-pill">${TYPE_LABELS[w.type]}</span><span><strong>${esc(w.title)}</strong><p>${esc(w.short_note || statusLabel(w.type, w.status))}</p></span><time>${fmtDate(w.updated_at)}</time></button>`).join("")
    : '<div class="empty-state">映画・漫画・アニメの記録はまだありません。</div>';

  const s = h.stats || {};
  $("#statsBar").innerHTML = [["全作品", s.total || 0], ["読了した本", s.completed_books || 0], ["進行中", s.active_count || 0], ["停止・中断", s.stopped_count || 0]]
    .map(([label, value]) => `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`).join("");

  const banner = $("#securityBanner");
  if (h.openSecurityCount > 0) { banner.hidden = false; banner.innerHTML = `<strong>要確認のセキュリティイベントが ${h.openSecurityCount} 件あります。</strong> <button class="text-button" data-action="open-admin">確認する →</button>`; }
  else banner.hidden = true;

  renderShelf();
  renderShelfFilterChip();
  renderThemeShelf();
  renderRandomPicks(); // 抽選のやり直しはしない。★・メモ変更時の表示更新だけをここに乗せる
}

export async function loadHome() {
  homeData = await api("/api/home");
  renderHome();
}

async function setupNotionImport() {
  if (!["owner", "admin"].includes(state.me?.role)) return;
  const card = $("#notionImportCard");
  card.hidden = false;
  const status = $("#notionImportStatus");
  const button = $("#notionImportButton");
  async function refresh() {
    try {
      const data = await api("/api/admin/notion-import");
      status.textContent = `${data.available}件中 ${data.imported}件を取り込み済み。残り ${data.remaining}件。`;
      button.disabled = data.remaining === 0;
      button.textContent = data.remaining === 0 ? "取り込み済み" : "Notionから取り込む";
    } catch (error) { status.textContent = error.message; button.disabled = true; }
  }
  button.addEventListener("click", async () => {
    if (!confirm("Notionの最新20件を作品一覧へ取り込みます。すでに取り込んだ項目は自動でスキップします。")) return;
    button.disabled = true;
    button.textContent = "取り込み中…";
    const result = $("#notionImportResult");
    try {
      const data = await api("/api/admin/notion-import", { method: "POST", body: "{}" });
      result.textContent = `${data.inserted}件追加、${data.skipped}件スキップしました。`;
      await refresh();
      document.dispatchEvent(new CustomEvent("app:reload-snapshot"));
    } catch (error) { result.textContent = error.message; button.disabled = false; button.textContent = "Notionから取り込む"; }
  });
  await refresh();
}

export function initHome() {
  // renderHome()は末尾でrenderShelf/renderThemeShelfも呼ぶため、個別の購読は不要(二重描画を避ける)。
  subscribe(renderHome);
  initRandomMode();
  document.addEventListener("random-mode-change", drawRandomPicks);
  $("#randomScope").addEventListener("change", drawRandomPicks);
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-action='draw-random']")) { event.preventDefault(); drawRandomPicks(); return; }
    const start = event.target.closest("[data-random-start]");
    if (start) { event.preventDefault(); void startFromRandom(start); return; }

    const scope = event.target.closest("[data-shelf-scope]")?.dataset.shelfScope;
    if (scope) { shelfScope = scope; shelfExpanded = false; renderShelf(); return; }
    if (event.target.closest("[data-shelf-expand]")) { shelfExpanded = !shelfExpanded; renderShelf(); return; }
    const genreButton = event.target.closest("[data-genre-id]");
    if (genreButton) {
      const genreId = genreButton.dataset.genreId;
      const data = shelfData(shelfScope);
      const name = genreId === "unclassified" ? "未分類" : data.genres.find((g) => g.id === genreId)?.name || genreId;
      activeShelfFilter = { name, genreId };
      renderShelfFilterChip();
      shelfNavigateToGenre(genreId, shelfScopeStatuses(shelfScope), shelfScope === "favorite");
      return;
    }
    if (event.target.closest("[data-clear-shelf-filter]")) {
      activeShelfFilter = null;
      renderShelfFilterChip();
      shelfClearGenreFilter();
    }

    if (event.target.closest("[data-theme-expand]")) { themeExpanded = !themeExpanded; renderThemeShelf(); return; }
    const themeButton = event.target.closest("[data-theme-name]");
    if (themeButton) { themeNavigate(themeButton.dataset.themeName); return; }
  });
  void setupNotionImport();
}
