import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('大量取込は100件単位で自動停止する', async () => {
  const source = await read('public/app-v19-import-chunk-control.js');
  assert.match(source, /IMPORT_OPERATION_LIMIT = 100/);
  assert.match(source, /IMPORT_STAGE_REQUEST_SIZE = 25/);
  assert.match(source, /IMPORT_COMMIT_REQUEST_SIZE = 20/);
  assert.match(source, /IMPORT_COMMIT_REQUESTS_PER_RUN/);
  assert.match(source, /requestCount<IMPORT_COMMIT_REQUESTS_PER_RUN/);
});

test('取込はサーバーの保存位置から再開する', async () => {
  const source = await read('public/app-v19-import-chunk-control.js');
  assert.match(source, /batch\.staged_works/);
  assert.match(source, /result\.batch\?\.applied_works/);
  assert.match(source, /画面を閉じても送信済み分は保存/);
  assert.match(source, /画面を閉じても反映済み分は保存/);
});

test('一時停止と描画待機を備える', async () => {
  const source = await read('public/app-v19-import-chunk-control.js');
  assert.match(source, /pauseImportChunk/);
  assert.match(source, /現在処理中の\$\{unit\}が終わり次第停止/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /stopImmediatePropagation/);
});

test('分割取込レイヤーは最終UIの後に読み込む', async () => {
  const app = await read('public/app.js');
  const ui = app.indexOf("import './app-v18-refined-ui.js'");
  const chunk = app.indexOf("import './app-v19-import-chunk-control.js'");
  const bootstrap = app.indexOf("import './app-v16-bootstrap.js'");
  assert.ok(ui >= 0 && chunk > ui && bootstrap > chunk);
});
