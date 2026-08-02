import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('作品ごとのお気に入りと5段階評価APIを公開する', async () => {
  const index = await read('src/index.ts');
  const source = await read('src/routes/work-preference-v131.ts');
  assert.match(index, /\/preferences/);
  assert.match(index, /updateWorkPreferenceV131/);
  assert.match(source, /評価は1〜5の5段階/);
  assert.match(source, /metadata\.favorite/);
  assert.match(source, /previousFavorite/);
});

test('AIのJSON取込は事実情報だけをホワイトリスト化する', async () => {
  const source = await read('src/routes/work-tools-v13.ts');
  assert.match(source, /WORK_FACT_KEYS/);
  assert.match(source, /original_title/);
  assert.match(source, /publisher/);
  assert.match(source, /publication_date/);
  assert.match(source, /isbn_13/);
  assert.match(source, /creators/);
  assert.match(source, /sources/);
  assert.match(source, /推測、感想、評価、おすすめ度、ジャンル、テーマ、タグは書かない/);
  assert.doesNotMatch(source, /payload\.facts\.rating/);
  assert.doesNotMatch(source, /syncLabels/);
});

test('個別JSONはファイルではなくコピーと貼り付けで扱う', async () => {
  const source = await read('public/views/detail.js');
  const html = await read('public/index.html');
  assert.match(html, /プロンプト＋JSONをコピー/);
  assert.match(html, /AIから返ったJSON/);
  assert.match(source, /navigator\.clipboard/);
  assert.match(source, /data-fact-import/);
  assert.doesNotMatch(html, /type=["']file["']/);
});

test('お気に入りと評価で絞り込みと並び替えができる', async () => {
  const route = await read('src/routes/library-v13.ts');
  const store = await read('public/core/store.js');
  const html = await read('public/index.html');
  assert.match(route, /json_extract\(w\.metadata_json, '\$\.favorite'\)/);
  assert.match(route, /favorite_first/);
  assert.match(route, /rating_exact/);
  assert.match(route, /rating_asc/);
  assert.match(html, /filterFavorite/);
  assert.match(html, /filterRatingExact/);
  assert.match(html, /お気に入り・評価順/);
  assert.match(store, /favorite_first: /);
});

test('一覧は評価の温度とお気に入りの栞で色分けする', async () => {
  const css = await read('public/styles/app.css');
  assert.match(css, /\.rating\{/);
  assert.match(css, /\.favorite-mark\{/);
  assert.match(css, /\.rating-picker button\.is-on/);
});
