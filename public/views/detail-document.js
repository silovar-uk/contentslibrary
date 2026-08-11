function sectionLabelMarkup(key, eyebrow, title) {
  return `<div class="detail-doc-label" data-detail-doc-label="${key}"><span>${eyebrow}</span><strong>${title}</strong></div>`;
}

function ensureLabel(panel, key, anchor, eyebrow, title) {
  if (!anchor) return;
  const existing = panel.querySelector(`[data-detail-doc-label="${key}"]`);
  if (existing?.nextElementSibling === anchor) return;
  existing?.remove();
  const holder = document.createElement("div");
  holder.innerHTML = sectionLabelMarkup(key, eyebrow, title);
  anchor.before(holder.firstElementChild);
}

function sectionByHeading(panel, text) {
  return [...panel.querySelectorAll(":scope > .detail-section")]
    .find((section) => section.querySelector(":scope > h3")?.textContent?.trim() === text) || null;
}

export function decorateDetailDocument(panel) {
  if (!panel?.querySelector(".detail-header")) return;
  panel.classList.add("detail-document");

  const header = panel.querySelector(".detail-header");
  const cover = panel.querySelector(":scope > .cover-section");
  const preference = panel.querySelector(":scope > .preference-panel");
  const recentNotes = panel.querySelector(":scope > #detailTopNotes");
  const quickNote = panel.querySelector(":scope > .inline-note-section");
  const shortNote = sectionByHeading(panel, "一言メモ");
  const classification = panel.querySelector(":scope > .classification-section");
  const facts = panel.querySelector(":scope > .fact-section");
  const experience = panel.querySelector(":scope > .detail-section .timeline")?.closest(".detail-section");
  const notes = panel.querySelector(":scope > .detail-section .note-item-list")?.closest(".detail-section");
  const progress = sectionByHeading(panel, "進捗・情報");
  const danger = panel.querySelector(":scope > .detail-section .danger-zone")?.closest(".detail-section");

  header.classList.add("detail-doc-identity");
  cover?.classList.add("detail-doc-cover");
  preference?.classList.add("detail-doc-properties");
  recentNotes?.classList.add("detail-doc-relationship");
  quickNote?.classList.add("detail-doc-relationship");
  shortNote?.classList.add("detail-doc-relationship");
  classification?.classList.add("detail-doc-about");
  facts?.classList.add("detail-doc-about");
  progress?.classList.add("detail-doc-about");
  experience?.classList.add("detail-doc-history");
  notes?.classList.add("detail-doc-history");
  danger?.classList.add("detail-doc-danger");

  ensureLabel(panel, "work", cover || preference, "WORK", "作品");
  ensureLabel(panel, "relationship", preference, "MY RELATIONSHIP", "自分との関係");
  ensureLabel(panel, "about", shortNote || classification || facts || progress, "ABOUT THE WORK", "作品について");
  ensureLabel(panel, "history", experience || notes, "HISTORY", "記録の履歴");
}
