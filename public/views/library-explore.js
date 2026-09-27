import { $ } from "../core/dom.js";
import { subscribe } from "../core/store.js";
import { initSourceShelves, renderSourceShelves } from "./source-shelves.js";

const MODES = ["genre", "theme", "creator", "label"];
const MODE_KEY = "contents-library-explore-mode-v2";
const OPEN_KEY = "contents-library-explore-open-v1";
let initialized = false;
let mode = "genre";

function ensureStyle() {
  if ($('link[href="/styles/library-explore.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/styles/library-explore.css";
  document.head.append(link);
}

function sync() {
  const root = $("#libraryExplore");
  const body = $("#libraryExploreBody");
  if (!root || !body) return;

  root.dataset.exploreMode = mode;
  body.querySelectorAll("[data-library-explore-mode]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.libraryExploreMode === mode));
  });

  const genre = $("#genreShelf");
  const theme = $("#themeShelf");
  if (genre) genre.hidden = mode !== "genre";
  if (theme) theme.hidden = mode !== "theme";
  renderSourceShelves(mode);
}

export function initLibraryExplore() {
  if (initialized) return;
  initialized = true;
  ensureStyle();
  initSourceShelves();

  try {
    const stored = localStorage.getItem(MODE_KEY);
    if (MODES.includes(stored)) mode = stored;
    const open = localStorage.getItem(OPEN_KEY);
    const details = $("#libraryExplore");
    if (details && open === "true") details.open = true;
  } catch {}

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-library-explore-mode]");
    if (!button) return;
    const next = button.dataset.libraryExploreMode;
    if (!MODES.includes(next)) return;
    mode = next;
    try { localStorage.setItem(MODE_KEY, mode); } catch {}
    sync();
  });

  $("#libraryExplore")?.addEventListener("toggle", (event) => {
    try { localStorage.setItem(OPEN_KEY, String(event.currentTarget.open)); } catch {}
    if (event.currentTarget.open) sync();
  });

  subscribe(sync);
  sync();
}
