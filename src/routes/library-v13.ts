import { normalizeText } from "../db";
import { json } from "../http";
import type { AuthContext, Env, LabelKind, WorkStatus, WorkType } from "../types";

const WORK_TYPES: WorkType[] = ["book", "manga", "movie", "anime", "drama", "other"];
const WORK_STATUSES: WorkStatus[] = ["want", "owned_unread", "active", "completed", "paused", "dropped"];
const NOTE_TYPES = ["quick", "summary", "impression", "quote", "idea", "connection", "progress"] as const;

function likeTerm(value: string): string {
  return `%${value.replace(/[%_]/g, " ")}%`;
}

function parseJsonSafe<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
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

export async function listWorksV13(request: Request, env: Env, auth: AuthContext): Promise<Response> {
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

  const ratingExact = url.searchParams.get("rating_exact");
  if (ratingExact === "unrated") clauses.push("w.rating IS NULL");
  else if (ratingExact && /^[1-5]$/.test(ratingExact)) { clauses.push("CAST(w.rating AS INTEGER) = ?"); params.push(Number(ratingExact)); }
  else {
    const ratingMin = Number(url.searchParams.get("rating_min"));
    if (Number.isFinite(ratingMin) && ratingMin > 0) { clauses.push("w.rating >= ?"); params.push(ratingMin); }
  }

  const favorite = url.searchParams.get("favorite");
  if (favorite === "true") clauses.push("COALESCE(json_extract(w.metadata_json, '$.favorite'), 0) = 1");
  if (favorite === "false") clauses.push("COALESCE(json_extract(w.metadata_json, '$.favorite'), 0) = 0");

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
  const favoriteSql = "COALESCE(json_extract(w.metadata_json, '$.favorite'), 0)";
  const sortMap: Record<string, string> = {
    updated_desc: "w.updated_at DESC",
    title_asc: "w.title COLLATE NOCASE ASC",
    rating_desc: "w.rating IS NULL, w.rating DESC, w.updated_at DESC",
    rating_asc: "w.rating IS NULL, w.rating ASC, w.updated_at DESC",
    favorite_first: `${favoriteSql} DESC, w.rating IS NULL, w.rating DESC, w.updated_at DESC`,
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
