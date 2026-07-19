import { escapeLike, getLabelsForWorks, newId, normalizeText, nowIso, rebuildWorkSearchText, syncLabels } from "../db";
import { HttpError, json, parseJson, text } from "../http";
import type { AuthContext, Env, LabelKind, WorkStatus, WorkType } from "../types";

const WORK_TYPES: WorkType[] = ["book", "manga", "movie", "anime", "drama", "other"];
const WORK_STATUSES: WorkStatus[] = ["want", "owned_unread", "active", "completed", "paused", "dropped"];
const NOTE_TYPES = ["quick", "summary", "impression", "quote", "idea", "connection", "progress"] as const;

type LabelsInput = Partial<Record<LabelKind, string[]>>;

interface WorkPayload {
  title?: unknown;
  type?: unknown;
  creator?: unknown;
  release_year?: unknown;
  status?: unknown;
  rating?: unknown;
  short_note?: unknown;
  visibility?: unknown;
  progress_current?: unknown;
  progress_total?: unknown;
  unit_label?: unknown;
  metadata?: unknown;
  labels?: unknown;
  version?: unknown;
}

function stringField(value: unknown, name: string, max: number, required = false): string | null {
  if (value === undefined || value === null) {
    if (required) throw new HttpError(422, "VALIDATION_ERROR", `${name}は必須です。`, { field: name });
    return null;
  }
  if (typeof value !== "string") throw new HttpError(422, "VALIDATION_ERROR", `${name}の形式が正しくありません。`, { field: name });
  const trimmed = value.trim();
  if (required && !trimmed) throw new HttpError(422, "VALIDATION_ERROR", `${name}は必須です。`, { field: name });
  if (trimmed.length > max) throw new HttpError(422, "VALIDATION_ERROR", `${name}は${max}文字以内で入力してください。`, { field: name });
  return trimmed || null;
}

function optionalNumber(value: unknown, name: string): number | null {
  if (value === undefined || value === null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) throw new HttpError(422, "VALIDATION_ERROR", `${name}は数値で入力してください。`, { field: name });
  return number;
}

function ratingField(value: unknown): number | null {
  const rating = optionalNumber(value, "評価");
  if (rating === null) return null;
  if (rating < 0.5 || rating > 5 || Math.round(rating * 2) !== rating * 2) {
    throw new HttpError(422, "VALIDATION_ERROR", "評価は0.5〜5.0を0.5刻みで入力してください。", { field: "rating" });
  }
  return rating;
}

function yearField(value: unknown): number | null {
  const year = optionalNumber(value, "発表年");
  if (year === null) return null;
  if (!Number.isInteger(year) || year < 0 || year > 3000) throw new HttpError(422, "VALIDATION_ERROR", "発表年が正しくありません。", { field: "release_year" });
  return year;
}

function enumField<T extends string>(value: unknown, allowed: readonly T[], name: string, required = false): T | null {
  if (value === undefined || value === null || value === "") {
    if (required) throw new HttpError(422, "VALIDATION_ERROR", `${name}は必須です。`, { field: name });
    return null;
  }
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new HttpError(422, "VALIDATION_ERROR", `${name}が正しくありません。`, { field: name });
  }
  return value as T;
}

function labelsField(value: unknown): LabelsInput {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new HttpError(422, "VALIDATION_ERROR", "分類の形式が正しくありません。", { field: "labels" });
  const result: LabelsInput = {};
  for (const kind of ["genre", "theme", "tag"] as LabelKind[]) {
    const values = (value as Record<string, unknown>)[kind];
    if (values === undefined) continue;
    if (!Array.isArray(values) || values.some((v) => typeof v !== "string")) {
      throw new HttpError(422, "VALIDATION_ERROR", `${kind}の形式が正しくありません。`, { field: `labels.${kind}` });
    }
    const clean = Array.from(new Set((values as string[]).map((v) => v.trim()).filter(Boolean)));
    if (clean.length > 30 || clean.some((v) => v.length > 40)) {
      throw new HttpError(422, "VALIDATION_ERROR", "分類は各30件まで、1件40文字以内です。", { field: `labels.${kind}` });
    }
    result[kind] = clean;
  }
  return result;
}

