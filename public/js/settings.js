/*
  settings.js

  Admin settings page logic: toggles, backups, and API key management.
*/

/* -------------------------------------------------------------------------- */
/* DOM references                                                             */
/* -------------------------------------------------------------------------- */
const settingsPanel = document.getElementById('settingsPanel');
const togglePrivate = document.getElementById('togglePrivateMode');
const toggleGuides = document.getElementById('toggleShowGuides');
const statusLabel = document.getElementById('settingsStatus');
const allowModeUniqueInput = document.getElementById('allowModeUnique');
const allowModeUnlimitedInput = document.getElementById('allowModeUnlimited');
const downloadBackupBtn = document.getElementById('downloadBackup');
const restoreFileInput = document.getElementById('restoreFile');
const backupStatusLabel = document.getElementById('backupStatus');
const apiKeysCard = document.getElementById('apiKeysCard');
const apiKeysList = document.getElementById('apiKeysList');
const apiKeyForm = document.getElementById('apiKeyForm');
const apiKeyNameInput = document.getElementById('apiKeyName');
const apiKeyScopeSelect = document.getElementById('apiKeyScope');
const apiKeyCountersField = document.getElementById('apiKeyCountersField');
const apiKeyCountersInput = document.getElementById('apiKeyCounters');
const apiKeyStatusLabel = document.getElementById('apiKeyStatus');
const brandingForm = document.getElementById('brandingForm');
const brandNameInputField = document.getElementById('brandNameInput');
const homeTitleInputField = document.getElementById('homeTitleInput');
const themeSelect = document.getElementById('themeSelect');
const brandingStatusLabel = document.getElementById('brandingStatus');
const resetBrandingBtn = document.getElementById('resetBranding');
const throttleSelect = document.getElementById('throttleSelect');
const purgeInactiveButton = document.getElementById('purgeInactiveButton');
const apiKeysPagination = document.getElementById('apiKeysPagination');
const apiKeysPrevBtn = document.getElementById('apiKeysPrev');
const apiKeysNextBtn = document.getElementById('apiKeysNext');
const apiKeysPageInfo = document.getElementById('apiKeysPageInfo');
const usersCard = document.getElementById('usersCard');
const usersList = document.getElementById('usersList');
const usersFilterSelect = document.getElementById('usersFilter');
const usersSearchInput = document.getElementById('usersSearch');
const usersPagination = document.getElementById('usersPagination');
const usersPrevBtn = document.getElementById('usersPrev');
const usersNextBtn = document.getElementById('usersNext');
const usersPageInfo = document.getElementById('usersPageInfo');
const settingsTabs = document.getElementById('settingsTabs');
const settingsTabButtons = settingsTabs ? Array.from(settingsTabs.querySelectorAll('.settings-tab')) : [];
let settingsTabsReady = false;
const userForm = document.getElementById('userForm');
const userNameInput = document.getElementById('userName');
const userDisplayInput = document.getElementById('userDisplay');
const userRoleSelect = document.getElementById('userRole');
const userPasswordInput = document.getElementById('userPassword');
const userStatusLabel = document.getElementById('userStatus');
const userEditModal = document.getElementById('userEditModal');
const userEditMessage = document.getElementById('userEditMessage');
const userEditUsername = document.getElementById('userEditUsername');
const userEditDisplay = document.getElementById('userEditDisplay');
const userEditPassword = document.getElementById('userEditPassword');
const userEditSave = document.getElementById('userEditSave');
const userEditCancel = document.getElementById('userEditCancel');
let activeUserEditor = null;


/* -------------------------------------------------------------------------- */
/* Users pager                                                                */
/* -------------------------------------------------------------------------- */
const usersPager = {
  list: [],
  page: 1,
  pageSize: 4,
  filter: 'all'
};
const brandingCard = document.getElementById('brandingCard');
const backupCard = document.getElementById('backupCard');
const backupDesc = backupCard?.querySelector('.settings-desc');

/* -------------------------------------------------------------------------- */
/* Defaults                                                                   */
/* -------------------------------------------------------------------------- */
const DEFAULT_BRAND_NAME = 'Voux';
const DEFAULT_HOME_TITLE = 'Voux · Simple Free & Open Source Hit Counter for Blogs and Websites';
const DEFAULT_THROTTLE_SECONDS = 0;
let initialBranding = {
  brandName: null,
  homeTitle: null,
  theme: null
};

/* -------------------------------------------------------------------------- */
/* State                                                                      */
/* -------------------------------------------------------------------------- */
let backupBusy = false;
let activeUser = null;
const apiKeyPager = {
  list: [],
  page: 1,
  pageSize: 3
};
const themeHelper = window.VouxTheme;
const ALLOWED_THEMES = (themeHelper?.THEMES && themeHelper.THEMES.length ? themeHelper.THEMES : ['default']);

let statusTimeout = null;

/* -------------------------------------------------------------------------- */
/* Theme helpers                                                              */
/* -------------------------------------------------------------------------- */

function applyThemeClass(theme) {
  if (themeHelper?.apply) {
    themeHelper.apply(theme);
  }
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
/* Session                                                                    */
/* -------------------------------------------------------------------------- */
async function checkSession() {
  const revealPage = () => {
    document.documentElement.classList.remove('auth-pending');
  };
  const attempt = async () => {
    const res = await fetch('/api/session', { credentials: 'include', cache: 'no-store' });
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
      showToast('Unable to load settings right now.', 'danger');
      return;
    }
    activeUser = result.data?.user || null;
    if (!activeUser) {
      window.location.href = '/dashboard';
      return;
    }
    if (activeUser.isAdmin) {
      initAdmin();
    } else {
      initMember();
    }
    revealPage();
  } catch (_) {
    revealPage();
    showToast('Unable to load settings right now.', 'danger');
  }
}

