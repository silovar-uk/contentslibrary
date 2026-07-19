import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('購入履歴は暗号化ペイロードだけで本番へ渡す', async () => {
  const script = await read('scripts/decrypt-library-import.mjs');
  const workflow = await read('.github/workflows/import-private-library.yml');
  assert.match(script, /privateDecrypt/);
  assert.match(script, /aes-256-gcm/);
  assert.match(script, /gunzipSync/);
  assert.match(script, /NOT EXISTS/);
  assert.match(workflow, /data\/library-import\.enc/);
  assert.match(workflow, /actions\/cache@v4/);
  assert.match(workflow, /d1 execute DB --remote/);
  assert.doesNotMatch(workflow, /kindle-library\.txt/);
});

test('mainへのマージで本番デプロイと一時公開鍵作成が始まる', async () => {
  const deploy = await read('.github/workflows/deploy-production.yml');
  const prepare = await read('.github/workflows/prepare-library-import-key.yml');
  assert.match(deploy, /push:\n\s+branches: \[main\]/);
  assert.match(prepare, /openssl genpkey/);
  assert.match(prepare, /library-import-public\.pem/);
  assert.match(prepare, /contentslibrary-private-import-key-v1/);
});
