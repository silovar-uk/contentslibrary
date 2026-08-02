import { $, $$ } from "./core/dom.js";
import { api } from "./core/api.js";
import { toast } from "./core/dom.js";
import { state, loadSnapshot, subscribe, setView, closeDetail, toggleQuickEdit } from "./core/store.js";
import { renderAccount, loadAdmin } from "./views/admin.js";
import { initHome, loadHome } from "./views/home.js";
import { initLibrary, renderWorkList } from "./views/library.js";
import { initDetail, openDetail } from "./views/detail.js";
import { initDialogs, openWorkDialog } from "./views/dialogs.js";
import "./views/admin.js";

function applyView() {
  const view = state.view;
  $("#app").dataset.view = view === "library" ? "library" : "home";
  $("#homeView").hidden = view !== "home";
  $("#settingsView").hidden = view !== "settings";
  $("#adminView").hidden = view !== "admin";
  if (view === "library") $("#main").focus({ preventScroll: true });
}

function bindShell() {
  document.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "go-home") { setView("home"); await loadHome(); }
    if (action === "open-settings") setView("settings");
    if (action === "open-admin") { setView("admin"); await loadAdmin(); }

    const mobile = event.target.closest("[data-mobile-view]")?.dataset.mobileView;
    if (mobile === "home") setView("home");
    if (mobile === "library") { setView("library"); $("#globalSearch").focus(); }
    if (mobile === "settings") setView("settings");
  });

  document.addEventListener("keydown", (event) => {
    const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); $("#globalSearch").focus(); }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      const form = document.activeElement?.closest("form");
      if (form && ["workForm", "quickEditForm", "noteForm", "inlineNoteForm", "experienceForm"].includes(form.id)) { event.preventDefault(); form.requestSubmit(); }
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
    initDialogs();
    initLibrary();
    initHome();
    initDetail();

    await Promise.all([loadHome(), loadSnapshot()]);
    renderWorkList();
    applyView();
  } catch (error) {
    toast(error.message, "error");
  }
}

init();

// 取込センター(owner専用・別系統機能)。#settingsView .settings-grid へ自己マウントし、
// document.body全体を監視することはないため、ライブラリ画面の再描画とは独立している。
import "./import-center/v09-style.js";
import "./import-center/app-v091-network.js";
import "./import-center/app-v09.js";
import "./import-center/v10-style.js";
import "./import-center/app-v10.js";
import "./import-center/v20-import-style.js";
import "./import-center/app-v20-import-orchestrator.js";