/* -------------------------------------------------------------------------- */
/* Init                                                                       */
/* -------------------------------------------------------------------------- */
checkSession();

function initAdmin() {
  fetchSettings()
    .then(({ config, usersPageSize }) => {
      populateForm(config);
      if (Number.isFinite(usersPageSize) && usersPageSize > 0) {
        usersPager.pageSize = usersPageSize;
      }
      initSettingsTabs(['settingsPanel', 'brandingCard', 'backupCard', 'apiKeysCard', 'usersCard']);
      setStatus('');
      togglePrivate?.addEventListener('change', () =>
        handleToggleChange({ privateMode: togglePrivate.checked }, togglePrivate.checked ? 'Private instance enabled' : 'Private instance disabled', togglePrivate)
      );
      toggleGuides?.addEventListener('change', () =>
        handleToggleChange({ showGuides: toggleGuides.checked }, toggleGuides.checked ? 'Guide cards shown' : 'Guide cards hidden', toggleGuides)
      );
      allowModeUniqueInput?.addEventListener('change', (event) => handleAllowedModesChange(event.target));
      allowModeUnlimitedInput?.addEventListener('change', (event) => handleAllowedModesChange(event.target));
      setupBackupControls();
      setupApiKeys();
      setupUsers();
      setupBrandingForm();
      throttleSelect?.addEventListener('change', () => handleThrottleChange());
      purgeInactiveButton?.addEventListener('click', () => handlePurgeInactive());
      document.body.classList.remove('settings-footer-hidden');
    })
    .catch(() => {
      showToast('Unable to load settings right now.', 'danger');
      document.body.classList.remove('settings-footer-hidden');
    });
}

function initMember() {
  initSettingsTabs(['backupCard']);
  if (backupDesc) {
    backupDesc.textContent = 'Download your counters as JSON or restore them later.';
  }
  setupBackupControls();
  document.body.classList.remove('settings-footer-hidden');
}

/* -------------------------------------------------------------------------- */
/* Settings load                                                              */
/* -------------------------------------------------------------------------- */
async function fetchSettings() {
  const res = await authFetch('/api/settings');
  if (!res.ok) throw new Error('Unauthorized');
  const data = await res.json();
  return {
    config: data.config || {},
    usersPageSize: Number(data.usersPageSize)
  };
}

/* -------------------------------------------------------------------------- */
/* Settings form                                                              */
/* -------------------------------------------------------------------------- */
function populateForm(config) {
  if (togglePrivate) togglePrivate.checked = Boolean(config.privateMode);
  if (toggleGuides) toggleGuides.checked = Boolean(config.showGuides);
  if (allowModeUniqueInput) allowModeUniqueInput.checked = config.allowedModes ? config.allowedModes.unique !== false : true;
  if (allowModeUnlimitedInput) allowModeUnlimitedInput.checked = config.allowedModes ? config.allowedModes.unlimited !== false : true;
  populateThemeOptions();
  if (brandNameInputField) brandNameInputField.value = config.brandName || DEFAULT_BRAND_NAME;
  if (homeTitleInputField) {
    homeTitleInputField.value = config.homeTitle || DEFAULT_HOME_TITLE;
  }
  if (themeSelect) {
    const theme = config.theme || 'default';
    if (themeSelect.querySelector(`option[value="${theme}"]`)) {
      themeSelect.value = theme;
    }
    applyThemeClass(theme);
  }
  if (throttleSelect) {
    const value = Number(config.unlimitedThrottleSeconds);
    const safe = Number.isFinite(value) ? String(value) : '0';
    let option = throttleSelect.querySelector(`option[value="${safe}"]`);
    if (!option) {
      option = document.createElement('option');
      option.value = safe;
      const seconds = Number(safe);
      const labelSeconds = Number.isFinite(seconds) ? seconds : 0;
      const pretty = labelSeconds === 1 ? '1 second' : `${labelSeconds} seconds`;
      option.textContent = `Throttle to ${pretty} per visitor`;
      option.dataset.custom = 'true';
      throttleSelect.appendChild(option);
    }
    throttleSelect.value = safe;
  }
  initialBranding = {
    brandName: brandNameInputField?.value?.trim() || DEFAULT_BRAND_NAME,
    homeTitle: homeTitleInputField?.value?.trim() || DEFAULT_HOME_TITLE,
    theme: (themeSelect?.value || 'default').trim()
  };
  setBrandingDirty(false);
}

/* -------------------------------------------------------------------------- */
/* Setup helpers                                                              */
/* -------------------------------------------------------------------------- */
function setupBackupControls() {
  downloadBackupBtn?.addEventListener('click', () => handleBackupDownload());
  restoreFileInput?.addEventListener('change', (event) => handleBackupRestore(event));
}

function setupApiKeys() {
  if (!apiKeysCard) return;
  loadApiKeys();
  apiKeyForm?.addEventListener('submit', (event) => handleApiKeyCreate(event));
  apiKeyScopeSelect?.addEventListener('change', updateApiKeyScopeState);
  apiKeysPrevBtn?.addEventListener('click', () => changeApiKeyPage(-1));
  apiKeysNextBtn?.addEventListener('click', () => changeApiKeyPage(1));
  updateApiKeyScopeState();
}

function setupBrandingForm() {
  if (!brandingForm) return;
  brandingForm.addEventListener('submit', (event) => handleBrandingSubmit(event));
  themeSelect?.addEventListener('change', handleThemePreview);
  brandNameInputField?.addEventListener('input', checkBrandingDirty);
  homeTitleInputField?.addEventListener('input', checkBrandingDirty);
  resetBrandingBtn?.addEventListener('click', handleBrandingReset);
}

