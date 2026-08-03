import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

// もっさり対策(docs/PERF-AND-LOADING-PLAN.md参照)。実測で604件の状態更新1回が805ms
// (レイアウトだけで610ms)かかっていた。content-visibility・非表示ビューの描画停止・
// 検索デバウンス・先頭ページのみ描画の4点で解消する。

test('.work-cardはcontent-visibility:autoで画面外のレイアウトを省略する', async () => {
  const css = await read('public/styles/app.css');
  assert.match(css, /\.work-card\{[^}]*content-visibility:auto/);
  assert.match(css, /\.work-card\{[^}]*contain-intrinsic-size:auto 320px/);
});

test('非表示のビューは全件再描画をスキップする', async () => {
  const library = await read('public/views/library.js');
  const home = await read('public/views/home.js');
  const libraryBody = library.match(/export function renderWorkList\(\)[\s\S]*?\n}/)[0];
  const homeBody = home.match(/export function renderHome\(\)[\s\S]*?\n}/)[0];
  assert.match(libraryBody, /if \(state\.view !== "library"\) return;/);
  assert.match(homeBody, /if \(state\.view !== "home"\) return;/);
});

test('検索入力は打鍵ごとに絞り込まず、指を止めてから反映する', async () => {
  const library = await read('public/views/library.js');
  assert.match(library, /timer = setTimeout\(\(\) => \{ setFilters\(\{ q: value \}\); setView\("library"\); \}, 80\);/);
});

test('一覧は先頭PAGE_SIZE件だけ描画し、もっと見るで追加表示する', async () => {
  const library = await read('public/views/library.js');
  assert.match(library, /const PAGE_SIZE = 60;/);
  assert.match(library, /works\.slice\(0, visibleCount\)/);
  assert.match(library, /data-action='load-more-works'/);
  assert.match(library, /visibleCount \+= PAGE_SIZE; renderWorkList\(\);/);
  // 絞り込みが変わったら先頭からやり直す(古いページ位置を引きずらない)
  assert.match(library, /if \(filtersKey !== lastFiltersKey\) \{ lastFiltersKey = filtersKey; visibleCount = PAGE_SIZE; \}/);
});

test('カードメモの開閉状態と保存処理はstore.jsで一覧・ホーム共通に持つ', async () => {
  const store = await read('public/core/store.js');
  const app = await read('public/app.js');
  const library = await read('public/views/library.js');
  const home = await read('public/views/home.js');
  assert.match(store, /export const openNoteCardIds = new Set\(\);/);
  assert.match(store, /export function toggleCardNote/);
  assert.match(store, /export async function submitCardNote/);
  // 開閉・保存のイベント処理はapp.jsに一本化し、library.js/home.jsに重複実装を持たない
  assert.match(app, /data-toggle-card-note/);
  assert.match(app, /data-card-note-form/);
  assert.doesNotMatch(library, /document\.addEventListener\("submit"/);
  assert.doesNotMatch(home, /data-toggle-card-note/);
});

test('抽選5冊のカードにも★とメモ入力を置き、state.worksから引き直して描画する', async () => {
  const home = await read('public/views/home.js');
  const body = home.match(/function randomPickMarkup[\s\S]*?\n}/)[0];
  assert.match(body, /cardRatingMarkup\(work\)/);
  assert.match(body, /cardNoteMarkup\(work, openNoteCardIds\.has\(work\.id\)\)/);
  assert.match(home, /randomPickIds\.map\(\(id\) => state\.works\.get\(id\)\)/);
  // 抽選のやり直し(顔ぶれの変更)はrenderHome内から直接ではなく、drawRandomPicksだけが行う
  assert.match(home, /renderRandomPicks\(\); \/\/ 抽選のやり直しはしない/);
});

test('読み込み中は空表示ではなくスケルトンを出す(3か所)', async () => {
  const dom = await read('public/core/dom.js');
  const home = await read('public/views/home.js');
  const library = await read('public/views/library.js');
  const css = await read('public/styles/app.css');
  assert.match(dom, /export function skeletonCards/);
  assert.match(dom, /export function skeletonShelf/);
  assert.match(home, /if \(!state\.loaded\)[\s\S]{0,80}skeletonCards\(5\)/);
  assert.match(home, /if \(!state\.loaded\)[\s\S]{0,120}skeletonShelf\(8\)/);
  assert.match(library, /if \(!state\.loaded\)[\s\S]{0,80}skeletonCards\(6\)/);
  assert.match(css, /@keyframes skeleton-shimmer/);
});

test('prefers-reduced-motionはtransitionだけでなくanimationも止める', async () => {
  const css = await read('public/styles/app.css');
  assert.match(css, /prefers-reduced-motion:reduce\)\{\*\{[^}]*animation:none!important/);
});
