import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isEngagementResumeSource, resumeRecencyLabel } from "../public/core/resume-time.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-09-08T00:00:00.000Z");
const ago = (days) => new Date(NOW - days * DAY).toISOString();

test("Home APIはactive作品へ最新メモ・experience・進捗engagementを添えるが並び順は変えない", async () => {
  const route = await read("src/routes/home-v07.ts");
  assert.match(route, /SELECT n\.content FROM notes n WHERE n\.work_id = w\.id ORDER BY n\.updated_at DESC LIMIT 1/);
  assert.match(route, /SELECT n\.updated_at FROM notes n WHERE n\.work_id = w\.id ORDER BY n\.updated_at DESC LIMIT 1/);
  assert.match(route, /SELECT e\.updated_at FROM experiences e WHERE e\.work_id = w\.id ORDER BY e\.updated_at DESC LIMIT 1/);
  assert.match(route, /row\.progress_engagement_at/);
  assert.match(route, /ORDER BY w\.updated_at DESC\s*LIMIT 8/);
  assert.doesNotMatch(route, /ORDER BY resume_at|ORDER BY engagement_at/);
});

test("engagement_atはnote・experience・progressから導出し、work更新を体験時刻へ混ぜない", async () => {
  const route = await read("src/routes/home-v07.ts");
  assert.match(route, /const progressAt = timestampValue\(row\.progress_engagement_at\)/);
  assert.match(route, /const engagementAt = newestTimestamp\(noteAt, experienceAt, progressAt\)/);
  assert.match(route, /engagement_at: engagementAt/);
  assert.doesNotMatch(route, /engagementAt = newestTimestamp\([^\n]*workAt/);
});

test("resume_atは最新の手掛かりを維持し、由来をnote・experience・progress・work_updateで返す", async () => {
  const route = await read("src/routes/home-v07.ts");
  assert.match(route, /const resumeAt = newestTimestamp\(workAt, engagementAt\)/);
  assert.match(route, /resumeSource = "note"/);
  assert.match(route, /resumeSource = "experience"/);
  assert.match(route, /resumeSource = "progress"/);
  assert.match(route, /resumeSource = "work_update"/);
  assert.match(route, /resume_source: resumeSource/);
});

test("CONTINUEカードはresume情報をstate更新で失わず、時期・進捗・前回メモを出す", async () => {
  const home = await read("public/views/home.js");
  assert.match(home, /from "\.\.\/core\/resume-time\.js"/);
  assert.match(home, /\{ \.\.\.item, \.\.\.\(state\.works\.get\(String\(item\.id\)\) \|\| \{\}\) \}/);
  assert.match(home, /resumeRecencyLabel\(work\.resume_at, work\.resume_source\)/);
  assert.match(home, /function resumeProgressText/);
  assert.match(home, /reading-card-progress/);
  assert.match(home, /前回のメモ/);
  assert.match(home, /reading-card-memory/);
});

test("note・experience・progressをengagement由来として扱う", () => {
  assert.equal(isEngagementResumeSource("note"), true);
  assert.equal(isEngagementResumeSource("experience"), true);
  assert.equal(isEngagementResumeSource("progress"), true);
  assert.equal(isEngagementResumeSource("work_update"), false);
  assert.equal(isEngagementResumeSource(undefined), false);
});

test("engagement由来は1日・7日・30日の境界で再開ラベルを切り替える", () => {
  assert.equal(resumeRecencyLabel(ago(0.5), "note", NOW), "今日触った");
  assert.equal(resumeRecencyLabel(ago(1), "progress", NOW), "今週触った");
  assert.equal(resumeRecencyLabel(ago(6.9), "experience", NOW), "今週触った");
  assert.equal(resumeRecencyLabel(ago(7), "experience", NOW), "少し空いている");
  assert.equal(resumeRecencyLabel(ago(29.9), "progress", NOW), "少し空いている");
  assert.equal(resumeRecencyLabel(ago(30), "note", NOW), "久しぶり");
});

test("work update由来は「触った」と呼ばず更新表現へ切り替える", () => {
  assert.equal(resumeRecencyLabel(ago(0.5), "work_update", NOW), "今日更新");
  assert.equal(resumeRecencyLabel(ago(1), "work_update", NOW), "今週更新");
  assert.equal(resumeRecencyLabel(ago(7), "work_update", NOW), "少し前に更新");
  assert.equal(resumeRecencyLabel(ago(30), "work_update", NOW), "最終更新から久しぶり");
});

test("invalid dateは表示せず、未来時刻は時計ずれとして今日扱いに丸める", () => {
  assert.equal(resumeRecencyLabel("not-a-date", "note", NOW), "");
  assert.equal(resumeRecencyLabel("", "progress", NOW), "");
  assert.equal(resumeRecencyLabel(new Date(NOW + DAY).toISOString(), "progress", NOW), "今日触った");
  assert.equal(resumeRecencyLabel(new Date(NOW + DAY).toISOString(), "work_update", NOW), "今日更新");
});

test("Homeはwork update由来の補足を作品情報の更新として説明する", async () => {
  const home = await read("public/views/home.js");
  assert.match(home, /function resumeRecencyTitle/);
  assert.match(home, /作品情報の更新/);
  assert.match(home, /前回メモ/);
  assert.match(home, /体験更新/);
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
