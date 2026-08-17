import { $, esc } from "../core/dom.js";
import { TYPE_LABELS } from "../core/format.js";
import { state, subscribe } from "../core/store.js";

let initialized = false;
let observer = null;
let frame = 0;

const EXTRA_TYPES = [
  { value: "video", label: "動画" },
  { value: "article", label: "記事" }
];

function ensureStyle() {
  if ($('link[href="/styles/work-media-url.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/styles/work-media-url.css";
  document.head.append(link);
}

function ensureTypeOptions(select) {
  if (!select) return;
  const other = Array.from(select.options).find((option) => option.value === "other") || null;
  for (const item of EXTRA_TYPES) {
    if (Array.from(select.options).some((option) => option.value === item.value)) continue;
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    select.insertBefore(option, other);
  }
}

function ensureSourceUrlField() {
  const form = $("#workForm");
  const creator = $("#creatorField");
  if (!form || !creator || form.elements.source_url) return;
  const field = document.createElement("label");
  field.id = "sourceUrlField";
  field.className = "field-label source-url-field";
  field.innerHTML = `URL <span class="optional-mark">任意</span><input name="source_url" type="url" maxlength="2048" inputmode="url" autocomplete="url" placeholder="https://example.com/..."><small class="label-help">動画ページや記事ページなど、作品そのもののURL。</small>`;
  creator.after(field);
}

function safeSourceUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(String(value));
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function linkLabel(type) {
  if (type === "video") return "動画を開く";
  if (type === "article") return "記事を開く";
  return "元ページを開く";
}

function typeIconMarkup(type) {
  const common = 'class="work-type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  if (type === "book") return `<svg ${common}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z"/></svg>`;
  if (type === "manga") return `<svg ${common}><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h3v4H8zM14 7h2M14 10h2M8 15h8M8 18h5"/></svg>`;
  if (type === "movie") return `<svg ${common}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9h4M17 9h4M3 15h4M17 15h4"/></svg>`;
  if (type === "anime") return `<svg ${common}><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m8 3 4 2 4-2M9 10l3 2 3-2M9 15h6"/></svg>`;
  if (type === "drama") return `<svg ${common}><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M8 9h8M8 13h5M8 17h3"/></svg>`;
  if (type === "video") return `<svg ${common}><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/></svg>`;
  if (type === "article") return `<svg ${common}><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4M9 11h6M9 15h6M9 19h4"/></svg>`;
  return `<svg ${common}><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4M9 12h6M9 16h6"/></svg>`;
}

function externalIconMarkup() {
  return '<svg class="work-source-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 5h5v5"/><path d="m19 5-8 8"/><path d="M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>';
}

function decorateTypeBadge(card, work) {
  const pill = card.querySelector(".type-pill");
  if (!pill || !work?.type) return;
  if (pill.dataset.workType === work.type) return;
  pill.dataset.workType = work.type;
  pill.className = `type-pill work-type-badge is-${work.type}`;
  pill.innerHTML = `${typeIconMarkup(work.type)}<span>${esc(TYPE_LABELS[work.type] || "その他")}</span>`;
}

function decorateLibraryCard(card) {
  const work = state.works.get(String(card.dataset.workId || ""));
  if (!work) return;
  decorateTypeBadge(card, work);

  const url = safeSourceUrl(work.metadata?.source_url);
  let link = card.querySelector(":scope > .work-card-source-link");
  if (!url) {
    link?.remove();
    return;
  }

  const signature = `${url}|${work.type}|${work.title}`;
  if (!link) {
    link = document.createElement("a");
    link.className = "work-card-source-link";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const main = card.querySelector(":scope > .work-card-main");
    if (main) main.after(link);
    else card.prepend(link);
  }
  if (link.dataset.signature === signature) return;
  const label = `${work.title || TYPE_LABELS[work.type] || "作品"}：${linkLabel(work.type)}`;
  link.dataset.signature = signature;
  link.href = url;
  link.title = linkLabel(work.type);
  link.setAttribute("aria-label", label);
  link.innerHTML = externalIconMarkup();
}

function decorateLibrary() {
  document.querySelectorAll("#workList .work-card[data-work-id]").forEach(decorateLibraryCard);
}

function decorateDetail() {
  const header = $("#detailPanel .detail-header");
  const work = state.selected?.work;
  if (!header || !work) return;
  const url = safeSourceUrl(work.metadata?.source_url);
  let link = header.querySelector(".work-source-link");
  if (!url) {
    link?.remove();
    return;
  }
  const signature = `${url}|${work.type}`;
  if (link?.dataset.signature === signature) return;
  if (!link) {
    link = document.createElement("a");
    link.className = "work-source-link";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const creator = header.querySelector(".creator");
    if (creator) creator.after(link);
    else header.append(link);
  }
  link.dataset.signature = signature;
  link.href = url;
  link.innerHTML = `<span>${esc(linkLabel(work.type))}</span><span aria-hidden="true">↗</span>`;
}

function decorate() {
  decorateLibrary();
  decorateDetail();
}

function scheduleDecorate() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(decorate);
}

export function initWorkMediaUrl() {
  if (initialized) return;
  initialized = true;
  ensureStyle();
  ensureTypeOptions($("#workForm select[name='type']"));
  ensureTypeOptions($("#filterType"));
  ensureSourceUrlField();

  observer = new MutationObserver(scheduleDecorate);
  [$("#workList"), $("#detailPanel")].filter(Boolean).forEach((node) => observer.observe(node, { childList: true, subtree: true }));
  subscribe(scheduleDecorate);
  scheduleDecorate();
}
