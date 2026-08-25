import { buildExistingWorkKeys, createImportDraftWork, workIdentityKey } from "./import-draft.js";
import {
  DEFAULT_NOTE_TYPE,
  DEFAULT_WORK_STATUS,
  DEFAULT_WORK_TYPE,
  isNoteType,
  isWorkStatus,
  isWorkType
} from "./work-domain.js";

function stripCodeFence(value) {
  const text = String(value || "").replace(/^\uFEFF/, "").trim();
  if (!text.startsWith("```")) return text;
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function plainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function nullableNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

function stringValue(value, max, field, errors, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) errors.push(`${field}は必須です`);
    return null;
  }
  if (typeof value !== "string") {
    errors.push(`${field}は文字列で入力してください`);
    return null;
  }
  const text = value.trim();
  if (required && !text) errors.push(`${field}は必須です`);
  if (text.length > max) errors.push(`${field}は${max}文字以内です`);
  return text || null;
}

function numberValue(value, field, errors, options = {}) {
  const number = nullableNumber(value);
  if (number === null) return null;
  if (!Number.isFinite(number)) {
    errors.push(`${field}は数値で入力してください`);
    return null;
  }
  if (options.integer && !Number.isInteger(number)) errors.push(`${field}は整数で入力してください`);
  if (options.min !== undefined && number < options.min) errors.push(`${field}は${options.min}以上です`);
  if (options.max !== undefined && number > options.max) errors.push(`${field}は${options.max}以下です`);
  if (options.halfStep && Math.round(number * 2) !== number * 2) errors.push(`${field}は0.5刻みです`);
  return number;
}

function labelsValue(value, errors) {
  if (value === undefined || value === null) return { genre: [], theme: [], tag: [] };
  if (!plainObject(value)) {
    errors.push("labelsはオブジェクトで入力してください");
    return { genre: [], theme: [], tag: [] };
  }
  const output = { genre: [], theme: [], tag: [] };
  for (const kind of Object.keys(output)) {
    const source = value[kind] ?? [];
    if (!Array.isArray(source) || source.some((item) => typeof item !== "string")) {
      errors.push(`labels.${kind}は文字列の配列で入力してください`);
      continue;
    }
    const clean = Array.from(new Set(source.map((item) => item.trim()).filter(Boolean)));
    if (clean.length > 30) errors.push(`labels.${kind}は30件以内です`);
    if (clean.some((item) => item.length > 40)) errors.push(`labels.${kind}は1件40文字以内です`);
    output[kind] = clean.slice(0, 30);
  }
  return output;
}

function metadataValue(value, errors) {
  if (value === undefined || value === null) return {};
  if (!plainObject(value)) {
    errors.push("metadataはオブジェクトで入力してください");
    return {};
  }
  try {
    if (JSON.stringify(value).length > 10_000) errors.push("metadataが大きすぎます");
  } catch {
    errors.push("metadataをJSONとして扱えません");
    return {};
  }
  return value;
}

function experienceValue(value, index, errors) {
  const prefix = `体験${index + 1}`;
  if (!plainObject(value)) {
    errors.push(`${prefix}の形式が正しくありません`);
    return null;
  }
  const localErrors = [];
  const rating = numberValue(value.rating, `${prefix}.rating`, localErrors, { min: 0.5, max: 5, halfStep: true });
  const progressCurrent = numberValue(value.progress_current, `${prefix}.progress_current`, localErrors, { min: 0 });
  const progressTotal = numberValue(value.progress_total, `${prefix}.progress_total`, localErrors, { min: 0 });
  if (progressCurrent !== null && progressTotal !== null && progressCurrent > progressTotal) localErrors.push(`${prefix}の現在位置が全体を超えています`);
  const result = {
    source_id: value.id == null ? null : String(value.id),
    started_at: stringValue(value.started_at, 30, `${prefix}.started_at`, localErrors),
    completed_at: stringValue(value.completed_at, 30, `${prefix}.completed_at`, localErrors),
    rating,
    progress_current: progressCurrent,
    progress_total: progressTotal,
    memo: stringValue(value.memo, 50_000, `${prefix}.memo`, localErrors)
  };
  errors.push(...localErrors);
  return result;
}

