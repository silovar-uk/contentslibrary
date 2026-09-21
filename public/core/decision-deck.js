const SLOT_ORDER = ["priority", "remember", "wildcard"];

const PRIORITY_RANK = {
  top: 4,
  high: 3,
  medium: 2,
  low: 1
};

const PRIORITY_LABEL = {
  top: "最優先",
  high: "高",
  medium: "中",
  low: "低"
};

function randomOne(rows, rng) {
  if (!rows.length) return null;
  return rows[Math.min(rows.length - 1, Math.floor(rng() * rows.length))];
}

function timestamp(work) {
  const raw = work?.updated_at || work?.created_at || "";
  const value = Date.parse(raw);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function daysSince(value, now) {
  const parsed = Date.parse(value || "");
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor((now - parsed) / (24 * 60 * 60 * 1000)));
}

function priorityValue(work) {
  const value = String(work?.metadata?.reading_priority || "");
  return Object.hasOwn(PRIORITY_RANK, value) ? value : "";
}

function preferFresh(source, historyIds) {
  const fresh = source.filter((work) => !historyIds.has(String(work.id)));
  return fresh.length ? fresh : source;
}

function priorityPick(source, historyIds, rng) {
  if (!source.length) return null;
  const ranked = source.map((work) => ({ work, value: priorityValue(work) }));
  const best = Math.max(0, ...ranked.map(({ value }) => PRIORITY_RANK[value] || 0));
  const bestRank = ranked.filter(({ value }) => (PRIORITY_RANK[value] || 0) === best).map(({ work }) => work);
  return randomOne(preferFresh(bestRank, historyIds), rng);
}

function rememberPick(source, historyIds, rng) {
  if (!source.length) return null;
  const preferred = preferFresh(source, historyIds);
  const dated = preferred.filter((work) => Number.isFinite(timestamp(work)));
  if (!dated.length) return randomOne(preferred, rng);
  const oldest = Math.min(...dated.map(timestamp));
  return randomOne(dated.filter((work) => timestamp(work) === oldest), rng);
}

function reasonFor(slot, work, now) {
  if (slot === "priority") {
    const value = priorityValue(work);
    return value ? `読む優先度「${PRIORITY_LABEL[value]}」` : "優先度未設定から選出";
  }
  if (slot === "remember") {
    const raw = work?.updated_at || work?.created_at || "";
    const days = daysSince(raw, now);
    if (days == null) return "しばらく触れていない候補";
    if (work?.updated_at) return days === 0 ? "今日更新した作品" : `最終更新から${days}日`;
    return days === 0 ? "今日登録した作品" : `登録から${days}日`;
  }
  return "この棚から完全ランダム";
}

function slotPick(slot, source, historyIds, rng) {
  if (slot === "priority") return priorityPick(source, historyIds, rng);
  if (slot === "remember") return rememberPick(source, historyIds, rng);
  return randomOne(preferFresh(source, historyIds), rng);
}

function sourceForSlot(pool, usedIds) {
  return pool.filter((work) => !usedIds.has(String(work.id)));
}

export function buildDecisionDeck(
  pool = [],
  {
    current = [],
    keptIds = [],
    historyIds = [],
    rng = Math.random,
    now = Date.now()
  } = {}
) {
  const rows = pool.filter(Boolean);
  const byId = new Map(rows.map((work) => [String(work.id), work]));
  const kept = new Set([...keptIds].map(String));
  const history = new Set([...historyIds].map(String));
  const currentBySlot = new Map(current.map((candidate) => [candidate.slot, candidate]));
  const used = new Set();
  const result = [];

  for (const slot of SLOT_ORDER) {
    const existing = currentBySlot.get(slot);
    if (!existing || !kept.has(String(existing.id))) continue;
    const work = byId.get(String(existing.id));
    if (!work || used.has(String(work.id))) continue;
    used.add(String(work.id));
    result.push({
      slot,
      id: String(work.id),
      reason: reasonFor(slot, work, now),
      kept: true
    });
  }

  for (const slot of SLOT_ORDER) {
    if (result.some((candidate) => candidate.slot === slot)) continue;
    const source = sourceForSlot(rows, used);
    const work = slotPick(slot, source, history, rng);
    if (!work) continue;
    used.add(String(work.id));
    result.push({
      slot,
      id: String(work.id),
      reason: reasonFor(slot, work, now),
      kept: false
    });
  }

  return SLOT_ORDER.map((slot) => result.find((candidate) => candidate.slot === slot)).filter(Boolean);
}

export const DECISION_SLOT_LABELS = {
  priority: "PRIORITY",
  remember: "REMEMBER",
  wildcard: "WILD CARD"
};
