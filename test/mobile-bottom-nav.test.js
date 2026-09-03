import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("モバイルナビは5項目を維持する", async () => {
  const html = await read("public/index.html");
  const nav = html.match(/<nav class="mobile-nav"[\s\S]*?<\/nav>/)?.[0] || "";
  assert.equal((nav.match(/<button/g) || []).length, 5);
});

test("モバイルナビ高さは操作領域とsafe areaを分離する", async () => {
  const tokens = await read("public/styles/tokens.css");
  assert.match(tokens, /--mobile-nav-content:\s*64px/);
  assert.match(tokens, /--mobile-nav:\s*calc\(var\(--mobile-nav-content\) \+ env\(safe-area-inset-bottom\)\)/);
});

test("モバイルナビは44px以上のタップ領域と大きなアイコンを持つ", async () => {
  const css = await read("public/styles/ui-polish.css");
  assert.match(css, /\.mobile-nav button\{[\s\S]*min-height:44px/);
  assert.match(css, /\.mobile-nav button>span\{[\s\S]*font-size:24px/);
  assert.match(css, /\.mobile-nav \.mobile-add span\{[\s\S]*width:48px;[\s\S]*height:48px/);
});

test("モバイルナビの拡大はスマホ幅だけに限定する", async () => {
  const css = await read("public/styles/ui-polish.css");
  assert.match(css, /Mobile bottom navigation:[\s\S]*@media\(max-width:767px\)\{[\s\S]*\.mobile-nav\{/);
});
