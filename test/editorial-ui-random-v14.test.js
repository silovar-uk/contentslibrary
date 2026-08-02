import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

// v14時点ではサーバーAPI(/api/random-work)で1件だけ抽選していたが、全件常駐化に伴い
// クライアント側のpickRandomWorks(store.js)へ移した。サーバー往復がなくなり待ち時間ゼロになる。
test('次に読む作品の抽選はサーバー往復せずクライアント側で行う', async () => {
  const index = await read('src/index.ts');
  const store = await read('public/core/store.js');
  const home = await read('public/views/home.js');
  assert.doesNotMatch(index, /\/api\/random-work/);
  assert.match(store, /export function pickRandomWorks/);
  assert.match(home, /export function drawRandomPicks/);
  assert.match(home, /pickRandomWorks/);
});

test('ブランドアイコンをfaviconと左上で共用する', async () => {
  const html = await read('public/index.html');
  const favicon = await read('public/favicon.svg');
  assert.match(html, /link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg"/);
  assert.match(html, /brand-mark"><img src="\/favicon\.svg"/);
  assert.match(favicon, /<svg/);
});

test('ジャンルごとの色相を一覧・棚に適用する', async () => {
  const format = await read('public/core/format.js');
  const css = await read('public/styles/app.css');
  for (const genre of ['小説', '漫画', 'ビジネス・経営', '哲学・思想', 'IT・テクノロジー', '芸術・デザイン']) {
    assert.match(format, new RegExp(genre));
  }
  assert.match(format, /GENRE_CATALOG/);
  assert.match(format, /genreColorForWork/);
  assert.match(css, /var\(--genre-color\)/);
});

test('ランダム探索をホーム・ヘッダー・スマホへ配置する', async () => {
  const html = await read('public/index.html');
  const home = await read('public/views/home.js');
  assert.match(html, /次に読むものを/);
  assert.match(html, /data-action="draw-random"/);
  assert.match(html, /class="mobile-add"/);
  assert.match(html, /所持・未読＋読みたい/);
  assert.match(home, /読み始める/);
});

test('Unicode記号ではなくSVGアイコン体系を使う', async () => {
  const dom = await read('public/core/dom.js');
  assert.match(dom, /const ICONS = /);
  assert.match(dom, /<svg class="icon"/);
  assert.match(dom, /settings/);
  assert.match(dom, /shuffle/);
});
