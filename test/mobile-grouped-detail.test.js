import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("スマホ詳細はGrouped Listとして独立したCSSを持つ", async () => {
  const css = await read("public/styles/mobile-grouped-detail.css");
  assert.match(css, /@media\(max-width:767px\)/);
  assert.match(css, /#detailPanel\.detail-document/);
  assert.match(css, /border-radius:14px/);
});

test("自分との関係は1行1情報のproperties UIになる", async () => {
  const css = await read("public/styles/mobile-grouped-detail.css");
  assert.match(css, /grid-template-columns:90px minmax\(0,1fr\)/);
  assert.match(css, /min-height:52px/);
  assert.match(css, /border-bottom:1px solid var\(--line\)/);
});

test("文字拡大でも入力とselectは16px以上を確保する", async () => {
  const css = await read("public/styles/mobile-grouped-detail.css");
  assert.match(css, /font-size:max\(16px,1em\)/);
  assert.match(css, /overflow-wrap:anywhere/);
});

test("最近メモと履歴は行ベースで表示する", async () => {
  const css = await read("public/styles/mobile-grouped-detail.css");
  assert.match(css, /\.detail-top-note-row\{/);
  assert.match(css, /min-height:54px/);
  assert.match(css, /\.note-item-list\{padding:0 12px\}/);
});

test("スマホCSSはDocument CSSの後にlinkとして読み込む", async () => {
  const source = await read("public/views/detail-top-notes.js");
  const base = source.indexOf('/styles/detail-top-notes.css');
  const mobile = source.indexOf('/styles/mobile-grouped-detail.css');
  assert.ok(base >= 0);
  assert.ok(mobile > base);
  assert.match(source, /document\.head\.append\(mobile\)/);
});
