import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('取込の4段階と進捗指標を常時表示する', async () => {
  const script = await read('public/app-v10.js');
  const css = await read('public/v10.css');
  assert.match(script, /ファイル確認/);
  assert.match(script, /ステージング/);
  assert.match(script, /重複・件数確認/);
  assert.match(script, /本番反映/);
  assert.match(script, /importProgressPercent/);
  assert.match(script, /importProgressRemaining/);
  assert.match(script, /importProgressElapsed/);
  assert.match(script, /本番未変更/);
  assert.match(css, /import-stepper/);
  assert.match(css, /import-progress-track/);
  assert.match(css, /prefers-reduced-motion/);
});

test('ステージング・反映・取消の進行件数を解釈する', async () => {
  const script = await read('public/app-v10.js');
  assert.match(script, /ステージング中/);
  assert.match(script, /反映中/);
  assert.match(script, /取消中/);
  assert.match(script, /残り/);
  assert.match(script, /MutationObserver/);
});
