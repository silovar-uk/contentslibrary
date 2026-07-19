import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('複数語検索はトークンごとにAND条件を作る', async () => {
  const source = await read('src/routes/library-v03.ts');
  assert.match(source, /rawQuery\.split\(" "\)/);
  assert.match(source, /for \(const token of tokens\)/);
  assert.match(source, /w\.search_text LIKE \?/);
  assert.match(source, /w\.owner_id = \?/);
});

test('保存ビューは所有者条件と既知の検索キーに限定される', async () => {
  const source = await read('src/routes/library-v03.ts');
  assert.match(source, /FILTER_KEYS/);
  assert.match(source, /WHERE owner_id = \?/);
  assert.match(source, /id = \? AND owner_id = \?/);
  assert.match(source, /UPDATE saved_views SET is_default = 0/);
});

test('検索UIは保存ビューと分類候補を持つ', async () => {
  const source = await read('public/app-v03.js');
  assert.match(source, /saveCurrentView/);
  assert.match(source, /\/api\/saved-views/);
  assert.match(source, /\/api\/labels/);
  assert.match(source, /複数語はAND検索/);
});
