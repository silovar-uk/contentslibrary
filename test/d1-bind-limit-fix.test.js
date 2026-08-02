import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

// 本番で発生した障害: 蔵書が増えると D1_ERROR: too many SQL variables at offset 311
// で /api/library/snapshot 等が丸ごと500になった。原因は work_id の件数だけ「?」を
// 生成するIN句で、D1の1クエリあたりバインド変数上限(100件)を超えていたこと。
// chunkIdsで100件単位に分割し、全呼び出し元を経由させることで再発を防ぐ。

test('chunkIdsは上限件数ごとに配列を分割する', async () => {
  const db = await read('src/db.ts');
  assert.match(db, /export function chunkIds\(ids: string\[\], size = 100\): string\[\]\[\]/);
  const body = db.match(/export function chunkIds[\s\S]*?\n}/)[0];
  assert.match(body, /for \(let i = 0; i < ids\.length; i \+= size\) chunks\.push\(ids\.slice\(i, i \+ size\)\);/);
});

test('getLabelsForWorksはIN句を無制限に生成せずchunkIdsを経由する', async () => {
  const db = await read('src/db.ts');
  const body = db.match(/export async function getLabelsForWorks[\s\S]*?\n}/)[0];
  assert.match(body, /for \(const chunk of chunkIds\(workIds\)\)/);
  assert.doesNotMatch(body, /workIds\.map\(\(\) => "\?"\)/);
});

test('作品エクスポート(exportData)の体験・メモ取得もchunkIds経由にする', async () => {
  const works = await read('src/routes/works.ts');
  assert.match(works, /import \{ chunkIds, /);
  const body = works.match(/export async function exportData[\s\S]*?const data = \{/)[0];
  assert.match(body, /for \(const chunk of chunkIds\(ids\)\)/);
  assert.doesNotMatch(body, /ids\.map\(\(\) => "\?"\)/);
});
