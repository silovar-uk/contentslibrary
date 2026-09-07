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

test("CONTINUEとCHOOSEは同じFeatured Shelf文法を共有し、役割別クラスを持つ", async () => {
  const source = await read("public/views/home-composition.js");
  const css = await read("public/styles/home-decision-surface.css");
  assert.match(source, /home-featured-shelf/);
  assert.match(source, /home-featured-continue/);
  assert.match(source, /home-featured-choose/);
  assert.match(css, /home-zone-continue \.editorial-reading-feature/);
  assert.match(css, /home-zone-choose \.editorial-random-feature/);
  assert.match(css, /home-zone-continue \.reading-strip\{display:flex/);
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

test("CHOOSEは読み始める・評価・メモを除き、読む優先度Surfaceへ置き換える", async () => {
  const source = await read("public/views/home-composition.js");
  const css = await read("public/styles/home-decision-surface.css");
  assert.match(source, /enhanceChooseCards/);
  assert.match(source, /readingPrioritySurfaceMarkup\(work, "choose"\)/);
  assert.match(source, /\[data-random-start\]/);
  assert.match(source, /:scope > \.card-rating/);
  assert.match(source, /:scope > \.card-note-row/);
  assert.match(css, /editorial-random-feature \[data-random-start\]/);
  assert.match(css, /home-choice-priority/);
});

test("CONTINUEのCompositionは戻るCTAだけを足し、時刻の意味付けはHomeのResume Signalsへ委ねる", async () => {
  const source = await read("public/views/home-composition.js");
  assert.match(source, /enhanceContinueCards/);
  assert.match(source, /作品へ戻る →/);
  assert.doesNotMatch(source, /最終更新/);
  assert.doesNotMatch(source, /reading-card-updated/);
  assert.doesNotMatch(source, /fmtDate/);
});

test("ジャンル棚は展開操作なしで全件を見せ、ジャンル数を明示する", async () => {
  const source = await read("public/views/home-composition.js");
  const css = await read("public/styles/home-decision-surface.css");
  assert.match(source, /enhanceGenreShelf/);
  assert.match(source, /\[data-shelf-expand\]/);
  assert.match(source, /dataset\.genreCount/);
  assert.match(css, /#genreShelf \.shelf-grid\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(150px,1fr\)\)/);
  assert.match(css, /max-height:none;overflow:visible/);
  assert.match(css, /#genreShelf \[data-shelf-expand\]\{display:none!important\}/);
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

test("スマホのCONTINUEとCHOOSEは1カード単位でsnapし、半端なカードを見せない", async () => {
  const source = await read("public/views/home-composition.js");
  const css = await read("public/styles/home-decision-surface.css");
  assert.match(source, /横にスワイプ →/);
  assert.match(css, /home-zone-continue \.reading-card\{flex:0 0 100%;min-width:100%/);
  assert.match(css, /grid-auto-columns:100%/);
  assert.match(css, /scroll-snap-stop:always/);
});

test("Home CompositionはEditorial Homeの後で初期化する", async () => {
  const app = await read("public/app.js");
  assert.match(app, /import \{ initHomeComposition \} from "\.\/views\/home-composition\.js"/);
  assert.match(app, /initEditorialHome\(\);\s*initHomeComposition\(\);/);
});
