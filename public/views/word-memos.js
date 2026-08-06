import { $, esc, setBusy, toast } from "../core/dom.js";
import { api } from "../core/api.js";
import { state, setFilters, setSelectedDetail, setView, subscribe } from "../core/store.js";

const MAX_WORD_MEMOS = 50;
const MAX_WORD_LENGTH = 40;
const MAX_RESEARCH_CANDIDATES = 15;
const MAX_SOURCES_PER_WORD = 5;
const CONFIDENCE_RANK = { low: 1, medium: 2, high: 3 };
let initialized = false;
let composing = false;
let researchContext = null;
let researchPreview = null;

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

function clippedText(value, max) {
  return typeof value === "string" ? value.normalize("NFKC").trim().slice(0, max) : "";
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizeSource(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const url = safeHttpUrl(value.url);
  if (!url) return null;
  const source = { url };
  const title = clippedText(value.title, 180);
  const publisher = clippedText(value.publisher, 100);
  const supports = Array.isArray(value.supports)
    ? Array.from(new Set(value.supports.map((item) => clippedText(item, 40)).filter(Boolean))).slice(0, 10)
    : [];
  if (title) source.title = title;
  if (publisher) source.publisher = publisher;
  if (supports.length) source.supports = supports;
  return source;
}

function mergeSources(first = [], second = []) {
  const result = [];
  const seen = new Set();
  for (const raw of [...first, ...second]) {
    const source = normalizeSource(raw);
    if (!source) continue;
    if (seen.has(source.url)) continue;
    seen.add(source.url);
    result.push(source);
    if (result.length >= MAX_SOURCES_PER_WORD) break;
  }
  return result;
}

function normalizeWordMemoEntry(value) {
  const raw = typeof value === "string" ? { text: value, source_type: "human" } : value;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const originalText = typeof raw.text === "string" ? raw.text.normalize("NFKC").trim() : "";
  if (!originalText || originalText.length > MAX_WORD_LENGTH) return null;
  const sourceType = raw.source_type === "ai_research" ? "ai_research" : "human";
  const entry = { text: originalText, source_type: sourceType };
  const createdAt = clippedText(raw.created_at, 40);
  if (createdAt) entry.created_at = createdAt;
  if (sourceType === "ai_research") {
    const researchId = clippedText(raw.research_id, 100);
    const confidence = ["high", "medium", "low"].includes(raw.confidence) ? raw.confidence : "low";
    const reason = clippedText(raw.reason, 260);
    if (researchId) entry.research_id = researchId;
    entry.confidence = confidence;
    if (reason) entry.reason = reason;
    entry.sources = mergeSources(raw.sources);
  }
  return entry;
}

function strongerConfidence(first = "low", second = "low") {
  return (CONFIDENCE_RANK[second] || 0) > (CONFIDENCE_RANK[first] || 0) ? second : first;
}

function mergeWordMemoEntries(existing, incoming) {
  if (existing.source_type !== "ai_research" || incoming.source_type !== "ai_research") return existing;
  return {
    ...existing,
    confidence: strongerConfidence(existing.confidence, incoming.confidence),
    reason: existing.reason || incoming.reason || "",
    research_id: existing.research_id || incoming.research_id || "",
    created_at: existing.created_at || incoming.created_at || "",
    sources: mergeSources(existing.sources, incoming.sources)
  };
}

export function normalizeWordMemoEntries(values = []) {
  const result = [];
  const positions = new Map();
  for (const value of Array.isArray(values) ? values : []) {
    const entry = normalizeWordMemoEntry(value);
    if (!entry) continue;
    const key = normalizedKey(entry.text);
    if (positions.has(key)) {
      const index = positions.get(key);
      result[index] = mergeWordMemoEntries(result[index], entry);
      continue;
    }
    positions.set(key, result.length);
    result.push(entry);
    if (result.length >= MAX_WORD_MEMOS) break;
  }
  return result;
}

// 旧形式との後方互換。表示語だけが必要な場合は文字列配列を返す。
export function normalizeWordMemos(values = []) {
  return normalizeWordMemoEntries(values).map((entry) => entry.text);
}

export function parseWordMemoInput(value = "") {
  return normalizeWordMemos(String(value).split(/[\n,、]+/));
}

function currentEntries(work = state.selected?.work) {
  return normalizeWordMemoEntries(work?.metadata?.word_memos);
}

function suggestionWords() {
  const counts = new Map();
  for (const work of state.works.values()) {
    for (const entry of normalizeWordMemoEntries(work?.metadata?.word_memos)) {
      const key = normalizedKey(entry.text);
      const current = counts.get(key) || { word: entry.text, count: 0 };
      current.count += 1;
      counts.set(key, current);
    }
  }
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, "ja"))
    .slice(0, 80)
    .map((item) => item.word);
}

