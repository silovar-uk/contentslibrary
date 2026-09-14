import { esc } from "./dom.js";
import { coverThumbUrl, isAllowedCoverUrl } from "./cover.js";

const LABEL_WORDS = "新書|文庫|選書|叢書|ブックス|BOOKS|ライブラリー|コミックス|ノベルス";
const LABEL_RE = new RegExp(`[（(]([^（）()]*?(?:${LABEL_WORDS}))(?:\\s+[^（）()]*)?[）)]\\s*$`, "i");

export function labelFromTitle(title = "") {
  const source = String(title).trim();
  const match = source.match(LABEL_RE);
  const label = match?.[1]?.trim() || "";
  let main = match ? source.slice(0, match.index).trim() : source;
  main = main.split(/[―—：:]/, 1)[0].trim() || source;
  return { label, main };
}

function fnv1a(value = "") {
  let hash = 0x811c9dc5;
  for (const ch of String(value)) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function truncate(value, max) {
  const chars = Array.from(String(value || ""));
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : chars.join("");
}

function asciiLetterRatio(value) {
  const text = String(value || "");
  if (!text.length) return 0;
  return (text.match(/[A-Za-z]/g)?.length || 0) / Array.from(text).length;
}

export function bindingFor(work = {}) {
  const parsed = labelFromTitle(work.title || "");
  const creator = String(work.creator || "").trim();
  const seed = parsed.label || creator || String(work.title || "");
  const type = String(work.type || "other");
  let main = parsed.main || String(work.title || "");
  let volume = "";
  let layout = "vertical";

  if (["movie", "anime", "drama", "video"].includes(type)) {
    layout = "poster";
  } else if (type === "manga") {
    layout = "manga";
    const volumeMatch = main.match(/(?:^|\s)(\d{1,3})\s*$/);
    if (volumeMatch) {
      volume = volumeMatch[1];
      main = main.slice(0, volumeMatch.index).trim() || main;
    }
  } else if (asciiLetterRatio(main) >= 0.3 || Array.from(main).length >= 29) {
    layout = "horizontal";
  }

  return {
    label: parsed.label,
    main,
    creator,
    type,
    volume,
    layout,
    tone: fnv1a(seed) % 12,
    band: parsed.label ? 1 : 0,
    displayTitle: truncate(main, layout === "vertical" ? 24 : 40)
  };
}

export function workFaceMarkup(work = {}) {
  const cover = String(work?.metadata?.cover_url || "").trim();
  if (cover && isAllowedCoverUrl(cover)) {
    return `<img class="work-face-image" src="${esc(coverThumbUrl(cover))}" alt="" loading="lazy" decoding="async" width="220" height="330">`;
  }

  const binding = bindingFor(work);
  const layoutClass = `work-face--${binding.layout}`;
  const kind = binding.layout === "poster" ? `<span class="work-face-kind">${esc(String(binding.type).toUpperCase())}</span>` : "";
  const volume = binding.volume ? `<span class="work-face-vol">${esc(binding.volume)}</span>` : "";
  const author = binding.creator ? `<span class="work-face-author">${esc(binding.creator)}</span>` : "";
  const band = binding.band ? `<span class="work-face-band"><span>${esc(binding.label)}</span></span>` : "";
  return `<span class="work-face ${layoutClass}" data-tone="${binding.tone}" data-band="${binding.band}" aria-hidden="true">${kind}<span class="work-face-title">${esc(binding.displayTitle)}</span>${author}${volume}${band}</span>`;
}
