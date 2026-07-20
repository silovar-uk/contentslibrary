function restoreAvatarInitialAnchorV16() {
  const settings = document.querySelector('.avatar-button[data-action="open-settings"]');
  if (!settings || document.getElementById('avatarInitial')) return;
  const anchor = document.createElement('span');
  anchor.id = 'avatarInitial';
  anchor.className = 'sr-only';
  anchor.textContent = 'U';
  settings.prepend(anchor);
}

function nextPaintV16() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

async function revealUiV16() {
  const styleReady = window.__sakuhinLogUiStyleReady ?? Promise.resolve();
  const safetyLimit = new Promise((resolve) => setTimeout(resolve, 1200));
  await Promise.race([styleReady, safetyLimit]);
  await nextPaintV16();

  document.documentElement.classList.remove('ui-booting');
  if (window.__sakuhinLogBootTimer) {
    clearTimeout(window.__sakuhinLogBootTimer);
    window.__sakuhinLogBootTimer = null;
  }
  document.dispatchEvent(new CustomEvent('sakuhin-log:ui-ready'));
}

restoreAvatarInitialAnchorV16();
revealUiV16();
