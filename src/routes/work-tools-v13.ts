import { newId, nowIso, rebuildWorkSearchText } from "../db";
import { HttpError, json, parseJson } from "../http";
import type { AuthContext, Env } from "../types";
import { getWork } from "./works";

type Row = Record<string, unknown> & { id: string; version: number; metadata_json: string | null };
type JsonObject = Record<string, unknown>;

interface PreferencePayload {
  version?: unknown;
  favorite?: unknown;
  rating?: unknown;
}

interface SourceFact {
  title?: unknown;
  url?: unknown;
  publisher?: unknown;
  supports?: unknown;
}

interface CreatorFact {
  name?: unknown;
  reading?: unknown;
  birth_year?: unknown;
  death_year?: unknown;
  nationality?: unknown;
  occupations?: unknown;
  biography?: unknown;
  official_url?: unknown;
}

interface FactPayload {
  schema_version?: unknown;
  work_id?: unknown;
  version?: unknown;
  facts?: {
    creator_display?: unknown;
    release_year?: unknown;
    work?: unknown;
    creators?: unknown;
    sources?: unknown;
  } | null;
}

const WORK_FACT_KEYS = [
  "original_title",
  "publisher",
  "publication_date",
  "isbn_10",
  "isbn_13",
  "language",
  "country",
  "series_name",
  "volume_number",
  "page_count",
  "official_url"
] as const;

function requireEditor(auth: AuthContext): void {
  if (!["owner", "admin", "member"].includes(auth.member.role)) {
    throw new HttpError(403, "FORBIDDEN", "編集権限がありません。");
  }
}

function parseJsonSafe<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function integerField(value: unknown, name: string, minimum: number, maximum: number, nullable = true): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") {
    if (nullable) return null;
    throw new HttpError(422, "VALIDATION_ERROR", `${name}が必要です。`);
  }
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new HttpError(422, "VALIDATION_ERROR", `${name}は${minimum}〜${maximum}の整数で入力してください。`);
  }
  return number;
}

function textField(value: unknown, name: string, maximum: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new HttpError(422, "VALIDATION_ERROR", `${name}の形式が正しくありません。`);
  const text = value.trim();
  if (text.length > maximum) throw new HttpError(422, "VALIDATION_ERROR", `${name}は${maximum}文字以内で入力してください。`);
  return text || null;
}

function urlField(value: unknown, name: string): string | null | undefined {
  const text = textField(value, name, 1000);
  if (text == null) return text;
  try {
    const url = new URL(text);
    if (!["https:", "http:"].includes(url.protocol)) throw new Error();
    return url.toString();
  } catch {
    throw new HttpError(422, "VALIDATION_ERROR", `${name}はhttpまたはhttpsのURLで入力してください。`);
  }
}

function requireVersion(value: unknown): number {
  const version = integerField(value, "更新バージョン", 1, Number.MAX_SAFE_INTEGER, false);
  return version as number;
}

async function ownedWork(env: Env, auth: AuthContext, workId: string): Promise<Row> {
  const work = await env.DB.prepare(
    "SELECT * FROM works WHERE id = ? AND owner_id = ? AND deleted_at IS NULL LIMIT 1"
  ).bind(workId, auth.member.id).first<Row>();
  if (!work) throw new HttpError(404, "NOT_FOUND", "作品が見つかりません。");
  return work;
}

function cleanStringArray(value: unknown, name: string, maximumItems: number, maximumLength: number): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new HttpError(422, "VALIDATION_ERROR", `${name}は文字列の配列で入力してください。`);
  }
  const result = Array.from(new Set(value.map((item) => item.trim()).filter(Boolean)));
  if (result.length > maximumItems || result.some((item) => item.length > maximumLength)) {
    throw new HttpError(422, "VALIDATION_ERROR", `${name}の件数または文字数が上限を超えています。`);
  }
  return result;
}

function cleanWorkFacts(value: unknown): JsonObject | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(422, "VALIDATION_ERROR", "作品情報の形式が正しくありません。");
  }
  const source = value as JsonObject;
  const result: JsonObject = {};
  for (const key of WORK_FACT_KEYS) {
    const raw = source[key];
    if (raw === undefined || raw === null || raw === "") continue;
    if (["volume_number", "page_count"].includes(key)) {
      result[key] = integerField(raw, key, 0, 100000) ?? undefined;
    } else if (key === "official_url") {
      result[key] = urlField(raw, "作品公式URL") ?? undefined;
    } else {
      result[key] = textField(raw, key, 500) ?? undefined;
    }
  }
  return result;
}

