const STORAGE_KEY = 'vouxAdminAuth';
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

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
const brandingStatusLabel = document.getElementById('brandingStatus');
const throttleSelect = document.getElementById('throttleSelect');
const purgeInactiveButton = document.getElementById('purgeInactiveButton');
const apiKeysPagination = document.getElementById('apiKeysPagination');
const apiKeysPrevBtn = document.getElementById('apiKeysPrev');
const apiKeysNextBtn = document.getElementById('apiKeysNext');
const apiKeysPageInfo = document.getElementById('apiKeysPageInfo');
const DEFAULT_BRAND_NAME = 'Voux';
const DEFAULT_HOME_TITLE = 'Voux · Simple Free & Open Source Hit Counter for Blogs and Websites';
const DEFAULT_THROTTLE_SECONDS = 0;
let backupBusy = false;
let activeAdminToken = null;
const apiKeyPager = {
  list: [],
  page: 1,
  pageSize: 3
};

let tokenData = loadStoredToken();
let statusTimeout = null;

if (!tokenData) {
  window.location.href = '/admin';
} else {
  init(tokenData.token);
}

function init(token) {
  activeAdminToken = token;
  fetchSettings(token)
    .then(({ config }) => {
      populateForm(config);
      showSettingsCards();
      setStatus('');
      togglePrivate?.addEventListener('change', () =>
        handleToggleChange(token, { privateMode: togglePrivate.checked }, togglePrivate.checked ? 'Private instance enabled' : 'Private instance disabled', togglePrivate)
      );
      toggleGuides?.addEventListener('change', () =>
        handleToggleChange(token, { showGuides: toggleGuides.checked }, toggleGuides.checked ? 'Guide cards shown' : 'Guide cards hidden', toggleGuides)
      );
      allowModeUniqueInput?.addEventListener('change', (event) => handleAllowedModesChange(token, event.target));
      allowModeUnlimitedInput?.addEventListener('change', (event) => handleAllowedModesChange(token, event.target));
      setupBackupControls(token);
      setupApiKeys(token);
      setupBrandingForm(token);
      throttleSelect?.addEventListener('change', () => handleThrottleChange(token));
      purgeInactiveButton?.addEventListener('click', () => handlePurgeInactive(token));
    })
    .catch(() => {
      clearStoredToken();
      window.location.href = '/admin';
    });
}

async function fetchSettings(token) {
  const res = await fetch('/api/settings', {
    headers: { 'x-voux-admin': token }
  });
  if (!res.ok) throw new Error('Unauthorized');
  const data = await res.json();
  return {
    config: data.config || {}
  };
}

function populateForm(config) {
  if (togglePrivate) togglePrivate.checked = Boolean(config.privateMode);
  if (toggleGuides) toggleGuides.checked = Boolean(config.showGuides);
  if (allowModeUniqueInput) allowModeUniqueInput.checked = config.allowedModes ? config.allowedModes.unique !== false : true;
  if (allowModeUnlimitedInput) allowModeUnlimitedInput.checked = config.allowedModes ? config.allowedModes.unlimited !== false : true;
  if (brandNameInputField) brandNameInputField.value = config.brandName || DEFAULT_BRAND_NAME;
  if (homeTitleInputField) {
    homeTitleInputField.value = config.homeTitle || DEFAULT_HOME_TITLE;
  }
  if (throttleSelect) {
    const value = Number(config.unlimitedThrottleSeconds);
    const safe = Number.isFinite(value) ? String(value) : '0';
    const validValues = Array.from(throttleSelect.options).map((opt) => opt.value);
    throttleSelect.value = validValues.includes(safe) ? safe : '0';
  }
}

function setupBackupControls(token) {
  downloadBackupBtn?.addEventListener('click', () => handleBackupDownload(token));
  restoreFileInput?.addEventListener('change', (event) => handleBackupRestore(token, event));
}

