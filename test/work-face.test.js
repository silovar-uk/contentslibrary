import test from "node:test";
import assert from "node:assert/strict";
import { labelFromTitle, bindingFor, workFaceMarkup } from "../public/core/work-face.js";

test("末尾括弧からレーベルを読み取る", () => {
  assert.deepEqual(labelFromTitle("作品名 (新潮文庫 あ-4-1)"), { label: "新潮文庫", main: "作品名" });
  assert.deepEqual(labelFromTitle("作品名（講談社現代新書）"), { label: "講談社現代新書", main: "作品名" });
  assert.equal(labelFromTitle("括弧のない作品").label, "");
});

test("同じレーベルは同じtoneになる", () => {
  const a = bindingFor({ title: "甲 (新潮文庫 あ-1)", creator: "A", type: "book" });
  const b = bindingFor({ title: "乙 (新潮文庫 い-2)", creator: "B", type: "book" });
  assert.equal(a.tone, b.tone);
  assert.equal(a.band, 1);
});

test("作品種別と題の特徴から組み方を決める", () => {
  assert.equal(bindingFor({ title: "映画", type: "movie" }).layout, "poster");
  const manga = bindingFor({ title: "シリーズ 12", type: "manga" });
  assert.equal(manga.layout, "manga");
  assert.equal(manga.volume, "12");
  assert.equal(bindingFor({ title: "THIS IS A LONG ENGLISH TITLE", type: "book" }).layout, "horizontal");
  assert.equal(bindingFor({ title: "短い日本語の題", type: "book" }).layout, "vertical");
});

test("生成装丁の文字列はエスケープする", () => {
  const html = workFaceMarkup({ title: "<script>alert(1)</script>", creator: "A&B", type: "book", metadata: {} });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /A&amp;B/);
});

test("許可済み表紙画像は生成装丁より優先する", () => {
  const html = workFaceMarkup({ title: "作品", metadata: { cover_url: "https://m.media-amazon.com/images/P/4062748223.09.LZZZZZZZ.jpg" } });
  assert.match(html, /class="work-face-image"/);
  assert.match(html, /MZZZZZZZ/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /alt=""/);
});
