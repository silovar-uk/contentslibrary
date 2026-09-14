import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolveCoverInput } from "../public/core/cover.js";
import { coverHuntQueue } from "../public/views/cover-hunt.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("resolveCoverInputは画像URLとAmazon商品ページを同じ規則で解決する", () => {
  assert.deepEqual(
    resolveCoverInput("https://m.media-amazon.com/images/P/4062748223.09.MZZZZZZZ.jpg"),
    { url: "https://m.media-amazon.com/images/P/4062748223.09.MZZZZZZZ.jpg" }
  );
  assert.deepEqual(
    resolveCoverInput("https://www.amazon.co.jp/dp/4062748223"),
    { url: "https://m.media-amazon.com/images/P/4062748223.09.LZZZZZZZ.jpg" }
  );
  assert.match(resolveCoverInput("https://www.amazon.co.jp/dp/B08P5KMDVX").error, /自動で取得できません/);
  assert.match(resolveCoverInput("https://example.com/book").error, /Amazonの商品ページURL/);
  assert.equal(resolveCoverInput("   ").error, "URLを入力してください。");
});

test("coverHuntQueueは本・漫画の表紙なしだけをD5順、同状態は更新が新しい順で返す", () => {
  const items = [
    { id: "owned", type: "book", status: "owned_unread", updated_at: "2026-09-10T00:00:00Z", metadata: {} },
    { id: "active-old", type: "book", status: "active", updated_at: "2026-09-11T00:00:00Z", metadata: {} },
    { id: "active-new", type: "manga", status: "active", updated_at: "2026-09-12T00:00:00Z", metadata: {} },
    { id: "want", type: "book", status: "want", updated_at: "2026-09-13T00:00:00Z", metadata: {} },
    { id: "movie", type: "movie", status: "active", updated_at: "2026-09-14T00:00:00Z", metadata: {} },
    { id: "covered", type: "book", status: "active", updated_at: "2026-09-14T00:00:00Z", metadata: { cover_url: "https://m.media-amazon.com/images/P/4062748223.09.LZZZZZZZ.jpg" } }
  ];
  assert.deepEqual(coverHuntQueue(items).map((item) => item.id), ["active-new", "active-old", "want", "owned"]);
});

test("表紙更新APIはupdated_atを変更せず、書影だけでCONTINUEの最近更新扱いにしない", async () => {
  const route = await read("src/routes/work-cover.ts");
  assert.match(route, /UPDATE works SET metadata_json = \?, version = version \+ 1 WHERE/);
  assert.doesNotMatch(route, /UPDATE works SET metadata_json = \?, version = version \+ 1, updated_at = \?/);
  assert.match(route, /WORK_COVER_UPDATED/);
});

test("表紙あつめは一覧・詳細・コマンドパレットから開け、TOPには追加しない", async () => {
  const hunt = await read("public/views/cover-hunt.js");
  const palette = await read("public/views/command-palette.js");
  const home = await read("public/views/home.js");
  assert.match(hunt, /dataset\.action = "open-cover-hunt"/);
  assert.match(hunt, /dataset\.coverHuntStart/);
  assert.match(palette, /id: "cover-hunt"/);
  assert.match(palette, /openCoverHunt\(\)/);
  assert.doesNotMatch(home, /open-cover-hunt|表紙を集める/);
});

test("表紙あつめは貼り付け・Enter、0.9秒送り、409再読み込み導線を持つ", async () => {
  const hunt = await read("public/views/cover-hunt.js");
  assert.match(hunt, /addEventListener\("paste"/);
  assert.match(hunt, /data-cover-hunt-form/);
  assert.match(hunt, /setTimeout\(advance, reduced \? 180 : 900\)/);
  assert.match(hunt, /error\.status === 409/);
  assert.match(hunt, /最新状態を読み直しました/);
});
