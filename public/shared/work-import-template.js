import { DEFAULT_NOTE_TYPE, DEFAULT_WORK_STATUS, DEFAULT_WORK_TYPE } from "./work-domain.js";

export function workImportTemplateValue() {
  return [
    {
      title: "作品名",
      type: DEFAULT_WORK_TYPE,
      status: DEFAULT_WORK_STATUS,
      creator: "著者名",
      release_year: 2026,
      rating: null,
      short_note: "",
      labels: { genre: ["小説"], theme: [], tag: [] },
      metadata: {},
      experiences: [],
      notes: [{ note_type: DEFAULT_NOTE_TYPE, content: "あとから戻りたいメモ", position: null }]
    }
  ];
}

export function workImportTemplateJson() {
  return JSON.stringify(workImportTemplateValue(), null, 2);
}
