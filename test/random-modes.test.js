import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeRandomMode, randomPriorityWeight, sampleRandomWorks } from "../public/core/random-pick.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("抽選モードはランダムと優先度の2種類", () => {
  assert.equal(normalizeRandomMode("random"), "random");
  assert.equal(normalizeRandomMode("priority"), "priority");
  assert.equal(normalizeRandomMode("unknown"), "random");
});

test("優先度モードは未読の読む優先度だけを5-1の重みにする", () => {
  assert.equal(randomPriorityWeight({ type: "book", status: "owned_unread", metadata: { reading_priority: "top" } }), 5);
  assert.equal(randomPriorityWeight({ type: "book", status: "want", metadata: { reading_priority: "high" } }), 4);
  assert.equal(randomPriorityWeight({ type: "manga", status: "want", metadata: { reading_priority: "medium" } }), 3);
  assert.equal(randomPriorityWeight({ type: "book", status: "owned_unread", metadata: { reading_priority: "low" } }), 2);
  assert.equal(randomPriorityWeight({ type: "book", status: "want", metadata: {} }), 1);
  assert.equal(randomPriorityWeight({ type: "book", status: "active", metadata: { reading_priority: "top" } }), 1);
  assert.equal(randomPriorityWeight({ type: "movie", status: "want", metadata: { reading_priority: "top" } }), 1);
});

test("純粋ランダムと優先度モードは同じ候補を別の確率規則で選べる", () => {
  const rows = [
    { id: "unset", type: "book", status: "want", metadata: {} },
    { id: "top", type: "book", status: "want", metadata: { reading_priority: "top" } }
  ];
  const fixedRandom = () => 0.9;
  assert.equal(sampleRandomWorks(rows, 1, "random", fixedRandom)[0].id, "unset");
  assert.equal(sampleRandomWorks(rows, 1, "priority", fixedRandom)[0].id, "top");
});

test("モードUIは2択で、最後の選択を保存し切替時に再抽選する", async () => {
  const mode = await read("public/views/random-mode.js");
  const home = await read("public/views/home.js");
  const css = await read("public/styles/random-mode.css");
  assert.match(mode, /data-random-mode="random"/);
  assert.match(mode, /data-random-mode="priority"/);
  assert.match(mode, /localStorage\.setItem/);
  assert.match(mode, /random-mode-change/);
  assert.match(home, /getRandomMode\(\)/);
  assert.match(home, /random-mode-change/);
  assert.match(css, /random-mode-toggle/);
});

test("0件の抽選棚は表示を残したままdisabledにし、有効な棚へ退避する", async () => {
  const source = await read("public/views/random-scope-options.js");
  assert.match(source, /option\.disabled = state\.loaded && count === 0/);
  assert.match(source, /available\.find\(\(scope\) => scope\.value === "next"\)/);
  assert.match(source, /select\.dispatchEvent\(new Event\("change"/);
  assert.match(source, /draw\.disabled = state\.loaded && available\.length === 0/);
});
