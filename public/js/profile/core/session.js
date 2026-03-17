/*
  public/js/profile/core/session.js

  Session-aware profile loading and profile state synchronization.
*/

/* -------------------------------------------------------------------------- */
/* Session manager                                                            */
/* -------------------------------------------------------------------------- */
function createProfileSession(deps) {
  const {
    profileUsernameText,
    profileDisplayText,
    profileRoleText,
    setAvatarPreview,
    showToast
  } = deps;

  function authFetch(url, options = {}) {
    return fetch(url, {
      credentials: 'include',
      ...options,
      headers: {
        ...options.headers
      }
    });
  }

  function readCachedUser() {
    try {
      const raw = localStorage.getItem('voux_nav_user');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || (!parsed.username && !parsed.displayName)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function applyCachedProfile(user) {
    if (!user) return;
    if (profileUsernameText) profileUsernameText.textContent = user.username || '';
    if (profileDisplayText) {
      profileDisplayText.textContent = user.displayName || 'No display name';
      profileDisplayText.classList.toggle('hint', !user.displayName);
    }
    setAvatarPreview(user.avatarUrl || '', user.displayName || user.username);
  }

  function syncProfile(updated) {
    if (!updated) return;

    if (profileDisplayText) {
      profileDisplayText.textContent = updated.displayName || 'No display name';
      profileDisplayText.classList.toggle('hint', !updated.displayName);
    }

    if (profileUsernameText && updated.username) {
      profileUsernameText.textContent = updated.username;
    }

    if (profileRoleText) {
      profileRoleText.textContent = updated.isOwner ? 'Owner' : updated.role === 'admin' ? 'Admin' : 'Member';
    }

    if (updated.avatarUrl !== undefined) {
      setAvatarPreview(updated.avatarUrl || '', updated.displayName || updated.username);
    }

    document.dispatchEvent(new CustomEvent('voux:session-updated', { detail: { user: updated } }));
  }

  async function loadProfile() {
    const revealPage = () => {
      document.documentElement.classList.remove('auth-pending');
    };

    const cachedUser = readCachedUser();
    if (cachedUser) {
      applyCachedProfile(cachedUser);
    }

    const attempt = async () => {
      const res = await authFetch('/api/profile', { cache: 'no-store' });
      if (res.status === 401 || res.status === 403) {
        return { ok: false, unauthorized: true };
      }
      if (!res.ok) {
        return { ok: false, unauthorized: false };
      }
      const data = await res.json();
      return { ok: Boolean(data?.user), data };
    };

    try {
      let result = await attempt();
      if (!result.ok && result.unauthorized) {
        result = await attempt();
      }

      if (!result.ok) {
        if (result.unauthorized) {
          window.location.href = '/dashboard';
          return;
        }
        revealPage();
        showToast('Unable to load profile right now.', 'danger');
        return;
      }

      const user = result.data?.user || {};
      revealPage();

      if (profileUsernameText) profileUsernameText.textContent = user.username || '';
      if (profileRoleText) {
        profileRoleText.textContent = user.isOwner ? 'Owner' : user.role === 'admin' ? 'Admin' : 'Member';
      }
      if (profileDisplayText) {
        profileDisplayText.textContent = user.displayName || 'No display name';
        profileDisplayText.classList.toggle('hint', !user.displayName);
      }

      setAvatarPreview(user.avatarUrl || '', user.displayName || user.username);
    } catch {
      revealPage();
      showToast('Unable to load profile right now.', 'danger');
    }
  }

  return {
    authFetch,
    loadProfile,
    syncProfile
  };
}

export { createProfileSession };
