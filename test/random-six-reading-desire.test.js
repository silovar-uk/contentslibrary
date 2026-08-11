import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readingDesire, readingDesireMarkup } from "../public/views/reading-desire.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("ランダム抽選は6冊になる", async () => {
  const source = await read("public/views/home.js");
  assert.match(source, /skeletonCards\(6\)/);
  assert.match(source, /pickRandomWorks\(scope, 6,/);
  assert.match(source, /そのたびに6冊の顔ぶれ/);
});

test("読みたさはmetadata.reading_desireの1〜5だけを採用する", () => {
  assert.equal(readingDesire({ metadata: { reading_desire: 4 } }), 4);
  assert.equal(readingDesire({ metadata: { reading_desire: 9 } }), 0);
  assert.equal(readingDesire({ metadata: {} }), 0);
});

test("読みたさUIはお気に入りや作品評価とは別の5段階を持つ", () => {
  const html = readingDesireMarkup({ id: "x", metadata: { reading_desire: 3 } });
  assert.match(html, /読みたさ/);
  assert.equal((html.match(/data-reading-desire-set=/g) || []).length, 5);
  assert.match(html, /aria-pressed="true"/);
});

test("読みたさは作品metadataだけをPATCHする", async () => {
  const source = await read("public/views/reading-desire.js");
  assert.match(source, /metadata\.reading_desire = next/);
  assert.match(source, /delete metadata\.reading_desire/);
  assert.match(source, /JSON\.stringify\(\{ version: Number\(work\.version\), metadata \}\)/);
  assert.doesNotMatch(source, /\/preferences/);
});

test("ランダムカードと詳細の両方へ読みたさを表示する", async () => {
  const source = await read("public/views/reading-desire.js");
  assert.match(source, /#randomStage \.random-pick-card/);
  assert.match(source, /\.preference-panel/);
  assert.match(source, /reading-desire-detail-row/);
});

test("スマホのランダムカードは390px以下でも2列を維持する", async () => {
  const css = await read("public/styles/reading-desire.css");
  assert.match(css, /#randomStage \.random-pick-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(css, /@media\(max-width:380px\)/);
  assert.doesNotMatch(css, /grid-template-columns:minmax\(0,1fr\)!important/);
});

test("アプリ起動時に読みたさUIを初期化する", async () => {
  const app = await read("public/app.js");
  assert.match(app, /initReadingDesire/);
  assert.match(app, /initReadingPrioritySurfaces\(\);\s*initReadingDesire\(\);/);
});
