import { audit, newId, nowIso, rebuildWorkSearchText } from "../db";
import { HttpError, json, parseJson } from "../http";
import type { AuthContext, Env } from "../types";

const NOTE_TYPES = ["quick", "summary", "impression", "quote", "idea", "connection", "progress"] as const;

type NoteType = typeof NOTE_TYPES[number];

type OwnedNote = {
  id: string;
  work_id: string;
  owner_id: string;
  note_type: NoteType;
  content: string;
  position: string | null;
  version: number;
  sort_order: number;
  updated_at: string;
};

type OwnedExperience = {
  id: string;
  work_id: string;
  owner_id: string;
  sequence: number;
  started_at: string | null;
  completed_at: string | null;
  rating: number | null;
  progress_current: number | null;
  progress_total: number | null;
  memo: string | null;
  version: number;
  updated_at: string;
};

function requireEditor(auth: AuthContext): void {
  if (!['owner', 'admin', 'member'].includes(auth.member.role)) {
    throw new HttpError(403, 'FORBIDDEN', '編集権限がありません。');
  }
}

function cleanText(value: unknown, name: string, max: number, required = false): string | null {
  if (value === undefined || value === null) {
    if (required) throw new HttpError(422, 'VALIDATION_ERROR', `${name}は必須です。`, { field: name });
    return null;
  }
  if (typeof value !== 'string') throw new HttpError(422, 'VALIDATION_ERROR', `${name}の形式が正しくありません。`, { field: name });
  const text = value.trim();
  if (required && !text) throw new HttpError(422, 'VALIDATION_ERROR', `${name}は必須です。`, { field: name });
  if (text.length > max) throw new HttpError(422, 'VALIDATION_ERROR', `${name}は${max}文字以内で入力してください。`, { field: name });
  return text || null;
}

function optionalNumber(value: unknown, name: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) throw new HttpError(422, 'VALIDATION_ERROR', `${name}は数値で入力してください。`, { field: name });
  return number;
}

function ratingValue(value: unknown): number | null {
  const rating = optionalNumber(value, '評価');
  if (rating === null) return null;
  if (rating < 0.5 || rating > 5 || Math.round(rating * 2) !== rating * 2) {
    throw new HttpError(422, 'VALIDATION_ERROR', '評価は0.5〜5.0を0.5刻みで入力してください。', { field: 'rating' });
  }
  return rating;
}

function versionValue(value: unknown): number {
  const version = Number(value);
  if (!Number.isInteger(version) || version < 1) {
    throw new HttpError(422, 'VALIDATION_ERROR', '更新バージョンが必要です。', { field: 'version' });
  }
  return version;
}

function validateProgress(current: number | null, total: number | null): void {
  if (current !== null && current < 0) throw new HttpError(422, 'VALIDATION_ERROR', '現在の進捗は0以上で入力してください。', { field: 'progress_current' });
  if (total !== null && total < 0) throw new HttpError(422, 'VALIDATION_ERROR', '全体の進捗は0以上で入力してください。', { field: 'progress_total' });
  if (current !== null && total !== null && current > total) {
    throw new HttpError(422, 'VALIDATION_ERROR', '現在の進捗は全体以下にしてください。', { field: 'progress_current' });
  }
}

async function ownedNote(env: Env, auth: AuthContext, noteId: string): Promise<OwnedNote> {
  const note = await env.DB.prepare(
    "SELECT n.*, w.owner_id FROM notes n JOIN works w ON w.id = n.work_id WHERE n.id = ? AND w.owner_id = ? AND w.deleted_at IS NULL LIMIT 1"
  ).bind(noteId, auth.member.id).first<OwnedNote>();
  if (!note) throw new HttpError(404, 'NOT_FOUND', 'メモが見つかりません。');
  return note;
}

