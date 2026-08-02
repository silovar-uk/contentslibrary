import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const exists = (path) => access(new URL(path, root)).then(() => true, () => false);

// v16は「JSでアバターアイコン化した後、認証初期化用の#avatarInitialアンカーが
// 消えるので復元する」という後付けの帳尻合わせだった。再構築後は#avatarInitialが
// 常に静的HTMLに存在し、どのレイヤーもそれを壊さないため、復元処理自体が不要。

test('アバターアンカーは静的HTMLに存在し、JSで壊されたり復元されたりしない', async () => {
  const html = await read('public/index.html');
  assert.match(html, /<span id="avatarInitial">U<\/span>/);
  const app = await read('public/app.js');
  assert.match(app, /\$\("#avatarInitial"\)\.textContent = /); // 中身の文字だけ設定し、要素は作り直さない
});

test('起動画面の帳尻合わせスクリプトは廃止されている', async () => {
  assert.equal(await exists('public/app-v16-bootstrap.js'), false);
  assert.equal(await exists('public/app-v18-refined-ui.js'), false);
});
