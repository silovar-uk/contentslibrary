import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const surfaces = fs.readFileSync("public/views/work-face-surfaces.js", "utf8");
const homeExperience = fs.readFileSync("public/views/home-experience.js", "utf8");
const rescue = fs.readFileSync("public/views/home-rescue.js", "utf8");
const css = fs.readFileSync("public/styles/work-face.css", "utf8");

test("CHOOSE/CONTINUE/一覧/Rescueが共通workFaceMarkupを使う", () => {
  assert.match(homeExperience, /workFaceMarkup\(work\)/);
  assert.match(surfaces, /home-cover-frame--continue/);
  assert.match(surfaces, /work-face-list-thumb/);
  assert.match(rescue, /work-face-rescue/);
  assert.match(rescue, /workFaceMarkup\(fullWork\)/);
});

test("新しいMutationObserverは追加しない", () => {
  assert.doesNotMatch(surfaces, /MutationObserver/);
});

test("生成装丁は12 toneと64px省略を持つ", () => {
  for (let i = 0; i < 12; i += 1) assert.match(css, new RegExp(`data-tone=\\"${i}\\"`));
  assert.match(css, /@container \(max-width:64px\)/);
});