function setupUsers() {
  if (!usersCard) return;
  loadUsers();
  userForm?.addEventListener('submit', handleUserCreate);
  usersFilterSelect?.addEventListener('change', () => {
    usersPager.filter = usersFilterSelect.value || 'all';
    usersPager.page = 1;
    renderUsersPage();
  });
  usersSearchInput?.addEventListener('input', () => {
    usersPager.page = 1;
    renderUsersPage();
  });
  usersPrevBtn?.addEventListener('click', () => {
    if (usersPager.page > 1) {
      usersPager.page -= 1;
      renderUsersPage();
    }
  });
  usersNextBtn?.addEventListener('click', () => {
    const totalPages = getUsersTotalPages();
    if (usersPager.page < totalPages) {
      usersPager.page += 1;
      renderUsersPage();
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Users                                                                      */
/* -------------------------------------------------------------------------- */
async function loadUsers(silent = false) {
  if (!usersList) return;
  if (!silent) {
    usersList.innerHTML = '<p class="hint">Loading users...</p>';
  }
  try {
    const res = await authFetch('/api/users');
    if (!res.ok) throw new Error('Failed to load users');
    const data = await res.json();
    const users = Array.isArray(data.users) ? data.users : [];
    usersPager.list = users;
    renderUsersPage();
  } catch (error) {
    if (!silent) {
      usersList.innerHTML = '<p class="hint">Unable to load users.</p>';
    }
    console.warn(error);
  }
}

function getFilteredUsers() {
  const query = (usersSearchInput?.value || '').trim().toLowerCase();
  const baseList = usersPager.list;
  let filtered = baseList;
  if (usersPager.filter === 'owner') {
    filtered = filtered.filter((user) => user.isOwner);
  }
  if (usersPager.filter === 'members') {
    filtered = filtered.filter((user) => user.role !== 'admin');
  }
  if (usersPager.filter === 'admins') {
    filtered = filtered.filter((user) => user.role === 'admin');
  }
  if (query) {
    filtered = filtered.filter((user) => {
      const name = `${user.displayName || ''} ${user.username || ''}`.toLowerCase();
      return name.includes(query);
    });
  }
  return filtered;
}

function getUsersTotalPages() {
  const total = getFilteredUsers().length;
  return Math.max(1, Math.ceil(total / usersPager.pageSize));
}

function renderUsersPage() {
  const filtered = getFilteredUsers();
  const query = (usersSearchInput?.value || '').trim();
  const totalPages = getUsersTotalPages();
  const page = Math.min(usersPager.page, totalPages);
  usersPager.page = page;
  const start = (page - 1) * usersPager.pageSize;
  const slice = filtered.slice(start, start + usersPager.pageSize);
  renderUsers(slice, query);
  if (usersPageInfo) {
    usersPageInfo.textContent = `Page ${page} / ${totalPages}`;
  }
  if (usersPagination) {
    usersPagination.classList.toggle('hidden', totalPages <= 1);
  }
  if (usersPrevBtn) usersPrevBtn.disabled = page <= 1;
  if (usersNextBtn) usersNextBtn.disabled = page >= totalPages;
}

function renderUsers(users, query = '') {
  if (!usersList) return;
  usersList.innerHTML = '';
  if (!users.length) {
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = query
      ? `No users found for "${query}".`
      : 'No users yet.';
    usersList.appendChild(hint);
    return;
  }
  users.forEach((user) => {
    const row = document.createElement('div');
    row.className = 'user-row';
    const meta = document.createElement('div');
    meta.className = 'user-row__meta';
    const avatar = document.createElement('div');
    avatar.className = 'user-row__avatar';
    if (user.avatarUrl) {
      const img = document.createElement('img');
      img.src = user.avatarUrl;
      img.alt = '';
      avatar.innerHTML = '';
      avatar.appendChild(img);
    } else {
      const name = (user.displayName || user.username || '?').trim();
      avatar.textContent = name.charAt(0).toUpperCase() || '?';
    }
    const title = document.createElement('strong');
    title.textContent = user.displayName ? `${user.displayName} (${user.username})` : user.username;
    const subtitle = document.createElement('span');
    subtitle.className = 'hint';
    const ownerLabel = user.isOwner ? 'Owner' : null;
    subtitle.textContent = ownerLabel || (user.role === 'admin' ? 'Admin' : 'Member');
    meta.append(avatar, title, subtitle);

    const actions = document.createElement('div');
    actions.className = 'user-row__actions';
    if (activeUser?.username === user.username) {
      const badge = document.createElement('span');
      badge.className = 'user-row__badge';
      badge.textContent = 'Yourself';
      actions.appendChild(badge);
    }
    const requesterIsOwner = Boolean(activeUser?.isOwner);
    const canEditRole = requesterIsOwner && activeUser?.id !== user.id;
    if (canEditRole) {
      const roleSelect = document.createElement('select');
      roleSelect.innerHTML = `
        <option value="user">Member</option>
        <option value="admin">Admin</option>
      `;
      roleSelect.value = user.role === 'admin' ? 'admin' : 'user';
      roleSelect.addEventListener('change', () => handleUserRoleChange(user, roleSelect));
      actions.appendChild(roleSelect);
    }

    if ((user.role !== 'admin' || requesterIsOwner) && activeUser?.id !== user.id) {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'ghost';
      editBtn.innerHTML = '<i class="ri-pencil-line"></i>';
      editBtn.addEventListener('click', () => openUserEditor(user));
      actions.appendChild(editBtn);
    }

    if (activeUser?.id !== user.id && (user.role !== 'admin' || requesterIsOwner)) {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'danger ghost';
      deleteBtn.innerHTML = '<i class="ri-delete-bin-line"></i>';
      deleteBtn.addEventListener('click', () => handleUserDelete(user));
      actions.appendChild(deleteBtn);
    }

    row.append(meta, actions);
    usersList.appendChild(row);
  });
}

/* -------------------------------------------------------------------------- */
/* User actions                                                               */
/* -------------------------------------------------------------------------- */
async function handleUserCreate(event) {
  event.preventDefault();
  if (!userNameInput || !userPasswordInput || !userRoleSelect) return;
  const username = userNameInput.value.trim();
  const password = userPasswordInput.value;
  const role = userRoleSelect.value === 'admin' ? 'admin' : 'user';
  const displayName = userDisplayInput?.value?.trim() || '';
  if (!username || !password) {
    showToast('Username and password are required.', 'danger');
    return;
  }
  if (password.length < 6) {
    showToast('Password must be at least 6 characters.', 'danger');
    return;
  }
  try {
    setUserStatus('');
    const res = await authFetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role, displayName })
    });
    assertSession(res);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create user');
    }
    userForm.reset();
    showToast('User created');
    loadUsers(true);
  } catch (error) {
    const message = error.message === 'username_exists'
      ? 'That username is already taken.'
      : error.message || 'Failed to create user.';
    await showAlert(normalizeAuthMessage(error, message));
  }
}

