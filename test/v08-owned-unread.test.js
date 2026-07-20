import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('所持・未読をDB・API・UIで扱える', async () => {
  const migration = await read('migrations/0004_owned_unread.sql');
  const types = await read('src/types.ts');
  const routes = await read('src/routes/works.ts');
  const html = await read('public/index.html');
  const app = await read('public/app-v02.js');
  assert.match(migration, /owned_unread/);
  assert.match(types, /"owned_unread"/);
  assert.match(routes, /"owned_unread"/);
  assert.match(html, /value="owned_unread">所持・未読/);
  assert.match(app, /owned_unread:'所持・未読'/);
});

test('ステージング移行はNotionメモを検証後にnotesへ保存する', async () => {
  const importer = await read('src/routes/import-center.ts');
  const migration = await read('migrations/0005_import_center.sql');
  assert.match(importer, /raw\.notes/);
  assert.match(importer, /INSERT INTO import_notes/);
  assert.match(importer, /INSERT INTO notes/);
  assert.match(importer, /applyNotes/);
  assert.match(importer, /applied_note_id/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS import_notes/);
});
