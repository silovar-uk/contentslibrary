import { normalizeText } from "./normalize.js";

export const IMPORT_SOURCES = /** @type {const} */ (["manual", "titles", "json", "chatgpt", "file"]);

export function workIdentityKey(type, title) {
  return `${String(type || "")}::${normalizeText(String(title || ""))}`;
}

export function buildExistingWorkKeys(works) {
  return new Set(Array.from(works || [], (work) => workIdentityKey(work?.type, work?.title)));
}

export function createImportDraftWork({
  source,
  originalInput = null,
  payload,
  errors = [],
  warnings = [],
  duplicateInInput = false,
  alreadyExists = false,
  allowDuplicates = false
}) {
  const validationErrors = [...errors];
  const validationWarnings = [...warnings];
  return {
    source,
    originalInput,
    payload,
    validation: {
      errors: validationErrors,
      warnings: validationWarnings
    },
    duplicate: {
      inInput: Boolean(duplicateInInput),
      existing: Boolean(alreadyExists)
    },
    selectable: validationErrors.length === 0 && !duplicateInInput && (allowDuplicates || !alreadyExists)
  };
}
