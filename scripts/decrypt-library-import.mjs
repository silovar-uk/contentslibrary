import { createDecipheriv, createHash, privateDecrypt, constants } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { readFile, writeFile } from 'node:fs/promises';

const [encryptedPath = 'data/library-import.enc', privateKeyPath = '.private-import-key.pem', outputPath = '.library-import.sql'] = process.argv.slice(2);
const TYPES = ['book', 'manga', 'movie', 'anime', 'drama', 'other'];
const sql = (value) => value === null || value === undefined ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const digest = (value, length = 24) => createHash('sha256').update(value).digest('hex').slice(0, length);
const stableId = (prefix, value) => `${prefix}-${digest(value)}`;

function decryptPayload(packageData, privateKey) {
  if (![1, 3].includes(packageData.version)) throw new Error('Unsupported encrypted payload version');
  const key = privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(packageData.encrypted_key, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(packageData.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(packageData.tag, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(packageData.ciphertext, 'base64')), decipher.final()]);
  return JSON.parse(gunzipSync(decrypted).toString('utf8'));
}

function expandCompactPayload(payload) {
  if (payload?.v !== 3 || !Array.isArray(payload.c) || !Array.isArray(payload.i)) return payload;
  const generatedAt = payload.g;
  const items = payload.i.map((row, index) => {
    if (!Array.isArray(row) || row.length < 4) throw new Error(`compact item ${index + 1} is invalid`);
    const [title, creatorIndex, typeIndex, flags] = row;
    const creator = payload.c[creatorIndex] || null;
    const type = TYPES[typeIndex];
    if (!title || !type) throw new Error(`compact item ${index + 1} is invalid`);
    let cursor = 4;
    const hasNote = Boolean(flags & 4);
    const isNotion = Boolean(flags & 1);
    const hallOfFame = Boolean(flags & 2);
    const owned = hasNote ? String(row[cursor++] ?? '') : '';
    let sourceId = '';
    let notionPage = '';
    let sourceUrl = '';
    let createdAt = generatedAt;
    let updatedAt = generatedAt;
    if (isNotion) {
      [sourceId, notionPage, sourceUrl, createdAt, updatedAt] = row.slice(cursor, cursor + 5);
    }
    const sourceKey = isNotion ? `notion:${sourceId}` : `kindle:${digest(`${title}\u0000${creator ?? ''}`, 32)}`;
    const tags = [isNotion ? 'Notion移行' : 'Kindle購入済み'];
    if (hallOfFame) tags.push('殿堂入り');
    if (type === 'manga' && owned) tags.push('シリーズ統合');
    return {
      source_key: sourceKey,
      title,
      creator,
      type,
      status: 'want',
      short_note: owned ? `Kindle購入済み：${owned}` : null,
      created_at: createdAt,
      updated_at: updatedAt,
      labels: { genre: type === 'manga' ? ['漫画'] : [], theme: [], tag: tags },
      metadata: isNotion
        ? { sources: ['notion'], notion_page: notionPage || null, source_url: sourceUrl || null }
        : { sources: ['kindle'], owned: owned || null }
    };
  });
  return { version: 1, batch: 'kindle-notion-compact-v3', generated_at: generatedAt, items };
}

function assertItem(item, index) {
  for (const key of ['source_key', 'title', 'type', 'created_at', 'updated_at']) {
    if (typeof item?.[key] !== 'string' || !item[key].trim()) throw new Error(`item ${index + 1}: ${key} is required`);
  }
  if (!TYPES.includes(item.type)) throw new Error(`item ${index + 1}: type is invalid`);
}

