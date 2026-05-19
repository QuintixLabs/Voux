/*
  public/js/layout/nav.js

  Navigation/account menu behavior and redirect to dashboard when needed.
*/

const GUEST_BUTTON_MARKUP =
  `<i class="icon" style="--icon:url('/assets/icons/ui/account-circle-fill.svg')" aria-hidden="true"></i>`;

function setNavAuthCachedClass(active) {
  document.documentElement.classList.toggle('nav-auth-cached', Boolean(active));
}

(() => {
  /* ------------------------------------------------------------------------ */
  /* Early cached account state                                               */
  /* ------------------------------------------------------------------------ */
  const menuButton = document.getElementById('navAccountButton');
  if (!menuButton) return;
  if (document.body?.dataset?.page === 'setup') {
    setNavAuthCachedClass(false);
    return;
  }

  let user = null;
  try {
    if (localStorage.getItem('voux_session_hint') !== '1') {
      localStorage.removeItem('voux_nav_user');
      setNavAuthCachedClass(false);
      return;
    }
    const raw = localStorage.getItem('voux_nav_user') || '';
    if (raw) {
      user = JSON.parse(raw);
    }
  } catch {}

  if (!user || typeof user !== 'object') {
    setNavAuthCachedClass(false);
    return;
  }

  setNavAuthCachedClass(true);
  menuButton.dataset.accountKey = JSON.stringify({
    username: user.username || '',
    displayName: user.displayName || '',
    avatarUrl: user.avatarUrl || ''
  });

  if (user.avatarUrl) {
    menuButton.classList.add('nav-account__button--avatar');
    menuButton.textContent = '';

    const fallbackName = (user.username || '?').trim();
    const displayName = (user.displayName || '').trim();
    const letter = (displayName || fallbackName || '?').charAt(0).toUpperCase();

    const fallback = document.createElement('span');
    fallback.className =
      'nav-account__avatar nav-account__avatar--fallback hidden';
    fallback.dataset.letter = letter;
    fallback.setAttribute('aria-label', letter);

    const img = document.createElement('img');
    img.className = 'nav-account__avatar nav-account__avatar--image';
    img.src = user.avatarUrl;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.addEventListener('error', () => {
      img.remove();
      fallback.classList.remove('hidden');
      menuButton.dataset.accountKey = '';
    });

    menuButton.append(fallback, img);
    return;
  }

  const fallbackName = (user.username || '?').trim();
  const displayName = (user.displayName || '').trim();
  const letter = (displayName || fallbackName || '?').charAt(0).toUpperCase();

  menuButton.classList.add('nav-account__button--avatar');
  menuButton.textContent = '';
  const fallback = document.createElement('span');
  fallback.className = 'nav-account__avatar nav-account__avatar--fallback';
  fallback.dataset.letter = letter;
  fallback.setAttribute('aria-label', letter);
  menuButton.appendChild(fallback);
})();

