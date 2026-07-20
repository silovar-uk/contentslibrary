import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const [manifestPath = 'data/private-import-manifest.json', outputPath = 'data/private-import.enc'] = process.argv.slice(2);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (manifest.version !== 1 || !Array.isArray(manifest.chunks) || manifest.chunks.length === 0) {
  throw new Error('Private import manifest is invalid.');
}
if (!/^[a-f0-9]{64}$/.test(String(manifest.package_sha256 ?? ''))) {
  throw new Error('Package SHA-256 is invalid.');
}
if (!Number.isInteger(manifest.package_bytes) || manifest.package_bytes <= 0) {
  throw new Error('Package byte length is invalid.');
}
if (manifest.chunk_count !== manifest.chunks.length) {
  throw new Error('Chunk count does not match manifest.');
}

const baseDir = dirname(manifestPath);
const buffers = [];
const seen = new Set();
for (let expectedIndex = 0; expectedIndex < manifest.chunks.length; expectedIndex += 1) {
  const entry = manifest.chunks[expectedIndex];
  if (!entry || entry.index !== expectedIndex || typeof entry.file !== 'string') {
    throw new Error(`Chunk order is invalid at index ${expectedIndex}.`);
  }
  if (seen.has(entry.file) || !/^private-import-chunks\/chunk-\d{3}\.json$/.test(entry.file)) {
    throw new Error(`Chunk file is invalid: ${entry.file}`);
  }
  seen.add(entry.file);
  const chunkPath = join(baseDir, entry.file.replace(/^data\//, ''));
  const chunk = JSON.parse(await readFile(chunkPath, 'utf8'));
  if (chunk.version !== 1 || chunk.index !== expectedIndex || typeof chunk.data !== 'string') {
    throw new Error(`Chunk payload is invalid at index ${expectedIndex}.`);
  }
  const decoded = Buffer.from(chunk.data, 'base64');
  const hash = createHash('sha256').update(decoded).digest('hex');
  if (decoded.length !== entry.bytes || hash !== entry.sha256) {
    throw new Error(`Chunk verification failed at index ${expectedIndex}.`);
  }
  buffers.push(decoded);
}
const output = Buffer.concat(buffers);
const outputHash = createHash('sha256').update(output).digest('hex');
if (output.length !== manifest.package_bytes || outputHash !== manifest.package_sha256) {
  throw new Error('Reassembled encrypted package verification failed.');
}
await writeFile(outputPath, output, { mode: 0o600 });
console.log(JSON.stringify({ chunks: buffers.length, bytes: output.length, sha256: outputHash }));
