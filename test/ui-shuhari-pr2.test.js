import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const moduleSource = fs.readFileSync("public/views/ui-shuhari-pr2.js", "utf8");
const css = fs.readFileSync("public/styles/ui-shuhari-pr2.css", "utf8");

test("Shuhari PR2はHomeのコピーやスワイプ状態を所有しない", () => {
  assert.doesNotMatch(moduleSource, /primeHeroCopy/);
  assert.doesNotMatch(moduleSource, /YOUR CULTURE, NEXT MOVE/);
  assert.doesNotMatch(moduleSource, /scrollWidth|syncShuhariSwipeHints|MutationObserver/);
  assert.match(moduleSource, /ensureStyle/);
});

test("Homeレイアウトはhome-decision-surfaceへ委ねる", () => {
  assert.match(css, /home-decision-surface\.css/);
  assert.doesNotMatch(css, /random-controls[\s\S]*grid-template-columns/);
});

test("スマホ一覧のツールは2列に折り返す", () => {
  assert.match(css, /\.list-panel \.list-tools\{[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
