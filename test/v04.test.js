import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=(path)=>readFile(new URL(path,root),'utf8');

test('メモと体験履歴に更新バージョンを追加する',async()=>{
  const migration=await read('migrations/0002_content_editing.sql');
  assert.match(migration,/notes ADD COLUMN version/);
  assert.match(migration,/notes ADD COLUMN sort_order/);
  assert.match(migration,/experiences ADD COLUMN version/);
});

test('メモ編集削除は作品所有者を確認し楽観ロックする',async()=>{
  const routes=await read('src/routes/content-v04.ts');
  assert.match(routes,/JOIN works w ON w\.id = n\.work_id/);
  assert.match(routes,/w\.owner_id = \?/);
  assert.match(routes,/WHERE id = \? AND version = \?/);
  assert.match(routes,/NOTE_UPDATED/);
  assert.match(routes,/NOTE_DELETED/);
});

test('体験編集削除は進捗と評価を作品へ再同期する',async()=>{
  const routes=await read('src/routes/content-v04.ts');
  assert.match(routes,/syncWorkFromExperiences/);
  assert.match(routes,/現在の進捗は全体以下にしてください/);
  assert.match(routes,/EXPERIENCE_UPDATED/);
  assert.match(routes,/EXPERIENCE_DELETED/);
});

test('メモの手動並び替えAPIを所有者単位で持つ',async()=>{
  const routes=await read('src/routes/content-v04.ts');
  const index=await read('src/index.ts');
  assert.match(routes,/NOTES_REORDERED/);
  assert.match(routes,/SELECT id FROM works WHERE id = \? AND owner_id = \?/);
  assert.match(index,/notes\\\/reorder/);
});

test('詳細ペインに編集削除と評価差分表示を追加する',async()=>{
  const app=await read('public/app-v04.js');
  assert.match(app,/data-v4-edit-note/);
  assert.match(app,/data-v4-delete-note/);
  assert.match(app,/data-v4-edit-experience/);
  assert.match(app,/data-v4-delete-experience/);
  assert.match(app,/ratingDelta/);
  assert.match(app,/初回 .*最新/);
  assert.match(app,/data-v4-move-note/);
});
