import { api } from "./api.js";
import { normalizeText } from "../shared/normalize.js";
import { GENRE_CATALOG } from "./format.js";

// 全件をメモリに常駐させ、打鍵ごとにサーバー往復せずゼロ待ちで絞り込む。
// フィルタ意味論は src/routes/library-v13.ts の listWorksV13 と揃えてある(サーバー検索と結果が一致するように)。
export const state = {
  me: null,
  works: new Map(), // id -> work(snapshotの1件)
  loaded: false,
  view: "home",
  selectedId: null,
  selected: null, // /api/works/:id のフルレスポンス(work/experiences/notes/relations)
  quickEditOpen: false,
  filters: { q: "", type: "", statuses: [], rating_min: "", rating_exact: "", favorite: "", label: "", has_notes: false, sort: "updated_desc", genreId: "", theme: "" },
  admin: { users: [], security: [] }
};

const listeners = new Set();
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify() {
  for (const fn of listeners) fn();
}

export async function loadSnapshot() {
  const data = await api("/api/library/snapshot");
  state.works.clear();
  for (const work of data.items) state.works.set(String(work.id), work);
  state.loaded = true;
  notify();
}

export function upsertWork(work) {
  if (!work) return;
  state.works.set(String(work.id), work);
  notify();
}

// カード上の★から呼ぶ。詳細パネル用のupdatePreference(detail.js)とは別に、
// 選択中でない作品の評価も更新できるようにする(state.selectedを巻き込まない)。
export async function setWorkRating(workId, rating) {
  const work = state.works.get(String(workId));
  if (!work) return;
  try {
    const data = await api(`/api/works/${encodeURIComponent(workId)}/preferences`, {
      method: "PATCH",
      body: JSON.stringify({ version: Number(work.version), rating })
    });
    upsertWork(data.work);
    if (state.selectedId === String(workId) && state.selected) {
      state.selected = { ...state.selected, work: data.work };
      notify();
    }
    return data.work;
  } catch (error) {
    if (error.status === 409) await loadSnapshot();
    throw error;
  }
}

// 表紙URLの設定・削除(coverUrl=nullで削除)。setWorkRatingと同じ形。
export async function setWorkCover(workId, coverUrl) {
  const work = state.works.get(String(workId));
  if (!work) return;
  try {
    const data = await api(`/api/works/${encodeURIComponent(workId)}/cover`, {
      method: "PATCH",
      body: JSON.stringify({ version: Number(work.version), cover_url: coverUrl })
    });
    upsertWork(data.work);
    if (state.selectedId === String(workId) && state.selected) {
      state.selected = { ...state.selected, work: data.work };
      notify();
    }
    return data.work;
  } catch (error) {
    if (error.status === 409) await loadSnapshot();
    throw error;
  }
}

// カード上の「メモ」開閉状態。一覧・ホームの両方のカードで共有する(同じ作品は同じ開閉状態にする)。
export const openNoteCardIds = new Set();

export function toggleCardNote(workId) {
  if (openNoteCardIds.has(workId)) openNoteCardIds.delete(workId); else openNoteCardIds.add(workId);
  notify();
}

export async function submitCardNote(workId, content) {
  await api(`/api/works/${encodeURIComponent(workId)}/notes`, { method: "POST", body: JSON.stringify({ note_type: "quick", content }) });
  const work = state.works.get(String(workId));
  if (work) upsertWork({ ...work, has_notes: true });
}

export function removeWorkFromStore(id) {
  state.works.delete(String(id));
  if (state.selectedId === id) {
    state.selectedId = null;
    state.selected = null;
  }
  notify();
}

export function setFilters(patch) {
  Object.assign(state.filters, patch);
  notify();
}

export function clearFilters() {
  state.filters = { q: "", type: "", statuses: [], rating_min: "", rating_exact: "", favorite: "", label: "", has_notes: false, sort: "updated_desc", genreId: "", theme: "" };
  notify();
}

export function setView(view) {
  state.view = view;
  notify();
}

export function selectWork(id) {
  state.selectedId = id;
  state.selected = null;
  state.quickEditOpen = false;
  notify();
}

