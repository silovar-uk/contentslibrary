import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { adaptJsonImport, parseJsonImportContainer } from "../public/shared/json-import-adapter.js";
import { workImportTemplateJson } from "../public/shared/work-import-template.js";

const chatGptSource = readFileSync(new URL("../public/views/bulk-json-chatgpt.js", import.meta.url), "utf8");

test("空JSONでも同じcontainer shapeを返し、初期Previewを壊さない", () => {
  assert.deepEqual(parseJsonImportContainer(""), {
    works: [],
    experiences: [],
    notes: [],
    source: "empty",
    warnings: []
  });
  const result = adaptJsonImport("");
  assert.equal(result.parseError, null);
  assert.deepEqual(result.items, []);
  assert.deepEqual(result.drafts, []);
});

test("JSONはImportDraftWorkを生成しvideoとarticleも正規の種別として扱う", () => {
  const result = adaptJsonImport(JSON.stringify([
    { title: "動画A", type: "video", status: "want" },
    { title: "記事B", type: "article", status: "owned_unread" }
  ]));

  assert.equal(result.parseError, null);
  assert.equal(result.items.length, 2);
  assert.equal(result.drafts.length, 2);
  assert.equal(result.drafts[0].source, "json");
  assert.equal(result.drafts[0].payload.type, "video");
  assert.equal(result.drafts[1].payload.type, "article");
  assert.equal(result.drafts[1].payload.status, "owned_unread");
  assert.equal(result.drafts.every((draft) => draft.selectable), true);
});

test("既存作品とJSON内重複はImportDraftのduplicate stateへ集約する", () => {
  const result = adaptJsonImport(JSON.stringify([
    { title: "夜と霧", type: "book", status: "want" },
    { title: "夜と霧", type: "book", status: "want" }
  ]), {
    existingWorks: [{ title: "夜と霧", type: "book" }]
  });

  assert.deepEqual(result.drafts[0].duplicate, { inInput: false, existing: true });
  assert.equal(result.drafts[0].selectable, false);
  assert.deepEqual(result.drafts[1].duplicate, { inInput: true, existing: true });
  assert.equal(result.drafts[1].selectable, false);
});

test("不正type/statusと進捗矛盾はDraft validation errorになる", () => {
  const result = adaptJsonImport(JSON.stringify([
    { title: "X", type: "podcast", status: "unknown", progress_current: 10, progress_total: 5 }
  ]));
  const errors = result.drafts[0].validation.errors.join(" / ");
  assert.match(errors, /typeが正しくありません/);
  assert.match(errors, /statusが正しくありません/);
  assert.match(errors, /progress_currentがprogress_totalを超えています/);
  assert.equal(result.drafts[0].selectable, false);
});

test("バックアップ形式の子要素を作品へ結び直し、再試行JSONを生成できる", () => {
  const result = adaptJsonImport(JSON.stringify({
    works: [{ id: "w1", title: "本A", type: "book", status: "want" }],
    experiences: [{ id: "e1", work_id: "w1", memo: "感想" }],
    notes: [{ id: "n1", work_id: "w1", experience_id: "e1", note_type: "idea", content: "考え" }]
  }));
  assert.equal(result.items[0].experiences.length, 1);
  assert.equal(result.items[0].notes.length, 1);
  assert.equal(result.items[0].retryValue.experiences[0].id, "e1");
  assert.equal(result.items[0].retryValue.notes[0].experience_id, "e1");
});

test("JSONひな形とChatGPT promptは共通Domainを参照する", () => {
  const template = JSON.parse(workImportTemplateJson());
  assert.equal(template[0].type, "book");
  assert.equal(template[0].status, "want");
  assert.equal(template[0].notes[0].note_type, "quick");
  assert.match(chatGptSource, /WORK_TYPES\.join\(" \/ "\)/);
  assert.match(chatGptSource, /WORK_STATUSES\.join\(" \/ "\)/);
  assert.match(chatGptSource, /workImportTemplateJson\(\)/);
  assert.doesNotMatch(chatGptSource, /movie \/ anime \/ drama \/ other のいずれか/);
});
