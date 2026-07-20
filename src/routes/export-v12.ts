import { nowIso } from "../db";
import { HttpError, text } from "../http";
import type { AuthContext, Env, LabelKind } from "../types";

type ExportWork = Record<string, unknown> & {
  id: string;
  metadata: unknown;
  labels: Record<LabelKind, string[]>;
  metadata_json?: undefined;
};

function requireEditor(auth: AuthContext): void {
  if (!["owner", "admin", "member"].includes(auth.member.role)) {
    throw new HttpError(403, "FORBIDDEN", "編集権限がありません。");
  }
}

function parseJsonSafe<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function attachment(body: string, contentType: string, filename: string): Response {
  const response = text(body, 200, contentType);
  const headers = new Headers(response.headers);
  headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  return new Response(response.body, { status: response.status, headers });
}

async function selectedWorkIds(request: Request): Promise<string[] | null> {
  if (request.method === "GET") return null;
  if (request.method !== "POST") {
    throw new HttpError(405, "METHOD_NOT_ALLOWED", "書き出し方法が正しくありません。");
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new HttpError(415, "INVALID_CONTENT_TYPE", "選択作品はJSON形式で送信してください。");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    throw new HttpError(400, "INVALID_JSON", "選択作品の形式が正しくありません。");
  }

  const rawIds = (payload as { work_ids?: unknown } | null)?.work_ids;
  if (!Array.isArray(rawIds)) {
    throw new HttpError(400, "INVALID_WORK_IDS", "書き出す作品を選択してください。");
  }

  const ids = Array.from(new Set(rawIds
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)));

  if (ids.length === 0) {
    throw new HttpError(400, "EMPTY_SELECTION", "作品を1件以上選択してください。");
  }
  if (ids.length > 5000) {
    throw new HttpError(400, "TOO_MANY_WORKS", "1回に書き出せる作品は5,000件までです。");
  }
  return ids;
}

