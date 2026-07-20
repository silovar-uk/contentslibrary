import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('プロダクトUIのCSSを既存スタイルより後に読み込む', async () => {
  const html = await read('public/index.html');
  const v15 = html.indexOf('/v15-genre-shelf.css');
  const v17 = html.indexOf('/v17-product-ui.css');
  assert.ok(v15 >= 0);
  assert.ok(v17 > v15);
});

test('操作ボタンの文字を横書きに固定する', async () => {
  const css = await read('public/v17-product-ui.css');
  assert.match(css, /writing-mode:horizontal-tb!important/);
  assert.match(css, /text-orientation:mixed!important/);
  assert.match(css, /word-break:keep-all/);
  assert.match(css, /white-space:nowrap/);
});

test('スマホ中央導線は文字spanではなくSVGを強調する', async () => {
  const css = await read('public/v17-product-ui.css');
  assert.match(css, /\.mobile-nav button>span\{/);
  assert.match(css, /width:auto!important/);
  assert.match(css, /\.mobile-nav \.v14-mobile-random>\.v14-icon\{/);
  assert.match(css, /width:46px/);
  assert.match(css, /\.mobile-nav \.v14-mobile-random>span\{/);
});

test('ジャンル棚を狭い可変列ではなく十分な幅の操作行にする', async () => {
  const css = await read('public/v17-product-ui.css');
  assert.match(css, /grid-template-columns:repeat\(auto-fit,minmax\(235px,1fr\)\)/);
  assert.match(css, /grid-template-columns:54px minmax\(0,1fr\) 20px/);
  assert.match(css, /@media\(max-width:767px\)[\s\S]*?\.v15-shelf-grid\{grid-template-columns:1fr/);
  assert.match(css, /\.v15-shelf-item-copy strong[\s\S]*?word-break:keep-all/);
});

test('スマホの一覧ツールバーを横並びで全幅利用する', async () => {
  const css = await read('public/v17-product-ui.css');
  assert.match(css, /\.list-tools\{width:100%;display:grid;grid-template-columns:auto minmax\(0,1fr\)\}/);
  assert.match(css, /\.list-tools select\{width:100%;min-width:0/);
});

test('主要なアイコン寸法を共通トークンで揃える', async () => {
  const css = await read('public/v17-product-ui.css');
  assert.match(css, /--ui-icon:18px/);
  assert.match(css, /\.v14-icon,\s*\.v15-icon/);
  assert.match(css, /width:var\(--ui-icon\)/);
  assert.match(css, /flex:0 0 var\(--ui-icon\)/);
});

test('プロダクトUI CSSの波括弧が対応している', async () => {
  const css = await read('public/v17-product-ui.css');
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0;
  for (const char of withoutComments) {
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    assert.ok(depth >= 0, '閉じ波括弧が先行しています');
  }
  assert.equal(depth, 0, 'CSSの波括弧が閉じていません');
});
