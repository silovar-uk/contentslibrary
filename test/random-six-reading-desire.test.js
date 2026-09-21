import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("CHOOSEは6冊抽選ではなく3候補Decision Deckを描画する", async () => {
  const source = await read("public/views/home.js");
  assert.match(source, /skeletonCards\(3\)/);
  assert.match(source, /buildDecisionDeck/);
  assert.match(source, /PRIORITY|DECISION_SLOT_LABELS/);
  assert.doesNotMatch(source, /pickRandomWorks\(scope, 6/);
});

test("読みたさUIはアプリ初期化から撤去したままにする", async () => {
  const app = await read("public/app.js");
  assert.doesNotMatch(app, /initReadingDesire/);
  assert.doesNotMatch(app, /views\/reading-desire\.js/);
});

test("CHOOSEは理由表示とKEEP操作を持つ", async () => {
  const home = await read("public/views/home.js");
  assert.match(home, /decision-candidate-kind/);
  assert.match(home, /decision-candidate-reason/);
  assert.match(home, /data-decision-keep/);
  assert.match(home, /残しています/);
  assert.match(home, /残り\$\{remaining\}件を引き直す/);
});

test("ランダム一覧では読む優先度の管理UIを直接生成せずCompositionへ委ねる", async () => {
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

test("旧読みたさ表示はランダムカードから隠す", async () => {
  const css = await read("public/styles/ui-polish.css");
  assert.match(css, /#randomStage \.reading-desire-card\{display:none!important\}/);
});
