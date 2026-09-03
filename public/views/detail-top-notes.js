import { $, esc, fmtDateTime, setBusy, toast } from "../core/dom.js";
import { api } from "../core/api.js";
import { NOTE_LABELS } from "../core/format.js";
import { state, setSelectedDetail, subscribe } from "../core/store.js";
import { decorateDetailDocument } from "./detail-document.js";

let initialized = false;
let observer = null;
let launcherObserver = null;
let frame = 0;
let lastSavedNoteId = null;
let savedMarkerTimer = 0;

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
  const savedClass = String(note.id) === String(lastSavedNoteId || "") ? " is-just-saved" : "";
  return `<button type="button" class="detail-top-note-row${savedClass}" data-edit-note="${esc(note.id)}" title="クリックして編集">
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
  const signature = `${detail.work.id}|${notes.length}|${noteSignature(recent)}|${lastSavedNoteId || ""}`;
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

function ensureInlineStatus(inline) {
  const form = inline?.querySelector(".inline-note-form");
  if (!form) return null;
  let status = form.querySelector(".inline-note-status");
  if (!status) {
    status = document.createElement("span");
    status.className = "inline-note-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    form.append(status);
  }
  return status;
}

function setInlineStatus(message, stateName = "") {
  const inline = $("#detailPanel .inline-note-section");
  if (!inline) return;
  const status = ensureInlineStatus(inline);
  if (!status) return;
  status.textContent = message || "";
  status.dataset.state = stateName;
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

  ensureInlineStatus(inline);
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

function scrollableAncestor(element) {
  let node = element?.parentElement;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    const scrollable = /(auto|scroll)/.test(style.overflowY);
    if (scrollable && node.scrollHeight > node.clientHeight + 1) return node;
    node = node.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

function captureReadingContext(form) {
  const anchor = form?.closest(".inline-note-section");
  const scroller = scrollableAncestor(anchor);
  return {
    scroller,
    anchorTop: anchor?.getBoundingClientRect().top ?? null,
    scrollTop: scroller?.scrollTop ?? 0,
    textareaFocused: document.activeElement === form?.elements?.content
  };
}

function markSavedNote(noteId) {
  if (!noteId) return;
  const panel = $("#detailPanel");
  if (!panel) return;
  const selectorId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(String(noteId)) : String(noteId).replace(/["\\]/g, "\\$&");
  const targets = [
    panel.querySelector(`.detail-top-note-row[data-edit-note="${selectorId}"]`),
    panel.querySelector(`.note-block[data-note-id="${selectorId}"]`)
  ].filter(Boolean);
  targets.forEach((target) => target.classList.add("is-just-saved"));
}

function restoreReadingContext(snapshot, noteId) {
  requestAnimationFrame(() => {
    applyTopNotes();
    const anchor = $("#detailPanel .inline-note-section");
    const scroller = snapshot?.scroller;
    if (anchor && scroller && snapshot.anchorTop != null) {
      const delta = anchor.getBoundingClientRect().top - snapshot.anchorTop;
      scroller.scrollTop = snapshot.scrollTop + delta;
    } else if (scroller) {
      scroller.scrollTop = snapshot.scrollTop;
    }

    const textarea = $("#inlineNoteForm textarea[name='content']");
    if (snapshot?.textareaFocused && textarea) {
      try { textarea.focus({ preventScroll: true }); }
      catch { textarea.focus(); }
    }

    markSavedNote(noteId);
  });
}

function locallyAppendSavedNote(workId, created) {
  const current = state.selected;
  if (!current?.work || String(current.work.id) !== String(workId)) return false;
  const timestamp = created.updated_at || created.created_at || new Date().toISOString();
  const note = {
    ...created,
    updated_at: timestamp,
    created_at: created.created_at || timestamp,
    sort_order: created.sort_order ?? 0
  };
  const work = {
    ...current.work,
    updated_at: timestamp,
    version: Number(current.work.version || 0) + 1
  };
  const notes = [...(current.notes || []).filter((item) => String(item.id) !== String(note.id)), note];
  lastSavedNoteId = String(note.id);
  setSelectedDetail({ ...current, work, notes });
  return note;
}

async function saveInlineNoteInContext(form) {
  const content = String(form.elements.content?.value || "").trim();
  if (!content) {
    form.elements.content?.focus();
    return;
  }

  const workId = String(form.elements.work_id?.value || "");
  const payload = {
    note_type: form.elements.note_type?.value || "quick",
    content,
    position: form.elements.position?.value || null
  };
  const button = form.querySelector('[type="submit"]');
  const context = captureReadingContext(form);

  setBusy(button, true, "保存中…");
  setInlineStatus("保存中…", "saving");

  try {
    const created = await api(`/api/works/${encodeURIComponent(workId)}/notes`, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    if (String(state.selectedId || "") !== workId) {
      toast("メモを保存しました。");
      return;
    }

    const note = locallyAppendSavedNote(workId, created);
    applyTopNotes();

    const nextForm = $("#inlineNoteForm");
    if (nextForm?.elements?.content) nextForm.elements.content.value = "";
    setInlineStatus("保存しました", "saved");
    restoreReadingContext(context, note?.id);

    clearTimeout(savedMarkerTimer);
    savedMarkerTimer = window.setTimeout(() => {
      const savedId = lastSavedNoteId;
      lastSavedNoteId = null;
      $("#detailPanel")?.querySelectorAll(".is-just-saved").forEach((element) => element.classList.remove("is-just-saved"));
      if (savedId) scheduleApply();
    }, 1800);
  } catch (error) {
    setInlineStatus("保存できませんでした。入力内容は残っています。", "error");
    toast(error.message, "error");
  } finally {
    if (button?.isConnected) setBusy(button, false);
  }
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

  document.addEventListener("submit", (event) => {
    if (event.target?.id !== "inlineNoteForm") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void saveInlineNoteInContext(event.target);
  }, true);

  document.addEventListener("keydown", (event) => {
    const textarea = event.target?.closest?.('#inlineNoteForm textarea[name="content"]');
    if (!textarea || event.key !== "Enter" || (!event.metaKey && !event.ctrlKey)) return;
    event.preventDefault();
    textarea.form?.requestSubmit();
  });

  document.addEventListener("input", (event) => {
    if (!event.target?.matches?.('#inlineNoteForm textarea[name="content"]')) return;
    const status = event.target.form?.querySelector(".inline-note-status");
    if (status?.dataset.state === "saved") {
      status.textContent = "";
      status.dataset.state = "";
    }
  });

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
