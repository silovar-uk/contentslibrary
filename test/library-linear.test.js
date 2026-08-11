import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("一覧LinearスタイルはPC幅だけに適用する", async () => {
  const css = await read("public/styles/library-linear.css");
  assert.match(css, /@media \(min-width:1100px\)/);
  assert.match(css, /#workList \.work-card\{/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) auto auto auto/);
});

test("PC一覧はカード境界を弱め、選択中だけアクセントを出す", async () => {
  const css = await read("public/styles/library-linear.css");
  assert.match(css, /border-radius:0/);
  assert.match(css, /box-shadow:none/);
  assert.match(css, /\.work-card\.is-current/);
  assert.match(css, /inset 3px 0 0 var\(--accent\)/);
});

test("一覧ではタイトルと作者を優先し補助情報を抑える", async () => {
  const css = await read("public/styles/library-linear.css");
  assert.match(css, /\.work-card-body h3/);
  assert.match(css, /\.creator/);
  assert.match(css, /\.short-note,/);
  assert.match(css, /\.label-row\{display:none\}/);
});

test("読む優先度CSSから一覧Linearスタイルを後読みする", async () => {
  const css = await read("public/styles/reading-priority-surfaces.css");
  assert.match(css, /^@import url\("\/styles\/library-linear\.css"\);/);
});

test("メモ入力を開いたときは一覧幅を使える", async () => {
  const css = await read("public/styles/library-linear.css");
  assert.match(css, /\.card-note-row:has\(\.card-note-form\)/);
  assert.match(css, /grid-column:1\/-1/);
});
