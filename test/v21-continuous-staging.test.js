import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('起動用インラインスクリプトのCSPハッシュが実コードと一致する', async () => {
  const [html,http] = await Promise.all([
    read('public/index.html'),
    read('src/http.ts')
  ]);
  const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.equal(inlineScripts.length,1,'許可対象外のインラインスクリプトを増やさない');
  const code = inlineScripts[0][1];
  const hash = createHash('sha256').update(code,'utf8').digest('base64');
  assert.match(http,new RegExp(`script-src 'self' 'sha256-${hash.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}'`));
  assert.doesNotMatch(http,/script-src[^\n]*unsafe-inline/);
});

test('ステージングは25件ずつ最後まで自動で進む', async () => {
  const source = await read('public/app-v21-continuous-staging.js');
  assert.match(source,/IMPORT_V21_CHUNK_SIZE = 25/);
  assert.match(source,/while\(processed < total && !importV21State\.pauseRequested\)/);
  assert.match(source,/processed-checkpointStart >= IMPORT_V21_CHECKPOINT_SIZE/);
  assert.match(source,/IMPORT_V21_CHECKPOINT_DELAY_MS/);
  assert.doesNotMatch(source,/const stopAt=/);
});

test('100件チェックポイント後は停止せず自動続行する', async () => {
  const source = await read('public/app-v21-continuous-staging.js');
  assert.match(source,/100件ごとに画面を更新し、そのまま自動で続行します/);
  assert.match(source,/100件チェックポイントを通過しました/);
  assert.match(source,/checkpointStart = processed/);
});

test('一時停止は専用ボタンで現在の25件終了後に実行する', async () => {
  const source = await read('public/app-v21-continuous-staging.js');
  assert.match(source,/pauseImportContinuous/);
  assert.match(source,/現在処理中の25件が終わり次第停止/);
  assert.match(source,/pauseRequested = true/);
});

test('旧ステージングボタンを隠し連続処理の操作へ置き換える', async () => {
  const [source,app] = await Promise.all([
    read('public/app-v21-continuous-staging.js'),
    read('public/app.js')
  ]);
  assert.match(source,/legacy\.hidden = true/);
  assert.match(source,/stageImportFileContinuous/);
  const v20 = app.indexOf("import './app-v20-import-orchestrator.js'");
  const v21 = app.indexOf("import './app-v21-continuous-staging.js'");
  const bootstrap = app.indexOf("import './app-v16-bootstrap.js'");
  assert.ok(v20 >= 0 && v21 > v20 && bootstrap > v21);
});
