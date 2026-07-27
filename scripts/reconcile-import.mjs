// scripts/reconcile-import.mjs
//
// Phase 1-E of docs/IMPORT_IMPROVEMENT_PLAN — machine reconciliation between
// the original import JSON (Kindle/Notion/漫画 source, `{ items: [...] }`)
// and a production backup export (`GET /api/export?format=json`,
// `{ works: [...], notes: [...] }`).
//
// This does NOT talk to the network or D1 — it only compares two JSON files
// you already have on disk. Get them like this:
//
//   1. Original import JSON: the file the takeout/migration tooling produced
//      (the one with an `items` array).
//   2. Production backup: authenticate through Cloudflare Access in a
//      browser, then GET https://<your-domain>/api/export?format=json and
//      save the response body to a file. (This requires your own Access
//      session — it cannot be fetched from this sandbox.)
//
// Usage:
//   node scripts/reconcile-import.mjs <import.json> <backup-export.json> [out.json]
//
// Output: a JSON report (see `report` below) written to stdout and to
// out.json (default: reconciliation-report.json, already gitignored).

import { readFile, writeFile } from 'node:fs/promises';

const [importPath, backupPath, outPath = 'reconciliation-report.json'] = process.argv.slice(2);
if (!importPath || !backupPath) {
  console.error('Usage: node scripts/reconcile-import.mjs <import.json> <backup-export.json> [out.json]');
  process.exit(1);
}

