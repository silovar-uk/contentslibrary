function restoreAvatarInitialAnchorV16() {
  const settings = document.querySelector('.avatar-button[data-action="open-settings"]');
  if (!settings || document.getElementById('avatarInitial')) return;
  const anchor = document.createElement('span');
  anchor.id = 'avatarInitial';
  anchor.className = 'sr-only';
  anchor.textContent = 'U';
  settings.prepend(anchor);
}

function revealUiV16() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.documentElement.classList.remove('ui-booting');
      if (window.__sakuhinLogBootTimer) {
        clearTimeout(window.__sakuhinLogBootTimer);
        window.__sakuhinLogBootTimer = null;
      }
      document.dispatchEvent(new CustomEvent('sakuhin-log:ui-ready'));
    });
  });
}

restoreAvatarInitialAnchorV16();
revealUiV16();
