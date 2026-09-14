import { $, esc } from "../core/dom.js";
import { state, setWorkCover } from "../core/store.js";
import { isAllowedCoverUrl, probeCoverImage, resolveCoverInput, coverThumbUrl } from "../core/cover.js";
import { workFaceMarkup, labelFromTitle } from "../core/work-face.js";
import { statusLabel } from "../core/format.js";
import { amazonTitleSearchUrl } from "./amazon-title-search.js";

const STATUS_ORDER = new Map([
  ["active", 0],
  ["want", 1],
  ["owned_unread", 2],
  ["paused", 3],
  ["dropped", 4],
  ["completed", 5]
]);

let initialized = false;
let queueIds = [];
let cursor = 0;
let saving = false;
let advanceTimer = null;

export function coverHuntQueue(works = []) {
  return works
    .filter((work) => ["book", "manga"].includes(work?.type))
    .filter((work) => !isAllowedCoverUrl(work?.metadata?.cover_url || ""))
    .sort((a, b) => {
      const statusDiff = (STATUS_ORDER.get(a.status) ?? 99) - (STATUS_ORDER.get(b.status) ?? 99);
      if (statusDiff) return statusDiff;
      return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
    });
}

function ensureStyles() {
  for (const href of ["/styles/work-face.css", "/styles/cover-hunt.css"]) {
    if ($(`link[href="${href}"]`)) continue;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.append(link);
  }
}

function ensureDialog() {
  let dialog = $("#coverHuntDialog");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "coverHuntDialog";
  dialog.className = "cover-hunt-dialog";
  dialog.innerHTML = `<div class="cover-hunt-card">
    <header class="cover-hunt-header"><div><p>COLLECT COVERS</p><h2>表紙あつめ</h2></div><button type="button" class="icon-button" data-cover-hunt-close aria-label="閉じる">×</button></header>
    <div id="coverHuntBody"></div>
  </div>`;
  document.body.append(dialog);
  return dialog;
}

function eligibleWorks() {
  return Array.from(state.works.values()).filter((work) => ["book", "manga"].includes(work?.type));
}

function progressCounts() {
  const all = eligibleWorks();
  return {
    total: all.length,
    covered: all.filter((work) => isAllowedCoverUrl(work?.metadata?.cover_url || "")).length
  };
}

function rebuildQueue(startWorkId) {
  const queue = coverHuntQueue(Array.from(state.works.values()));
  if (startWorkId) {
    const index = queue.findIndex((work) => String(work.id) === String(startWorkId));
    if (index > 0) queue.push(...queue.splice(0, index));
  }
  queueIds = queue.map((work) => String(work.id));
  cursor = 0;
}

function currentWork() {
  const id = queueIds[cursor];
  return id ? state.works.get(String(id)) || null : null;
}

function metadataLine(work) {
  const label = labelFromTitle(work.title).label;
  return [work.creator, label, statusLabel(work.type, work.status)].filter(Boolean).map((value) => esc(value)).join(" ・ ");
}

function render() {
  const body = $("#coverHuntBody");
  if (!body) return;
  const work = currentWork();
  const { total, covered } = progressCounts();
  const percent = total ? Math.round((covered / total) * 100) : 0;

  if (!work) {
    body.innerHTML = `<div class="cover-hunt-complete"><div class="cover-hunt-meter"><span style="width:${percent}%"></span></div><strong>表紙あり ${covered} / ${total}</strong><h3>いま付けられる表紙は全部そろいました。</h3><p>新しい本や漫画を追加したら、またここから続けられます。</p><button type="button" class="primary-button" data-cover-hunt-close>閉じる</button></div>`;
    return;
  }

  body.innerHTML = `<div class="cover-hunt-progress"><div><strong>表紙あり ${covered} / ${total}</strong><small>${cursor + 1}冊目の候補</small></div><div class="cover-hunt-meter" aria-hidden="true"><span style="width:${percent}%"></span></div></div>
    <div class="cover-hunt-work">
      <div class="cover-hunt-face-shell" data-cover-hunt-face>${workFaceMarkup(work)}</div>
      <div class="cover-hunt-copy">
        <h3>${esc(work.title)}</h3>
        <p>${metadataLine(work)}</p>
        <a class="secondary-button" href="${esc(amazonTitleSearchUrl(work.title))}" target="_blank" rel="noopener noreferrer">Amazonで探す ↗</a>
        <form data-cover-hunt-form>
          <label>Amazon商品ページURL、または画像URL
            <input name="cover_input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="ここに貼り付け">
          </label>
          <button type="submit" class="primary-button">表紙を設定</button>
        </form>
        <div class="cover-hunt-status" role="status" aria-live="polite"></div>
        <button type="button" class="text-button cover-hunt-skip" data-cover-hunt-skip>スキップして次へ</button>
      </div>
    </div>`;
  requestAnimationFrame(() => $("[data-cover-hunt-form] input", body)?.focus({ preventScroll: true }));
}

