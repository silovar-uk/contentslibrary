import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('主ジャンルの入力順をDBへ保存する', async () => {
  const migration = await read('migrations/0015_add_work_label_position.sql');
  const db = await read('src/db.ts');
  assert.match(migration, /ADD COLUMN position INTEGER NOT NULL DEFAULT 0/);
  assert.match(migration, /idx_work_labels_work_position/);
  assert.match(db, /values\.entries\(\)/);
  assert.match(db, /work_labels \(work_id, label_id, position\)/);
  assert.match(db, /l\.kind, wl\.position, l\.name/);
});

test('ジャンル定義と表記揺れを一元管理する', async () => {
  const catalog = await read('src/domain/genre-catalog-v15.ts');
  for (const genre of ['小説', '漫画', 'ビジネス・経営', '哲学・思想', 'IT・テクノロジー', '芸術・デザイン']) {
    assert.match(catalog, new RegExp(genre));
  }
  assert.match(catalog, /resolveGenreV15/);
  assert.match(catalog, /normalizedAliasesForGenreV15/);
  assert.match(catalog, /allNormalizedGenreAliasesV15/);
});

test('ジャンル棚は専用APIでD1集計する', async () => {
  const index = await read('src/index.ts');
  const route = await read('src/routes/genre-insights-v15.ts');
  assert.match(index, /\/api\/insights\/genres/);
  assert.match(index, /getGenreInsightsV15/);
  assert.match(route, /ROW_NUMBER\(\) OVER/);
  assert.match(route, /wl\.position/);
  assert.match(route, /unread: "AND w\.status IN \('want', 'owned_unread'\)"/);
  assert.match(route, /unmapped_labels/);
  assert.match(route, /largest_genre/);
});

test('棚から主ジャンルと複数状態で作品一覧を絞り込む', async () => {
  const library = await read('src/routes/library-v13.ts');
  assert.match(library, /searchParams\.get\("statuses"\)/);
  assert.match(library, /w\.status IN/);
  assert.match(library, /searchParams\.get\("genre_id"\)/);
  assert.match(library, /wl\.position = 0/);
  assert.match(library, /genreId === "unclassified"/);
  assert.match(library, /genreId === "other"/);
});

test('ジャンル棚をホームに表示し一覧へ接続する', async () => {
  const app = await read('public/app-v15-genre-shelf.js');
  const entry = await read('public/app.js');
  const css = await read('public/v15-genre-shelf.css');
  assert.match(entry, /app-v15-genre-shelf\.js/);
  assert.match(app, /あなたのジャンル棚/);
  assert.match(app, /\/api\/insights\/genres\?scope=/);
  assert.match(app, /genre_id/);
  assert.match(app, /want,owned_unread/);
  assert.match(app, /v15-shelf-filter-chip/);
  assert.match(css, /v15-shelf-grid/);
  assert.match(css, /var\(--genre-color\)/);
  assert.match(css, /prefers-reduced-motion/);
});

test('作品数分のDOMを作らず象徴的な背表紙数へ制限する', async () => {
  const app = await read('public/app-v15-genre-shelf.js');
  assert.match(app, /Math\.min\(8/);
  assert.match(app, /spineCountV15/);
  assert.doesNotMatch(app, /Array\.from\(\{ length: genre\.count/);
});
