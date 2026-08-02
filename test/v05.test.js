import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=(path)=>readFile(new URL(path,root),'utf8');

// v0.5の装丁レイヤー(editorial typography, 非対称グリッド)は今回の再構築で
// 統合CSSへ吸収された。旧実装のセレクタを検証する意味は失われたため、
// 今回のUI再構築が実際に保証すること(Observer連鎖の解消・reduced-motion対応)を検証する。

test('動的コンテンツの装飾にMutationObserverを使わない', async () => {
  const files = ['public/app.js', 'public/views/home.js', 'public/views/library.js', 'public/views/detail.js', 'public/views/admin.js', 'public/views/dialogs.js', 'public/core/store.js'];
  for (const file of files) {
    const source = await read(file);
    assert.doesNotMatch(source, /MutationObserver/, `${file} にMutationObserverが含まれていない`);
  }
});

test('window.fetchを乗っ取らない', async () => {
  const files = ['public/app.js', 'public/core/api.js', 'public/views/home.js', 'public/views/library.js', 'public/views/detail.js'];
  for (const file of files) {
    const source = await read(file);
    assert.doesNotMatch(source, /window\.fetch\s*=/, `${file} がwindow.fetchを再代入していない`);
  }
});

test('reduced-motionに対応する', async () => {
  const css = await read('public/styles/app.css');
  assert.match(css, /prefers-reduced-motion/);
});

test('統合スタイルシートを1枚のCSSとして読み込む', async () => {
  const html = await read('public/index.html');
  assert.match(html, /\/styles\/tokens\.css/);
  assert.match(html, /\/styles\/app\.css/);
  const linkCount = (html.match(/<link rel="stylesheet"/g) || []).length;
  assert.equal(linkCount, 2);
});
