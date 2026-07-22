import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('本番未反映の状態だけを直接リセットできる', async () => {
  const source = await read('public/app-v191-import-reset.js');
  assert.match(source, /SAFE_RESET_STATUSES = new Set\(\['draft','uploading','review','validated','rolled_back'\]\)/);
  assert.match(source, /method:'DELETE'/);
  assert.match(source, /本番の作品・メモは変更せず/);
  assert.match(source, /送信状態をリセットしました/);
});

test('反映済み変更は100件ずつ取り消してからリセットする', async () => {
  const source = await read('public/app-v191-import-reset.js');
  assert.match(source, /ROLLBACK_RESET_STATUSES = new Set\(\['committing','committed','failed'\]\)/);
  assert.match(source, /\/rollback/);
  assert.match(source, /100変更ずつ取り消します/);
  assert.match(source, /100件ずつ取込を取り消す/);
});

test('旧削除・取消イベントを安全に置き換える', async () => {
  const source = await read('public/app-v191-import-reset.js');
  assert.match(source, /delete deleteButton\.dataset\.importAction/);
  assert.match(source, /delete rollbackButton\.dataset\.importAction/);
  assert.match(source, /stopImmediatePropagation/);
  assert.match(source, /status === 'failed'/);
});

test('取込リセットUIは分割取込UIの後に読み込む', async () => {
  const app = await read('public/app.js');
  const chunk = app.indexOf("import './app-v19-import-chunk-control.js'");
  const reset = app.indexOf("import './app-v191-import-reset.js'");
  const bootstrap = app.indexOf("import './app-v16-bootstrap.js'");
  assert.ok(chunk >= 0 && reset > chunk && bootstrap > reset);
});
