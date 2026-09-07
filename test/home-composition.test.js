import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Home CompositionはCONTINUE・CHOOSE・EXPLORE・REFLECTの順を所有する", async () => {
  const source = await read("public/views/home-composition.js");
  assert.match(source, /key: "continue"/);
  assert.match(source, /key: "choose"/);
  assert.match(source, /key: "explore"/);
  assert.match(source, /key: "reflect"/);
  const continueAt = source.indexOf('key: "continue"');
  const chooseAt = source.indexOf('key: "choose"');
  const exploreAt = source.indexOf('key: "explore"');
  const reflectAt = source.indexOf('key: "reflect"');
  assert.ok(continueAt < chooseAt && chooseAt < exploreAt && exploreAt < reflectAt);
  assert.match(source, /ensureZones/);
  assert.match(source, /moveIntoBody/);
});

test("進行中とランダム候補の有無に応じて空ゾーンを隠す", async () => {
  const source = await read("public/views/home-composition.js");
  assert.match(source, /function hasContinueItems/);
  assert.match(source, /#readingStrip \.reading-card/);
  assert.match(source, /function chooseHasCandidates/);
  assert.match(source, /\.random-empty/);
  assert.match(source, /zones\.continue\.hidden/);
  assert.match(source, /zones\.choose\.hidden/);
});

test("旧Home上位サーフェスをCompositionが除去する", async () => {
  const source = await read("public/views/home-composition.js");
  assert.match(source, /#readingPriorityHomeHub/);
  assert.match(source, /#walletStacks/);
  assert.match(source, /#recentlyEditedBooksSection/);
  assert.match(source, /removeLegacyHomeSurfaces/);
});

test("HeroコピーはContinue・Choose・Exploreの状態に合わせる", async () => {
  const source = await read("public/views/home-composition.js");
  assert.match(source, /今日は、どれに戻る？/);
  assert.match(source, /次は、何にする？/);
  assert.match(source, /興味から、次を探す。/);
});

test("スマホExploreはジャンルとテーマを切り替える", async () => {
  const source = await read("public/views/home-composition.js");
  const css = await read("public/styles/home-decision-surface.css");
  assert.match(source, /data-home-explore-mode="genre"/);
  assert.match(source, /data-home-explore-mode="theme"/);
  assert.match(css, /\.home-explore-tabs\{display:flex\}/);
  assert.match(css, /data-explore-mode="genre"/);
  assert.match(css, /data-explore-mode="theme"/);
});

test("Home CompositionはEditorial Homeの後で初期化する", async () => {
  const app = await read("public/app.js");
  assert.match(app, /import \{ initHomeComposition \} from "\.\/views\/home-composition\.js"/);
  assert.match(app, /initEditorialHome\(\);\s*initHomeComposition\(\);/);
});
