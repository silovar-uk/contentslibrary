import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('設定アイコン化の後も認証初期化用アンカーを復元する', async () => {
  const base = await read('public/app-v02.js');
  const editorial = await read('public/app-v14.js');
  const bootstrap = await read('public/app-v16-bootstrap.js');
  const entry = await read('public/app.js');

  assert.match(base, /#avatarInitial/);
  assert.match(editorial, /settings\.innerHTML = iconV14\('settings'\)/);
  assert.match(bootstrap, /document\.getElementById\('avatarInitial'\)/);
  assert.match(bootstrap, /anchor\.id = 'avatarInitial'/);
  assert.ok(entry.indexOf("import './app-v14.js'") < entry.indexOf("import './app-v16-bootstrap.js'"));
});

test('主要CSSをHTMLで先読みして段階的なスタイル変化を隠す', async () => {
  const html = await read('public/index.html');
  for (const href of [
    '/v02.css',
    '/v05.css',
    '/v05-polish.css',
    '/v07.css',
    '/v09.css',
    '/v10.css',
    '/v13-work-tools.css',
    '/v14-editorial.css',
    '/v15-genre-shelf.css'
  ]) {
    assert.match(html, new RegExp(`href=["']${href.replace('.', '\\.')}`));
  }
  assert.match(html, /<html lang="ja" class="ui-booting">/);
  assert.match(html, /sakuhinBootPulse/);
  assert.match(html, /__sakuhinLogBootTimer/);
});

test('最終モジュールが二段描画後に起動画面を解除する', async () => {
  const bootstrap = await read('public/app-v16-bootstrap.js');
  assert.match(bootstrap, /requestAnimationFrame\(\(\) => \{/);
  assert.match(bootstrap, /document\.documentElement\.classList\.remove\('ui-booting'\)/);
  assert.match(bootstrap, /clearTimeout\(window\.__sakuhinLogBootTimer\)/);
  assert.match(bootstrap, /sakuhin-log:ui-ready/);
});
