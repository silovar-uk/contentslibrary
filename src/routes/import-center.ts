import { audit, newId, normalizeText, nowIso, rebuildWorkSearchText } from "../db";
import { HttpError, json, parseJson } from "../http";
import type { AuthContext, Env, LabelKind, WorkStatus, WorkType } from "../types";

const WORK_TYPES: WorkType[] = ["book", "manga", "movie", "anime", "drama", "other"];
const WORK_STATUSES: WorkStatus[] = ["want", "owned_unread", "active", "completed", "paused", "dropped"];
const NOTE_TYPES = ["quick", "summary", "impression", "quote", "idea", "connection", "progress"] as const;
const IMPORT_WINDOW_MINUTES = 60;
const MAX_BATCH_ITEMS = 5_000;
const MAX_BATCH_NOTES = 20_000;
const UPLOAD_CHUNK_LIMIT = 50;
const COMMIT_CHUNK_LIMIT = 20;
const ROLLBACK_CHUNK_LIMIT = 100;

type NoteType = typeof NOTE_TYPES[number];
type BatchStatus = "draft" | "uploading" | "review" | "validated" | "committing" | "committed" | "failed" | "rolled_back";
type ItemAction = "pending" | "insert" | "merge" | "skip" | "conflict" | "applied" | "rolled_back";

interface ImportBatchRow {
  id: string;
  owner_id: string;
  name: string;
  source_filename: string | null;
  content_hash: string;
  expected_works: number;
  expected_notes: number;
  staged_works: number;
  staged_notes: number;
  insert_count: number;
  merge_count: number;
  skip_count: number;
  conflict_count: number;
  applied_works: number;
  applied_notes: number;
  status: BatchStatus;
  error_message: string | null;
  created_at: string;
  validated_at: string | null;
  committed_at: string | null;
  rolled_back_at: string | null;
  updated_at: string;
}

interface ImportItemRow {
  id: string;
  batch_id: string;
  ordinal: number;
  source_key: string;
  type: WorkType;
  title: string;
  normalized_title: string;
  creator: string | null;
  status: WorkStatus;
  rating: number | null;
  short_note: string | null;
  progress_current: number | null;
  progress_total: number | null;
  unit_label: string | null;
  labels_json: string;
  metadata_json: string;
  source_created_at: string;
  source_updated_at: string;
  action: ItemAction;
  existing_work_id: string | null;
  applied_work_id: string | null;
  error_text: string | null;
}

interface ImportNoteRow {
  id: string;
  item_id: string;
  ordinal: number;
  note_type: NoteType;
  content: string;
  position: string | null;
  source_created_at: string;
  source_updated_at: string;
  action: "pending" | "insert" | "skip" | "applied" | "rolled_back";
  applied_note_id: string | null;
}

interface ExistingWorkRow {
  id: string;
  type: WorkType;
  title: string;
  source_key: string | null;
}

interface RawImportNote {
  note_type?: unknown;
  content?: unknown;
  position?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
}

interface RawImportItem {
  ordinal?: unknown;
  source_key?: unknown;
  type?: unknown;
  title?: unknown;
  creator?: unknown;
  status?: unknown;
  rating?: unknown;
  short_note?: unknown;
  progress_current?: unknown;
  progress_total?: unknown;
  unit_label?: unknown;
  labels?: unknown;
  metadata?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  notes?: unknown;
}

function requireOwner(auth: AuthContext): void {
  if (auth.member.role !== "owner") throw new HttpError(403, "OWNER_REQUIRED", "この取込機能はownerだけが利用できます。");
}

function textField(value: unknown, name: string, max: number, required = false): string | null {
  if (value === undefined || value === null) {
    if (required) throw new HttpError(422, "VALIDATION_ERROR", `${name}は必須です。`);
    return null;
  }
  if (typeof value !== "string") throw new HttpError(422, "VALIDATION_ERROR", `${name}の形式が正しくありません。`);
  const clean = value.trim();
  if (required && !clean) throw new HttpError(422, "VALIDATION_ERROR", `${name}は必須です。`);
  if (clean.length > max) throw new HttpError(422, "VALIDATION_ERROR", `${name}は${max}文字以内で入力してください。`);
  return clean || null;
}

function numberField(value: unknown, name: string, options: { integer?: boolean; min?: number; max?: number } = {}): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new HttpError(422, "VALIDATION_ERROR", `${name}は数値で入力してください。`);
  if (options.integer && !Number.isInteger(parsed)) throw new HttpError(422, "VALIDATION_ERROR", `${name}は整数で入力してください。`);
  if (options.min !== undefined && parsed < options.min) throw new HttpError(422, "VALIDATION_ERROR", `${name}が小さすぎます。`);
  if (options.max !== undefined && parsed > options.max) throw new HttpError(422, "VALIDATION_ERROR", `${name}が大きすぎます。`);
  return parsed;
}

function enumField<T extends string>(value: unknown, allowed: readonly T[], name: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new HttpError(422, "VALIDATION_ERROR", `${name}が正しくありません。`);
  return value as T;
}

function dateField(value: unknown, fallback: string): string {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string" || value.length > 50 || Number.isNaN(Date.parse(value))) {
    throw new HttpError(422, "VALIDATION_ERROR", "日付の形式が正しくありません。");
  }
  return new Date(value).toISOString();
}

