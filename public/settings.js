const STORAGE_KEY = 'vouxAdminAuth';
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

const settingsPanel = document.getElementById('settingsPanel');
const togglePrivate = document.getElementById('togglePrivateMode');
const toggleGuides = document.getElementById('toggleShowGuides');
const statusLabel = document.getElementById('settingsStatus');

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
    .then((config) => {
      populateForm(config);
      settingsPanel?.classList.remove('hidden');
      setStatus('Changes save instantly.');
      setTogglesDisabled(false);
      togglePrivate?.addEventListener('change', () => handleToggleChange(token, { privateMode: togglePrivate.checked }));
      toggleGuides?.addEventListener('change', () => handleToggleChange(token, { showGuides: toggleGuides.checked }));
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
  return data.config || {};
}

function populateForm(config) {
  if (togglePrivate) togglePrivate.checked = Boolean(config.privateMode);
  if (toggleGuides) toggleGuides.checked = Boolean(config.showGuides);
}

async function handleToggleChange(token, patch) {
  try {
    setStatus('Saving…');
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
    setStatus('Saved');
    resetStatusAfterDelay();
  } catch (error) {
    setStatus('Error saving settings');
    await showAlert(error.message || 'Failed to save settings');
    resetStatusAfterDelay();
  } finally {
    setTogglesDisabled(false);
  }
}

function setStatus(text) {
  if (statusLabel) statusLabel.textContent = text;
}

function resetStatusAfterDelay() {
  clearTimeout(statusTimeout);
  statusTimeout = setTimeout(() => {
    setStatus('Changes save instantly.');
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

async function showAlert(message, options = {}) {
  if (modalApi()?.alert) {
    await modalApi().alert(message, options);
  } else {
    window.alert(message);
  }
}
