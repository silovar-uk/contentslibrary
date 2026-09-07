import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("CHOOSEは旧開始・評価・メモDOMを生成しない", async () => {
  const source = await read("public/views/home.js");
  assert.doesNotMatch(source, /data-random-start/);
  assert.doesNotMatch(source, /startFromRandom/);
  assert.doesNotMatch(source, /cardNoteMarkup/);
  assert.doesNotMatch(source, /openNoteCardIds/);
  assert.doesNotMatch(source, /cardRatingMarkup/);
  assert.match(source, /function randomPickMarkup/);
});

test("CONTINUEはTOP用カードに評価操作を生成しない", async () => {
  const source = await read("public/views/home.js");
  const readingBlock = source.slice(source.indexOf('$("#readingStrip")'), source.indexOf('$("#recentNotes")'));
  assert.doesNotMatch(readingBlock, /card-rating|cardRatingMarkup|data-card-rating/);
  assert.match(readingBlock, /reading-card-main/);
});

test("ジャンル棚はHome自身が全件表示用DOMを生成し展開状態を持たない", async () => {
  const source = await read("public/views/home.js");
  assert.doesNotMatch(source, /shelfExpanded/);
  assert.doesNotMatch(source, /data-shelf-expand/);
  assert.doesNotMatch(source, /is-secondary/);
  assert.doesNotMatch(source, /--shelf-span/);
  assert.match(source, /data\.genres\.length/);
  assert.match(source, /<div class=\"shelf-grid\">/);
});

test("ランダム再抽選は優先度変更では発火せず明示操作だけに限定する", async () => {
  const source = await read("public/views/home.js");
  assert.match(source, /random-mode-change/);
  assert.match(source, /data-action='draw-random'/);
  assert.doesNotMatch(source, /reading-priority.*drawRandomPicks|drawRandomPicks.*reading-priority/s);
});