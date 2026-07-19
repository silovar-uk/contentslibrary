import { getLabelsForWorks } from "../db";
import { json } from "../http";
import type { AuthContext, Env } from "../types";

function parseJsonSafe<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

async function attachLabels(env: Env, rows: Array<Record<string, unknown>>) {
  const ids = rows.map((row) => String(row.id));
  const labels = await getLabelsForWorks(env, ids);
  return rows.map((row) => ({
    ...row,
    metadata: parseJsonSafe(String(row.metadata_json ?? "{}"), {}),
    labels: labels.get(String(row.id)) ?? { genre: [], theme: [], tag: [] },
    metadata_json: undefined
  }));
}

export async function getHomeV07(env: Env, auth: AuthContext): Promise<Response> {
  const owner = auth.member.id;
  const active = await env.DB.prepare(
    "SELECT * FROM works WHERE owner_id = ? AND deleted_at IS NULL AND status = 'active' ORDER BY updated_at DESC LIMIT 8"
  ).bind(owner).all<Record<string, unknown>>();
  const recentOther = await env.DB.prepare(
    "SELECT * FROM works WHERE owner_id = ? AND deleted_at IS NULL AND status <> 'active' ORDER BY updated_at DESC LIMIT 8"
  ).bind(owner).all<Record<string, unknown>>();
  const recentNotes = await env.DB.prepare(
    "SELECT n.id, n.note_type, n.content, n.updated_at, w.id AS work_id, w.title, w.type FROM notes n JOIN works w ON w.id = n.work_id WHERE w.owner_id = ? AND w.deleted_at IS NULL ORDER BY n.updated_at DESC LIMIT 8"
  ).bind(owner).all<Record<string, unknown>>();
  const stats = await env.DB.prepare(
    "SELECT COUNT(*) AS total, SUM(CASE WHEN type = 'book' AND status = 'completed' THEN 1 ELSE 0 END) AS completed_books, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_count, SUM(CASE WHEN status IN ('paused','dropped') THEN 1 ELSE 0 END) AS stopped_count FROM works WHERE owner_id = ? AND deleted_at IS NULL"
  ).bind(owner).first<Record<string, unknown>>();
  const security = ["owner", "admin"].includes(auth.member.role)
    ? await env.DB.prepare("SELECT COUNT(*) AS count FROM security_events WHERE resolved_status = 'open' AND risk IN ('critical','high')").first<{ count: number }>()
    : { count: 0 };

  return json({
    reading: await attachLabels(env, active.results),
    recentOther: await attachLabels(env, recentOther.results),
    recentNotes: recentNotes.results,
    stats: stats ?? {},
    openSecurityCount: security?.count ?? 0
  });
}
