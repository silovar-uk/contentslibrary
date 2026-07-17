import { audit, newId, normalizeText, nowIso } from "../db";
import { HttpError, json, parseJson } from "../http";
import type { AuthContext, Env, LabelKind, WorkStatus, WorkType } from "../types";

const WORK_TYPES: WorkType[] = ["book", "manga", "movie", "anime", "drama", "other"];
const WORK_STATUSES: WorkStatus[] = ["want", "active", "completed", "paused", "dropped"];
const SORTS = ["updated_desc", "title_asc", "rating_desc", "created_desc"] as const;
const NOTE_TYPES = ["quick", "summary", "impression", "quote", "idea", "connection", "progress"] as const;
const FILTER_KEYS = ["q", "type", "status", "rating_min", "label", "has_notes", "note_type", "experience", "sort"] as const;

type SavedQuery = Partial<Record<(typeof FILTER_KEYS)[number], string | boolean>>;

function likeTerm(value: string): string {
  return `%${value.replace(/[%_]/g, " ")}%`;
}

function parseJsonSafe<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function cleanText(value: unknown, name: string, max: number, required = false): string | null {
  if (value === undefined || value === null) {
    if (required) throw new HttpError(422, "VALIDATION_ERROR", `${name}は必須です。`, { field: name });
    return null;
  }
  if (typeof value !== "string") throw new HttpError(422, "VALIDATION_ERROR", `${name}の形式が正しくありません。`, { field: name });
  const text = value.trim();
  if (required && !text) throw new HttpError(422, "VALIDATION_ERROR", `${name}は必須です。`, { field: name });
  if (text.length > max) throw new HttpError(422, "VALIDATION_ERROR", `${name}は${max}文字以内で入力してください。`, { field: name });
  return text || null;
}

function boolValue(value: unknown): boolean {
  return value === true || value === "true" || value === 1;
}

function sanitizeSavedQuery(value: unknown): SavedQuery {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new HttpError(422, "VALIDATION_ERROR", "検索条件の形式が正しくありません。", { field: "query" });
  const input = value as Record<string, unknown>;
  const result: SavedQuery = {};

  const q = cleanText(input.q, "検索語", 200);
  if (q) result.q = q;
  const label = cleanText(input.label, "分類", 200);
  if (label) result.label = label;

  if (typeof input.type === "string" && WORK_TYPES.includes(input.type as WorkType)) result.type = input.type;
  if (typeof input.status === "string" && WORK_STATUSES.includes(input.status as WorkStatus)) result.status = input.status;
  if (input.rating_min !== undefined && input.rating_min !== "") {
    const rating = Number(input.rating_min);
    if (!Number.isFinite(rating) || rating < 0.5 || rating > 5) throw new HttpError(422, "VALIDATION_ERROR", "評価条件が正しくありません。", { field: "query.rating_min" });
    result.rating_min = String(rating);
  }
  if (boolValue(input.has_notes)) result.has_notes = true;
  if (typeof input.note_type === "string" && NOTE_TYPES.includes(input.note_type as typeof NOTE_TYPES[number])) result.note_type = input.note_type;
  if (input.experience === "recorded" || input.experience === "repeat") result.experience = input.experience;
  if (typeof input.sort === "string" && SORTS.includes(input.sort as typeof SORTS[number]) && input.sort !== "updated_desc") result.sort = input.sort;
  return result;
}

async function attachLabels(env: Env, rows: Array<Record<string, unknown>>) {
  const ids = rows.map((row) => String(row.id));
  const map = new Map<string, Record<LabelKind, string[]>>();
  for (const id of ids) map.set(id, { genre: [], theme: [], tag: [] });
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    const result = await env.DB.prepare(
      `SELECT wl.work_id, l.kind, l.name FROM work_labels wl JOIN labels l ON l.id = wl.label_id WHERE wl.work_id IN (${placeholders}) ORDER BY l.kind, l.name`
    ).bind(...ids).all<{ work_id: string; kind: LabelKind; name: string }>();
    for (const label of result.results) map.get(label.work_id)?.[label.kind].push(label.name);
  }
  return rows.map((row) => ({
    ...row,
    metadata: parseJsonSafe(String(row.metadata_json ?? "{}"), {}),
    labels: map.get(String(row.id)) ?? { genre: [], theme: [], tag: [] },
    metadata_json: undefined
  }));
}