// /api/works/:id はスナップショット専用の計算列(has_notes/experience_count)を持たないSELECT *を返す。
// そのまま素通しすると、詳細を開いただけで一覧側のhas_notesが消える(既存バグ)。
// 同じレスポンスに含まれるnotes/experiencesの件数から都度計算し直すことで、往復なしに正しい値へ揃える。
export function setSelectedDetail(detail) {
  state.selected = detail;
  if (detail?.work) {
    const work = { ...detail.work, has_notes: (detail.notes?.length ?? 0) > 0, experience_count: detail.experiences?.length ?? 0 };
    state.works.set(String(work.id), work);
  }
  notify();
}

export function closeDetail() {
  state.selectedId = null;
  state.selected = null;
  state.quickEditOpen = false;
  notify();
}

export function toggleQuickEdit(open) {
  state.quickEditOpen = open === undefined ? !state.quickEditOpen : open;
  notify();
}

export function emit() {
  notify();
}

function genreMatchesId(genreName, genreId) {
  if (genreId === "unclassified") return false; // 呼び出し側で「genre配列が空」を別途判定する
  const canonical = GENRE_CATALOG.find((g) => g.id === genreId);
  if (!canonical) return false;
  if (genreId === "other") {
    const known = new Set(GENRE_CATALOG.map((g) => g.name));
    return !known.has(genreName) || genreName === "その他";
  }
  return genreName === canonical.name;
}

function matchesFilters(work, filters) {
  if (filters.type && work.type !== filters.type) return false;

  if (filters.statuses.length) {
    if (!filters.statuses.includes(work.status)) return false;
  }

  if (filters.genreId) {
    const primary = work.labels?.genre?.[0] || null;
    if (filters.genreId === "unclassified") {
      if (primary) return false;
    } else if (!primary || !genreMatchesId(primary, filters.genreId)) {
      return false;
    }
  }

  if (filters.rating_exact) {
    if (filters.rating_exact === "unrated") {
      if (work.rating != null) return false;
    } else if (Math.round(Number(work.rating)) !== Number(filters.rating_exact)) {
      return false;
    }
  } else if (filters.rating_min) {
    if (!(Number(work.rating) >= Number(filters.rating_min))) return false;
  }

  if (filters.favorite === "true" && work.metadata?.favorite !== true) return false;
  if (filters.favorite === "false" && work.metadata?.favorite === true) return false;

  if (filters.theme && !(work.labels?.theme || []).includes(filters.theme)) return false;

  if (filters.label) {
    const terms = filters.label.split(/[、,]/).map((t) => normalizeText(t.trim())).filter(Boolean);
    const names = [...(work.labels?.genre || []), ...(work.labels?.theme || []), ...(work.labels?.tag || [])].map(normalizeText);
    for (const term of terms) {
      if (!names.some((name) => name.includes(term))) return false;
    }
  }

  if (filters.has_notes && !work.has_notes) return false;

  if (filters.q) {
    const tokens = Array.from(new Set(normalizeText(filters.q).split(" ").filter(Boolean)));
    const haystack = work.search_text || "";
    for (const token of tokens) {
      if (!haystack.includes(token)) return false;
    }
  }

  return true;
}