function researchEligible(work) {
  return ["book", "manga"].includes(work?.type);
}

function infoIcon() {
  return '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 10v7M12 7h.01"/></svg>';
}

function researchIcon() {
  return '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5M10.5 7v7M7 10.5h7"/></svg>';
}

function closeIcon() {
  return '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 6 12 12M18 6 6 18"/></svg>';
}

function chipMarkup(entry) {
  const ai = entry.source_type === "ai_research";
  const sourceCount = Array.isArray(entry.sources) ? entry.sources.length : 0;
  const title = ai ? `AI調査由来・出典${sourceCount}件` : `「${entry.text}」で作品を検索`;
  return `<span class="word-memo-chip ${ai ? "is-ai" : "is-human"}" title="${esc(title)}">
    <button type="button" class="word-memo-search" data-word-memo-search="${esc(entry.text)}">${esc(entry.text)}</button>
    <button type="button" class="word-memo-remove" data-word-memo-remove="${esc(entry.text)}" aria-label="単語メモ「${esc(entry.text)}」を削除">×</button>
  </span>`;
}

function sectionMarkup(work) {
  const entries = currentEntries(work);
  const suggestions = suggestionWords();
  const aiCount = entries.filter((entry) => entry.source_type === "ai_research").length;
  return `<section class="detail-section word-memo-section" data-word-memo-section>
    <div class="word-memo-heading">
      <div><h3>単語メモ</h3><p>気になった言葉を、分類を増やさず軽く残す。</p></div>
      <div class="word-memo-heading-actions">
        ${aiCount ? `<button type="button" class="word-memo-icon-button" data-word-memo-show-sources aria-label="AI調査の出典を確認" title="AI調査の出典を確認">${infoIcon()}</button>` : ""}
        ${researchEligible(work) ? `<button type="button" class="secondary-button word-memo-research-open" data-word-memo-research-open>${researchIcon()}<span>書評から調べる</span></button>` : ""}
        <span class="word-memo-count">${entries.length} / ${MAX_WORD_MEMOS}</span>
      </div>
    </div>
    <form id="wordMemoForm" class="word-memo-form" autocomplete="off">
      <label class="sr-only" for="wordMemoInput">単語メモを追加</label>
      <input id="wordMemoInput" name="word_memo" type="text" maxlength="${MAX_WORD_LENGTH}" list="wordMemoSuggestions" placeholder="例：余白、ケア、構造">
      <datalist id="wordMemoSuggestions">${suggestions.map((word) => `<option value="${esc(word)}"></option>`).join("")}</datalist>
      <button type="submit" class="primary-button">追加</button>
    </form>
    <p class="word-memo-hint">Enterで保存。読点・カンマ区切りで複数まとめて追加できます。</p>
    <div class="word-memo-chips" aria-live="polite">${entries.length ? entries.map(chipMarkup).join("") : '<span class="word-memo-empty">まだ単語メモはありません。</span>'}</div>
    <div class="form-error word-memo-error" role="alert"></div>
  </section>`;
}