function cleanCreators(value: unknown): JsonObject[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new HttpError(422, "VALIDATION_ERROR", "作者情報は配列で入力してください。");
  if (value.length > 12) throw new HttpError(422, "VALIDATION_ERROR", "作者情報は12人までです。");
  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new HttpError(422, "VALIDATION_ERROR", `${index + 1}人目の作者情報が正しくありません。`);
    }
    const item = raw as CreatorFact;
    const result: JsonObject = {};
    const name = textField(item.name, "作者名", 300);
    if (!name) throw new HttpError(422, "VALIDATION_ERROR", `${index + 1}人目の作者名がありません。`);
    result.name = name;
    const reading = textField(item.reading, "作者名の読み", 300);
    const birthYear = integerField(item.birth_year, "生年", 0, 3000);
    const deathYear = integerField(item.death_year, "没年", 0, 3000);
    const nationality = textField(item.nationality, "国籍・活動国", 200);
    const occupations = cleanStringArray(item.occupations, "職業", 12, 100);
    const biography = textField(item.biography, "作者プロフィール", 1600);
    const officialUrl = urlField(item.official_url, "作者公式URL");
    if (reading) result.reading = reading;
    if (birthYear != null) result.birth_year = birthYear;
    if (deathYear != null) result.death_year = deathYear;
    if (nationality) result.nationality = nationality;
    if (occupations?.length) result.occupations = occupations;
    if (biography) result.biography = biography;
    if (officialUrl) result.official_url = officialUrl;
    return result;
  });
}

function cleanSources(value: unknown): JsonObject[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new HttpError(422, "VALIDATION_ERROR", "出典は配列で入力してください。");
  if (value.length > 20) throw new HttpError(422, "VALIDATION_ERROR", "出典は20件までです。");
  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new HttpError(422, "VALIDATION_ERROR", `${index + 1}件目の出典が正しくありません。`);
    }
    const item = raw as SourceFact;
    const url = urlField(item.url, "出典URL");
    if (!url) throw new HttpError(422, "VALIDATION_ERROR", `${index + 1}件目の出典URLがありません。`);
    const result: JsonObject = { url };
    const title = textField(item.title, "出典タイトル", 500);
    const publisher = textField(item.publisher, "出典元", 300);
    const supports = cleanStringArray(item.supports, "出典が裏付ける項目", 30, 100);
    if (title) result.title = title;
    if (publisher) result.publisher = publisher;
    if (supports?.length) result.supports = supports;
    return result;
  });
}

function nonEmptyObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function factTemplate(work: Row): JsonObject {
  const metadata = parseJsonSafe<JsonObject>(work.metadata_json, {});
  const previous = nonEmptyObject(metadata.ai_facts);
  return {
    schema_version: 1,
    work_id: work.id,
    version: Number(work.version),
    input: {
      title: work.title,
      type: work.type,
      creator: work.creator ?? null,
      release_year: work.release_year ?? null
    },
    facts: {
      creator_display: work.creator ?? null,
      release_year: work.release_year ?? null,
      work: nonEmptyObject(previous.work),
      creators: Array.isArray(previous.creators) ? previous.creators : [],
      sources: Array.isArray(previous.sources) ? previous.sources : []
    }
  };
}

function factPrompt(): string {
  return `次の作品について、信頼できる公開情報を調査し、事実だけをJSONで返してください。\n\nルール：\n- 推測、感想、評価、おすすめ度、ジャンル、テーマ、タグは書かない\n- 不明な項目はnullまたは空配列のままにし、埋めるための推測をしない\n- 出版社・著者公式サイト・図書館・ISBNデータベースなど、できる限り一次情報または信頼できる情報源を優先する\n- sourcesにはURLと、その出典が裏付けるJSON項目をsupportsで記録する\n- schema_version、work_id、version、inputは変更しない\n- title、type、status、rating、favorite、short_note、labelsは変更対象にしない\n- 出力は説明文やMarkdownを付けず、JSONだけにする\n\n入力JSONのfactsだけを補完してください。`;
}

