import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("migrationはprogress_engagement_atだけを追加し既存データを推測backfillしない", async () => {
  const migration = await read("migrations/0019_progress_engagement.sql");
  assert.match(migration, /ALTER TABLE works ADD COLUMN progress_engagement_at TEXT/);
  assert.doesNotMatch(migration, /UPDATE works|created_at|updated_at/);
});

test("work PATCHは進捗を含む場合だけ事前値を読み、実変更を判定する", async () => {
  const route = await read("src/routes/work-progress-engagement.ts");
  assert.match(route, /payload\.progress_current !== undefined \|\| payload\.progress_total !== undefined/);
  assert.match(route, /SELECT progress_current, progress_total FROM works/);
  assert.match(route, /if \(before !== after\) return true/);
  assert.match(route, /if \(!includesProgress\) return updateWork/);
});

test("進捗engagementはwork PATCH成功後だけ記録しversionやupdated_atを再更新しない", async () => {
  const route = await read("src/routes/work-progress-engagement.ts");
  const updateCall = route.indexOf("const response = await updateWork");
  const signalUpdate = route.indexOf("UPDATE works SET progress_engagement_at = ?");
  assert.ok(updateCall >= 0 && signalUpdate > updateCall);
  assert.match(route, /if \(!changed\) return response/);
  assert.doesNotMatch(route, /progress_engagement_at = \?.*version/s);
  assert.doesNotMatch(route, /progress_engagement_at = \?.*updated_at/s);
});

test("補助シグナルの記録失敗は保存済みwork PATCHをエラー扱いに戻さない", async () => {
  const route = await read("src/routes/work-progress-engagement.ts");
  assert.match(route, /try \{[\s\S]*progress_engagement_at[\s\S]*return getWork/);
  assert.match(route, /catch \{[\s\S]*return response/);
});

test("通常work PATCHだけをwrapperへ通し、preferenceやcover等の専用PATCHは分離したまま", async () => {
  const index = await read("src/index.ts");
  assert.match(index, /updateWorkWithProgressEngagement/);
  assert.match(index, /request\.method === "PATCH"\) return updateWorkWithProgressEngagement\(request, env, auth, id\)/);
  assert.match(index, /updateWorkPreferenceV131/);
  assert.match(index, /updateWorkCover/);
});

test("ResumeとRescueはprogress_engagement_atをengagementとして読む", async () => {
  const home = await read("src/routes/home-v07.ts");
  assert.match(home, /const progressAt = timestampValue\(row\.progress_engagement_at\)/);
  assert.match(home, /newestTimestamp\(noteAt, experienceAt, progressAt\)/);
  assert.match(home, /resumeSource = "progress"/);
  assert.match(home, /COALESCE\(progress_engagement_at, ''\)/);
});
