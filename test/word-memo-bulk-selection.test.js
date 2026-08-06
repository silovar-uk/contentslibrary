import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("AI単語候補にすべて選択と選択解除を用意する", async () => {
  const source = await read("public/views/word-memo-bulk-selection.js");
  assert.match(source, /data-word-memo-select-all/);
  assert.match(source, />すべて選択<\/button>/);
  assert.match(source, /data-word-memo-clear-all/);
  assert.match(source, />選択解除<\/button>/);
});

test("人入力済みで無効な候補は一括選択の対象外にする", async () => {
  const source = await read("public/views/word-memo-bulk-selection.js");
  assert.match(source, /data-word-memo-candidate-index\]:not\(:disabled\)/);
  assert.match(source, /checkbox\.checked = checked/);
  assert.match(source, /new Event\("change", \{ bubbles: true \}\)/);
});

test("選択状態に応じて一括操作ボタンを無効化する", async () => {
  const source = await read("public/views/word-memo-bulk-selection.js");
  assert.match(source, /selected === checkboxes\.length/);
  assert.match(source, /clear\.disabled = selected === 0/);
  assert.match(source, /追加できる単語候補/);
});

test("一括選択機能をアプリ起動時に接続し、モバイルでも操作しやすくする", async () => {
  const app = await read("public/app.js");
  const css = await read("public/styles/word-memo-bulk-selection.css");
  assert.match(app, /initWordMemoBulkSelection/);
  assert.match(app, /initWordMemoBulkSelection\(\)/);
  assert.match(css, /word-memo-selection-tools/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /flex:1/);
});