function parseJsonSafe<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function labelsField(value: unknown): Record<LabelKind, string[]> {
  const result: Record<LabelKind, string[]> = { genre: [], theme: [], tag: [] };
  if (value === undefined || value === null) return result;
  if (typeof value !== "object" || Array.isArray(value)) throw new HttpError(422, "VALIDATION_ERROR", "分類の形式が正しくありません。");
  for (const kind of ["genre", "theme", "tag"] as LabelKind[]) {
    const raw = (value as Record<string, unknown>)[kind];
    if (raw === undefined) continue;
    if (!Array.isArray(raw) || raw.some((entry) => typeof entry !== "string")) {
      throw new HttpError(422, "VALIDATION_ERROR", `${kind}の形式が正しくありません。`);
    }
    result[kind] = Array.from(new Set((raw as string[]).map((entry) => entry.trim()).filter(Boolean))).slice(0, 30);
    if (result[kind].some((entry) => entry.length > 40)) throw new HttpError(422, "VALIDATION_ERROR", "分類は1件40文字以内です。");
  }
  return result;
}

function metadataField(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new HttpError(422, "VALIDATION_ERROR", "付帯情報の形式が正しくありません。");
  const serialized = JSON.stringify(value);
  if (serialized.length > 50_000) throw new HttpError(422, "VALIDATION_ERROR", "付帯情報が大きすぎます。");
  return value as Record<string, unknown>;
}

function noteField(value: unknown, fallbackDate: string, ordinal: number): Required<RawImportNote> & { note_type: NoteType; content: string; position: string | null; created_at: string; updated_at: string; ordinal: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(422, "VALIDATION_ERROR", "メモの形式が正しくありません。");
  const raw = value as RawImportNote;
  const noteType = enumField(raw.note_type ?? "quick", NOTE_TYPES, "メモ種別");
  const content = textField(raw.content, "メモ", 50_000, true)!;
  const position = textField(raw.position, "位置", 120);
  const createdAt = dateField(raw.created_at, fallbackDate);
  const updatedAt = dateField(raw.updated_at, createdAt);
  return { note_type: noteType, content, position, created_at: createdAt, updated_at: updatedAt, ordinal } as never;
}

function itemField(value: unknown, fallbackOrdinal: number): {
  ordinal: number;
  source_key: string;
  type: WorkType;
  title: string;
  normalized_title: string;
  creator: string | null;
  status: WorkStatus;
  rating: number | null;
  short_note: string | null;
  progress_current: number | null;
  progress_total: number | null;
  unit_label: string | null;
  labels: Record<LabelKind, string[]>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  notes: ReturnType<typeof noteField>[];
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(422, "VALIDATION_ERROR", "作品データの形式が正しくありません。");
  const raw = value as RawImportItem;
  const ordinal = numberField(raw.ordinal ?? fallbackOrdinal, "並び順", { integer: true, min: 0, max: MAX_BATCH_ITEMS - 1 })!;
  const sourceKey = textField(raw.source_key, "source_key", 500, true)!;
  const type = enumField(raw.type, WORK_TYPES, "作品種別");
  const title = textField(raw.title, "タイトル", 300, true)!;
  const creator = textField(raw.creator, "作者・監督", 300);
  const status = enumField(raw.status ?? "owned_unread", WORK_STATUSES, "状態");
  const rating = numberField(raw.rating, "評価", { min: 0.5, max: 5 });
  if (rating !== null && Math.round(rating * 2) !== rating * 2) throw new HttpError(422, "VALIDATION_ERROR", "評価は0.5刻みです。");
  const shortNote = textField(raw.short_note, "一言メモ", 280);
  const progressCurrent = numberField(raw.progress_current, "現在の進捗", { min: 0 });
  const progressTotal = numberField(raw.progress_total, "全体の進捗", { min: 0 });
  if (progressCurrent !== null && progressTotal !== null && progressCurrent > progressTotal) {
    throw new HttpError(422, "VALIDATION_ERROR", "現在の進捗は全体以下にしてください。");
  }
  const unitLabel = textField(raw.unit_label, "進捗単位", 30);
  const labels = labelsField(raw.labels);
  const metadata = metadataField(raw.metadata);
  const now = nowIso();
  const createdAt = dateField(raw.created_at, now);
  const updatedAt = dateField(raw.updated_at, createdAt);
  const rawNotes = raw.notes ?? [];
  if (!Array.isArray(rawNotes) || rawNotes.length > 100) throw new HttpError(422, "VALIDATION_ERROR", "1作品あたりのメモは100件までです。");
  const notes = rawNotes.map((note, index) => noteField(note, updatedAt, index));
  return {
    ordinal,
    source_key: sourceKey,
    type,
    title,
    normalized_title: normalizeText(title),
    creator,
    status,
    rating,
    short_note: shortNote,
    progress_current: progressCurrent,
    progress_total: progressTotal,
    unit_label: unitLabel,
    labels,
    metadata,
    created_at: createdAt,
    updated_at: updatedAt,
    notes
  };
}

