import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('公開サインアップや自作パスワードを持たない', async () => {
  const html = await read('public/index.html');
  assert.equal(/password/i.test(html), false);
  assert.equal(/sign.?up|新規登録/i.test(html), false);
});

test('ローカル開発認証はlocalhostに限定される', async () => {
  const auth = await read('src/auth.ts');
  assert.match(auth, /host === "localhost"/);
  assert.match(auth, /isLocalRequest\(request\) && env\.DEV_AUTH_ENABLED === "true"/);
});

test('検索・取得はowner_id条件を含む', async () => {
  const routes = await read('src/routes/works.ts');
  assert.match(routes, /w\.owner_id = \?/);
  assert.match(routes, /id = \? AND owner_id = \?/);
});

test('ブロックはアプリ状態を先に確定する', async () => {
  const admin = await read('src/routes/admin.ts');
  const updateAt = admin.indexOf("status = 'blocked'");
  const revokeAt = admin.indexOf('revokeAccessSession(env, target.email)', updateAt);
  assert.ok(updateAt >= 0 && revokeAt > updateAt);
});

test('主要UIとエクスポート形式が存在する', async () => {
  const html = await read('public/index.html');
  for (const id of ['globalSearch','workList','detailPanel','workDialog','adminView']) assert.match(html, new RegExp(`id="${id}"`));
  for (const format of ['json','csv','markdown']) assert.match(html, new RegExp(`data-export="${format}"`));
});

test('媒体別の入力支援とPCクイック編集を持つ', async () => {
  const app = await read('public/app-v02.js');
  assert.match(app, /const MEDIA_CONFIG/);
  for (const unit of ['ページ','巻','分','話']) assert.match(app, new RegExp(unit));
  assert.match(app, /quickEditForm/);
  assert.match(app, /creatorLabelText/);
  assert.match(app, /workDraftNotice/);
});

test('進捗の矛盾をサーバー側でも拒否する', async () => {
  const validation = await read('src/v02-validation.ts');
  const index = await read('src/index.ts');
  assert.match(validation, /function validateProgress/);
  assert.match(validation, /現在の進捗は全体以下にしてください/);
  assert.match(validation, /SELECT progress_current, progress_total FROM works/);
  assert.match(index, /await assertProgressMutation\(request, env, auth\)/);
});
