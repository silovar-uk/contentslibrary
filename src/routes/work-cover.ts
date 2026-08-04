import { newId, nowIso } from "../db";
import { HttpError, parseJson } from "../http";
import type { AuthContext, Env } from "../types";
import { getWork } from "./works";

interface CoverPayload {
  version?: unknown;
  cover_url?: unknown;
}

// CSP(src/http.ts)のimg-srcと揃える。ここで弾かないURLは表示側でも必ず読み込める必要があるため、
// 許可ホストは一箇所(このSetとCSP)だけで管理し、増やすときは両方を直す。
const ALLOWED_HOSTS = new Set(["m.media-amazon.com", "images-na.ssl-images-amazon.com"]);

function requireEditor(auth: AuthContext): void {
  if (!["owner", "admin", "member"].includes(auth.member.role)) {
    throw new HttpError(403, "FORBIDDEN", "編集権限がありません。");
  }
}

function parseJsonSafe(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
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

// クライアントは候補URLを一度自分で読み込んで確認してから送ってくる(空の1x1 GIFを弾くため)。
// サーバー側はさらに、既知の画像URL形式であることを確認したうえで高解像度版へ正規化する。
// 一覧・ホームではクライアント側で中解像度へ落とし、詳細だけ高解像度を使う。
function normalizeCoverUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(422, "VALIDATION_ERROR", "表紙URLの形式が正しくありません。", { field: "cover_url" });
  }
  if (url.protocol !== "https:") {
    throw new HttpError(422, "VALIDATION_ERROR", "表紙URLはhttpsのみ使用できます。", { field: "cover_url" });
  }
  if (!ALLOWED_HOSTS.has(url.hostname)) {
    throw new HttpError(422, "VALIDATION_ERROR", "表紙URLはAmazonの画像URLのみ使用できます。", { field: "cover_url" });
  }

  // /images/P/<ISBN等>.<edition>.<SIZE>.jpg 形式(主に書籍)。大サイズへ正規化する。
  const productMatch = url.pathname.match(/^\/images\/P\/([^./]+)\.(\d+)\.[A-Za-z0-9]+\.jpg$/);
  if (productMatch) {
    return `https://${url.hostname}/images/P/${productMatch[1]}.${productMatch[2]}.LZZZZZZZ.jpg`;
  }

  // /images/I/<画像ID>[._SIZE_].jpg 形式(商品ページから貼った画像URL)。長辺800px相当へ正規化する。
  const itemMatch = url.pathname.match(/^\/images\/I\/([^._]+)(?:\._[A-Za-z0-9,_]+_)?\.jpg$/);
  if (itemMatch) {
    return `https://${url.hostname}/images/I/${itemMatch[1]}._SL800_.jpg`;
  }

  throw new HttpError(422, "VALIDATION_ERROR", "認識できないAmazon画像URLの形式です。", { field: "cover_url" });
}

export async function updateWorkCover(request: Request, env: Env, auth: AuthContext, workId: string): Promise<Response> {
  requireEditor(auth);
  const current = await env.DB.prepare(
    "SELECT * FROM works WHERE id = ? AND owner_id = ? AND deleted_at IS NULL LIMIT 1"
  ).bind(workId, auth.member.id).first<{ version: number; metadata_json: string | null }>();
  if (!current) throw new HttpError(404, "NOT_FOUND", "作品が見つかりません。");

  const payload = await parseJson<CoverPayload>(request);
  const version = versionField(payload.version);
  const metadata = parseJsonSafe(current.metadata_json);
  const previousCover = typeof metadata.cover_url === "string" ? metadata.cover_url : null;

  if (payload.cover_url === null) {
    delete metadata.cover_url;
  } else if (typeof payload.cover_url === "string" && payload.cover_url.trim()) {
    metadata.cover_url = normalizeCoverUrl(payload.cover_url.trim());
  } else {
    throw new HttpError(422, "VALIDATION_ERROR", "表紙URLを指定してください。", { field: "cover_url" });
  }
  const nextCover = typeof metadata.cover_url === "string" ? metadata.cover_url : null;

  const serialized = JSON.stringify(metadata);
  if (serialized.length > 100_000) throw new HttpError(422, "VALIDATION_ERROR", "作品情報が大きすぎます。");

  const now = nowIso();
  const result = await env.DB.prepare(
    "UPDATE works SET metadata_json = ?, version = version + 1, updated_at = ? WHERE id = ? AND owner_id = ? AND version = ? AND deleted_at IS NULL"
  ).bind(serialized, now, workId, auth.member.id, version).run();
  if ((result.meta.changes ?? 0) === 0) {
    throw new HttpError(409, "CONFLICT", "別の画面で更新されています。作品を開き直してください。");
  }

  await env.DB.prepare(
    "INSERT INTO audit_events (id, actor_id, target_id, action, before_json, after_json, created_at) VALUES (?, ?, ?, 'WORK_COVER_UPDATED', ?, ?, ?)"
  ).bind(
    newId(),
    auth.member.id,
    workId,
    JSON.stringify({ cover_url: previousCover }),
    JSON.stringify({ cover_url: nextCover }),
    now
  ).run();

  return getWork(env, auth, workId);
}
