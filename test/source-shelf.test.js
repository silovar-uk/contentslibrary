import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { sourceShelfData } from "../public/core/source-shelf.js";

const works = [
  { id: "1", title: "甲 (新潮文庫 あ-1)", creator: "著者A" },
  { id: "2", title: "乙 (新潮文庫 い-2)", creator: "著者A" },
  { id: "3", title: "丙（講談社現代新書）", creator: "著者B" },
  { id: "4", title: "丁（講談社現代新書）", creator: "著者C" },
  { id: "5", title: "戊", creator: "著者C" }
];

test("レーベル棚は2作品以上だけを件数順・名称順で返す", () => {
  const data = sourceShelfData(works, "label");
  assert.deepEqual(data.map(({ name, count }) => ({ name, count })), [
    { name: "講談社現代新書", count: 2 },
    { name: "新潮文庫", count: 2 }
  ]);
  assert.equal(data[0].works.length, 2);
});

test("著者棚も2作品以上だけを返す", () => {
  const data = sourceShelfData(works, "creator");
  assert.deepEqual(data.map(({ name, count }) => ({ name, count })), [
    { name: "著者A", count: 2 },
    { name: "著者C", count: 2 }
  ]);
});

test("棚UIはEXPLORE先頭・レーベル初期値・Library検索遷移を持つ", () => {
  const source = fs.readFileSync("public/views/source-shelves.js", "utf8");
  assert.match(source, /let mode = "label"/);
  assert.match(source, /body\.prepend\(host\)/);
  assert.match(source, /setFilters\(\{ q: value \}\)/);
  assert.match(source, /setView\("library"\)/);
  assert.doesNotMatch(source, /MutationObserver/);
});
