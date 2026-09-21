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

test("スマホのランダム抽選レイアウトはHome decision surfaceが所有する", async () => {
  const polish = await read("public/styles/ui-polish.css");
  const decision = await read("public/styles/home-decision-surface.css");
  const resilience = await read("public/styles/mobile-text-resilience.css");
  assert.doesNotMatch(polish, /#randomStage \.random-pick-grid,[\s\S]{0,180}grid-template-columns/);
  assert.doesNotMatch(resilience, /\.random-pick-grid\{grid-template-columns/);
  assert.match(decision, /@media\(max-width:767px\)[\s\S]*home-zone-choose \.editorial-random-feature \.random-pick-grid\{[\s\S]*grid-template-columns:minmax\(0,1fr\)/);
});

test("Decision CandidateはlegacyランダムカードCSSから独立する", async () => {
  const css = await read("public/styles/ui-polish.css");
  const decision = await read("public/styles/home-decision-surface.css");
  assert.match(css, /random-pick-card:not\(\.decision-candidate\)/);
  assert.match(decision, /decision-candidate-kind/);
  assert.match(decision, /decision-candidate-reason/);
  assert.match(decision, /decision-candidate-keep/);
});

test("作品評価・メモ・旧読みたさはスマホのランダムカード前面から外す", async () => {
  const css = await read("public/styles/ui-polish.css");
  assert.match(css, /#randomStage \.card-rating,[\s\S]*#randomStage \.card-note-row,[\s\S]*#randomStage \.reading-desire-card\{display:none!important\}/);
});

test("読む優先度は半幅カード内で1行に収まりスマホではメニュー本体を隠す", async () => {
  const css = await read("public/styles/ui-polish.css");
  assert.match(css, /reading-priority-surface-random\{[\s\S]*width:calc\(100% - 18px\)!important/);
  assert.match(css, /reading-priority-surface-random summary\{[\s\S]*width:100%!important/);
  assert.match(css, /reading-priority-surface-random \.reading-priority-surface-menu\{display:none!important\}/);
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
