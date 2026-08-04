import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const moduleSource = readFileSync(new URL("../public/views/home-experience.js", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../public/styles/home-experience.css", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

test("recently edited books are derived from books and sorted newest first", () => {
  assert.match(moduleSource, /filter\(\(work\) => work\.type === "book"\)/);
  assert.match(moduleSource, /String\(b\.updated_at \|\| b\.created_at/);
  assert.match(moduleSource, /localeCompare/);
  assert.match(moduleSource, /\.slice\(0, 5\)/);
  assert.match(moduleSource, /最近編集した本/);
});

test("random and recent cards use registered covers with a designed fallback", () => {
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

test("recent books are a five-column cover grid with mobile horizontal scrolling", () => {
  assert.match(cssSource, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(cssSource, /aspect-ratio:2\/3/);
  assert.match(cssSource, /scroll-snap-type:x mandatory/);
});

test("home experience is initialized from the app entry", () => {
  assert.match(appSource, /import \{ initHomeExperience \} from "\.\/views\/home-experience\.js"/);
  assert.match(appSource, /initHomeExperience\(\)/);
});