async function handleUserRoleChange(user, roleSelect) {
  if (!user?.id || !roleSelect) return;
  const nextRole = roleSelect.value === 'admin' ? 'admin' : 'user';
  const previousRole = user.role === 'admin' ? 'admin' : 'user';
  if (nextRole === previousRole) return;
  try {
    const res = await authFetch(`/api/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: nextRole })
    });
    assertSession(res);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update role');
    }
    const roleLabel = nextRole === 'admin' ? 'Admin' : 'Member';
    const userLabel = user.displayName || user.username || 'user';
    showToast(`Role updated: ${userLabel} → ${roleLabel}`);
    loadUsers(true);
  } catch (error) {
    roleSelect.value = previousRole;
    const message = error.message === 'last_admin'
      ? 'You need at least one admin on this instance.'
      : error.message === 'admin_edit_forbidden'
        ? 'Admin accounts cannot be edited.'
        : error.message === 'owner_locked'
          ? 'The owner account cannot be edited.'
          : error.message || 'Failed to update role';
    await showAlert(normalizeAuthMessage(error, message));
  }
}

function openUserEditor(user) {
  if (!userEditModal) return;
  activeUserEditor = user;
  if (userEditMessage) {
    const label = user.displayName ? `${user.displayName} (${user.username})` : user.username;
    userEditMessage.textContent = `Editing ${label}.`;
  }
  if (userEditUsername) userEditUsername.value = user.username || '';
  if (userEditDisplay) userEditDisplay.value = user.displayName || '';
  if (userEditPassword) userEditPassword.value = '';
  userEditModal.classList.add('modal-overlay--open');
  userEditModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  userEditUsername?.focus();
}

function closeUserEditor() {
  if (!userEditModal) return;
  userEditModal.classList.remove('modal-overlay--open');
  userEditModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  activeUserEditor = null;
}

userEditCancel?.addEventListener('click', closeUserEditor);
userEditModal?.addEventListener('click', (event) => {
  if (event.target === userEditModal) closeUserEditor();
});

userEditSave?.addEventListener('click', async () => {
  if (!activeUserEditor) return;
  const username = userEditUsername?.value?.trim().toLowerCase() || '';
  const displayName = userEditDisplay?.value?.trim() || '';
  const password = userEditPassword?.value || '';
  if (!username) {
    await showAlert('Username is required.');
    return;
  }
  if (password && password.length < 6) {
    await showAlert('Password must be at least 6 characters.');
    return;
  }
  const payload = { username, displayName };
  if (password) payload.password = password;
  try {
    const res = await authFetch(`/api/users/${activeUserEditor.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update user');
    }
    showToast('User updated');
    closeUserEditor();
    loadUsers(true);
  } catch (error) {
    const message = error.message === 'username_exists'
      ? 'That username is already taken.'
      : error.message === 'owner_locked'
        ? 'The owner account cannot be edited.'
        : error.message === 'admin_edit_forbidden'
          ? 'Admin accounts cannot be edited.'
          : normalizeAuthMessage(error, 'Failed to update user');
    await showAlert(normalizeAuthMessage(error, message));
  }
});

async function handleUserDelete(user) {
  if (!user?.id) return;
  const confirmed = await modalConfirm({
    title: 'Delete user?',
    message: `Remove "${user.username}" from this instance? Their counters will become unowned.`,
    confirmLabel: 'Delete user',
    variant: 'danger'
  });
  if (!confirmed) return;
  try {
    const res = await authFetch(`/api/users/${user.id}`, { method: 'DELETE' });
    assertSession(res);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to delete user');
    }
    showToast('User deleted');
    loadUsers(true);
  } catch (error) {
    await showAlert(normalizeAuthMessage(error, 'Failed to delete user'));
  }
}

function setUserStatus(message) {
  if (userStatusLabel) {
    userStatusLabel.textContent = message || '';
  }
}

