const STYLE_HREF = "/styles/ui-shuhari-pr2.css";

function ensureStyle() {
  if (document.querySelector(`link[href="${STYLE_HREF}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = STYLE_HREF;
  document.head.append(link);
}

export function initUiShuhariPr2() {
  ensureStyle();
}
