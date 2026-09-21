import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("モバイル文字拡大耐性CSSをtokensから常時読み込む", async () => {
  const tokens = await read("public/styles/tokens.css");
  assert.match(tokens, /@import url\("\/styles\/mobile-text-resilience\.css"\)/);
});

test("文字拡大耐性層は横幅・入力・主要グリッドの安全性だけを持つ", async () => {
  const css = await read("public/styles/mobile-text-resilience.css");
  assert.match(css, /@media\(max-width:767px\)/);
  assert.doesNotMatch(css, /@media\(max-width:760px\)/);
  assert.match(css, /body\{min-width:0\}/);
  assert.match(css, /\.library-view\{grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /\.reading-priority-home-stats\{display:grid!important;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.doesNotMatch(css, /\.random-pick-grid\{grid-template-columns/);
});

test("抽選棚の列数はHome decision surfaceが所有する", async () => {
  const resilience = await read("public/styles/mobile-text-resilience.css");
  const decision = await read("public/styles/home-decision-surface.css");
  assert.doesNotMatch(resilience, /\.random-pick-grid\{grid-template-columns/);
  assert.match(decision, /@media\(max-width:767px\)[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(resilience, /@media\(max-width:390px\)[\s\S]*reading-priority-home-stats\{grid-template-columns:minmax\(0,1fr\)!important\}/);
});

test("入力欄はiOSの自動ズームを避けつつ幅をはみ出さない", async () => {
  const css = await read("public/styles/mobile-text-resilience.css");
  assert.match(css, /input,select,textarea\{max-width:100%\}/);
  assert.match(css, /font-size:max\(16px,1em\)/);
  assert.match(css, /overflow-wrap:anywhere/);
});
