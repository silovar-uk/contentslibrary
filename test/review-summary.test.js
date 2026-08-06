import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildSummaryResearchPrompt,
  normalizeReviewSummary,
  reconcileResearchResponse,
  reviewSummaryText
} from "../public/views/review-summary.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("古いversionの調査JSONは現在versionへ自動調整して受け入れる", () => {
  const result = reconcileResearchResponse(`\`\`\`json
  {
    "work_id": "work-1",
    "version": 2,
    "summary": {
      "text": "作品の内容と主要な論点をまとめた概要です。",
      "sources": [{ "url": "https://example.com/review", "title": "書評" }]
    },
    "candidates": []
  }
  \`\`\``, { id: "work-1", version: 8 });
  assert.equal(result.versionMismatch, true);
  assert.equal(result.receivedVersion, 2);
  assert.equal(result.currentVersion, 8);
  assert.equal(JSON.parse(result.json).version, 8);
  assert.equal(result.summary.text, "作品の内容と主要な論点をまとめた概要です。");
});

test("work_idが違うJSONは引き続き拒否する", () => {
  assert.throws(
    () => reconcileResearchResponse(JSON.stringify({ work_id: "other", version: 1 }), { id: "work-1", version: 8 }),
    /work_id/
  );
});

test("調査プロンプトは単語候補に加えて約150文字の概要と出典を要求する", () => {
  const prompt = buildSummaryResearchPrompt({ work_id: "work-1", version: 3, work: { title: "架空の本" }, existing_word_memos: [] });
  assert.match(prompt, /約150文字の概要/);
  assert.match(prompt, /120〜180文字/);
  assert.match(prompt, /概要にも根拠となる有効な出典URL/);
  assert.match(prompt, /"summary"/);
  assert.match(prompt, /JSONコードブロック1個だけ/);
});

test("概要は旧文字列、人入力、AI由来の来歴を読める", () => {
  assert.deepEqual(normalizeReviewSummary("旧形式の概要"), { text: "旧形式の概要", source_type: "human" });
  const ai = normalizeReviewSummary({
    text: "AIが作った概要",
    source_type: "ai_research",
    research_id: "research-1",
    sources: [{ url: "https://example.com/a" }]
  });
  assert.equal(ai.source_type, "ai_research");
  assert.equal(ai.sources.length, 1);
  assert.equal(reviewSummaryText({ metadata: { review_summary: ai } }), "AIが作った概要");
});

test("詳細編集・概要だけ保存・単語と同時保存の導線を持つ", async () => {
  const source = await read("public/views/review-summary.js");
  assert.match(source, /id="reviewSummaryForm"/);
  assert.match(source, /data-review-summary-save-only/);
  assert.match(source, /data-word-memo-import/);
  assert.match(source, /waitAndSaveAfterWordImport/);
  assert.match(source, /error\.status === 409 && retry/);
  assert.match(source, /parsed\.version = currentVersion/);
});

test("概要は一覧でPC3行・モバイル2行に省略表示する", async () => {
  const css = await read("public/styles/review-summary.css");
  assert.match(css, /-webkit-line-clamp:3/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*-webkit-line-clamp:2/);
  const source = await read("public/views/review-summary.js");
  assert.match(source, /review-summary-card--library/);
  assert.match(source, /review-summary-card--random/);
  assert.match(source, /review-summary-card--recent/);
  assert.match(source, /review-summary-card--reading/);
});

test("概要を検索インデックスへ含め、アプリ起動時に機能を接続する", async () => {
  const db = await read("src/db.ts");
  const app = await read("public/app.js");
  assert.match(db, /reviewSummaryFromMetadata/);
  assert.match(db, /reviewSummary, \.\.\.wordMemos/);
  assert.match(app, /initReviewSummary/);
  assert.match(app, /initReviewSummaryStability/);
});

test("概要カードの同一文字再設定を抑止してMutationObserverの再描画ループを防ぐ", async () => {
  const source = await read("public/views/review-summary-stability.js");
  assert.match(source, /descriptor\.get\.call\(this\) === next/);
  assert.match(source, /return;/);
  assert.match(source, /\[data-review-summary-card\]/);
});
