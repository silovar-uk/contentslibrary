import { api } from "./api.js";

const STORAGE_KEY = "contents-library-decision-memory-v1";
const MAX_RECORDS = 30;

function storageOrNull(storage) {
  if (storage) return storage;
  try { return globalThis.localStorage || null; } catch { return null; }
}

function clientEventId(value, workId, slot, decidedAt) {
  const explicit = String(value?.client_event_id || value?.clientEventId || "").trim();
  return explicit || `dm:${workId}:${slot}:${decidedAt}`;
}

export function normalizeDecisionRecord(value) {
  if (!value || typeof value !== "object") return null;
  const workId = String(value.work_id || value.workId || "").trim();
  if (!workId) return null;
  const decidedAtRaw = String(value.decided_at || value.decidedAt || "").trim();
  const parsed = Date.parse(decidedAtRaw);
  const decidedAt = Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
  const slot = ["priority", "remember", "wildcard"].includes(value.slot) ? value.slot : "wildcard";
  return {
    client_event_id: clientEventId(value, workId, slot, decidedAt),
    work_id: workId,
    title: String(value.title || "").trim(),
    creator: String(value.creator || "").trim(),
    slot,
    reason: String(value.reason || "").trim(),
    scope: String(value.scope || "next").trim() || "next",
    decided_at: decidedAt
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

function publishDecisionMemory(entries, record = null) {
  if (typeof document !== "undefined") {
    document.dispatchEvent(new CustomEvent("decision-memory-change", { detail: { record, entries } }));
  }
}

export function writeDecisionMemory(entries = [], storage = null) {
  const target = storageOrNull(storage);
  const normalized = entries.map(normalizeDecisionRecord).filter(Boolean).slice(0, MAX_RECORDS);
  if (target) {
    try { target.setItem(STORAGE_KEY, JSON.stringify(normalized)); } catch {}
  }
  publishDecisionMemory(normalized, normalized[0] || null);
  return normalized;
}

export function recordDecision(record, storage = null) {
  const target = storageOrNull(storage);
  const next = mergeDecisionMemory(readDecisionMemory(target), record);
  if (target) {
    try { target.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  }
  publishDecisionMemory(next, next[0] || null);
  return next[0] || null;
}

export async function syncDecisionMemory({ apiFn = api, storage = null } = {}) {
  const local = readDecisionMemory(storage);
  let data;
  if (local.length) {
    data = await apiFn("/api/decisions/sync", {
      method: "POST",
      body: JSON.stringify({ decisions: local })
    });
  } else {
    data = await apiFn("/api/decisions");
  }
  const decisions = Array.isArray(data?.decisions) ? data.decisions : [];
  return writeDecisionMemory(decisions, storage);
}

export function recordDecisionAndSync(record, { storage = null, apiFn = api } = {}) {
  const saved = recordDecision(record, storage);
  if (!saved) return null;
  void syncDecisionMemory({ apiFn, storage }).catch(() => {});
  return saved;
}

export function recentDecisionIds(options = {}, storage = null) {
  return recentDecisionIdsFrom(readDecisionMemory(storage), options);
}

export const DECISION_MEMORY_KEY = STORAGE_KEY;
