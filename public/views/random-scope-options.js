import { $ } from "../core/dom.js";
import { RANDOM_PICK_SCOPES, randomScopeCounts, state, subscribe } from "../core/store.js";

let initialized = false;

export function randomScopeOptionLabel(label, count, loaded = true) {
  return `${label}（${loaded ? Number(count || 0).toLocaleString("ja-JP") : "…"}）`;
}

function renderRandomScopeOptions() {
  const select = $("#randomScope");
  if (!select) return;
  const selected = select.value || "next";
  const counts = state.loaded ? randomScopeCounts() : {};
  const fragment = document.createDocumentFragment();

  for (const scope of RANDOM_PICK_SCOPES) {
    const option = document.createElement("option");
    option.value = scope.value;
    option.textContent = randomScopeOptionLabel(scope.label, counts[scope.value], state.loaded);
    fragment.append(option);
  }

  select.replaceChildren(fragment);
  select.value = RANDOM_PICK_SCOPES.some((scope) => scope.value === selected) ? selected : "next";
}

export function initRandomScopeOptions() {
  if (initialized) return;
  initialized = true;
  renderRandomScopeOptions();
  subscribe(renderRandomScopeOptions);
}
