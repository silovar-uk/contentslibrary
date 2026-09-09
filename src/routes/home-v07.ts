import { getLabelsForWorks } from "../db";
import { json } from "../http";
import type { AuthContext, Env } from "../types";

type ResumeSource = "note" | "experience" | "progress" | "work_update";

const RESCUE_AFTER_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

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

function rescueCutoffIso(now = Date.now()): string {
  return new Date(now - RESCUE_AFTER_DAYS * DAY_MS).toISOString();
}

function resumeTiming(row: Record<string, unknown>): {
  engagement_at: string | null;
  resume_at: string | null;
  resume_source: ResumeSource | null;
} {
  const noteAt = timestampValue(row.resume_note_at);
  const experienceAt = timestampValue(row.resume_experience_at);
  const progressAt = timestampValue(row.progress_engagement_at);
  const workAt = timestampValue(row.updated_at);
  const engagementAt = newestTimestamp(noteAt, experienceAt, progressAt);
  const resumeAt = newestTimestamp(workAt, engagementAt);

  let resumeSource: ResumeSource | null = null;
  if (resumeAt) {
    if (noteAt === resumeAt) resumeSource = "note";
    else if (experienceAt === resumeAt) resumeSource = "experience";
    else if (progressAt === resumeAt) resumeSource = "progress";
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

export async function getHomeRescue(env: Env, auth: AuthContext): Promise<Response> {
  const owner = auth.member.id;
  const cutoff = rescueCutoffIso();
  const candidate = await env.DB.prepare(
    `WITH recent_active AS (
      SELECT id
      FROM works
      WHERE owner_id = ? AND deleted_at IS NULL AND status = 'active'
      ORDER BY updated_at DESC
      LIMIT 8
    ), rescue_base AS (
      SELECT w.id, w.title, w.creator, w.short_note, w.updated_at, w.progress_engagement_at,
        (SELECT n.content FROM notes n WHERE n.work_id = w.id ORDER BY n.updated_at DESC LIMIT 1) AS resume_note,
        (SELECT n.updated_at FROM notes n WHERE n.work_id = w.id ORDER BY n.updated_at DESC LIMIT 1) AS resume_note_at,
        (SELECT e.updated_at FROM experiences e WHERE e.work_id = w.id ORDER BY e.updated_at DESC LIMIT 1) AS resume_experience_at
      FROM works w
      WHERE w.owner_id = ?
        AND w.deleted_at IS NULL
        AND w.status = 'active'
        AND w.id NOT IN (SELECT id FROM recent_active)
        AND w.updated_at <= ?
    ), rescue_candidates AS (
      SELECT *,
        NULLIF(MAX(
          COALESCE(resume_note_at, ''),
          COALESCE(resume_experience_at, ''),
          COALESCE(progress_engagement_at, '')
        ), '') AS rescue_engagement_at
      FROM rescue_base
    )
    SELECT *
    FROM rescue_candidates
    WHERE rescue_engagement_at IS NOT NULL
      AND rescue_engagement_at <= ?
    ORDER BY rescue_engagement_at DESC, updated_at DESC
    LIMIT 1`
  ).bind(owner, owner, cutoff, cutoff).first<Record<string, unknown>>();

  if (!candidate) return json({ rescue: null });
  return json({
    rescue: {
      id: candidate.id,
      title: candidate.title,
      creator: candidate.creator,
      short_note: candidate.short_note,
      resume_note: candidate.resume_note,
      ...resumeTiming(candidate)
    }
  });
}
