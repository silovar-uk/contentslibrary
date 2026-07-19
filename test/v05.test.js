import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=(path)=>readFile(new URL(path,root),'utf8');

test('編集的なタイポグラフィと紙面設計を持つ',async()=>{
  const css=await read('public/v05.css');
  assert.match(css,/--serif:/);
  assert.match(css,/--signal:/);
  assert.match(css,/\.hero-row h1/);
  assert.match(css,/font-family:var\(--serif\)/);
  assert.match(css,/\.work-card::before/);
  assert.match(css,/counter\(catalogue,decimal-leading-zero\)/);
});

test('均等なカードUIを崩す意図的な非対称レイアウトを持つ',async()=>{
  const css=await read('public/v05.css');
  assert.match(css,/\.reading-card:first-child\{grid-column:span 2/);
  assert.match(css,/grid-template-columns:repeat\(12/);
  assert.match(css,/clip-path:polygon/);
  assert.match(css,/\.home-columns\{grid-template-columns:minmax\(0,1\.18fr\)/);
});

test('動的コンテンツにも装丁と控えめなモーションを適用する',async()=>{
  const app=await read('public/app-v05.js');
  const css=await read('public/v05.css');
  assert.match(app,/archive-folio/);
  assert.match(app,/hero-editorial-note/);
  assert.match(app,/IntersectionObserver/);
  assert.match(app,/MutationObserver/);
  assert.match(css,/prefers-reduced-motion/);
});

test('細部調整レイヤーでモバイルとフォーカスを補強する',async()=>{
  const css=await read('public/v05-polish.css');
  const app=await read('public/app-v05.js');
  assert.match(css,/mobile-add span i/);
  assert.match(css,/button\[aria-current\]/);
  assert.match(css,/focus-visible/);
  assert.match(app,/v05-polish\.css/);
});

test('v0.5の視覚レイヤーを読み込む',async()=>{
  const entry=await read('public/app.js');
  assert.match(entry,/app-v05\.js/);
});
