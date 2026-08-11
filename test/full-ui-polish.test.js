import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("最終UIレイヤーはmobile detail CSSの後に読み込む", async () => {
  const source = await read("public/views/mobile-detail-nav.js");
  const mobileIndex = source.indexOf('ensureLink("/styles/mobile-header-detail.css")');
  const finalIndex = source.indexOf('ensureLink("/styles/full-ui-polish.css")');
  assert.ok(mobileIndex >= 0);
  assert.ok(finalIndex > mobileIndex);
});

test("PCヘッダーはブランド・検索・操作の安定した3カラムを持つ", async () => {
  const css = await read("public/styles/full-ui-polish.css");
  assert.match(css, /grid-template-columns:minmax\(190px,\.9fr\) minmax\(300px,680px\) minmax\(220px,\.9fr\)/);
  assert.match(css, /\.global-search\{[\s\S]*max-width:680px/);
  assert.match(css, /\.top-actions\{[\s\S]*flex-wrap:nowrap/);
});

test("スマホヘッダーは1段目ナビ・2段目検索に固定する", async () => {
  const css = await read("public/styles/full-ui-polish.css");
  assert.match(css, /@media\(max-width:767px\)[\s\S]*grid-template-rows:40px 44px/);
  assert.match(css, /\.global-search[\s\S]*grid-column:1\/-1;[\s\S]*grid-row:2/);
  assert.match(css, /font-size:16px!important/);
});

test("ホーム・一覧・詳細で共通余白とsurfaceトークンを使う", async () => {
  const css = await read("public/styles/full-ui-polish.css");
  assert.match(css, /--ui-gutter:clamp\(18px,3vw,40px\)/);
  assert.match(css, /--ui-radius-card:16px/);
  assert.match(css, /--ui-border:/);
  assert.match(css, /--ui-shadow:/);
});

test("スマホ一覧は1カラム、詳細は固定オーバーレイとして崩れを防ぐ", async () => {
  const css = await read("public/styles/full-ui-polish.css");
  assert.match(css, /\.app-shell\[data-view="library"\] \.library-view\{display:block!important\}/);
  assert.match(css, /\.detail-panel\{position:fixed!important;[\s\S]*width:100%!important/);
});

test("詳細上部はタイトルと操作のレスポンシブ規則を持つ", async () => {
  const css = await read("public/styles/full-ui-polish.css");
  assert.match(css, /detail-header h2\{font-size:clamp\(24px,2\.5vw,34px\)/);
  assert.match(css, /detail-actions\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:390px\)[\s\S]*detail-actions\{grid-template-columns:minmax\(0,1fr\)\}/);
});

test("ダイアログ・コマンドパレット・Bottom Sheetのsurfaceを統一する", async () => {
  const css = await read("public/styles/full-ui-polish.css");
  assert.match(css, /dialog:not\(\.command-palette\):not\(\.light-edit-sheet\)/);
  assert.match(css, /\.command-palette-card,\.light-edit-sheet-card/);
  assert.match(css, /var\(--ui-shadow-float\)/);
});
