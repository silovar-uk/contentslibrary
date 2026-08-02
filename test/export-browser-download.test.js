import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('書き出しはJSON変換済みオブジェクトではなく生のResponseを使う', async () => {
  const script = await read('public/views/admin.js');
  assert.match(script, /await fetch\(`\/api\/export\?format=/);
  assert.match(script, /await response\.blob\(\)/);
  assert.match(script, /credentials: "same-origin"/);
});

test('書き出しボタンはsettingsビューから呼び出せる', async () => {
  const html = await read('public/index.html');
  assert.match(html, /data-export="json"/);
  assert.match(html, /data-export="csv"/);
  assert.match(html, /data-export="markdown"/);
});
