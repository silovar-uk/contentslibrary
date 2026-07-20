import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const [payloadPath = '.private-import.json', baseUrl, token, resultPath = 'import-result.json'] = process.argv.slice(2);
if (!baseUrl || !token) throw new Error('baseUrl and token are required.');
const payloadBytes = await readFile(payloadPath);
const payload = JSON.parse(payloadBytes.toString('utf8'));
if (payload.version !== 1 || !Array.isArray(payload.items)) throw new Error('Import payload is invalid.');
const contentHash = createHash('sha256').update(payloadBytes).digest('hex');
const expectedWorks = payload.items.length;
const expectedNotes = payload.items.reduce((sum, item) => sum + (Array.isArray(item.notes) ? item.notes.length : 0), 0);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(path, options = {}, attempts = 6) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          ...(options.headers ?? {})
        }
      });
      const text = await response.text();
      let body;
      try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status} ${path}: ${JSON.stringify(body)}`);
        error.status = response.status;
        error.body = body;
        if (response.status < 500 && response.status !== 429) throw error;
        lastError = error;
      } else {
        return body;
      }
    } catch (error) {
      lastError = error;
      if (error?.status && error.status < 500 && error.status !== 429) throw error;
    }
    await sleep(Math.min(1000 * 2 ** (attempt - 1), 10000));
  }
  throw lastError ?? new Error(`Request failed: ${path}`);
}

async function rollback(batchId) {
  for (let index = 0; index < 100; index += 1) {
    const result = await call(`/batches/${encodeURIComponent(batchId)}/rollback`, { method: 'POST', body: '{}' }, 3);
    if (result.done) return result;
  }
  throw new Error('Rollback did not finish within the safety limit.');
}

let batchId = null;
let commitStarted = false;
try {
  await call('/health', { method: 'GET' });
  await call('/enable', { method: 'POST', body: JSON.stringify({ confirmation: 'ENABLE_IMPORT' }) });
  const created = await call('/batches', {
    method: 'POST',
    body: JSON.stringify({
      name: payload.batch ?? 'Kindle・Notion統合取込',
      source_filename: 'private-import.json',
      content_hash: contentHash,
      expected_works: expectedWorks,
      expected_notes: expectedNotes
    })
  });
  batchId = created.batch.id;
  let detail = await call(`/batches/${encodeURIComponent(batchId)}`, { method: 'GET' });

  if (!['validated', 'committing', 'committed'].includes(detail.batch.status)) {
    for (let offset = 0; offset < payload.items.length; offset += 25) {
      const items = payload.items.slice(offset, offset + 25).map((item, index) => ({ ...item, ordinal: offset + index }));
      await call(`/batches/${encodeURIComponent(batchId)}/items`, {
        method: 'POST',
        body: JSON.stringify({ items })
      });
    }
    detail = await call(`/batches/${encodeURIComponent(batchId)}/validate`, { method: 'POST', body: '{}' });
  }

  const batch = detail.batch;
  const classified = Number(batch.insert_count) + Number(batch.merge_count) + Number(batch.skip_count);
  if (!['validated', 'committing', 'committed'].includes(batch.status)) {
    throw new Error(`Import validation did not pass: ${JSON.stringify(detail)}`);
  }
  if (Number(batch.conflict_count) !== 0 || classified !== expectedWorks) {
    throw new Error(`Import classification mismatch: ${JSON.stringify(detail)}`);
  }

  if (batch.status !== 'committed') {
    commitStarted = true;
    for (let index = 0; index < 100; index += 1) {
      const result = await call(`/batches/${encodeURIComponent(batchId)}/commit`, { method: 'POST', body: '{}' });
      if (result.done) break;
      if (index === 99) throw new Error('Commit did not finish within the safety limit.');
    }
  }

  const verification = await call(`/batches/${encodeURIComponent(batchId)}/verify`, { method: 'GET' });
  if (!verification.ok) throw new Error(`Post-import verification failed: ${JSON.stringify(verification)}`);
  const finalDetail = await call(`/batches/${encodeURIComponent(batchId)}`, { method: 'GET' });
  const result = {
    ok: true,
    batch_id: batchId,
    payload_sha256: contentHash,
    expected_works: expectedWorks,
    expected_notes: expectedNotes,
    batch: finalDetail.batch,
    verification
  };
  await writeFile(resultPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ok: true, batch_id: batchId, works: expectedWorks, notes: expectedNotes }));
} catch (error) {
  let rollbackResult = null;
  if (batchId && commitStarted) {
    try { rollbackResult = await rollback(batchId); } catch (rollbackError) {
      rollbackResult = { ok: false, error: String(rollbackError?.stack ?? rollbackError) };
    }
  }
  const result = {
    ok: false,
    batch_id: batchId,
    commit_started: commitStarted,
    error: String(error?.stack ?? error),
    rollback: rollbackResult
  };
  await writeFile(resultPath, JSON.stringify(result, null, 2));
  throw error;
}
