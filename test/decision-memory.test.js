import assert from "node:assert/strict";
import test from "node:test";
import {
  DECISION_MEMORY_KEY,
  mergeDecisionMemory,
  readDecisionMemory,
  recentDecisionIdsFrom,
  recordDecision
} from "../public/core/decision-memory.js";

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); }
  };
}

test("Decision Memoryは選択理由・slot・scope・時刻を正規化して保存する", () => {
  const storage = memoryStorage();
  const saved = recordDecision({
    work_id: "w1",
    title: "作品A",
    creator: "作者A",
    slot: "priority",
    reason: "読む優先度「最優先」",
    scope: "next",
    decided_at: "2026-09-21T09:00:00.000Z"
  }, storage);

  assert.equal(saved.work_id, "w1");
  assert.equal(saved.slot, "priority");
  assert.equal(saved.reason, "読む優先度「最優先」");
  assert.equal(saved.scope, "next");
  const rows = readDecisionMemory(storage);
  assert.equal(rows.length, 1);
  assert.match(storage.getItem(DECISION_MEMORY_KEY), /"work_id":"w1"/);
});

test("Decision Memoryは新しい選択を先頭に最大30件保持する", () => {
  let rows = [];
  for (let i = 0; i < 35; i += 1) {
    rows = mergeDecisionMemory(rows, {
      work_id: String(i),
      slot: "wildcard",
      decided_at: new Date(Date.UTC(2026, 8, 21, 0, i)).toISOString()
    });
  }
  assert.equal(rows.length, 30);
  assert.equal(rows[0].work_id, "34");
  assert.equal(rows.at(-1).work_id, "5");
});

test("recentDecisionIdsFromは直近30日だけを重複なしで返す", () => {
  const now = Date.parse("2026-09-21T12:00:00.000Z");
  const rows = [
    { work_id: "a", slot: "priority", decided_at: "2026-09-20T00:00:00.000Z" },
    { work_id: "a", slot: "wildcard", decided_at: "2026-09-19T00:00:00.000Z" },
    { work_id: "b", slot: "remember", decided_at: "2026-09-01T00:00:00.000Z" },
    { work_id: "old", slot: "priority", decided_at: "2026-07-01T00:00:00.000Z" }
  ];
  assert.deepEqual(recentDecisionIdsFrom(rows, { withinDays: 30, max: 12, now }), ["a", "b"]);
});

test("壊れたlocalStorage値は空履歴として安全に扱う", () => {
  const storage = {
    getItem() { return "{not-json"; },
    setItem() {}
  };
  assert.deepEqual(readDecisionMemory(storage), []);
});
