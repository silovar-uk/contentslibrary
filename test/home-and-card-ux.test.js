import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

// ホームの各種カード(最近のメモ・最近の作品・現在読んでいる本・抽選結果)から詳細が
// 開けなかった問題と、一覧カードのクリックが再描画のタイミング事故で偶然動いていた問題を
// 修正した回(docs/HOME-AND-CARD-UX-PLAN.md参照)。data-open-workへ一本化する。

test('作品を開く経路はdata-open-workの単一デリゲートに一本化する', async () => {
  const app = await read('public/app.js');
  const detail = await read('public/views/detail.js');
  const home = await read('public/views/home.js');
  const library = await read('public/views/library.js');

  assert.match(app, /data-open-work/);
  assert.match(app, /void openDetail\(openWork\)/);

  // 旧: #workList外かどうかで判定する暗黙経路(再描画で対象が浮いて誤動作していた)
  assert.doesNotMatch(detail, /closest\("#workList"\)/);
  assert.doesNotMatch(detail, /app:open-work/);

  assert.match(home, /data-open-work="\$\{esc\(work\.id\)\}"/);
  assert.match(library, /data-open-work="\$\{esc\(work\.id\)\}"/);
});

test('openDetailは一覧表示へ切り替えたうえで詳細を取得する', async () => {
  const detail = await read('public/views/detail.js');
  const body = detail.match(/export async function openDetail[\s\S]*?\n}/)[0];
  assert.match(body, /selectWork\(id\)/);
  assert.match(body, /setView\("library"\)/);
});

test('作品カードは<article>+ボタンに分離し、★とメモ入力をボタンの外に置く', async () => {
  const library = await read('public/views/library.js');
  const format = await read('public/core/format.js');
  assert.match(library, /<article class="work-card/);
  assert.match(library, /class="work-card-main"/);
  assert.match(library, /cardRatingMarkup\(work\)/);
  assert.match(library, /cardNoteMarkup\(work, openNoteCardIds\.has\(work\.id\)\)/);
  // カードのメモ入力は一覧・ホーム(抽選)共通のため、core/format.jsへ共有する
  assert.match(format, /data-toggle-card-note/);
  assert.match(format, /data-card-note-form/);
});

test('カードの★は選択モード中の作品選択トグルと衝突しない(捕捉フェーズはselectionMode時だけ介入する)', async () => {
  const library = await read('public/views/library.js');
  const body = library.match(/\$\("#workList"\)\.addEventListener\("click"[\s\S]*?\}, true\);/)[0];
  assert.match(body, /if \(!card \|\| !selectionMode\) return;/);
});

test('カードの★は詳細を経由せずstate.worksを直接更新し、409は再取得へフォールバックする', async () => {
  const store = await read('public/core/store.js');
  const body = store.match(/export async function setWorkRating[\s\S]*?\n}/)[0];
  assert.match(body, /api\(`\/api\/works\/\$\{encodeURIComponent\(workId\)\}\/preferences`/);
  assert.match(body, /error\.status === 409/);
  assert.match(body, /await loadSnapshot\(\)/);
});

test('ホームの読書中カードはstate.worksから引き直し、notify購読で★の変更が即反映される', async () => {
  const home = await read('public/views/home.js');
  assert.match(home, /state\.works\.get\(String\(item\.id\)\) \|\| item/);
  assert.match(home, /subscribe\(renderHome\)/);
});

test('setSelectedDetailはhas_notes/experience_countを詳細レスポンスの実データから再計算する', async () => {
  // /api/works/:id はSELECT *のためスナップショット専用の計算列を持たない。
  // 素通しするとカードのメモ有無フィルタが、詳細を開いた瞬間に壊れる(実際に見つかった回帰)。
  const store = await read('public/core/store.js');
  const body = store.match(/export function setSelectedDetail[\s\S]*?\n}/)[0];
  assert.match(body, /has_notes: \(detail\.notes\?\.length \?\? 0\) > 0/);
  assert.match(body, /experience_count: detail\.experiences\?\.length \?\? 0/);
});

test('ホームの自動抽選は5冊をクライアント側で選び、初回読み込みと引き直しだけで再抽選する', async () => {
  const home = await read('public/views/home.js');
  const app = await read('public/app.js');
  assert.match(home, /export function drawRandomPicks/);
  assert.match(home, /pickRandomWorks\(scope, 5, previousRandomIds\(\)\)/);
  assert.match(app, /drawRandomPicks\(\);/);
  // stateのnotifyのたびに再抽選されると★操作のたびに顔ぶれが変わってしまうため、
  // subscribe()経由ではなくinit()からの明示呼び出しだけにする。
  assert.doesNotMatch(home, /subscribe\(drawRandomPicks\)/);
});
