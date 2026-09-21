import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const moduleSource = fs.readFileSync("public/views/ui-shuhari-pr2.js", "utf8");
const css = fs.readFileSync("public/styles/ui-shuhari-pr2.css", "utf8");

test("初回表示の文言をComposition既定へ揃える", () => {
  assert.match(moduleSource, /YOUR CULTURE, NEXT MOVE/);
  assert.match(moduleSource, /今日は、どれに戻る？/);
  assert.match(moduleSource, /続きを進める。次を選ぶ。まだ決まらなければ、興味から探す。/);
});

test("スワイプヒントは実際の横はみ出しで表示する", () => {
  assert.match(moduleSource, /scrollWidth\s*>\s*node\.clientWidth\s*\+\s*2/);
  assert.match(moduleSource, /continueHint\.hidden/);
  assert.match(moduleSource, /chooseHint\.hidden/);
  assert.doesNotMatch(moduleSource, /new MutationObserver/);
});

test("スマホCHOOSEは2列比較面を維持し、操作列はHome Compositionへ委ねる", () => {
  assert.doesNotMatch(css, /grid-template-columns:minmax\(100px,\.8fr\) minmax\(120px,1fr\)/);
  assert.match(css, /home-decision-surface\.css/);
  const existing = fs.readFileSync("public/styles/ui-polish.css", "utf8");
  assert.match(existing, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
});

test("スマホ一覧のツールは2列に折り返す", () => {
  assert.match(css, /\.list-panel \.list-tools\{[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
