import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../public/views/amazon-title-search.js", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../public/styles/amazon-title-search.css", import.meta.url), "utf8");

test("本のタイトルをAmazon.co.jpの本カテゴリで検索する", () => {
  assert.match(source, /https:\/\/www\.amazon\.co\.jp\/s/);
  assert.match(source, /k: String\(title \|\| ""\)\.trim\(\)/);
  assert.match(source, /i: "stripbooks"/);
  assert.match(source, /work\.type !== "book"/);
});

test("検索結果を安全に新しいタブで開く", () => {
  assert.match(source, /link\.target = "_blank"/);
  assert.match(source, /link\.rel = "noopener noreferrer"/);
  assert.match(source, /Amazonでタイトル検索 ↗/);
  assert.match(source, /新しいタブ/);
});

test("表紙の設定前後どちらでも検索ボタンを表示する", () => {
  assert.match(source, /const coverSection = \$\("\.cover-section", panel\)/);
  assert.match(source, /const form = \$\("\[data-cover-form\]", coverSection\)/);
  assert.match(source, /if \(form\) form\.before\(link\)/);
  assert.match(source, /else coverSection\.append\(link\)/);
});

test("詳細画面の描画後にAmazon検索を初期化する", () => {
  assert.match(appSource, /import \{ initAmazonTitleSearch \} from "\.\/views\/amazon-title-search\.js"/);
  assert.match(appSource, /initDetail\(\);\s*initAmazonTitleSearch\(\);/);
});

test("モバイルでは検索ボタンを押しやすい横幅にする", () => {
  assert.match(cssSource, /min-height: 40px/);
  assert.match(cssSource, /@media \(max-width: 767px\)/);
  assert.match(cssSource, /width: 100%/);
});
