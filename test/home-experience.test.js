import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const moduleSource = readFileSync(new URL("../public/views/home-experience.js", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../public/styles/home-experience.css", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

test("Home Experienceは最近編集した本を生成せずFeaturedの表紙装飾に専念する", () => {
  assert.doesNotMatch(moduleSource, /recentlyEditedBooks/);
  assert.doesNotMatch(moduleSource, /最近編集した本/);
  assert.doesNotMatch(moduleSource, /mountRecentBooksSection/);
  assert.match(moduleSource, /decorateRandomCards/);
});

test("random cards use registered covers with a designed fallback", () => {
  assert.match(moduleSource, /isAllowedCoverUrl/);
  assert.match(moduleSource, /coverThumbUrl/);
  assert.match(moduleSource, /home-cover-fallback/);
  assert.match(moduleSource, /decorateRandomCards/);
  assert.match(moduleSource, /data-home-cover-for/);
});

test("random stage observer disconnects before decorating", () => {
  assert.match(moduleSource, /randomStageObserver\.disconnect\(\)/);
  assert.match(moduleSource, /observe\(stage, \{ childList: true \}\)/);
});

test("desktop header keeps actions horizontal and collapses duplicate entries on laptop widths", () => {
  assert.match(cssSource, /writing-mode:horizontal-tb/);
  assert.match(cssSource, /white-space:nowrap/);
  assert.match(cssSource, /max-width:1279px/);
  assert.match(cssSource, /#bulkAddTopButton/);
  assert.match(cssSource, /#bulkJsonTopButton/);
  assert.match(cssSource, /data-action="draw-random"/);
});

test("Featuredの表紙は2:3を保ち、スマホでもカード内に収まる", () => {
  assert.match(cssSource, /aspect-ratio:2\/3/);
  assert.match(cssSource, /\.random-pick-main\.is-cover-led \.home-cover-frame/);
  assert.match(cssSource, /@media \(max-width:767px\)/);
  assert.doesNotMatch(cssSource, /recent-book-grid/);
});

test("home experience is initialized from the app entry", () => {
  assert.match(appSource, /import \{ initHomeExperience \} from "\.\/views\/home-experience\.js"/);
  assert.match(appSource, /initHomeExperience\(\)/);
});
