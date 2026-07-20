const ACTION_TITLES_V18 = {
  'open-work-dialog': '作品を追加',
  'open-settings': '設定を開く',
  'open-admin': '管理画面を開く',
  'clear-filters': '絞り込みを解除',
  'toggle-filters': '絞り込みを開く',
  'close-detail': '詳細を閉じる',
  'close-dialog': '閉じる',
  'edit-work': '作品を編集',
  'add-note': 'メモを追加',
  'add-experience': '体験を追加',
  'go-home': 'ホームへ戻る',
  'refresh-admin': '最新情報に更新',
  'delete-work': '作品を削除'
};

let lastMobileViewV18 = 'home';
let syncQueuedV18 = false;

function currentViewV18() {
  const settings = document.querySelector('#settingsView');
  const admin = document.querySelector('#adminView');
  const app = document.querySelector('#app');
  if (settings && !settings.hidden) return 'settings';
  if (admin && !admin.hidden) return 'settings';
  if (app?.dataset.view === 'library') {
    return lastMobileViewV18 === 'records' ? 'records' : 'library';
  }
  return 'home';
}

function syncMobileNavV18() {
  const current = currentViewV18();
  document.querySelectorAll('.mobile-nav [data-mobile-view]').forEach((button) => {
    const active = button.dataset.mobileView === current;
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
}

function enhanceActionLabelsV18(root = document) {
  root.querySelectorAll?.('button[data-action]').forEach((button) => {
    const title = ACTION_TITLES_V18[button.dataset.action];
    if (!title) return;
    if (!button.getAttribute('aria-label') && button.textContent.trim().length <= 1) {
      button.setAttribute('aria-label', title);
    }
    if (!button.title) button.title = title;
  });

  const randomHeader = root.querySelector?.('#v14HeaderRandom');
  if (randomHeader) {
    randomHeader.title = '未読・読みたい作品から1つ引く';
    randomHeader.setAttribute('aria-label', '未読・読みたい作品から1つ引く');
  }

  const randomMobile = root.querySelector?.('.v14-mobile-random');
  if (randomMobile) {
    randomMobile.title = '本を引く';
    randomMobile.setAttribute('aria-label', '本を引く');
  }

  const sort = root.querySelector?.('#sortSelect');
  if (sort && !sort.title) sort.title = '作品の並び順';
}

function scheduleSyncV18() {
  if (syncQueuedV18) return;
  syncQueuedV18 = true;
  requestAnimationFrame(() => {
    syncQueuedV18 = false;
    enhanceActionLabelsV18();
    syncMobileNavV18();
  });
}

function bindRefinedUiV18() {
  document.addEventListener('click', (event) => {
    const mobile = event.target.closest('[data-mobile-view]');
    if (mobile) lastMobileViewV18 = mobile.dataset.mobileView || 'home';

    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'go-home') lastMobileViewV18 = 'home';
    if (action === 'open-settings') lastMobileViewV18 = 'settings';
    if (action === 'open-admin') lastMobileViewV18 = 'settings';

    if (event.target.closest('[data-work-id]') || event.target.closest('[data-v15-genre]')) {
      lastMobileViewV18 = 'library';
    }
    scheduleSyncV18();
  }, true);

  const app = document.querySelector('#app');
  if (app) {
    new MutationObserver(scheduleSyncV18).observe(app, {
      attributes: true,
      attributeFilter: ['data-view'],
      childList: true,
      subtree: true
    });
  }

  document.addEventListener('sakuhin-log:ui-ready', scheduleSyncV18);
  document.documentElement.classList.add('ui-v18');
  scheduleSyncV18();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindRefinedUiV18, { once: true });
} else {
  bindRefinedUiV18();
}
