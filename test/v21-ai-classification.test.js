import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const server = readFileSync(new URL('../src/routes/work-tools-v21.ts', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../public/views/detail.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const dialogs = readFileSync(new URL('../public/views/dialogs.js', import.meta.url), 'utf8');
const plan = readFileSync(new URL('../docs/bulk-unclassified-classification-plan.md', import.meta.url), 'utf8');

test('AI prompt requests one JSON code block and includes classification', () => {
  assert.match(server, /事実情報と分類をJSONで返してください/);
  assert.match(server, /コードブロックを1個だけ出力する/);
  assert.match(server, /必ず\\`\\`\\`jsonで始め/);
  assert.match(server, /facts\.labels\.genre/);
  assert.match(server, /facts\.labels\.theme/);
});

test('classification uses current vocabulary, limits, and safe tag handling', () => {
  assert.match(server, /const LABEL_LIMITS[^\n]+genre: 3, theme: 5, tag: 3/);
  assert.match(server, /classification\.vocabularyに適切な語がある場合/);
  assert.match(server, /knownTags/);
  assert.match(server, /allowedSuggestedTags/);
  assert.match(server, /current\.genre\.length \? current\.genre : suggested\.genre/);
  assert.match(server, /current\.theme\.length \? current\.theme : suggested\.theme/);
});

test('classification import preserves existing factual fields and rebuilds labels/search', () => {
  assert.match(server, /const nextCreator = currentCreator \|\| creatorDisplay \|\| null/);
  assert.match(server, /const nextReleaseYear = currentReleaseYear \?\? releaseYear \?\? null/);
  assert.match(server, /await syncLabels\(/);
  assert.match(server, /await rebuildWorkSearchText\(/);
  assert.match(server, /WORK_FACTS_IMPORTED/);
});

test('frontend shows classification review and blocks unknown tags', () => {
  assert.match(html, /id="factPreview"/);
  assert.match(detail, /kind === "tag" && !known && !current/);
  assert.match(detail, /function sanitizeFactLabels/);
});

// v211の後付けパッチ(描画後にtextContentを検査して非対象をuncheckする)は
// 再構築で不要になった。checked状態を描画時点で正しく計算するため、
// 「現在使用中以外は初期OFF」を直接検証する。
test('every classification not already on the work requires explicit approval', () => {
  assert.match(detail, /const checked = current; \/\/ 新規候補は初期OFF/);
  assert.match(detail, /既存語彙・確認して追加/);
  assert.match(detail, /新規候補・確認して追加/);
});

// 旧app-v21がJSでtitleLabelの後ろへcreatorLabelを差し込んでいた処理は、
// 静的HTMLで最初から作者欄をタイトル欄の直後に置くことで不要になった。
test('creator field is promoted and classifications are displayed by kind', () => {
  const titleIndex = html.indexOf('name="title"');
  const creatorIndex = html.indexOf('id="creatorField"');
  assert.ok(titleIndex >= 0 && creatorIndex > titleIndex && creatorIndex - titleIndex < 400);
  assert.match(detail, /group\("genre", "ジャンル"\)/);
  assert.match(detail, /group\("theme", "テーマ"\)/);
  assert.match(detail, /group\("tag", "タグ"\)/);
});

test('作品ダイアログとAI分類フォームはlabelSuggestions datalistを共有する', () => {
  assert.match(html, /id="labelSuggestions"/);
  assert.match(html, /name="genre" list="labelSuggestions"/);
  assert.match(dialogs, /formLabels/);
});

test('bulk unclassified plan requires staged, resumable, reviewed updates', () => {
  assert.match(plan, /未分類整理センター/);
  assert.match(plan, /AIの回答をそのまま本番へ反映せず/);
  assert.match(plan, /100作品単位で停止/);
  assert.match(plan, /versionを照合/);
  assert.match(plan, /バッチ単位で元の分類へ戻せる/);
});
