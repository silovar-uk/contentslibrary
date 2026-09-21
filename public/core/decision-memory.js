const STORAGE_KEY = "contents-library-decision-memory-v1";
const MAX_RECORDS = 30;

function storageOrNull(storage) {
  if (storage) return storage;
  try { return globalThis.localStorage || null; } catch { return null; }
}

export function normalizeDecisionRecord(value) {
  if (!value || typeof value !== "object") return null;
  const workId = String(value.work_id || value.workId || "").trim();
  if (!workId) return null;
  const decidedAt = String(value.decided_at || value.decidedAt || "").trim();
  const parsed = Date.parse(decidedAt);
  return {
    work_id: workId,
    title: String(value.title || "").trim(),
    creator: String(value.creator || "").trim(),
    slot: ["priority", "remember", "wildcard"].includes(value.slot) ? value.slot : "wildcard",
    reason: String(value.reason || "").trim(),
    scope: String(value.scope || "next").trim() || "next",
    decided_at: Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString()
  };
}

export function mergeDecisionMemory(entries = [], next, max = MAX_RECORDS) {
  const normalized = normalizeDecisionRecord(next);
  if (!normalized) return entries.map(normalizeDecisionRecord).filter(Boolean).slice(0, max);
  return [
    normalized,
    ...entries.map(normalizeDecisionRecord).filter(Boolean)
  ].slice(0, Math.max(1, Number(max) || MAX_RECORDS));
}

export function recentDecisionIdsFrom(
  entries = [],
  { withinDays = 30, max = 12, now = Date.now() } = {}
) {
  const cutoff = now - Math.max(0, Number(withinDays) || 0) * 24 * 60 * 60 * 1000;
  const ids = [];
  const seen = new Set();
  for (const raw of entries) {
    const item = normalizeDecisionRecord(raw);
    if (!item) continue;
    const when = Date.parse(item.decided_at);
    if (!Number.isFinite(when) || when < cutoff) continue;
    if (seen.has(item.work_id)) continue;
    seen.add(item.work_id);
    ids.push(item.work_id);
    if (ids.length >= max) break;
  }
  return ids;
}

export function readDecisionMemory(storage = null) {
  const target = storageOrNull(storage);
  if (!target) return [];
  try {
    const value = JSON.parse(target.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value.map(normalizeDecisionRecord).filter(Boolean).slice(0, MAX_RECORDS) : [];
  } catch {
    return [];
  }
}

export function recordDecision(record, storage = null) {
  const target = storageOrNull(storage);
  const next = mergeDecisionMemory(readDecisionMemory(target), record);
  if (target) {
    try { target.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  }
  if (typeof document !== "undefined") {
    document.dispatchEvent(new CustomEvent("decision-memory-change", { detail: { record: next[0], entries: next } }));
  }
  return next[0] || null;
}

export function recentDecisionIds(options = {}, storage = null) {
  return recentDecisionIdsFrom(readDecisionMemory(storage), options);
}

export const DECISION_MEMORY_KEY = STORAGE_KEY;