/* -------------------------------------------------------------------------- */
/* Toggles + allowed modes                                                    */
/* -------------------------------------------------------------------------- */
async function handleToggleChange(patch, successMessage = 'Updated', control) {
  try {
    setStatus('');
    if (control) control.disabled = true;
    const res = await authFetch('/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(patch)
    });
    assertSession(res);
    if (!res.ok) throw new Error('Failed to save');
    await res.json().catch(() => ({}));
    setStatus('');
    showToast(successMessage);
  } catch (error) {
    setStatus('Error saving settings');
    await showAlert(normalizeAuthMessage(error, 'Failed to save settings'));
    resetStatusAfterDelay();
  } finally {
    if (control) control.disabled = false;
  }
}

function setStatus(text) {
  if (statusLabel) statusLabel.textContent = text || '';
}

function resetStatusAfterDelay() {
  clearTimeout(statusTimeout);
  statusTimeout = setTimeout(() => {
    setStatus('');
  }, 1200);
}

function handleAllowedModesChange(sourceInput) {
  const allowed = {
    unique: allowModeUniqueInput?.checked !== false,
    unlimited: allowModeUnlimitedInput?.checked !== false
  };
  if (!allowed.unique && !allowed.unlimited) {
    if (sourceInput) sourceInput.checked = true;
    showToast('Keep at least one mode enabled.', 'danger');
    return;
  }
  handleToggleChange({ allowedModes: allowed }, 'Allowed modes updated', sourceInput);
}

/* -------------------------------------------------------------------------- */
/* Modal helpers                                                              */
/* -------------------------------------------------------------------------- */
function modalApi() {
  return window.VouxModal;
}

function ensureToastSupport() {
  if (window.showToast) return window.showToast;
  let container = document.querySelector('.toast-stack');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-stack';
    document.body.appendChild(container);
  }
  window.showToast = (message, variant = 'success') => {
    const toast = document.createElement('div');
    toast.className = `toast toast--${variant}`;
    toast.innerHTML = `<i class="${variant === 'success' ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'}"></i>
      <span>${message}</span>`;
    container.appendChild(toast);
    container.classList.add('toast-stack--interactive');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add('toast--visible'));
    });

    let remaining = 2200;
    let startedAt = Date.now();
    let timeout = setTimeout(removeToast, remaining);

    function removeToast() {
      if (toast.dataset.removing) return;
      toast.dataset.removing = 'true';
      toast.classList.remove('toast--visible');
      setTimeout(() => toast.remove(), 250);
      setTimeout(() => {
        if (!container.querySelector('.toast')) {
          container.classList.remove('toast-stack--interactive');
        }
      }, 260);
    }

    const pauseTimer = () => {
      if (!timeout) return;
      const elapsed = Date.now() - startedAt;
      remaining = Math.max(0, remaining - elapsed);
      clearTimeout(timeout);
      timeout = null;
    };

    const resumeTimer = () => {
      if (timeout || toast.dataset.removing) return;
      startedAt = Date.now();
      timeout = setTimeout(removeToast, remaining);
    };

    toast._pauseToast = pauseTimer;
    toast._resumeToast = resumeTimer;

    const pauseAll = () => {
      container.querySelectorAll('.toast').forEach((node) => node._pauseToast?.());
    };

    const resumeAll = () => {
      container.querySelectorAll('.toast').forEach((node) => node._resumeToast?.());
    };

    toast.addEventListener('mouseenter', pauseAll);
    toast.addEventListener('mouseleave', resumeAll);
  };
  return window.showToast;
}

function showToast(message, variant = 'success') {
  const toastFn = ensureToastSupport();
  toastFn(message, variant);
}

async function showAlert(message, options = {}) {
  if (modalApi()?.alert) {
    await modalApi().alert(message, options);
  } else {
    window.alert(message);
  }
}

function normalizeAuthMessage(error, fallback) {
  if (window.VouxErrors?.normalizeAuthError) {
    return window.VouxErrors.normalizeAuthError(error, fallback);
  }
  return error?.message || fallback;
}

function assertSession(res) {
  if (res?.status === 401 || res?.status === 403) {
    const error = new Error('unauthorized');
    error.code = 'unauthorized';
    throw error;
  }
}

function modalConfirm(options) {
  if (modalApi()?.confirm) {
    return modalApi().confirm(options);
  }
  const message = options?.message || 'Are you sure?';
  return Promise.resolve(window.confirm(message));
}

function modalConfirmWithInput(options) {
  if (modalApi()?.confirmWithInput) {
    return modalApi().confirmWithInput(options);
  }
  const entered = window.prompt(options?.promptMessage || 'Type DELETE to confirm');
  return Promise.resolve(entered && entered.trim() === (options?.inputMatch || 'DELETE'));
}