async function getBatch(env: Env, auth: AuthContext, batchId: string): Promise<ImportBatchRow> {
  const row = await env.DB.prepare("SELECT * FROM import_batches WHERE id = ? AND owner_id = ? LIMIT 1")
    .bind(batchId, auth.member.id).first<ImportBatchRow>();
  if (!row) throw new HttpError(404, "IMPORT_BATCH_NOT_FOUND", "取込バッチが見つかりません。");
  return row;
}

async function requireImportWindow(env: Env, auth: AuthContext): Promise<string> {
  requireOwner(auth);
  const control = await env.DB.prepare("SELECT enabled_until FROM import_controls WHERE owner_id = ? LIMIT 1")
    .bind(auth.member.id).first<{ enabled_until: string | null }>();
  const enabledUntil = control?.enabled_until ?? null;
  if (!enabledUntil || enabledUntil <= nowIso()) throw new HttpError(423, "IMPORT_CENTER_LOCKED", "データ取込は無効です。設定画面から60分間だけ有効にしてください。");
  return enabledUntil;
}

async function runStatements(env: Env, statements: D1PreparedStatement[], chunkSize = 80): Promise<void> {
  for (let index = 0; index < statements.length; index += chunkSize) {
    await env.DB.batch(statements.slice(index, index + chunkSize));
  }
}

async function refreshBatchStagedCounts(env: Env, batchId: string): Promise<void> {
  const now = nowIso();
  await env.DB.prepare(
    "UPDATE import_batches SET staged_works = (SELECT COUNT(*) FROM import_items WHERE batch_id = ?), staged_notes = (SELECT COUNT(*) FROM import_notes WHERE batch_id = ?), updated_at = ? WHERE id = ?"
  ).bind(batchId, batchId, now, batchId).run();
}

async function addConflict(env: Env, batchId: string, itemId: string | null, kind: string, message: string, details: unknown): Promise<void> {
  await env.DB.prepare("INSERT INTO import_conflicts (id, batch_id, item_id, kind, message, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(newId(), batchId, itemId, kind, message, JSON.stringify(details ?? {}), nowIso()).run();
}

function batchSummary(row: ImportBatchRow): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    source_filename: row.source_filename,
    content_hash: row.content_hash,
    expected_works: row.expected_works,
    expected_notes: row.expected_notes,
    staged_works: row.staged_works,
    staged_notes: row.staged_notes,
    insert_count: row.insert_count,
    merge_count: row.merge_count,
    skip_count: row.skip_count,
    conflict_count: row.conflict_count,
    applied_works: row.applied_works,
    applied_notes: row.applied_notes,
    status: row.status,
    error_message: row.error_message,
    created_at: row.created_at,
    validated_at: row.validated_at,
    committed_at: row.committed_at,
    rolled_back_at: row.rolled_back_at,
    updated_at: row.updated_at
  };
}

export async function getImportCenterStatus(env: Env, auth: AuthContext): Promise<Response> {
  requireOwner(auth);
  const current = nowIso();
  const control = await env.DB.prepare("SELECT enabled_until FROM import_controls WHERE owner_id = ? LIMIT 1")
    .bind(auth.member.id).first<{ enabled_until: string | null }>();
  const batches = await env.DB.prepare("SELECT * FROM import_batches WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 10")
    .bind(auth.member.id).all<ImportBatchRow>();
  const enabledUntil = control?.enabled_until ?? null;
  return json({
    enabled: Boolean(enabledUntil && enabledUntil > current),
    enabled_until: enabledUntil,
    batches: batches.results.map(batchSummary)
  });
}

export async function enableImportCenter(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  requireOwner(auth);
  const payload = await parseJson<Record<string, unknown>>(request);
  if (payload.confirmation !== "ENABLE_IMPORT") throw new HttpError(422, "CONFIRMATION_REQUIRED", "確認文字列が一致しません。");
  const now = new Date();
  const enabledUntil = new Date(now.getTime() + IMPORT_WINDOW_MINUTES * 60_000).toISOString();
  await env.DB.prepare(
    "INSERT INTO import_controls (owner_id, enabled_until, updated_at) VALUES (?, ?, ?) ON CONFLICT(owner_id) DO UPDATE SET enabled_until = excluded.enabled_until, updated_at = excluded.updated_at"
  ).bind(auth.member.id, enabledUntil, now.toISOString()).run();
  await audit(env, "IMPORT_CENTER_ENABLED", auth.member.id, auth.member.id, { after: { enabled_until: enabledUntil } });
  return json({ enabled: true, enabled_until: enabledUntil });
}

export async function disableImportCenter(env: Env, auth: AuthContext): Promise<Response> {
  requireOwner(auth);
  await env.DB.prepare(
    "INSERT INTO import_controls (owner_id, enabled_until, updated_at) VALUES (?, NULL, ?) ON CONFLICT(owner_id) DO UPDATE SET enabled_until = NULL, updated_at = excluded.updated_at"
  ).bind(auth.member.id, nowIso()).run();
  await audit(env, "IMPORT_CENTER_DISABLED", auth.member.id, auth.member.id);
  return json({ enabled: false });
}