function ensureDialogs() {
  if (!$("#wordMemoResearchDialog")) {
    const dialog = document.createElement("dialog");
    dialog.id = "wordMemoResearchDialog";
    dialog.className = "word-memo-research-dialog";
    dialog.innerHTML = `<div class="word-memo-dialog-shell">
      <header class="word-memo-dialog-header"><div><p>REVIEW RESEARCH</p><h2>書評から単語候補を調べる</h2></div><button type="button" class="word-memo-dialog-close" data-word-memo-dialog-close="wordMemoResearchDialog" aria-label="閉じる">${closeIcon()}</button></header>
      <div class="word-memo-dialog-body">
        <section class="word-memo-research-step"><div class="word-memo-step-heading"><span>1</span><div><h3>AIへ渡す</h3><p>作品情報と調査ルールをまとめたプロンプトです。</p></div></div><textarea id="wordMemoResearchPrompt" rows="10" readonly></textarea><div class="word-memo-copy-actions"><button type="button" class="secondary-button" data-word-memo-copy="prompt">プロンプトをコピー</button><button type="button" class="ghost-button" data-word-memo-copy="json">作品JSONだけコピー</button></div></section>
        <section class="word-memo-research-step"><div class="word-memo-step-heading"><span>2</span><div><h3>回答JSONを貼る</h3><p>JSONコードブロックのまま貼り付けられます。</p></div></div><textarea id="wordMemoResearchInput" rows="9" placeholder="AIが返したJSONを貼り付け"></textarea><button type="button" class="primary-button word-memo-preview-button" data-word-memo-preview>候補を確認</button><div id="wordMemoResearchError" class="form-error" role="alert"></div></section>
        <section id="wordMemoResearchPreview" class="word-memo-research-preview" hidden><div class="word-memo-preview-heading"><div><h3>追加候補</h3><p>チェックした語だけをAI由来として保存します。</p></div><span id="wordMemoSelectedCount">0件選択</span></div><div id="wordMemoCandidateList" class="word-memo-candidate-list"></div></section>
      </div>
      <footer class="word-memo-dialog-footer"><button type="button" class="ghost-button" data-word-memo-dialog-close="wordMemoResearchDialog">閉じる</button><button type="button" class="primary-button" data-word-memo-import disabled>選択した候補を追加</button></footer>
    </div>`;
    document.body.append(dialog);
  }
  if (!$("#wordMemoSourcesDialog")) {
    const dialog = document.createElement("dialog");
    dialog.id = "wordMemoSourcesDialog";
    dialog.className = "word-memo-research-dialog word-memo-sources-dialog";
    dialog.innerHTML = `<div class="word-memo-dialog-shell"><header class="word-memo-dialog-header"><div><p>PROVENANCE</p><h2>AI調査の出典</h2></div><button type="button" class="word-memo-dialog-close" data-word-memo-dialog-close="wordMemoSourcesDialog" aria-label="閉じる">${closeIcon()}</button></header><div id="wordMemoSourcesList" class="word-memo-dialog-body word-memo-sources-list"></div><footer class="word-memo-dialog-footer"><button type="button" class="primary-button" data-word-memo-dialog-close="wordMemoSourcesDialog">閉じる</button></footer></div>`;
    document.body.append(dialog);
  }
}

function renderWordMemos() {
  const panel = $("#detailPanel");
  if (!panel) return;
  const existing = $("[data-word-memo-section]", panel);
  const work = state.selected?.work;
  if (!work) { existing?.remove(); return; }
  const wrapper = document.createElement("div");
  wrapper.innerHTML = sectionMarkup(work);
  const next = wrapper.firstElementChild;
  if (existing) { existing.replaceWith(next); return; }
  const anchor = $(".inline-note-section", panel) || $(".preference-panel", panel) || $(".detail-header", panel);
  if (anchor) anchor.after(next);
}

async function persistEntries(entries, button) {
  const work = state.selected?.work;
  if (!work) return false;
  const metadata = { ...(work.metadata || {}) };
  const normalized = normalizeWordMemoEntries(entries);
  if (normalized.length) metadata.word_memos = normalized;
  else delete metadata.word_memos;
  if (JSON.stringify(metadata).length > 9800) {
    const errorEl = $("#wordMemoResearchError") || $(".word-memo-error");
    if (errorEl) errorEl.textContent = "出典情報を含む作品データが大きすぎます。候補数を減らしてください。";
    return false;
  }
  setBusy(button, true, "保存中…");
  try {
    const data = await api(`/api/works/${encodeURIComponent(work.id)}`, { method: "PATCH", body: JSON.stringify({ version: Number(work.version), metadata }) });
    setSelectedDetail(data);
    return true;
  } catch (error) {
    const errorEl = $("#wordMemoResearchError") || $(".word-memo-error");
    if (errorEl) errorEl.textContent = error.message;
    if (error.status === 409) document.dispatchEvent(new CustomEvent("app:reload-snapshot"));
    return false;
  } finally { setBusy(button, false); }
}