(() => {
  /* ------------------------------------------------------------------------ */
  /* Password toggles                                                         */
  /* ------------------------------------------------------------------------ */
  function initPasswordToggles() {
    const toggles = document.querySelectorAll('.password-toggle');
    if (!toggles.length) return;
    toggles.forEach((toggle) => {
      const field = toggle.closest('.password-field');
      const input = field?.querySelector('input');
      const icon = toggle.querySelector('i');

      const syncToggleState = () => {
        if (!input) return;
        const hidden = input.type === 'password';
        if (icon) {
          icon.style.setProperty(
            '--icon',
            hidden
              ? "url('/assets/icons/ui/eye.svg')"
              : "url('/assets/icons/ui/eye-off.svg')"
          );
        }
        toggle.setAttribute(
          'aria-label',
          hidden ? 'Show password' : 'Hide password'
        );
      };

      syncToggleState();
      toggle.addEventListener('click', () => {
        if (!input) return;
        input.type = input.type === 'password' ? 'text' : 'password';
        syncToggleState();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPasswordToggles, {
      once: true
    });
  } else {
    initPasswordToggles();
  }
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
  let sessionRetryCount = 0;
  let sessionGraceUntil = 0;
  cachedUser = readCachedUser();
  if (document.body?.dataset?.page === 'setup') {
    cachedUser = null;
    sessionUser = null;
    writeCachedUser(null);
  }
  updateAccountButton(cachedUser);
  if (cachedUser || localStorage.getItem('voux_session_hint') === '1') {
    checkSession();
  }

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
    if (
      !menu.contains(event.target) &&
      event.target !== menuButton &&
      !menuButton.contains(event.target)
    ) {
      closeMenu();
    }
  });

  logoutBtn?.addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    sessionUser = null;
    cachedUser = null;
    window.VouxState?.clearSession?.();
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
        const getSession = window.VouxState?.getSession
          ? window.VouxState.getSession()
          : fetch('/api/session', { credentials: 'include', cache: 'no-store' })
              .then((res) => (res.ok ? res.json() : null))
              .catch(() => null);
        const data = await getSession;
        sessionUser = data?.user || null;
        if (!sessionUser) {
          if (data?.unauthorized) {
            cachedUser = null;
            writeCachedUser(null);
          }
          const hasHint = localStorage.getItem('voux_session_hint') === '1';
          if (hasHint) {
            if (!sessionGraceUntil) {
              sessionGraceUntil = Date.now() + 1000;
            }
            if (sessionRetryCount < 2 && Date.now() < sessionGraceUntil) {
              sessionRetryCount += 1;
              sessionCheckInFlight = null;
              return checkSession();
            }
          }
          sessionRetryCount = 0;
          sessionGraceUntil = 0;
          sessionChecked = true;
          notifySessionUpdated(null);
          updateMenuState();
          return sessionUser;
        }
        sessionRetryCount = 0;
        sessionGraceUntil = 0;
        sessionChecked = true;
        if (window.VouxErrors?.cacheNavUser) {
          window.VouxErrors.cacheNavUser(sessionUser);
        }
        notifySessionUpdated(sessionUser);
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
        sessionUser = cachedUser || sessionUser || null;
        if (sessionUser) {
          updateMenuState();
          return sessionUser;
        }
        notifySessionUpdated(null);
        updateMenuState();
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
    if (!sessionUser && !cachedUser) {
      cachedUser = readCachedUser();
    }
    updateAccountButton(sessionUser || cachedUser);
  }

  function updateAccountButton(user) {
    if (!menuButton) return;
    const currentKey = menuButton.dataset.accountKey || '';
    const nextKey = user
      ? JSON.stringify({
          username: user.username || '',
          displayName: user.displayName || '',
          avatarUrl: user.avatarUrl || ''
        })
      : 'guest';
    if (currentKey === nextKey) {
      return;
    }
    menuButton.dataset.accountKey = nextKey;
    if (!user) {
      setNavAuthCachedClass(false);
      menuButton.classList.remove('nav-account__button--avatar');
      menuButton.innerHTML = GUEST_BUTTON_MARKUP;
      return;
    }
    setNavAuthCachedClass(true);
    if (user.avatarUrl) {
      menuButton.classList.add('nav-account__button--avatar');
      menuButton.textContent = '';
      const fallbackName = (user.username || '?').trim();
      const displayName = (user.displayName || '').trim();
      const letter = (displayName || fallbackName || '?')
        .charAt(0)
        .toUpperCase();

      const fallback = document.createElement('span');
      fallback.className =
        'nav-account__avatar nav-account__avatar--fallback hidden';
      fallback.dataset.letter = letter;
      fallback.setAttribute('aria-label', letter);

      const img = document.createElement('img');
      img.className = 'nav-account__avatar nav-account__avatar--image';
      img.src = user.avatarUrl;
      img.alt = '';
      img.setAttribute('aria-hidden', 'true');
      fallback.classList.add('hidden');
      img.addEventListener('error', () => {
        menuButton.dataset.accountKey = '';
        img.remove();
        fallback.classList.remove('hidden');
      });

      menuButton.appendChild(fallback);
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
    fallback.dataset.letter = letter;
    fallback.setAttribute('aria-label', letter);
    menuButton.appendChild(fallback);
  }

  /* ------------------------------------------------------------------------ */
  /* Cached user handling                                                     */
  /* ------------------------------------------------------------------------ */
  function readCachedUser() {
    try {
      if (localStorage.getItem('voux_session_hint') !== '1') {
        localStorage.removeItem('voux_nav_user');
        return null;
      }
      const raw = localStorage.getItem('voux_nav_user');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || (!parsed.username && !parsed.displayName)) return null;
      return parsed;
    } catch {
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
        avatarUrl: user.avatarUrl || '',
        role: user.role || '',
        isOwner: Boolean(user.isOwner),
        isAdmin: Boolean(user.isAdmin || user.role === 'admin')
      };
      localStorage.setItem('voux_nav_user', JSON.stringify(payload));
      localStorage.setItem('voux_session_hint', '1');
    } catch {}
  }

  function notifySessionUpdated(user) {
    document.dispatchEvent(
      new CustomEvent('voux:session-updated', { detail: { user: user || null } })
    );
  }

  function applyCachedAccountButton() {
    if (!cachedUser) {
      cachedUser = readCachedUser();
    }
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
      if (localStorage.getItem('voux_session_hint') === '1') {
        checkSession();
      }
    }
  });

  window.addEventListener('pageshow', () => {
    if (localStorage.getItem('voux_session_hint') !== '1') return;
    sessionChecked = false;
    setTimeout(() => checkSession(), 0);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (localStorage.getItem('voux_session_hint') !== '1') return;
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
    if (sessionUser || cachedUser) {
      writeCachedUser(sessionUser || cachedUser);
    }
  });
})();
