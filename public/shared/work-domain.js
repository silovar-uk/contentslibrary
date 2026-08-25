// @ts-check

export const WORK_TYPE_OPTIONS = /** @type {const} */ ([
  ["book", "本"],
  ["manga", "漫画"],
  ["movie", "映画"],
  ["anime", "アニメ"],
  ["drama", "ドラマ"],
  ["video", "動画"],
  ["article", "記事"],
  ["other", "その他"]
]);

export const WORK_STATUS_OPTIONS = /** @type {const} */ ([
  ["want", "読みたい・見たい"],
  ["owned_unread", "所持・未読"],
  ["active", "進行中"],
  ["completed", "完了"],
  ["paused", "一時停止"],
  ["dropped", "中断"]
]);

export const NOTE_TYPE_OPTIONS = /** @type {const} */ ([
  ["quick", "一言"],
  ["summary", "要約"],
  ["impression", "印象"],
  ["quote", "引用"],
  ["idea", "自分の考え"],
  ["connection", "接続"],
  ["progress", "途中メモ"]
]);

export const WORK_TYPES = Object.freeze(WORK_TYPE_OPTIONS.map(([value]) => value));
export const WORK_STATUSES = Object.freeze(WORK_STATUS_OPTIONS.map(([value]) => value));
export const NOTE_TYPES = Object.freeze(NOTE_TYPE_OPTIONS.map(([value]) => value));

export const TYPE_LABELS = Object.freeze(Object.fromEntries(WORK_TYPE_OPTIONS));
export const STATUS_LABELS = Object.freeze(Object.fromEntries(WORK_STATUS_OPTIONS));
export const NOTE_LABELS = Object.freeze(Object.fromEntries(NOTE_TYPE_OPTIONS));

export const DEFAULT_WORK_TYPE = "book";
export const DEFAULT_WORK_STATUS = "want";
export const DEFAULT_NOTE_TYPE = "quick";

export function isWorkType(value) {
  return typeof value === "string" && WORK_TYPES.includes(/** @type {any} */ (value));
}

export function isWorkStatus(value) {
  return typeof value === "string" && WORK_STATUSES.includes(/** @type {any} */ (value));
}

export function isNoteType(value) {
  return typeof value === "string" && NOTE_TYPES.includes(/** @type {any} */ (value));
}

export function optionMarkup(options, { includeBlank = false, blankLabel = "すべて" } = {}) {
  const rows = options.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
  return includeBlank ? `<option value="">${blankLabel}</option>${rows}` : rows;
}