export async function updateWorkPreferenceV13(request: Request, env: Env, auth: AuthContext, workId: string): Promise<Response> {
  requireEditor(auth);
  const current = await ownedWork(env, auth, workId);
  const payload = await parseJson<PreferencePayload>(request);
  const version = requireVersion(payload.version);
  if (payload.favorite === undefined && payload.rating === undefined) {
    throw new HttpError(422, "VALIDATION_ERROR", "お気に入りまたは評価を指定してください。");
  }
  if (payload.favorite !== undefined && typeof payload.favorite !== "boolean") {
    throw new HttpError(422, "VALIDATION_ERROR", "お気に入りの形式が正しくありません。");
  }
  const rating = integerField(payload.rating, "評価", 1, 5);
  const metadata = parseJsonSafe<JsonObject>(current.metadata_json, {});
  if (payload.favorite !== undefined) metadata.favorite = payload.favorite;
  const nextRating = rating === undefined ? current.rating ?? null : rating;
  const serialized = JSON.stringify(metadata);
  if (serialized.length > 30_000) throw new HttpError(422, "VALIDATION_ERROR", "作品情報が大きすぎます。");
  const now = nowIso();
  const result = await env.DB.prepare(
    "UPDATE works SET rating = ?, metadata_json = ?, version = version + 1, updated_at = ? WHERE id = ? AND owner_id = ? AND version = ? AND deleted_at IS NULL"
  ).bind(nextRating, serialized, now, workId, auth.member.id, version).run();
  if ((result.meta.changes ?? 0) === 0) throw new HttpError(409, "CONFLICT", "別の画面で更新されています。作品を開き直してください。");
  await env.DB.prepare(
    "INSERT INTO audit_events (id, actor_id, target_id, action, before_json, after_json, created_at) VALUES (?, ?, ?, 'WORK_PREFERENCE_UPDATED', ?, ?, ?)"
  ).bind(newId(), auth.member.id, workId, JSON.stringify({ rating: current.rating, favorite: Boolean(metadata.favorite) }), JSON.stringify({ rating: nextRating, favorite: metadata.favorite }), now).run();
  return getWork(env, auth, workId);
}

export async function getWorkFactPackageV13(env: Env, auth: AuthContext, workId: string): Promise<Response> {
  requireEditor(auth);
  const work = await ownedWork(env, auth, workId);
  return json({ prompt: factPrompt(), template: factTemplate(work) });
}

export async function importWorkFactsV13(request: Request, env: Env, auth: AuthContext, workId: string): Promise<Response> {
  requireEditor(auth);
  const current = await ownedWork(env, auth, workId);
  const payload = await parseJson<FactPayload>(request);
  const version = requireVersion(payload.version);
  if (payload.work_id !== undefined && payload.work_id !== workId) {
    throw new HttpError(422, "VALIDATION_ERROR", "別の作品のJSONです。");
  }
  if (!payload.facts || typeof payload.facts !== "object") {
    throw new HttpError(422, "VALIDATION_ERROR", "factsがありません。");
  }

  const creatorDisplay = textField(payload.facts.creator_display, "作者・監督", 300);
  const releaseYear = integerField(payload.facts.release_year, "発表年", 0, 3000);
  const workFacts = cleanWorkFacts(payload.facts.work);
  const creators = cleanCreators(payload.facts.creators);
  const sources = cleanSources(payload.facts.sources);
  if (!creatorDisplay && releaseYear == null && !Object.keys(workFacts ?? {}).length && !creators?.length && !sources?.length) {
    throw new HttpError(422, "VALIDATION_ERROR", "取り込める事実情報がありません。");
  }

  const metadata = parseJsonSafe<JsonObject>(current.metadata_json, {});
  const previous = nonEmptyObject(metadata.ai_facts);
  const previousWork = nonEmptyObject(previous.work);
  metadata.ai_facts = {
    ...previous,
    work: { ...previousWork, ...(workFacts ?? {}) },
    creators: creators?.length ? creators : (Array.isArray(previous.creators) ? previous.creators : []),
    sources: sources?.length ? sources : (Array.isArray(previous.sources) ? previous.sources : []),
    updated_at: nowIso(),
    import_method: "copied_json"
  };
  const serialized = JSON.stringify(metadata);
  if (serialized.length > 30_000) throw new HttpError(422, "VALIDATION_ERROR", "AIファクト情報が大きすぎます。内容を減らしてください。");

  const nextCreator = creatorDisplay || current.creator || null;
  const nextReleaseYear = releaseYear == null ? current.release_year ?? null : releaseYear;
  const now = nowIso();
  const result = await env.DB.prepare(
    "UPDATE works SET creator = ?, release_year = ?, metadata_json = ?, version = version + 1, updated_at = ? WHERE id = ? AND owner_id = ? AND version = ? AND deleted_at IS NULL"
  ).bind(nextCreator, nextReleaseYear, serialized, now, workId, auth.member.id, version).run();
  if ((result.meta.changes ?? 0) === 0) throw new HttpError(409, "CONFLICT", "別の画面で更新されています。JSONをもう一度出力してください。");

  await rebuildWorkSearchText(env, workId, auth.member.id);
  await env.DB.prepare(
    "INSERT INTO audit_events (id, actor_id, target_id, action, before_json, after_json, created_at) VALUES (?, ?, ?, 'WORK_FACTS_IMPORTED', ?, ?, ?)"
  ).bind(newId(), auth.member.id, workId, JSON.stringify({ version: current.version }), JSON.stringify({ version: version + 1, fields: { creator: Boolean(creatorDisplay), release_year: releaseYear != null, work: Object.keys(workFacts ?? {}), creators: creators?.length ?? 0, sources: sources?.length ?? 0 } }), now).run();
  return getWork(env, auth, workId);
}
