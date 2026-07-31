import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('本番反映は20件ずつ最大100件で確認を挟む', async () => {
  const source = await read('public/app-v20-import-orchestrator.js');
  assert.match(source, /IMPORT_V20_STAGE_LIMIT = 100/);
  assert.match(source, /IMPORT_V20_COMMIT_CHUNK = 20/);
  assert.match(source, /IMPORT_V20_COMMIT_CALLS/);
  assert.match(source, /call<IMPORT_V20_COMMIT_CALLS/);
});

test('通信待ちを無期限にせず、保存位置から再開する', async () => {
  const source = await read('public/app-v20-import-orchestrator.js');
  assert.match(source, /AbortController/);
  assert.match(source, /IMPORT_V20_REQUEST_TIMEOUT = 30_000/);
  assert.match(source, /batch\.staged_works/);
  assert.match(source, /result\.batch\?\.applied_works/);
  assert.match(source, /通信が\$\{Math\.round\(timeoutMs\/1000\)\}秒以内/);
});

test('一時停止、描画待機、操作中表示を備える', async () => {
  const source = await read('public/app-v20-import-orchestrator.js');
  assert.match(source, /pauseImportChunk/);
  assert.match(source, /現在処理中の\$\{unit\}が終わり次第停止/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /import-v20-button-spinner/);
  assert.match(source, /importV20OperationPanel/);
});

test('統合制御、連続ステージング、起動処理の順に読み込む', async () => {
  const app = await read('public/app.js');
  const ui = app.indexOf("import './app-v18-refined-ui.js'");
  const style = app.indexOf("import './v20-import-style.js'");
  const orchestrator = app.indexOf("import './app-v20-import-orchestrator.js'");
  const continuous = app.indexOf("import './app-v21-continuous-staging.js'");
  const bootstrap = app.indexOf("import './app-v16-bootstrap.js'");
  assert.ok(ui >= 0 && style > ui && orchestrator > style && continuous > orchestrator && bootstrap > continuous);
});