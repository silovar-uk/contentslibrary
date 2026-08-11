import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("詳細Documentは4つの意味レイヤーを付与する", async () => {
  const source = await read("public/views/detail-document.js");
  assert.match(source, /WORK/);
  assert.match(source, /MY RELATIONSHIP/);
  assert.match(source, /ABOUT THE WORK/);
  assert.match(source, /HISTORY/);
  assert.match(source, /自分との関係/);
  assert.match(source, /作品について/);
});

test("既存詳細を破壊せずclassと見出しを後付けする", async () => {
  const source = await read("public/views/detail-document.js");
  assert.match(source, /classList\.add\("detail-document"\)/);
  assert.match(source, /anchor\.before/);
  assert.doesNotMatch(source, /innerHTML\s*=\s*`[\s\S]*detail-header/);
});

test("Notion型CSSはカードを減らしpropertiesを行UIへ寄せる", async () => {
  const css = await read("public/styles/detail-document.css");
  assert.match(css, /\.detail-doc-properties/);
  assert.match(css, /border-bottom:1px solid color-mix/);
  assert.match(css, /\.fact-section dl/);
  assert.match(css, /\.note-block\{margin-bottom:0;border-bottom:1px solid var\(--line\);border-radius:0;background:transparent/);
});

test("既存の詳細上部メモ処理の最後でDocument装飾を適用する", async () => {
  const source = await read("public/views/detail-top-notes.js");
  assert.match(source, /import \{ decorateDetailDocument \} from "\.\/detail-document\.js"/);
  assert.match(source, /decorateDetailDocument\(panel\)/);
});

test("詳細Documentスタイルは既存の上部メモCSSから読み込む", async () => {
  const css = await read("public/styles/detail-top-notes.css");
  assert.match(css, /^@import url\("\/styles\/detail-document\.css"\);/);
});