function metadataField(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new HttpError(422, "VALIDATION_ERROR", "媒体別情報の形式が正しくありません。", { field: "metadata" });
  const serialized = JSON.stringify(value);
  if (serialized.length > 10_000) throw new HttpError(422, "VALIDATION_ERROR", "媒体別情報が大きすぎます。", { field: "metadata" });
  return value as Record<string, unknown>;
}

function parseJsonSafe<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function isEditor(auth: AuthContext): boolean {
  return ["owner", "admin", "member"].includes(auth.member.role);
}

function requireEditor(auth: AuthContext): void {
  if (!isEditor(auth)) throw new HttpError(403, "FORBIDDEN", "編集権限がありません。");
}

async function attachLabels(env: Env, rows: Array<Record<string, unknown>>) {
  const ids = rows.map((row) => String(row.id));
  const labels = await getLabelsForWorks(env, ids);
  return rows.map((row) => ({
    ...row,
    metadata: parseJsonSafe(String(row.metadata_json ?? "{}"), {}),
    labels: labels.get(String(row.id)) ?? { genre: [], theme: [], tag: [] },
    metadata_json: undefined
  }));
}

export async function getHome(env: Env, auth: AuthContext): Promise<Response> {
  const owner = auth.member.id;
  const reading = await env.DB.prepare(
    "SELECT * FROM works WHERE owner_id = ? AND deleted_at IS NULL AND type = 'book' AND status = 'active' ORDER BY updated_at DESC LIMIT 6"
  ).bind(owner).all<Record<string, unknown>>();
  const recentOther = await env.DB.prepare(
    "SELECT * FROM works WHERE owner_id = ? AND deleted_at IS NULL AND type <> 'book' ORDER BY updated_at DESC LIMIT 8"
  ).bind(owner).all<Record<string, unknown>>();
  const recentNotes = await env.DB.prepare(
    "SELECT n.id, n.note_type, n.content, n.updated_at, w.id AS work_id, w.title, w.type FROM notes n JOIN works w ON w.id = n.work_id WHERE w.owner_id = ? AND w.deleted_at IS NULL AND w.type = 'book' ORDER BY n.updated_at DESC LIMIT 8"
  ).bind(owner).all<Record<string, unknown>>();
  const stats = await env.DB.prepare(
    "SELECT COUNT(*) AS total, SUM(CASE WHEN type = 'book' AND status = 'completed' THEN 1 ELSE 0 END) AS completed_books, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_count, SUM(CASE WHEN status IN ('paused','dropped') THEN 1 ELSE 0 END) AS stopped_count FROM works WHERE owner_id = ? AND deleted_at IS NULL"
  ).bind(owner).first<Record<string, unknown>>();
  const security = ["owner", "admin"].includes(auth.member.role)
    ? await env.DB.prepare("SELECT COUNT(*) AS count FROM security_events WHERE resolved_status = 'open' AND risk IN ('critical','high')").first<{ count: number }>()
    : { count: 0 };
  return json({
    reading: await attachLabels(env, reading.results),
    recentOther: await attachLabels(env, recentOther.results),
    recentNotes: recentNotes.results,
    stats: stats ?? {},
    openSecurityCount: security?.count ?? 0
  });
}