/* -------------------------------------------------------------------------- */
/* Backup                                                                     */
/* -------------------------------------------------------------------------- */
async function handleBackupDownload() {
  if (backupBusy) {
    showToast('Finish the current backup task first', 'danger');
    return;
  }
  try {
    backupBusy = true;
    if (downloadBackupBtn) downloadBackupBtn.disabled = true;
    setBackupStatus('');
    const res = await authFetch('/api/counters/export');
    assertSession(res);
    if (!res.ok) throw new Error('Failed to download backup');
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.href = url;
    link.download = `voux-backup-${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setBackupStatus('');
    showToast('Backup downloaded');
  } catch (error) {
    setBackupStatus('');
    await showAlert(normalizeAuthMessage(error, 'Failed to download backup'));
  } finally {
    backupBusy = false;
    if (downloadBackupBtn) downloadBackupBtn.disabled = false;
  }
}

async function handleBackupRestore(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (backupBusy) {
    showToast('Finish the current backup task first', 'danger');
    event.target.value = '';
    return;
  }
  try {
    setBackupStatus('Reading backup...');
    const text = await file.text();
    const parsed = JSON.parse(text);
    let payload = null;
    let dailyPayload = [];
    if (Array.isArray(parsed)) {
      payload = parsed;
    } else if (parsed && Array.isArray(parsed.counters)) {
      payload = parsed.counters;
      if (Array.isArray(parsed.daily)) {
        dailyPayload = parsed.daily;
      }
    }
    if (!payload) throw new Error('Invalid backup file.');
    const confirmed = await modalConfirm({
      title: 'Restore backup?',
      message: 'This will merge the backup counters into your current list.',
      confirmLabel: 'Restore backup'
    });
    if (!confirmed) {
      event.target.value = '';
      setBackupStatus('');
      showToast('Restore canceled', 'danger');
      return;
    }
    setBackupStatus('Uploading backup...');
    backupBusy = true;
    if (downloadBackupBtn) downloadBackupBtn.disabled = true;
    if (restoreFileInput) restoreFileInput.disabled = true;
    const body = { counters: payload, replace: false };
    if (dailyPayload.length) {
      body.daily = dailyPayload;
    }
    const res = await authFetch('/api/counters/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    assertSession(res);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to restore backup');
    }
    const result = await res.json();
    const count = result.imported || payload.length;
    const dailyCount = result.dailyImported || dailyPayload.length || 0;
    setBackupStatus('');
    const message = dailyCount ? `Restored ${count} counters and ${dailyCount} activity rows` : `Restored ${count} counters`;
    showToast(message);
  } catch (error) {
    setBackupStatus('');
    const message = error.message === 'counter_id_taken'
      ? 'One or more counter IDs already exist. Remove them or edit the backup file.'
      : error.message === 'backup_not_owned'
      ? 'This backup includes counters owned by another user.'
      : error.message || 'Failed to restore backup';
    await showAlert(normalizeAuthMessage(error, message));
  } finally {
    event.target.value = '';
    backupBusy = false;
    if (downloadBackupBtn) downloadBackupBtn.disabled = false;
    if (restoreFileInput) restoreFileInput.disabled = false;
  }
}

function setBackupStatus(message) {
  if (backupStatusLabel) {
    backupStatusLabel.textContent = message || '';
  }
}

/* -------------------------------------------------------------------------- */
/* Throttle + cleanup                                                         */
/* -------------------------------------------------------------------------- */
async function handleThrottleChange() {
  if (!throttleSelect) return;
  const value = Math.max(0, Number(throttleSelect.value) || DEFAULT_THROTTLE_SECONDS);
  try {
    setStatus('');
    const res = await authFetch('/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ unlimitedThrottleSeconds: value })
    });
    assertSession(res);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update throttle');
    }
    await res.json().catch(() => ({}));
    setStatus('');
    showToast(
      value
        ? `Every-visit hits now throttle to ${value}s per IP`
        : 'Throttle disabled'
    );
  } catch (error) {
    setStatus('');
    await showAlert(normalizeAuthMessage(error, 'Failed to update throttle'));
  }
}

async function handlePurgeInactive() {
  if (!purgeInactiveButton) {
    await showAlert('Log in again to manage counters.');
    return;
  }
  const siteUrl = window.location?.origin || window.location?.href || 'this site';
  const confirmedFinal = await modalConfirm({
    title: 'Really remove inactive counters?',
    message: `This will permanently remove every counter that has no hits for 30 days on: ${siteUrl}. You'll confirm by typing DELETE next.`,
    confirmLabel: 'Continue',
    cancelLabel: 'Cancel',
    variant: 'danger'
  });
  if (!confirmedFinal) return;
  const confirmedInput = await modalConfirmWithInput({
    title: 'Delete inactive counters?',
    message: 'Type DELETE to permanently remove inactive counters (30 days).',
    inputPlaceholder: 'DELETE',
    inputMatch: 'DELETE',
    inputHint: 'This cannot be undone.',
    promptMessage: 'Type DELETE to permanently remove inactive counters (30 days).', // fallback if modal is not available
    confirmLabel: 'Delete inactive',
    cancelLabel: 'Cancel',
    variant: 'danger'
  });
  if (!confirmedInput) return;
  purgeInactiveButton.disabled = true;
  try {
    const res = await authFetch('/api/counters/purge-inactive', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ days: 30 })
    });
    assertSession(res);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to delete inactive counters');
    }
    const payload = await res.json().catch(() => ({}));
    const removed = payload.removed || 0;
    showToast(`Deleted ${removed} inactive ${removed === 1 ? 'counter' : 'counters'}`);
  } catch (error) {
    await showAlert(normalizeAuthMessage(error, 'Failed to delete inactive counters'));
  } finally {
    purgeInactiveButton.disabled = false;
  }
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */
function formatTimestamp(value) {
  if (!value) return 'never';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'never';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch (_) {
    return 'never';
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* -------------------------------------------------------------------------- */
/* API keys                                                                   */
/* -------------------------------------------------------------------------- */
async function loadApiKeys() {
  if (!apiKeysList) return;
  try {
    apiKeysList.innerHTML = '<p class="hint">Loading keys...</p>';
    const res = await authFetch('/api/api-keys');
    if (!res.ok) throw new Error('Failed to load API keys');
    const data = await res.json();
    apiKeyPager.list = Array.isArray(data.keys) ? data.keys : [];
    apiKeyPager.page = 1;
    renderApiKeys();
    setApiKeyStatus('');
  } catch (error) {
    apiKeysList.innerHTML = '<p class="hint error">Unable to load API keys.</p>';
    setApiKeyStatus('');
    console.warn(error);
  }
}

function renderApiKeys() {
  if (!apiKeysList) return;
  const keys = apiKeyPager.list || [];
  const totalPages = Math.max(1, Math.ceil(keys.length / apiKeyPager.pageSize));
  apiKeyPager.page = Math.min(Math.max(1, apiKeyPager.page), totalPages);
  const start = (apiKeyPager.page - 1) * apiKeyPager.pageSize;
  const visible = keys.slice(start, start + apiKeyPager.pageSize);

  apiKeysList.innerHTML = '';
  if (!visible.length) {
    apiKeysList.innerHTML = '';
  }
  visible.forEach((key) => {
    const row = document.createElement('div');
    row.className = 'api-key-row';
    const meta = document.createElement('div');
    meta.className = 'api-key-meta';
    const scopeLabel = key.scope === 'limited'
      ? `Limited · ${key.allowedCounters?.length || 0} counters`
      : 'Full access';
    const detail = document.createElement('small');
    const allowedText = key.scope === 'limited' && key.allowedCounters?.length
      ? `Allowed: ${key.allowedCounters.join(', ')}`
      : '';
    const timeline = document.createElement('small');
    timeline.textContent = `Created ${formatTimestamp(key.createdAt)} · Last used ${formatTimestamp(key.lastUsedAt)}`;
    meta.innerHTML = `<strong>${escapeHtml(key.name || key.id)}</strong><small>${scopeLabel}</small>`;
    if (allowedText) {
      detail.textContent = allowedText;
      meta.appendChild(detail);
    }
    meta.appendChild(timeline);
    const actions = document.createElement('div');
    actions.className = 'api-key-actions';
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'danger ghost';
    deleteBtn.innerHTML = '<i class="ri-delete-bin-line"></i>';
    deleteBtn.addEventListener('click', () => handleApiKeyDelete(key.id));
    actions.appendChild(deleteBtn);
    row.append(meta, actions);
    apiKeysList.appendChild(row);
  });

  if (keys.length > apiKeyPager.pageSize && apiKeysPagination && apiKeysPrevBtn && apiKeysNextBtn && apiKeysPageInfo) {
    apiKeysPagination.classList.remove('hidden');
    apiKeysPrevBtn.disabled = apiKeyPager.page <= 1;
    apiKeysNextBtn.disabled = apiKeyPager.page >= totalPages;
    apiKeysPageInfo.textContent = `Page ${apiKeyPager.page} / ${totalPages}`;
  } else if (apiKeysPagination) {
    apiKeysPagination.classList.add('hidden');
  }
}

async function handleApiKeyCreate(event) {
  event.preventDefault();
  if (!apiKeyNameInput || !apiKeyScopeSelect) return;
  const name = apiKeyNameInput.value.trim();
  const scope = apiKeyScopeSelect.value === 'limited' ? 'limited' : 'global';
  const previousScope = apiKeyScopeSelect.value;
  let allowed = [];
  if (scope === 'limited' && apiKeyCountersInput) {
    allowed = apiKeyCountersInput.value
      .split(/[\n,]/)
      .map((value) => value.trim())
      .filter(Boolean);
  }
  try {
    setApiKeyStatus('');
    const res = await authFetch('/api/api-keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, scope, counters: allowed })
    });
    assertSession(res);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create key');
    }
    const payload = await res.json();
    setApiKeyStatus('');
    showToast('API key generated');
    if (payload.token) {
      await showAlert(`Copy your new API key now:\n${payload.token}`, { title: 'API key created' });
    }
    apiKeyForm?.reset();
    if (apiKeyScopeSelect) {
      apiKeyScopeSelect.value = previousScope;
    }
    updateApiKeyScopeState();
    loadApiKeys();
  } catch (error) {
    setApiKeyStatus('');
    await showAlert(normalizeAuthMessage(error, 'Failed to create API key'));
  }
}

