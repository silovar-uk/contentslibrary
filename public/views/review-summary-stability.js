const PATCHED = Symbol("reviewSummaryStableText");

function stabilizeTextContent(element) {
  if (!element || element[PATCHED]) return;
  const descriptor = Object.getOwnPropertyDescriptor(Node.prototype, "textContent");
  if (!descriptor?.get || !descriptor?.set) return;
  Object.defineProperty(element, "textContent", {
    configurable: true,
    get() { return descriptor.get.call(this); },
    set(value) {
      const next = value == null ? "" : String(value);
      if (descriptor.get.call(this) === next) return;
      descriptor.set.call(this, next);
    }
  });
  element[PATCHED] = true;
}

function stabilizeAll(root = document) {
  if (root instanceof Element && root.matches("[data-review-summary-card]")) stabilizeTextContent(root);
  root.querySelectorAll?.("[data-review-summary-card]").forEach(stabilizeTextContent);
}

export function initReviewSummaryStability() {
  stabilizeAll();
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof Element) stabilizeAll(node);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
