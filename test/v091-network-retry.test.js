import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('取込センターの一時障害を限定的に再試行する', async () => {
  const source = await read('public/app-v091-network.js');
  assert.ok(source.includes('502, 503, 504'));
  assert.ok(source.includes('/api/admin/import'));
  assert.ok(source.includes("method === 'DELETE'"));
  assert.ok(source.includes('500, 1400'));
});

test('失敗時は本番未変更と追跡情報を示す', async () => {
  const source = await read('public/app-v091-network.js');
  assert.ok(source.includes('本番データは変更されていません'));
  assert.ok(source.includes('cf-ray'));
  assert.ok(source.includes('IMPORT_SERVICE_TEMPORARILY_UNAVAILABLE'));
});

test('回復処理を取込センター本体より先に読む', async () => {
  const app = await read('public/app.js');
  const retryIndex = app.indexOf("import './app-v091-network.js'");
  const centerIndex = app.indexOf("import './app-v09.js'");
  assert.ok(retryIndex >= 0);
  assert.ok(centerIndex > retryIndex);
});
