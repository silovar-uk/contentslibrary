import { $ } from "../core/dom.js";

let initialized = false;

export function initUiPolish() {
  if (initialized) return;
  initialized = true;
  if ($('link[href="/styles/ui-polish.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/styles/ui-polish.css";
  document.head.append(link);
}
