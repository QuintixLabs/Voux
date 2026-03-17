/*
  public/js/utils/errors.js

  Shared auth error helpers for UI messages.
*/

/* -------------------------------------------------------------------------- */
/* Shared errors namespace                                                    */
/* -------------------------------------------------------------------------- */
(function () {
  function normalizeAuthError(error, fallback) {
    if (!error) return fallback;
    const message = error.error || error.message || '';
    if (error.code === 'unauthorized' || message === 'unauthorized') {
      return 'Session expired. Please log in again.';
    }
    if (message === 'username_exists') {
      return 'That username is already taken.';
    }
    if (message === 'admin_permission_denied' || message === 'forbidden') {
      return "You don't have permission to do that.";
    }
    if (message === 'csrf_blocked') {
      return 'Request blocked (CSRF). Open this instance from its configured URL and try again.';
    }
    if (message === 'backup_not_owned') {
      return 'You can only restore backups that belong to your account.';
    }
    return message || fallback;
  }

  /* ------------------------------------------------------------------------ */
  /* Public API                                                               */
  /* ------------------------------------------------------------------------ */
  window.VouxErrors = {
    normalizeAuthError,

    /* cache nav user so header/avatar can render quickly after auth changes */
    cacheNavUser(user) {
      try {
        if (!user) {
          localStorage.removeItem('voux_nav_user');
          return;
        }
        const payload = {
          username: user.username || '',
          displayName: user.displayName || '',
          avatarUrl: user.avatarUrl || ''
        };
        localStorage.setItem('voux_nav_user', JSON.stringify(payload));
      } catch {}
    }
  };
})();
