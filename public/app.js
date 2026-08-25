import { $, $$ } from "./core/dom.js";
import { api } from "./core/api.js";
import { toast, setBusy } from "./core/dom.js";
import { ratingLevel } from "./core/format.js";
import { state, loadSnapshot, setWorkRating, subscribe, setView, closeDetail, toggleQuickEdit, openNoteCardIds, toggleCardNote, submitCardNote } from "./core/store.js";
import { renderAccount, loadAdmin } from "./views/admin.js";
import { initHome, loadHome, drawRandomPicks } from "./views/home.js";
import { initRandomScopeOptions } from "./views/random-scope-options.js";
import { initHomeExperience } from "./views/home-experience.js";
import { initEditorialHome } from "./views/editorial-home.js";
import { initWalletStacks } from "./views/wallet-stacks.js";
import { initLibrary, renderWorkList } from "./views/library.js";
import { initReadingPriority } from "./views/reading-priority.js";
import { initReadingPrioritySurfaces } from "./views/reading-priority-surfaces.js";
import { initLightEditSurfaces } from "./views/light-edit-surfaces.js";
import { initDetail, openDetail } from "./views/detail.js";
import { initDetailTopNotes } from "./views/detail-top-notes.js";
import { initAmazonTitleSearch } from "./views/amazon-title-search.js";
import { initCoverResolution } from "./views/cover-resolution.js";
import { initWordMemos } from "./views/word-memos.js";
import { initWordMemoBulkSelection } from "./views/word-memo-bulk-selection.js";
import { initReviewSummary } from "./views/review-summary.js";
import { initReviewSummaryStability } from "./views/review-summary-stability.js";
import { initDialogs, openWorkDialog } from "./views/dialogs.js";
import { initMobileSearch } from "./views/mobile-search.js";
import { initCommandPalette } from "./views/command-palette.js";
import { initUiPolish } from "./views/ui-polish.js";
import { initMobileDetailNav } from "./views/mobile-detail-nav.js";
import { initWorkMediaUrl } from "./views/work-media-url.js";
import { initBulkAdd } from "./views/bulk-add.js";
import { initBulkJsonAdd } from "./views/bulk-json-add.js";
import { initBulkJsonOpenFix } from "./views/bulk-json-open-fix.js";
import { initAddEntryFlow } from "./views/add-entry-flow.js";
import "./views/admin.js";

function applyView() {
  const view = state.view;
  $("#app").dataset.view = view === "library" ? "library" : "home";
  $("#homeView").hidden = view !== "home";
  $("#settingsView").hidden = view !== "settings";
  $("#adminView").hidden = view !== "admin";
}

function bindShell() {
  document.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "go-home") { setView("home"); await loadHome(); }
    if (action === "open-settings") setView("settings");
    if (action === "open-admin") { setView("admin"); await loadAdmin(); }

    const openWork = event.target.closest("[data-open-work]")?.dataset.openWork;
    if (openWork) { void openDetail(openWork); return; }

    const ratingButton = event.target.closest("[data-card-rating]");
    if (ratingButton) {
      const id = ratingButton.dataset.cardRating;
      const clickedValue = Number(ratingButton.dataset.ratingValue);
      const current = ratingLevel(state.works.get(id));
      const nextValue = clickedValue === current ? null : clickedValue;
      try {
        await setWorkRating(id, nextValue);
        toast(nextValue == null ? "評価を未設定にしました。" : `評価を${nextValue}にしました。`);
      } catch (error) { toast(error.message, "error"); }
      return;
    }

    const toggleNote = event.target.closest("[data-toggle-card-note]")?.dataset.toggleCardNote;
    if (toggleNote) {
      const opening = !openNoteCardIds.has(toggleNote);
      toggleCardNote(toggleNote);
      if (opening) setTimeout(() => $(`[data-card-note-form="${toggleNote}"] textarea`)?.focus(), 20);
      return;
    }

    const mobile = event.target.closest("[data-mobile-view]")?.dataset.mobileView;
    if (mobile === "home") setView("home");
    if (mobile === "library") { setView("library"); $("#globalSearch").focus(); }
    if (mobile === "settings") setView("settings");
  });

  document.addEventListener("submit", async (event) => {
    const workId = event.target.closest("[data-card-note-form]")?.dataset.cardNoteForm;
    if (!workId) return;
    event.preventDefault();
    const form = event.target;
    if (!form.content.value.trim()) { form.content.focus(); return; }
    const button = $('[type="submit"]', form);
    setBusy(button, true, "書き足し中…");
    try {
      await submitCardNote(workId, form.content.value);
      toast("メモを書き足しました。");
    } catch (e) { toast(e.message, "error"); setBusy(button, false); }
  });

  document.addEventListener("keydown", (event) => {
    const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); $("#globalSearch").focus(); }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      const form = document.activeElement?.closest("form");
      if (form && (["workForm", "bulkAddForm", "quickEditForm", "noteForm", "inlineNoteForm", "experienceForm", "bulkJsonAddForm", "reviewSummaryForm"].includes(form.id) || form.hasAttribute("data-card-note-form"))) { event.preventDefault(); form.requestSubmit(); }
    }
    if (!typing && !event.metaKey && !event.ctrlKey && event.key.toLowerCase() === "n") { event.preventDefault(); openWorkDialog(false); }
    if (!typing && !event.metaKey && !event.ctrlKey && event.key.toLowerCase() === "e" && state.selected) {
      event.preventDefault();
      if (matchMedia("(min-width:1200px)").matches) toggleQuickEdit();
      else openWorkDialog(true);
    }
    if (!typing && !event.metaKey && !event.ctrlKey && event.key === "Escape" && !$$("dialog[open]").length) closeDetail();
  });

  document.addEventListener("app:reload-snapshot", () => { void loadSnapshot(); });
  document.addEventListener("app:auth-lost", () => toast("ログイン状態を確認できません。再読み込みします。", "error"));
  subscribe(applyView);
}

async function init() {
  try {
    const meData = await api("/api/me");
    state.me = meData.user;
    $("#avatarInitial").textContent = (state.me.display_name || state.me.email || "U").slice(0, 1).toUpperCase();
    $("#adminButton").hidden = !["owner", "admin"].includes(state.me.role);
    renderAccount();

    bindShell();
    initWorkMediaUrl();
    initDialogs();
    initMobileSearch();
    initCommandPalette();
    initBulkAdd();
    initBulkJsonAdd();
    initBulkJsonOpenFix();
    initAddEntryFlow();
    initLibrary();
    initReadingPriority();
    initHome();
    initRandomScopeOptions();
    initReadingPrioritySurfaces();
    initLightEditSurfaces();
    initHomeExperience();
    initEditorialHome();
    initWalletStacks();
    initDetail();
    initAmazonTitleSearch();
    initDetailTopNotes();
    initCoverResolution();
    initWordMemos();
    initWordMemoBulkSelection();
    initReviewSummaryStability();
    initReviewSummary();
    initUiPolish();
    initMobileDetailNav();

    await Promise.all([loadHome(), loadSnapshot()]);
    renderWorkList();
    drawRandomPicks();
    applyView();
  } catch (error) {
    toast(error.message, "error");
  }
}

init();

import "./import-center/v09-style.js";
import "./import-center/app-v091-network.js";
import "./import-center/app-v09.js";
import "./import-center/v10-style.js";
import "./import-center/app-v10.js";
import "./import-center/v20-import-style.js";
import "./import-center/app-v20-import-orchestrator.js";
