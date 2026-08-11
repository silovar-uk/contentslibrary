import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("ランダム抽選は6冊になる", async () => {
  const source = await read("public/views/home.js");
  assert.match(source, /skeletonCards\(6\)/);
  assert.match(source, /pickRandomWorks\(scope, 6,/);
});

test("読みたさUIはアプリ初期化から撤去する", async () => {
  const app = await read("public/app.js");
  assert.doesNotMatch(app, /initReadingDesire/);
  assert.doesNotMatch(app, /views\/reading-desire\.js/);
});

test("ランダム一覧では読む優先度を選べる", async () => {
  const surface = await read("public/views/reading-priority-surfaces.js");
  assert.match(surface, /decorateRandomCards/);
  assert.match(surface, /reading-priority-surface-random/);
  assert.match(surface, /data-reading-priority-set/);
});

test("通常一覧と詳細でも読む優先度を選べる", async () => {
  const surface = await read("public/views/reading-priority-surfaces.js");
  assert.match(surface, /decorateLibraryCards/);
  assert.match(surface, /decorateDetail/);
  assert.match(surface, /reading-priority-detail-wrap/);
});

test("スマホのランダム優先度は現在値だけ見せ、選択はBottom Sheetに委譲する", async () => {
  const css = await read("public/styles/ui-polish.css");
  const lightEdit = await read("public/views/light-edit-surfaces.js");
  assert.match(css, /reading-priority-surface-random\{[\s\S]*display:flex!important/);
  assert.match(css, /reading-priority-surface-random \.reading-priority-surface-menu\{display:none!important\}/);
  assert.match(lightEdit, /openPrioritySheet/);
  assert.match(lightEdit, /\.reading-priority-surface > summary/);
});

test("旧読みたさ表示はランダムカードから隠す", async () => {
  const css = await read("public/styles/ui-polish.css");
  assert.match(css, /#randomStage \.reading-desire-card\{display:none!important\}/);
});