async function handleApiKeyDelete(id) {
  if (!id) return;
  const confirmed = await modalConfirm({
    title: 'Delete API key?',
    message: 'This key will immediately stop working.',
    confirmLabel: 'Delete key',
    variant: 'danger'
  });
  if (!confirmed) return;
  try {
    const res = await authFetch(`/api/api-keys/${id}`, {
      method: 'DELETE'
    });
    assertSession(res);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to delete API key');
    }
    showToast('API key deleted');
    loadApiKeys();
  } catch (error) {
    await showAlert(normalizeAuthMessage(error, 'Failed to delete API key'));
  }
}

function updateApiKeyScopeState() {
  if (!apiKeyScopeSelect || !apiKeyCountersField) return;
  apiKeyCountersField.classList.toggle('hidden', apiKeyScopeSelect.value !== 'limited');
}

function setApiKeyStatus(message) {
  if (apiKeyStatusLabel) {
    apiKeyStatusLabel.textContent = message || '';
  }
}

function changeApiKeyPage(delta) {
  apiKeyPager.page += delta;
  renderApiKeys();
}

/* -------------------------------------------------------------------------- */
/* Branding                                                                   */
/* -------------------------------------------------------------------------- */
async function handleBrandingSubmit(event) {
  event.preventDefault();
  const payload = {
    brandName:
      (brandNameInputField?.value?.trim() || DEFAULT_BRAND_NAME).slice(0, 80),
    homeTitle:
      (homeTitleInputField?.value?.trim() || DEFAULT_HOME_TITLE).slice(0, 120),
    theme: (themeSelect?.value || 'default').trim()
  };
  if (brandNameInputField) brandNameInputField.value = payload.brandName;
  if (homeTitleInputField) homeTitleInputField.value = payload.homeTitle;
  try {
    setBrandingStatus('');
    const res = await authFetch('/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    assertSession(res);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update branding');
    }
    await res.json().catch(() => ({}));
    setBrandingStatus('');
    applyThemeClass(payload.theme);
    showToast('Branding updated');
    initialBranding = {
      brandName: payload.brandName,
      homeTitle: payload.homeTitle,
      theme: payload.theme
    };
    setBrandingDirty(false);
  } catch (error) {
    setBrandingStatus('');
    await showAlert(normalizeAuthMessage(error, 'Failed to update branding'));
  }
}

