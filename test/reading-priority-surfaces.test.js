import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { prioritySummaryCounts } from "../public/views/reading-priority-surfaces.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("ホームの読む優先度サマリーは未読の本・漫画だけを集計する", () => {
  const counts = prioritySummaryCounts([
    { id: "1", type: "book", status: "owned_unread", metadata: { reading_priority: "top" } },
    { id: "2", type: "book", status: "want", metadata: { reading_priority: "high" } },
    { id: "3", type: "manga", status: "want", metadata: { reading_priority: "medium" } },
    { id: "4", type: "manga", status: "owned_unread", metadata: {} },
    { id: "5", type: "movie", status: "want", metadata: { reading_priority: "top" } },
    { id: "6", type: "book", status: "active", metadata: { reading_priority: "top" } }
  ]);
  assert.deepEqual(counts, { top: 1, high: 1, medium: 1, low: 0, unset: 1, total: 4 });
});

test("読む優先度は一覧・抽選・詳細の3か所へ同じチップUIを出す", async () => {
  const source = await read("public/views/reading-priority-surfaces.js");
  assert.match(source, /decorateLibraryCards/);
  assert.match(source, /decorateRandomCards/);
  assert.match(source, /decorateDetail/);
  assert.match(source, /syncSurface\(card, work, "library"/);
  assert.match(source, /syncSurface\(card, work, "random"/);
  assert.match(source, /surfaceMarkup\(work, "detail"\)/);
  assert.match(source, /data-reading-priority-set/);
  assert.match(source, /data-work-id/);
  assert.match(source, /最優先/);
  assert.match(source, /解除/);
});

test("ホームに読む順番の整理入口とランク別件数サマリーを出す", async () => {
  const source = await read("public/views/reading-priority-surfaces.js");
  assert.match(source, /READING PRIORITY/);
  assert.match(source, /読む順番を整理/);
  assert.match(source, /data-reading-priority-home-filter/);
  assert.match(source, /setView\("library"\)/);
  assert.match(source, /filterReadingPriority/);
  assert.match(source, /dispatchEvent\(new Event\("change"/);
});

test("旧ワンクリック循環ボタンは隠し、現在値チップから4段階を開く", async () => {
  const css = await read("public/styles/reading-priority-surfaces.css");
  assert.match(css, /\.reading-priority-card-control\{display:none!important\}/);
  assert.match(css, /reading-priority-surface\[open\] \.reading-priority-surface-menu\{display:flex\}/);
  assert.match(css, /\.reading-priority-choice\.is-top/);
  assert.match(css, /\.reading-priority-choice\.is-high/);
  assert.match(css, /\.reading-priority-choice\.is-medium/);
  assert.match(css, /\.reading-priority-choice\.is-low/);
});

test("アプリ起動時に読む優先度の常設UIを初期化する", async () => {
  const app = await read("public/app.js");
  assert.match(app, /initReadingPrioritySurfaces/);
  assert.match(app, /initReadingPrioritySurfaces\(\);/);
});