export async function listWorks(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  const url = new URL(request.url);
  const clauses = ["w.owner_id = ?", "w.deleted_at IS NULL"];
  const params: unknown[] = [auth.member.id];
  const q = normalizeText(url.searchParams.get("q") || "");
  if (q) {
    clauses.push("w.search_text LIKE ?");
    params.push(`%${q.replace(/[%_]/g, " ")}%`);
  }
  const type = url.searchParams.get("type");
  if (type && WORK_TYPES.includes(type as WorkType)) { clauses.push("w.type = ?"); params.push(type); }
  const status = url.searchParams.get("status");
  if (status && WORK_STATUSES.includes(status as WorkStatus)) { clauses.push("w.status = ?"); params.push(status); }
  const ratingMin = Number(url.searchParams.get("rating_min"));
  if (Number.isFinite(ratingMin) && ratingMin > 0) { clauses.push("w.rating >= ?"); params.push(ratingMin); }
  const label = normalizeText(url.searchParams.get("label") || "");
  if (label) {
    clauses.push("EXISTS (SELECT 1 FROM work_labels wl JOIN labels l ON l.id = wl.label_id WHERE wl.work_id = w.id AND l.normalized_name = ?)");
    params.push(label);
  }
  const hasNotes = url.searchParams.get("has_notes");
  if (hasNotes === "true") clauses.push("EXISTS (SELECT 1 FROM notes n WHERE n.work_id = w.id)");
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "30", 10) || 30));
  const offset = (page - 1) * limit;
  const sortMap: Record<string, string> = {
    updated_desc: "w.updated_at DESC",
    title_asc: "w.title COLLATE NOCASE ASC",
    rating_desc: "w.rating IS NULL, w.rating DESC, w.updated_at DESC",
    created_desc: "w.created_at DESC"
  };
  const sort = sortMap[url.searchParams.get("sort") || "updated_desc"] || sortMap.updated_desc;
  const sql = `SELECT w.* FROM works w WHERE ${clauses.join(" AND ")} ORDER BY ${sort} LIMIT ? OFFSET ?`;
  const rows = await env.DB.prepare(sql).bind(...params, limit + 1, offset).all<Record<string, unknown>>();
  const hasMore = rows.results.length > limit;
  const items = rows.results.slice(0, limit);
  return json({ items: await attachLabels(env, items), page, limit, hasMore });
}

export async function getWork(env: Env, auth: AuthContext, workId: string): Promise<Response> {
  const work = await env.DB.prepare("SELECT * FROM works WHERE id = ? AND owner_id = ? AND deleted_at IS NULL LIMIT 1")
    .bind(workId, auth.member.id).first<Record<string, unknown>>();
  if (!work) throw new HttpError(404, "NOT_FOUND", "作品が見つかりません。");
  const [decorated] = await attachLabels(env, [work]);
  const experiences = await env.DB.prepare("SELECT * FROM experiences WHERE work_id = ? ORDER BY sequence DESC").bind(workId).all();
  const notes = await env.DB.prepare("SELECT * FROM notes WHERE work_id = ? ORDER BY updated_at DESC").bind(workId).all();
  const relations = await env.DB.prepare(
    "SELECT r.*, w.title AS target_title, w.type AS target_type FROM work_relations r JOIN works w ON w.id = r.target_work_id WHERE r.source_work_id = ? AND r.owner_id = ? AND w.deleted_at IS NULL ORDER BY r.created_at DESC"
  ).bind(workId, auth.member.id).all();
  return json({ work: decorated, experiences: experiences.results, notes: notes.results, relations: relations.results });
}

