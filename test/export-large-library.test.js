import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("大量作品の書き出しはIDの巨大なIN句を使わない", async () => {
  const source = await read("src/routes/export-v12.ts");
  assert.match(source, /JOIN works w ON w\.id = e\.work_id/);
  assert.match(source, /JOIN works w ON w\.id = n\.work_id/);
  assert.match(source, /JOIN works w ON w\.id = wl\.work_id/);
  assert.doesNotMatch(source, /work_id IN \(/);
  assert.doesNotMatch(source, /bind\(\.\.\.ids\)/);
});

test("export APIは選択書き出し対応版へ接続される", async () => {
  const index = await read("src/index.ts");
  assert.match(index, /import \{ exportDataV12 \} from "\.\/routes\/export-v12"/);
  assert.match(index, /\["GET", "POST"\]\.includes\(request\.method\)/);
  assert.match(index, /return exportDataV12\(request, env, auth\)/);
});

test("JSON書き出しにもダウンロード用ファイル名を付ける", async () => {
  const source = await read("src/routes/export-v12.ts");
  assert.match(source, /sakuhin-log-\$\{filenameDate\}/);
  assert.match(source, /Content-Disposition/);
});
