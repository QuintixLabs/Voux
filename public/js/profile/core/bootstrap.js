/*
  public/js/profile/bootstrap.js

  Early profile field hydration from cached session data.
*/

/* -------------------------------------------------------------------------- */
/* Cached profile bootstrap                                                   */
/* -------------------------------------------------------------------------- */
(function () {
  function readCachedUser() {
    try {
      if (localStorage.getItem('voux_session_hint') !== '1') {
        return null;
      }
      const raw = localStorage.getItem('voux_nav_user');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || (!parsed.username && !parsed.displayName)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  function applyCachedProfile(user) {
    if (!user) return;

    const usernameText = document.getElementById('profileUsernameText');
    const displayText = document.getElementById('profileDisplayText');
    const roleText = document.getElementById('profileRoleText');
    const avatarPreview = document.getElementById('profileAvatarPreview');
    const avatarFallback = document.getElementById('profileAvatarFallback');

    const username = user.username || '';
    const displayName = user.displayName || '';
    const avatarUrl = user.avatarUrl || '';
    const fallbackText =
      (displayName || username || '?').trim().charAt(0).toUpperCase() || '?';

    if (usernameText) {
      usernameText.textContent = username;
    }

    if (displayText) {
      displayText.textContent = displayName || 'No display name';
      displayText.classList.toggle('hint', !displayName);
    }

    if (roleText) {
      roleText.textContent = user.isOwner
        ? 'Owner'
        : user.role === 'admin' || user.isAdmin
          ? 'Admin'
          : user.role
            ? 'Member'
            : '';
    }

    if (avatarPreview && avatarFallback) {
      if (avatarUrl) {
        avatarPreview.src = avatarUrl;
        avatarPreview.classList.remove('hidden');
        avatarFallback.classList.add('hidden');
      } else {
        avatarFallback.textContent = fallbackText;
        avatarFallback.classList.remove('hidden');
        avatarPreview.classList.add('hidden');
      }
    }
  }

  applyCachedProfile(readCachedUser());
})();