export async function createImportBatch(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  await requireImportWindow(env, auth);
  const payload = await parseJson<Record<string, unknown>>(request);
  const name = textField(payload.name ?? "作品データ取込", "取込名", 120, true)!;
  const filename = textField(payload.source_filename, "ファイル名", 240);
  const contentHash = textField(payload.content_hash, "SHA-256", 64, true)!;
  if (!/^[a-f0-9]{64}$/i.test(contentHash)) throw new HttpError(422, "VALIDATION_ERROR", "SHA-256が正しくありません。");
  const expectedWorks = numberField(payload.expected_works, "作品数", { integer: true, min: 1, max: MAX_BATCH_ITEMS })!;
  const expectedNotes = numberField(payload.expected_notes ?? 0, "メモ数", { integer: true, min: 0, max: MAX_BATCH_NOTES })!;
  const existing = await env.DB.prepare("SELECT * FROM import_batches WHERE owner_id = ? AND content_hash = ? LIMIT 1")
    .bind(auth.member.id, contentHash.toLowerCase()).first<ImportBatchRow>();
  if (existing) return json({ batch: batchSummary(existing), reused: true });
  const id = newId();
  const now = nowIso();
  await env.DB.prepare(
    "INSERT INTO import_batches (id, owner_id, name, source_filename, content_hash, expected_works, expected_notes, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)"
  ).bind(id, auth.member.id, name, filename, contentHash.toLowerCase(), expectedWorks, expectedNotes, now, now).run();
  await audit(env, "IMPORT_BATCH_CREATED", auth.member.id, id, { after: { name, filename, content_hash: contentHash.toLowerCase(), expected_works: expectedWorks, expected_notes: expectedNotes } });
  return json({ batch: batchSummary(await getBatch(env, auth, id)), reused: false }, 201);
}

export async function uploadImportItems(request: Request, env: Env, auth: AuthContext, batchId: string): Promise<Response> {
  await requireImportWindow(env, auth);
  const batch = await getBatch(env, auth, batchId);
  if (!["draft", "uploading", "review"].includes(batch.status)) throw new HttpError(409, "IMPORT_BATCH_LOCKED", "この取込バッチには追加アップロードできません。");
  const payload = await parseJson<Record<string, unknown>>(request);
  if (!Array.isArray(payload.items) || payload.items.length === 0 || payload.items.length > UPLOAD_CHUNK_LIMIT) {
    throw new HttpError(422, "VALIDATION_ERROR", `1回の送信は1〜${UPLOAD_CHUNK_LIMIT}作品です。`);
  }
  for (let index = 0; index < payload.items.length; index += 1) {
    const item = itemField(payload.items[index], batch.staged_works + index);
    const existing = await env.DB.prepare("SELECT id FROM import_items WHERE batch_id = ? AND ordinal = ? LIMIT 1")
      .bind(batchId, item.ordinal).first<{ id: string }>();
    const itemId = existing?.id ?? newId();
    const now = nowIso();
    if (existing) {
      await env.DB.prepare("DELETE FROM import_notes WHERE item_id = ?").bind(itemId).run();
      await env.DB.prepare(
        "UPDATE import_items SET source_key = ?, type = ?, title = ?, normalized_title = ?, creator = ?, status = ?, rating = ?, short_note = ?, progress_current = ?, progress_total = ?, unit_label = ?, labels_json = ?, metadata_json = ?, source_created_at = ?, source_updated_at = ?, action = 'pending', existing_work_id = NULL, applied_work_id = NULL, error_text = NULL, updated_at = ? WHERE id = ? AND batch_id = ?"
      ).bind(item.source_key, item.type, item.title, item.normalized_title, item.creator, item.status, item.rating, item.short_note, item.progress_current, item.progress_total, item.unit_label, JSON.stringify(item.labels), JSON.stringify(item.metadata), item.created_at, item.updated_at, now, itemId, batchId).run();
    } else {
      await env.DB.prepare(
        "INSERT INTO import_items (id, batch_id, ordinal, source_key, type, title, normalized_title, creator, status, rating, short_note, progress_current, progress_total, unit_label, labels_json, metadata_json, source_created_at, source_updated_at, action, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)"
      ).bind(itemId, batchId, item.ordinal, item.source_key, item.type, item.title, item.normalized_title, item.creator, item.status, item.rating, item.short_note, item.progress_current, item.progress_total, item.unit_label, JSON.stringify(item.labels), JSON.stringify(item.metadata), item.created_at, item.updated_at, now, now).run();
    }
    if (item.notes.length > 0) {
      const statements = item.notes.map((note) => env.DB.prepare(
        "INSERT INTO import_notes (id, batch_id, item_id, ordinal, note_type, content, position, source_created_at, source_updated_at, action, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)"
      ).bind(newId(), batchId, itemId, note.ordinal, note.note_type, note.content, note.position, note.created_at, note.updated_at, now, now));
      await runStatements(env, statements);
    }
  }
  await env.DB.prepare("DELETE FROM import_conflicts WHERE batch_id = ?").bind(batchId).run();
  await env.DB.prepare("UPDATE import_batches SET status = 'uploading', validated_at = NULL, error_message = NULL, updated_at = ? WHERE id = ? AND owner_id = ?")
    .bind(nowIso(), batchId, auth.member.id).run();
  await refreshBatchStagedCounts(env, batchId);
  const updated = await getBatch(env, auth, batchId);
  return json({ batch: batchSummary(updated), uploaded: payload.items.length });
}