async function addWords(form) {
  if (composing) return;
  const input = form.elements.namedItem("word_memo");
  const incoming = parseWordMemoInput(input.value);
  const errorEl = $(".word-memo-error", form.closest(".word-memo-section"));
  errorEl.textContent = "";
  if (!incoming.length) { input.focus(); return; }
  if (String(input.value).split(/[\n,、]+/).some((value) => value.normalize("NFKC").trim().length > MAX_WORD_LENGTH)) {
    errorEl.textContent = `単語メモは1件${MAX_WORD_LENGTH}文字以内です。`;
    return;
  }
  const existing = currentEntries();
  const existingKeys = new Set(existing.map((entry) => normalizedKey(entry.text)));
  const additions = incoming.filter((text) => !existingKeys.has(normalizedKey(text))).map((text) => ({ text, source_type: "human", created_at: new Date().toISOString() }));
  if (!additions.length) { errorEl.textContent = "同じ単語メモがすでにあります。"; input.select(); return; }
  if (existing.length + additions.length > MAX_WORD_MEMOS) { errorEl.textContent = `単語メモは${MAX_WORD_MEMOS}件までです。`; return; }
  const button = $("[type='submit']", form);
  if (await persistEntries([...existing, ...additions], button)) {
    input.value = "";
    toast(additions.length > 1 ? `${additions.length}件の単語メモを追加しました。` : `「${additions[0].text}」を単語メモへ追加しました。`);
    setTimeout(() => $("#wordMemoInput")?.focus({ preventScroll: true }), 20);
  }
}

async function removeWord(word, button) {
  const next = currentEntries().filter((entry) => normalizedKey(entry.text) !== normalizedKey(word));
  if (await persistEntries(next, button)) toast(`「${word}」を単語メモから削除しました。`);
}

function searchWord(word) {
  const input = $("#globalSearch");
  if (input) input.value = word;
  setFilters({ q: word });
  setView("library");
  toast(`「${word}」を含む作品を表示します。`);
}

function workFacts(work) {
  return work?.metadata?.ai_facts?.work && typeof work.metadata.ai_facts.work === "object" ? work.metadata.ai_facts.work : {};
}

export function buildWordMemoResearchPackage(work) {
  const facts = workFacts(work);
  return {
    schema_version: 1,
    work_id: String(work?.id || ""),
    version: Number(work?.version || 0),
    work: {
      title: work?.title || null,
      creator: work?.creator || null,
      type: work?.type || null,
      release_year: work?.release_year ?? null,
      publisher: facts.publisher || null,
      publication_date: facts.publication_date || null,
      isbn_10: facts.isbn_10 || null,
      isbn_13: facts.isbn_13 || null,
      labels: { genre: work?.labels?.genre || [], theme: work?.labels?.theme || [], tag: work?.labels?.tag || [] }
    },
    existing_word_memos: currentEntries(work).map((entry) => ({ text: entry.text, source_type: entry.source_type }))
  };
}

