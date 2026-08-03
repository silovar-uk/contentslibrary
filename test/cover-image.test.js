import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

// 表紙画像(docs/COVER-IMAGE-PLAN.md参照)。Amazon商品画像への直リンクを個人の記録用に登録する。
// 実測で確定した前提: (1)CSPのimg-srcが外部画像を全ブロックしていた (2)サイズ指定次第で
// 同じ画像が2KB〜42KBまで変わる (3)表紙が無いISBNは404ではなく200+43バイトの透明GIFを返す
// (4)ISBN形式のURLは書籍でしか当たらない。

test('CSPのimg-srcはAmazonの2ホストだけを許可し、ワイルドカードにしない', async () => {
  const http = await read('src/http.ts');
  assert.match(http, /img-src 'self' data: https:\/\/m\.media-amazon\.com https:\/\/images-na\.ssl-images-amazon\.com/);
  assert.doesNotMatch(http, /img-src[^\n]*https:\s*[;"]/); // "https:" 単独のワイルドカード許可を入れない
});

test('表紙保存APIはCSPと同じホストだけを許可し、サイズ指定を正規化する', async () => {
  const route = await read('src/routes/work-cover.ts');
  const index = await read('src/index.ts');
  assert.match(index, /updateWorkCover\(request, env, auth, decodeURIComponent\(m\[1\]!\)\)/);
  assert.match(route, /ALLOWED_HOSTS = new Set\(\["m\.media-amazon\.com", "images-na\.ssl-images-amazon\.com"\]\)/);
  assert.match(route, /url\.protocol !== "https:"/);
  // /images/P/形式は中サイズ(MZZZZZZZ)へ、/images/I/形式は300px相当へ正規化する
  assert.match(route, /MZZZZZZZ\.jpg`/);
  assert.match(route, /_SL300_\.jpg`/);
});

test('cover.jsはonerrorが発火しない透明GIFをnaturalWidthで判定する', async () => {
  const cover = await read('public/core/cover.js');
  assert.match(cover, /export function probeCoverImage/);
  const body = cover.match(/export function probeCoverImage[\s\S]*?\n}/)[0];
  assert.match(body, /naturalWidth > 1/);
  assert.match(body, /img\.onerror = \(\) => finish\(false\)/);
});

test('ISBN-13からISBN-10への変換を持つ(978始まり以外はnull)', async () => {
  const cover = await read('public/core/cover.js');
  assert.match(cover, /export function isbn13ToIsbn10/);
  assert.match(cover, /digits\.startsWith\("978"\)/);
});

test('作品一覧のサムネイルはlazy読み込みで、詳細より小さいサイズを使う', async () => {
  const library = await read('public/views/library.js');
  assert.match(library, /class="work-cover-thumb"/);
  assert.match(library, /loading="lazy" decoding="async"/);
  assert.match(library, /coverThumbUrl\(cover\)/);
});

test('詳細パネルは表紙の取得(ISBN自動/URL貼り付け)と削除を持つ', async () => {
  const detail = await read('public/views/detail.js');
  assert.match(detail, /data-action='fetch-cover-from-isbn'/);
  assert.match(detail, /data-cover-form/);
  assert.match(detail, /data-action='remove-cover'/);
  assert.match(detail, /candidateCoverUrlFromWork\(work\)/);
});

// 実装時に見つけたバグ: [^0-9X]除去だとASIN(英字混じり、例B08P5KMDVX)の英字が
// 全部消えて4文字になり、本のISBN-10と区別できなくなっていた。
test('amazonCoverUrlFromIsbn10は英字混じりのASINを本のISBN-10と誤認しない', async () => {
  const cover = await read('public/core/cover.js');
  const body = cover.match(/export function amazonCoverUrlFromIsbn10[\s\S]*?\n}/)[0];
  assert.match(body, /\^\[0-9\]\{9\}\[0-9X\]\$/);
  assert.doesNotMatch(body, /replace\(\/\[\^0-9X\]\/g/);
});

test('商品ページURLからASINは取れたが本の形式でない場合、専用の案内を出す', async () => {
  const detail = await read('public/views/detail.js');
  assert.match(detail, /この商品は自動で取得できません/);
});

test('表紙の保存・削除はsetWorkCoverを経由し、setWorkRatingと同じ409フォールバックを持つ', async () => {
  const store = await read('public/core/store.js');
  const body = store.match(/export async function setWorkCover[\s\S]*?\n}/)[0];
  assert.match(body, /api\(`\/api\/works\/\$\{encodeURIComponent\(workId\)\}\/cover`/);
  assert.match(body, /error\.status === 409/);
});