export async function validateImportBatch(env: Env, auth: AuthContext, batchId: string): Promise<Response> {
  await requireImportWindow(env, auth);
  const batch = await getBatch(env, auth, batchId);
  if (["committing", "committed", "rolled_back"].includes(batch.status)) throw new HttpError(409, "IMPORT_BATCH_LOCKED", "この取込バッチは検証し直せません。");
  await refreshBatchStagedCounts(env, batchId);
  const refreshed = await getBatch(env, auth, batchId);
  await env.DB.prepare("DELETE FROM import_conflicts WHERE batch_id = ?").bind(batchId).run();
  await env.DB.prepare("UPDATE import_items SET action = 'pending', existing_work_id = NULL, applied_work_id = NULL, error_text = NULL, updated_at = ? WHERE batch_id = ?")
    .bind(nowIso(), batchId).run();

  if (refreshed.staged_works !== refreshed.expected_works) {
    await addConflict(env, batchId, null, "count_mismatch", "作品数が事前申告と一致しません。", { expected: refreshed.expected_works, actual: refreshed.staged_works });
  }
  if (refreshed.staged_notes !== refreshed.expected_notes) {
    await addConflict(env, batchId, null, "note_count_mismatch", "メモ数が事前申告と一致しません。", { expected: refreshed.expected_notes, actual: refreshed.staged_notes });
  }

  const duplicateSources = await env.DB.prepare(
    "SELECT source_key, COUNT(*) AS count FROM import_items WHERE batch_id = ? GROUP BY source_key HAVING COUNT(*) > 1 LIMIT 100"
  ).bind(batchId).all<{ source_key: string; count: number }>();
  const duplicateSourceSet = new Set(duplicateSources.results.map((row) => row.source_key));
  for (const row of duplicateSources.results) {
    await addConflict(env, batchId, null, "duplicate_source_key", "取込ファイル内でsource_keyが重複しています。", row);
  }

  const duplicateTitles = await env.DB.prepare(
    "SELECT type, normalized_title, COUNT(*) AS count FROM import_items WHERE batch_id = ? GROUP BY type, normalized_title HAVING COUNT(*) > 1 LIMIT 100"
  ).bind(batchId).all<{ type: WorkType; normalized_title: string; count: number }>();
  const duplicateTitleSet = new Set(duplicateTitles.results.map((row) => `${row.type}\u0000${row.normalized_title}`));
  for (const row of duplicateTitles.results) {
    await addConflict(env, batchId, null, "duplicate_title", "同じ媒体種別・作品名が取込ファイル内で重複しています。", row);
  }

  const existingRows = await env.DB.prepare("SELECT id, type, title, source_key FROM works WHERE owner_id = ? AND deleted_at IS NULL")
    .bind(auth.member.id).all<ExistingWorkRow>();
  const bySource = new Map<string, ExistingWorkRow>();
  const byTitle = new Map<string, ExistingWorkRow[]>();
  for (const work of existingRows.results) {
    if (work.source_key) bySource.set(work.source_key, work);
    const key = `${work.type}\u0000${normalizeText(work.title)}`;
    const values = byTitle.get(key) ?? [];
    values.push(work);
    byTitle.set(key, values);
  }
  const items = await env.DB.prepare("SELECT * FROM import_items WHERE batch_id = ? ORDER BY ordinal")
    .bind(batchId).all<ImportItemRow>();
  const statements: D1PreparedStatement[] = [];
  const conflicts: Array<{ item: ImportItemRow; kind: string; message: string; details: unknown }> = [];
  for (const item of items.results) {
    const titleKey = `${item.type}\u0000${item.normalized_title}`;
    if (duplicateSourceSet.has(item.source_key) || duplicateTitleSet.has(titleKey)) {
      statements.push(env.DB.prepare("UPDATE import_items SET action = 'conflict', error_text = ?, updated_at = ? WHERE id = ?")
        .bind("取込ファイル内の重複を解消してください。", nowIso(), item.id));
      continue;
    }
    const sourceMatch = bySource.get(item.source_key);
    if (sourceMatch) {
      statements.push(env.DB.prepare("UPDATE import_items SET action = 'skip', existing_work_id = ?, updated_at = ? WHERE id = ?")
        .bind(sourceMatch.id, nowIso(), item.id));
      continue;
    }
    const titleMatches = byTitle.get(titleKey) ?? [];
    if (titleMatches.length === 1) {
      statements.push(env.DB.prepare("UPDATE import_items SET action = 'merge', existing_work_id = ?, updated_at = ? WHERE id = ?")
        .bind(titleMatches[0]!.id, nowIso(), item.id));
      continue;
    }
    if (titleMatches.length > 1) {
      statements.push(env.DB.prepare("UPDATE import_items SET action = 'conflict', error_text = ?, updated_at = ? WHERE id = ?")
        .bind("同名作品が複数あるため自動統合できません。", nowIso(), item.id));
      conflicts.push({ item, kind: "multiple_existing_matches", message: "既存データに同名作品が複数あります。", details: { existing_ids: titleMatches.map((match) => match.id) } });
      continue;
    }
    statements.push(env.DB.prepare("UPDATE import_items SET action = 'insert', updated_at = ? WHERE id = ?").bind(nowIso(), item.id));
  }
  await runStatements(env, statements);
  for (const conflict of conflicts) await addConflict(env, batchId, conflict.item.id, conflict.kind, conflict.message, conflict.details);

  const counts = await env.DB.prepare(
    "SELECT SUM(CASE WHEN action = 'insert' THEN 1 ELSE 0 END) AS insert_count, SUM(CASE WHEN action = 'merge' THEN 1 ELSE 0 END) AS merge_count, SUM(CASE WHEN action = 'skip' THEN 1 ELSE 0 END) AS skip_count, SUM(CASE WHEN action = 'conflict' THEN 1 ELSE 0 END) AS item_conflicts FROM import_items WHERE batch_id = ?"
  ).bind(batchId).first<{ insert_count: number | null; merge_count: number | null; skip_count: number | null; item_conflicts: number | null }>();
  const conflictCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM import_conflicts WHERE batch_id = ?").bind(batchId).first<{ count: number }>();
  const totalConflicts = Number(conflictCount?.count ?? 0) + Number(counts?.item_conflicts ?? 0);
  const status: BatchStatus = totalConflicts === 0 ? "validated" : "review";
  const now = nowIso();
  await env.DB.prepare(
    "UPDATE import_batches SET insert_count = ?, merge_count = ?, skip_count = ?, conflict_count = ?, status = ?, validated_at = ?, error_message = NULL, updated_at = ? WHERE id = ? AND owner_id = ?"
  ).bind(Number(counts?.insert_count ?? 0), Number(counts?.merge_count ?? 0), Number(counts?.skip_count ?? 0), totalConflicts, status, now, now, batchId, auth.member.id).run();
  await audit(env, "IMPORT_BATCH_VALIDATED", auth.member.id, batchId, { after: { status, conflicts: totalConflicts } });
  return getImportBatchDetail(env, auth, batchId);
}

