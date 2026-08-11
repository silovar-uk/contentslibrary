import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("仕上げCSSは最終レイヤーとして動的に読み込む", async () => {
  const source = await read("public/views/ui-polish.js");
  assert.match(source, /\/styles\/ui-polish\.css/);
  assert.match(source, /document\.head\.append\(link\)/);
});

test("390px以下でもランダム抽選は2列を維持する", async () => {
  const resilience = await read("public/styles/mobile-text-resilience.css");
  const polish = await read("public/styles/ui-polish.css");
  assert.match(resilience, /@media\(max-width:390px\)[\s\S]*\.random-pick-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/);
  assert.match(polish, /@media\(max-width:390px\)[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.doesNotMatch(resilience, /@media\(max-width:390px\)[\s\S]*\.random-pick-grid\{grid-template-columns:minmax\(0,1fr\)\}/);
});

test("半幅カード内の評価と読みたさは5等分で収まる", async () => {
  const css = await read("public/styles/ui-polish.css");
  assert.match(css, /reading-desire-card \.reading-desire-scale\{grid-template-columns:repeat\(5,minmax\(0,1fr\)\)!important/);
  assert.match(css, /#randomStage \.card-rating\{display:grid!important;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
});

test("長文・URL・タイトルの横はみ出し対策を持つ", async () => {
  const css = await read("public/styles/ui-polish.css");
  assert.match(css, /overflow-wrap:anywhere/);
  assert.match(css, /\.fact-section a,\.detail-panel a\{max-width:100%\}/);
  assert.match(css, /\.detail-header h2\{hyphens:auto\}/);
});

test("フォーカス表示とreduced motionを横断で統一する", async () => {
  const css = await read("public/styles/ui-polish.css");
  assert.match(css, /:where\(button,a,input,select,textarea,summary\):focus-visible/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
});

test("スマホのコマンドパレット・シート・Walletをviewport内へ制約する", async () => {
  const css = await read("public/styles/ui-polish.css");
  assert.match(css, /command-palette-card,.light-edit-sheet-card,.filter-panel\.light-filter-sheet\{max-width:100vw\}/);
  assert.match(css, /\.wallet-stack-book\{max-width:26vw\}/);
});

test("アプリ初期化の最後でUI仕上げを適用する", async () => {
  const app = await read("public/app.js");
  assert.match(app, /initUiPolish/);
  assert.match(app, /initReviewSummary\(\);\s*initUiPolish\(\);/);
});
