/*
  profile.js

  Loads and updates the current user profile.
*/

/* -------------------------------------------------------------------------- */
/* DOM references                                                             */
/* -------------------------------------------------------------------------- */
const profileDisplayText = document.getElementById('profileDisplayText');
const profileDisplayEdit = document.getElementById('profileDisplayEdit');
const profileAvatarButton = document.getElementById('profileAvatarButton');
const profileAvatarFile = document.getElementById('profileAvatarFile');
const profileAvatarPreview = document.getElementById('profileAvatarPreview');
const profileAvatarFallback = document.getElementById('profileAvatarFallback');
const profileAvatarRemove = document.getElementById('profileAvatarRemove');
const profilePasswordReset = document.getElementById('profilePasswordReset');
const profilePasswordModal = document.getElementById('profilePasswordModal');
const profilePasswordMessage = document.getElementById('profilePasswordMessage');
const profilePasswordCurrent = document.getElementById('profilePasswordCurrent');
const profilePasswordNew = document.getElementById('profilePasswordNew');
const profilePasswordCurrentError = document.getElementById('profilePasswordCurrentError');
const profilePasswordNewError = document.getElementById('profilePasswordNewError');
const profilePasswordSave = document.getElementById('profilePasswordSave');
const profilePasswordCancel = document.getElementById('profilePasswordCancel');
const profileUsernameEdit = document.getElementById('profileUsernameEdit');
const profileUsernameText = document.getElementById('profileUsernameText');
const profileUsernameModal = document.getElementById('profileUsernameModal');
const profileUsernameNew = document.getElementById('profileUsernameNew');
const profileUsernamePassword = document.getElementById('profileUsernamePassword');
const profileUsernameError = document.getElementById('profileUsernameError');
const profileUsernameNewError = document.getElementById('profileUsernameNewError');
const profileUsernameSave = document.getElementById('profileUsernameSave');
const profileUsernameCancel = document.getElementById('profileUsernameCancel');
const profileDisplayModal = document.getElementById('profileDisplayModal');
const profileDisplayNew = document.getElementById('profileDisplayNew');
const profileDisplayError = document.getElementById('profileDisplayError');
const profileDisplaySave = document.getElementById('profileDisplaySave');
const profileDisplayCancel = document.getElementById('profileDisplayCancel');

/* -------------------------------------------------------------------------- */
/* Toasts                                                                     */
/* -------------------------------------------------------------------------- */
let toastContainer = document.querySelector('.toast-stack');
if (!toastContainer) {
  toastContainer = document.createElement('div');
  toastContainer.className = 'toast-stack';
  document.body.appendChild(toastContainer);
}

