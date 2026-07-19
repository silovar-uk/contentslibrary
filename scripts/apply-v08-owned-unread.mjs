import { readFile, writeFile } from 'node:fs/promises';

async function patch(path, transform) {
  const before = await readFile(path, 'utf8');
  const after = transform(before);
  if (after === before) return false;
  await writeFile(path, after);
  return true;
}

function replaceOrThrow(text, from, to, label) {
  if (text.includes(to)) return text;
  if (!text.includes(from)) throw new Error(`Patch target not found: ${label}`);
  return text.replace(from, to);
}

const changed = [];

if (await patch('src/types.ts', (text) => replaceOrThrow(
  text,
  'export type WorkStatus = "want" | "active" | "completed" | "paused" | "dropped";',
  'export type WorkStatus = "want" | "owned_unread" | "active" | "completed" | "paused" | "dropped";',
  'WorkStatus'
))) changed.push('src/types.ts');

if (await patch('src/routes/works.ts', (text) => replaceOrThrow(
  text,
  'const WORK_STATUSES: WorkStatus[] = ["want", "active", "completed", "paused", "dropped"];',
  'const WORK_STATUSES: WorkStatus[] = ["want", "owned_unread", "active", "completed", "paused", "dropped"];',
  'WORK_STATUSES'
))) changed.push('src/routes/works.ts');

if (await patch('public/app.js', (text) => text.includes("import './app-v08.js';") ? text : `${text.trimEnd()}\nimport './app-v08.js';\n`)) changed.push('public/app.js');

if (await patch('package.json', (text) => replaceOrThrow(
  text,
  'node --check public/app-v05.js && node --check public/app-v07.js',
  'node --check public/app-v05.js && node --check public/app-v07.js && node --check public/app-v08.js',
  'frontend check'
))) changed.push('package.json');

if (await patch('public/index.html', (text) => {
  text = replaceOrThrow(
    text,
    '<option value="">すべて</option><option value="want">読みたい・見たい</option><option value="active">進行中</option>',
    '<option value="">すべて</option><option value="want">読みたい・見たい</option><option value="owned_unread">所持・未読</option><option value="active">進行中</option>',
    'filter status option'
  );
  return replaceOrThrow(
    text,
    '<option value="want">読みたい・見たい</option><option value="active">進行中</option>',
    '<option value="want">読みたい・見たい</option><option value="owned_unread">所持・未読</option><option value="active">進行中</option>',
    'form status option'
  );
})) changed.push('public/index.html');

if (await patch('public/app-v02.js', (text) => {
  text = replaceOrThrow(
    text,
    "const STATUS_LABELS = {want:'読みたい・見たい',active:'進行中',completed:'完了',paused:'一時停止',dropped:'中断'};",
    "const STATUS_LABELS = {want:'読みたい・見たい',owned_unread:'所持・未読',active:'進行中',completed:'完了',paused:'一時停止',dropped:'中断'};",
    'STATUS_LABELS'
  );
  if (!text.includes("statuses:{owned_unread:'所持・未読',want:")) {
    text = text.replaceAll("statuses:{want:", "statuses:{owned_unread:'所持・未読',want:");
  }
  return text;
})) changed.push('public/app-v02.js');

if (await patch('scripts/decrypt-library-import.mjs', (text) => {
  text = replaceOrThrow(
    text,
    "  if (!['book', 'manga', 'movie', 'anime', 'drama', 'other'].includes(item.type)) throw new Error(`item ${index + 1}: type is invalid`);\n  if (item.labels && typeof item.labels !== 'object') throw new Error(`item ${index + 1}: labels are invalid`);",
    "  if (!['book', 'manga', 'movie', 'anime', 'drama', 'other'].includes(item.type)) throw new Error(`item ${index + 1}: type is invalid`);\n  if (item.status && !['want', 'owned_unread', 'active', 'completed', 'paused', 'dropped'].includes(item.status)) throw new Error(`item ${index + 1}: status is invalid`);\n  if (item.labels && typeof item.labels !== 'object') throw new Error(`item ${index + 1}: labels are invalid`);\n  if (item.notes && !Array.isArray(item.notes)) throw new Error(`item ${index + 1}: notes are invalid`);",
    'import validation'
  );
  text = replaceOrThrow(
    text,
    "    const labelText = ['genre', 'theme', 'tag'].flatMap((kind) => item.labels?.[kind] ?? []).join(' ');\n    const searchText = [item.title, creator ?? '', shortNote ?? '', labelText]",
    "    const labelText = ['genre', 'theme', 'tag'].flatMap((kind) => item.labels?.[kind] ?? []).join(' ');\n    const noteText = (item.notes ?? []).map((note) => note?.content ?? '').join(' ');\n    const searchText = [item.title, creator ?? '', shortNote ?? '', labelText, noteText]",
    'import search text'
  );
  text = replaceOrThrow(
    text,
    "      }\n    }\n  }\n\n  statements.push(`INSERT INTO audit_events",
    "      }\n    }\n\n    for (const [noteIndex, note] of (item.notes ?? []).entries()) {\n      const noteType = ['quick', 'summary', 'impression', 'quote', 'idea', 'connection', 'progress'].includes(note?.note_type) ? note.note_type : 'quick';\n      const content = String(note?.content ?? '').trim();\n      if (!content) continue;\n      const noteId = stableId('seed-note', `${item.source_key}:${noteIndex}:${noteType}:${content}`);\n      statements.push(`INSERT OR IGNORE INTO notes (id, work_id, experience_id, note_type, content, position, created_at, updated_at)\nSELECT ${sql(noteId)}, w.id, NULL, ${sql(noteType)}, ${sql(content)}, ${sql(note?.position ? String(note.position).slice(0, 120) : null)}, ${sql(item.created_at)}, ${sql(item.updated_at)}\nFROM _library_import_owner o\nJOIN works w ON w.owner_id = o.id AND w.deleted_at IS NULL AND (w.source_key = ${sql(item.source_key)} OR w.title = ${sql(item.title)});`);\n    }\n  }\n\n  statements.push(`INSERT INTO audit_events",
    'note import loop'
  );
  return text;
})) changed.push('scripts/decrypt-library-import.mjs');

console.log(changed.length ? `Patched: ${changed.join(', ')}` : 'No changes needed.');
