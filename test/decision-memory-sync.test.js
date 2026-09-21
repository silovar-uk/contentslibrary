import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Decision MemoryはD1 migrationでowner単位・client_key重複防止を持つ", async () => {
  const sql = await read("migrations/0020_decision_memory.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS decision_events/);
  assert.match(sql, /owner_id TEXT NOT NULL/);
  assert.match(sql, /client_key TEXT NOT NULL/);
  assert.match(sql, /UNIQUE\(owner_id, client_key\)/);
  assert.match(sql, /slot TEXT NOT NULL CHECK \(slot IN \('priority','remember','wildcard'\)\)/);
  assert.match(sql, /idx_decision_events_owner_decided/);
});

test("Decision Memory APIはGETとsync POSTを認証済みAPIへ配線する", async () => {
  const index = await read("src/index.ts");
  assert.match(index, /listDecisions, syncDecisions/);
  assert.match(index, /GET" && path === "\/api\/decisions"/);
  assert.match(index, /POST" && path === "\/api\/decisions\/sync"/);
});

test("sync APIはowner作品だけを取り込み、client_keyで冪等保存する", async () => {
  const route = await read("src/routes/decisions.ts");
  assert.match(route, /WHERE owner_id = \? AND id IN/);
  assert.match(route, /INSERT OR IGNORE INTO decision_events/);
  assert.match(route, /auth\.member\.id/);
  assert.match(route, /LIMIT 30/);
  assert.match(route, /title_snapshot/);
  assert.match(route, /creator_snapshot/);
});

test("フロントは起動時とRecord表示時にDecision Memoryを同期する", async () => {
  const app = await read("public/app.js");
  const record = await read("public/views/record.js");
  const memory = await read("public/core/decision-memory.js");
  assert.match(app, /syncDecisionMemory\(\)\.catch/);
  assert.match(record, /syncDecisionMemory\(\)\.catch/);
  assert.match(memory, /\/api\/decisions\/sync/);
  assert.match(memory, /\/api\/decisions/);
});
