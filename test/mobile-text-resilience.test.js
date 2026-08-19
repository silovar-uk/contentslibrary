import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("モバイル文字拡大耐性CSSをtokensから常時読み込む", async () => {
  const tokens = await read("public/styles/tokens.css");
  assert.match(tokens, /@import url\("\/styles\/mobile-text-resilience\.css"\)/);
});

test("スマホでは767pxまで横幅固定を解除し主要グリッドを縮退させる", async () => {
  const css = await read("public/styles/mobile-text-resilience.css");
  assert.match(css, /@media\(max-width:767px\)/);
  assert.doesNotMatch(css, /@media\(max-width:760px\)/);
  assert.match(css, /body\{min-width:0\}/);
  assert.match(css, /\.random-pick-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.library-view\{grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /\.reading-priority-home-stats\{display:grid!important;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
});

test("狭い画面でも抽選棚は2列を維持し、優先度サマリーだけ1列へ逃がす", async () => {
  const css = await read("public/styles/mobile-text-resilience.css");
  assert.match(css, /@media\(max-width:390px\)/);
  assert.match(css, /\.random-pick-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/);
  assert.match(css, /\.reading-priority-home-stats\{grid-template-columns:minmax\(0,1fr\)!important\}/);
});

test("入力欄はiOSの自動ズームを避けつつ幅をはみ出さない", async () => {
  const css = await read("public/styles/mobile-text-resilience.css");
  assert.match(css, /input,select,textarea\{max-width:100%\}/);
  assert.match(css, /font-size:max\(16px,1em\)/);
  assert.match(css, /overflow-wrap:anywhere/);
});
