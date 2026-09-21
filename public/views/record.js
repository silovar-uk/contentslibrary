import { $, esc, fmtDate } from "../core/dom.js";
import { api } from "../core/api.js";
import { TYPE_LABELS, statusLabel } from "../core/format.js";
import { state, subscribe } from "../core/store.js";
import { statusChipMarkup } from "./status-visuals.js";
import { readDecisionMemory } from "../core/decision-memory.js";
import { DECISION_SLOT_LABELS } from "../core/decision-deck.js";

let recordData = null;
let loading = false;
let initialized = false;

function ensureStyle() {
  if ($('link[href="/styles/record.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/styles/record.css";
  document.head.append(link);
}

function recentNotesMarkup(items = []) {
  if (!items.length) return '<div class="record-empty">メモを書くと、ここに体験の履歴が残ります。</div>';
  return items.map((note) => `<button type="button" class="record-note" data-open-work="${esc(note.work_id)}"><span><time>${fmtDate(note.updated_at)}</time><strong>${esc(note.title)}</strong></span><p>${esc(note.content || "").slice(0, 180)}</p><b aria-hidden="true">›</b></button>`).join("");
}

function recentWorksMarkup(items = []) {
  if (!items.length) return '<div class="record-empty">最近触れた作品はまだありません。</div>';
  return items.map((work) => {
    const current = state.works.get(String(work.id)) || work;
    return `<button type="button" class="record-work" data-open-work="${esc(current.id)}"><span class="type-pill">${esc(TYPE_LABELS[current.type] || current.type)}</span><span class="record-work-copy"><strong>${esc(current.title)}</strong><small>${esc(current.short_note || statusLabel(current.type, current.status))}</small></span>${statusChipMarkup(current.type, current.status)}<time>${fmtDate(current.updated_at)}</time></button>`;
  }).join("");
}

function decisionMemoryMarkup(entries = []) {
  if (!entries.length) return '<div class="record-empty">CHOOSEで「これにする」を押すと、ここに選択の履歴が残ります。</div>';
  return entries.slice(0, 10).map((entry) => {
    const work = state.works.get(String(entry.work_id));
    const title = work?.title || entry.title || "作品";
    const creator = work?.creator || entry.creator || "";
    const slot = DECISION_SLOT_LABELS[entry.slot] || entry.slot || "CHOOSE";
    const attrs = work ? `button type="button" data-open-work="${esc(entry.work_id)}"` : "div";
    const close = work ? "button" : "div";
    return `<${attrs} class="record-decision">
      <span class="record-decision-kind">${esc(slot)}</span>
      <span class="record-decision-copy">
        <strong>${esc(title)}</strong>
        <small>${esc([creator, entry.reason].filter(Boolean).join(" · "))}</small>
      </span>
      <time>${fmtDate(entry.decided_at)}</time>
      ${work ? '<b aria-hidden="true">›</b>' : ""}
    </${close}>`;
  }).join("");
}

function statsMarkup(stats = {}) {
  const rows = [
    ["全作品", stats.total || 0],
    ["読了した本", stats.completed_books || 0],
    ["進行中", stats.active_count || 0],
    ["停止・中断", stats.stopped_count || 0]
  ];
  return rows.map(([label, value]) => `<div class="record-stat"><strong>${value}</strong><span>${label}</span></div>`).join("");
}

export function renderRecord() {
  const view = $("#recordView");
  if (!view || state.view !== "record") return;
  if (!recordData) {
    $("#recordRecentNotes").innerHTML = '<div class="record-empty">記録を読み込み中…</div>';
    $("#recordRecentWorks").innerHTML = '<div class="record-empty">作品を読み込み中…</div>';
    $("#recordStats").innerHTML = "";
    return;
  }

  $("#recordRecentNotes").innerHTML = recentNotesMarkup(recordData.recentNotes || []);
  $("#recordRecentWorks").innerHTML = recentWorksMarkup(recordData.recentOther || []);
  $("#recordDecisions").innerHTML = decisionMemoryMarkup(readDecisionMemory());
  $("#recordStats").innerHTML = statsMarkup(recordData.stats || {});
}

export async function loadRecord({ force = false } = {}) {
  if (loading) return;
  if (recordData && !force) {
    renderRecord();
    return;
  }
  loading = true;
  try {
    recordData = await api("/api/home");
  } finally {
    loading = false;
  }
  renderRecord();
}

export function initRecord() {
  if (initialized) return;
  initialized = true;
  ensureStyle();
  subscribe(renderRecord);
  document.addEventListener("decision-memory-change", renderRecord);
}
