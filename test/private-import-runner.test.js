import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('一時Workerは強いトークンとownerだけで取込センターを操作する', async () => {
  const runner = await read('src/import-runner.ts');
  assert.match(runner, /authorization/);
  assert.match(runner, /Bearer \$\{token\}/);
  assert.match(runner, /role = 'owner'/);
  assert.match(runner, /status = 'active'/);
  assert.match(runner, /verifyBatch/);
  assert.match(runner, /PRAGMA foreign_key_check/);
});

test('暗号断片は個別・全体SHA-256とバイト数を検証してから復元する', async () => {
  const reassembler = await read('scripts/reassemble-private-import.mjs');
  assert.match(reassembler, /Chunk verification failed/);
  assert.match(reassembler, /package_sha256/);
  assert.match(reassembler, /package_bytes/);
  assert.match(reassembler, /Buffer\.concat/);
  assert.match(reassembler, /Reassembled encrypted package verification failed/);
});

test('暗号化パッケージはRSA・AES-GCM・SHA-256を全て検証する', async () => {
  const decoder = await read('scripts/decrypt-private-import.mjs');
  assert.match(decoder, /privateDecrypt/);
  assert.match(decoder, /aes-256-gcm/);
  assert.match(decoder, /gunzipSync/);
  assert.match(decoder, /payload_sha256/);
  assert.match(decoder, /expected_works/);
  assert.match(decoder, /expected_notes/);
});

test('取込は分割・検証・反映・事後検算を行い失敗時に取り消す', async () => {
  const importer = await read('scripts/run-private-import.mjs');
  assert.match(importer, /offset \+= 25/);
  assert.match(importer, /\/validate/);
  assert.match(importer, /\/commit/);
  assert.match(importer, /\/verify/);
  assert.match(importer, /rollback\(batchId\)/);
  assert.match(importer, /conflict_count/);
});

test('GitHub Actionsは平文を置かず一時Worker・断片・鍵を必ず片付ける', async () => {
  const prepare = await read('.github/workflows/prepare-private-import-key.yml');
  const run = await read('.github/workflows/run-private-import.yml');
  assert.match(prepare, /openssl genpkey/);
  assert.match(prepare, /private-import-public\.pem/);
  assert.match(run, /data\/private-import-manifest\.json/);
  assert.match(run, /reassemble-private-import\.mjs/);
  assert.match(run, /contentslibrary-private-import-rsa-v3/);
  assert.match(run, /private-import-token/);
  assert.match(run, /wrangler delete/);
  assert.match(run, /if: always\(\)/);
  assert.match(run, /git rm -rf --ignore-unmatch data\/private-import-chunks/);
  assert.match(run, /git rm -f --ignore-unmatch data\/private-import-manifest\.json data\/private-import-public\.pem/);
  assert.doesNotMatch(run, /作品体験ログ_本番取込\.json/);
});