function setupApiKeys(token) {
  if (!apiKeysCard) return;
  loadApiKeys(token);
  apiKeyForm?.addEventListener('submit', (event) => handleApiKeyCreate(token, event));
  apiKeyScopeSelect?.addEventListener('change', updateApiKeyScopeState);
  apiKeysPrevBtn?.addEventListener('click', () => changeApiKeyPage(-1));
  apiKeysNextBtn?.addEventListener('click', () => changeApiKeyPage(1));
  updateApiKeyScopeState();
}

function setupBrandingForm(token) {
  if (!brandingForm) return;
  brandingForm.addEventListener('submit', (event) => handleBrandingSubmit(token, event));
}
async function handleToggleChange(token, patch, successMessage = 'Updated', control) {
  try {
    setStatus('');
    if (control) control.disabled = true;
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-voux-admin': token
      },
      body: JSON.stringify(patch)
    });
    if (!res.ok) throw new Error('Failed to save');
    await res.json().catch(() => ({}));
    setStatus('');
    showToast(successMessage);
  } catch (error) {
    setStatus('Error saving settings');
    await showAlert(error.message || 'Failed to save settings');
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

function handleAllowedModesChange(token, sourceInput) {
  const allowed = {
    unique: allowModeUniqueInput?.checked !== false,
    unlimited: allowModeUnlimitedInput?.checked !== false
  };
  if (!allowed.unique && !allowed.unlimited) {
    if (sourceInput) sourceInput.checked = true;
    showToast('Keep at least one mode enabled.', 'danger');
    return;
  }
  handleToggleChange(token, { allowedModes: allowed }, 'Allowed modes updated', sourceInput);
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
    console.warn('Failed to read stored token', error);
    return null;
  }
}

function clearStoredToken() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (_) {}
}

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
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add('toast--visible'));
    });
    setTimeout(() => {
      toast.classList.remove('toast--visible');
      setTimeout(() => toast.remove(), 250);
    }, 2200);
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

function modalConfirm(options) {
  if (modalApi()?.confirm) {
    return modalApi().confirm(options);
  }
  const message = options?.message || 'Are you sure?';
  return Promise.resolve(window.confirm(message));
}

async function handleBackupDownload(token) {
  if (backupBusy) {
    showToast('Finish the current backup task first', 'danger');
    return;
  }
  try {
    backupBusy = true;
    if (downloadBackupBtn) downloadBackupBtn.disabled = true;
    setBackupStatus('');
    const res = await fetch('/api/counters/export', {
      headers: { 'x-voux-admin': token }
    });
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
    showToast('Backup download failed', 'danger');
    await showAlert(error.message || 'Failed to download backup');
  } finally {
    backupBusy = false;
    if (downloadBackupBtn) downloadBackupBtn.disabled = false;
  }
}

async function handleBackupRestore(token, event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (backupBusy) {
    showToast('Finish the current backup task first', 'danger');
    event.target.value = '';
    return;
  }
  try {
    setBackupStatus('Reading backup…');
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
      title: 'Replace counters?',
      message: 'Restoring a backup replaces every existing counter. Continue?',
      confirmLabel: 'Replace counters',
      variant: 'danger'
    });
    if (!confirmed) {
      event.target.value = '';
      setBackupStatus('');
      showToast('Restore canceled', 'danger');
      return;
    }
    setBackupStatus('Uploading backup…');
    backupBusy = true;
    if (downloadBackupBtn) downloadBackupBtn.disabled = true;
    if (restoreFileInput) restoreFileInput.disabled = true;
    const body = { counters: payload, replace: true };
    if (dailyPayload.length) {
      body.daily = dailyPayload;
    }
    const res = await fetch('/api/counters/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-voux-admin': token
      },
      body: JSON.stringify(body)
    });
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
    showToast('Restore failed', 'danger');
    await showAlert(error.message || 'Failed to restore backup');
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

async function handleThrottleChange(token) {
  if (!token || !throttleSelect) return;
  const value = Math.max(0, Number(throttleSelect.value) || DEFAULT_THROTTLE_SECONDS);
  try {
    setStatus('Saving throttle…');
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-voux-admin': token
      },
      body: JSON.stringify({ unlimitedThrottleSeconds: value })
    });
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
    await showAlert(error.message || 'Failed to update throttle');
  }
}

