import { getLabelsForWorks } from "../db";
import { HttpError, json } from "../http";
import type { AuthContext, Env, WorkStatus } from "../types";

const STATUSES: WorkStatus[] = ["want", "owned_unread", "active", "completed", "paused", "dropped"];

function parseMetadata(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function getRandomWorkV14(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") || "next";
  const clauses = ["w.owner_id = ?", "w.deleted_at IS NULL"];
  const params: unknown[] = [auth.member.id];

  if (scope === "next") {
    clauses.push("w.type = 'book'", "w.status IN ('owned_unread','want')");
  } else if (scope === "owned_unread") {
    clauses.push("w.type = 'book'", "w.status = 'owned_unread'");
  } else if (scope === "want") {
    clauses.push("w.type = 'book'", "w.status = 'want'");
  } else if (scope === "book") {
    clauses.push("w.type = 'book'");
  } else if (scope !== "all") {
    throw new HttpError(422, "VALIDATION_ERROR", "ランダム抽選の対象が正しくありません。");
  }

  const status = url.searchParams.get("status");
  if (status && STATUSES.includes(status as WorkStatus)) {
    clauses.push("w.status = ?");
    params.push(status);
  }

  const excludes = Array.from(new Set((url.searchParams.get("exclude") || "")
    .split(",").map((value) => value.trim()).filter(Boolean))).slice(0, 20);
  if (excludes.length) {
    clauses.push(`w.id NOT IN (${excludes.map(() => "?").join(",")})`);
    params.push(...excludes);
  }

  const work = await env.DB.prepare(
    `SELECT w.* FROM works w WHERE ${clauses.join(" AND ")} ORDER BY RANDOM() LIMIT 1`
  ).bind(...params).first<Record<string, unknown>>();

  if (!work) return json({ item: null, scope });
  const id = String(work.id);
  const labels = await getLabelsForWorks(env, [id]);
  return json({
    item: {
      ...work,
      metadata: parseMetadata(work.metadata_json),
      metadata_json: undefined,
      labels: labels.get(id) ?? { genre: [], theme: [], tag: [] }
    },
    scope
  });
}
