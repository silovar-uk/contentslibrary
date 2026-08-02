import { getLabelsForWorks } from "../db";
import { json } from "../http";
import type { AuthContext, Env } from "../types";

function parseMetadata(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// フロント全体常駐用の軽量スナップショット。体験・メモ本文は含めない(詳細を開いたときだけ /api/works/:id で取得する)。
export async function getLibrarySnapshot(env: Env, auth: AuthContext): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT id, type, title, creator, release_year, status, rating, short_note,
            progress_current, progress_total, unit_label, metadata_json, search_text, version, updated_at,
            EXISTS (SELECT 1 FROM notes n WHERE n.work_id = w.id) AS has_notes,
            (SELECT COUNT(*) FROM experiences e WHERE e.work_id = w.id) AS experience_count
     FROM works w WHERE owner_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC`
  ).bind(auth.member.id).all<Record<string, unknown>>();
  const ids = rows.results.map((row) => String(row.id));
  const labels = await getLabelsForWorks(env, ids);
  const items = rows.results.map((row) => ({
    ...row,
    metadata: parseMetadata(row.metadata_json),
    metadata_json: undefined,
    labels: labels.get(String(row.id)) ?? { genre: [], theme: [], tag: [] }
  }));
  return json({ items, total: items.length });
}
