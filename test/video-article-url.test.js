import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("作品種別に動画と記事を追加する", async () => {
  const format = await read("public/core/format.js");
  const types = await read("src/types.ts");
  assert.match(format, /video: "動画"/);
  assert.match(format, /article: "記事"/);
  assert.match(types, /"video" \| "article"/);
});

test("動画と記事には媒体別の作者・進捗・状態ラベルを持つ", async () => {
  const format = await read("public/core/format.js");
  assert.match(format, /video: \{ creator: "チャンネル・制作者"/);
  assert.match(format, /article: \{ creator: "著者・媒体"/);
  assert.match(format, /owned_unread: "保存・未視聴"/);
  assert.match(format, /owned_unread: "保存・未読"/);
});

test("DB migrationは動画・記事を許可し既存works列とsource_keyを保持する", async () => {
  const sql = await read("migrations/0017_expand_work_types.sql");
  assert.match(sql, /'video','article','other'/);
  assert.match(sql, /source_key TEXT/);
  assert.match(sql, /INSERT INTO works_v17/);
  assert.match(sql, /ALTER TABLE works_v17 RENAME TO works/);
  assert.match(sql, /idx_works_owner_source_key/);
});

test("作品APIと一覧APIの両方で動画・記事を有効な種別として扱う", async () => {
  const works = await read("src/routes/works.ts");
  const library = await read("src/routes/library-v13.ts");
  assert.match(works, /"drama", "video", "article", "other"/);
  assert.match(library, /"drama", "video", "article", "other"/);
});

test("通常入力フォームと作品種別フィルターへ動画・記事を追加する", async () => {
  const source = await read("public/views/work-media-url.js");
  assert.match(source, /\{ value: "video", label: "動画" \}/);
  assert.match(source, /\{ value: "article", label: "記事" \}/);
  assert.match(source, /#workForm select\[name='type'\]/);
  assert.match(source, /#filterType/);
});

test("まとめて追加でも動画と記事を選べる", async () => {
  const bulk = await read("public/views/bulk-add.js");
  assert.match(bulk, /\["video", "動画"\]/);
  assert.match(bulk, /\["article", "記事"\]/);
});

test("作品入力画面に任意URL欄を追加する", async () => {
  const source = await read("public/views/work-media-url.js");
  assert.match(source, /name="source_url" type="url"/);
  assert.match(source, /URL <span class="optional-mark">任意<\/span>/);
  assert.match(source, /動画ページや記事ページなど、作品そのもののURL/);
});

test("URLはmetadata.source_urlに保存し既存metadataを保持する", async () => {
  const dialogs = await read("public/views/dialogs.js");
  assert.match(dialogs, /state\.selected\?\.work\?\.metadata \|\| \{\}/);
  assert.match(dialogs, /metadata\.source_url = sourceUrl/);
  assert.match(dialogs, /delete metadata\.source_url/);
  assert.match(dialogs, /metadata,/);
  assert.match(dialogs, /w\.metadata\?\.source_url \|\| ""/);
});

test("URL入力はhttpとhttpsだけを受け付ける", async () => {
  const dialogs = await read("public/views/dialogs.js");
  const detail = await read("public/views/work-media-url.js");
  assert.match(dialogs, /\["http:", "https:"\]\.includes\(url\.protocol\)/);
  assert.match(dialogs, /URLはhttp:\/\/ または https:\/\//);
  assert.match(detail, /\["http:", "https:"\]\.includes\(url\.protocol\)/);
});

test("URLがある作品は詳細から元ページを開ける", async () => {
  const source = await read("public/views/work-media-url.js");
  assert.match(source, /動画を開く/);
  assert.match(source, /記事を開く/);
  assert.match(source, /元ページを開く/);
  assert.match(source, /target = "_blank"/);
  assert.match(source, /noopener noreferrer/);
});

test("URLフィールドをDialogs初期化より先にマウントする", async () => {
  const app = await read("public/app.js");
  assert.match(app, /initWorkMediaUrl/);
  assert.match(app, /initWorkMediaUrl\(\);\s*initDialogs\(\);/);
});
