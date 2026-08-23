import { $ } from "../core/dom.js";

let initialized = false;

export function initUiPolish() {
  if (initialized) return;
  initialized = true;

  const stylesheets = [
    "/styles/ui-polish.css",
    "/styles/refined-ui.css",
  ];

  for (const href of stylesheets) {
    if ($(`link[href="${href}"]`)) continue;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.append(link);
  }
}
