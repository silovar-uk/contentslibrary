import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("選択書き出しは作品IDをPOSTのJSONで受け取る", async () => {
  const source = await read("src/routes/export-v12.ts");
  assert.match(source, /async function selectedWorkIds/);
  assert.match(source, /payload as \{ work_ids\?: unknown \}/);
  assert.match(source, /Array\.from\(new Set/);
  assert.match(source, /EMPTY_SELECTION/);
  assert.match(source, /TOO_MANY_WORKS/);
});

test("選択書き出しは作品・体験・メモを同じ作品IDへ絞る", async () => {
  const source = await read("src/routes/export-v12.ts");
  assert.match(source, /requestedIds\.flatMap/);
  assert.match(source, /const exportedIds = requestedIds \? new Set/);
  assert.match(source, /experiences\.results\.filter/);
  assert.match(source, /notes\.results\.filter/);
  assert.match(source, /sakuhin-log-selected-\$\{decorated\.length\}/);
});

test("一覧は通常クリックと選択モードを分けてJSONを書き出す", async () => {
  const source = await read("public/app-v102-selection-export.js");
  const app = await read("public/app.js");
  const pkg = await read("package.json");
  assert.match(source, /const selectedWorkIds = new Set\(\)/);
  assert.match(source, /選択してJSON/);
  assert.match(source, /event\.stopImmediatePropagation\(\)/);
  assert.match(source, /method: 'POST'/);
  assert.match(source, /body: JSON\.stringify\(\{ work_ids: Array\.from\(selectedWorkIds\) \}\)/);
  assert.match(source, /'X-App-Request': 'sakuhin-log'/);
  assert.match(app, /app-v102-selection-export\.js/);
  assert.match(pkg, /node --check public\/app-v102-selection-export\.js/);
});