function advance() {
  clearTimeout(advanceTimer);
  cursor += 1;
  render();
}

async function saveRaw(raw) {
  if (saving) return;
  const work = currentWork();
  if (!work) return;
  const status = $(".cover-hunt-status");
  const form = $("[data-cover-hunt-form]");
  const button = form?.querySelector('[type="submit"]');
  const resolved = resolveCoverInput(raw);
  if (resolved.error) {
    status.textContent = resolved.error;
    return;
  }

  saving = true;
  if (button) { button.disabled = true; button.textContent = "確認中…"; }
  status.textContent = "画像を確認しています…";
  try {
    const ok = await probeCoverImage(resolved.url);
    if (!ok) {
      status.textContent = "この画像は取得できませんでした。商品ページで画像を右クリックし「画像アドレスをコピー」から貼り付けてください。";
      return;
    }
    const updated = await setWorkCover(work.id, resolved.url);
    status.textContent = "表紙を設定しました。次へ進みます。";
    const face = $("[data-cover-hunt-face]");
    if (face && updated) {
      face.innerHTML = `<img class="work-face-image" src="${esc(coverThumbUrl(updated.metadata?.cover_url || resolved.url))}" alt="" width="220" height="330">`;
      face.classList.add("is-revealed");
    }
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    advanceTimer = setTimeout(advance, reduced ? 180 : 900);
  } catch (error) {
    if (error.status === 409) {
      rebuildQueue(work.id);
      render();
      const latestStatus = $(".cover-hunt-status");
      if (latestStatus) latestStatus.textContent = "別の画面で更新されていたため、最新状態を読み直しました。もう一度貼り付けてください。";
    } else {
      status.textContent = error.message;
    }
  } finally {
    saving = false;
    if (button?.isConnected) { button.disabled = false; button.textContent = "表紙を設定"; }
  }
}

export function openCoverHunt(startWorkId) {
  ensureStyles();
  const dialog = ensureDialog();
  rebuildQueue(startWorkId);
  render();
  if (!dialog.open) dialog.showModal();
}

export function initCoverHunt() {
  if (initialized) return;
  initialized = true;
  ensureStyles();
  const dialog = ensureDialog();

  const tools = $(".list-tools");
  if (tools && !$("[data-action='open-cover-hunt']", tools)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ghost-button";
    button.dataset.action = "open-cover-hunt";
    button.textContent = "表紙を集める";
    tools.insertBefore(button, $("#selectionExportToggle", tools) || tools.firstChild);
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-action='open-cover-hunt']")) { openCoverHunt(); return; }
    const start = event.target.closest("[data-cover-hunt-start]")?.dataset.coverHuntStart;
    if (start) { openCoverHunt(start); return; }
    if (event.target.closest("[data-cover-hunt-skip]")) { advance(); return; }
    if (event.target.closest("[data-cover-hunt-close]")) { clearTimeout(advanceTimer); dialog.close(); }
  });

  dialog.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-cover-hunt-form]");
    if (!form) return;
    event.preventDefault();
    void saveRaw(form.cover_input.value);
  });

  dialog.addEventListener("paste", (event) => {
    const input = event.target.closest("[data-cover-hunt-form] input[name='cover_input']");
    if (!input) return;
    const text = event.clipboardData?.getData("text") || "";
    if (!text) return;
    event.preventDefault();
    input.value = text.trim();
    void saveRaw(input.value);
  });

  dialog.addEventListener("cancel", (event) => { event.preventDefault(); clearTimeout(advanceTimer); dialog.close(); });
  dialog.addEventListener("click", (event) => { if (event.target === dialog) { clearTimeout(advanceTimer); dialog.close(); } });
  window.addEventListener("focus", () => { if (dialog.open) requestAnimationFrame(() => $("[data-cover-hunt-form] input", dialog)?.focus({ preventScroll: true })); });
}
