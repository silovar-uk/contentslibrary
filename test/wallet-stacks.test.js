import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { walletStackWorks } from "../public/views/wallet-stacks.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Walletスタックは更新が新しい順に最大5件を返す", () => {
  const works = Array.from({ length: 7 }, (_, index) => ({ id: String(index), updated_at: `2026-08-0${index + 1}T00:00:00Z`, keep: index !== 0 }));
  const picked = walletStackWorks(works, (work) => work.keep, 5);
  assert.equal(picked.length, 5);
  assert.deepEqual(picked.map((work) => work.id), ["6", "5", "4", "3", "2"]);
});

test("最優先・積読・読みたいの3種類だけを既存データから構成する", async () => {
  const source = await read("public/views/wallet-stacks.js");
  assert.match(source, /key: "top"/);
  assert.match(source, /key: "owned"/);
  assert.match(source, /key: "want"/);
  assert.match(source, /readingPriority\(work\) === "top"/);
  assert.match(source, /work\.status === "owned_unread"/);
  assert.match(source, /work\.status === "want"/);
  assert.doesNotMatch(source, /今年読む/);
});

test("表紙なし作品にもタイトルカードを用意する", async () => {
  const source = await read("public/views/wallet-stacks.js");
  assert.match(source, /isAllowedCoverUrl/);
  assert.match(source, /wallet-stack-title-fallback/);
  assert.match(source, /data-open-work/);
});

test("展開状態と作品versionを署名に含めて不要な再描画を防ぐ", async () => {
  const source = await read("public/views/wallet-stacks.js");
  assert.match(source, /const signature = groups\.map/);
  assert.match(source, /work\.id}@\$\{work\.version}/);
  assert.match(source, /grid\.dataset\.signature === signature/);
});

test("すべて見るは既存ライブラリの状態・優先度絞り込みへ接続する", async () => {
  const source = await read("public/views/wallet-stacks.js");
  assert.match(source, /setView\("library"\)/);
  assert.match(source, /setFilters\(\{ statuses: \["owned_unread"\] \}\)/);
  assert.match(source, /setFilters\(\{ statuses: \["want"\] \}\)/);
  assert.match(source, /#filterReadingPriority/);
});

test("スマホではスタックを1列にし、展開時も横幅内に収める", async () => {
  const css = await read("public/styles/wallet-stacks.css");
  assert.match(css, /@media\(max-width:767px\)/);
  assert.match(css, /\.wallet-stacks-grid\{gap:10px\}/);
  assert.match(css, /var\(--stack-offset\) \* 34px/);
});

test("アプリ起動時にEditorial Homeの後でWalletスタックを初期化する", async () => {
  const app = await read("public/app.js");
  assert.match(app, /initWalletStacks/);
  assert.match(app, /initEditorialHome\(\);\s*initWalletStacks\(\);/);
});
