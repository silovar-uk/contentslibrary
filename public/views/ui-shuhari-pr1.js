const STYLE_ID = "ui-shuhari-pr1-style";

function ensureHiddenRule() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = "[hidden]{display:none!important}";
  document.head.append(style);
}

function moveImportCenterToEnd() {
  const grid = document.querySelector("#settingsView .settings-grid");
  const card = document.querySelector("#importCenterCard");
  if (!grid || !card || card.parentElement !== grid || grid.lastElementChild === card) return;
  grid.append(card);
}

function scheduleSettingsOrderFix() {
  setTimeout(moveImportCenterToEnd, 0);
  setTimeout(moveImportCenterToEnd, 250);
}

export function initUiShuhariPr1() {
  ensureHiddenRule();
  scheduleSettingsOrderFix();
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-action='open-settings']")) scheduleSettingsOrderFix();
  });
}
