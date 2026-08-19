import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("スマホ詳細にトップへの常設導線を追加する", async () => {
  const source = await read("public/views/mobile-detail-nav.js");
  assert.match(source, /mobile-detail-topnav/);
  assert.match(source, /data-mobile-detail-home/);
  assert.match(source, />トップ</);
  assert.match(source, /setView\("home"\)/);
});

test("詳細ナビは767px以下だけ生成しPCへ漏らさない", async () => {
  const source = await read("public/views/mobile-detail-nav.js");
  const css = await read("public/styles/mobile-header-detail.css");
  assert.match(source, /MOBILE_QUERY = "\(max-width: 767px\)"/);
  assert.match(source, /if \(!mobile\)[\s\S]*clearMobileDetailState/);
  assert.match(source, /querySelector\("\.mobile-detail-topnav"\)\?\.remove\(\)/);
  assert.match(css, /\.mobile-detail-topnav\{display:none\}/);
  assert.match(css, /@media\(max-width:767px\)[\s\S]*\.mobile-detail-topnav\{[\s\S]*display:flex/);
});

test("スマホ詳細は実際のヘッダー下端に追従する", async () => {
  const source = await read("public/views/mobile-detail-nav.js");
  assert.match(source, /getBoundingClientRect\(\)\.bottom/);
  assert.match(source, /style\.setProperty\("top", `\$\{top\}px`, "important"\)/);
  assert.match(source, /window\.addEventListener\("resize", scheduleApply/);
});

test("スマホのトップバーは1段目ナビ・2段目検索へ整理する", async () => {
  const css = await read("public/styles/mobile-header-detail.css");
  assert.match(css, /grid-template-rows:auto auto/);
  assert.match(css, /\.brand\{[\s\S]*grid-row:1/);
  assert.match(css, /\.global-search\{[\s\S]*grid-column:1\/-1;[\s\S]*grid-row:2/);
});

test("トップ導線はブランド内でも明示的にトップと表示する", async () => {
  const css = await read("public/styles/mobile-header-detail.css");
  assert.match(css, /\.brand::after\{[\s\S]*content:"トップ"/);
});

test("検索欄はスマホで横幅100%かつ16px入力を維持する", async () => {
  const css = await read("public/styles/mobile-header-detail.css");
  assert.match(css, /\.global-search\{[\s\S]*width:100%/);
  assert.match(css, /\.global-search input\{[\s\S]*font-size:16px/);
  assert.match(css, /search-and-hint\{display:none!important\}/);
});

test("詳細ヘッダー操作は2列、360px以下では1列へ縮退する", async () => {
  const css = await read("public/styles/mobile-header-detail.css");
  assert.match(css, /detail-actions\{[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:360px\)[\s\S]*detail-actions\{grid-template-columns:minmax\(0,1fr\)\}/);
});

test("スマホ詳細ナビのCSSはUI polishの後に初期化する", async () => {
  const app = await read("public/app.js");
  assert.match(app, /initMobileDetailNav/);
  assert.match(app, /initUiPolish\(\);\s*initMobileDetailNav\(\);/);
});
