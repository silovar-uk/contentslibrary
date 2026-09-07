import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { prioritySummaryCounts, readingPrioritySurfaceMarkup } from "../public/views/reading-priority-surfaces.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("読む優先度集計は未読の本・漫画だけを対象にする", () => {
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

test("読む優先度Surfaceは一覧・詳細・CHOOSEで再利用できる", async () => {
  const source = await read("public/views/reading-priority-surfaces.js");
  const composition = await read("public/views/home-composition.js");
  assert.match(source, /export function readingPrioritySurfaceMarkup/);
  assert.match(source, /decorateLibraryCards/);
  assert.match(source, /decorateDetail/);
  assert.match(source, /syncSurface\(card, work, "library"/);
  assert.match(source, /readingPrioritySurfaceMarkup\(work, "detail"\)/);
  assert.match(composition, /readingPrioritySurfaceMarkup\(work, "choose"\)/);
  assert.match(source, /data-reading-priority-set/);
  assert.match(source, /data-work-id/);
  assert.match(source, /解除/);
});

test("CHOOSE用Surfaceは未読book/mangaだけに出し、statusを変更するUIを持たない", () => {
  const eligible = readingPrioritySurfaceMarkup({ id: "b1", type: "book", status: "owned_unread", metadata: {} }, "choose");
  assert.match(eligible, /reading-priority-surface-choose/);
  assert.match(eligible, /優先度を決める/);
  assert.match(eligible, /data-reading-priority-set="top"/);
  assert.doesNotMatch(eligible, /status/);

  const active = readingPrioritySurfaceMarkup({ id: "b2", type: "book", status: "active", metadata: {} }, "choose");
  const movie = readingPrioritySurfaceMarkup({ id: "m1", type: "movie", status: "want", metadata: {} }, "choose");
  assert.equal(active, "");
  assert.equal(movie, "");
});

test("ホームはランク別件数ダッシュボードを持たず整理入口だけを弱く残す", async () => {
  const surface = await read("public/views/reading-priority-surfaces.js");
  const composition = await read("public/views/home-composition.js");
  assert.doesNotMatch(surface, /READING PRIORITY/);
  assert.doesNotMatch(surface, /data-reading-priority-home-filter/);
  assert.match(composition, /dataset\.readingPriorityOrganize/);
  assert.match(composition, /読む順番を整理/);
});

test("旧ワンクリック循環ボタンは隠し、現在値チップから4段階を開く", async () => {
  const css = await read("public/styles/reading-priority-surfaces.css");
  assert.match(css, /\.reading-priority-card-control\{display:none!important\}/);
  assert.match(css, /reading-priority-surface\[open\] \.reading-priority-surface-menu\{display:flex\}/);
  assert.match(css, /\.reading-priority-choice\.is-top/);
  assert.match(css, /\.reading-priority-choice\.is-high/);
  assert.match(css, /\.reading-priority-choice\.is-medium/);
  assert.match(css, /\.reading-priority-choice\.is-low/);
  assert.doesNotMatch(css, /reading-priority-home-hub/);
});

test("アプリ起動時に読む優先度の管理UIを初期化する", async () => {
  const app = await read("public/app.js");
  assert.match(app, /initReadingPrioritySurfaces/);
  assert.match(app, /initReadingPrioritySurfaces\(\);/);
});
