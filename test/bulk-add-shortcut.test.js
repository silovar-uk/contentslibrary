import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

test("bulk add form participates in the existing Ctrl/Cmd+Enter submit shortcut", () => {
  assert.match(appSource, /\["workForm", "bulkAddForm", "quickEditForm"/);
  assert.match(appSource, /form\.requestSubmit\(\)/);
});
