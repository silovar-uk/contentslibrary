import { HttpError } from "./http";
import type { AuthContext, Env } from "./types";

function numberOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function validateProgress(current: number | null, total: number | null): void {
  if (current !== null && current < 0) {
    throw new HttpError(422, "VALIDATION_ERROR", "現在の進捗は0以上で入力してください。", { field: "progress_current" });
  }
  if (total !== null && total < 0) {
    throw new HttpError(422, "VALIDATION_ERROR", "全体の進捗は0以上で入力してください。", { field: "progress_total" });
  }
  if (current !== null && total !== null && current > total) {
    throw new HttpError(422, "VALIDATION_ERROR", "現在の進捗は全体以下にしてください。", { field: "progress_current" });
  }
}

export async function assertProgressMutation(request: Request, env: Env, auth: AuthContext): Promise<void> {
  if (!["POST", "PATCH"].includes(request.method)) return;
  const path = new URL(request.url).pathname;
  const isCreate = request.method === "POST" && path === "/api/works";
  const workMatch = request.method === "PATCH" ? path.match(/^\/api\/works\/([^/]+)$/) : null;
  const isExperience = request.method === "POST" && /^\/api\/works\/[^/]+\/experiences$/.test(path);
  if (!isCreate && !workMatch && !isExperience) return;

  let payload: Record<string, unknown>;
  try {
    payload = await request.clone().json<Record<string, unknown>>();
  } catch {
    return;
  }

  let current = numberOrNull(payload.progress_current);
  let total = numberOrNull(payload.progress_total);

  if (workMatch && (payload.progress_current === undefined || payload.progress_total === undefined)) {
    const workId = decodeURIComponent(workMatch[1]!);
    const existing = await env.DB.prepare(
      "SELECT progress_current, progress_total FROM works WHERE id = ? AND owner_id = ? AND deleted_at IS NULL"
    ).bind(workId, auth.member.id).first<{ progress_current: number | null; progress_total: number | null }>();
    if (existing) {
      if (payload.progress_current === undefined) current = existing.progress_current;
      if (payload.progress_total === undefined) total = existing.progress_total;
    }
  }

  validateProgress(current, total);
}
