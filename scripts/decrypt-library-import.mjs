import { createDecipheriv, createHash, privateDecrypt, constants } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { readFile, writeFile } from 'node:fs/promises';

const [encryptedPath = 'data/library-import.enc', privateKeyPath = '.private-import-key.pem', outputPath = '.library-import.sql'] = process.argv.slice(2);

const sql = (value) => value === null || value === undefined
  ? 'NULL'
  : `'${String(value).replaceAll("'", "''")}'`;

const stableId = (prefix, value) => `${prefix}-${createHash('sha256').update(value).digest('hex').slice(0, 24)}`;

function assertItem(item, index) {
  if (!item || typeof item !== 'object') throw new Error(`item ${index + 1} is invalid`);
  for (const key of ['source_key', 'title', 'type', 'created_at', 'updated_at']) {
    if (typeof item[key] !== 'string' || !item[key].trim()) throw new Error(`item ${index + 1}: ${key} is required`);
  }
  if (!['book', 'manga', 'movie', 'anime', 'drama', 'other'].includes(item.type)) throw new Error(`item ${index + 1}: type is invalid`);
  if (item.labels && typeof item.labels !== 'object') throw new Error(`item ${index + 1}: labels are invalid`);
}

function decryptPayload(packageData, privateKey) {
  if (packageData.version !== 1) throw new Error('Unsupported encrypted payload version');
  const key = privateDecrypt({
    key: privateKey,
    padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: 'sha256'
  }, Buffer.from(packageData.encrypted_key, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(packageData.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(packageData.tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(packageData.ciphertext, 'base64')),
    decipher.final()
  ]);
  return JSON.parse(gunzipSync(decrypted).toString('utf8'));
}

function buildSql(payload) {
  if (!payload || payload.version !== 1 || !Array.isArray(payload.items)) throw new Error('Import payload is invalid');
  payload.items.forEach(assertItem);

  const statements = [
    'PRAGMA foreign_keys = ON;',
    'DROP TABLE IF EXISTS _library_import_owner;',
    "CREATE TEMP TABLE _library_import_owner AS SELECT id FROM members WHERE role = 'owner' AND status = 'active' ORDER BY created_at LIMIT 1;"
  ];

  const labels = new Map();
  for (const item of payload.items) {
    for (const kind of ['genre', 'theme', 'tag']) {
      for (const name of item.labels?.[kind] ?? []) {
        const clean = String(name).trim();
        if (clean) labels.set(`${kind}\u0000${clean}`, { kind, name: clean });
      }
    }
  }

  for (const { kind, name } of labels.values()) {
    const normalized = String(name).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80);
    const id = stableId('seed-label', `${kind}:${normalized}`);
    statements.push(`INSERT OR IGNORE INTO labels (id, owner_id, kind, name, normalized_name, created_at)
SELECT ${sql(id)}, o.id, ${sql(kind)}, ${sql(name.slice(0, 40))}, ${sql(normalized)}, ${sql(payload.generated_at)} FROM _library_import_owner o;`);
  }

  for (const item of payload.items) {
    const id = stableId('seed-work', item.source_key);
    const creator = item.creator ? String(item.creator).trim() : null;
    const shortNote = item.short_note ? String(item.short_note).trim().slice(0, 280) : null;
    const metadata = JSON.stringify(item.metadata ?? {});
    const labelText = ['genre', 'theme', 'tag'].flatMap((kind) => item.labels?.[kind] ?? []).join(' ');
    const searchText = [item.title, creator ?? '', shortNote ?? '', labelText]
      .join(' ')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

    statements.push(`INSERT INTO works (id, owner_id, type, title, creator, status, rating, short_note, visibility, progress_current, progress_total, unit_label, metadata_json, search_text, source_key, created_at, updated_at)
SELECT ${sql(id)}, o.id, ${sql(item.type)}, ${sql(item.title)}, ${sql(creator)}, ${sql(item.status ?? 'want')}, NULL, ${sql(shortNote)}, 'private', NULL, NULL, ${sql(item.type === 'manga' ? '巻' : null)}, ${sql(metadata)}, ${sql(searchText)}, ${sql(item.source_key)}, ${sql(item.created_at)}, ${sql(item.updated_at)}
FROM _library_import_owner o
WHERE NOT EXISTS (
  SELECT 1 FROM works w
  WHERE w.owner_id = o.id AND w.deleted_at IS NULL
    AND (w.source_key = ${sql(item.source_key)} OR w.title = ${sql(item.title)})
);`);

    for (const kind of ['genre', 'theme', 'tag']) {
      for (const nameValue of item.labels?.[kind] ?? []) {
        const name = String(nameValue).trim();
        if (!name) continue;
        const normalized = name.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80);
        statements.push(`INSERT OR IGNORE INTO work_labels (work_id, label_id)
SELECT w.id, l.id
FROM _library_import_owner o
JOIN works w ON w.owner_id = o.id AND w.deleted_at IS NULL AND (w.source_key = ${sql(item.source_key)} OR w.title = ${sql(item.title)})
JOIN labels l ON l.owner_id = o.id AND l.kind = ${sql(kind)} AND l.normalized_name = ${sql(normalized)};`);
      }
    }
  }

  statements.push(`INSERT INTO audit_events (id, actor_id, target_id, action, after_json, reason, created_at)
SELECT ${sql(stableId('seed-audit', payload.generated_at))}, o.id, NULL, 'LIBRARY_IMPORT_COMPLETED', ${sql(JSON.stringify({ total: payload.items.length, batch: payload.batch }))}, 'Encrypted one-time import', ${sql(payload.generated_at)} FROM _library_import_owner o;`);
  statements.push('DROP TABLE IF EXISTS _library_import_owner;');
  return `${statements.join('\n\n')}\n`;
}

const encrypted = JSON.parse(await readFile(encryptedPath, 'utf8'));
const privateKey = await readFile(privateKeyPath, 'utf8');
const payload = decryptPayload(encrypted, privateKey);
const output = buildSql(payload);
await writeFile(outputPath, output, { mode: 0o600 });
console.log(`Prepared ${payload.items.length} deduplicated works for private D1 import.`);
