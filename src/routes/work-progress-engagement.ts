import { nowIso } from "../db";
import type { AuthContext, Env } from "../types";
import { getWork, updateWork } from "./works";

type ProgressPayload = {
  progress_current?: unknown;
  progress_total?: unknown;
};

function progressValue(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function progressFieldChanged(payload: ProgressPayload, current: Record<string, unknown>): boolean {
  if (payload.progress_current !== undefined) {
    const before = progressValue(current.progress_current);
    const after = progressValue(payload.progress_current);
    if (before !== after) return true;
  }
  if (payload.progress_total !== undefined) {
    const before = progressValue(current.progress_total);
    const after = progressValue(payload.progress_total);
    if (before !== after) return true;
  }
  return false;
}

export async function updateWorkWithProgressEngagement(
  request: Request,
  env: Env,
  auth: AuthContext,
  workId: string
): Promise<Response> {
  let payload: ProgressPayload;
  try {
    payload = await request.clone().json<ProgressPayload>();
  } catch {
    return updateWork(request, env, auth, workId);
  }

  const includesProgress = payload.progress_current !== undefined || payload.progress_total !== undefined;
  if (!includesProgress) return updateWork(request, env, auth, workId);

  const current = await env.DB.prepare(
    "SELECT progress_current, progress_total FROM works WHERE id = ? AND owner_id = ? AND deleted_at IS NULL"
  ).bind(workId, auth.member.id).first<Record<string, unknown>>();

  const changed = current ? progressFieldChanged(payload, current) : false;
  const response = await updateWork(request, env, auth, workId);
  if (!changed) return response;

  try {
    await env.DB.prepare(
      "UPDATE works SET progress_engagement_at = ? WHERE id = ? AND owner_id = ? AND deleted_at IS NULL"
    ).bind(nowIso(), workId, auth.member.id).run();
    return getWork(env, auth, workId);
  } catch {
    // 進捗本体の保存後に補助シグナルの記録だけが失敗しても、保存済み操作をエラー扱いにしない。
    return response;
  }
}