export async function listWorksV03(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  const url = new URL(request.url);
  const clauses = ["w.owner_id = ?", "w.deleted_at IS NULL"];
  const params: unknown[] = [auth.member.id];

  const rawQuery = normalizeText(url.searchParams.get("q") || "");
  const tokens = Array.from(new Set(rawQuery.split(" ").filter(Boolean))).slice(0, 8);
  for (const token of tokens) {
    clauses.push("w.search_text LIKE ?");
    params.push(likeTerm(token));
  }

  const type = url.searchParams.get("type");
  if (type && WORK_TYPES.includes(type as WorkType)) { clauses.push("w.type = ?"); params.push(type); }
  const status = url.searchParams.get("status");
  if (status && WORK_STATUSES.includes(status as WorkStatus)) { clauses.push("w.status = ?"); params.push(status); }

  const ratingMin = Number(url.searchParams.get("rating_min"));
  if (Number.isFinite(ratingMin) && ratingMin > 0) { clauses.push("w.rating >= ?"); params.push(ratingMin); }

  const labelTerms = Array.from(new Set((url.searchParams.get("label") || "")
    .split(/[、,]/).map((term) => normalizeText(term)).filter(Boolean))).slice(0, 8);
  for (const term of labelTerms) {
    clauses.push("EXISTS (SELECT 1 FROM work_labels wl JOIN labels l ON l.id = wl.label_id WHERE wl.work_id = w.id AND l.normalized_name LIKE ?)");
    params.push(likeTerm(term));
  }

  if (url.searchParams.get("has_notes") === "true") clauses.push("EXISTS (SELECT 1 FROM notes n WHERE n.work_id = w.id)");
  const noteType = url.searchParams.get("note_type");
  if (noteType && NOTE_TYPES.includes(noteType as typeof NOTE_TYPES[number])) {
    clauses.push("EXISTS (SELECT 1 FROM notes n WHERE n.work_id = w.id AND n.note_type = ?)");
    params.push(noteType);
  }
  const experience = url.searchParams.get("experience");
  if (experience === "recorded") clauses.push("EXISTS (SELECT 1 FROM experiences e WHERE e.work_id = w.id)");
  if (experience === "repeat") clauses.push("(SELECT COUNT(*) FROM experiences e WHERE e.work_id = w.id) >= 2");

  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "30", 10) || 30));
  const offset = (page - 1) * limit;
  const sortMap: Record<string, string> = {
    updated_desc: "w.updated_at DESC",
    title_asc: "w.title COLLATE NOCASE ASC",
    rating_desc: "w.rating IS NULL, w.rating DESC, w.updated_at DESC",
    created_desc: "w.created_at DESC"
  };
  const sort = sortMap[url.searchParams.get("sort") || "updated_desc"] || sortMap.updated_desc;
  const where = clauses.join(" AND ");
  const [count, rows] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS count FROM works w WHERE ${where}`).bind(...params).first<{ count: number }>(),
    env.DB.prepare(`SELECT w.* FROM works w WHERE ${where} ORDER BY ${sort} LIMIT ? OFFSET ?`).bind(...params, limit + 1, offset).all<Record<string, unknown>>()
  ]);
  const hasMore = rows.results.length > limit;
  const items = rows.results.slice(0, limit);
  return json({ items: await attachLabels(env, items), page, limit, hasMore, total: count?.count ?? 0, query_tokens: tokens });
}

export async function listLabelSuggestions(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  const url = new URL(request.url);
  const params: unknown[] = [auth.member.id];
  const clauses = ["l.owner_id = ?"];
  const kind = url.searchParams.get("kind");
  if (kind && ["genre", "theme", "tag"].includes(kind)) { clauses.push("l.kind = ?"); params.push(kind); }
  const q = normalizeText(url.searchParams.get("q") || "");
  if (q) { clauses.push("l.normalized_name LIKE ?"); params.push(likeTerm(q)); }
  const limit = Math.min(50, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "20", 10) || 20));
  const result = await env.DB.prepare(
    `SELECT l.id, l.kind, l.name, COUNT(wl.work_id) AS usage_count FROM labels l LEFT JOIN work_labels wl ON wl.label_id = l.id WHERE ${clauses.join(" AND ")} GROUP BY l.id, l.kind, l.name ORDER BY usage_count DESC, l.name COLLATE NOCASE ASC LIMIT ?`
  ).bind(...params, limit).all();
  return json({ items: result.results });
}

export async function listSavedViews(env: Env, auth: AuthContext): Promise<Response> {
  const result = await env.DB.prepare("SELECT * FROM saved_views WHERE owner_id = ? ORDER BY is_default DESC, updated_at DESC")
    .bind(auth.member.id).all<Record<string, unknown>>();
  return json({ items: result.results.map((row) => ({ ...row, query: parseJsonSafe(String(row.query_json), {}), query_json: undefined })) });
}

export async function createSavedView(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  const payload = await parseJson<Record<string, unknown>>(request);
  const name = cleanText(payload.name, "ビュー名", 40, true)!;
  const query = sanitizeSavedQuery(payload.query);
  const isDefault = boolValue(payload.is_default);
  const id = newId();
  const now = nowIso();
  const statements = [];
  if (isDefault) statements.push(env.DB.prepare("UPDATE saved_views SET is_default = 0, updated_at = ? WHERE owner_id = ?").bind(now, auth.member.id));
  statements.push(env.DB.prepare("INSERT INTO saved_views (id, owner_id, name, query_json, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, auth.member.id, name, JSON.stringify(query), isDefault ? 1 : 0, now, now));
  try { await env.DB.batch(statements); }
  catch (error) {
    if (String(error).includes("UNIQUE")) throw new HttpError(409, "DUPLICATE_NAME", "同じ名前の保存ビューがあります。", { field: "name" });
    throw error;
  }
  await audit(env, "SAVED_VIEW_CREATED", auth.member.id, id, { after: { name, query, is_default: isDefault } });
  return json({ id, name, query, is_default: isDefault, created_at: now, updated_at: now }, 201);
}

export async function updateSavedView(request: Request, env: Env, auth: AuthContext, id: string): Promise<Response> {
  const current = await env.DB.prepare("SELECT * FROM saved_views WHERE id = ? AND owner_id = ?").bind(id, auth.member.id).first<Record<string, unknown>>();
  if (!current) throw new HttpError(404, "NOT_FOUND", "保存ビューが見つかりません。");
  const payload = await parseJson<Record<string, unknown>>(request);
  const name = payload.name === undefined ? String(current.name) : cleanText(payload.name, "ビュー名", 40, true)!;
  const query = payload.query === undefined ? parseJsonSafe(String(current.query_json), {}) : sanitizeSavedQuery(payload.query);
  const isDefault = payload.is_default === undefined ? Number(current.is_default) === 1 : boolValue(payload.is_default);
  const now = nowIso();
  const statements = [];
  if (isDefault) statements.push(env.DB.prepare("UPDATE saved_views SET is_default = 0, updated_at = ? WHERE owner_id = ?").bind(now, auth.member.id));
  statements.push(env.DB.prepare("UPDATE saved_views SET name = ?, query_json = ?, is_default = ?, updated_at = ? WHERE id = ? AND owner_id = ?")
    .bind(name, JSON.stringify(query), isDefault ? 1 : 0, now, id, auth.member.id));
  try { await env.DB.batch(statements); }
  catch (error) {
    if (String(error).includes("UNIQUE")) throw new HttpError(409, "DUPLICATE_NAME", "同じ名前の保存ビューがあります。", { field: "name" });
    throw error;
  }
  await audit(env, "SAVED_VIEW_UPDATED", auth.member.id, id, { before: { name: current.name }, after: { name, query, is_default: isDefault } });
  return json({ id, name, query, is_default: isDefault, updated_at: now });
}

export async function deleteSavedView(env: Env, auth: AuthContext, id: string): Promise<Response> {
  const result = await env.DB.prepare("DELETE FROM saved_views WHERE id = ? AND owner_id = ?").bind(id, auth.member.id).run();
  if ((result.meta.changes ?? 0) === 0) throw new HttpError(404, "NOT_FOUND", "保存ビューが見つかりません。");
  await audit(env, "SAVED_VIEW_DELETED", auth.member.id, id);
  return json({ ok: true });
}
