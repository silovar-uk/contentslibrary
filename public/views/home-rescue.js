import { $, esc } from "../core/dom.js";
import { api } from "../core/api.js";
import { state, subscribe } from "../core/store.js";

let initialized = false;
let rescue = null;
let requestSerial = 0;
let lastView = null;

export function contextualRescueMarkup(work) {
  if (!work?.id || !work?.title) return "";
  const creator = String(work.creator || "").trim();
  const note = String(work.resume_note || work.short_note || "").trim().slice(0, 120);
  return `<div class="home-rescue-intro"><span>REMEMBER</span><strong>これ、途中だった。</strong><p>最近の棚から少し離れていた作品をひとつ。</p></div>
    <button type="button" class="home-rescue-work" data-open-work="${esc(work.id)}">
      <span class="home-rescue-work-label">途中の作品</span>
      <strong>${esc(work.title)}</strong>
      ${creator ? `<small>${esc(creator)}</small>` : ""}
      ${note ? `<p><span>前回のメモ</span>${esc(note)}</p>` : ""}
      <b>もう一度見る →</b>
    </button>`;
}

function renderRescue() {
  const feature = $("#editorialReadingFeature");
  if (!feature) return false;
  let host = $("#homeRescueCue");
  if (!rescue) {
    host?.remove();
    return true;
  }
  if (!host) {
    host = document.createElement("aside");
    host.id = "homeRescueCue";
    host.className = "home-rescue-cue";
    host.setAttribute("aria-label", "途中だった作品を思い出す");
    feature.append(host);
  }
  const markup = contextualRescueMarkup(rescue);
  if (host.dataset.rescueId !== String(rescue.id) || host.innerHTML !== markup) {
    host.dataset.rescueId = String(rescue.id);
    host.innerHTML = markup;
  }
  return true;
}

function scheduleRender(attempt = 0) {
  requestAnimationFrame(() => {
    if (renderRescue() || attempt >= 4) return;
    scheduleRender(attempt + 1);
  });
}

async function refreshRescue() {
  if (state.view !== "home") return;
  const serial = ++requestSerial;
  try {
    const data = await api("/api/home/rescue");
    if (serial !== requestSerial) return;
    rescue = data?.rescue || null;
  } catch {
    if (serial !== requestSerial) return;
    rescue = null;
  }
  scheduleRender();
}

function onStateChange() {
  const view = state.view;
  scheduleRender();
  if (view === "home" && lastView !== null && lastView !== "home") void refreshRescue();
  lastView = view;
}

export function initHomeRescue() {
  if (initialized) return;
  initialized = true;
  lastView = state.view;
  subscribe(onStateChange);
  void refreshRescue();
}