function noteValue(value, index, errors) {
  const prefix = `メモ${index + 1}`;
  if (!plainObject(value)) {
    errors.push(`${prefix}の形式が正しくありません`);
    return null;
  }
  const localErrors = [];
  const noteType = value.note_type == null ? DEFAULT_NOTE_TYPE : String(value.note_type);
  if (!isNoteType(noteType)) localErrors.push(`${prefix}.note_typeが正しくありません`);
  const result = {
    source_id: value.id == null ? null : String(value.id),
    source_experience_id: value.experience_id == null ? null : String(value.experience_id),
    note_type: isNoteType(noteType) ? noteType : DEFAULT_NOTE_TYPE,
    content: stringValue(value.content, 50_000, `${prefix}.content`, localErrors, { required: true }),
    position: stringValue(value.position, 100, `${prefix}.position`, localErrors)
  };
  errors.push(...localErrors);
  return result;
}

export function parseJsonImportContainer(rawText) {
  const text = stripCodeFence(rawText);
  if (!text) return { works: [], experiences: [], notes: [], source: "empty", warnings: [] };
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`JSONを解析できません。${error.message}`);
  }

  if (Array.isArray(parsed)) return { works: parsed, experiences: [], notes: [], source: "array", warnings: [] };
  if (!plainObject(parsed)) throw new Error("JSONは作品の配列、またはworks配列を持つオブジェクトにしてください。");
  if (Array.isArray(parsed.works)) {
    return {
      works: parsed.works,
      experiences: Array.isArray(parsed.experiences) ? parsed.experiences : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      source: "backup",
      warnings: []
    };
  }
  if (Array.isArray(parsed.items)) return { works: parsed.items, experiences: [], notes: [], source: "items", warnings: [] };
  if (typeof parsed.title === "string") return { works: [parsed], experiences: [], notes: [], source: "single", warnings: [] };
  throw new Error("works配列が見つかりません。配列そのものを貼り付けることもできます。");
}

function sourceChildren(container, rawWork, index) {
  const sourceId = rawWork?.id == null ? null : String(rawWork.id);
  const nestedExperiences = Array.isArray(rawWork?.experiences) ? rawWork.experiences : [];
  const nestedNotes = Array.isArray(rawWork?.notes) ? rawWork.notes : [];
  const topExperiences = sourceId ? container.experiences.filter((item) => String(item?.work_id ?? "") === sourceId) : [];
  const topNotes = sourceId ? container.notes.filter((item) => String(item?.work_id ?? "") === sourceId) : [];
  if (!sourceId && container.works.length === 1) {
    return {
      experiences: [...nestedExperiences, ...container.experiences],
      notes: [...nestedNotes, ...container.notes]
    };
  }
  return { experiences: [...nestedExperiences, ...topExperiences], notes: [...nestedNotes, ...topNotes], index };
}

function canonicalRetryValue(item) {
  return {
    ...item.payload,
    experiences: item.experiences.map(({ source_id, ...experience }) => ({ id: source_id, ...experience })),
    notes: item.notes.map(({ source_id, source_experience_id, ...note }) => ({ id: source_id, experience_id: source_experience_id, ...note }))
  };
}

