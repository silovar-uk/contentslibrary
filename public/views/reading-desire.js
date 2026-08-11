import { $, esc, toast } from "../core/dom.js";
import { api } from "../core/api.js";
import { state, subscribe, upsertWork, loadSnapshot } from "../core/store.js";

let initialized = false;
let observer = null;
let frame = 0;

function ensureStyle() {
  if ($('link[href="/styles/reading-desire.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/styles/reading-desire.css";
  document.head.append(link);
}

export function readingDesire(work) {
  const value = Number(work?.metadata?.reading_desire);
  return Number.isInteger(value) && value >= 1 && value <= 5 ? value : 0;
}

export function readingDesireMarkup(work, surface = "card") {
  const current = readingDesire(work);
  const buttons = [1,2,3,4,5].map((value) => `<button type="button" class="reading-desire-step ${value <= current ? "is-on" : ""} ${value === current ? "is-current" : ""}" data-reading-desire-set="${value}" data-work-id="${esc(work.id)}" aria-label="読みたさ ${value}" aria-pressed="${value === current}"><span>${value}</span></button>`).join("");
  return `<div class="reading-desire reading-desire-${surface}" data-reading-desire-for="${esc(work.id)}"><span class="reading-desire-label">読みたさ</span><div class="reading-desire-scale" role="group" aria-label="読みたさを5段階で設定">${buttons}</div>${current ? `<button type="button" class="reading-desire-clear" data-reading-desire-clear="${esc(work.id)}" aria-label="読みたさを未設定に戻す">×</button>` : ""}</div>`;
}

async function setReadingDesire(workId, value) {
  const work = state.works.get(String(workId)) || (String(state.selected?.work?.id || "") === String(workId) ? state.selected.work : null);
  if (!work) return;
  const current = readingDesire(work);
  const next = current === value ? 0 : value;
  const metadata = { ...(work.metadata || {}) };
  if (next) metadata.reading_desire = next;
  else delete metadata.reading_desire;

  try {
    const data = await api(`/api/works/${encodeURIComponent(workId)}`, {
      method: "PATCH",
      body: JSON.stringify({ version: Number(work.version), metadata })
    });
    if (state.selected?.work && String(state.selected.work.id) === String(workId)) {
      state.selected = { ...state.selected, work: data.work };
    }
    upsertWork(data.work);
    toast(next ? `読みたさを${next}にしました。` : "読みたさを未設定に戻しました。");
  } catch (error) {
    if (error.status === 409) await loadSnapshot();
    toast(error.message, "error");
  }
}

function decorateRandomCards() {
  document.querySelectorAll("#randomStage .random-pick-card").forEach((card) => {
    const open = card.querySelector("[data-open-work]");
    const id = open?.dataset.openWork;
    const work = id ? state.works.get(String(id)) : null;
    if (!work) return;
    const existing = card.querySelector(".reading-desire-card");
    const signature = `${work.id}:${work.version}:${readingDesire(work)}`;
    if (existing?.dataset.signature === signature) return;
    const holder = document.createElement("div");
    holder.innerHTML = readingDesireMarkup(work, "card").trim();
    const node = holder.firstElementChild;
    node.dataset.signature = signature;
    if (existing) existing.replaceWith(node);
    else {
      const rating = card.querySelector(".card-rating");
      if (rating) rating.before(node);
      else card.append(node);
    }
  });
}

function decorateDetail() {
  const panel = $("#detailPanel");
  const props = panel?.querySelector(".preference-panel");
  const work = state.selected?.work;
  if (!panel || !props || !work) return;
  let wrap = props.querySelector(".reading-desire-detail-row");
  const signature = `${work.id}:${work.version}:${readingDesire(work)}`;
  if (wrap?.dataset.signature === signature) return;
  const holder = document.createElement("div");
  holder.innerHTML = `<div class="reading-desire-detail-row" data-signature="${esc(signature)}"><span class="reading-desire-property-label">読みたさ</span>${readingDesireMarkup(work, "detail")}</div>`;
  const node = holder.firstElementChild;
  if (wrap) wrap.replaceWith(node);
  else {
    const status = props.querySelector(".light-edit-status-wrap");
    if (status) status.after(node);
    else props.prepend(node);
  }
}

function apply() {
  decorateRandomCards();
  decorateDetail();
}

function scheduleApply() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(apply);
}

export function initReadingDesire() {
  if (initialized) return;
  initialized = true;
  ensureStyle();
  observer = new MutationObserver(scheduleApply);
  [$("#randomStage"), $("#detailPanel")].filter(Boolean).forEach((node) => observer.observe(node, { childList: true, subtree: true }));
  subscribe(scheduleApply);

  document.addEventListener("click", (event) => {
    const step = event.target.closest("[data-reading-desire-set]");
    if (step) {
      event.preventDefault();
      event.stopPropagation();
      void setReadingDesire(step.dataset.workId, Number(step.dataset.readingDesireSet));
      return;
    }
    const clear = event.target.closest("[data-reading-desire-clear]");
    if (clear) {
      event.preventDefault();
      event.stopPropagation();
      void setReadingDesire(clear.dataset.readingDesireClear, 0);
    }
  });

  scheduleApply();
}
