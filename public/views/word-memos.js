import { $, esc, setBusy, toast } from "../core/dom.js";
import { api } from "../core/api.js";
import { state, setFilters, setSelectedDetail, setView, subscribe } from "../core/store.js";

const MAX_WORD_MEMOS = 50;
const MAX_WORD_LENGTH = 40;
let initialized = false;
let composing = false;

function ensureStyle() {
  if ($('link[href="/styles/word-memos.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/styles/word-memos.css";
  document.head.append(link);
}

function normalizedKey(value) {
  return String(value || "").normalize("NFKC").trim().toLocaleLowerCase("ja");
}

export function normalizeWordMemos(values = []) {
  const result = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    if (typeof value !== "string") continue;
    const word = value.normalize("NFKC").trim();
    if (!word || word.length > MAX_WORD_LENGTH) continue;
    const key = normalizedKey(word);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(word);
    if (result.length >= MAX_WORD_MEMOS) break;
  }
  return result;
}

export function parseWordMemoInput(value = "") {
  return normalizeWordMemos(String(value).split(/[\n,、]+/));
}

function currentWords(work = state.selected?.work) {
  return normalizeWordMemos(work?.metadata?.word_memos);
}

function suggestionWords() {
  const counts = new Map();
  for (const work of state.works.values()) {
    for (const word of normalizeWordMemos(work?.metadata?.word_memos)) {
      const key = normalizedKey(word);
      const current = counts.get(key) || { word, count: 0 };
      current.count += 1;
      counts.set(key, current);
    }
  }
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, "ja"))
    .slice(0, 80)
    .map((item) => item.word);
}

function chipMarkup(word) {
  return `<span class="word-memo-chip">
    <button type="button" class="word-memo-search" data-word-memo-search="${esc(word)}" title="「${esc(word)}」で作品を検索">${esc(word)}</button>
    <button type="button" class="word-memo-remove" data-word-memo-remove="${esc(word)}" aria-label="単語メモ「${esc(word)}」を削除">×</button>
  </span>`;
}

function sectionMarkup(work) {
  const words = currentWords(work);
  const suggestions = suggestionWords();
  return `<section class="detail-section word-memo-section" data-word-memo-section>
    <div class="word-memo-heading">
      <div>
        <h3>単語メモ</h3>
        <p>気になった言葉を、分類を増やさず軽く残す。</p>
      </div>
      <span>${words.length} / ${MAX_WORD_MEMOS}</span>
    </div>
    <form id="wordMemoForm" class="word-memo-form" autocomplete="off">
      <label class="sr-only" for="wordMemoInput">単語メモを追加</label>
      <input id="wordMemoInput" name="word_memo" type="text" maxlength="${MAX_WORD_LENGTH}" list="wordMemoSuggestions" placeholder="例：余白、ケア、構造">
      <datalist id="wordMemoSuggestions">${suggestions.map((word) => `<option value="${esc(word)}"></option>`).join("")}</datalist>
      <button type="submit" class="primary-button">追加</button>
    </form>
    <p class="word-memo-hint">Enterで保存。読点・カンマ区切りで複数まとめて追加できます。</p>
    <div class="word-memo-chips" aria-live="polite">
      ${words.length ? words.map(chipMarkup).join("") : '<span class="word-memo-empty">まだ単語メモはありません。</span>'}
    </div>
    <div class="form-error word-memo-error" role="alert"></div>
  </section>`;
}

function renderWordMemos() {
  const panel = $("#detailPanel");
  if (!panel) return;
  const existing = $("[data-word-memo-section]", panel);
  const work = state.selected?.work;
  if (!work) {
    existing?.remove();
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = sectionMarkup(work);
  const next = wrapper.firstElementChild;
  if (existing) {
    existing.replaceWith(next);
    return;
  }

  const anchor = $(".inline-note-section", panel) || $(".preference-panel", panel) || $(".detail-header", panel);
  if (anchor) anchor.after(next);
}

async function persistWords(words, button) {
  const work = state.selected?.work;
  if (!work) return;
  const metadata = { ...(work.metadata || {}) };
  if (words.length) metadata.word_memos = words;
  else delete metadata.word_memos;

  setBusy(button, true, "保存中…");
  try {
    const data = await api(`/api/works/${encodeURIComponent(work.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ version: Number(work.version), metadata })
    });
    setSelectedDetail(data);
    return true;
  } catch (error) {
    const errorEl = $(".word-memo-error");
    if (errorEl) errorEl.textContent = error.message;
    if (error.status === 409) document.dispatchEvent(new CustomEvent("app:reload-snapshot"));
    return false;
  } finally {
    setBusy(button, false);
  }
}

async function addWords(form) {
  if (composing) return;
  const input = form.elements.namedItem("word_memo");
  const incoming = parseWordMemoInput(input.value);
  const errorEl = $(".word-memo-error", form.closest(".word-memo-section"));
  errorEl.textContent = "";
  if (!incoming.length) {
    input.focus();
    return;
  }
  const tooLong = String(input.value).split(/[\n,、]+/).some((value) => value.normalize("NFKC").trim().length > MAX_WORD_LENGTH);
  if (tooLong) {
    errorEl.textContent = `単語メモは1件${MAX_WORD_LENGTH}文字以内です。`;
    return;
  }

  const merged = normalizeWordMemos([...currentWords(), ...incoming]);
  if (merged.length === currentWords().length) {
    errorEl.textContent = "同じ単語メモがすでにあります。";
    input.select();
    return;
  }
  if (currentWords().length + incoming.length > MAX_WORD_MEMOS) {
    errorEl.textContent = `単語メモは${MAX_WORD_MEMOS}件までです。`;
    return;
  }

  const button = $("[type='submit']", form);
  if (await persistWords(merged, button)) {
    input.value = "";
    toast(incoming.length > 1 ? `${incoming.length}件の単語メモを追加しました。` : `「${incoming[0]}」を単語メモへ追加しました。`);
    setTimeout(() => $("#wordMemoInput")?.focus({ preventScroll: true }), 20);
  }
}

async function removeWord(word, button) {
  const next = currentWords().filter((item) => normalizedKey(item) !== normalizedKey(word));
  if (await persistWords(next, button)) toast(`「${word}」を単語メモから削除しました。`);
}

function searchWord(word) {
  const input = $("#globalSearch");
  if (input) input.value = word;
  setFilters({ q: word });
  setView("library");
  toast(`「${word}」を含む作品を表示します。`);
}

export function initWordMemos() {
  if (initialized) return;
  initialized = true;
  ensureStyle();
  subscribe(renderWordMemos);

  document.addEventListener("compositionstart", (event) => {
    if (event.target?.id === "wordMemoInput") composing = true;
  });
  document.addEventListener("compositionend", (event) => {
    if (event.target?.id === "wordMemoInput") composing = false;
  });
  document.addEventListener("submit", (event) => {
    if (event.target?.id !== "wordMemoForm") return;
    event.preventDefault();
    void addWords(event.target);
  });
  document.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-word-memo-remove]");
    if (removeButton) {
      event.preventDefault();
      void removeWord(removeButton.dataset.wordMemoRemove, removeButton);
      return;
    }
    const searchButton = event.target.closest("[data-word-memo-search]");
    if (searchButton) {
      event.preventDefault();
      searchWord(searchButton.dataset.wordMemoSearch);
    }
  });
  requestAnimationFrame(renderWordMemos);
}
