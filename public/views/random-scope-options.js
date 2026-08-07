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
    const count = Number(counts[scope.value] || 0);
    option.value = scope.value;
    option.textContent = randomScopeOptionLabel(scope.label, count, state.loaded);
    option.disabled = state.loaded && count === 0;
    fragment.append(option);
  }

  select.replaceChildren(fragment);
  const available = state.loaded ? RANDOM_PICK_SCOPES.filter((scope) => Number(counts[scope.value] || 0) > 0) : RANDOM_PICK_SCOPES;
  const selectedAvailable = available.some((scope) => scope.value === selected);
  const fallback = available.find((scope) => scope.value === "next") || available[0] || null;
  const nextValue = selectedAvailable ? selected : fallback?.value || selected;
  select.value = nextValue;
  select.disabled = state.loaded && available.length === 0;

  const draw = $("[data-action='draw-random']");
  if (draw) draw.disabled = state.loaded && available.length === 0;

  if (state.loaded && nextValue !== selected && available.length) {
    queueMicrotask(() => select.dispatchEvent(new Event("change", { bubbles: true })));
  }
}

export function initRandomScopeOptions() {
  if (initialized) return;
  initialized = true;
  renderRandomScopeOptions();
  subscribe(renderRandomScopeOptions);
}
