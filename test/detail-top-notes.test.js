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

test("メモ追加は詳細を開き直さず、現在のstateへ局所反映する", async () => {
  const source = await read("public/views/detail-top-notes.js");
  assert.match(source, /addEventListener\("submit"[\s\S]*true\)/);
  assert.match(source, /stopImmediatePropagation\(\)/);
  assert.match(source, /locallyAppendSavedNote/);
  assert.match(source, /setSelectedDetail/);
  assert.doesNotMatch(source, /openDetail\(/);
});

test("保存前後の閲覧位置と入力フォーカスを保持する", async () => {
  const source = await read("public/views/detail-top-notes.js");
  assert.match(source, /captureReadingContext/);
  assert.match(source, /restoreReadingContext/);
  assert.match(source, /getBoundingClientRect\(\)\.top/);
  assert.match(source, /focus\(\{ preventScroll: true \}\)/);
});

test("保存状態を入力欄の近くで伝え、新規メモを一時強調する", async () => {
  const source = await read("public/views/detail-top-notes.js");
  const css = await read("public/styles/detail-top-notes.css");
  assert.match(source, /inline-note-status/);
  assert.match(source, /保存中…/);
  assert.match(source, /保存しました/);
  assert.match(source, /is-just-saved/);
  assert.match(css, /\.inline-note-status\[data-state="saved"\]/);
  assert.match(css, /detail-note-saved/);
});

test("CtrlまたはCommand+Enterでクイックメモを保存できる", async () => {
  const source = await read("public/views/detail-top-notes.js");
  assert.match(source, /event\.metaKey/);
  assert.match(source, /event\.ctrlKey/);
  assert.match(source, /requestSubmit\(\)/);
});

test("アプリ起動時に詳細上部メモUIを初期化する", async () => {
  const app = await read("public/app.js");
  assert.match(app, /initDetailTopNotes/);
  assert.match(app, /initDetailTopNotes\(\);/);
});