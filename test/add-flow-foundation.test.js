import test from "node:test";
import assert from "node:assert/strict";

import {
  NOTE_TYPE_OPTIONS,
  WORK_STATUS_OPTIONS,
  WORK_TYPE_OPTIONS,
  NOTE_TYPES,
  WORK_STATUSES,
  WORK_TYPES,
  TYPE_LABELS,
  STATUS_LABELS
} from "../public/shared/work-domain.js";
import { buildExistingWorkKeys, createImportDraftWork, workIdentityKey } from "../public/shared/import-draft.js";

test("work domain exposes one complete option set", () => {
  assert.deepEqual(WORK_TYPES, WORK_TYPE_OPTIONS.map(([value]) => value));
  assert.deepEqual(WORK_STATUSES, WORK_STATUS_OPTIONS.map(([value]) => value));
  assert.deepEqual(NOTE_TYPES, NOTE_TYPE_OPTIONS.map(([value]) => value));
  assert.deepEqual(WORK_TYPES, ["book", "manga", "movie", "anime", "drama", "video", "article", "other"]);
  assert.deepEqual(WORK_STATUSES, ["want", "owned_unread", "active", "completed", "paused", "dropped"]);
  assert.equal(TYPE_LABELS.video, "動画");
  assert.equal(TYPE_LABELS.article, "記事");
  assert.equal(STATUS_LABELS.owned_unread, "所持・未読");
});

test("import draft shares duplicate and selectable semantics", () => {
  const existing = buildExistingWorkKeys([
    { type: "book", title: "夜と霧" },
    { type: "movie", title: "夜と霧" }
  ]);
  assert.equal(existing.has(workIdentityKey("book", "夜と霧")), true);
  assert.equal(existing.has(workIdentityKey("manga", "夜と霧")), false);

  const duplicate = createImportDraftWork({
    source: "titles",
    originalInput: "夜と霧",
    payload: { title: "夜と霧", type: "book", status: "want" },
    alreadyExists: true,
    allowDuplicates: false
  });
  assert.equal(duplicate.selectable, false);
  assert.deepEqual(duplicate.duplicate, { inInput: false, existing: true });

  const allowedDuplicate = createImportDraftWork({
    source: "titles",
    originalInput: "夜と霧",
    payload: { title: "夜と霧", type: "book", status: "want" },
    alreadyExists: true,
    allowDuplicates: true
  });
  assert.equal(allowedDuplicate.selectable, true);

  const invalid = createImportDraftWork({
    source: "titles",
    payload: { title: "", type: "book", status: "want" },
    errors: ["タイトルは必須です"]
  });
  assert.equal(invalid.selectable, false);
  assert.deepEqual(invalid.validation.errors, ["タイトルは必須です"]);
});
