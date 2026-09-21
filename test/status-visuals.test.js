import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("状態は6種類の共通ビジュアル定義を持つ", async () => {
  const source = await read("public/views/status-visuals.js");
  const css = await read("public/styles/status-visuals.css");
  for (const status of ["want", "owned_unread", "active", "completed", "paused", "dropped"]) {
    assert.match(source, new RegExp(`${status}: \\{ symbol:`));
    assert.match(css, new RegExp(`data-status="${status}"`));
  }
  assert.match(source, /statusChipMarkup/);
  assert.match(source, /通常の流れ/);
  assert.match(source, /止める/);
});

test("状態selectは既存値をsource of truthとしてPickerへ同期する", async () => {
  const source = await read("public/views/status-visuals.js");
  assert.match(source, /select\.value = value/);
  assert.match(source, /dispatchEvent\(new Event\("change", \{ bubbles: true \}\)\)/);
  assert.match(source, /refreshStatusPicker/);
  assert.match(source, /status-native-select/);
});

test("追加フォームは媒体変更後にStatus Pickerを再同期する", async () => {
  const source = await read("public/views/dialogs.js");
  assert.match(source, /refreshStatusPicker\(form\.status\)/);
  assert.match(source, /config\.statuses\[option\.value\]/);
});

test("一覧・HOME・詳細は共通status chipを使う", async () => {
  const library = await read("public/views/library.js");
  const home = await read("public/views/home.js");
  const detail = await read("public/views/detail.js");
  assert.match(library, /statusChipMarkup\(work\.type, work\.status\)/);
  assert.match(home, /statusChipMarkup\(work\.type, work\.status\)/);
  assert.match(detail, /statusChipMarkup\(w\.type, w\.status\)/);
});

test("詳細の状態変更はlight editへ一本化しQuick Editから重複selectを外す", async () => {
  const detail = await read("public/views/detail.js");
  const light = await read("public/views/light-edit-surfaces.js");
  assert.doesNotMatch(detail, /quick-edit-grid[\s\S]{0,180}name="status"/);
  assert.match(light, /data-light-status-surface/);
  assert.match(light, /status: next/);
});

test("スマホCHOOSEは棚→候補→引き直すのDOM順に再構成する", async () => {
  const source = await read("public/views/home-composition.js");
  const css = await read("public/styles/home-decision-surface.css");
  const scopeAt = source.indexOf("body.append(scopeControl)");
  const stageAt = source.indexOf("moveIntoBody(zone, stage)");
  const rerollAt = source.indexOf("body.append(rerollActions)");
  assert.ok(scopeAt >= 0 && stageAt > scopeAt && rerollAt > stageAt);
  assert.match(source, /↻ 候補を引き直す/);
  assert.match(css, /random-reroll-actions \.draw-button\{width:100%/);
  assert.doesNotMatch(css, /home-zone-choose \.random-controls\{gap:8px;align-items:flex-end;flex-wrap:nowrap;overflow-x:auto/);
});

test("引き直しは操作中フィードバックとreduced-motion対応を持つ", async () => {
  const home = await read("public/views/home.js");
  const css = await read("public/styles/home-decision-surface.css");
  assert.match(home, /↻ 引き直しています…/);
  assert.match(home, /is-rerolling/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});