export async function exportDataV12(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  requireEditor(auth);
  const format = new URL(request.url).searchParams.get("format") || "json";
  const ownerId = auth.member.id;
  const requestedIds = await selectedWorkIds(request);

  const [works, labelRows, experiences, notes] = await Promise.all([
    env.DB.prepare(
      "SELECT * FROM works WHERE owner_id = ? AND deleted_at IS NULL ORDER BY created_at"
    ).bind(ownerId).all<Record<string, unknown>>(),
    env.DB.prepare(
      "SELECT wl.work_id, l.kind, l.name FROM work_labels wl JOIN labels l ON l.id = wl.label_id JOIN works w ON w.id = wl.work_id WHERE w.owner_id = ? AND w.deleted_at IS NULL ORDER BY wl.work_id, l.kind, l.name"
    ).bind(ownerId).all<{ work_id: string; kind: LabelKind; name: string }>(),
    env.DB.prepare(
      "SELECT e.* FROM experiences e JOIN works w ON w.id = e.work_id WHERE w.owner_id = ? AND w.deleted_at IS NULL ORDER BY e.work_id, e.sequence"
    ).bind(ownerId).all<Record<string, unknown>>(),
    env.DB.prepare(
      "SELECT n.* FROM notes n JOIN works w ON w.id = n.work_id WHERE w.owner_id = ? AND w.deleted_at IS NULL ORDER BY n.work_id, n.created_at"
    ).bind(ownerId).all<Record<string, unknown>>()
  ]);

  const labelsByWork = new Map<string, Record<LabelKind, string[]>>();
  for (const row of labelRows.results) {
    const labels = labelsByWork.get(row.work_id) ?? { genre: [], theme: [], tag: [] };
    labels[row.kind].push(row.name);
    labelsByWork.set(row.work_id, labels);
  }

  const allDecorated: ExportWork[] = works.results.map((row) => ({
    ...row,
    id: String(row.id),
    metadata: parseJsonSafe(String(row.metadata_json ?? "{}"), {}),
    labels: labelsByWork.get(String(row.id)) ?? { genre: [], theme: [], tag: [] },
    metadata_json: undefined
  }));

  const byId = new Map(allDecorated.map((item) => [item.id, item]));
  const decorated = requestedIds
    ? requestedIds.flatMap((id) => {
        const item = byId.get(id);
        return item ? [item] : [];
      })
    : allDecorated;

  if (requestedIds && decorated.length === 0) {
    throw new HttpError(400, "WORKS_NOT_FOUND", "選択した作品が見つかりませんでした。画面を更新して、もう一度選択してください。");
  }

  const exportedIds = requestedIds ? new Set(decorated.map((item) => item.id)) : null;
  const exportedExperiences = exportedIds
    ? experiences.results.filter((item) => exportedIds.has(String(item.work_id)))
    : experiences.results;
  const exportedNotes = exportedIds
    ? notes.results.filter((item) => exportedIds.has(String(item.work_id)))
    : notes.results;

  const data = {
    exported_at: nowIso(),
    user: { email: auth.member.email },
    works: decorated,
    experiences: exportedExperiences,
    notes: exportedNotes
  };
  const filenameDate = nowIso().slice(0, 10).replaceAll("-", "");
  const filenameStem = requestedIds
    ? `sakuhin-log-selected-${decorated.length}-${filenameDate}`
    : `sakuhin-log-${filenameDate}`;

  if (format === "json") {
    return attachment(
      JSON.stringify(data, null, 2),
      "application/json; charset=utf-8",
      `${filenameStem}.json`
    );
  }

  if (format === "csv") {
    const headers = ["id", "type", "title", "creator", "status", "rating", "short_note", "genres", "themes", "tags", "created_at", "updated_at"];
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const lines = [headers.join(",")];
    for (const item of decorated as Array<Record<string, any>>) {
      lines.push([
        item.id,
        item.type,
        item.title,
        item.creator,
        item.status,
        item.rating,
        item.short_note,
        item.labels.genre.join("|"),
        item.labels.theme.join("|"),
        item.labels.tag.join("|"),
        item.created_at,
        item.updated_at
      ].map(escape).join(","));
    }
    return attachment(`\uFEFF${lines.join("\r\n")}`, "text/csv; charset=utf-8", `${filenameStem}.csv`);
  }

  if (format === "markdown") {
    const expByWork = new Map<string, any[]>();
    for (const exp of exportedExperiences as any[]) {
      expByWork.set(exp.work_id, [...(expByWork.get(exp.work_id) ?? []), exp]);
    }
    const notesByWork = new Map<string, any[]>();
    for (const note of exportedNotes as any[]) {
      notesByWork.set(note.work_id, [...(notesByWork.get(note.work_id) ?? []), note]);
    }
    const out: string[] = ["# 作品体験ログ", "", `書き出し日時: ${data.exported_at}`, ""];
    for (const item of decorated as Array<Record<string, any>>) {
      out.push(
        `## ${item.title}`,
        "",
        `- 種別: ${item.type}`,
        `- 作者・監督: ${item.creator ?? ""}`,
        `- 状態: ${item.status}`,
        `- 評価: ${item.rating ?? "未評価"}`,
        `- ジャンル: ${item.labels.genre.join("、")}`,
        `- テーマ: ${item.labels.theme.join("、")}`,
        `- タグ: ${item.labels.tag.join("、")}`,
        ""
      );
      if (item.short_note) out.push("### 一言メモ", "", item.short_note, "");
      for (const exp of expByWork.get(String(item.id)) ?? []) {
        out.push(
          `### 体験 ${exp.sequence}`,
          "",
          `- 開始: ${exp.started_at ?? ""}`,
          `- 完了: ${exp.completed_at ?? ""}`,
          `- 評価: ${exp.rating ?? ""}`,
          ""
        );
        if (exp.memo) out.push(exp.memo, "");
      }
      const itemNotes = notesByWork.get(String(item.id)) ?? [];
      if (itemNotes.length) {
        out.push("### メモ", "");
        for (const note of itemNotes) out.push(`- **${note.note_type}** ${note.content}`);
        out.push("");
      }
    }
    return attachment(out.join("\n"), "text/markdown; charset=utf-8", `${filenameStem}.md`);
  }

  throw new HttpError(400, "INVALID_FORMAT", "書き出し形式が正しくありません。");
}
