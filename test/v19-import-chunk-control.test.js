import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('ステージングは25件ずつ最後まで自動で進み、100件ごとに休止する', async () => {
  const source = await read('public/import-center/app-v20-import-orchestrator.js');
  assert.match(source, /IMPORT_V20_CHECKPOINT_SIZE = 100/);
  assert.match(source, /IMPORT_V20_STAGE_CHUNK = 25/);
  assert.match(source, /IMPORT_V20_CHECKPOINT_DELAY_MS/);
  assert.match(source, /while\(processed<total && !importV20State\.pauseRequested\)/);
  assert.match(source, /processed-checkpointStart>=IMPORT_V20_CHECKPOINT_SIZE/);
  assert.doesNotMatch(source, /const stopAt=/);
});

test('本番反映は20件ずつ最大100件で確認を挟む', async () => {
  const source = await read('public/import-center/app-v20-import-orchestrator.js');
  assert.match(source, /IMPORT_V20_COMMIT_CHUNK = 20/);
  assert.match(source, /IMPORT_V20_COMMIT_CALLS/);
  assert.match(source, /call<IMPORT_V20_COMMIT_CALLS/);
});

test('通信待ちを無期限にせず、保存位置から再開する', async () => {
  const source = await read('public/import-center/app-v20-import-orchestrator.js');
  assert.match(source, /AbortController/);
  assert.match(source, /IMPORT_V20_REQUEST_TIMEOUT = 30_000/);
  assert.match(source, /batch\.staged_works/);
  assert.match(source, /result\.batch\?\.applied_works/);
  assert.match(source, /通信が\$\{Math\.round\(timeoutMs\/1000\)\}秒以内/);
});

test('一時停止、描画待機、操作中表示を備える', async () => {
  const source = await read('public/import-center/app-v20-import-orchestrator.js');
  assert.match(source, /pauseImportChunk/);
  assert.match(source, /現在処理中の\$\{unit\}が終わり次第停止/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /import-v20-button-spinner/);
  assert.match(source, /importV20OperationPanel/);
});

test('旧制御を読み込まず統合制御だけを使う', async () => {
  const app = await read('public/app.js');
  const style = app.indexOf('import "./import-center/v20-import-style.js"');
  const orchestrator = app.indexOf('import "./import-center/app-v20-import-orchestrator.js"');
  assert.ok(style >= 0 && orchestrator > style);
  assert.ok(!app.includes("app-v18-refined-ui") && !app.includes("app-v16-bootstrap"));
});
