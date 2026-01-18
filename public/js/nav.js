/*
  nav.js

  Navigation/account menu behavior and redirect to dashboard when needed.
*/

(() => {
  /* ------------------------------------------------------------------------ */
  /* Password toggles                                                         */
  /* ------------------------------------------------------------------------ */
  const toggles = document.querySelectorAll('.password-toggle');
  if (!toggles.length) return;
  toggles.forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const field = toggle.closest('.password-field');
      const input = field?.querySelector('input');
      if (!input) return;
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      const icon = toggle.querySelector('i');
      if (icon) icon.className = showing ? 'ri-eye-off-line' : 'ri-eye-line';
      toggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    });
  });
})();

(() => {
  /* ------------------------------------------------------------------------ */
  /* DOM references                                                           */
  /* ------------------------------------------------------------------------ */
  const menuButton = document.getElementById('navAccountButton');
  const menu = document.getElementById('navAccountMenu');
  const logoutBtn = document.getElementById('navAccountLogout');
  const settingsLink = menu?.querySelector('a[href="/settings"]');

  if (!menuButton || !menu) return;

  /* ------------------------------------------------------------------------ */
  /* State                                                                    */
  /* ------------------------------------------------------------------------ */
  let sessionUser = null;
  let sessionChecked = false;
  let sessionCheckInFlight = null;
  let cachedUser = null;

  /* ------------------------------------------------------------------------ */
  /* Menu events                                                              */
  /* ------------------------------------------------------------------------ */
  menuButton.addEventListener('click', async (event) => {
    event.preventDefault();
    if (sessionUser) {
      toggleMenu();
      return;
    }
    await checkSession();
    if (!sessionUser) {
      window.location.href = '/dashboard';
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

  logoutBtn?.addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    sessionUser = null;
    cachedUser = null;
    writeCachedUser(null);
    closeMenu();
    window.location.href = '/dashboard';
  });

  /* ------------------------------------------------------------------------ */
  /* Menu helpers                                                             */
  /* ------------------------------------------------------------------------ */
  function toggleMenu() {
    menu.classList.toggle('account-menu--open');
  }

  function closeMenu() {
    menu.classList.remove('account-menu--open');
  }

  /* ------------------------------------------------------------------------ */
  /* Session checks                                                           */
  /* ------------------------------------------------------------------------ */
  async function checkSession() {
    if (sessionCheckInFlight) return sessionCheckInFlight;
    sessionCheckInFlight = (async () => {
      try {
        const res = await fetch('/api/session', { credentials: 'include', cache: 'no-store' });
        if (!res.ok) {
          sessionChecked = true;
          sessionUser = null;
          cachedUser = null;
          updateMenuState();
          writeCachedUser(null);
          return sessionUser;
        }
        const data = await res.json();
        sessionUser = data?.user || null;
        sessionChecked = true;
        if (window.VouxErrors?.cacheNavUser) {
          window.VouxErrors.cacheNavUser(sessionUser);
        }
        updateMenuState();
        if (!sessionUser && menu.classList.contains('account-menu--open')) {
          closeMenu();
        }
        return sessionUser;
      } catch (error) {
        if (error?.name !== 'AbortError') {
          console.warn('Failed to check session', error);
        }
        sessionChecked = true;
        sessionUser = null;
        cachedUser = null;
        updateMenuState();
        writeCachedUser(null);
        if (menu.classList.contains('account-menu--open')) {
          closeMenu();
        }
        return sessionUser;
      } finally {
        sessionCheckInFlight = null;
      }
    })();
    return sessionCheckInFlight;
  }

  /* ------------------------------------------------------------------------ */
  /* UI updates                                                               */
  /* ------------------------------------------------------------------------ */
  function updateMenuState() {
    if (settingsLink) {
      settingsLink.classList.toggle('hidden', !sessionUser);
    }
    updateAccountButton(sessionUser);
  }

  function updateAccountButton(user) {
    if (!menuButton) return;
    if (!user) {
      menuButton.classList.remove('nav-account__button--avatar');
      menuButton.textContent = '';
      const icon = document.createElement('i');
      icon.className = 'ri-account-circle-fill';
      menuButton.appendChild(icon);
      return;
    }
    const display = user.displayName || user.username || '?';
    if (user.avatarUrl) {
      menuButton.classList.add('nav-account__button--avatar');
      menuButton.textContent = '';
      const img = document.createElement('img');
      img.className = 'nav-account__avatar';
      img.src = user.avatarUrl;
      img.alt = display;
      menuButton.appendChild(img);
      return;
    }
    const displayName = (user.displayName || '').trim();
    const fallbackName = (user.username || '?').trim();
    const letter = (displayName || fallbackName || '?').charAt(0).toUpperCase();
    menuButton.classList.add('nav-account__button--avatar');
    menuButton.textContent = '';
    const fallback = document.createElement('span');
    fallback.className = 'nav-account__avatar nav-account__avatar--fallback';
    fallback.textContent = letter;
    menuButton.appendChild(fallback);
  }

  /* ------------------------------------------------------------------------ */
  /* Cached user handling                                                     */
  /* ------------------------------------------------------------------------ */
  function readCachedUser() {
    try {
      const raw = localStorage.getItem('voux_nav_user');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || (!parsed.username && !parsed.displayName)) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function writeCachedUser(user) {
    try {
      if (!user) {
        localStorage.removeItem('voux_nav_user');
        localStorage.removeItem('voux_session_hint');
        return;
      }
      const payload = {
        username: user.username || '',
        displayName: user.displayName || '',
        avatarUrl: user.avatarUrl || ''
      };
      localStorage.setItem('voux_nav_user', JSON.stringify(payload));
      localStorage.setItem('voux_session_hint', '1');
    } catch (_) {}
  }

  function applyCachedAccountButton() {
    if (!cachedUser) return;
    updateAccountButton(cachedUser);
  }

  /* ------------------------------------------------------------------------ */
  /* Page events                                                              */
  /* ------------------------------------------------------------------------ */
  document.addEventListener('DOMContentLoaded', () => {
    cachedUser = readCachedUser();
    applyCachedAccountButton();
    if (!sessionChecked) {
      checkSession();
    }
  });

  window.addEventListener('pageshow', () => {
    sessionChecked = false;
    setTimeout(() => checkSession(), 0);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      sessionChecked = false;
      checkSession();
    }
  });

  document.addEventListener('voux:session-updated', (event) => {
    sessionUser = event.detail?.user || null;
    sessionChecked = true;
    cachedUser = sessionUser;
    writeCachedUser(sessionUser);
    updateMenuState();
  });

  window.addEventListener('beforeunload', () => {
    writeCachedUser(sessionUser);
  });
})();
