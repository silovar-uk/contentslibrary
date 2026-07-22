import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('本番未反映の状態だけを直接リセットできる', async () => {
  const source = await read('public/app-v20-import-orchestrator.js');
  assert.match(source, /IMPORT_V20_SAFE_RESET_STATUSES = new Set\(\['draft','uploading','review','validated','rolled_back'\]\)/);
  assert.match(source, /method:'DELETE'/);
  assert.match(source, /本番データは変更せず/);
  assert.match(source, /送信状態をリセットしました/);
});

test('反映済み変更は100件ずつ取り消してからリセットする', async () => {
  const source = await read('public/app-v20-import-orchestrator.js');
  assert.match(source, /IMPORT_V20_ROLLBACK_STATUSES = new Set\(\['committing','committed','failed'\]\)/);
  assert.match(source, /\/rollback/);
  assert.match(source, /最大100変更取り消します/);
  assert.match(source, /100件ずつ取込を取り消す/);
});

test('バックアップJSONを取込用JSONと区別して説明する', async () => {
  const source = await read('public/app-v20-import-orchestrator.js');
  assert.match(source, /Array\.isArray\(parsed\.works\)/);
  assert.match(source, /バックアップ書き出し形式/);
  assert.match(source, /items 配列を持つ取込用JSON/);
  assert.match(source, /このファイルは取込用ではありません/);
});

test('クリック制御を一本化し、詳細の×を常に閉じられる', async () => {
  const source = await read('public/app-v20-import-orchestrator.js');
  assert.match(source, /document\.addEventListener\('click',importV20HandleClick,true\)/);
  assert.match(source, /document\.addEventListener\('change',importV20HandleChange,true\)/);
  assert.match(source, /action==='close-detail'/);
  assert.match(source, /button\.disabled=false/);
  assert.match(source, /stopImmediatePropagation/);
});

test('状態バッジ、進捗、ログ、スピナーのスタイルを備える', async () => {
  const css = await read('public/v20-import-control.css');
  assert.match(css, /import-v20-spinner/);
  assert.match(css, /import-v20-metrics/);
  assert.match(css, /import-v20-log/);
  assert.match(css, /import-status\[data-active="true"\]/);
  assert.match(css, /@keyframes import-v20-spin/);
});
