import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildWordMemoResearchPackage,
  buildWordMemoResearchPrompt,
  normalizeWordMemoEntries,
  normalizeWordMemos,
  parseWordMemoInput,
  parseWordMemoResearchResponse
} from "../public/views/word-memos.js";

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

test("旧文字列は人入力として扱い、AI由来と出典を恒久的に保持する", () => {
  const entries = normalizeWordMemoEntries([
    "余白",
    {
      text: "喪失",
      source_type: "ai_research",
      confidence: "high",
      reason: "中心的な主題",
      sources: [{ url: "https://example.com/review", title: "書評" }]
    }
  ]);
  assert.equal(entries[0].source_type, "human");
  assert.equal(entries[1].source_type, "ai_research");
  assert.equal(entries[1].sources[0].url, "https://example.com/review");
});

test("同じAI候補は出典を統合し、人入力と同名のAI候補は人入力を維持する", () => {
  const entries = normalizeWordMemoEntries([
    { text: "記憶", source_type: "ai_research", sources: [{ url: "https://a.example/" }] },
    { text: "記憶", source_type: "ai_research", sources: [{ url: "https://b.example/" }] },
    "余白",
    { text: "余白", source_type: "ai_research", sources: [{ url: "https://c.example/" }] }
  ]);
  assert.equal(entries[0].sources.length, 2);
  assert.equal(entries[1].source_type, "human");
});

test("個別ページに単語メモの追加・検索・削除・書評調査導線を持つ", async () => {
  const source = await read("public/views/word-memos.js");
  assert.match(source, /<h3>単語メモ<\/h3>/);
  assert.match(source, /data-word-memo-search/);
  assert.match(source, /data-word-memo-remove/);
  assert.match(source, /data-word-memo-research-open/);
  assert.match(source, /data-word-memo-show-sources/);
  assert.match(source, /setFilters\(\{ q: word \}\)/);
  assert.match(source, /metadata\.word_memos = normalized/);
  assert.match(source, /読点・カンマ区切り/);
});

test("調査プロンプトは作品情報・既存単語・信頼できる出典・JSON限定を含む", () => {
  const pkg = buildWordMemoResearchPackage({
    id: "work-1",
    version: 4,
    title: "架空の本",
    creator: "著者",
    type: "book",
    labels: { genre: ["文学"], theme: ["記憶"], tag: [] },
    metadata: { word_memos: ["余白"], ai_facts: { work: { publisher: "出版社", isbn_13: "9780000000000" } } }
  });
  const prompt = buildWordMemoResearchPrompt(pkg);
  assert.equal(pkg.work_id, "work-1");
  assert.deepEqual(pkg.existing_word_memos, [{ text: "余白", source_type: "human" }]);
  assert.match(prompt, /出版社・著者公式、新聞・雑誌の書評、図書館・大学・文学館/);
  assert.match(prompt, /JSONコードブロック1個だけ/);
  assert.match(prompt, /"work_id": "work-1"/);
});

test("AI回答はwork_idとversionを照合し、出典なし候補を除外する", () => {
  const result = parseWordMemoResearchResponse(JSON.stringify({
    schema_version: 1,
    work_id: "work-1",
    version: 4,
    candidates: [
      { text: "喪失", confidence: "high", sources: [{ url: "https://example.com/a" }] },
      { text: "根拠なし", confidence: "high", sources: [] }
    ]
  }), { work_id: "work-1", version: 4 });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.skipped, 1);
  assert.throws(() => parseWordMemoResearchResponse(JSON.stringify({ work_id: "other", version: 4, candidates: [] }), { work_id: "work-1", version: 4 }), /work_id/);
  assert.throws(() => parseWordMemoResearchResponse(JSON.stringify({ work_id: "work-1", version: 3, candidates: [] }), { work_id: "work-1", version: 4 }), /version/);
});

test("AI由来のチップは文字を増やさず色で区別する", async () => {
  const css = await read("public/styles/word-memos.css");
  const source = await read("public/views/word-memos.js");
  assert.match(css, /\.word-memo-chip\.is-ai/);
  assert.match(css, /linear-gradient/);
  assert.match(source, /ai \? "is-ai" : "is-human"/);
  assert.doesNotMatch(source, />✨\s*\$\{esc\(entry\.text\)\}/);
});

test("単語メモを作品検索インデックスへ含め、文字列とオブジェクトの両方を読む", async () => {
  const db = await read("src/db.ts");
  assert.match(db, /wordMemosFromMetadata/);
  assert.match(db, /typeof word === "string"/);
  assert.match(db, /typeof \(word as Record<string, unknown>\)\.text === "string"/);
  assert.match(db, /\.\.\.wordMemos/);
});

test("アプリ起動時に単語メモ機能を初期化する", async () => {
  const app = await read("public/app.js");
  assert.match(app, /import \{ initWordMemos \} from "\.\/views\/word-memos\.js"/);
  assert.match(app, /initWordMemos\(\)/);
});
