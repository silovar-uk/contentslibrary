import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

// v17は「アイコン寸法バラバラ」「モバイル導線が窮屈」を後から当てるパッチ層だった。
// 再構築後は最初から1つのアイコン系統・1つのCSSで作るため、パッチではなく
// 最終状態そのものを検証する。

test('アイコンは共通クラスで寸法を揃える', async () => {
  const css = await read('public/styles/app.css');
  assert.match(css, /\.icon\{width:18px;height:18px/);
});

test('モバイルナビは5項目・下部固定で構成される', async () => {
  const html = await read('public/index.html');
  const nav = html.match(/<nav class="mobile-nav"[\s\S]*?<\/nav>/)[0];
  const buttons = (nav.match(/<button/g) || []).length;
  assert.equal(buttons, 5); // home/library/追加/記録(data-preset)/settings
  assert.match(nav, /data-mobile-view="home"/);
  assert.match(nav, /data-mobile-view="library"/);
  assert.match(nav, /data-mobile-view="settings"/);
  assert.match(nav, /data-preset="completed"/); // 記録タブは既存の絞り込みプリセットを再利用する
  assert.match(html, /class="mobile-add"/);
  const css = await read('public/styles/app.css');
  assert.match(css, /\.mobile-nav\{display:none\}/);
  assert.match(css, /\.mobile-nav\{display:grid;grid-template-columns:repeat\(5,1fr\)/);
});

test('統合CSSの波括弧が対応している', async () => {
  const css = await read('public/styles/app.css');
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0;
  for (const char of withoutComments) {
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    assert.ok(depth >= 0, '閉じ波括弧が先行しています');
  }
  assert.equal(depth, 0, 'CSSの波括弧が閉じていません');
});