async function handlePurgeInactive(token) {
  if (!token || !purgeInactiveButton) {
    await showAlert('Log in again to manage counters.');
    return;
  }
  const confirmed = await modalConfirm({
    title: 'Delete inactive counters?',
    message: 'Counters without hits for 14 days will be permanently removed. This cannot be undone.',
    confirmLabel: 'Delete inactive',
    variant: 'danger'
  });
  if (!confirmed) return;
  purgeInactiveButton.disabled = true;
  try {
    const res = await fetch('/api/counters/purge-inactive', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-voux-admin': token
      },
      body: JSON.stringify({ days: 14 })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to delete inactive counters');
    }
    const payload = await res.json().catch(() => ({}));
    const removed = payload.removed || 0;
    showToast(`Deleted ${removed} inactive ${removed === 1 ? 'counter' : 'counters'}`);
  } catch (error) {
    await showAlert(error.message || 'Failed to delete inactive counters');
  } finally {
    purgeInactiveButton.disabled = false;
  }
}

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

async function loadApiKeys(token) {
  if (!apiKeysList) return;
  try {
    apiKeysList.innerHTML = '<p class="hint">Loading keys…</p>';
    const res = await fetch('/api/api-keys', {
      headers: { 'x-voux-admin': token }
    });
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

async function handleApiKeyCreate(token, event) {
  event.preventDefault();
  if (!apiKeyNameInput || !apiKeyScopeSelect) return;
  const name = apiKeyNameInput.value.trim();
  const scope = apiKeyScopeSelect.value === 'limited' ? 'limited' : 'global';
  let allowed = [];
  if (scope === 'limited' && apiKeyCountersInput) {
    allowed = apiKeyCountersInput.value
      .split(/[\n,]/)
      .map((value) => value.trim())
      .filter(Boolean);
  }
  try {
    setApiKeyStatus('Creating key…');
    const res = await fetch('/api/api-keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-voux-admin': token
      },
      body: JSON.stringify({ name, scope, counters: allowed })
    });
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
    updateApiKeyScopeState();
    loadApiKeys(token);
  } catch (error) {
    setApiKeyStatus('');
    await showAlert(error.message || 'Failed to create API key');
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
  const token = activeAdminToken;
  if (!token) {
    await showAlert('Log in again to manage API keys.');
    return;
  }
  try {
    const res = await fetch(`/api/api-keys/${id}`, {
      method: 'DELETE',
      headers: { 'x-voux-admin': token }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to delete API key');
    }
    showToast('API key deleted');
    loadApiKeys(token);
  } catch (error) {
    await showAlert(error.message || 'Failed to delete API key');
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

async function handleBrandingSubmit(token, event) {
  event.preventDefault();
  if (!token) {
    await showAlert('Log in again to update branding.');
    return;
  }
  const payload = {
    brandName:
      (brandNameInputField?.value?.trim() || DEFAULT_BRAND_NAME).slice(0, 80),
    homeTitle:
      (homeTitleInputField?.value?.trim() || DEFAULT_HOME_TITLE).slice(0, 120)
  };
  if (brandNameInputField) brandNameInputField.value = payload.brandName;
  if (homeTitleInputField) homeTitleInputField.value = payload.homeTitle;
  try {
    setBrandingStatus('Saving branding…');
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-voux-admin': token
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update branding');
    }
    await res.json().catch(() => ({}));
    setBrandingStatus('');
    showToast('Branding updated');
  } catch (error) {
    setBrandingStatus('');
    await showAlert(error.message || 'Failed to update branding');
  }
}

function setBrandingStatus(message) {
  if (brandingStatusLabel) {
    brandingStatusLabel.textContent = message || '';
  }
}
function showSettingsCards() {
  document.querySelectorAll('.settings-card').forEach((card) => {
    card.classList.remove('hidden');
  });
}
