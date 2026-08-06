import { $, esc, setBusy, toast } from "../core/dom.js";
import { api } from "../core/api.js";
import { state, setSelectedDetail, subscribe } from "../core/store.js";

const SUMMARY_MAX_LENGTH = 220;
const SUMMARY_TARGET_MIN = 120;
const SUMMARY_TARGET_MAX = 180;
const SUMMARY_SOURCE_LIMIT = 5;
let initialized = false;
let pendingResearchSummary = null;
let pendingVersionMismatch = false;
let decorationFrame = 0;

function ensureStyle() {
  if ($('link[href="/styles/review-summary.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/styles/review-summary.css";
  document.head.append(link);
}

function clipped(value, max) {
  return typeof value === "string" ? value.normalize("NFKC").trim().slice(0, max) : "";
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizeSources(values) {
  const result = [];
  const seen = new Set();
  for (const raw of Array.isArray(values) ? values : []) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const url = safeUrl(raw.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const source = { url };
    const title = clipped(raw.title, 180);
    const publisher = clipped(raw.publisher, 100);
    if (title) source.title = title;
    if (publisher) source.publisher = publisher;
    result.push(source);
    if (result.length >= SUMMARY_SOURCE_LIMIT) break;
  }
  return result;
}

export function normalizeReviewSummary(value) {
  if (typeof value === "string") {
    const text = clipped(value, SUMMARY_MAX_LENGTH);
    return text ? { text, source_type: "human" } : null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const text = clipped(value.text, SUMMARY_MAX_LENGTH);
  if (!text) return null;
  const sourceType = value.source_type === "ai_research" ? "ai_research" : "human";
  const result = { text, source_type: sourceType };
  const createdAt = clipped(value.created_at, 40);
  const updatedAt = clipped(value.updated_at, 40);
  const researchId = clipped(value.research_id, 100);
  const originalSourceType = value.original_source_type === "ai_research" ? "ai_research" : "";
  const sources = normalizeSources(value.sources);
  if (createdAt) result.created_at = createdAt;
  if (updatedAt) result.updated_at = updatedAt;
  if (researchId) result.research_id = researchId;
  if (originalSourceType) result.original_source_type = originalSourceType;
  if (sources.length) result.sources = sources;
  return result;
}

export function reviewSummaryText(work) {
  return normalizeReviewSummary(work?.metadata?.review_summary)?.text || "";
}

function parseJsonObject(raw) {
  const text = String(raw || "").trim();
  if (!text) throw new Error("AIの回答JSONを貼り付けてください。");
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const parsed = JSON.parse(fenced ? fenced[1] : text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSONオブジェクトを貼り付けてください。");
  return parsed;
}

function normalizeResearchSummary(value) {
  const raw = typeof value === "string" ? { text: value, sources: [] } : value;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const text = clipped(raw.text, SUMMARY_MAX_LENGTH);
  if (!text) return null;
  const sources = normalizeSources(raw.sources);
  return {
    text,
    sources,
    over_target: text.length < SUMMARY_TARGET_MIN || text.length > SUMMARY_TARGET_MAX
  };
}

export function reconcileResearchResponse(raw, currentWork) {
  const parsed = parseJsonObject(raw);
  if (String(parsed.work_id || "") !== String(currentWork?.id || "")) {
    throw new Error("別の作品のJSONです。work_idが一致しません。");
  }
  const currentVersion = Number(currentWork?.version || 0);
  const receivedVersion = Number(parsed.version || 0);
  const versionMismatch = receivedVersion !== currentVersion;
  parsed.version = currentVersion;
  return {
    json: JSON.stringify(parsed, null, 2),
    parsed,
    versionMismatch,
    receivedVersion,
    currentVersion,
    summary: normalizeResearchSummary(parsed.summary)
  };
}

export function buildSummaryResearchPrompt(pkg) {
  return `次の書籍について、信頼できる公開情報を調査し、書評・出版社紹介・図書館紹介などで重要視されている概念を「単語メモ」の候補として返してください。あわせて、作品の内容と批評上の論点が分かる約150文字の概要を作成してください。\n\nルール：\n- タイトルやあらすじだけから連想して候補を作らない\n- 実際に閲覧した公開情報に基づく\n- 出版社・著者公式、新聞・雑誌の書評、図書館・大学・文学館などを優先する\n- 一般読者レビューは補助的にのみ使用し、それだけを根拠にしない\n- 単語候補は主題、論点、反復される概念、批評上重要な語を抽出する\n- 単語候補は1件1〜20文字を目安とし、最大15件\n- existing_word_memosと重複させない\n- 各単語候補には根拠となる有効な出典URLを1件以上付ける\n- 概要は${SUMMARY_TARGET_MIN}〜${SUMMARY_TARGET_MAX}文字を目安とし、最大${SUMMARY_MAX_LENGTH}文字\n- 概要は単なる宣伝文や感想にせず、作品の内容と主要な論点を簡潔にまとめる\n- 概要にも根拠となる有効な出典URLを1件以上付ける\n- 感想、評価、おすすめ度は書かない\n- work_idとversionは変更しない\n- JSONコードブロック1個だけで返し、前後に説明を書かない\n\n返却形式：\n{\n  "schema_version": 1,\n  "work_id": "...",\n  "version": 1,\n  "research_id": "任意の調査識別子",\n  "summary": {\n    "text": "約150文字の概要",\n    "sources": [{ "url": "https://...", "title": "書評タイトル", "publisher": "掲載元" }]\n  },\n  "candidates": [\n    {\n      "text": "喪失",\n      "confidence": "high",\n      "reason": "複数の書評で中心的な主題として扱われている",\n      "sources": [{ "url": "https://...", "title": "書評タイトル", "publisher": "掲載元", "supports": ["喪失"] }]\n    }\n  ]\n}\n\n--- 入力JSON ---\n${JSON.stringify(pkg, null, 2)}`;
}

function ensureResearchSummaryUi() {
  const preview = $("#wordMemoResearchPreview");
  if (!preview || $("#reviewSummaryResearchBlock")) return;
  const block = document.createElement("section");
  block.id = "reviewSummaryResearchBlock";
  block.className = "review-summary-research-block";
  block.hidden = true;
  block.innerHTML = `
    <div id="reviewSummaryVersionNotice" class="review-summary-version-notice" hidden></div>
    <div class="review-summary-research-heading">
      <label><input id="reviewSummaryImportCheck" type="checkbox" checked> 概要も取り込む</label>
      <span id="reviewSummaryResearchCount">0 / ${SUMMARY_MAX_LENGTH}</span>
    </div>
    <textarea id="reviewSummaryResearchText" maxlength="${SUMMARY_MAX_LENGTH}" rows="5" placeholder="約150文字の概要"></textarea>
    <div id="reviewSummaryResearchSources" class="review-summary-research-sources"></div>
    <button type="button" class="secondary-button" data-review-summary-save-only>概要だけ保存</button>`;
  const candidateList = $("#wordMemoCandidateList", preview);
  if (candidateList) candidateList.before(block);
  else preview.append(block);
}

function sourceLinks(sources) {
  if (!sources.length) return '<p>概要の出典URLがありません。内容を確認してから保存してください。</p>';
  return `<details><summary>概要の出典 ${sources.length}件</summary><ul>${sources.map((source) => {
    const label = source.title || source.publisher || new URL(source.url).hostname;
    return `<li><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>${source.publisher && source.publisher !== label ? `<small>${esc(source.publisher)}</small>` : ""}</li>`;
  }).join("")}</ul></details>`;
}

function renderResearchSummaryPreview() {
  ensureResearchSummaryUi();
  const block = $("#reviewSummaryResearchBlock");
  if (!block) return;
  if (!pendingResearchSummary) {
    block.hidden = true;
    return;
  }
  block.hidden = false;
  const textarea = $("#reviewSummaryResearchText");
  textarea.value = pendingResearchSummary.text;
  $("#reviewSummaryResearchCount").textContent = `${textarea.value.length} / ${SUMMARY_MAX_LENGTH}`;
  $("#reviewSummaryResearchSources").innerHTML = sourceLinks(pendingResearchSummary.sources);
  const notice = $("#reviewSummaryVersionNotice");
  notice.hidden = !pendingVersionMismatch;
  notice.textContent = pendingVersionMismatch
    ? "調査開始後に作品が更新されています。現在の内容へ追加するため、最新versionへ自動調整しました。"
    : "";
  block.classList.toggle("is-outside-target", pendingResearchSummary.over_target);
}

function augmentResearchPrompt() {
  const prompt = $("#wordMemoResearchPrompt");
  if (!prompt?.dataset.json) return;
  try {
    const pkg = JSON.parse(prompt.dataset.json);
    prompt.value = buildSummaryResearchPrompt(pkg);
    pendingResearchSummary = null;
    pendingVersionMismatch = false;
    ensureResearchSummaryUi();
    $("#reviewSummaryResearchBlock").hidden = true;
  } catch {}
}

async function patchSummary(record, button, retry = true) {
  let work = state.selected?.work;
  if (!work) return false;
  const metadata = { ...(work.metadata || {}) };
  if (record?.text) metadata.review_summary = record;
  else delete metadata.review_summary;
  setBusy(button, true, "保存中…");
  try {
    const data = await api(`/api/works/${encodeURIComponent(work.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ version: Number(work.version), metadata })
    });
    setSelectedDetail(data);
    return true;
  } catch (error) {
    if (error.status === 409 && retry) {
      const latest = await api(`/api/works/${encodeURIComponent(work.id)}`);
      setSelectedDetail(latest);
      setBusy(button, false);
      return patchSummary(record, button, false);
    }
    toast(error.message, "error");
    return false;
  } finally {
    setBusy(button, false);
  }
}

function summaryRecordFromResearch() {
  if (!pendingResearchSummary) return null;
  const textarea = $("#reviewSummaryResearchText");
  const text = clipped(textarea?.value, SUMMARY_MAX_LENGTH);
  if (!text) return null;
  const now = new Date().toISOString();
  const researchId = (() => {
    try { return clipped(parseJsonObject($("#wordMemoResearchInput").value).research_id, 100); } catch { return ""; }
  })();
  return {
    text,
    source_type: "ai_research",
    created_at: now,
    updated_at: now,
    ...(researchId ? { research_id: researchId } : {}),
    ...(pendingResearchSummary.sources.length ? { sources: pendingResearchSummary.sources } : {})
  };
}

async function saveResearchSummaryOnly(button) {
  const record = summaryRecordFromResearch();
  if (!record) { toast("保存する概要がありません。", "error"); return; }
  if (await patchSummary(record, button)) toast("概要を保存しました。");
}

async function waitAndSaveAfterWordImport(beforeVersion, record) {
  const dialog = $("#wordMemoResearchDialog");
  for (let i = 0; i < 60; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const currentVersion = Number(state.selected?.work?.version || 0);
    if (!dialog?.open && currentVersion > beforeVersion) {
      await patchSummary(record, null);
      return;
    }
    if (!dialog?.open && currentVersion <= beforeVersion) return;
  }
}

function currentSummary(work = state.selected?.work) {
  return normalizeReviewSummary(work?.metadata?.review_summary);
}

function summarySectionMarkup(work) {
  const summary = currentSummary(work);
  const text = summary?.text || "";
  const originClass = summary?.source_type === "ai_research" ? "is-ai-origin" : summary?.original_source_type === "ai_research" ? "is-ai-edited" : "is-human-origin";
  return `<section class="detail-section review-summary-section ${originClass}" data-review-summary-section>
    <div class="review-summary-heading"><div><h3>概要</h3><p>作品の内容と主要な論点を、約150文字で。</p></div><span>${text.length} / ${SUMMARY_MAX_LENGTH}</span></div>
    <form id="reviewSummaryForm">
      <textarea id="reviewSummaryText" name="summary" maxlength="${SUMMARY_MAX_LENGTH}" rows="5" placeholder="${SUMMARY_TARGET_MIN}〜${SUMMARY_TARGET_MAX}文字を目安に入力">${esc(text)}</textarea>
      <div class="review-summary-form-actions"><button type="submit" class="primary-button">概要を保存</button>${text ? '<button type="button" class="ghost-button" data-review-summary-clear>削除</button>' : ""}</div>
    </form>
  </section>`;
}

function renderSummarySection() {
  const panel = $("#detailPanel");
  if (!panel) return;
  const existing = $("[data-review-summary-section]", panel);
  const work = state.selected?.work;
  if (!work || !["book", "manga"].includes(work.type)) { existing?.remove(); return; }
  const wrap = document.createElement("div");
  wrap.innerHTML = summarySectionMarkup(work);
  const next = wrap.firstElementChild;
  if (existing) { existing.replaceWith(next); return; }
  const wordMemos = $("[data-word-memo-section]", panel);
  const anchor = wordMemos || $(".inline-note-section", panel) || $(".preference-panel", panel);
  if (wordMemos) wordMemos.before(next);
  else anchor?.after(next);
}

async function saveHumanSummary(form) {
  const work = state.selected?.work;
  if (!work) return;
  const text = clipped(form.elements.summary.value, SUMMARY_MAX_LENGTH);
  const existing = currentSummary(work);
  const now = new Date().toISOString();
  const record = text ? {
    text,
    source_type: "human",
    created_at: existing?.created_at || now,
    updated_at: now,
    ...((existing?.source_type === "ai_research" || existing?.original_source_type === "ai_research") ? { original_source_type: "ai_research" } : {}),
    ...(existing?.research_id ? { research_id: existing.research_id } : {}),
    ...(existing?.sources?.length ? { sources: existing.sources } : {})
  } : null;
  const button = $("[type='submit']", form);
  if (await patchSummary(record, button)) toast(text ? "概要を保存しました。" : "概要を削除しました。");
}

function decorateElement(container, work, className, beforeSelector) {
  const text = reviewSummaryText(work);
  let el = $("[data-review-summary-card]", container);
  if (!text) { el?.remove(); return; }
  if (!el) {
    el = document.createElement("p");
    el.dataset.reviewSummaryCard = "";
    el.className = `review-summary-card ${className}`;
    const before = beforeSelector ? $(beforeSelector, container) : null;
    if (before) before.before(el); else container.append(el);
  }
  el.textContent = text;
}

function decorateCards() {
  if (!state.loaded) return;
  document.querySelectorAll("#workList .work-card[data-work-id]").forEach((card) => {
    const work = state.works.get(String(card.dataset.workId));
    const body = $(".work-card-body", card);
    if (work && body) decorateElement(body, work, "review-summary-card--library", ".label-row");
  });
  document.querySelectorAll("#randomStage .random-pick-main[data-open-work]").forEach((main) => {
    const work = state.works.get(String(main.dataset.openWork));
    if (work) decorateElement(main, work, "review-summary-card--random", ".random-pick-status");
  });
  document.querySelectorAll("#recentlyEditedBooks .recent-book-main[data-open-work]").forEach((main) => {
    const work = state.works.get(String(main.dataset.openWork));
    const copy = $(".recent-book-copy", main);
    if (work && copy) decorateElement(copy, work, "review-summary-card--recent", "em");
  });
  document.querySelectorAll("#readingStrip .reading-card-main[data-open-work]").forEach((main) => {
    const work = state.works.get(String(main.dataset.openWork));
    if (work) decorateElement(main, work, "review-summary-card--reading", ".progress-track");
  });
}

function scheduleDecorations() {
  cancelAnimationFrame(decorationFrame);
  decorationFrame = requestAnimationFrame(decorateCards);
}

function observeCardContainers() {
  const observer = new MutationObserver(scheduleDecorations);
  ["#workList", "#randomStage", "#recentlyEditedBooks", "#readingStrip"].forEach((selector) => {
    const target = $(selector);
    if (target) observer.observe(target, { childList: true, subtree: true });
  });
}

export function initReviewSummary() {
  if (initialized) return;
  initialized = true;
  ensureStyle();
  subscribe(() => { renderSummarySection(); scheduleDecorations(); });
  observeCardContainers();

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-word-memo-preview]")) {
      const work = state.selected?.work;
      const input = $("#wordMemoResearchInput");
      if (!work || !input) return;
      try {
        const reconciled = reconcileResearchResponse(input.value, work);
        input.value = reconciled.json;
        pendingResearchSummary = reconciled.summary;
        pendingVersionMismatch = reconciled.versionMismatch;
        queueMicrotask(renderResearchSummaryPreview);
      } catch {}
    }
  }, true);

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-word-memo-research-open]")) {
      setTimeout(augmentResearchPrompt, 0);
      return;
    }
    const saveOnly = event.target.closest("[data-review-summary-save-only]");
    if (saveOnly) { void saveResearchSummaryOnly(saveOnly); return; }
    const importButton = event.target.closest("[data-word-memo-import]");
    if (importButton && pendingResearchSummary && $("#reviewSummaryImportCheck")?.checked) {
      const record = summaryRecordFromResearch();
      if (record) void waitAndSaveAfterWordImport(Number(state.selected?.work?.version || 0), record);
      return;
    }
    if (event.target.closest("[data-review-summary-clear]")) {
      void patchSummary(null, event.target.closest("button")).then((ok) => { if (ok) toast("概要を削除しました。"); });
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target?.id === "reviewSummaryResearchText") {
      $("#reviewSummaryResearchCount").textContent = `${event.target.value.length} / ${SUMMARY_MAX_LENGTH}`;
    }
    if (event.target?.id === "reviewSummaryText") {
      const counter = $(".review-summary-heading span", event.target.closest("[data-review-summary-section]"));
      if (counter) counter.textContent = `${event.target.value.length} / ${SUMMARY_MAX_LENGTH}`;
    }
  });

  document.addEventListener("submit", (event) => {
    if (event.target?.id !== "reviewSummaryForm") return;
    event.preventDefault();
    void saveHumanSummary(event.target);
  });

  requestAnimationFrame(() => { renderSummarySection(); decorateCards(); });
}
