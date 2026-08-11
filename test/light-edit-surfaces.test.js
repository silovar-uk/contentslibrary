import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { lightSheetChoiceMarkup } from "../public/views/light-edit-surfaces.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Bottom Sheetの選択肢は現在値を明示する", () => {
  const html = lightSheetChoiceMarkup([
    { value: "a", label: "A", active: false },
    { value: "b", label: "B", active: true }
  ]);
  assert.match(html, /data-light-sheet-value="b"/);
  assert.match(html, /is-active/);
  assert.match(html, /✓/);
});

test("読む優先度はスマホで既存ボタンをBottom Sheetから代理クリックする", async () => {
  const source = await read("public/views/light-edit-surfaces.js");
  assert.match(source, /openPrioritySheet/);
  assert.match(source, /data-reading-priority-set/);
  assert.match(source, /source\?\.click\(\)/);
});

test("詳細に状態変更Surfaceを追加し既存works PATCHを使う", async () => {
  const source = await read("public/views/light-edit-surfaces.js");
  assert.match(source, /data-light-status-surface/);
  assert.match(source, /\/api\/works\/\$\{encodeURIComponent\(work\.id\)\}/);
  assert.match(source, /version: Number\(work\.version\), status: next/);
  assert.match(source, /setSelectedDetail\(data\)/);
});

test("並び替えはスマホ専用Bottom Sheetから既存selectへ反映する", async () => {
  const source = await read("public/views/light-edit-surfaces.js");
  assert.match(source, /mobileSortSheetButton/);
  assert.match(source, /select\.dispatchEvent\(new Event\("change", \{ bubbles: true \}\)\)/);
});

test("絞り込みパネルはスマホでBottom Sheet化する", async () => {
  const css = await read("public/styles/light-edit-surfaces.css");
  assert.match(css, /filter-panel\.light-filter-sheet/);
  assert.match(css, /transform:translateY\(105%\)/);
  assert.match(css, /filter-sheet-open/);
});

test("PCはPopover、スマホはBottom Sheetという境界を持つ", async () => {
  const css = await read("public/styles/light-edit-surfaces.css");
  assert.match(css, /\.light-edit-popover-menu/);
  assert.match(css, /\.light-edit-sheet-card/);
  assert.match(css, /@media\(max-width:767px\)/);
});

test("アプリ起動時に軽編集Surfaceを初期化する", async () => {
  const app = await read("public/app.js");
  assert.match(app, /initLightEditSurfaces/);
  assert.match(app, /initReadingPrioritySurfaces\(\);[\s\S]{0,80}initLightEditSurfaces\(\);/);
});
