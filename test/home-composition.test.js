import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("NOWはCONTINUE・CHOOSEの2モードだけを所有する", async () => {
  const source = await read("public/views/home-composition.js");
  assert.match(source, /key: "continue"/);
  assert.match(source, /key: "choose"/);
  assert.doesNotMatch(source, /key: "explore"/);
  assert.doesNotMatch(source, /key: "reflect"/);
  assert.match(source, /HOME_MODES/);
});

test("NOWのMode Switcherは続き・次を選ぶの2択に絞る", async () => {
  const source = await read("public/views/home-composition.js");
  const css = await read("public/styles/home-decision-surface.css");
  assert.match(source, /homeModeSwitcher/);
  assert.match(source, /data-home-mode="continue"/);
  assert.match(source, /data-home-mode="choose"/);
  assert.doesNotMatch(source, /data-home-mode="explore"/);
  assert.match(source, /zone\.hidden = key !== mode/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test("NOW初期モードは進行中があればCONTINUE、なければCHOOSE", async () => {
  const source = await read("public/views/home-composition.js");
  assert.match(source, /function recommendedHomeMode/);
  assert.match(source, /if \(hasContinueItems\(\)\) return "continue"/);
  assert.match(source, /return "choose"/);
  assert.match(source, /work\.status === "active"/);
});

test("CONTINUEはResume Surfaceを使い、時刻の意味付けはhome.jsへ委ねる", async () => {
  const source = await read("public/views/home-composition.js");
  const home = await read("public/views/home.js");
  const css = await read("public/styles/home-decision-surface.css");
  assert.match(source, /enhanceContinueCards/);
  assert.match(home, /home-resume-primary/);
  assert.match(home, /home-resume-secondary/);
  assert.match(home, /const ordered = \[\.\.\.reading\];/);
  assert.match(css, /\.home-resume-layout\{/);
});

test("CHOOSEは評価・メモを除き、読む優先度Surfaceを維持する", async () => {
  const source = await read("public/views/home-composition.js");
  const css = await read("public/styles/home-decision-surface.css");
  assert.match(source, /readingPrioritySurfaceMarkup\(work, "choose"\)/);
  assert.match(source, /:scope > \.card-rating/);
  assert.match(source, /:scope > \.card-note-row/);
  assert.match(source, /random-reroll-actions/);
  assert.match(css, /home-choice-priority/);
});

test("HeroコピーはNOWの意思決定だけを扱う", async () => {
  const source = await read("public/views/home-composition.js");
  assert.match(source, /NOW \/ YOUR CULTURE/);
  assert.match(source, /今日は、どれに戻る？/);
  assert.match(source, /次は、何にする？/);
  assert.doesNotMatch(source, /興味から探す。/);
});

test("Home CompositionはMutationObserverではなくrender完了イベントで再構成する", async () => {
  const source = await read("public/views/home-composition.js");
  const home = await read("public/views/home.js");
  assert.doesNotMatch(source, /MutationObserver/);
  assert.match(source, /home:rendered/);
  assert.match(home, /new CustomEvent\("home:rendered"\)/);
});

test("Home CompositionはEditorial Homeの後で初期化する", async () => {
  const app = await read("public/app.js");
  assert.match(app, /initEditorialHome\(\);\s*initHomeComposition\(\);/);
});

test("CHOOSE操作は1本のtoolbarに集約する", async () => {
  const source = await read("public/views/home-composition.js");
  assert.match(source, /hero\.append\(switcher\)/);
  assert.match(source, /home-choose-toolbar/);
  assert.match(source, /読む順番を整理 →/);
  assert.match(source, /random-reroll-actions/);
});
