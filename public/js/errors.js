/*
  errors.js

  Shared auth error helpers for UI messages.
*/

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
    return message || fallback;
  }

  window.VouxErrors = {
    normalizeAuthError,
    cacheNavUser(user) {
      try {
        if (!user) {
          localStorage.removeItem('voux_nav_user');
          localStorage.removeItem('voux_session_checked_at');
          localStorage.removeItem('voux_session_hint');
          return;
        }
        const payload = {
          username: user.username || '',
          displayName: user.displayName || '',
          avatarUrl: user.avatarUrl || ''
        };
        localStorage.setItem('voux_nav_user', JSON.stringify(payload));
        localStorage.setItem('voux_session_checked_at', String(Date.now()));
        localStorage.setItem('voux_session_hint', '1');
      } catch (_) {}
    }
  };
})();
