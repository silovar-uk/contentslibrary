import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const server = readFileSync(new URL('../src/routes/work-tools-v21.ts', import.meta.url), 'utf8');
const frontend = readFileSync(new URL('../public/app-v21-ai-classification.js', import.meta.url), 'utf8');
const reviewSafety = readFileSync(new URL('../public/app-v211-classification-review-safety.js', import.meta.url), 'utf8');
const appEntry = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
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
  assert.match(frontend, /v21ClassificationPreview/);
  assert.match(frontend, /新規候補は初期OFF/);
  assert.match(frontend, /kind === 'tag' && !known && !current/);
  assert.match(frontend, /sanitizeFactLabelsV21/);
});

test('every classification not already on the work requires explicit approval', () => {
  assert.match(reviewSafety, /isCurrent = state\.textContent\.trim\(\) === '現在使用中'/);
  assert.match(reviewSafety, /if \(!isCurrent\) input\.checked = false/);
  assert.match(reviewSafety, /既存語彙・確認して追加/);
  assert.match(reviewSafety, /新規候補・確認して追加/);
});

test('creator field is promoted and classifications are displayed by kind', () => {
  assert.match(frontend, /titleLabel\.after\(creatorLabel\)/);
  assert.match(frontend, /classificationGroupV21\('genre'/);
  assert.match(frontend, /classificationGroupV21\('theme'/);
  assert.match(frontend, /classificationGroupV21\('tag'/);
});

test('V21 safety modules load before import orchestration and are syntax-checked', () => {
  const v21 = appEntry.indexOf("import './app-v21-ai-classification.js';");
  const v211 = appEntry.indexOf("import './app-v211-classification-review-safety.js';");
  const v20 = appEntry.indexOf("import './app-v20-import-orchestrator.js';");
  assert.ok(v21 >= 0);
  assert.ok(v211 > v21);
  assert.ok(v20 > v211);
  assert.match(packageJson.scripts['check:frontend'], /app-v21-ai-classification\.js/);
  assert.match(packageJson.scripts['check:frontend'], /app-v211-classification-review-safety\.js/);
});

test('bulk unclassified plan requires staged, resumable, reviewed updates', () => {
  assert.match(plan, /未分類整理センター/);
  assert.match(plan, /AIの回答をそのまま本番へ反映せず/);
  assert.match(plan, /100作品単位で停止/);
  assert.match(plan, /versionを照合/);
  assert.match(plan, /バッチ単位で元の分類へ戻せる/);
});
