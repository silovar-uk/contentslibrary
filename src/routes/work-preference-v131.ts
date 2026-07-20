import { newId, nowIso } from "../db";
import { HttpError, parseJson } from "../http";
import type { AuthContext, Env } from "../types";
import { getWork } from "./works";

type JsonObject = Record<string, unknown>;
type WorkRow = Record<string, unknown> & { version: number; metadata_json: string | null };

interface PreferencePayload {
  version?: unknown;
  favorite?: unknown;
  rating?: unknown;
}

function requireEditor(auth: AuthContext): void {
  if (!["owner", "admin", "member"].includes(auth.member.role)) {
    throw new HttpError(403, "FORBIDDEN", "編集権限がありません。");
  }
}

function parseJsonSafe(value: string | null): JsonObject {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as JsonObject : {};
  } catch {
    return {};
  }
}

function versionField(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new HttpError(422, "VALIDATION_ERROR", "更新バージョンが必要です。");
  }
  return number;
}

function ratingField(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 5) {
    throw new HttpError(422, "VALIDATION_ERROR", "評価は1〜5の5段階で入力してください。");
  }
  return number;
}

export async function updateWorkPreferenceV131(request: Request, env: Env, auth: AuthContext, workId: string): Promise<Response> {
  requireEditor(auth);
  const current = await env.DB.prepare(
    "SELECT * FROM works WHERE id = ? AND owner_id = ? AND deleted_at IS NULL LIMIT 1"
  ).bind(workId, auth.member.id).first<WorkRow>();
  if (!current) throw new HttpError(404, "NOT_FOUND", "作品が見つかりません。");

  const payload = await parseJson<PreferencePayload>(request);
  const version = versionField(payload.version);
  if (payload.favorite === undefined && payload.rating === undefined) {
    throw new HttpError(422, "VALIDATION_ERROR", "お気に入りまたは評価を指定してください。");
  }
  if (payload.favorite !== undefined && typeof payload.favorite !== "boolean") {
    throw new HttpError(422, "VALIDATION_ERROR", "お気に入りの形式が正しくありません。");
  }
  const rating = ratingField(payload.rating);
  const metadata = parseJsonSafe(current.metadata_json);
  const previousFavorite = metadata.favorite === true;
  const previousRating = current.rating ?? null;
  if (payload.favorite !== undefined) metadata.favorite = payload.favorite;
  const nextRating = rating === undefined ? previousRating : rating;
  const nextFavorite = metadata.favorite === true;
  const serialized = JSON.stringify(metadata);
  if (serialized.length > 100_000) throw new HttpError(422, "VALIDATION_ERROR", "作品情報が大きすぎます。");

  const now = nowIso();
  const result = await env.DB.prepare(
    "UPDATE works SET rating = ?, metadata_json = ?, version = version + 1, updated_at = ? WHERE id = ? AND owner_id = ? AND version = ? AND deleted_at IS NULL"
  ).bind(nextRating, serialized, now, workId, auth.member.id, version).run();
  if ((result.meta.changes ?? 0) === 0) {
    throw new HttpError(409, "CONFLICT", "別の画面で更新されています。作品を開き直してください。");
  }

  await env.DB.prepare(
    "INSERT INTO audit_events (id, actor_id, target_id, action, before_json, after_json, created_at) VALUES (?, ?, ?, 'WORK_PREFERENCE_UPDATED', ?, ?, ?)"
  ).bind(
    newId(),
    auth.member.id,
    workId,
    JSON.stringify({ rating: previousRating, favorite: previousFavorite }),
    JSON.stringify({ rating: nextRating, favorite: nextFavorite }),
    now
  ).run();
  return getWork(env, auth, workId);
}
