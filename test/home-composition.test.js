import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Home CompositionはCONTINUE・CHOOSE・EXPLOREの3モードだけを所有する", async () => {
  const source = await read("public/views/home-composition.js");
  assert.match(source, /key: "continue"/);
  assert.match(source, /key: "choose"/);
  assert.match(source, /key: "explore"/);
  assert.doesNotMatch(source, /key: "reflect"/);
  const continueAt = source.indexOf('key: "continue"');
  const chooseAt = source.indexOf('key: "choose"');
  const exploreAt = source.indexOf('key: "explore"');
  assert.ok(continueAt < chooseAt && chooseAt < exploreAt);
});

test("HomeはMode Switcherから1つのMajor Surfaceだけを表示する", async () => {
  const source = await read("public/views/home-composition.js");
  const css = await read("public/styles/home-decision-surface.css");
  assert.match(source, /homeModeSwitcher/);
  assert.match(source, /data-home-mode="continue"/);
  assert.match(source, /data-home-mode="choose"/);
  assert.match(source, /data-home-mode="explore"/);
  assert.match(source, /zone\.hidden = key !== mode/);
  assert.match(source, /setHomeMode/);
  assert.match(css, /\.home-mode-switcher\{/);
  assert.match(css, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
});

test("Home初期モードは進行中→候補→探索の順で決める", async () => {
  const source = await read("public/views/home-composition.js");
  assert.match(source, /function recommendedHomeMode/);
  assert.match(source, /if \(hasContinueItems\(\)\) return "continue"/);
  assert.match(source, /if \(chooseHasCandidates\(\)\) return "choose"/);
  assert.match(source, /return "explore"/);
  assert.match(source, /work\.status === "active"/);
  assert.match(source, /\["want", "owned_unread"\]\.includes\(work\.status\)/);
});

test("CONTINUEはHomeのResume Surfaceを使い、時刻の意味付けはhome.jsへ委ねる", async () => {
  const source = await read("public/views/home-composition.js");
  const home = await read("public/views/home.js");
  const css = await read("public/styles/home-decision-surface.css");
  assert.match(source, /enhanceContinueCards/);
  assert.match(home, /home-resume-primary/);
  assert.match(home, /home-resume-secondary/);
  assert.match(home, /const ordered = \[\.\.\.reading\];/);
  assert.doesNotMatch(home, /resumeSortValue/);
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

test("EXPLOREはジャンル・テーマ・著者・レーベルを1つのSwitcherで切り替える", async () => {
  const source = await read("public/views/home-composition.js");
  const css = await read("public/styles/home-decision-surface.css");
  for (const mode of ["genre", "theme", "creator", "label"]) {
    assert.match(source, new RegExp(`data-home-explore-mode="${mode}"`));
  }
  assert.match(source, /EXPLORE_STORAGE_KEY/);
  assert.match(source, /renderSourceShelves\(exploreMode\)/);
  assert.match(source, /genre\.hidden = exploreMode !== "genre"/);
  assert.match(source, /theme\.hidden = exploreMode !== "theme"/);
  assert.match(css, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
});

test("Heroコピーの責務はHome Compositionだけが持つ", async () => {
  const source = await read("public/views/home-composition.js");
  const shuhari = await read("public/views/ui-shuhari-pr2.js");
  assert.match(source, /今日は、どれに戻る？/);
  assert.match(source, /次は、何にする？/);
  assert.match(source, /興味から探す。/);
  assert.doesNotMatch(shuhari, /primeHeroCopy|YOUR CULTURE, NEXT MOVE|今日は、どれに戻る？/);
});

test("Home CompositionはEditorial Homeの後で初期化する", async () => {
  const app = await read("public/app.js");
  assert.match(app, /initEditorialHome\(\);\s*initHomeComposition\(\);/);
});


test("Homeの切り替えはhero-row内、CHOOSE操作は1本のtoolbarに集約する", async () => {
  const source = await read("public/views/home-composition.js");
  assert.match(source, /hero\.append\(switcher\)/);
  assert.match(source, /home-choose-toolbar/);
  assert.match(source, /読む順番を整理 →/);
  assert.match(source, /random-reroll-actions/);
  assert.doesNotMatch(source, /data-genre-count/);
});