function handleThemePreview() {
  if (!themeSelect) return;
  const theme = (themeSelect.value || 'default').trim();
  applyThemeClass(theme);
  checkBrandingDirty();
}

function populateThemeOptions() {
  if (!themeSelect) return;
  const current = themeSelect.value;
  themeSelect.innerHTML = '';
  ALLOWED_THEMES.forEach((key) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = key.charAt(0).toUpperCase() + key.slice(1);
    themeSelect.appendChild(opt);
  });
  if (ALLOWED_THEMES.includes(current)) {
    themeSelect.value = current;
  }
}

function setBrandingStatus(message) {
  if (brandingStatusLabel) {
    brandingStatusLabel.textContent = message || '';
  }
}

function setBrandingDirty(isDirty) {
  setBrandingStatus(isDirty ? 'Unsaved changes' : '');
}

function checkBrandingDirty() {
  const current = {
    brandName: (brandNameInputField?.value || '').trim() || DEFAULT_BRAND_NAME,
    homeTitle: (homeTitleInputField?.value || '').trim() || DEFAULT_HOME_TITLE,
    theme: (themeSelect?.value || 'default').trim()
  };
  const isDirty =
    current.brandName !== initialBranding.brandName ||
    current.homeTitle !== initialBranding.homeTitle ||
    current.theme !== initialBranding.theme;
  setBrandingDirty(isDirty);
}

async function handleBrandingReset() {
  const confirmed = await modalConfirm({
    title: 'Reset branding to defaults?',
    message: 'This will reset branding to the default values and save them immediately.',
    confirmLabel: 'Reset to defaults',
    cancelLabel: 'Cancel',
    variant: 'danger'
  });
  if (!confirmed) return;
  const defaults = {
    brandName: DEFAULT_BRAND_NAME,
    homeTitle: DEFAULT_HOME_TITLE,
    theme: 'default'
  };
  if (brandNameInputField) {
    brandNameInputField.value = defaults.brandName;
  }
  if (homeTitleInputField) {
    homeTitleInputField.value = defaults.homeTitle;
  }
  if (themeSelect) {
    themeSelect.value = defaults.theme;
    applyThemeClass(defaults.theme);
  }
  try {
    setBrandingStatus('');
    const res = await authFetch('/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(defaults)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to reset branding');
    }
    await res.json().catch(() => ({}));
    initialBranding = { ...defaults };
    setBrandingDirty(false);
    showToast('Branding reset to defaults');
  } catch (error) {
    await showAlert(normalizeAuthMessage(error, 'Failed to reset branding'));
  }
}

/* -------------------------------------------------------------------------- */
/* Settings tabs                                                              */
/* -------------------------------------------------------------------------- */
function showSettingsCards() {
  document.querySelectorAll('.settings-card').forEach((card) => {
    card.classList.add('hidden');
  });
  const cards = Array.isArray(arguments[0]) ? arguments[0] : Array.from(document.querySelectorAll('.settings-card'));
  cards.filter(Boolean).forEach((card) => {
    card.classList.remove('hidden');
  });
}

function initSettingsTabs(allowedIds = []) {
  if (!settingsTabs || !settingsTabButtons.length) {
    showSettingsCards();
    return;
  }
  const allowedSet = new Set(allowedIds);
  settingsTabButtons.forEach((button) => {
    const targetId = button.dataset.target;
    const allowed = targetId === 'all' || allowedSet.has(targetId);
    button.classList.toggle('hidden', !allowed);
  });
  const firstVisible = settingsTabButtons.find((button) => !button.classList.contains('hidden'));
  if (firstVisible) {
    activateSettingsTab(firstVisible.dataset.target, allowedIds);
  } else {
    showSettingsCards();
  }
  if (settingsTabsReady) return;
  settingsTabsReady = true;
  settingsTabs.addEventListener('click', (event) => {
    const button = event.target.closest('.settings-tab');
    if (!button || button.classList.contains('hidden')) return;
    const targetId = button.dataset.target;
    if (targetId) {
      activateSettingsTab(targetId, allowedIds);
    }
  });
}

function activateSettingsTab(targetId, allowedIds = []) {
  if (!targetId) return;
  if (targetId === 'all') {
    const cards = allowedIds.map((id) => document.getElementById(id)).filter(Boolean);
    showSettingsCards(cards);
  } else {
    const targetCard = document.getElementById(targetId);
    showSettingsCards([targetCard]);
  }
  settingsTabButtons.forEach((button) => {
    button.classList.toggle('settings-tab--active', button.dataset.target === targetId);
  });
}

/* -------------------------------------------------------------------------- */
/* Hint tooltips                                                              */
/* -------------------------------------------------------------------------- */
// toggle hint tooltips
(function(){
  const icons=document.querySelectorAll('.hint-icon[data-tooltip]');
  icons.forEach((icon)=>{
    icon.addEventListener('click',(e)=>{
      e.preventDefault();
      e.stopPropagation();
      const isOpen=icon.classList.contains('is-open');
      icons.forEach((i)=>i.classList.remove('is-open'));
      if(!isOpen){
        icon.classList.add('is-open');
      }
    });
  });
  document.addEventListener('click',()=>{
    icons.forEach((i)=>i.classList.remove('is-open'));
  });
})();