async function ownedExperience(env: Env, auth: AuthContext, experienceId: string): Promise<OwnedExperience> {
  const experience = await env.DB.prepare(
    "SELECT e.*, w.owner_id FROM experiences e JOIN works w ON w.id = e.work_id WHERE e.id = ? AND w.owner_id = ? AND w.deleted_at IS NULL LIMIT 1"
  ).bind(experienceId, auth.member.id).first<OwnedExperience>();
  if (!experience) throw new HttpError(404, 'NOT_FOUND', '体験記録が見つかりません。');
  return experience;
}

async function syncWorkFromExperiences(env: Env, workId: string, ownerId: string, now: string): Promise<void> {
  const latest = await env.DB.prepare(
    "SELECT started_at, completed_at FROM experiences WHERE work_id = ? ORDER BY sequence DESC LIMIT 1"
  ).bind(workId).first<{ started_at: string | null; completed_at: string | null }>();

  if (!latest) {
    await env.DB.prepare("UPDATE works SET updated_at = ?, version = version + 1 WHERE id = ? AND owner_id = ?")
      .bind(now, workId, ownerId).run();
    return;
  }

  const latestRating = await env.DB.prepare(
    "SELECT rating FROM experiences WHERE work_id = ? AND rating IS NOT NULL ORDER BY sequence DESC LIMIT 1"
  ).bind(workId).first<{ rating: number }>();
  const latestCurrent = await env.DB.prepare(
    "SELECT progress_current FROM experiences WHERE work_id = ? AND progress_current IS NOT NULL ORDER BY sequence DESC LIMIT 1"
  ).bind(workId).first<{ progress_current: number }>();
  const latestTotal = await env.DB.prepare(
    "SELECT progress_total FROM experiences WHERE work_id = ? AND progress_total IS NOT NULL ORDER BY sequence DESC LIMIT 1"
  ).bind(workId).first<{ progress_total: number }>();
  const status = latest.completed_at ? 'completed' : latest.started_at ? 'active' : null;

  await env.DB.prepare(
    "UPDATE works SET status = COALESCE(?, status), rating = COALESCE(?, rating), progress_current = COALESCE(?, progress_current), progress_total = COALESCE(?, progress_total), updated_at = ?, version = version + 1 WHERE id = ? AND owner_id = ?"
  ).bind(status, latestRating?.rating ?? null, latestCurrent?.progress_current ?? null, latestTotal?.progress_total ?? null, now, workId, ownerId).run();
}

export async function updateNoteV04(request: Request, env: Env, auth: AuthContext, noteId: string): Promise<Response> {
  requireEditor(auth);
  const current = await ownedNote(env, auth, noteId);
  const payload = await parseJson<Record<string, unknown>>(request);
  const version = versionValue(payload.version);
  const noteType = payload.note_type === undefined ? current.note_type : cleanText(payload.note_type, 'メモ種別', 30, true) as NoteType;
  if (!NOTE_TYPES.includes(noteType)) throw new HttpError(422, 'VALIDATION_ERROR', 'メモ種別が正しくありません。', { field: 'note_type' });
  const content = payload.content === undefined ? current.content : cleanText(payload.content, 'メモ', 50_000, true)!;
  const position = payload.position === undefined ? current.position : cleanText(payload.position, '位置・出典', 100);
  const now = nowIso();

  const result = await env.DB.prepare(
    "UPDATE notes SET note_type = ?, content = ?, position = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?"
  ).bind(noteType, content, position, now, noteId, version).run();
  if ((result.meta.changes ?? 0) === 0) throw new HttpError(409, 'CONFLICT', '別の画面でメモが更新されています。再読み込みしてください。');

  await env.DB.prepare("UPDATE works SET updated_at = ?, version = version + 1 WHERE id = ? AND owner_id = ?")
    .bind(now, current.work_id, auth.member.id).run();
  await rebuildWorkSearchText(env, current.work_id, auth.member.id);
  await audit(env, 'NOTE_UPDATED', auth.member.id, noteId, {
    before: { note_type: current.note_type, content: current.content, position: current.position, version: current.version },
    after: { note_type: noteType, content, position, version: version + 1 }
  });
  return json({ id: noteId, work_id: current.work_id, note_type: noteType, content, position, version: version + 1, updated_at: now });
}

