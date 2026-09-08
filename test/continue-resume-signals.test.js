import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Home APIはactive作品へ最新メモと最新experience時刻を添えるが並び順は変えない", async () => {
  const route = await read("src/routes/home-v07.ts");
  assert.match(route, /SELECT n\.content FROM notes n WHERE n\.work_id = w\.id ORDER BY n\.updated_at DESC LIMIT 1/);
  assert.match(route, /SELECT n\.updated_at FROM notes n WHERE n\.work_id = w\.id ORDER BY n\.updated_at DESC LIMIT 1/);
  assert.match(route, /SELECT e\.updated_at FROM experiences e WHERE e\.work_id = w\.id ORDER BY e\.updated_at DESC LIMIT 1/);
  assert.match(route, /ORDER BY w\.updated_at DESC\s*LIMIT 8/);
  assert.doesNotMatch(route, /ORDER BY resume_at|ORDER BY engagement_at/);
});

test("engagement_atはnoteとexperienceだけから導出し、work更新を体験時刻へ混ぜない", async () => {
  const route = await read("src/routes/home-v07.ts");
  assert.match(route, /const engagementAt = newestTimestamp\(noteAt, experienceAt\)/);
  assert.match(route, /engagement_at: engagementAt/);
  assert.doesNotMatch(route, /engagementAt = newestTimestamp\([^\n]*workAt/);
});

test("resume_atは最新の手掛かりを維持し、由来をnote・experience・work_updateで返す", async () => {
  const route = await read("src/routes/home-v07.ts");
  assert.match(route, /const resumeAt = newestTimestamp\(workAt, engagementAt\)/);
  assert.match(route, /resumeSource = "note"/);
  assert.match(route, /resumeSource = "experience"/);
  assert.match(route, /resumeSource = "work_update"/);
  assert.match(route, /resume_source: resumeSource/);
});

test("CONTINUEカードはresume情報をstate更新で失わず、時期・進捗・前回メモを出す", async () => {
  const home = await read("public/views/home.js");
  assert.match(home, /\{ \.\.\.item, \.\.\.\(state\.works\.get\(String\(item\.id\)\) \|\| \{\}\) \}/);
  assert.match(home, /function resumeRecencyLabel/);
  assert.match(home, /今日触った/);
  assert.match(home, /今週触った/);
  assert.match(home, /少し空いている/);
  assert.match(home, /久しぶり/);
  assert.match(home, /function resumeProgressText/);
  assert.match(home, /reading-card-progress/);
  assert.match(home, /前回のメモ/);
  assert.match(home, /reading-card-memory/);
});

test("work update由来の時刻は「触った」と呼ばず更新表現へ切り替える", async () => {
  const home = await read("public/views/home.js");
  const body = home.match(/function resumeRecencyLabel[\s\S]*?\n}/)?.[0] || "";
  assert.match(body, /source !== "note" && source !== "experience"/);
  assert.match(body, /今日更新/);
  assert.match(body, /今週更新/);
  assert.match(body, /少し前に更新/);
  assert.match(body, /最終更新から久しぶり/);
  assert.match(home, /function resumeRecencyTitle/);
  assert.match(home, /作品情報の更新/);
});

test("Resume Signalsはカードを管理画面化せず、最大3種類の手掛かりとして控えめに見せる", async () => {
  const css = await read("public/styles/home-decision-surface.css");
  assert.match(css, /reading-card-resume-signals/);
  assert.match(css, /reading-card-recency/);
  assert.match(css, /reading-card-progress/);
  assert.match(css, /reading-card-memory/);
  assert.match(css, /-webkit-line-clamp:2/);
  assert.match(css, /@media\(max-width:767px\)[\s\S]*-webkit-line-clamp:3/);
});

test("CONTINUEはResume Signals導入後も作品へ戻ることだけを主操作にする", async () => {
  const composition = await read("public/views/home-composition.js");
  assert.match(composition, /作品へ戻る →/);
  assert.doesNotMatch(composition, /最終更新/);
  assert.doesNotMatch(composition, /reading-card-updated/);
});
