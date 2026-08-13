import { $, esc } from "../core/dom.js";
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

function scheduleDecorate() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(decorateDetail);
}

export function initWorkMediaUrl() {
  if (initialized) return;
  initialized = true;
  ensureStyle();
  ensureTypeOptions($("#workForm select[name='type']"));
  ensureTypeOptions($("#filterType"));
  ensureSourceUrlField();

  const panel = $("#detailPanel");
  if (panel) {
    observer = new MutationObserver(scheduleDecorate);
    observer.observe(panel, { childList: true, subtree: true });
  }
  subscribe(scheduleDecorate);
  scheduleDecorate();
}