const SORTERS = {
  updated_desc: (a, b) => String(b.updated_at).localeCompare(String(a.updated_at)),
  title_asc: (a, b) => String(a.title).localeCompare(String(b.title), "ja"),
  rating_desc: (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || String(b.updated_at).localeCompare(String(a.updated_at)),
  rating_asc: (a, b) => (a.rating ?? 999) - (b.rating ?? 999) || String(b.updated_at).localeCompare(String(a.updated_at)),
  favorite_first: (a, b) => Number(b.metadata?.favorite === true) - Number(a.metadata?.favorite === true) || SORTERS.rating_desc(a, b),
  created_desc: (a, b) => String(b.updated_at).localeCompare(String(a.updated_at))
};

export function filteredWorks() {
  const list = Array.from(state.works.values()).filter((work) => matchesFilters(work, state.filters));
  const sorter = SORTERS[state.filters.sort] || SORTERS.updated_desc;
  return list.sort(sorter);
}

export function allWorks() {
  return Array.from(state.works.values());
}

const SHELF_SCOPE_PREDICATE = {
  all: () => true,
  unread: (w) => w.status === "want" || w.status === "owned_unread",
  active: (w) => w.status === "active",
  completed: (w) => w.status === "completed",
  favorite: (w) => w.metadata?.favorite === true
};

// src/routes/genre-insights-v15.ts のクライアント側版。全件常駐しているため
// サーバー往復なしでジャンル棚を計算できる(探すのゼロ待ち化)。
export function shelfData(scope = "all") {
  const predicate = SHELF_SCOPE_PREDICATE[scope] || SHELF_SCOPE_PREDICATE.all;
  const rows = allWorks().filter(predicate);
  const buckets = new Map();
  let unclassified = 0;
  for (const work of rows) {
    const primary = work.labels?.genre?.[0] || null;
    if (!primary) { unclassified += 1; continue; }
    const catalogEntry = GENRE_CATALOG.find((g) => g.name === primary) || GENRE_CATALOG.find((g) => g.id === "other");
    const bucket = buckets.get(catalogEntry.id) || { id: catalogEntry.id, name: catalogEntry.name, color: catalogEntry.color, count: 0, favoriteCount: 0, ratingTotal: 0, ratedCount: 0 };
    bucket.count += 1;
    if (work.metadata?.favorite === true) bucket.favoriteCount += 1;
    if (work.rating != null) { bucket.ratingTotal += Number(work.rating); bucket.ratedCount += 1; }
    buckets.set(catalogEntry.id, bucket);
  }
  const total = rows.length;
  const catalogOrder = new Map(GENRE_CATALOG.map((g, i) => [g.id, i]));
  const genres = Array.from(buckets.values())
    .map((b) => ({
      id: b.id, name: b.name, color: b.color, count: b.count,
      share: total > 0 ? b.count / total : 0,
      favorite_count: b.favoriteCount,
      average_rating: b.ratedCount > 0 ? Math.round((b.ratingTotal / b.ratedCount) * 10) / 10 : null
    }))
    .sort((a, b) => b.count - a.count || (catalogOrder.get(a.id) ?? 999) - (catalogOrder.get(b.id) ?? 999));
  return { scope, total, classified: total - unclassified, unclassified, genres };
}

function hasCover(work) {
  return Boolean(String(work?.metadata?.cover_url || "").trim());
}

export const RANDOM_PICK_SCOPES = [
  { value: "next", label: "所持・未読＋読みたい" },
  { value: "owned_unread", label: "所持・未読だけ" },
  { value: "want", label: "読みたい本だけ" },
  { value: "book", label: "すべての本" },
  { value: "has_cover", label: "表紙あり" },
  { value: "no_cover", label: "表紙なし" },
  { value: "all", label: "すべての作品" }
];

const RANDOM_PICK_PREDICATE = {
  next: (w) => w.type === "book" && ["owned_unread", "want"].includes(w.status),
  owned_unread: (w) => w.type === "book" && w.status === "owned_unread",
  want: (w) => w.type === "book" && w.status === "want",
  book: (w) => w.type === "book",
  has_cover: (w) => hasCover(w),
  no_cover: (w) => !hasCover(w),
  all: () => true
};

export function randomScopeCounts() {
  const works = allWorks();
  return Object.fromEntries(RANDOM_PICK_SCOPES.map(({ value }) => [value, works.filter(RANDOM_PICK_PREDICATE[value]).length]));
}

// 全件常駐のため、ホームの自動抽選もサーバー往復なしでクライアント側から選ぶ(待ち時間ゼロ)。
// 除外込みで母数が足りない場合は、直近履歴を無視して母数いっぱいから選び直す(空表示を避ける)。
export function pickRandomWorks(scope = "next", count = 5, excludeIds = []) {
  const predicate = RANDOM_PICK_PREDICATE[scope] || RANDOM_PICK_PREDICATE.next;
  const pool = allWorks().filter(predicate);
  const excluded = new Set(excludeIds.map(String));
  const fresh = pool.filter((w) => !excluded.has(String(w.id)));
  const source = fresh.length >= Math.min(count, pool.length) ? fresh : pool;
  return [...source].sort(() => Math.random() - 0.5).slice(0, count);
}

// ジャンル棚とは別に、テーマ(1作品が複数持つ)は先頭1件だけを見ずに全件をカウントする。
export function themeData(scope = "all") {
  const predicate = SHELF_SCOPE_PREDICATE[scope] || SHELF_SCOPE_PREDICATE.all;
  const counts = new Map();
  for (const work of allWorks().filter(predicate)) {
    for (const name of work.labels?.theme || []) counts.set(name, (counts.get(name) || 0) + 1);
  }
  return Array.from(counts, ([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ja"));
}