export async function getImportBatchDetail(env: Env, auth: AuthContext, batchId: string): Promise<Response> {
  requireOwner(auth);
  const batch = await getBatch(env, auth, batchId);
  const conflicts = await env.DB.prepare("SELECT id, item_id, kind, message, details_json, created_at FROM import_conflicts WHERE batch_id = ? ORDER BY created_at, id LIMIT 100")
    .bind(batchId).all<Record<string, unknown>>();
  const samples = await env.DB.prepare(
    "SELECT id, ordinal, source_key, type, title, creator, status, action, existing_work_id, applied_work_id, error_text FROM import_items WHERE batch_id = ? ORDER BY CASE action WHEN 'conflict' THEN 1 WHEN 'merge' THEN 2 WHEN 'insert' THEN 3 WHEN 'skip' THEN 4 ELSE 5 END, ordinal LIMIT 50"
  ).bind(batchId).all<Record<string, unknown>>();
  return json({
    batch: batchSummary(batch),
    conflicts: conflicts.results.map((row) => ({ ...row, details: parseJsonSafe(String(row.details_json ?? "{}"), {}), details_json: undefined })),
    samples: samples.results
  });
}

async function addAppliedChange(env: Env, batchId: string, itemId: string | null, entityType: "work" | "note" | "work_label", entityId: string, details: unknown): Promise<void> {
  await env.DB.prepare("INSERT INTO import_applied_changes (id, batch_id, item_id, entity_type, entity_id, change_type, details_json, created_at) VALUES (?, ?, ?, ?, ?, 'insert', ?, ?)")
    .bind(newId(), batchId, itemId, entityType, entityId, JSON.stringify(details ?? {}), nowIso()).run();
}

async function applyLabels(env: Env, ownerId: string, batchId: string, item: ImportItemRow, workId: string): Promise<void> {
  const labels = parseJsonSafe<Record<LabelKind, string[]>>(item.labels_json, { genre: [], theme: [], tag: [] });
  for (const kind of ["genre", "theme", "tag"] as LabelKind[]) {
    for (const rawName of labels[kind] ?? []) {
      const name = rawName.trim();
      if (!name) continue;
      const normalized = normalizeText(name).slice(0, 80);
      await env.DB.prepare(
        "INSERT INTO labels (id, owner_id, kind, name, normalized_name, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(owner_id, kind, normalized_name) DO UPDATE SET name = excluded.name"
      ).bind(newId(), ownerId, kind, name.slice(0, 40), normalized, nowIso()).run();
      const label = await env.DB.prepare("SELECT id FROM labels WHERE owner_id = ? AND kind = ? AND normalized_name = ? LIMIT 1")
        .bind(ownerId, kind, normalized).first<{ id: string }>();
      if (!label) continue;
      const relation = await env.DB.prepare("SELECT 1 AS found FROM work_labels WHERE work_id = ? AND label_id = ? LIMIT 1")
        .bind(workId, label.id).first<{ found: number }>();
      if (!relation) {
        await env.DB.prepare("INSERT INTO work_labels (work_id, label_id) VALUES (?, ?)").bind(workId, label.id).run();
        await addAppliedChange(env, batchId, item.id, "work_label", `${workId}:${label.id}`, { work_id: workId, label_id: label.id });
      }
    }
  }
}

