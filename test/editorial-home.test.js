import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Editorial HomeはNOWのFeatured表示だけを装飾する", async () => {
  const source = await read("public/views/editorial-home.js");
  assert.match(source, /editorial-home/);
  assert.match(source, /editorial-random-feature/);
  assert.match(source, /editorial-reading-feature/);
  assert.doesNotMatch(source, /ensureExploreGrid/);
  assert.doesNotMatch(source, /#genreShelf|#themeShelf/);
});

test("既存idを保持したままCONTINUEとCHOOSEを包む", async () => {
  const source = await read("public/views/editorial-home.js");
  assert.match(source, /#readingStrip/);
  assert.match(source, /#randomStage/);
  assert.doesNotMatch(source, /innerHTML\s*=\s*`[\s\S]*randomStage/);
});

test("Editorial CSSはFeaturedと補助面の面積差を持つ", async () => {
  const css = await read("public/styles/editorial-home.css");
  assert.match(css, /\.editorial-random-feature/);
  assert.match(css, /\.editorial-recents-grid/);
  assert.match(css, /\.editorial-stats/);
});

test("アプリ起動時にEditorial装飾の後でHome Compositionを初期化する", async () => {
  const app = await read("public/app.js");
  assert.match(app, /initEditorialHome/);
  assert.match(app, /initHomeComposition/);
  assert.match(app, /initHomeExperience\(\);\s*initEditorialHome\(\);\s*initHomeComposition\(\);/);
});
