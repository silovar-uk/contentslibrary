const OWNED_UNREAD_VALUE = 'owned_unread';
const OWNED_UNREAD_LABEL = '所持・未読';

function ensureOwnedUnreadOption(select, afterValue = 'want') {
  if (!select || select.querySelector(`option[value="${OWNED_UNREAD_VALUE}"]`)) return;
  const option = document.createElement('option');
  option.value = OWNED_UNREAD_VALUE;
  option.textContent = OWNED_UNREAD_LABEL;
  const after = select.querySelector(`option[value="${afterValue}"]`);
  if (after?.nextSibling) select.insertBefore(option, after.nextSibling);
  else select.append(option);
}

function normalizeOwnedUnreadLabels(root = document) {
  ensureOwnedUnreadOption(root.querySelector?.('#filterStatus'));
  ensureOwnedUnreadOption(root.querySelector?.('#workForm select[name="status"]'));
  root.querySelectorAll?.('select[name="status"]').forEach((select) => {
    ensureOwnedUnreadOption(select);
    const option = select.querySelector(`option[value="${OWNED_UNREAD_VALUE}"]`);
    if (option) option.textContent = OWNED_UNREAD_LABEL;
  });

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    if (node.nodeValue?.trim() === OWNED_UNREAD_VALUE || node.nodeValue?.trim() === 'undefined') {
      const parent = node.parentElement;
      if (parent?.closest('.type-status, #activeFilters, select[name="status"]')) node.nodeValue = OWNED_UNREAD_LABEL;
    }
  });

  const detailStatus = root.querySelector?.('#detailPanel .type-status');
  const quickSelect = root.querySelector?.('#quickEditForm select[name="status"]');
  if (detailStatus?.textContent.includes(OWNED_UNREAD_LABEL) && quickSelect) {
    ensureOwnedUnreadOption(quickSelect);
    quickSelect.value = OWNED_UNREAD_VALUE;
  }
}

function startV08() {
  normalizeOwnedUnreadLabels(document);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) normalizeOwnedUnreadLabels(node);
      });
      if (mutation.type === 'characterData') normalizeOwnedUnreadLabels(mutation.target.parentElement || document);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startV08, { once: true });
else startV08();
