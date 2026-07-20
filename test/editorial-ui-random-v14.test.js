import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('次に読む作品のランダムAPIを公開する', async () => {
  const index = await read('src/index.ts');
  const route = await read('src/routes/random-v14.ts');
  assert.match(index, /\/api\/random-work/);
  assert.match(index, /getRandomWorkV14/);
  assert.match(route, /owned_unread','want/);
  assert.match(route, /ORDER BY RANDOM\(\) LIMIT 1/);
  assert.match(route, /exclude/);
});

test('ブランドアイコンをfaviconと左上で共用する', async () => {
  const app = await read('public/app-v14.js');
  const favicon = await read('public/favicon.svg');
  assert.match(app, /V14_FAVICON = '\/favicon\.svg'/);
  assert.match(app, /brand-mark/);
  assert.match(app, /link\[rel="icon"\]/);
  assert.match(favicon, /<svg/);
  assert.match(favicon, /B34832/);
});

test('ジャンルごとの色相を一覧に適用する', async () => {
  const app = await read('public/app-v14.js');
  const css = await read('public/v14-editorial.css');
  for (const genre of ['小説','漫画','ビジネス・経営','哲学・思想','IT・テクノロジー','芸術・デザイン']) {
    assert.match(app, new RegExp(genre));
  }
  assert.match(app, /--genre-color/);
  assert.match(css, /var\(--genre-color\)/);
  assert.match(css, /v14-primary-genre/);
});

test('ランダム探索をホーム・ヘッダー・スマホへ配置する', async () => {
  const app = await read('public/app-v14.js');
  assert.match(app, /次に読むものを/);
  assert.match(app, /v14HeaderRandom/);
  assert.match(app, /v14-mobile-random/);
  assert.match(app, /所持・未読＋読みたい/);
  assert.match(app, /読み始める/);
});

test('Unicode記号ではなくSVGアイコン体系を使う', async () => {
  const app = await read('public/app-v14.js');
  assert.match(app, /ICONS_V14/);
  assert.match(app, /<svg class="v14-icon"/);
  assert.match(app, /settings/);
  assert.match(app, /shuffle/);
});
