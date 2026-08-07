import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  isReadingPriorityEligible,
  nextReadingPriority,
  normalizeReadingPriority,
  readingPriority,
  readingPriorityWeight
} from "../public/views/reading-priority.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const unreadBook = (priority = "") => ({ id: "b1", type: "book", status: "owned_unread", metadata: priority ? { reading_priority: priority } : {} });

test("読む優先度は4段階だけを受け入れる", () => {
  assert.equal(normalizeReadingPriority("top"), "top");
  assert.equal(normalizeReadingPriority("high"), "high");
  assert.equal(normalizeReadingPriority("medium"), "medium");
  assert.equal(normalizeReadingPriority("low"), "low");
  assert.equal(normalizeReadingPriority("5"), "");
  assert.equal(normalizeReadingPriority("favorite"), "");
});

test("一覧のワンクリック操作は未設定→低→中→高→最優先→未設定で循環する", () => {
  assert.equal(nextReadingPriority(""), "low");
  assert.equal(nextReadingPriority("low"), "medium");
  assert.equal(nextReadingPriority("medium"), "high");
  assert.equal(nextReadingPriority("high"), "top");
  assert.equal(nextReadingPriority("top"), "");
});

test("読む優先度は未読の本・漫画だけで通常表示対象になる", () => {
  assert.equal(isReadingPriorityEligible({ type: "book", status: "want" }), true);
  assert.equal(isReadingPriorityEligible({ type: "book", status: "owned_unread" }), true);
  assert.equal(isReadingPriorityEligible({ type: "manga", status: "owned_unread" }), true);
  assert.equal(isReadingPriorityEligible({ type: "book", status: "active" }), false);
  assert.equal(isReadingPriorityEligible({ type: "book", status: "completed" }), false);
  assert.equal(isReadingPriorityEligible({ type: "movie", status: "want" }), false);
});

test("読み始めてもmetadataの値自体は保持でき、通常順位だけ対象外になる", () => {
  const active = { type: "book", status: "active", metadata: { reading_priority: "top" } };
  assert.equal(readingPriority(active), "top");
  assert.equal(readingPriorityWeight(active), -1);
});

test("優先度の重みは最優先4・高3・中2・低1・未設定0", () => {
  assert.equal(readingPriorityWeight(unreadBook("top")), 4);
  assert.equal(readingPriorityWeight(unreadBook("high")), 3);
  assert.equal(readingPriorityWeight(unreadBook("medium")), 2);
  assert.equal(readingPriorityWeight(unreadBook("low")), 1);
  assert.equal(readingPriorityWeight(unreadBook()), 0);
});

test("フィルター・ソート・整理モード・カード操作の導線を持つ", async () => {
  const source = await read("public/views/reading-priority.js");
  assert.match(source, /id="filterReadingPriority"/);
  assert.match(source, /reading_priority_desc/);
  assert.match(source, /data-reading-priority-organize/);
  assert.match(source, /data-reading-priority-cycle/);
  assert.match(source, /data-reading-priority-set/);
  assert.match(source, /metadata\.reading_priority/);
  assert.match(source, /delete metadata\.reading_priority/);
});

test("同じ優先度のカードはDOMを置換せず再描画ループを防ぐ", async () => {
  const source = await read("public/views/reading-priority.js");
  assert.match(source, /data-reading-priority-value/);
  assert.match(source, /current\?\.dataset\.readingPriorityValue === value/);
});

test("アプリ起動へ接続し、モバイルでも整理モードを操作できる", async () => {
  const app = await read("public/app.js");
  const css = await read("public/styles/reading-priority.css");
  assert.match(app, /initReadingPriority/);
  assert.match(css, /reading-priority-organizer-row/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
});
