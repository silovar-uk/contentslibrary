import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bookcaseShelfGroups, spineWidth } from "../public/views/library-bookcase.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("書架は読書中→読みたい→積読→一時停止→中断→完了の順で、空棚を出さない", () => {
  const works = [
    { id: "done", status: "completed" },
    { id: "want", status: "want" },
    { id: "active", status: "active" },
    { id: "owned", status: "owned_unread" },
    { id: "dropped", status: "dropped" }
  ];
  const shelves = bookcaseShelfGroups(works);
  assert.deepEqual(shelves.map((shelf) => shelf.status), ["active", "want", "owned_unread", "dropped", "completed"]);
  assert.deepEqual(shelves.map((shelf) => shelf.works.length), [1, 1, 1, 1, 1]);
});

test("背表紙幅は題の長さに応じて22〜34pxに収まる", () => {
  assert.equal(spineWidth({ title: "" }), 22);
  assert.ok(spineWidth({ title: "短い題" }) >= 22);
  assert.ok(spineWidth({ title: "短い題" }) <= 34);
  assert.equal(spineWidth({ title: "これは十分に長いタイトルなので背表紙幅の上限へ到達する作品名" }), 34);
});

test("書架モードはlocalStorageへ保存し、選択モードを無効化する", async () => {
  const source = await read("public/views/library-bookcase.js");
  assert.match(source, /sakuhin-log-library-view-v1/);
  assert.match(source, /try \{[\s\S]*localStorage\.getItem\(STORAGE_KEY\)/);
  assert.match(source, /try \{[\s\S]*localStorage\.setItem\(STORAGE_KEY, next\)/);
  assert.match(source, /selection\.disabled = mode === "bookcase"/);
  assert.match(source, /aria-pressed/);
});

test("背表紙は既存data-open-workへ接続し、tone・縦題・レーベル帯を持つ", async () => {
  const source = await read("public/views/library-bookcase.js");
  const css = await read("public/styles/bookcase.css");
  assert.match(source, /class="spine/);
  assert.match(source, /data-open-work/);
  assert.match(source, /data-tone/);
  assert.match(source, /spine-band/);
  assert.match(css, /writing-mode:vertical-rl/);
  assert.match(css, /spine--book\{height:150px\}/);
  assert.match(css, /spine--manga\{height:132px\}/);
  assert.match(css, /spine--media\{height:118px\}/);
  assert.match(css, /@media\(max-width:767px\)/);
  assert.match(css, /spine--book\{height:120px\}/);
});

test("この棚から1冊引くは0.6秒だけ飛び出し、reduced-motionでは即時に開く", async () => {
  const source = await read("public/views/library-bookcase.js");
  const css = await read("public/styles/bookcase.css");
  assert.match(source, /Math\.random\(\)/);
  assert.match(source, /setTimeout\(\(\) => \{ if \(spine\.isConnected\) spine\.click\(\); \}, 600\)/);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(css, /bookcase-pick \.6s/);
});

test("書架はcontent-visibilityを使い、150ms超では棚ごと200冊へ自動退避する", async () => {
  const source = await read("public/views/library-bookcase.js");
  const css = await read("public/styles/bookcase.css");
  assert.match(source, /CHUNK_SIZE = 200/);
  assert.match(source, /CHUNK_THRESHOLD_MS = 150/);
  assert.match(source, /performance\.now\(\)/);
  assert.match(source, /elapsed > CHUNK_THRESHOLD_MS/);
  assert.match(source, /続きを並べる/);
  assert.match(css, /content-visibility:auto/);
});

test("書架モードはアプリ起動でLibraryの後に初期化される", async () => {
  const app = await read("public/app.js");
  assert.match(app, /import \{ initLibraryBookcase \} from "\.\/views\/library-bookcase\.js"/);
  assert.match(app, /initLibrary\(\);\n    initLibraryBookcase\(\);/);
});
