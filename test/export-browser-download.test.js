import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('書き出しはJSON変換済みオブジェクトではなく生のResponseを使う', async () => {
  const script = await read('public/app-v101-export.js');
  assert.doesNotThrow(() => new Function(script));
  assert.match(script, /await fetch\(`\/api\/export\?format=/);
  assert.match(script, /await response\.blob\(\)/);
  assert.match(script, /event\.stopImmediatePropagation\(\)/);
  assert.match(script, /credentials: 'same-origin'/);
});

test('最新の書き出し処理をアプリから読み込む', async () => {
  const entry = await read('public/app.js');
  const packageJson = JSON.parse(await read('package.json'));
  assert.match(entry, /app-v101-export\.js/);
  assert.match(packageJson.scripts['check:frontend'], /app-v101-export\.js/);
});