export function buildWordMemoResearchPrompt(pkg) {
  return `次の書籍について、信頼できる公開情報を調査し、書評・出版社紹介・図書館紹介などで重要視されている概念を「単語メモ」の候補としてJSONで返してください。\n\nルール：\n- タイトルやあらすじだけから連想して候補を作らない\n- 実際に閲覧した公開情報に基づく\n- 出版社・著者公式、新聞・雑誌の書評、図書館・大学・文学館などを優先する\n- 一般読者レビューは補助的にのみ使用し、それだけを根拠にしない\n- 登場人物名、地名、商品名などの固有名詞は原則として除外する\n- 作品の主題、論点、反復される概念、批評上重要な語を抽出する\n- 1件1〜20文字を目安とし、最大${MAX_RESEARCH_CANDIDATES}件\n- existing_word_memosと重複させない\n- 各候補に、根拠となる有効な出典URLを1件以上付ける\n- 複数の信頼できる出典で確認できた候補はconfidenceをhighにする\n- 出典で裏付けられない候補は作らない。不明な場合は候補数を減らす\n- 感想、評価、おすすめ度は書かない\n- work_idとversionは変更しない\n- JSONコードブロック1個だけで返し、前後に説明を書かない\n\n返却形式：\n{\n  "schema_version": 1,\n  "work_id": "...",\n  "version": 1,\n  "research_id": "任意の調査識別子",\n  "candidates": [\n    {\n      "text": "喪失",\n      "confidence": "high",\n      "reason": "複数の書評で中心的な主題として扱われている",\n      "sources": [{ "url": "https://...", "title": "書評タイトル", "publisher": "掲載元", "supports": ["喪失"] }]\n    }\n  ]\n}\n\n--- 入力JSON ---\n${JSON.stringify(pkg, null, 2)}`;
}

