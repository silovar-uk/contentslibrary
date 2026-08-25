import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const moduleSource = readFileSync(new URL("../public/views/bulk-add.js", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../public/styles/bulk-add.css", import.meta.url), "utf8");

test("bulk add accepts one title per line and limits a batch to ten", () => {
  assert.match(moduleSource, /const MAX_TITLES = 10/);
  assert.match(moduleSource, /split\(\/\\r\?\\n\//);
  assert.match(moduleSource, /一度に追加できるのは\$\{MAX_TITLES\}件まで/);
  assert.match(moduleSource, /1行に1タイトル/);
});

test("bulk add prevents accidental duplicate titles by default", () => {
  assert.match(moduleSource, /buildExistingWorkKeys/);
  assert.match(moduleSource, /workIdentityKey\(type, title\)/);
  assert.match(moduleSource, /createImportDraftWork/);
  assert.match(moduleSource, /allow_duplicates/);
  assert.match(moduleSource, /登録済みのため除外/);
  assert.match(moduleSource, /duplicateInInput/);
});

test("bulk add uses the existing work API sequentially and reports progress", () => {
  assert.match(moduleSource, /for \(const \[index, item\] of analysis\.candidates\.entries\(\)\)/);
  assert.match(moduleSource, /api\("\/api\/works"/);
  assert.match(moduleSource, /method: "POST"/);
  assert.match(moduleSource, /追加中 \$\{index \+ 1\} \/ \$\{analysis\.candidates\.length\}/);
  assert.match(moduleSource, /await loadSnapshot\(\)/);
});

test("partial failure leaves only failed titles for retry", () => {
  assert.match(moduleSource, /failures\.map\(\(item\) => item\.title\)\.join\("\\n"\)/);
  assert.match(moduleSource, /失敗したタイトルだけ残しています/);
});

test("bulk add is initialized from the single app entry", () => {
  assert.match(appSource, /import \{ initBulkAdd \} from "\.\/views\/bulk-add\.js"/);
  assert.match(appSource, /initBulkAdd\(\)/);
});

test("bulk add exposes progress without forced motion", () => {
  assert.match(cssSource, /#bulkAddProgress i/);
  assert.match(cssSource, /prefers-reduced-motion:reduce/);
  assert.match(cssSource, /bulk-add-top-trigger\{display:none\}/);
});
