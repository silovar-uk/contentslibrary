import { $, esc, fmtDateTime } from "../core/dom.js";
import { NOTE_LABELS } from "../core/format.js";
import { state, subscribe } from "../core/store.js";
import { decorateDetailDocument } from "./detail-document.js";

let initialized = false;
let observer = null;
let launcherObserver = null;
let frame = 0;

function ensureStyle() {
  let link = $('link[href="/styles/detail-top-notes.css"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/styles/detail-top-notes.css";
    document.head.append(link);
  }
  if (!$('link[href="/styles/mobile-grouped-detail.css"]')) {
    const mobile = document.createElement("link");
    mobile.rel = "stylesheet";
    mobile.href = "/styles/mobile-grouped-detail.css";
    document.head.append(mobile);
  }
}

export function recentDetailNotes(notes = [], limit = 3) {
  return [...notes]
    .sort((a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")))
    .slice(0, limit);
}

function noteSignature(notes) {
  return notes.map((note) => [note.id, note.updated_at || note.created_at || "", note.content || "", note.note_type || "", note.position || ""].join("::")).join("||");
}

function noteRowMarkup(note) {
  const kind = NOTE_LABELS[note.note_type] || note.note_type || "メモ";
  const time = note.updated_at || note.created_at;
  return `<button type="button" class="detail-top-note-row" data-edit-note="${esc(note.id)}" title="クリックして編集">
    <span class="detail-top-note-meta"><strong>${esc(kind)}</strong>${note.position ? `<span>${esc(note.position)}</span>` : ""}${time ? `<time>${esc(fmtDateTime(time))}</time>` : ""}</span>
    <span class="detail-top-note-content">${esc(note.content || "")}</span>
    <span class="detail-top-note-edit" aria-hidden="true">編集</span>
  </button>`;
}

function recentNotesMarkup(notes, total) {
  return `<section id="detailTopNotes" class="detail-top-notes detail-section" aria-label="最近のメモ">
    <div class="detail-top-notes-heading">
      <div><span>YOUR NOTES</span><h3>最近のメモ</h3></div>
      <button type="button" class="text-button" data-top-notes-scroll ${total ? "" : "disabled"}>すべて見る${total ? `（${total}）` : ""}</button>
    </div>
    <div class="detail-top-notes-list">
      ${notes.length ? notes.map(noteRowMarkup).join("") : '<p class="detail-top-notes-empty">まだメモはありません。下の入力欄から、ひとこと残せます。</p>'}
    </div>
  </section>`;
}

function syncRecentNotes(panel) {
  const preference = panel.querySelector(".preference-panel");
  const detail = state.selected;
  if (!preference || !detail?.work) return null;

  const notes = Array.isArray(detail.notes) ? detail.notes : [];
  const recent = recentDetailNotes(notes, 3);
  const signature = `${detail.work.id}|${notes.length}|${noteSignature(recent)}`;
  let section = panel.querySelector("#detailTopNotes");

  if (!section) {
    const wrap = document.createElement("div");
    wrap.innerHTML = recentNotesMarkup(recent, notes.length).trim();
    section = wrap.firstElementChild;
    preference.after(section);
  } else {
    if (section.previousElementSibling !== preference) preference.after(section);
    if (section.dataset.signature !== signature) section.outerHTML = recentNotesMarkup(recent, notes.length);
    section = panel.querySelector("#detailTopNotes");
  }

  if (section) section.dataset.signature = signature;
  return section;
}

function syncQuickInput(panel, recentSection) {
  const inline = panel.querySelector(".inline-note-section");
  if (!inline || !recentSection) return;

  inline.classList.add("detail-top-note-quick");
  if (inline.previousElementSibling !== recentSection) recentSection.after(inline);

  const heading = inline.querySelector("h3");
  if (heading && heading.textContent !== "メモを書き足す") heading.textContent = "メモを書き足す";

  const textarea = inline.querySelector('textarea[name="content"]');
  if (textarea) {
    textarea.rows = 1;
    textarea.placeholder = "この作品について、いま残しておきたいこと…";
    textarea.setAttribute("aria-label", "クイックメモ");
  }

  const submit = inline.querySelector('button[type="submit"]');
  if (submit && submit.textContent !== "追加") submit.textContent = "追加";
}

function applyTopNotes() {
  const panel = $("#detailPanel");
  if (!panel || !state.selected) return;
  const recent = syncRecentNotes(panel);
  syncQuickInput(panel, recent);
  decorateDetailDocument(panel);
}

function scheduleApply() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(applyTopNotes);
}

function scrollToFullNotes() {
  const list = $("#detailPanel .note-item-list");
  const section = list?.closest(".detail-section");
  if (!section) return;
  section.scrollIntoView({ behavior: "smooth", block: "start" });
  section.classList.add("detail-notes-highlight");
  setTimeout(() => section.classList.remove("detail-notes-highlight"), 900);
}

function setupFactChatGptLauncher() {
  const button = $('[data-fact-copy="all"]');
  if (!button) return;
  button.removeAttribute("data-fact-copy");
  button.dataset.factChatgpt = "";
  button.textContent = "ChatGPTに聞く";
  button.title = "プロンプトと作品JSONをChatGPTで開く";
}

function setupWordMemoChatGptLauncher() {
  const button = $('[data-word-memo-copy="prompt"]');
  if (!button) return;
  button.removeAttribute("data-word-memo-copy");
  button.dataset.wordMemoChatgpt = "";
  button.textContent = "ChatGPTに聞く";
  button.title = "書評調査プロンプトをChatGPTで開く";
}

function openPromptInChatGpt(prompt) {
  if (!prompt) return;
  const url = `https://chatgpt.com/?prompt=${encodeURIComponent(prompt)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function openFactPromptInChatGpt() {
  const output = $("#factOutput");
  const prompt = output?.value || "";
  if (!prompt || prompt === "読み込み中…") return;
  openPromptInChatGpt(prompt);
}

function openWordMemoPromptInChatGpt() {
  const output = $("#wordMemoResearchPrompt");
  openPromptInChatGpt(output?.value || "");
}

export function initDetailTopNotes() {
  if (initialized) return;
  initialized = true;
  ensureStyle();
  setupFactChatGptLauncher();
  setupWordMemoChatGptLauncher();

  const panel = $("#detailPanel");
  if (panel) {
    observer = new MutationObserver(scheduleApply);
    observer.observe(panel, { childList: true, subtree: true });
  }

  launcherObserver = new MutationObserver(() => {
    setupFactChatGptLauncher();
    setupWordMemoChatGptLauncher();
  });
  launcherObserver.observe(document.body, { childList: true, subtree: true });

  subscribe(scheduleApply);

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-top-notes-scroll]")) {
      event.preventDefault();
      scrollToFullNotes();
    }
    if (event.target.closest("[data-fact-chatgpt]")) {
      event.preventDefault();
      openFactPromptInChatGpt();
    }
    if (event.target.closest("[data-word-memo-chatgpt]")) {
      event.preventDefault();
      openWordMemoPromptInChatGpt();
    }
  });

  scheduleApply();
}
