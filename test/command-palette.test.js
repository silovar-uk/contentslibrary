import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { commandPaletteWorkResults } from "../public/views/command-palette.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("作品検索はタイトル・作者・search_text・分類を横断する", () => {
  const works = [
    { id: "1", title: "夜と霧", creator: "フランクル", search_text: "心理学", labels: { genre: ["思想"], theme: [], tag: [] }, updated_at: "2026-08-02" },
    { id: "2", title: "別の本", creator: "著者", search_text: "組織論", labels: { genre: [], theme: ["意思決定"], tag: [] }, updated_at: "2026-08-03" }
  ];
  assert.equal(commandPaletteWorkResults(works, "フランクル")[0].id, "1");
  assert.equal(commandPaletteWorkResults(works, "意思決定")[0].id, "2");
});

test("タイトル前方一致を優先し最大7件に制限する", () => {
  const works = Array.from({ length: 10 }, (_, i) => ({ id: String(i), title: i === 9 ? "apple exact" : `x apple ${i}`, creator: "", updated_at: `2026-08-${String(i + 1).padStart(2, "0")}` }));
  const results = commandPaletteWorkResults(works, "apple");
  assert.equal(results.length, 7);
  assert.equal(results[0].id, "9");
});

test("Command Paletteは検索と主要操作を同じUIに持つ", async () => {
  const source = await read("public/views/command-palette.js");
  for (const label of ["作品を追加", "所持・未読を見る", "読みたいを見る", "最優先を見る", "お気に入りを見る", "メモがある作品を見る", "進行中を見る", "読む順番を整理"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /type: "search"/);
  assert.match(source, /type: "work"/);
});

test("Cmd/Ctrl+Kはcapture段階で既存検索フォーカスより先にPaletteを開く", async () => {
  const source = await read("public/views/command-palette.js");
  assert.match(source, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(source, /event\.stopImmediatePropagation\(\)/);
  assert.match(source, /openCommandPalette\(\)/);
  assert.match(source, /}, true\);/);
});

test("キーボードで上下移動・Enter実行・Escape終了ができる", async () => {
  const source = await read("public/views/command-palette.js");
  assert.match(source, /event\.key === "ArrowDown"/);
  assert.match(source, /event\.key === "ArrowUp"/);
  assert.match(source, /event\.key === "Enter"/);
  assert.match(source, /event\.key === "Escape"/);
});

test("コマンドは既存フィルターや優先度整理UIを再利用する", async () => {
  const source = await read("public/views/command-palette.js");
  assert.match(source, /clearFilters\(\)/);
  assert.match(source, /setFilters\(patch\)/);
  assert.match(source, /#filterReadingPriority/);
  assert.match(source, /data-reading-priority-organize/);
});

test("スマホでもviewport内に収まり入力は16pxを維持する", async () => {
  const css = await read("public/styles/command-palette.css");
  assert.match(css, /@media\(max-width:767px\)/);
  assert.match(css, /max-height:calc\(100dvh/);
  assert.match(css, /font-size:16px/);
});

test("アプリ起動時にMobile Searchの後でCommand Paletteを初期化する", async () => {
  const app = await read("public/app.js");
  assert.match(app, /initCommandPalette/);
  assert.match(app, /initMobileSearch\(\);\s*initCommandPalette\(\);/);
});