/* -------------------------------------------------------------------------- */
/* Networking                                                                 */
/* -------------------------------------------------------------------------- */
function authFetch(url, options = {}) {
  return fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      ...options.headers
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Toast helpers                                                              */
/* -------------------------------------------------------------------------- */
function showToast(message, variant = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast--${variant}`;
  toast.innerHTML = `<i class="${variant === 'success' ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'}"></i>
    <span>${message}</span>`;
  const timer = document.createElement('span');
  timer.className = 'toast__timer';
  toast.appendChild(timer);
  toastContainer.appendChild(toast);
  toastContainer.classList.add('toast-stack--interactive');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('toast--visible'));
  });
  let remaining = 2200;
  let startedAt = Date.now();
  toast.style.setProperty('--toast-duration', `${remaining}ms`);
  let timeout = setTimeout(removeToast, remaining);

  function removeToast() {
    if (toast.dataset.removing) return;
    toast.dataset.removing = 'true';
    toast.classList.remove('toast--visible');
    setTimeout(() => toast.remove(), 250);
    setTimeout(() => {
      if (!toastContainer.querySelector('.toast')) {
        toastContainer.classList.remove('toast-stack--interactive');
      }
    }, 260);
  }

  const pauseTimer = () => {
    if (!timeout) return;
    const elapsed = Date.now() - startedAt;
    remaining = Math.max(0, remaining - elapsed);
    clearTimeout(timeout);
    timeout = null;
    toast.classList.add('toast--paused');
  };

  const resumeTimer = () => {
    if (timeout || toast.dataset.removing) return;
    startedAt = Date.now();
    timeout = setTimeout(removeToast, remaining);
    toast.classList.remove('toast--paused');
  };

  toast._pauseToast = pauseTimer;
  toast._resumeToast = resumeTimer;

  const pauseAll = () => {
    toastContainer.querySelectorAll('.toast').forEach((node) => node._pauseToast?.());
  };

  const resumeAll = () => {
    toastContainer.querySelectorAll('.toast').forEach((node) => node._resumeToast?.());
  };

  toast.addEventListener('mouseenter', pauseAll);
  toast.addEventListener('mouseleave', resumeAll);
}

/* -------------------------------------------------------------------------- */
/* Error helpers                                                              */
/* -------------------------------------------------------------------------- */
function normalizeProfileError(error, fallback) {
  if (window.VouxErrors?.normalizeAuthError) {
    return window.VouxErrors.normalizeAuthError(error, fallback);
  }
  if (!error) return fallback;
  return error.message || fallback;
}

function setInlineError(el, message) {
  if (!el) return;
  const isHidden = el.classList.contains('is-hidden');
  const prev = el.dataset.errorText || '';
  const nextHidden = !message;
  if (nextHidden) {
    if (!isHidden) {
      el.textContent = '';
      el.classList.add('is-hidden');
      el.dataset.errorText = '';
    }
    return;
  }
  if (!isHidden && prev === message) return;
  el.dataset.errorText = message;
  if (el.textContent !== message) {
    el.textContent = message;
  }
  if (isHidden) {
    el.classList.remove('is-hidden');
  }
}

/* -------------------------------------------------------------------------- */
/* Avatar state                                                               */
/* -------------------------------------------------------------------------- */

if (profileAvatarPreview) {
  profileAvatarPreview.addEventListener('error', () => {
    profileAvatarPreview.classList.add('hidden');
    if (profileAvatarFallback) {
      profileAvatarFallback.classList.remove('hidden');
    }
    if (profileAvatarRemove) {
      profileAvatarRemove.disabled = true;
    }
  });
}

function setAvatarPreview(url, username) {
  const safeUrl = url || '';
  if (profileAvatarRemove) {
    profileAvatarRemove.disabled = !safeUrl;
  }
  if (profileAvatarPreview) {
    profileAvatarPreview.src = safeUrl;
    profileAvatarPreview.classList.toggle('hidden', !safeUrl);
  }
  if (profileAvatarFallback) {
    const fallback = (username || '?').trim().charAt(0).toUpperCase() || '?';
    profileAvatarFallback.textContent = fallback;
    profileAvatarFallback.classList.toggle('hidden', Boolean(safeUrl));
  }
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

/* -------------------------------------------------------------------------- */
/* Profile load                                                               */
/* -------------------------------------------------------------------------- */
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
  const profileRoleText = document.getElementById('profileRoleText');
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

loadProfile();

/* -------------------------------------------------------------------------- */
/* Avatar events                                                              */
/* -------------------------------------------------------------------------- */
profileAvatarButton?.addEventListener('click', () => {
  profileAvatarFile?.click();
});

profileAvatarFile?.addEventListener('change', () => {
  const file = profileAvatarFile.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('Choose an image file.', 'danger');
    profileAvatarFile.value = '';
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    showToast('Image must be under 2MB.', 'danger');
    profileAvatarFile.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const result = typeof reader.result === 'string' ? reader.result : '';
    if (!result) return;
    saveAvatarChange(result);
  };
  reader.readAsDataURL(file);
});

profileAvatarRemove?.addEventListener('click', () => {
  if (profileAvatarFile) profileAvatarFile.value = '';
  saveAvatarChange('');
});

/* -------------------------------------------------------------------------- */
/* Password reset                                                            */
/* -------------------------------------------------------------------------- */
function openPasswordModal() {
  if (!profilePasswordModal) return;
  const username = profileUsernameText?.textContent || '';
  const displayName = profileDisplayText && !profileDisplayText.classList.contains('hint')
    ? profileDisplayText.textContent
    : '';
  if (profilePasswordMessage) {
    profilePasswordMessage.textContent = displayName
      ? `Reset password for ${displayName}.`
      : `Reset password for ${username || 'this account'}.`;
  }
  if (profilePasswordCurrent) profilePasswordCurrent.value = '';
  if (profilePasswordNew) profilePasswordNew.value = '';
  setInlineError(profilePasswordCurrentError, '');
  setInlineError(profilePasswordNewError, '');
  profilePasswordModal.classList.add('modal-overlay--open');
  profilePasswordModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  profilePasswordCurrent?.focus();
}

function closePasswordModal() {
  if (!profilePasswordModal) return;
  profilePasswordModal.classList.remove('modal-overlay--open');
  profilePasswordModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

async function savePasswordReset() {
  const currentPassword = profilePasswordCurrent?.value || '';
  const newPassword = profilePasswordNew?.value || '';
  let hasError = false;
  if (!currentPassword) {
    setInlineError(profilePasswordCurrentError, 'Enter your current password.');
    hasError = true;
  }
  if (!newPassword) {
    setInlineError(profilePasswordNewError, 'Enter a new password.');
    hasError = true;
  } else if (newPassword.length < 6) {
    setInlineError(profilePasswordNewError, 'New password must be at least 6 characters.');
    hasError = true;
  }
  if (hasError) return;
  try {
    const res = await authFetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to reset password');
    }
    showToast('Password updated');
    setInlineError(profilePasswordCurrentError, '');
    setInlineError(profilePasswordNewError, '');
    closePasswordModal();
  } catch (error) {
    const message = error.message === 'invalid_credentials'
      ? 'Current password is incorrect.'
      : normalizeProfileError(error, 'Failed to reset password');
    if (profilePasswordCurrentError) {
      setInlineError(profilePasswordCurrentError, message);
    } else {
      await showAlert(message);
    }
  }
}

profilePasswordReset?.addEventListener('click', openPasswordModal);
profilePasswordCancel?.addEventListener('click', closePasswordModal);
profilePasswordModal?.addEventListener('click', (event) => {
  if (event.target === profilePasswordModal) closePasswordModal();
});
profilePasswordSave?.addEventListener('click', savePasswordReset);
profilePasswordCurrent?.addEventListener('input', () => setInlineError(profilePasswordCurrentError, ''));
profilePasswordNew?.addEventListener('input', () => setInlineError(profilePasswordNewError, ''));

/* -------------------------------------------------------------------------- */
/* Profile sync                                                               */
/* -------------------------------------------------------------------------- */
function syncProfile(updated) {
  if (!updated) return;
  if (profileDisplayText) {
    profileDisplayText.textContent = updated.displayName || 'No display name';
    profileDisplayText.classList.toggle('hint', !updated.displayName);
  }
  if (profileUsernameText && updated.username) {
    profileUsernameText.textContent = updated.username;
  }
  if (updated.avatarUrl !== undefined) {
    setAvatarPreview(updated.avatarUrl || '', updated.displayName || updated.username);
  }
  document.dispatchEvent(new CustomEvent('voux:session-updated', { detail: { user: updated } }));
}

/* -------------------------------------------------------------------------- */
/* Username change                                                           */
/* -------------------------------------------------------------------------- */
function openUsernameModal() {
  if (!profileUsernameModal) return;
  if (profileUsernameNew) profileUsernameNew.value = profileUsernameText?.textContent || '';
  if (profileUsernamePassword) profileUsernamePassword.value = '';
  setInlineError(profileUsernameNewError, '');
  setInlineError(profileUsernameError, '');
  profileUsernameModal.classList.add('modal-overlay--open');
  profileUsernameModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  profileUsernameNew?.focus();
}

function closeUsernameModal() {
  if (!profileUsernameModal) return;
  profileUsernameModal.classList.remove('modal-overlay--open');
  profileUsernameModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

async function saveUsernameChange() {
  const username = profileUsernameNew?.value?.trim().toLowerCase() || '';
  const currentPassword = profileUsernamePassword?.value || '';
  const currentUsername = profileUsernameText?.textContent?.trim().toLowerCase() || '';
  if (!username) {
    setInlineError(profileUsernameNewError, 'Username is required.');
    return;
  }
  if (currentUsername && username === currentUsername) {
    setInlineError(profileUsernameNewError, 'Choose a different username.');
    return;
  }
  if (!currentPassword) {
    setInlineError(profileUsernameError, 'Enter your current password.');
    return;
  }
  try {
    const res = await authFetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, currentPassword })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update username');
    }
    const data = await res.json().catch(() => ({}));
    const updated = data.user || {};
    if (profileUsernameText) profileUsernameText.textContent = updated.username || username;
    showToast('Username updated');
    syncProfile(updated);
    setInlineError(profileUsernameNewError, '');
    setInlineError(profileUsernameError, '');
    closeUsernameModal();
  } catch (error) {
    const message = error.message === 'username_exists'
      ? 'That username is already taken.'
      : error.message === 'username_unchanged'
        ? 'Choose a different username.'
      : error.message === 'invalid_credentials'
        ? 'Current password is incorrect.'
        : normalizeProfileError(error, 'Failed to update username.');
    if (error.message === 'username_exists' || error.message === 'username_unchanged') {
      setInlineError(profileUsernameNewError, message);
    } else {
      setInlineError(profileUsernameError, message);
    }
  }
}

profileUsernameEdit?.addEventListener('click', openUsernameModal);
profileUsernameCancel?.addEventListener('click', closeUsernameModal);
profileUsernameModal?.addEventListener('click', (event) => {
  if (event.target === profileUsernameModal) closeUsernameModal();
});
profileUsernameSave?.addEventListener('click', saveUsernameChange);
profileUsernameNew?.addEventListener('input', () => setInlineError(profileUsernameNewError, ''));
profileUsernamePassword?.addEventListener('input', () => setInlineError(profileUsernameError, ''));

/* -------------------------------------------------------------------------- */
/* Avatar updates                                                            */
/* -------------------------------------------------------------------------- */
async function saveAvatarChange(avatarUrl) {
  try {
    const res = await authFetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatarUrl })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update photo');
    }
    const data = await res.json().catch(() => ({}));
    const updated = data.user || {};
    showToast('Profile photo updated');
    syncProfile(updated);
  } catch (error) {
    showToast(normalizeProfileError(error, 'Failed to update photo.'), 'danger');
  }
}

/* -------------------------------------------------------------------------- */
/* Display name                                                              */
/* -------------------------------------------------------------------------- */
function openDisplayModal() {
  if (!profileDisplayModal) return;
  setInlineError(profileDisplayError, '');
  if (profileDisplayNew) {
    const current = profileDisplayText?.textContent || '';
    profileDisplayNew.value = current === 'No display name' ? '' : current;
  }
  profileDisplayModal.classList.add('modal-overlay--open');
  profileDisplayModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  profileDisplayNew?.focus();
}

function closeDisplayModal() {
  if (!profileDisplayModal) return;
  profileDisplayModal.classList.remove('modal-overlay--open');
  profileDisplayModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  setInlineError(profileDisplayError, '');
}

async function saveDisplayName() {
  const displayName = profileDisplayNew?.value?.trim() || '';
  try {
    const res = await authFetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update display name');
    }
    const data = await res.json().catch(() => ({}));
    const updated = data.user || {};
    showToast('Display name updated');
    syncProfile(updated);
    closeDisplayModal();
  } catch (error) {
    setInlineError(
      profileDisplayError,
      normalizeProfileError(error, 'Failed to update display name.')
    );
  }
}

profileDisplayEdit?.addEventListener('click', openDisplayModal);
profileDisplayCancel?.addEventListener('click', closeDisplayModal);
profileDisplayModal?.addEventListener('click', (event) => {
  if (event.target === profileDisplayModal) closeDisplayModal();
});
profileDisplaySave?.addEventListener('click', saveDisplayName);
