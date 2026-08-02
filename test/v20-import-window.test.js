import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

// Phase 1-B: verify is a shared, routable function — not duplicated logic
// that only the CI runner can reach.
test('verifyImportBatchは本体アプリからも呼び出せる', async () => {
  const importCenter = await read('src/routes/import-center.ts');
  assert.match(importCenter, /export async function verifyImportBatch/);
  assert.match(importCenter, /missing_applied_works/);
  assert.match(importCenter, /duplicate_active_source_keys/);

  const indexTs = await read('src/index.ts');
  assert.match(indexTs, /verifyImportBatch/);
  assert.match(indexTs, /items\|validate\|commit\|rollback\|verify/);

  const runner = await read('src/import-runner.ts');
  assert.match(runner, /verifyImportBatch/);
  assert.doesNotMatch(runner, /async function verifyBatch/); // no local duplicate left behind
});

// Phase 1-C: the 60-minute window must not silently expire mid-batch.
test('取込ウィンドウは反映のたびにスライドし、上限つきで延長できる', async () => {
  const importCenter = await read('src/routes/import-center.ts');
  assert.match(importCenter, /IMPORT_WINDOW_ABSOLUTE_MAX_MINUTES = 180/);
  assert.match(importCenter, /async function slideImportWindow/);
  assert.match(importCenter, /export async function extendImportWindow/);
  // slideImportWindow must actually be called from the three chunked actions
  const calls = importCenter.match(/await slideImportWindow\(env, auth\);/g) ?? [];
  assert.ok(calls.length >= 3, `slideImportWindow should be called from upload/validate/commit, found ${calls.length} call sites`);

  const indexTs = await read('src/index.ts');
  assert.match(indexTs, /import-center\/extend/);
  assert.match(indexTs, /extendImportWindow/);
});

// Phase 1.5: errors carry enough structured context for a 4-part UI error
// (cause / confirmed-so-far / production impact / next action) without the
// frontend having to infer anything from the internal status string.
test('423エラーは確定件数と次の行動を含む構造化コンテキストを持つ', async () => {
  const http = await read('src/http.ts');
  assert.match(http, /interface HttpErrorContext/);
  assert.match(http, /safe_state/);
  assert.match(http, /confirmed_count/);
  assert.match(http, /next_actions/);

  const importCenter = await read('src/routes/import-center.ts');
  assert.match(importCenter, /safeState: "一部反映済みの可能性"/);
  assert.match(importCenter, /nextActions: \["reenable_import_window"\]/);
});

// Phase 1.5: the frontend must never infer allowed actions from the
// internal status string — the server hands them over explicitly.
test('バッチ要約は状態ラベル・本番影響・許可操作を常に返す', async () => {
  const importCenter = await read('src/routes/import-center.ts');
  assert.match(importCenter, /const STATUS_LABELS/);
  assert.match(importCenter, /status_label: STATUS_LABELS\[row\.status\]\.label/);
  assert.match(importCenter, /allowed_actions: STATUS_LABELS\[row\.status\]\.actions/);
  assert.match(importCenter, /production_impact: STATUS_LABELS\[row\.status\]\.production_impact/);
});

// Phase 1-D: automatic rollback after a mid-commit failure must be opt-in,
// because commit is not atomic per item (see improvement plan §1.4) — an
// automatic rollback can itself only partially undo a partial commit.
test('CI取込の自動取消は既定で無効', async () => {
  const importer = await read('scripts/run-private-import.mjs');
  assert.match(importer, /AUTO_ROLLBACK/);
  assert.match(importer, /process\.env\.AUTO_ROLLBACK === 'true'/);
  assert.match(importer, /requires_manual_decision/);

  const workflow = await read('.github/workflows/run-private-import.yml');
  assert.match(workflow, /AUTO_ROLLBACK: \$\{\{ vars\.AUTO_ROLLBACK \|\| 'false' \}\}/);
});

// Phase 1-A / 5-7: every batch records which path created it, so future
// discrepancies don't require manually cross-referencing audit_events.
test('取込バッチは実行経路(browser/ci)を記録する', async () => {
  const migration = await read('migrations/0016_import_window_tracking.sql');
  assert.match(migration, /ALTER TABLE import_batches ADD COLUMN origin TEXT NOT NULL DEFAULT 'browser'/);

  const runner = await read('src/import-runner.ts');
  assert.match(runner, /createImportBatch\(request, env, auth, "ci"\)/);
});

// Phase 1-C (frontend): an expired window must produce an explicit,
// actionable panel — not a generic "エラー ###" message — because that
// silent failure was the root cause identified in improvement plan §1.1.
test('取込画面はウィンドウ失効を専用の再有効化パネルで案内する', async () => {
  const orchestrator = await read('public/import-center/app-v20-import-orchestrator.js');
  assert.match(orchestrator, /function importV20HandleApiError/);
  assert.match(orchestrator, /error\?\.code === 'IMPORT_CENTER_LOCKED'/);
  assert.match(orchestrator, /async function importV20Reenable/);
  // wired into every chunked-loop / mutating entry point
  const wiredCalls = orchestrator.match(/importV20HandleApiError\(error/g) ?? [];
  assert.ok(wiredCalls.length >= 5, `expected stage/commit/validate/rollback/reset to all route through the shared handler, found ${wiredCalls.length}`);
  assert.doesNotMatch(orchestrator, /importV20HandleLockedError/);
});

// Phase 2 (§5.4): every catch path must render the same 4-part error —
// cause / confirmed-so-far / production impact / next action — instead of
// each operation inventing its own shape.
test('エラー表示は原因・保存済み範囲・本番影響・次の行動の4要素を持つ', async () => {
  const orchestrator = await read('public/import-center/app-v20-import-orchestrator.js');
  assert.match(orchestrator, /description:`原因：\$\{error\.message\} \$\{confirmedNote\} 次の行動：\$\{nextActionText\}`/);
  assert.match(orchestrator, /const safety = error\.safeState \|\| fallbackSafety/);
  // every mutating catch block supplies its own confirmedText/nextActionText fallback
  for (const label of ['stage-error', 'commit-error', 'revalidate-error', 'rollback-error', 'reset-error']) {
    assert.match(orchestrator, new RegExp(`logKeyPrefix:'${label}'`));
  }
});

test('取込有効期限を常時カウントダウン表示する', async () => {
  const list = await read('public/import-center/app-v09.js');
  assert.match(list, /function importStartCountdown\(enabledUntil\)/);
  assert.match(list, /取込有効期限 残り \$\{importFormatCountdown\(remaining\)\}/);
  assert.match(list, /importCountdownTimer = setInterval\(importUpdateCountdown, 1000\)/);
});
