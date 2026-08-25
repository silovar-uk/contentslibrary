import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WORK_STATUSES, STATUS_LABELS } from '../public/shared/work-domain.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('所持・未読をDB・API・UIで扱える', async () => {
  const migration = await read('migrations/0004_owned_unread.sql');
  const types = await read('src/types.ts');
  const routes = await read('src/routes/works.ts');
  const html = await read('public/index.html');
  const format = await read('public/core/format.js');
  assert.match(migration, /owned_unread/);
  assert.equal(WORK_STATUSES.includes('owned_unread'), true);
  assert.equal(STATUS_LABELS.owned_unread, '所持・未読');
  assert.match(types, /WORK_STATUS_OPTIONS/);
  assert.match(routes, /"owned_unread"/);
  assert.match(html, /value="owned_unread">所持・未読/);
  assert.match(format, /STATUS_LABELS/);
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
