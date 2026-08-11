import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("ホームにEditorial階層を付与する", async () => {
  const source = await read("public/views/editorial-home.js");
  assert.match(source, /editorial-home/);
  assert.match(source, /editorial-random-feature/);
  assert.match(source, /editorial-priority-feature/);
  assert.match(source, /editorial-reading-feature/);
});

test("ジャンル棚とテーマ棚を探索グリッドへまとめる", async () => {
  const source = await read("public/views/editorial-home.js");
  assert.match(source, /editorialExploreGrid/);
  assert.match(source, /grid\.append\(genre\)/);
  assert.match(source, /grid\.append\(theme\)/);
});

test("既存idを保持したままDOMを包む", async () => {
  const source = await read("public/views/editorial-home.js");
  assert.match(source, /#genreShelf/);
  assert.match(source, /#themeShelf/);
  assert.match(source, /#readingStrip/);
  assert.match(source, /#randomStage/);
  assert.doesNotMatch(source, /innerHTML\s*=\s*`[\s\S]*randomStage/);
});

test("Editorial CSSは大中小の面積差を持つ", async () => {
  const css = await read("public/styles/editorial-home.css");
  assert.match(css, /\.editorial-random-feature/);
  assert.match(css, /\.editorial-explore-grid\{display:grid;grid-template-columns:minmax\(0,1\.2fr\) minmax\(320px,\.8fr\)/);
  assert.match(css, /\.editorial-recents-grid/);
  assert.match(css, /\.editorial-stats/);
});

test("スマホではEditorialカードを単列へ縮退する", async () => {
  const css = await read("public/styles/editorial-home.css");
  assert.match(css, /@media\(max-width:767px\)/);
  assert.match(css, /\.editorial-explore-grid\{gap:12px/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
});

test("アプリ起動時にEditorial Homeを初期化する", async () => {
  const app = await read("public/app.js");
  assert.match(app, /initEditorialHome/);
  assert.match(app, /initHomeExperience\(\);\s*initEditorialHome\(\);/);
});
