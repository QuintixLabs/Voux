/*
  public/js/setup/index.js

  First-run setup flow for creating the initial admin account.
*/

/* -------------------------------------------------------------------------- */
/* Setup form elements                                                        */
/* -------------------------------------------------------------------------- */
const form = document.getElementById('setupForm');
const usernameInput = document.getElementById('setupUsername');
const displayNameInput = document.getElementById('setupDisplayName');
const passwordInput = document.getElementById('setupPassword');
const confirmPasswordInput = document.getElementById('setupConfirmPassword');
const rememberDeviceInput = document.getElementById('setupRememberDevice');
const submitButton = document.getElementById('setupSubmit');
const errorEl = document.getElementById('setupError');
const setupBlockedCard = document.getElementById('setupBlockedCard');

// Local state
let clearErrorTimer = null;

/* -------------------------------------------------------------------------- */
/* Setup UI state                                                             */
/* -------------------------------------------------------------------------- */
function setSetupEnabled(enabled) {
  [
    usernameInput,
    displayNameInput,
    passwordInput,
    confirmPasswordInput
  ].forEach((input) => {
    if (input) input.disabled = !enabled;
  });
  if (rememberDeviceInput) rememberDeviceInput.disabled = !enabled;
  if (submitButton) submitButton.disabled = !enabled;
  if (form) form.classList.toggle('hidden', !enabled);
  if (setupBlockedCard) setupBlockedCard.classList.toggle('hidden', enabled);
  document.body.classList.remove('setup-pending');
}

function setPending(pending) {
  if (submitButton) {
    submitButton.disabled = pending;
    submitButton.textContent = pending
      ? 'Creating account...'
      : 'Create owner account';
  }
}

/* -------------------------------------------------------------------------- */
/* Inline errors                                                              */
/* -------------------------------------------------------------------------- */
function showError(message) {
  if (!errorEl) return;
  if (clearErrorTimer) {
    clearTimeout(clearErrorTimer);
    clearErrorTimer = null;
  }
  errorEl.textContent = message;
  errorEl.classList.remove('is-hidden');
}

function clearError() {
  if (!errorEl) return;
  if (!errorEl.classList.contains('is-hidden')) {
    errorEl.classList.add('is-hidden');
    if (clearErrorTimer) {
      clearTimeout(clearErrorTimer);
    }
    clearErrorTimer = window.setTimeout(() => {
      errorEl.textContent = '';
      clearErrorTimer = null;
    }, 160);
  }
}

function normalizeSetupError(code) {
  switch (code) {
    case 'username_required':
      return 'Enter a username.';
    case 'password_required':
      return 'Enter a password.';
    case 'username_password_required':
      return 'Enter a username and password.';
    case 'password_too_short':
      return 'Password must be at least 6 characters.';
    case 'username_exists':
      return 'That username already exists.';
    case 'setup_unavailable':
      return 'Setup is already finished for this instance.';
    case 'setup_local_only':
      return 'First-run setup is only available from localhost, 127.0.0.1, or ::1. Either create the first account locally, or use ADMIN_USERNAME and ADMIN_PASSWORD.';
    case 'csrf_blocked':
      return 'Request blocked (CSRF). Open this instance from its configured URL and try again.';
    default:
      return 'Failed to create the first admin account.';
  }
}

/* -------------------------------------------------------------------------- */
/* Setup status                                                               */
/* -------------------------------------------------------------------------- */
async function ensureSetupStillOpen() {
  const res = await fetch('/api/setup/status', { credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.setupRequired !== true) {
    window.location.href = '/dashboard';
    return false;
  }
  if (data?.setupAllowed === false) {
    setSetupEnabled(false);
    return false;
  }
  setSetupEnabled(true);
  return true;
}

/* -------------------------------------------------------------------------- */
/* Setup submit flow                                                          */
/* -------------------------------------------------------------------------- */
async function handleSubmit(event) {
  event.preventDefault();
  clearError();

  const username = String(usernameInput?.value || '').trim();
  const displayName = String(displayNameInput?.value || '').trim();
  const password = String(passwordInput?.value || '');
  const confirmPassword = String(confirmPasswordInput?.value || '');
  const rememberDevice = rememberDeviceInput?.checked === true;

  if (!username && !password) {
    showError('Enter a username and password.');
    return;
  }
  if (!username) {
    showError('Enter a username.');
    return;
  }
  if (!password) {
    showError('Enter a password.');
    return;
  }
  if (password.length < 6) {
    showError('Password must be at least 6 characters.');
    return;
  }
  if (password !== confirmPassword) {
    showError('Passwords do not match.');
    return;
  }

  setPending(true);

  try {
    const res = await fetch('/api/setup/first-user', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        displayName,
        password,
        rememberDevice
      })
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      if (payload?.error === 'setup_unavailable') {
        window.location.href = '/';
        return;
      }
      throw new Error(normalizeSetupError(payload?.error));
    }

    const payload = await res.json().catch(() => ({}));
    if (payload?.user) {
      try {
        localStorage.setItem('voux_session_hint', '1');
      } catch {}
      if (window.VouxErrors?.cacheNavUser) {
        window.VouxErrors.cacheNavUser(payload.user);
      }
      if (window.VouxState?.setSession) {
        window.VouxState.setSession({
          user: payload.user,
          adminPermissions: payload.adminPermissions || null
        });
      }
    }
    window.location.href = '/';
  } catch (error) {
    showError(error?.message || 'Failed to create the first admin account.');
  } finally {
    setPending(false);
  }
}

// Event binding
form?.addEventListener('submit', handleSubmit);
[usernameInput, displayNameInput, passwordInput, confirmPasswordInput].forEach(
  (input) => {
    input?.addEventListener('input', clearError);
  }
);

// Init
ensureSetupStillOpen();
