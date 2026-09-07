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

test("ランダム一覧では読む優先度の管理UIを混ぜない", async () => {
  const surface = await read("public/views/reading-priority-surfaces.js");
  assert.doesNotMatch(surface, /function decorateRandomCards/);
  assert.doesNotMatch(surface, /syncSurface\(card, work, "random"/);
  const composition = await read("public/views/home-composition.js");
  assert.match(composition, /dataset\.readingPriorityOrganize/);
  assert.match(composition, /読む順番を整理/);
});

test("通常一覧と詳細では読む優先度を選べる", async () => {
  const surface = await read("public/views/reading-priority-surfaces.js");
  assert.match(surface, /decorateLibraryCards/);
  assert.match(surface, /decorateDetail/);
  assert.match(surface, /reading-priority-detail-wrap/);
  assert.match(surface, /data-reading-priority-set/);
});

test("読む優先度はFeaturedではなくLibraryとDetailの管理文脈に限定する", async () => {
  const css = await read("public/styles/reading-priority-surfaces.css");
  assert.match(css, /reading-priority-surface-library/);
  assert.match(css, /reading-priority-detail-wrap/);
  assert.doesNotMatch(css, /reading-priority-surface-random/);
  assert.doesNotMatch(css, /reading-priority-home-hub/);
});

test("旧読みたさ表示はランダムカードから隠す", async () => {
  const css = await read("public/styles/ui-polish.css");
  assert.match(css, /#randomStage \.reading-desire-card\{display:none!important\}/);
});
