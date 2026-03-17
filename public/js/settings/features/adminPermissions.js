/*
  settings/features/adminPermissions.js

  Owner/admin permissions UI and modal flows.
*/

/* -------------------------------------------------------------------------- */
/* Permissions manager                                                        */
/* -------------------------------------------------------------------------- */
function createAdminPermissionsManager(deps) {
  const {
    adminDefaultsOpen,
    adminPermModal,
    adminPermTitle,
    adminPermMessage,
    adminPermGrid,
    adminPermSave,
    adminPermCancel,
    adminPermReset,
    purgeInactiveButton,
    ADMIN_PERMISSION_ITEMS,
    authFetch,
    showToast,
    showAlert,
    normalizeAuthMessage,
    initSettingsTabs,
    getActiveUser,
    onUsersChanged,
    fetchSettings
  } = deps;

  let adminPermissionsDefaults = null;
  let adminPermissionsOverrides = null;
  let adminPermMode = null;
  let adminDefaultsSaving = false;
  let adminDefaultsPending = false;
  let activeAdminPermUser = null;
  let listenersBound = false;

/* -------------------------------------------------------------------------- */
/* Permissions UI visibility                                                  */
/* -------------------------------------------------------------------------- */
function getAllowedSettingsCards(perms) {
    if (!perms) {
      return ['settingsPanel', 'brandingCard', 'backupCard', 'apiKeysCard', 'usersCard'];
    }
    const allowed = [];
    if (perms.runtime) allowed.push('settingsPanel');
    if (perms.branding) allowed.push('brandingCard');
    allowed.push('backupCard');
    if (perms.apiKeys) allowed.push('apiKeysCard');
    if (perms.users) allowed.push('usersCard');
    return allowed;
  }

  function applyAdminPermissionsUI(perms, isOwner) {
    if (adminDefaultsOpen) {
      adminDefaultsOpen.classList.toggle('hidden', !isOwner);
    }
    const allowedIds = isOwner ? getAllowedSettingsCards(null) : getAllowedSettingsCards(perms);
    initSettingsTabs(allowedIds);
    if (purgeInactiveButton) {
      const canDanger = isOwner || (perms && perms.danger);
      purgeInactiveButton.disabled = !canDanger;
      purgeInactiveButton.classList.toggle('disabled', !canDanger);
    }
  }

  function renderPermissionsGrid(container, values, onToggle) {
    if (!container) return;
    container.innerHTML = '';
    ADMIN_PERMISSION_ITEMS.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'admin-permission';
      const labelWrap = document.createElement('div');
      labelWrap.className = 'admin-permission__label';
      const label = document.createElement('span');
      label.textContent = item.label;
      const hint = document.createElement('small');
      hint.textContent = item.hint;
      labelWrap.append(label, hint);
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'admin-toggle';
      toggle.dataset.perm = item.key;
      toggle.setAttribute('aria-pressed', values[item.key] ? 'true' : 'false');
      toggle.innerHTML = '<span class="admin-toggle__track"><span class="admin-toggle__thumb"></span></span>';
      toggle.addEventListener('click', () => {
        const next = toggle.getAttribute('aria-pressed') !== 'true';
        toggle.setAttribute('aria-pressed', next ? 'true' : 'false');
        values[item.key] = next;
        if (onToggle) onToggle(item.key, next);
      });
      row.append(labelWrap, toggle);
      container.appendChild(row);
    });
  }

/* -------------------------------------------------------------------------- */
/* Permissions API                                                            */
/* -------------------------------------------------------------------------- */
async function loadAdminPermissions() {
    if (!getActiveUser()?.isOwner) return;
    try {
      const res = await authFetch('/api/admin-permissions');
      if (!res.ok) throw new Error('Unable to load permissions');
      const data = await res.json();
      adminPermissionsDefaults = data.defaults || {};
      adminPermissionsOverrides = data.overrides || {};
    } catch (error) {
      console.warn(error);
    }
  }

  async function saveAdminDefaults(values) {
    if (!adminPermissionsDefaults) return;
    if (values && typeof values === 'object') {
      adminPermissionsDefaults = { ...adminPermissionsDefaults, ...values };
    }
    if (adminDefaultsSaving) {
      adminDefaultsPending = true;
      return;
    }
    adminDefaultsSaving = true;
    const res = await authFetch('/api/admin-permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaults: adminPermissionsDefaults })
    });
    if (!res.ok) {
      adminDefaultsSaving = false;
      if (adminDefaultsPending) {
        adminDefaultsPending = false;
        saveAdminDefaults();
      }
      await showAlert(normalizeAuthMessage(null, 'Failed to update admin permissions.'));
      return;
    }
    await res.json().catch(() => ({}));
    adminDefaultsSaving = false;
    if (adminDefaultsPending) {
      adminDefaultsPending = false;
      saveAdminDefaults();
      return;
    }
    showToast('Admin permissions updated.');
  }

