let reviewSafetyQueuedV211 = false;

function initializeClassificationChoicesV211(root = document) {
  root.querySelectorAll?.('.v21-preview-option:not([data-v211-defaulted])').forEach((option) => {
    const input = option.querySelector('[data-v21-label-kind]');
    const state = option.querySelector('small');
    if (!input || !state) return;
    const isCurrent = state.textContent.trim() === '現在使用中';
    if (!isCurrent) input.checked = false;
    if (state.textContent.trim() === '既存語彙') state.textContent = '既存語彙・確認して追加';
    if (state.textContent.trim() === '新しい候補') state.textContent = '新規候補・確認して追加';
    option.dataset.v211Defaulted = 'true';
  });
}

function scheduleClassificationSafetyV211() {
  if (reviewSafetyQueuedV211) return;
  reviewSafetyQueuedV211 = true;
  requestAnimationFrame(() => {
    reviewSafetyQueuedV211 = false;
    initializeClassificationChoicesV211();
  });
}

function startClassificationSafetyV211() {
  initializeClassificationChoicesV211();
  new MutationObserver(scheduleClassificationSafetyV211).observe(document.body, {
    childList: true,
    subtree: true
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startClassificationSafetyV211, { once: true });
} else {
  startClassificationSafetyV211();
}
