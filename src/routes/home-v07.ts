import { getLabelsForWorks } from "../db";
import { json } from "../http";
import type { AuthContext, Env } from "../types";

type ResumeSource = "note" | "experience" | "work_update";

function parseJsonSafe<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function timestampValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function newestTimestamp(...values: unknown[]): string | null {
  const timestamps = values.map(timestampValue).filter((value): value is string => Boolean(value));
  return timestamps.sort().at(-1) ?? null;
}

function resumeTiming(row: Record<string, unknown>): {
  engagement_at: string | null;
  resume_at: string | null;
  resume_source: ResumeSource | null;
} {
  const noteAt = timestampValue(row.resume_note_at);
  const experienceAt = timestampValue(row.resume_experience_at);
  const workAt = timestampValue(row.updated_at);
  const engagementAt = newestTimestamp(noteAt, experienceAt);
  const resumeAt = newestTimestamp(workAt, engagementAt);

  let resumeSource: ResumeSource | null = null;
  if (resumeAt) {
    if (noteAt === resumeAt) resumeSource = "note";
    else if (experienceAt === resumeAt) resumeSource = "experience";
    else resumeSource = "work_update";
  }

  return {
    engagement_at: engagementAt,
    resume_at: resumeAt,
    resume_source: resumeSource
  };
}

async function attachLabels(env: Env, rows: Array<Record<string, unknown>>) {
  const ids = rows.map((row) => String(row.id));
  const labels = await getLabelsForWorks(env, ids);
  return rows.map((row) => ({
    ...row,
    metadata: parseJsonSafe(String(row.metadata_json ?? "{}"), {}),
    labels: labels.get(String(row.id)) ?? { genre: [], theme: [], tag: [] },
    ...resumeTiming(row),
    metadata_json: undefined,
    resume_note_at: undefined,
    resume_experience_at: undefined
  }));
}

export async function getHomeV07(env: Env, auth: AuthContext): Promise<Response> {
  const owner = auth.member.id;
  const active = await env.DB.prepare(
    `SELECT w.*,
      (SELECT n.content FROM notes n WHERE n.work_id = w.id ORDER BY n.updated_at DESC LIMIT 1) AS resume_note,
      (SELECT n.updated_at FROM notes n WHERE n.work_id = w.id ORDER BY n.updated_at DESC LIMIT 1) AS resume_note_at,
      (SELECT e.updated_at FROM experiences e WHERE e.work_id = w.id ORDER BY e.updated_at DESC LIMIT 1) AS resume_experience_at
    FROM works w
    WHERE w.owner_id = ? AND w.deleted_at IS NULL AND w.status = 'active'
    ORDER BY w.updated_at DESC
    LIMIT 8`
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
