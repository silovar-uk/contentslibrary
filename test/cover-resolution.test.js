import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { amazonCoverUrlFromIsbn10, coverDisplayUrl, coverThumbUrl } from "../public/core/cover.js";

const routeSource = readFileSync(new URL("../src/routes/work-cover.ts", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const resolutionSource = readFileSync(new URL("../public/views/cover-resolution.js", import.meta.url), "utf8");

test("ISBNから生成する表紙候補は大サイズを使う", () => {
  assert.equal(
    amazonCoverUrlFromIsbn10("4101001014"),
    "https://m.media-amazon.com/images/P/4101001014.09.LZZZZZZZ.jpg"
  );
});

test("既存の中・小サイズURLを詳細表示では高解像度へ引き上げる", () => {
  assert.equal(
    coverDisplayUrl("https://m.media-amazon.com/images/P/4101001014.09.MZZZZZZZ.jpg"),
    "https://m.media-amazon.com/images/P/4101001014.09.LZZZZZZZ.jpg"
  );
  assert.equal(
    coverDisplayUrl("https://m.media-amazon.com/images/I/example._SL300_.jpg"),
    "https://m.media-amazon.com/images/I/example._SL800_.jpg"
  );
});

test("一覧とホームは極小画像ではなく中解像度サムネイルを使う", () => {
  assert.equal(
    coverThumbUrl("https://m.media-amazon.com/images/P/4101001014.09.LZZZZZZZ.jpg"),
    "https://m.media-amazon.com/images/P/4101001014.09.MZZZZZZZ.jpg"
  );
  assert.equal(
    coverThumbUrl("https://m.media-amazon.com/images/I/example._SL800_.jpg"),
    "https://m.media-amazon.com/images/I/example._SL320_.jpg"
  );
});

test("サーバー保存時も高解像度URLへ正規化する", () => {
  assert.match(routeSource, /LZZZZZZZ\.jpg/);
  assert.match(routeSource, /_SL800_\.jpg/);
  assert.doesNotMatch(routeSource, /return `[^`]*_SL300_/);
});

test("既存作品の詳細画像を表示時に引き上げる制御を起動する", () => {
  assert.match(appSource, /initCoverResolution/);
  assert.match(appSource, /initCoverResolution\(\)/);
  assert.match(resolutionSource, /detail-cover-image/);
  assert.match(resolutionSource, /coverDisplayUrl/);
  assert.match(resolutionSource, /MutationObserver/);
});
