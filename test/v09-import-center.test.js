import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('取込データは本番テーブルへ直接入れずステージングする', async () => {
  const migration = await read('migrations/0005_import_center.sql');
  for (const table of ['import_controls','import_batches','import_items','import_notes','import_conflicts','import_applied_changes']) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(migration, /FOREIGN KEY\(batch_id\) REFERENCES import_batches\(id\) ON DELETE CASCADE/);
  assert.match(migration, /status IN \('draft','uploading','review','validated','committing','committed','failed','rolled_back'\)/);
});

test('owner限定・時間制限・分割反映・取消を持つ', async () => {
  const route = await read('src/routes/import-center.ts');
  assert.match(route, /auth\.member\.role !== "owner"/);
  assert.match(route, /IMPORT_WINDOW_MINUTES = 60/);
  assert.match(route, /UPLOAD_CHUNK_LIMIT = 50/);
  assert.match(route, /COMMIT_CHUNK_LIMIT = 20/);
  assert.match(route, /ROLLBACK_CHUNK_LIMIT = 100/);
  assert.match(route, /IMPORT_CENTER_LOCKED/);
  assert.match(route, /rollbackImportBatch/);
  assert.match(route, /import_applied_changes/);
  assert.match(route, /rebuildWorkSearchText/);
});

test('APIは作成・アップロード・検証・反映・取消を分離する', async () => {
  const index = await read('src/index.ts');
  for (const path of ['import-center/enable','import-center/disable','import-batches']) assert.match(index, new RegExp(path));
  for (const action of ['items','validate','commit','rollback']) assert.match(index, new RegExp(action));
});

test('設定画面でSHA-256確認後に分割アップロードする', async () => {
  const app = await read('public/app-v09.js');
  assert.match(app, /crypto\.subtle\.digest\('SHA-256'/);
  assert.match(app, /IMPORT_CHUNK_SIZE = 25/);
  assert.match(app, /ステージングへ送る/);
  assert.match(app, /本番へ反映/);
  assert.match(app, /取込を取り消す/);
  assert.match(app, /prompt\('本番へ反映します/);
});

test('公開リポジトリに暗号断片や平文取込ファイルを残さない', async () => {
  let files = [];
  try {
    files = await readdir(new URL('../data/', import.meta.url));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  assert.equal(files.some((name) => /library-import\.(enc|json|csv)|part-/i.test(name)), false);
});
