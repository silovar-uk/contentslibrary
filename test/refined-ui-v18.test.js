import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('最終UIは起動画面を外す前に読み込まれる', async () => {
  const entry = await read('public/app.js');
  const refined = entry.indexOf("./app-v18-refined-ui.js");
  const bootstrap = entry.indexOf("./app-v16-bootstrap.js");
  assert.ok(refined >= 0);
  assert.ok(bootstrap > refined);
});

test('最終CSSをモジュール評価時に先読みする', async () => {
  const app = await read('public/app-v18-refined-ui.js');
  assert.match(app, /const V18_STYLE = '\/v18-refined-ui\.css'/);
  assert.match(app, /ensureStyleV18\(\);/);
  assert.ok(app.indexOf('ensureStyleV18();') < app.indexOf('DOMContentLoaded'));
});

test('ヒーローとジャンル棚の視覚量を抑える', async () => {
  const css = await read('public/v18-refined-ui.css');
  assert.match(css, /\.hero-row\.v14-random-hero[\s\S]*?background:var\(--ref-surface\)/);
  assert.match(css, /font-size:clamp\(38px,4\.7vw,62px\)/);
  assert.match(css, /\.v15-genre-shelf[\s\S]*?box-shadow:none/);
  assert.match(css, /\.v15-shelf-item:nth-child\(-n\+3\)/);
});

test('一覧カードは通常時に浮かさず選択時だけ強調する', async () => {
  const css = await read('public/v18-refined-ui.css');
  assert.match(css, /\.work-card\{[\s\S]*?box-shadow:none/);
  assert.match(css, /\.work-card\[aria-current="true"\][\s\S]*?inset 3px 0 var\(--genre-color\)/);
  assert.match(css, /\.work-card\[aria-current="true"\]:after\{display:none\}/);
});

test('詳細ヘッダーをスクロール中も保持する', async () => {
  const css = await read('public/v18-refined-ui.css');
  assert.match(css, /\.detail-header\{[\s\S]*?position:sticky/);
  assert.match(css, /backdrop-filter:blur\(14px\)/);
});

test('スマホナビは現在地をaria-currentで示す', async () => {
  const app = await read('public/app-v18-refined-ui.js');
  const css = await read('public/v18-refined-ui.css');
  assert.match(app, /setAttribute\('aria-current', 'page'\)/);
  assert.match(app, /lastMobileViewV18/);
  assert.match(css, /\.mobile-nav button\[aria-current="page"\]/);
  assert.match(css, /\.mobile-nav button\[aria-current="page"\]:after/);
});

test('スマホでもジャンル棚と詳細操作を一列で読める', async () => {
  const css = await read('public/v18-refined-ui.css');
  assert.match(css, /@media\(max-width:767px\)[\s\S]*?\.v15-shelf-grid\{grid-template-columns:1fr/);
  assert.match(css, /@media\(max-width:380px\)[\s\S]*?\.detail-actions\{grid-template-columns:1fr\}/);
});

test('CSSの波括弧が対応している', async () => {
  const css = await read('public/v18-refined-ui.css');
  let depth = 0;
  for (const char of css) {
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    assert.ok(depth >= 0, '閉じ波括弧が多すぎます');
  }
  assert.equal(depth, 0);
});
