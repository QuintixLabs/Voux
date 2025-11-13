const STORAGE_KEY = 'vouxAdminAuth';
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

const settingsPanel = document.getElementById('settingsPanel');
const togglePrivate = document.getElementById('togglePrivateMode');
const toggleGuides = document.getElementById('toggleShowGuides');
const statusLabel = document.getElementById('settingsStatus');
const downloadBackupBtn = document.getElementById('downloadBackup');
const restoreFileInput = document.getElementById('restoreFile');
const backupStatusLabel = document.getElementById('backupStatus');
let backupBusy = false;

let tokenData = loadStoredToken();
let statusTimeout = null;

if (!tokenData) {
  window.location.href = '/admin.html';
} else {
  init(tokenData.token);
}

function init(token) {
  setTogglesDisabled(true);
  fetchSettings(token)
    .then(({ config }) => {
      populateForm(config);
      settingsPanel?.classList.remove('hidden');
      setStatus('');
      setTogglesDisabled(false);
      togglePrivate?.addEventListener('change', () =>
        handleToggleChange(token, { privateMode: togglePrivate.checked }, togglePrivate.checked ? 'Private instance enabled' : 'Private instance disabled')
      );
      toggleGuides?.addEventListener('change', () =>
        handleToggleChange(token, { showGuides: toggleGuides.checked }, toggleGuides.checked ? 'Guide cards shown' : 'Guide cards hidden')
      );
      setupBackupControls(token);
    })
    .catch(() => {
      clearStoredToken();
      window.location.href = '/admin.html';
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
}

function setupBackupControls(token) {
  downloadBackupBtn?.addEventListener('click', () => handleBackupDownload(token));
  restoreFileInput?.addEventListener('change', (event) => handleBackupRestore(token, event));
}
async function handleToggleChange(token, patch, successMessage = 'Updated') {
  try {
    setStatus('');
    setTogglesDisabled(true);
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
    setTogglesDisabled(false);
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

function setTogglesDisabled(disabled) {
  if (togglePrivate) togglePrivate.disabled = disabled;
  if (toggleGuides) toggleGuides.disabled = disabled;
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
    const payload = Array.isArray(parsed?.counters)
      ? parsed.counters
      : Array.isArray(parsed)
      ? parsed
      : null;
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
    const res = await fetch('/api/counters/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-voux-admin': token
      },
      body: JSON.stringify({ counters: payload, replace: true })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to restore backup');
    }
    const result = await res.json();
    const count = result.imported || payload.length;
    setBackupStatus('');
    showToast(`Restored ${count} counters`);
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
