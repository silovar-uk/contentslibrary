import assert from "node:assert/strict";
import test from "node:test";
import { buildDecisionDeck, DECISION_SLOT_LABELS } from "../public/core/decision-deck.js";

const NOW = Date.parse("2026-09-21T00:00:00.000Z");
const works = [
  { id: "top", title: "Top", created_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-09-20T00:00:00.000Z", metadata: { reading_priority: "top" } },
  { id: "high", title: "High", created_at: "2026-07-01T00:00:00.000Z", updated_at: "2026-09-10T00:00:00.000Z", metadata: { reading_priority: "high" } },
  { id: "old", title: "Old", created_at: "2025-01-01T00:00:00.000Z", updated_at: "2025-02-01T00:00:00.000Z", metadata: {} },
  { id: "wild", title: "Wild", created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-15T00:00:00.000Z", metadata: {} }
];

test("Decision DeckはPRIORITY・REMEMBER・WILD CARDの順で最大3件を返す", () => {
  const deck = buildDecisionDeck(works, { rng: () => 0, now: NOW });
  assert.deepEqual(deck.map((item) => item.slot), ["priority", "remember", "wildcard"]);
  assert.equal(new Set(deck.map((item) => item.id)).size, 3);
  assert.deepEqual(DECISION_SLOT_LABELS, {
    priority: "PRIORITY",
    remember: "REMEMBER",
    wildcard: "WILD CARD"
  });
});

test("PRIORITYは明示された読む優先度が最も高い候補を選ぶ", () => {
  const deck = buildDecisionDeck(works, { rng: () => 0, now: NOW });
  const candidate = deck.find((item) => item.slot === "priority");
  assert.equal(candidate.id, "top");
  assert.equal(candidate.reason, "読む優先度「最優先」");
});

test("REMEMBERは残った候補のうち最終更新が最も古い作品を選ぶ", () => {
  const deck = buildDecisionDeck(works, { rng: () => 0, now: NOW });
  const candidate = deck.find((item) => item.slot === "remember");
  assert.equal(candidate.id, "old");
  assert.match(candidate.reason, /最終更新から/);
});

test("WILD CARDは残った候補から完全ランダムで1件選ぶ", () => {
  const deck = buildDecisionDeck(works, { rng: () => 0.99, now: NOW });
  const candidate = deck.find((item) => item.slot === "wildcard");
  assert.equal(candidate.reason, "この棚から完全ランダム");
  assert.ok(candidate.id);
});

test("KEEPされたslotは再抽選しても同じ作品を保持する", () => {
  const first = buildDecisionDeck(works, { rng: () => 0, now: NOW });
  const remember = first.find((item) => item.slot === "remember");
  const second = buildDecisionDeck(works, {
    current: first,
    keptIds: [remember.id],
    historyIds: first.map((item) => item.id),
    rng: () => 0.99,
    now: NOW
  });
  const kept = second.find((item) => item.slot === "remember");
  assert.equal(kept.id, remember.id);
  assert.equal(kept.kept, true);
});

test("直近履歴は候補が十分ある限り再登場を避ける", () => {
  const first = buildDecisionDeck(works, { rng: () => 0, now: NOW });
  const second = buildDecisionDeck([...works, { id: "fresh", updated_at: "2026-09-18T00:00:00.000Z", metadata: {} }], {
    historyIds: first.map((item) => item.id),
    rng: () => 0,
    now: NOW
  });
  assert.ok(second.some((item) => item.id === "fresh"));
});
