import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

// テーマ横断ブラウズはサーバー側APIを追加せず、全件常駐スナップショットの
// labels.themeをクライアント側で集計する(ジャンル棚と同じ設計)。

test('テーマは1作品が複数持つ前提で、先頭1件だけでなく全件を集計する', async () => {
  const store = await read('public/core/store.js');
  assert.match(store, /export function themeData/);
  // ジャンル(labels.genre?.[0])と異なり、テーマはfor...ofで全件を数える
  const themeDataBody = store.match(/export function themeData[\s\S]*?\n}/)[0];
  assert.match(themeDataBody, /for \(const name of work\.labels\?\.theme \|\| \[\]\)/);
  assert.match(themeDataBody, /counts\.set\(name, \(counts\.get\(name\) \|\| 0\) \+ 1\)/);
});

test('テーマ絞り込みはgenre/theme/tag横断のlabelとは別に、完全一致で判定する', async () => {
  const store = await read('public/core/store.js');
  assert.match(store, /if \(filters\.theme && !\(work\.labels\?\.theme \|\| \[\]\)\.includes\(filters\.theme\)\) return false;/);
  assert.match(store, /theme: ""/);
});

test('テーマ棚はホームに表示し、クリックで一覧へ完全一致の絞り込みを適用する', async () => {
  const html = await read('public/index.html');
  const home = await read('public/views/home.js');
  const library = await read('public/views/library.js');
  const css = await read('public/styles/app.css');

  assert.match(html, /id="themeShelf"/);
  assert.match(html, /id="themeShelfBody"/);

  assert.match(home, /themeData\(/);
  assert.match(home, /themeNavigate/);
  assert.match(home, /data-theme-name/);

  assert.match(library, /export function themeNavigate\(name\)/);
  const themeNavigateBody = library.match(/export function themeNavigate[\s\S]*?\n}/)[0];
  assert.match(themeNavigateBody, /setFilters\(\{ theme: name \}\)/);

  assert.match(library, /f\.theme/);
  assert.match(library, /テーマ：/);

  assert.match(css, /\.theme-chip/);
});

test('記録タブ・すべて見るは新規イベントを増やさず既存のdata-presetへ寄せる', async () => {
  const html = await read('public/index.html');
  const app = await read('public/app.js');
  const home = await read('public/views/home.js');
  assert.doesNotMatch(html, /data-action="show-reading"/);
  assert.doesNotMatch(html, /data-mobile-view="records"/);
  assert.match(html, /data-preset="reading"/);
  assert.match(html, /data-preset="completed"/);
  assert.doesNotMatch(app, /app:apply-preset/);
  assert.doesNotMatch(app, /app:noop/);
  assert.doesNotMatch(home, /app:apply-preset/);
});