function normalizeTitle(value) {
  // Mirrors the app's normalizeText() intent closely enough for matching
  // purposes: case-fold, strip whitespace variance, drop punctuation noise.
  // (The app's own normalizeText in src/db.ts is the authority — if this
  // script's classification disagrees with the app's, trust the app and
  // treat that as a finding, not a bug in one or the other.)
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[「」『』【】()（）\[\]{}:：・、,，.。!！?？~〜\-—–_'"]/g, '');
}

const importJson = JSON.parse(await readFile(importPath, 'utf8'));
const backupJson = JSON.parse(await readFile(backupPath, 'utf8'));

if (!Array.isArray(importJson.items)) {
  throw new Error(`${importPath} does not look like an import JSON (no "items" array). Did you pass the backup file by mistake?`);
}
if (!Array.isArray(backupJson.works)) {
  throw new Error(`${backupPath} does not look like a backup export (no "works" array). Did you pass the import file by mistake?`);
}

const items = importJson.items;
const works = backupJson.works;
const notes = Array.isArray(backupJson.notes) ? backupJson.notes : [];

// --- Index production works by source_key and by (type, normalized title) ---
const worksBySourceKey = new Map();
const worksByTitleKey = new Map();
for (const work of works) {
  if (work.source_key) {
    if (!worksBySourceKey.has(work.source_key)) worksBySourceKey.set(work.source_key, []);
    worksBySourceKey.get(work.source_key).push(work);
  }
  const titleKey = `${work.type}\u0000${normalizeTitle(work.title)}`;
  if (!worksByTitleKey.has(titleKey)) worksByTitleKey.set(titleKey, []);
  worksByTitleKey.get(titleKey).push(work);
}

// --- Classify every source item against production ---
const matchedBySourceKey = [];
const matchedByTitleOnly = [];
const missingFromProduction = [];
const sourceKeySeen = new Set();

for (const item of items) {
  const bySource = item.source_key ? worksBySourceKey.get(item.source_key) : undefined;
  if (bySource && bySource.length > 0) {
    matchedBySourceKey.push({ source_key: item.source_key, title: item.title, work_ids: bySource.map((w) => w.id) });
    if (item.source_key) sourceKeySeen.add(item.source_key);
    continue;
  }
  const titleKey = `${item.type}\u0000${normalizeTitle(item.title)}`;
  const byTitle = worksByTitleKey.get(titleKey);
  if (byTitle && byTitle.length > 0) {
    matchedByTitleOnly.push({ source_key: item.source_key, title: item.title, type: item.type, work_ids: byTitle.map((w) => w.id) });
    continue;
  }
  missingFromProduction.push({ source_key: item.source_key, title: item.title, type: item.type });
}

// --- Production works that don't trace back to any source item ---
// (could be manual entries, or items whose source_key changed between runs)
const sourceKeysInImport = new Set(items.map((item) => item.source_key).filter(Boolean));
const titleKeysInImport = new Set(items.map((item) => `${item.type}\u0000${normalizeTitle(item.title)}`));
const unexplainedWorks = works.filter((work) => {
  const bySource = work.source_key && sourceKeysInImport.has(work.source_key);
  const byTitle = titleKeysInImport.has(`${work.type}\u0000${normalizeTitle(work.title)}`);
  return !bySource && !byTitle;
});

// --- source_key duplication within production (should be 0 per 受入条件) ---
const duplicateSourceKeys = [...worksBySourceKey.entries()]
  .filter(([, rows]) => rows.length > 1)
  .map(([sourceKey, rows]) => ({ source_key: sourceKey, work_ids: rows.map((w) => w.id) }));

// --- Notion-origin memo reconciliation (target: 89件) ---
// The import JSON nests notes under each item; count how many of those
// notes exist verbatim (work_id + note_type + content) in production,
// mirroring the exact duplicate check applyNotes() uses server-side.
const importedNotes = [];
for (const item of items) {
  for (const note of Array.isArray(item.notes) ? item.notes : []) {
    importedNotes.push({ source_key: item.source_key, title: item.title, note_type: note.note_type, content: note.content });
  }
}
const notesByWorkAndContent = new Set(
  notes.map((note) => `${note.work_id}\u0000${note.note_type}\u0000${note.content}`)
);
let notesFoundInProduction = 0;
const notesNotFound = [];
for (const note of importedNotes) {
  const candidateWorkIds = [
    ...(note.source_key && worksBySourceKey.has(note.source_key) ? worksBySourceKey.get(note.source_key) : []),
    ...(worksByTitleKey.get(`${note.type}\u0000${normalizeTitle(note.title)}`) ?? [])
  ].map((w) => w.id);
  const found = candidateWorkIds.some((workId) => notesByWorkAndContent.has(`${workId}\u0000${note.note_type}\u0000${note.content}`));
  if (found) notesFoundInProduction += 1;
  else notesNotFound.push(note);
}

const report = {
  generated_at: new Date().toISOString(),
  inputs: { import_file: importPath, backup_file: backupPath },
  counts: {
    import_items_total: items.length,
    import_notes_total: importedNotes.length,
    production_works_total: works.length,
    production_notes_total: notes.length
  },
  works_reconciliation: {
    matched_by_source_key: matchedBySourceKey.length,
    matched_by_title_only: matchedByTitleOnly.length,
    missing_from_production: missingFromProduction.length,
    production_works_not_traced_to_any_source_item: unexplainedWorks.length
  },
  notes_reconciliation: {
    // target per docs/IMPORT_IMPROVEMENT_PLAN: 89
    found_in_production: notesFoundInProduction,
    not_found: notesNotFound.length
  },
  duplicate_source_keys_in_production: duplicateSourceKeys,
  // Full lists for follow-up work — kept even when large, since the whole
  // point of Phase 1-E is to explain every one of the 1,065 items.
  details: {
    matched_by_title_only: matchedByTitleOnly,
    missing_from_production: missingFromProduction,
    unexplained_production_works: unexplainedWorks.map((w) => ({ id: w.id, type: w.type, title: w.title, source_key: w.source_key })),
    notes_not_found: notesNotFound
  }
};

await writeFile(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  ok: true,
  summary: {
    import_items_total: report.counts.import_items_total,
    matched: report.works_reconciliation.matched_by_source_key + report.works_reconciliation.matched_by_title_only,
    missing_from_production: report.works_reconciliation.missing_from_production,
    unexplained_production_works: report.works_reconciliation.production_works_not_traced_to_any_source_item,
    notes_found: report.notes_reconciliation.found_in_production,
    notes_not_found: report.notes_reconciliation.not_found,
    duplicate_source_keys: duplicateSourceKeys.length
  },
  report_file: outPath
}, null, 2));

if (missingFromProduction.length > 0 || unexplainedWorks.length > 0 || duplicateSourceKeys.length > 0) {
  console.log('\n差分が見つかりました。詳細は', outPath, 'のdetailsを確認してください。');
  process.exitCode = 1;
}