async function applyNotes(env: Env, batchId: string, item: ImportItemRow, workId: string): Promise<number> {
  const notes = await env.DB.prepare("SELECT * FROM import_notes WHERE item_id = ? AND action = 'pending' ORDER BY ordinal")
    .bind(item.id).all<ImportNoteRow>();
  let inserted = 0;
  for (const note of notes.results) {
    const duplicate = await env.DB.prepare("SELECT id FROM notes WHERE work_id = ? AND note_type = ? AND content = ? LIMIT 1")
      .bind(workId, note.note_type, note.content).first<{ id: string }>();
    if (duplicate) {
      await env.DB.prepare("UPDATE import_notes SET action = 'skip', applied_note_id = ?, updated_at = ? WHERE id = ?")
        .bind(duplicate.id, nowIso(), note.id).run();
      continue;
    }
    const noteId = newId();
    await env.DB.prepare("INSERT INTO notes (id, work_id, experience_id, note_type, content, position, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)")
      .bind(noteId, workId, note.note_type, note.content, note.position, note.source_created_at, note.source_updated_at).run();
    await env.DB.prepare("UPDATE import_notes SET action = 'applied', applied_note_id = ?, updated_at = ? WHERE id = ?")
      .bind(noteId, nowIso(), note.id).run();
    await addAppliedChange(env, batchId, item.id, "note", noteId, { work_id: workId });
    inserted += 1;
  }
  return inserted;
}

