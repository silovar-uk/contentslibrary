import { newId, nowIso } from "../db";
import { HttpError, json, parseJson } from "../http";
import type { AuthContext, Env } from "../types";

const SLOT_VALUES = new Set(["priority", "remember", "wildcard"]);
const MAX_SYNC = 30;

type DecisionInput = {
  client_event_id?: unknown;
  work_id?: unknown;
  title?: unknown;
  creator?: unknown;
  slot?: unknown;
  reason?: unknown;
  scope?: unknown;
  decided_at?: unknown;
};

function requireEditor(auth: AuthContext): void {
  if (!["owner", "admin", "member"].includes(auth.member.role)) {
    throw new HttpError(403, "FORBIDDEN", "編集権限がありません。");
  }
}

function textField(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

function dateField(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function clientKey(input: DecisionInput, workId: string, slot: string, decidedAt: string): string {
  const explicit = textField(input.client_event_id, 220);
  return explicit || `dm:${workId}:${slot}:${decidedAt}`;
}

async function listDecisionRows(env: Env, ownerId: string) {
  const rows = await env.DB.prepare(
    `SELECT client_key AS client_event_id, work_id, title_snapshot AS title,
      creator_snapshot AS creator, slot, reason, scope, decided_at
     FROM decision_events
     WHERE owner_id = ?
     ORDER BY decided_at DESC, created_at DESC
     LIMIT 30`
  ).bind(ownerId).all<Record<string, unknown>>();
  return rows.results;
}

export async function listDecisions(env: Env, auth: AuthContext): Promise<Response> {
  return json({ decisions: await listDecisionRows(env, auth.member.id) });
}

export async function syncDecisions(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  requireEditor(auth);
  const payload = await parseJson<{ decisions?: unknown }>(request);
  const decisions = Array.isArray(payload.decisions) ? payload.decisions.slice(0, MAX_SYNC) as DecisionInput[] : [];

  const normalized = decisions.map((input) => {
    const workId = textField(input.work_id, 120);
    const slot = textField(input.slot, 20);
    const decidedAt = dateField(input.decided_at);
    if (!workId || !SLOT_VALUES.has(slot) || !decidedAt) return null;
    return {
      input,
      workId,
      slot,
      decidedAt,
      reason: textField(input.reason, 240),
      scope: textField(input.scope, 80) || "next"
    };
  }).filter(Boolean) as Array<{
    input: DecisionInput;
    workId: string;
    slot: string;
    decidedAt: string;
    reason: string;
    scope: string;
  }>;

  if (normalized.length) {
    const ids = Array.from(new Set(normalized.map((item) => item.workId)));
    const placeholders = ids.map(() => "?").join(",");
    const owned = await env.DB.prepare(
      `SELECT id, title, creator FROM works WHERE owner_id = ? AND id IN (${placeholders})`
    ).bind(auth.member.id, ...ids).all<{ id: string; title: string; creator: string | null }>();
    const works = new Map(owned.results.map((work) => [String(work.id), work]));
    const createdAt = nowIso();
    const statements = normalized.flatMap((item) => {
      const work = works.get(item.workId);
      if (!work) return [];
      const titleSnapshot = textField(item.input.title, 300) || work.title;
      const creatorSnapshot = textField(item.input.creator, 240) || work.creator || "";
      return [env.DB.prepare(
        `INSERT OR IGNORE INTO decision_events
          (id, owner_id, client_key, work_id, title_snapshot, creator_snapshot, slot, reason, scope, decided_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        newId(),
        auth.member.id,
        clientKey(item.input, item.workId, item.slot, item.decidedAt),
        item.workId,
        titleSnapshot,
        creatorSnapshot || null,
        item.slot,
        item.reason || null,
        item.scope,
        item.decidedAt,
        createdAt
      )];
    });
    if (statements.length) await env.DB.batch(statements);
  }

  return json({ decisions: await listDecisionRows(env, auth.member.id) });
}
