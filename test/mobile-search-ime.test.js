import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const searchSource = readFileSync(new URL("../public/views/mobile-search.js", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../public/styles/mobile-search.css", import.meta.url), "utf8");

test("日本語IMEの変換中は検索を実行せず、確定時に一度反映する", () => {
  assert.match(searchSource, /compositionstart/);
  assert.match(searchSource, /compositionend/);
  assert.match(searchSource, /event\.isComposing/);
  assert.match(searchSource, /event\.inputType === "insertCompositionText"/);
  assert.match(searchSource, /event\.keyCode === 229/);
  assert.match(searchSource, /scheduleSearch\(input\.value, true\)/);
});

test("既存の打鍵ごとの検索処理をcapture段階で遮断する", () => {
  assert.match(searchSource, /document\.addEventListener\("input"[\s\S]*?, true\)/);
  assert.match(searchSource, /event\.stopImmediatePropagation\(\)/);
  assert.match(searchSource, /const SEARCH_DELAY_MS = 140/);
});

test("検索状態の更新で一覧本文へフォーカスを移さない", () => {
  assert.match(appSource, /initMobileSearch/);
  assert.doesNotMatch(appSource, /view === "library"\) \$\("#main"\)\.focus/);
  assert.match(searchSource, /const viewChanged = state\.view !== "library"/);
  assert.match(searchSource, /if \(viewChanged\) setView\("library"\)/);
});

test("検索クリア後も入力を続けられる", () => {
  assert.match(searchSource, /globalSearchClear/);
  assert.match(searchSource, /input\.value = ""/);
  assert.match(searchSource, /input\.focus\(\{ preventScroll: true \}\)/);
  assert.match(searchSource, /enterKeyHint = "search"/);
});

test("モバイル検索欄はタップしやすく、iOSの自動ズームを避ける", () => {
  assert.match(cssSource, /width:40px;height:40px/);
  assert.match(cssSource, /font-size:16px/);
  assert.match(cssSource, /search-cancel-button/);
});
