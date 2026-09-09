import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { contextualRescueMarkup } from "../public/views/home-rescue.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Rescue APIは通常CONTINUE上位8件を除外して最大1件だけ返す", async () => {
  const route = await read("src/routes/home-v07.ts");
  assert.match(route, /WITH recent_active AS/);
  assert.match(route, /ORDER BY updated_at DESC\s+LIMIT 8/);
  assert.match(route, /w\.id NOT IN \(SELECT id FROM recent_active\)/);
  assert.match(route, /ORDER BY rescue_engagement_at DESC, updated_at DESC\s+LIMIT 1/);
});

test("Rescueはengagementとwork更新の両方に30日の保守的cutoffを要求する", async () => {
  const route = await read("src/routes/home-v07.ts");
  assert.match(route, /const RESCUE_AFTER_DAYS = 30/);
  assert.match(route, /AND w\.updated_at <= \?/);
  assert.match(route, /WHERE rescue_engagement_at IS NOT NULL\s+AND rescue_engagement_at <= \?/);
  assert.match(route, /\.bind\(owner, owner, cutoff, cutoff\)/);
});

test("Rescueのengagementはnote・experience・progressの最新から成立する", async () => {
  const route = await read("src/routes/home-v07.ts");
  assert.match(route, /w\.progress_engagement_at/);
  assert.match(route, /NULLIF\(MAX\(/);
  assert.match(route, /COALESCE\(resume_note_at, ''\)/);
  assert.match(route, /COALESCE\(resume_experience_at, ''\)/);
  assert.match(route, /COALESCE\(progress_engagement_at, ''\)/);
  assert.match(route, /rescue_engagement_at IS NOT NULL/);
});

test("Rescueは独立GET endpointでHome本体の並び順を変更しない", async () => {
  const route = await read("src/routes/home-v07.ts");
  const index = await read("src/index.ts");
  assert.match(index, /getHomeRescue, getHomeV07/);
  assert.match(index, /path === "\/api\/home\/rescue"\) return getHomeRescue/);
  assert.match(route, /export async function getHomeV07[\s\S]*ORDER BY w\.updated_at DESC\s+LIMIT 8/);
  assert.doesNotMatch(route.match(/export async function getHomeV07[\s\S]*?export async function getHomeRescue/)?.[0] || "", /rescue_engagement_at/);
});

test("Rescue UIは罪悪感コピーを使わず作品詳細だけを主操作にする", () => {
  const markup = contextualRescueMarkup({
    id: 'w<1',
    title: '途中 <作品>',
    creator: '作者 & Co',
    resume_note: '前回 > ここまで'
  });
  assert.match(markup, /REMEMBER/);
  assert.match(markup, /これ、途中だった。/);
  assert.match(markup, /もう一度見る →/);
  assert.match(markup, /data-open-work="w&lt;1"/);
  assert.match(markup, /途中 &lt;作品&gt;/);
  assert.match(markup, /作者 &amp; Co/);
  assert.match(markup, /前回 &gt; ここまで/);
  assert.doesNotMatch(markup, /放置|忘れて|30日|再開してください/);
  assert.doesNotMatch(markup, /data-action=|data-reading-priority|data-set-rating/);
});

test("RescueはCONTINUEの下へ置き、新しいMutationObserverやtoastを増やさない", async () => {
  const rescue = await read("public/views/home-rescue.js");
  const css = await read("public/styles/home-decision-surface.css");
  assert.match(rescue, /#editorialReadingFeature/);
  assert.match(rescue, /feature\.append\(host\)/);
  assert.doesNotMatch(rescue, /MutationObserver/);
  assert.doesNotMatch(rescue, /toast\(/);
  assert.match(css, /\.home-rescue-cue/);
  assert.match(css, /@media\(max-width:767px\)[\s\S]*\.home-rescue-cue\{grid-template-columns:1fr/);
});

test("Rescueは初期表示とHomeへ戻ったときだけ再取得する", async () => {
  const rescue = await read("public/views/home-rescue.js");
  const app = await read("public/app.js");
  assert.match(rescue, /api\("\/api\/home\/rescue"\)/);
  assert.match(rescue, /view === "home" && lastView !== null && lastView !== "home"/);
  assert.match(app, /initHomeRescue\(\)/);
});
