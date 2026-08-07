import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { RANDOM_PICK_SCOPES, pickRandomWorks, randomScopeCounts, state } from "../public/core/store.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

function withWorks(works, fn) {
  const previous = state.works;
  state.works = new Map(works.map((work) => [String(work.id), work]));
  try { return fn(); } finally { state.works = previous; }
}

test("抽選棚に表紙あり・表紙なしを含む7分類を持つ", () => {
  assert.deepEqual(RANDOM_PICK_SCOPES.map((scope) => scope.value), ["next", "owned_unread", "want", "book", "has_cover", "no_cover", "all"]);
});

test("表紙URLの有無で抽選対象と件数を分ける", () => withWorks([
  { id: "1", type: "book", status: "owned_unread", metadata: { cover_url: "https://m.media-amazon.com/images/P/1.LZZZZZZZ.jpg" } },
  { id: "2", type: "book", status: "want", metadata: {} },
  { id: "3", type: "movie", status: "completed", metadata: { cover_url: "https://m.media-amazon.com/images/P/3.LZZZZZZZ.jpg" } },
  { id: "4", type: "manga", status: "completed", metadata: { cover_url: "   " } }
], () => {
  const counts = randomScopeCounts();
  assert.equal(counts.has_cover, 2);
  assert.equal(counts.no_cover, 2);
  assert.equal(counts.next, 2);
  assert.equal(counts.book, 2);
  assert.equal(counts.all, 4);
  assert.ok(pickRandomWorks("has_cover", 10).every((work) => String(work.metadata?.cover_url || "").trim()));
  assert.ok(pickRandomWorks("no_cover", 10).every((work) => !String(work.metadata?.cover_url || "").trim()));
}));

test("全分類の選択肢に対象件数を括弧表示する", async () => {
  const source = await read("public/views/random-scope-options.js");
  const app = await read("public/app.js");
  assert.match(source, /randomScopeOptionLabel/);
  assert.match(source, /（\$\{loaded \?/);
  assert.match(source, /RANDOM_PICK_SCOPES/);
  assert.match(source, /randomScopeCounts/);
  assert.match(source, /subscribe\(renderRandomScopeOptions\)/);
  assert.match(app, /initRandomScopeOptions/);
});