function buildSql(input) {
  const payload = expandCompactPayload(input);
  if (!payload || payload.version !== 1 || !Array.isArray(payload.items)) throw new Error('Import payload is invalid');
  payload.items.forEach(assertItem);
  const statements = [
    'PRAGMA foreign_keys = ON;',
    'DROP TABLE IF EXISTS _library_import_owner;',
    "CREATE TEMP TABLE _library_import_owner AS SELECT id FROM members WHERE role = 'owner' AND status = 'active' ORDER BY created_at LIMIT 1;"
  ];
  const labels = new Map();
  for (const item of payload.items) for (const kind of ['genre', 'theme', 'tag']) for (const value of item.labels?.[kind] ?? []) {
    const name = String(value).trim();
    if (name) labels.set(`${kind}\u0000${name}`, { kind, name });
  }
  for (const { kind, name } of labels.values()) {
    const normalized = name.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80);
    statements.push(`INSERT OR IGNORE INTO labels (id, owner_id, kind, name, normalized_name, created_at) SELECT ${sql(stableId('seed-label', `${kind}:${normalized}`))}, o.id, ${sql(kind)}, ${sql(name.slice(0, 40))}, ${sql(normalized)}, ${sql(payload.generated_at)} FROM _library_import_owner o;`);
  }
  for (const item of payload.items) {
    const id = stableId('seed-work', item.source_key);
    const creator = item.creator ? String(item.creator).trim() : null;
    const shortNote = item.short_note ? String(item.short_note).trim().slice(0, 280) : null;
    const labelText = ['genre', 'theme', 'tag'].flatMap((kind) => item.labels?.[kind] ?? []).join(' ');
    const searchText = [item.title, creator ?? '', shortNote ?? '', labelText].join(' ').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
    statements.push(`INSERT INTO works (id, owner_id, type, title, creator, status, rating, short_note, visibility, progress_current, progress_total, unit_label, metadata_json, search_text, source_key, created_at, updated_at)
SELECT ${sql(id)}, o.id, ${sql(item.type)}, ${sql(item.title)}, ${sql(creator)}, 'want', NULL, ${sql(shortNote)}, 'private', NULL, NULL, ${sql(item.type === 'manga' ? '巻' : null)}, ${sql(JSON.stringify(item.metadata ?? {}))}, ${sql(searchText)}, ${sql(item.source_key)}, ${sql(item.created_at)}, ${sql(item.updated_at)}
FROM _library_import_owner o WHERE NOT EXISTS (SELECT 1 FROM works w WHERE w.owner_id = o.id AND w.deleted_at IS NULL AND (w.source_key = ${sql(item.source_key)} OR w.title = ${sql(item.title)}));`);
    for (const kind of ['genre', 'theme', 'tag']) for (const value of item.labels?.[kind] ?? []) {
      const name = String(value).trim();
      if (!name) continue;
      const normalized = name.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80);
      statements.push(`INSERT OR IGNORE INTO work_labels (work_id, label_id) SELECT w.id, l.id FROM _library_import_owner o JOIN works w ON w.owner_id = o.id AND w.deleted_at IS NULL AND (w.source_key = ${sql(item.source_key)} OR w.title = ${sql(item.title)}) JOIN labels l ON l.owner_id = o.id AND l.kind = ${sql(kind)} AND l.normalized_name = ${sql(normalized)};`);
    }
  }
  statements.push(`INSERT INTO audit_events (id, actor_id, target_id, action, after_json, reason, created_at) SELECT ${sql(stableId('seed-audit', payload.generated_at))}, o.id, NULL, 'LIBRARY_IMPORT_COMPLETED', ${sql(JSON.stringify({ total: payload.items.length, batch: payload.batch }))}, 'Encrypted one-time import', ${sql(payload.generated_at)} FROM _library_import_owner o;`);
  statements.push('DROP TABLE IF EXISTS _library_import_owner;');
  return { sql: `${statements.join('\n\n')}\n`, count: payload.items.length };
}

const encrypted = JSON.parse(await readFile(encryptedPath, 'utf8'));
const privateKey = await readFile(privateKeyPath, 'utf8');
const result = buildSql(decryptPayload(encrypted, privateKey));
await writeFile(outputPath, result.sql, { mode: 0o600 });
console.log(`Prepared ${result.count} deduplicated works for private D1 import.`);
