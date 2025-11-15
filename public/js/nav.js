(() => {
  const STORAGE_KEY = 'vouxAdminAuth';
  const menuButton = document.getElementById('navAccountButton');
  const menu = document.getElementById('navAccountMenu');
  const logoutBtn = document.getElementById('navAccountLogout');

  if (!menuButton || !menu) return;

  let tokenData = loadStoredToken();

  menuButton.addEventListener('click', (event) => {
    event.preventDefault();
    if (!hasValidToken()) {
    window.location.href = '/admin';
      return;
    }
    toggleMenu();
  });

  document.addEventListener('click', (event) => {
    if (!menu.classList.contains('account-menu--open')) return;
    if (!menu.contains(event.target) && event.target !== menuButton && !menuButton.contains(event.target)) {
      closeMenu();
    }
  });

  logoutBtn?.addEventListener('click', () => {
    clearStoredToken();
    closeMenu();
    window.location.href = '/admin';
  });

  function toggleMenu() {
    menu.classList.toggle('account-menu--open');
  }

  function closeMenu() {
    menu.classList.remove('account-menu--open');
  }

  function hasValidToken() {
    if (!tokenData) {
      tokenData = loadStoredToken();
    }
    return Boolean(tokenData);
  }

  function loadStoredToken() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed.token || !parsed.expiresAt || parsed.expiresAt < Date.now()) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return parsed;
    } catch (error) {
      console.warn('Failed to read admin token', error);
      return null;
    }
  }

  function clearStoredToken() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      tokenData = null;
    } catch (_) {
      // ignore
    }
  }
})();
