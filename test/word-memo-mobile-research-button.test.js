import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("単語メモの調査ボタンは文言を持つ", async () => {
  const source = await read("public/views/word-memos.js");
  assert.match(source, /word-memo-research-open[^>]*>[\s\S]*<span>書評から調べる<\/span>/);
});

test("スマホでも調査ボタンの文言を表示する", async () => {
  const css = await read("public/styles/word-memos.css");
  assert.match(css, /@media\(max-width:760px\)[\s\S]*\.word-memo-research-open span\{display:inline\}/);
  assert.doesNotMatch(css, /@media\(max-width:760px\)[\s\S]*\.word-memo-research-open span\{display:none\}/);
});

test("スマホの調査ボタンは横幅いっぱいで十分なタップ領域を持つ", async () => {
  const css = await read("public/styles/word-memos.css");
  assert.match(css, /\.word-memo-research-open\{[\s\S]*width:100%;[\s\S]*min-height:48px/);
  assert.match(css, /\.word-memo-research-open svg\{width:20px;height:20px/);
});

test("スマホの単語メモ見出しはボタンのために縦積みにする", async () => {
  const css = await read("public/styles/word-memos.css");
  assert.match(css, /\.word-memo-heading\{flex-direction:column;align-items:stretch/);
  assert.match(css, /\.word-memo-heading-actions\{width:100%;max-width:none/);
});
