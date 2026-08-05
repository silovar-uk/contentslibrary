import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeWordMemos, parseWordMemoInput } from "../public/views/word-memos.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("単語メモはNFKC正規化・重複除去・読点区切りに対応する", () => {
  assert.deepEqual(parseWordMemoInput(" 余白、ケア,構造\n余白 "), ["余白", "ケア", "構造"]);
  assert.deepEqual(normalizeWordMemos(["ＡＩ", "AI", "  ケア  "]), ["AI", "ケア"]);
});

test("単語メモは1件40文字・最大50件に制限する", () => {
  const values = Array.from({ length: 60 }, (_, index) => `単語${index}`);
  assert.equal(normalizeWordMemos(values).length, 50);
  assert.deepEqual(normalizeWordMemos(["あ".repeat(41), "有効"]), ["有効"]);
});

test("個別ページに単語メモの追加・検索・削除導線を持つ", async () => {
  const source = await read("public/views/word-memos.js");
  assert.match(source, /<h3>単語メモ<\/h3>/);
  assert.match(source, /data-word-memo-search/);
  assert.match(source, /data-word-memo-remove/);
  assert.match(source, /setFilters\(\{ q: word \}\)/);
  assert.match(source, /metadata\.word_memos = words/);
  assert.match(source, /読点・カンマ区切り/);
});

test("単語メモを作品検索インデックスへ含める", async () => {
  const db = await read("src/db.ts");
  assert.match(db, /wordMemosFromMetadata/);
  assert.match(db, /metadata_json FROM works/);
  assert.match(db, /\.\.\.wordMemos/);
});

test("アプリ起動時に単語メモ機能を初期化する", async () => {
  const app = await read("public/app.js");
  assert.match(app, /import \{ initWordMemos \} from "\.\/views\/word-memos\.js"/);
  assert.match(app, /initWordMemos\(\)/);
});
