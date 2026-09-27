import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("EXPLOREはHomeではなくLibraryの折りたたみ面に存在する", async () => {
  const html = await read("public/index.html");
  const home = await read("public/views/home-composition.js");
  assert.match(html, /id="libraryExplore"/);
  assert.match(html, /id="libraryExploreBody"/);
  assert.match(html, /data-library-explore-mode="genre"/);
  assert.match(html, /data-library-explore-mode="theme"/);
  assert.match(html, /data-library-explore-mode="creator"/);
  assert.match(html, /data-library-explore-mode="label"/);
  assert.doesNotMatch(home, /data-home-explore-mode|key: "explore"/);
});

test("Library Exploreはジャンル・テーマ・著者・レーベルを1つのControllerで切り替える", async () => {
  const source = await read("public/views/library-explore.js");
  assert.match(source, /MODES = \["genre", "theme", "creator", "label"\]/);
  assert.match(source, /genre\.hidden = mode !== "genre"/);
  assert.match(source, /theme\.hidden = mode !== "theme"/);
  assert.match(source, /renderSourceShelves\(mode\)/);
  assert.match(source, /localStorage\.setItem\(MODE_KEY/);
});

test("著者・レーベル棚のDOM所有先はLibrary Exploreである", async () => {
  const source = await read("public/views/source-shelves.js");
  const homeExperience = await read("public/views/home-experience.js");
  const library = await read("public/views/library-explore.js");
  assert.match(source, /#libraryExploreBody/);
  assert.match(source, /\.library-explore-tabs/);
  assert.doesNotMatch(source, /data-home-zone="explore"/);
  assert.doesNotMatch(homeExperience, /initSourceShelves/);
  assert.match(library, /initSourceShelves\(\)/);
});

test("ジャンル・テーマ棚はLibrary表示中もstate更新に追従する", async () => {
  const home = await read("public/views/home.js");
  assert.match(home, /export function renderExploreShelves/);
  assert.match(home, /subscribe\(renderExploreShelves\)/);
  assert.match(home, /renderShelf\(\)/);
  assert.match(home, /renderThemeShelf\(\)/);
});

test("Library Exploreはアプリ起動時にLibraryと一緒に初期化する", async () => {
  const app = await read("public/app.js");
  assert.match(app, /import \{ initLibraryExplore \}/);
  assert.match(app, /initLibrary\(\);\s*initLibraryBookcase\(\);\s*initLibraryExplore\(\);/);
});

test("Exploreはモバイルでも4軸切替と縦スクロールで収まる", async () => {
  const css = await read("public/styles/library-explore.css");
  assert.match(css, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:767px\)/);
  assert.match(css, /max-height:58vh/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test("モバイル主要導線はHomeではなくNOWと表示する", async () => {
  const html = await read("public/index.html");
  assert.match(html, /data-mobile-view="home"><span>⌂<\/span>NOW<\/button>/);
});
