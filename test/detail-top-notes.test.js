import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { recentDetailNotes } from "../public/views/detail-top-notes.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("詳細上部には更新が新しいメモを3件だけ出す", () => {
  const notes = [
    { id: "a", updated_at: "2026-08-01T10:00:00Z" },
    { id: "b", updated_at: "2026-08-04T10:00:00Z" },
    { id: "c", updated_at: "2026-08-03T10:00:00Z" },
    { id: "d", updated_at: "2026-08-02T10:00:00Z" }
  ];
  assert.deepEqual(recentDetailNotes(notes).map((note) => note.id), ["b", "c", "d"]);
});

test("上部の最近メモはクリック編集と下部一覧への導線を持つ", async () => {
  const source = await read("public/views/detail-top-notes.js");
  assert.match(source, /data-edit-note/);
  assert.match(source, /data-top-notes-scroll/);
  assert.match(source, /note-item-list/);
  assert.match(source, /最近のメモ/);
});

test("既存のinlineNoteFormを評価・お気に入り直下へ移し1行入力として再利用する", async () => {
  const source = await read("public/views/detail-top-notes.js");
  assert.match(source, /\.preference-panel/);
  assert.match(source, /\.inline-note-section/);
  assert.match(source, /textarea\.rows = 1/);
  assert.match(source, /recentSection\.after\(inline\)/);
  assert.match(source, /メモを書き足す/);
});

test("上部クイック入力では詳細オプションを隠し、下部メモ一覧は残す", async () => {
  const css = await read("public/styles/detail-top-notes.css");
  const detail = await read("public/views/detail.js");
  assert.match(css, /\.note-type-chips,.detail-top-note-quick \.inline-position\{display:none!important\}/);
  assert.match(detail, /notesMarkup\(d\.notes \|\| \[\]\)/);
});

test("アプリ起動時に詳細上部メモUIを初期化する", async () => {
  const app = await read("public/app.js");
  assert.match(app, /initDetailTopNotes/);
  assert.match(app, /initDetailTopNotes\(\);/);
});