/* -------------------------------------------------------------------------- */
/* Permissions modals                                                         */
/* -------------------------------------------------------------------------- */
async function openAdminDefaults() {
    if (!adminPermModal || !adminPermGrid || !getActiveUser()?.isOwner) return;
    if (!adminPermissionsDefaults) {
      await loadAdminPermissions();
    }
    adminPermMode = 'defaults';
    activeAdminPermUser = null;
    if (adminPermTitle) adminPermTitle.textContent = 'Admin defaults';
    if (adminPermMessage) adminPermMessage.textContent = 'Default permissions for all admins.';
    if (adminPermReset) adminPermReset.classList.add('hidden');
    const defaults = adminPermissionsDefaults || {};
    renderPermissionsGrid(adminPermGrid, { ...defaults });
    adminPermModal.classList.add('modal-overlay--open');
    adminPermModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }

  function openAdminPermissions(user) {
    if (!adminPermModal || !adminPermGrid) return;
    adminPermMode = 'user';
    activeAdminPermUser = user;
    const label = user.displayName ? `${user.displayName} (${user.username})` : user.username;
    if (adminPermTitle) adminPermTitle.textContent = 'Admin permissions';
    if (adminPermMessage) adminPermMessage.textContent = `Permissions for ${label}.`;
    if (adminPermReset) adminPermReset.classList.remove('hidden');
    const defaults = adminPermissionsDefaults || {};
    const override = (adminPermissionsOverrides && adminPermissionsOverrides[user.id]) || null;
    const current = { ...defaults, ...(override || {}) };
    renderPermissionsGrid(adminPermGrid, current);
    adminPermModal.classList.add('modal-overlay--open');
    adminPermModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }

  function closeAdminPermissions() {
    if (!adminPermModal) return;
    adminPermModal.classList.remove('modal-overlay--open');
    adminPermModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    adminPermMode = null;
    activeAdminPermUser = null;
  }

/* -------------------------------------------------------------------------- */
/* Save/reset handlers                                                        */
/* -------------------------------------------------------------------------- */
async function handleReset() {
    if (!activeAdminPermUser) return;
    const res = await authFetch(`/api/admin-permissions/${activeAdminPermUser.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ override: {} })
    });
    if (!res.ok) {
      await showAlert(normalizeAuthMessage(null, 'Failed to reset permissions.'));
      return;
    }
    adminPermissionsOverrides = (await res.json()).overrides || {};
    try {
      const data = await fetchSettings();
      if (data?.adminPermissions?.defaults) {
        adminPermissionsDefaults = data.adminPermissions.defaults;
      }
    } catch {
      // ignore: keep current defaults if refresh fails
    }
    const label = activeAdminPermUser.displayName || activeAdminPermUser.username || 'user';
    closeAdminPermissions();
    onUsersChanged?.();
    showToast(`Permissions reset for ${label}`);
  }

  async function handleSave() {
    if (!adminPermGrid) return;
    const values = {};
    adminPermGrid.querySelectorAll('.admin-permission').forEach((row) => {
      const toggle = row.querySelector('.admin-toggle');
      const key = toggle?.dataset?.perm;
      if (toggle && key) {
        values[key] = toggle.getAttribute('aria-pressed') === 'true';
      }
    });
    if (adminPermMode === 'defaults') {
      await saveAdminDefaults(values);
      closeAdminPermissions();
      return;
    }
    if (!activeAdminPermUser) return;
    const res = await authFetch(`/api/admin-permissions/${activeAdminPermUser.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ override: values })
    });
    if (!res.ok) {
      await showAlert(normalizeAuthMessage(null, 'Failed to update permissions.'));
      return;
    }
    adminPermissionsOverrides = (await res.json()).overrides || {};
    closeAdminPermissions();
    onUsersChanged?.();
    showToast('Permissions updated.');
  }

/* -------------------------------------------------------------------------- */
/* Event wiring                                                               */
/* -------------------------------------------------------------------------- */
function setup() {
    if (listenersBound) return;
    listenersBound = true;
    adminDefaultsOpen?.addEventListener('click', () => {
      openAdminDefaults();
    });
    adminPermCancel?.addEventListener('click', closeAdminPermissions);
    adminPermModal?.addEventListener('click', (event) => {
      if (event.target === adminPermModal) closeAdminPermissions();
    });
    adminPermReset?.addEventListener('click', () => {
      handleReset();
    });
    adminPermSave?.addEventListener('click', () => {
      handleSave();
    });
  }

  return {
    setup,
    applyAdminPermissionsUI,
    loadAdminPermissions,
    openAdminPermissions
  };
}

export {
  createAdminPermissionsManager
};