async function applyItem(env: Env, auth: AuthContext, batchId: string, item: ImportItemRow): Promise<{ workId: string; insertedWork: boolean; insertedNotes: number }> {
  let workId = item.existing_work_id;
  let insertedWork = false;
  if (item.action === "insert") {
    const sourceMatch = await env.DB.prepare("SELECT id FROM works WHERE owner_id = ? AND source_key = ? AND deleted_at IS NULL LIMIT 1")
      .bind(auth.member.id, item.source_key).first<{ id: string }>();
    const titleMatch = sourceMatch ?? await env.DB.prepare("SELECT id FROM works WHERE owner_id = ? AND type = ? AND title = ? AND deleted_at IS NULL LIMIT 1")
      .bind(auth.member.id, item.type, item.title).first<{ id: string }>();
    if (titleMatch) {
      workId = titleMatch.id;
    } else {
      workId = newId();
      const labels = parseJsonSafe<Record<LabelKind, string[]>>(item.labels_json, { genre: [], theme: [], tag: [] });
      const labelText = Object.values(labels).flat().join(" ");
      const searchText = normalizeText([item.title, item.creator ?? "", item.short_note ?? "", labelText].join(" "));
      await env.DB.prepare(
        "INSERT INTO works (id, owner_id, type, title, creator, status, rating, short_note, visibility, progress_current, progress_total, unit_label, metadata_json, search_text, source_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'private', ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(workId, auth.member.id, item.type, item.title, item.creator, item.status, item.rating, item.short_note, item.progress_current, item.progress_total, item.unit_label, item.metadata_json, searchText, item.source_key, item.source_created_at, item.source_updated_at).run();
      await addAppliedChange(env, batchId, item.id, "work", workId, { owner_id: auth.member.id });
      insertedWork = true;
    }
  }
  if (!workId) throw new HttpError(409, "IMPORT_TARGET_MISSING", "統合先の作品が見つかりません。");
  await applyLabels(env, auth.member.id, batchId, item, workId);
  const insertedNotes = await applyNotes(env, batchId, item, workId);
  await rebuildWorkSearchText(env, workId, auth.member.id);
  await env.DB.prepare("UPDATE import_items SET action = 'applied', applied_work_id = ?, updated_at = ? WHERE id = ?")
    .bind(workId, nowIso(), item.id).run();
  return { workId, insertedWork, insertedNotes };
}

export async function commitImportBatch(env: Env, auth: AuthContext, batchId: string): Promise<Response> {
  await requireImportWindow(env, auth);
  const batch = await getBatch(env, auth, batchId);
  if (!["validated", "committing"].includes(batch.status)) throw new HttpError(409, "IMPORT_NOT_VALIDATED", "検証済みの取込バッチだけを反映できます。");
  if (batch.conflict_count > 0) throw new HttpError(409, "IMPORT_HAS_CONFLICTS", "競合を解消してから反映してください。");
  await env.DB.prepare("UPDATE import_batches SET status = 'committing', error_message = NULL, updated_at = ? WHERE id = ? AND owner_id = ?")
    .bind(nowIso(), batchId, auth.member.id).run();
  const items = await env.DB.prepare("SELECT * FROM import_items WHERE batch_id = ? AND action IN ('insert','merge') ORDER BY ordinal LIMIT ?")
    .bind(batchId, COMMIT_CHUNK_LIMIT).all<ImportItemRow>();
  let insertedWorks = 0;
  let insertedNotes = 0;
  for (const item of items.results) {
    const result = await applyItem(env, auth, batchId, item);
    if (result.insertedWork) insertedWorks += 1;
    insertedNotes += result.insertedNotes;
  }
  const remaining = await env.DB.prepare("SELECT COUNT(*) AS count FROM import_items WHERE batch_id = ? AND action IN ('insert','merge')")
    .bind(batchId).first<{ count: number }>();
  const applied = await env.DB.prepare("SELECT COUNT(*) AS count FROM import_items WHERE batch_id = ? AND action = 'applied'")
    .bind(batchId).first<{ count: number }>();
  const appliedNotes = await env.DB.prepare("SELECT COUNT(*) AS count FROM import_notes WHERE batch_id = ? AND action = 'applied'")
    .bind(batchId).first<{ count: number }>();
  const done = Number(remaining?.count ?? 0) === 0;
  const now = nowIso();
  await env.DB.prepare("UPDATE import_batches SET applied_works = ?, applied_notes = ?, status = ?, committed_at = CASE WHEN ? THEN ? ELSE committed_at END, updated_at = ? WHERE id = ? AND owner_id = ?")
    .bind(Number(applied?.count ?? 0), Number(appliedNotes?.count ?? 0), done ? "committed" : "committing", done ? 1 : 0, now, now, batchId, auth.member.id).run();
  if (done) {
    await env.DB.prepare("UPDATE import_controls SET enabled_until = NULL, updated_at = ? WHERE owner_id = ?").bind(now, auth.member.id).run();
    await audit(env, "IMPORT_BATCH_COMMITTED", auth.member.id, batchId, { after: { applied_works: Number(applied?.count ?? 0), applied_notes: Number(appliedNotes?.count ?? 0) } });
  }
  return json({
    done,
    processed: items.results.length,
    inserted_works_in_chunk: insertedWorks,
    inserted_notes_in_chunk: insertedNotes,
    remaining: Number(remaining?.count ?? 0),
    batch: batchSummary(await getBatch(env, auth, batchId))
  });
}

export async function rollbackImportBatch(env: Env, auth: AuthContext, batchId: string): Promise<Response> {
  requireOwner(auth);
  const batch = await getBatch(env, auth, batchId);
  if (!["committing", "committed", "failed"].includes(batch.status)) throw new HttpError(409, "IMPORT_NOT_APPLIED", "反映中または反映済みの取込バッチだけを取り消せます。");
  const changes = await env.DB.prepare(
    "SELECT id, entity_type, entity_id, details_json FROM import_applied_changes WHERE batch_id = ? AND reversed_at IS NULL ORDER BY created_at DESC, id DESC LIMIT ?"
  ).bind(batchId, ROLLBACK_CHUNK_LIMIT).all<{ id: string; entity_type: "work" | "note" | "work_label"; entity_id: string; details_json: string }>();
  const rebuildIds = new Set<string>();
  for (const change of changes.results) {
    const details = parseJsonSafe<Record<string, string>>(change.details_json, {});
    if (change.entity_type === "note") {
      await env.DB.prepare("DELETE FROM notes WHERE id = ?").bind(change.entity_id).run();
      if (details.work_id) rebuildIds.add(details.work_id);
    } else if (change.entity_type === "work_label") {
      if (details.work_id && details.label_id) {
        await env.DB.prepare("DELETE FROM work_labels WHERE work_id = ? AND label_id = ?").bind(details.work_id, details.label_id).run();
        rebuildIds.add(details.work_id);
      }
    } else if (change.entity_type === "work") {
      const now = nowIso();
      await env.DB.prepare("UPDATE works SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND owner_id = ? AND deleted_at IS NULL")
        .bind(now, now, change.entity_id, auth.member.id).run();
    }
    await env.DB.prepare("UPDATE import_applied_changes SET reversed_at = ? WHERE id = ?").bind(nowIso(), change.id).run();
  }
  for (const workId of rebuildIds) await rebuildWorkSearchText(env, workId, auth.member.id);
  const remaining = await env.DB.prepare("SELECT COUNT(*) AS count FROM import_applied_changes WHERE batch_id = ? AND reversed_at IS NULL")
    .bind(batchId).first<{ count: number }>();
  const done = Number(remaining?.count ?? 0) === 0;
  if (done) {
    const now = nowIso();
    await env.DB.prepare("UPDATE import_items SET action = 'rolled_back', updated_at = ? WHERE batch_id = ? AND action = 'applied'").bind(now, batchId).run();
    await env.DB.prepare("UPDATE import_notes SET action = 'rolled_back', updated_at = ? WHERE batch_id = ? AND action = 'applied'").bind(now, batchId).run();
    await env.DB.prepare("UPDATE import_batches SET status = 'rolled_back', rolled_back_at = ?, updated_at = ? WHERE id = ? AND owner_id = ?")
      .bind(now, now, batchId, auth.member.id).run();
    await audit(env, "IMPORT_BATCH_ROLLED_BACK", auth.member.id, batchId);
  }
  return json({ done, processed: changes.results.length, remaining: Number(remaining?.count ?? 0), batch: batchSummary(await getBatch(env, auth, batchId)) });
}

export async function deleteImportBatch(env: Env, auth: AuthContext, batchId: string): Promise<Response> {
  requireOwner(auth);
  const batch = await getBatch(env, auth, batchId);
  if (["committing", "committed"].includes(batch.status)) throw new HttpError(409, "IMPORT_BATCH_PROTECTED", "反映中・反映済みの取込バッチは、先に取り消してください。");
  await env.DB.prepare("DELETE FROM import_batches WHERE id = ? AND owner_id = ?").bind(batchId, auth.member.id).run();
  await audit(env, "IMPORT_BATCH_DELETED", auth.member.id, batchId, { before: { status: batch.status, content_hash: batch.content_hash } });
  return json({ ok: true });
}