export async function deleteNoteV04(env: Env, auth: AuthContext, noteId: string): Promise<Response> {
  requireEditor(auth);
  const current = await ownedNote(env, auth, noteId);
  const now = nowIso();
  await env.DB.prepare("DELETE FROM notes WHERE id = ?").bind(noteId).run();
  await env.DB.prepare("UPDATE works SET updated_at = ?, version = version + 1 WHERE id = ? AND owner_id = ?")
    .bind(now, current.work_id, auth.member.id).run();
  await rebuildWorkSearchText(env, current.work_id, auth.member.id);
  await audit(env, 'NOTE_DELETED', auth.member.id, noteId, { before: { work_id: current.work_id, note_type: current.note_type, content: current.content } });
  return json({ ok: true, work_id: current.work_id });
}

export async function reorderNotesV04(request: Request, env: Env, auth: AuthContext, workId: string): Promise<Response> {
  requireEditor(auth);
  const work = await env.DB.prepare("SELECT id FROM works WHERE id = ? AND owner_id = ? AND deleted_at IS NULL")
    .bind(workId, auth.member.id).first();
  if (!work) throw new HttpError(404, 'NOT_FOUND', '作品が見つかりません。');

  const payload = await parseJson<Record<string, unknown>>(request);
  if (!Array.isArray(payload.ids) || payload.ids.some((id) => typeof id !== 'string')) {
    throw new HttpError(422, 'VALIDATION_ERROR', '並び順の形式が正しくありません。', { field: 'ids' });
  }
  const ids = Array.from(new Set(payload.ids as string[]));
  const existing = await env.DB.prepare("SELECT id FROM notes WHERE work_id = ? ORDER BY sort_order, created_at")
    .bind(workId).all<{ id: string }>();
  const existingIds = existing.results.map((row) => row.id);
  if (ids.length !== existingIds.length || existingIds.some((id) => !ids.includes(id))) {
    throw new HttpError(409, 'CONFLICT', 'メモの件数が変わっています。再読み込みしてください。');
  }

  if (ids.length) {
    await env.DB.batch(ids.map((id, index) => env.DB.prepare("UPDATE notes SET sort_order = ? WHERE id = ? AND work_id = ?")
      .bind((index + 1) * 10, id, workId)));
  }
  const now = nowIso();
  await env.DB.prepare("UPDATE works SET updated_at = ?, version = version + 1 WHERE id = ? AND owner_id = ?")
    .bind(now, workId, auth.member.id).run();
  await audit(env, 'NOTES_REORDERED', auth.member.id, workId, { after: { ids } });
  return json({ ok: true, ids });
}

async function syncLinkedImpressionNote(env: Env, experience: OwnedExperience, memo: string | null, now: string): Promise<void> {
  const linked = await env.DB.prepare(
    "SELECT id, content, version FROM notes WHERE experience_id = ? AND note_type = 'impression' ORDER BY created_at LIMIT 1"
  ).bind(experience.id).first<{ id: string; content: string; version: number }>();

  if (memo) {
    if (linked && linked.content === (experience.memo ?? '')) {
      await env.DB.prepare("UPDATE notes SET content = ?, version = version + 1, updated_at = ? WHERE id = ?")
        .bind(memo, now, linked.id).run();
    } else if (!linked) {
      const maxOrder = await env.DB.prepare("SELECT COALESCE(MAX(sort_order), 0) AS value FROM notes WHERE work_id = ?")
        .bind(experience.work_id).first<{ value: number }>();
      await env.DB.prepare(
        "INSERT INTO notes (id, work_id, experience_id, note_type, content, sort_order, created_at, updated_at) VALUES (?, ?, ?, 'impression', ?, ?, ?, ?)"
      ).bind(newId(), experience.work_id, experience.id, memo, (maxOrder?.value ?? 0) + 10, now, now).run();
    }
  } else if (linked) {
    if (linked.content === (experience.memo ?? '')) {
      await env.DB.prepare("DELETE FROM notes WHERE id = ?").bind(linked.id).run();
    } else {
      await env.DB.prepare("UPDATE notes SET experience_id = NULL, version = version + 1, updated_at = ? WHERE id = ?")
        .bind(now, linked.id).run();
    }
  }
}

