import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const viewsDir = path.join(publicDir, "views");
const ignored = new Set(["initReadingDesire", "initWalletStacks"]);

function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return jsFiles(full);
    return entry.isFile() && entry.name.endsWith(".js") ? [full] : [];
  });
}

test("exportされたinit関数はpublic内のどこかから呼ばれる", () => {
  const viewSources = jsFiles(viewsDir).map((file) => ({ file, source: fs.readFileSync(file, "utf8") }));
  const publicSource = jsFiles(publicDir).map((file) => fs.readFileSync(file, "utf8")).join("\n");
  const definitions = [];
  for (const { file, source } of viewSources) {
    for (const match of source.matchAll(/export\s+(?:async\s+)?function\s+(init[A-Z][A-Za-z0-9_]*)\s*\(/g)) {
      definitions.push({ name: match[1], file });
    }
  }

  assert.ok(definitions.length > 0, "init関数が1件以上見つかること");
  for (const { name, file } of definitions) {
    if (ignored.has(name)) continue;
    const count = publicSource.match(new RegExp(`\\b${name}\\b`, "g"))?.length || 0;
    assert.ok(count >= 2, `${path.relative(root, file)} の ${name} が定義だけで終わっていないこと`);
  }
});

test("admin初期化はapp起動時に呼ばれる", () => {
  const source = fs.readFileSync(path.join(publicDir, "app.js"), "utf8");
  assert.match(source, /import\s*\{[^}]*initAdmin[^}]*\}\s*from\s*["']\.\/views\/admin\.js["']/s);
  assert.match(source, /renderAccount\(\);\s*initAdmin\(\);/s);
});
