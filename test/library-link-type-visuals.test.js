import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("URLがある作品は一覧から別タブで元ページを開ける", async () => {
  const source = await read("public/views/work-media-url.js");
  assert.match(source, /work\.metadata\?\.source_url/);
  assert.match(source, /work-card-source-link/);
  assert.match(source, /main\.after\(link\)/);
  assert.match(source, /link\.target = "_blank"/);
  assert.match(source, /noopener noreferrer/);
  assert.match(source, /externalIconMarkup/);
});

test("一覧の種別はSVGアイコンと文字を併記し種別クラスを持つ", async () => {
  const source = await read("public/views/work-media-url.js");
  assert.match(source, /TYPE_LABELS/);
  assert.match(source, /typeIconMarkup/);
  assert.match(source, /work-type-icon/);
  assert.match(source, /work-type-badge is-\$\{work\.type\}/);
  assert.match(source, /<span>\$\{esc\(TYPE_LABELS\[work\.type\]/);
});

test("種別ごとに文字とアイコンへ異なる色を与える", async () => {
  const css = await read("public/styles/work-media-url.css");
  for (const type of ["book", "manga", "movie", "anime", "drama", "video", "article", "other"]) {
    assert.match(css, new RegExp(`work-type-badge\\.is-${type}`));
  }
  assert.match(css, /--work-type-color/);
  assert.match(css, /color:var\(--work-type-color\)/);
});

test("必須と任意は背景を持たず小さな色付きドットと文字で示す", async () => {
  const css = await read("public/styles/work-media-url.css");
  assert.match(css, /\.required-mark,\.optional-mark/);
  assert.match(css, /background:transparent!important/);
  assert.match(css, /\.required-mark\{color:/);
  assert.match(css, /\.optional-mark\{color:/);
  assert.match(css, /\.required-mark::before,\.optional-mark::before/);
  assert.match(css, /border-radius:50%/);
});

test("一覧外部リンクを追加してもデスクトップの横並びを維持する", async () => {
  const css = await read("public/styles/work-media-url.css");
  assert.match(css, /work-card:has\(> \.work-card-source-link\)/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) auto auto auto auto/);
});