export async function updateExperienceV04(request: Request, env: Env, auth: AuthContext, experienceId: string): Promise<Response> {
  requireEditor(auth);
  const current = await ownedExperience(env, auth, experienceId);
  const payload = await parseJson<Record<string, unknown>>(request);
  const version = versionValue(payload.version);
  const startedAt = payload.started_at === undefined ? current.started_at : cleanText(payload.started_at, '開始日', 30);
  const completedAt = payload.completed_at === undefined ? current.completed_at : cleanText(payload.completed_at, '完了日', 30);
  const rating = payload.rating === undefined ? current.rating : ratingValue(payload.rating);
  const progressCurrent = payload.progress_current === undefined ? current.progress_current : optionalNumber(payload.progress_current, '現在の進捗');
  const progressTotal = payload.progress_total === undefined ? current.progress_total : optionalNumber(payload.progress_total, '全体の進捗');
  const memo = payload.memo === undefined ? current.memo : cleanText(payload.memo, '体験メモ', 50_000);
  validateProgress(progressCurrent, progressTotal);
  if (startedAt && completedAt && completedAt < startedAt) {
    throw new HttpError(422, 'VALIDATION_ERROR', '完了日は開始日以降にしてください。', { field: 'completed_at' });
  }
  const now = nowIso();

  const result = await env.DB.prepare(
    "UPDATE experiences SET started_at = ?, completed_at = ?, rating = ?, progress_current = ?, progress_total = ?, memo = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?"
  ).bind(startedAt, completedAt, rating, progressCurrent, progressTotal, memo, now, experienceId, version).run();
  if ((result.meta.changes ?? 0) === 0) throw new HttpError(409, 'CONFLICT', '別の画面で体験記録が更新されています。再読み込みしてください。');

  await syncLinkedImpressionNote(env, current, memo, now);
  await syncWorkFromExperiences(env, current.work_id, auth.member.id, now);
  await rebuildWorkSearchText(env, current.work_id, auth.member.id);
  await audit(env, 'EXPERIENCE_UPDATED', auth.member.id, experienceId, {
    before: { sequence: current.sequence, started_at: current.started_at, completed_at: current.completed_at, rating: current.rating, progress_current: current.progress_current, progress_total: current.progress_total, memo: current.memo, version: current.version },
    after: { started_at: startedAt, completed_at: completedAt, rating, progress_current: progressCurrent, progress_total: progressTotal, memo, version: version + 1 }
  });
  return json({ id: experienceId, work_id: current.work_id, sequence: current.sequence, started_at: startedAt, completed_at: completedAt, rating, progress_current: progressCurrent, progress_total: progressTotal, memo, version: version + 1, updated_at: now });
}

export async function deleteExperienceV04(env: Env, auth: AuthContext, experienceId: string): Promise<Response> {
  requireEditor(auth);
  const current = await ownedExperience(env, auth, experienceId);
  const now = nowIso();
  await env.DB.prepare("DELETE FROM experiences WHERE id = ?").bind(experienceId).run();
  await syncWorkFromExperiences(env, current.work_id, auth.member.id, now);
  await audit(env, 'EXPERIENCE_DELETED', auth.member.id, experienceId, {
    before: { work_id: current.work_id, sequence: current.sequence, rating: current.rating, memo: current.memo }
  });
  return json({ ok: true, work_id: current.work_id });
}