function parseJsonObject(raw) {
  const text = String(raw || "").trim();
  if (!text) throw new Error("AIの回答JSONを貼り付けてください。");
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const parsed = JSON.parse(fenced ? fenced[1] : text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSONオブジェクトを貼り付けてください。");
  return parsed;
}

function normalizeResearchCandidate(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const text = typeof value.text === "string" ? value.text.normalize("NFKC").trim() : "";
  if (!text || text.length > MAX_WORD_LENGTH) return null;
  const sources = mergeSources(value.sources);
  if (!sources.length) return null;
  return { text, confidence: ["high", "medium", "low"].includes(value.confidence) ? value.confidence : "low", reason: clippedText(value.reason, 260), sources, over_recommended_length: text.length > 20 };
}

export function parseWordMemoResearchResponse(raw, expected) {
  const parsed = parseJsonObject(raw);
  if (String(parsed.work_id || "") !== String(expected.work_id || "")) throw new Error("別の作品のJSONです。work_idが一致しません。");
  if (Number(parsed.version) !== Number(expected.version)) throw new Error("作品が更新されています。プロンプトを作り直して、現在のversionで調査してください。");
  if (!Array.isArray(parsed.candidates)) throw new Error("candidates配列がありません。");
  const candidates = [];
  const positions = new Map();
  let skipped = 0;
  for (const rawCandidate of parsed.candidates.slice(0, MAX_RESEARCH_CANDIDATES)) {
    const candidate = normalizeResearchCandidate(rawCandidate);
    if (!candidate) { skipped += 1; continue; }
    const key = normalizedKey(candidate.text);
    if (positions.has(key)) {
      const index = positions.get(key);
      candidates[index] = { ...candidates[index], confidence: strongerConfidence(candidates[index].confidence, candidate.confidence), reason: candidates[index].reason || candidate.reason, sources: mergeSources(candidates[index].sources, candidate.sources), over_recommended_length: candidates[index].over_recommended_length || candidate.over_recommended_length };
      continue;
    }
    positions.set(key, candidates.length);
    candidates.push(candidate);
  }
  if (!candidates.length) throw new Error("有効な候補がありません。各候補に単語と出典URLが必要です。");
  return { schema_version: Number(parsed.schema_version || 1), research_id: clippedText(parsed.research_id, 100) || `research-${Date.now()}`, candidates, skipped };
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const area = document.createElement("textarea");
  area.value = text;
  document.body.append(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

function openResearchDialog() {
  const work = state.selected?.work;
  if (!work) return;
  ensureDialogs();
  researchContext = buildWordMemoResearchPackage(work);
  researchPreview = null;
  $("#wordMemoResearchPrompt").value = buildWordMemoResearchPrompt(researchContext);
  $("#wordMemoResearchPrompt").dataset.json = JSON.stringify(researchContext, null, 2);
  $("#wordMemoResearchInput").value = "";
  $("#wordMemoResearchError").textContent = "";
  $("#wordMemoCandidateList").innerHTML = "";
  $("#wordMemoResearchPreview").hidden = true;
  const importButton = $("[data-word-memo-import]", $("#wordMemoResearchDialog"));
  importButton.disabled = true;
  importButton.textContent = "選択した候補を追加";
  $("#wordMemoResearchDialog").showModal();
}

function candidateSourceMarkup(source) {
  const label = source.title || source.publisher || new URL(source.url).hostname;
  return `<li><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>${source.publisher && source.publisher !== label ? `<small>${esc(source.publisher)}</small>` : ""}</li>`;
}

function candidateMarkup(candidate, index, existing) {
  const humanBlocked = existing?.source_type === "human";
  const aiMerge = existing?.source_type === "ai_research";
  const checked = !humanBlocked && (aiMerge || (candidate.confidence === "high" && candidate.sources.length >= 2));
  const status = humanBlocked ? "人が入力済み" : aiMerge ? "既存のAI語へ出典を追加" : candidate.over_recommended_length ? "20文字超・要確認" : `${candidate.confidence === "high" ? "信頼度 高" : candidate.confidence === "medium" ? "信頼度 中" : "信頼度 低"}・出典${candidate.sources.length}件`;
  return `<article class="word-memo-candidate is-ai ${humanBlocked ? "is-blocked" : ""}"><label><input type="checkbox" data-word-memo-candidate-index="${index}" ${checked ? "checked" : ""} ${humanBlocked ? "disabled" : ""}><span class="word-memo-candidate-word">${esc(candidate.text)}</span><small>${esc(status)}</small></label>${candidate.reason ? `<p>${esc(candidate.reason)}</p>` : ""}<details><summary>根拠と出典</summary><ul>${candidate.sources.map(candidateSourceMarkup).join("")}</ul></details></article>`;
}

function updateSelectedCount() {
  const dialog = $("#wordMemoResearchDialog");
  const count = dialog.querySelectorAll("[data-word-memo-candidate-index]:checked").length;
  $("#wordMemoSelectedCount").textContent = `${count}件選択`;
  const button = $("[data-word-memo-import]", dialog);
  button.disabled = count === 0;
  button.textContent = count ? `選択した${count}件を追加` : "選択した候補を追加";
}

function previewResearchResponse() {
  const errorEl = $("#wordMemoResearchError");
  errorEl.textContent = "";
  try {
    if (!researchContext) throw new Error("作品情報を読み直してください。");
    researchPreview = parseWordMemoResearchResponse($("#wordMemoResearchInput").value, researchContext);
    const existingMap = new Map(currentEntries().map((entry) => [normalizedKey(entry.text), entry]));
    $("#wordMemoCandidateList").innerHTML = researchPreview.candidates.map((candidate, index) => candidateMarkup(candidate, index, existingMap.get(normalizedKey(candidate.text)))).join("");
    $("#wordMemoResearchPreview").hidden = false;
    if (researchPreview.skipped) errorEl.textContent = `単語または出典URLが不足した${researchPreview.skipped}件は候補から除外しました。`;
    updateSelectedCount();
    $("#wordMemoResearchPreview").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    researchPreview = null;
    $("#wordMemoResearchPreview").hidden = true;
    errorEl.textContent = error.message;
  }
}

async function importResearchCandidates(button) {
  if (!researchPreview || !researchContext) return;
  const selectedIndexes = Array.from($("#wordMemoResearchDialog").querySelectorAll("[data-word-memo-candidate-index]:checked")).map((control) => Number(control.dataset.wordMemoCandidateIndex));
  const now = new Date().toISOString();
  const incoming = selectedIndexes.map((index) => researchPreview.candidates[index]).filter(Boolean).map((candidate) => ({ text: candidate.text, source_type: "ai_research", created_at: now, research_id: researchPreview.research_id, confidence: candidate.confidence, reason: candidate.reason, sources: candidate.sources }));
  const existing = currentEntries();
  const existingHumanKeys = new Set(existing.filter((entry) => entry.source_type === "human").map((entry) => normalizedKey(entry.text)));
  const safeIncoming = incoming.filter((entry) => !existingHumanKeys.has(normalizedKey(entry.text)));
  if (!safeIncoming.length) { $("#wordMemoResearchError").textContent = "追加できる候補がありません。"; return; }
  const existingKeys = new Set(existing.map((entry) => normalizedKey(entry.text)));
  const newCount = safeIncoming.filter((entry) => !existingKeys.has(normalizedKey(entry.text))).length;
  if (existing.length + newCount > MAX_WORD_MEMOS) { $("#wordMemoResearchError").textContent = `単語メモは${MAX_WORD_MEMOS}件までです。候補を減らしてください。`; return; }
  if (await persistEntries([...existing, ...safeIncoming], button)) {
    $("#wordMemoResearchDialog").close();
    toast(`${safeIncoming.length}件をAI由来の単語メモとして追加しました。`);
  }
}

function sourcesMarkup(entry) {
  const date = entry.created_at ? new Date(entry.created_at).toLocaleDateString("ja-JP") : "";
  const sourceItems = (entry.sources || []).length ? `<ul>${entry.sources.map(candidateSourceMarkup).join("")}</ul>` : '<p class="muted">保存された出典はありません。</p>';
  return `<article class="word-memo-source-card"><div><span class="word-memo-source-word">${esc(entry.text)}</span>${date ? `<time>${esc(date)}</time>` : ""}</div>${entry.reason ? `<p>${esc(entry.reason)}</p>` : ""}${sourceItems}</article>`;
}

function openSourcesDialog() {
  ensureDialogs();
  const entries = currentEntries().filter((entry) => entry.source_type === "ai_research");
  $("#wordMemoSourcesList").innerHTML = entries.length ? entries.map(sourcesMarkup).join("") : '<p class="muted">AI調査由来の単語メモはありません。</p>';
  $("#wordMemoSourcesDialog").showModal();
}

export function initWordMemos() {
  if (initialized) return;
  initialized = true;
  ensureStyle();
  ensureDialogs();
  subscribe(renderWordMemos);
  document.addEventListener("compositionstart", (event) => { if (event.target?.id === "wordMemoInput") composing = true; });
  document.addEventListener("compositionend", (event) => { if (event.target?.id === "wordMemoInput") composing = false; });
  document.addEventListener("submit", (event) => { if (event.target?.id !== "wordMemoForm") return; event.preventDefault(); void addWords(event.target); });
  document.addEventListener("change", (event) => { if (event.target?.matches("[data-word-memo-candidate-index]")) updateSelectedCount(); });
  document.addEventListener("click", async (event) => {
    const closeButton = event.target.closest("[data-word-memo-dialog-close]");
    if (closeButton) { document.getElementById(closeButton.dataset.wordMemoDialogClose)?.close(); return; }
    const removeButton = event.target.closest("[data-word-memo-remove]");
    if (removeButton) { event.preventDefault(); void removeWord(removeButton.dataset.wordMemoRemove, removeButton); return; }
    const searchButton = event.target.closest("[data-word-memo-search]");
    if (searchButton) { event.preventDefault(); searchWord(searchButton.dataset.wordMemoSearch); return; }
    if (event.target.closest("[data-word-memo-research-open]")) { openResearchDialog(); return; }
    if (event.target.closest("[data-word-memo-show-sources]")) { openSourcesDialog(); return; }
    const copyButton = event.target.closest("[data-word-memo-copy]");
    if (copyButton) {
      try {
        const prompt = $("#wordMemoResearchPrompt");
        await copyText(copyButton.dataset.wordMemoCopy === "json" ? prompt.dataset.json || "" : prompt.value);
        toast(copyButton.dataset.wordMemoCopy === "json" ? "作品JSONをコピーしました。" : "調査プロンプトをコピーしました。");
      } catch { toast("コピーできませんでした。", "error"); }
      return;
    }
    if (event.target.closest("[data-word-memo-preview]")) { previewResearchResponse(); return; }
    const importButton = event.target.closest("[data-word-memo-import]");
    if (importButton) void importResearchCandidates(importButton);
  });
  requestAnimationFrame(renderWordMemos);
}