export function adaptJsonImport(rawText, { existingWorks = [], allowDuplicates = false, maxWorks = 10 } = {}) {
  let container;
  try {
    container = parseJsonImportContainer(rawText);
  } catch (error) {
    return { parseError: error.message, source: null, items: [], drafts: [], candidates: [], rawCount: 0, overLimit: false, warnings: [] };
  }

  const existing = buildExistingWorkKeys(existingWorks);
  const seen = new Set();
  const items = container.works.map((rawWork, index) => {
    const errors = [];
    if (!plainObject(rawWork)) errors.push("作品はオブジェクトで入力してください");
    const source = plainObject(rawWork) ? rawWork : {};
    const title = stringValue(source.title, 300, "title", errors, { required: true }) || `作品${index + 1}`;
    const rawType = source.type == null ? DEFAULT_WORK_TYPE : String(source.type);
    const rawStatus = source.status == null ? DEFAULT_WORK_STATUS : String(source.status);
    if (!isWorkType(rawType)) errors.push("typeが正しくありません");
    if (!isWorkStatus(rawStatus)) errors.push("statusが正しくありません");
    const progressCurrent = numberValue(source.progress_current, "progress_current", errors, { min: 0 });
    const progressTotal = numberValue(source.progress_total, "progress_total", errors, { min: 0 });
    if (progressCurrent !== null && progressTotal !== null && progressCurrent > progressTotal) errors.push("progress_currentがprogress_totalを超えています");
    const payload = {
      title,
      type: isWorkType(rawType) ? rawType : DEFAULT_WORK_TYPE,
      status: isWorkStatus(rawStatus) ? rawStatus : DEFAULT_WORK_STATUS,
      creator: stringValue(source.creator, 300, "creator", errors),
      release_year: numberValue(source.release_year, "release_year", errors, { integer: true, min: 0, max: 3000 }),
      rating: numberValue(source.rating, "rating", errors, { min: 0.5, max: 5, halfStep: true }),
      short_note: stringValue(source.short_note, 280, "short_note", errors),
      progress_current: progressCurrent,
      progress_total: progressTotal,
      unit_label: stringValue(source.unit_label, 30, "unit_label", errors),
      metadata: metadataValue(source.metadata, errors),
      labels: labelsValue(source.labels, errors)
    };
    const children = sourceChildren(container, source, index);
    const experiences = children.experiences.map((value, childIndex) => experienceValue(value, childIndex, errors)).filter(Boolean);
    const notes = children.notes.map((value, childIndex) => noteValue(value, childIndex, errors)).filter(Boolean);
    const key = workIdentityKey(payload.type, payload.title);
    const duplicateInInput = seen.has(key);
    seen.add(key);
    const alreadyExists = existing.has(key);
    const draft = createImportDraftWork({
      source: "json",
      originalInput: source,
      payload,
      errors,
      duplicateInInput,
      alreadyExists,
      allowDuplicates
    });
    const item = {
      index,
      raw: source,
      title: payload.title,
      payload: draft.payload,
      experiences,
      notes,
      errors: draft.validation.errors,
      duplicateInInput: draft.duplicate.inInput,
      alreadyExists: draft.duplicate.existing,
      selectable: draft.selectable,
      draft
    };
    item.retryValue = canonicalRetryValue(item);
    return item;
  });

  const matchedExperienceIds = new Set(items.flatMap((item) => item.experiences.map((experience) => experience.source_id).filter(Boolean)));
  const matchedNoteIds = new Set(items.flatMap((item) => item.notes.map((note) => note.source_id).filter(Boolean)));
  const unmatchedExperiences = container.experiences.filter((item) => item?.id != null && !matchedExperienceIds.has(String(item.id))).length;
  const unmatchedNotes = container.notes.filter((item) => item?.id != null && !matchedNoteIds.has(String(item.id))).length;
  const warnings = [];
  if (unmatchedExperiences) warnings.push(`work_idが一致しない体験${unmatchedExperiences}件は対象外です`);
  if (unmatchedNotes) warnings.push(`work_idが一致しないメモ${unmatchedNotes}件は対象外です`);

  return {
    parseError: null,
    source: container.source,
    rawCount: items.length,
    overLimit: items.length > maxWorks,
    items,
    drafts: items.map((item) => item.draft),
    candidates: items.filter((item) => item.selectable).slice(0, maxWorks),
    warnings
  };
}
