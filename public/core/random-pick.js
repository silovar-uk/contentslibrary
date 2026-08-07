import { allWorks } from "./store.js";

const PRIORITY_WEIGHT = {
  top: 5,
  high: 4,
  medium: 3,
  low: 2
};

function hasCover(work) {
  return Boolean(String(work?.metadata?.cover_url || "").trim());
}

const SCOPE_PREDICATE = {
  next: (w) => w.type === "book" && ["owned_unread", "want"].includes(w.status),
  owned_unread: (w) => w.type === "book" && w.status === "owned_unread",
  want: (w) => w.type === "book" && w.status === "want",
  book: (w) => w.type === "book",
  has_cover: (w) => hasCover(w),
  no_cover: (w) => !hasCover(w),
  all: () => true
};

export function normalizeRandomMode(mode) {
  return mode === "priority" ? "priority" : "random";
}

export function randomPriorityWeight(work) {
  const eligible = ["book", "manga"].includes(work?.type) && ["want", "owned_unread"].includes(work?.status);
  if (!eligible) return 1;
  return PRIORITY_WEIGHT[String(work?.metadata?.reading_priority || "")] || 1;
}

function uniformSample(source, count, rng) {
  const rows = [...source];
  for (let i = rows.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  return rows.slice(0, count);
}

function weightedSample(source, count, rng) {
  const rows = [...source];
  const picked = [];
  while (rows.length && picked.length < count) {
    const weights = rows.map(randomPriorityWeight);
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let point = rng() * total;
    let index = rows.length - 1;
    for (let i = 0; i < rows.length; i += 1) {
      point -= weights[i];
      if (point < 0) { index = i; break; }
    }
    picked.push(rows.splice(index, 1)[0]);
  }
  return picked;
}

export function sampleRandomWorks(source, count = 5, mode = "random", rng = Math.random) {
  const limit = Math.max(0, Math.min(Number(count) || 0, source.length));
  return normalizeRandomMode(mode) === "priority"
    ? weightedSample(source, limit, rng)
    : uniformSample(source, limit, rng);
}

// 「純粋ランダム」と「読む優先度を確率へ反映」の2モードを同じ棚条件で使う。
// 直近抽選の除外ルールは両モード共通。母数が足りなければ全候補へ戻す。
export function pickRandomWorks(scope = "next", count = 5, excludeIds = [], mode = "random", rng = Math.random) {
  const predicate = SCOPE_PREDICATE[scope] || SCOPE_PREDICATE.next;
  const pool = allWorks().filter(predicate);
  const excluded = new Set(excludeIds.map(String));
  const fresh = pool.filter((work) => !excluded.has(String(work.id)));
  const source = fresh.length >= Math.min(count, pool.length) ? fresh : pool;
  return sampleRandomWorks(source, count, mode, rng);
}
