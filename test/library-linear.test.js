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

test("一覧ではタイトル・作者に加えて概要と分類も圧縮表示する", async () => {
  const css = await read("public/styles/library-linear.css");
  const library = await read("public/views/library.js");
  assert.match(css, /\.work-card-body h3/);
  assert.match(css, /\.creator/);
  assert.match(css, /\.work-overview/);
  assert.match(css, /-webkit-line-clamp:2/);
  assert.match(css, /\.label-row/);
  assert.doesNotMatch(css, /\.label-row\{display:none\}/);
  assert.match(library, /\["overview", "summary", "description", "synopsis"\]/);
  assert.match(library, /label: "一言メモ"/);
});

test("Work Face導入後も一覧の表紙スロットは1つだけ使う", async () => {
  const css = await read("public/styles/library-linear.css");
  assert.match(css, /#workList \.work-cover-thumb,\s*#workList \.work-face-list-thumb/);
  assert.match(css, /:not\(:has\(\.work-cover-thumb\)\):not\(:has\(\.work-face-list-thumb\)\)::before/);
  assert.match(css, /#workList \.work-card-body\{\s*grid-column:2;\s*grid-row:1;/);
});

test("PC一覧の評価ボタンは24px以上の操作幅を持つ", async () => {
  const css = await read("public/styles/library-linear.css");
  assert.match(css, /#workList \.card-star\{[\s\S]*?width:24px;[\s\S]*?min-width:24px;/);
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
