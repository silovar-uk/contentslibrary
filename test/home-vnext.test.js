import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Home vNextはHomeを3モードのDecision Surfaceとして持つ", async () => {
  const store = await read("public/core/store.js");
  const composition = await read("public/views/home-composition.js");
  assert.match(store, /homeMode: null/);
  assert.match(store, /export function setHomeMode/);
  assert.match(composition, /home-mode-switcher/);
  assert.match(composition, /zone\.hidden = key !== mode/);
  assert.doesNotMatch(composition, /key: "reflect"/);
});

test("CONTINUEはPrimary Resume 1件とSecondary最大3件に分ける", async () => {
  const home = await read("public/views/home.js");
  assert.match(home, /function readingResumeMarkup/);
  assert.match(home, /const primary = ordered\[0\]/);
  assert.match(home, /const secondary = ordered\.slice\(1, 4\)/);
  assert.match(home, /readingCardMarkup\(primary, \{ primary: true \}\)/);
  assert.match(home, /reading-card\$\{primary \? " home-resume-primary" : ""\}/);
  assert.match(home, /home-cover-frame--continue/);
  assert.match(home, /workFaceMarkup\(work\)/);
  assert.match(home, /home-resume-secondary-item/);
});

test("REFLECTはRecord Viewへ分離される", async () => {
  const html = await read("public/index.html");
  const app = await read("public/app.js");
  const record = await read("public/views/record.js");
  assert.match(html, /id="recordView"/);
  assert.match(html, /id="recordRecentNotes"/);
  assert.match(html, /id="recordRecentWorks"/);
  assert.match(html, /id="recordStats"/);
  assert.match(app, /initRecord/);
  assert.match(app, /loadRecord/);
  assert.match(record, /recentNotes/);
  assert.match(record, /recentOther/);
  assert.match(record, /stats/);
});

test("RecordはDecision Memoryを独立した履歴として表示する", async () => {
  const html = await read("public/index.html");
  const record = await read("public/views/record.js");
  assert.match(html, /id="recordDecisions"/);
  assert.match(html, /DECISION MEMORY/);
  assert.match(record, /readDecisionMemory/);
  assert.match(record, /decisionMemoryMarkup/);
  assert.match(record, /decision-memory-change/);
});

test("Mobile Navigationは4 Destination + Add Actionである", async () => {
  const html = await read("public/index.html");
  assert.match(html, /data-mobile-view="home"/);
  assert.match(html, /data-mobile-view="library"/);
  assert.match(html, /data-mobile-view="record"/);
  assert.match(html, /data-mobile-view="settings"/);
  assert.match(html, /class="mobile-add" data-action="open-work-dialog"/);
  assert.doesNotMatch(html, /class="mobile-add"[^>]*data-mobile-view/);
  assert.doesNotMatch(html, /data-preset="completed"><span>≡<\/span>記録/);
});

test("Mobile Navigationの現在地はaria-currentで示す", async () => {
  const app = await read("public/app.js");
  const css = await read("public/styles/ui-polish.css");
  assert.match(app, /setAttribute\("aria-current", "page"\)/);
  assert.match(app, /removeAttribute\("aria-current"\)/);
  assert.match(css, /mobile-nav button\[aria-current="page"\]/);
});

test("Home検索は折りたたまれLibraryでは常時表示される", async () => {
  const html = await read("public/index.html");
  const search = await read("public/views/mobile-search.js");
  const css = await read("public/styles/full-ui-polish.css");
  assert.match(html, /data-action="toggle-mobile-search"/);
  assert.match(search, /mobile-search-open/);
  assert.match(css, /app-shell\[data-view="library"\] \.topbar \.global-search/);
  assert.match(css, /app-shell\.mobile-search-open \.topbar \.global-search/);
});

test("Home layoutはdecision surfaceが所有しlegacy CSSは列数を上書きしない", async () => {
  const decision = await read("public/styles/home-decision-surface.css");
  const polish = await read("public/styles/ui-polish.css");
  const resilience = await read("public/styles/mobile-text-resilience.css");
  assert.match(decision, /home-zone-choose \.editorial-random-feature \.random-pick-grid/);
  assert.match(decision, /@media\(max-width:767px\)[\s\S]*grid-template-columns:minmax\(0,1fr\)/);
  assert.doesNotMatch(polish, /#randomStage \.random-pick-grid,[\s\S]{0,180}grid-template-columns/);
  assert.doesNotMatch(resilience, /\.random-pick-grid\{grid-template-columns/);
});


test("PC Homeは高さ560px以上でページスクロールを発生させない舞台を持つ", async () => {
  const css = await read("public/styles/home-decision-surface.css");
  assert.match(css, /min-width:1024px/);
  assert.match(css, /min-height:560px/);
  assert.match(css, /height:calc\(100dvh - var\(--topbar\)\)/);
  assert.match(css, /\.home-decision-flow\{flex:1;min-height:0\}/);
  assert.match(css, /\.home-zone:not\(\[hidden\]\)\{height:100%;min-height:0\}/);
});