export async function createWork(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  requireEditor(auth);
  const payload = await parseJson<WorkPayload>(request);
  const title = stringField(payload.title, "タイトル", 300, true)!;
  const type = enumField(payload.type ?? "book", WORK_TYPES, "作品種別", true)!;
  const status = enumField(payload.status ?? "want", WORK_STATUSES, "状態", true)!;
  const creator = stringField(payload.creator, "作者・監督", 300);
  const releaseYear = yearField(payload.release_year);
  const rating = ratingField(payload.rating);
  const shortNote = stringField(payload.short_note, "一言メモ", 280);
  const visibility = enumField(payload.visibility ?? "private", ["private", "shared"] as const, "公開範囲", true)!;
  const progressCurrent = optionalNumber(payload.progress_current, "現在の進捗");
  const progressTotal = optionalNumber(payload.progress_total, "全体の進捗");
  const unitLabel = stringField(payload.unit_label, "進捗単位", 30);
  const metadata = metadataField(payload.metadata);
  const labels = labelsField(payload.labels);
  const id = newId();
  const now = nowIso();
  const labelText = Object.values(labels).flat().join(" ");
  const searchText = normalizeText([title, creator ?? "", shortNote ?? "", labelText].join(" "));
  await env.DB.prepare(
    "INSERT INTO works (id, owner_id, type, title, creator, release_year, status, rating, short_note, visibility, progress_current, progress_total, unit_label, metadata_json, search_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, auth.member.id, type, title, creator, releaseYear, status, rating, shortNote, visibility, progressCurrent, progressTotal, unitLabel, JSON.stringify(metadata), searchText, now, now).run();
  await syncLabels(env, auth.member.id, id, labels);
  await env.DB.prepare("INSERT INTO audit_events (id, actor_id, target_id, action, after_json, created_at) VALUES (?, ?, ?, 'WORK_CREATED', ?, ?)")
    .bind(newId(), auth.member.id, id, JSON.stringify({ title, type, status }), now).run();
  return await getWork(env, auth, id).then(async (response) => {
    const body = await response.json();
    return json(body, 201);
  });
}

export async function updateWork(request: Request, env: Env, auth: AuthContext, workId: string): Promise<Response> {
  requireEditor(auth);
  const current = await env.DB.prepare("SELECT * FROM works WHERE id = ? AND owner_id = ? AND deleted_at IS NULL").bind(workId, auth.member.id).first<Record<string, unknown>>();
  if (!current) throw new HttpError(404, "NOT_FOUND", "作品が見つかりません。");
  const payload = await parseJson<WorkPayload>(request);
  const version = Number(payload.version);
  if (!Number.isInteger(version)) throw new HttpError(422, "VALIDATION_ERROR", "更新バージョンが必要です。", { field: "version" });
  const title = payload.title === undefined ? String(current.title) : stringField(payload.title, "タイトル", 300, true)!;
  const type = payload.type === undefined ? String(current.type) as WorkType : enumField(payload.type, WORK_TYPES, "作品種別", true)!;
  const creator = payload.creator === undefined ? current.creator as string | null : stringField(payload.creator, "作者・監督", 300);
  const releaseYear = payload.release_year === undefined ? current.release_year as number | null : yearField(payload.release_year);
  const status = payload.status === undefined ? String(current.status) as WorkStatus : enumField(payload.status, WORK_STATUSES, "状態", true)!;
  const rating = payload.rating === undefined ? current.rating as number | null : ratingField(payload.rating);
  const shortNote = payload.short_note === undefined ? current.short_note as string | null : stringField(payload.short_note, "一言メモ", 280);
  const visibility = payload.visibility === undefined ? String(current.visibility) : enumField(payload.visibility, ["private", "shared"] as const, "公開範囲", true)!;
  const progressCurrent = payload.progress_current === undefined ? current.progress_current as number | null : optionalNumber(payload.progress_current, "現在の進捗");
  const progressTotal = payload.progress_total === undefined ? current.progress_total as number | null : optionalNumber(payload.progress_total, "全体の進捗");
  const unitLabel = payload.unit_label === undefined ? current.unit_label as string | null : stringField(payload.unit_label, "進捗単位", 30);
  const metadata = payload.metadata === undefined ? parseJsonSafe(String(current.metadata_json), {}) : metadataField(payload.metadata);
  const labels = payload.labels === undefined ? null : labelsField(payload.labels);
  const now = nowIso();
  const result = await env.DB.prepare(
    "UPDATE works SET type = ?, title = ?, creator = ?, release_year = ?, status = ?, rating = ?, short_note = ?, visibility = ?, progress_current = ?, progress_total = ?, unit_label = ?, metadata_json = ?, version = version + 1, updated_at = ? WHERE id = ? AND owner_id = ? AND version = ? AND deleted_at IS NULL"
  ).bind(type, title, creator, releaseYear, status, rating, shortNote, visibility, progressCurrent, progressTotal, unitLabel, JSON.stringify(metadata), now, workId, auth.member.id, version).run();
  if ((result.meta.changes ?? 0) === 0) throw new HttpError(409, "CONFLICT", "別の画面で更新されています。再読み込みして差分を確認してください。");
  if (labels) await syncLabels(env, auth.member.id, workId, labels);
  await rebuildWorkSearchText(env, workId, auth.member.id);
  await env.DB.prepare("INSERT INTO audit_events (id, actor_id, target_id, action, before_json, after_json, created_at) VALUES (?, ?, ?, 'WORK_UPDATED', ?, ?, ?)")
    .bind(newId(), auth.member.id, workId, JSON.stringify({ version: current.version }), JSON.stringify({ version: version + 1 }), now).run();
  return await getWork(env, auth, workId);
}

export async function deleteWork(env: Env, auth: AuthContext, workId: string): Promise<Response> {
  requireEditor(auth);
  const now = nowIso();
  const result = await env.DB.prepare("UPDATE works SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND owner_id = ? AND deleted_at IS NULL")
    .bind(now, now, workId, auth.member.id).run();
  if ((result.meta.changes ?? 0) === 0) throw new HttpError(404, "NOT_FOUND", "作品が見つかりません。");
  await env.DB.prepare("INSERT INTO audit_events (id, actor_id, target_id, action, created_at) VALUES (?, ?, ?, 'WORK_DELETED', ?)")
    .bind(newId(), auth.member.id, workId, now).run();
  return json({ ok: true });
}

export async function addExperience(request: Request, env: Env, auth: AuthContext, workId: string): Promise<Response> {
  requireEditor(auth);
  const work = await env.DB.prepare("SELECT * FROM works WHERE id = ? AND owner_id = ? AND deleted_at IS NULL").bind(workId, auth.member.id).first<Record<string, unknown>>();
  if (!work) throw new HttpError(404, "NOT_FOUND", "作品が見つかりません。");
  const payload = await parseJson<Record<string, unknown>>(request);
  const startedAt = stringField(payload.started_at, "開始日", 30);
  const completedAt = stringField(payload.completed_at, "完了日", 30);
  const rating = ratingField(payload.rating);
  const progressCurrent = optionalNumber(payload.progress_current, "現在の進捗");
  const progressTotal = optionalNumber(payload.progress_total, "全体の進捗");
  const memo = stringField(payload.memo, "体験メモ", 50_000);
  const seq = await env.DB.prepare("SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM experiences WHERE work_id = ?").bind(workId).first<{ next: number }>();
  const id = newId();
  const now = nowIso();
  await env.DB.prepare(
    "INSERT INTO experiences (id, work_id, sequence, started_at, completed_at, rating, progress_current, progress_total, memo, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, workId, seq?.next ?? 1, startedAt, completedAt, rating, progressCurrent, progressTotal, memo, now, now).run();
  const newStatus = completedAt ? "completed" : startedAt ? "active" : String(work.status);
  await env.DB.prepare("UPDATE works SET status = ?, rating = COALESCE(?, rating), progress_current = COALESCE(?, progress_current), progress_total = COALESCE(?, progress_total), updated_at = ?, version = version + 1 WHERE id = ? AND owner_id = ?")
    .bind(newStatus, rating, progressCurrent, progressTotal, now, workId, auth.member.id).run();
  if (memo) {
    await env.DB.prepare("INSERT INTO notes (id, work_id, experience_id, note_type, content, created_at, updated_at) VALUES (?, ?, ?, 'impression', ?, ?, ?)")
      .bind(newId(), workId, id, memo, now, now).run();
    await rebuildWorkSearchText(env, workId, auth.member.id);
  }
  return json({ id, sequence: seq?.next ?? 1 }, 201);
}

export async function addNote(request: Request, env: Env, auth: AuthContext, workId: string): Promise<Response> {
  requireEditor(auth);
  const work = await env.DB.prepare("SELECT id FROM works WHERE id = ? AND owner_id = ? AND deleted_at IS NULL").bind(workId, auth.member.id).first();
  if (!work) throw new HttpError(404, "NOT_FOUND", "作品が見つかりません。");
  const payload = await parseJson<Record<string, unknown>>(request);
  const noteType = enumField(payload.note_type ?? "quick", NOTE_TYPES, "メモ種別", true)!;
  const content = stringField(payload.content, "メモ", 50_000, true)!;
  const position = stringField(payload.position, "位置", 100);
  const experienceId = stringField(payload.experience_id, "体験ID", 100);
  if (experienceId) {
    const exp = await env.DB.prepare("SELECT id FROM experiences WHERE id = ? AND work_id = ?").bind(experienceId, workId).first();
    if (!exp) throw new HttpError(422, "VALIDATION_ERROR", "指定された体験記録が見つかりません。", { field: "experience_id" });
  }
  const id = newId();
  const now = nowIso();
  await env.DB.prepare("INSERT INTO notes (id, work_id, experience_id, note_type, content, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, workId, experienceId, noteType, content, position, now, now).run();
  await env.DB.prepare("UPDATE works SET updated_at = ?, version = version + 1 WHERE id = ? AND owner_id = ?").bind(now, workId, auth.member.id).run();
  await rebuildWorkSearchText(env, workId, auth.member.id);
  return json({ id, note_type: noteType, content, position, created_at: now }, 201);
}

export async function exportData(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  requireEditor(auth);
  const format = new URL(request.url).searchParams.get("format") || "json";
  const works = await env.DB.prepare("SELECT * FROM works WHERE owner_id = ? AND deleted_at IS NULL ORDER BY created_at").bind(auth.member.id).all<Record<string, unknown>>();
  const decorated = await attachLabels(env, works.results);
  const ids = works.results.map((w) => String(w.id));
  const experiences = ids.length ? await env.DB.prepare(`SELECT * FROM experiences WHERE work_id IN (${ids.map(() => "?").join(",")}) ORDER BY work_id, sequence`).bind(...ids).all() : { results: [] };
  const notes = ids.length ? await env.DB.prepare(`SELECT * FROM notes WHERE work_id IN (${ids.map(() => "?").join(",")}) ORDER BY work_id, created_at`).bind(...ids).all() : { results: [] };
  const data = { exported_at: nowIso(), user: { email: auth.member.email }, works: decorated, experiences: experiences.results, notes: notes.results };
  const filenameDate = nowIso().slice(0, 10).replaceAll("-", "");
  if (format === "json") {
    return text(JSON.stringify(data, null, 2), 200, "application/json; charset=utf-8");
  }
  if (format === "csv") {
    const headers = ["id", "type", "title", "creator", "status", "rating", "short_note", "genres", "themes", "tags", "created_at", "updated_at"];
    const escape = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const lines = [headers.join(",")];
    for (const item of decorated as Array<Record<string, any>>) {
      lines.push([
        item.id, item.type, item.title, item.creator, item.status, item.rating, item.short_note,
        item.labels.genre.join("|"), item.labels.theme.join("|"), item.labels.tag.join("|"), item.created_at, item.updated_at
      ].map(escape).join(","));
    }
    const response = text(`\uFEFF${lines.join("\r\n")}`, 200, "text/csv; charset=utf-8");
    const h = new Headers(response.headers); h.set("Content-Disposition", `attachment; filename="sakuhin-log-${filenameDate}.csv"`);
    return new Response(response.body, { status: response.status, headers: h });
  }
  if (format === "markdown") {
    const expByWork = new Map<string, any[]>();
    for (const exp of experiences.results as any[]) expByWork.set(exp.work_id, [...(expByWork.get(exp.work_id) ?? []), exp]);
    const notesByWork = new Map<string, any[]>();
    for (const note of notes.results as any[]) notesByWork.set(note.work_id, [...(notesByWork.get(note.work_id) ?? []), note]);
    const out: string[] = [`# 作品体験ログ`, "", `書き出し日時: ${data.exported_at}`, ""];
    for (const item of decorated as Array<Record<string, any>>) {
      out.push(`## ${item.title}`, "", `- 種別: ${item.type}`, `- 作者・監督: ${item.creator ?? ""}`, `- 状態: ${item.status}`, `- 評価: ${item.rating ?? "未評価"}`, `- ジャンル: ${item.labels.genre.join("、")}`, `- テーマ: ${item.labels.theme.join("、")}`, `- タグ: ${item.labels.tag.join("、")}`, "");
      if (item.short_note) out.push("### 一言メモ", "", item.short_note, "");
      for (const exp of expByWork.get(String(item.id)) ?? []) {
        out.push(`### 体験 ${exp.sequence}`, "", `- 開始: ${exp.started_at ?? ""}`, `- 完了: ${exp.completed_at ?? ""}`, `- 評価: ${exp.rating ?? ""}`, "");
        if (exp.memo) out.push(exp.memo, "");
      }
      const itemNotes = notesByWork.get(String(item.id)) ?? [];
      if (itemNotes.length) {
        out.push("### メモ", "");
        for (const note of itemNotes) out.push(`- **${note.note_type}** ${note.content}`);
        out.push("");
      }
    }
    const response = text(out.join("\n"), 200, "text/markdown; charset=utf-8");
    const h = new Headers(response.headers); h.set("Content-Disposition", `attachment; filename="sakuhin-log-${filenameDate}.md"`);
    return new Response(response.body, { status: response.status, headers: h });
  }
  throw new HttpError(400, "INVALID_FORMAT", "書き出し形式が正しくありません。");
}
