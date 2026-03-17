/*
  settings/shared/ui.js

  Settings page modal and toast helpers.
*/

/* -------------------------------------------------------------------------- */
/* Modal + toast bridge                                                       */
/* -------------------------------------------------------------------------- */
function modalApi() {
  return window.VouxModal;
}

/* -------------------------------------------------------------------------- */
/* Fallback toast implementation                                              */
/* -------------------------------------------------------------------------- */
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
    const icon = document.createElement('i');
    icon.className = variant === 'success' ? 'ri-checkbox-circle-line' : 'ri-error-warning-line';
    icon.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.className = 'toast__message';
    text.textContent = String(message ?? '');
    toast.append(icon, text);
    const timer = document.createElement('span');
    timer.className = 'toast__timer';
    toast.appendChild(timer);
    container.appendChild(toast);
    container.classList.add('toast-stack--interactive');
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

/* -------------------------------------------------------------------------- */
/* Alert/confirm wrappers                                                     */
/* -------------------------------------------------------------------------- */
async function showAlert(message, options = {}) {
  if (modalApi()?.alert) {
    await modalApi().alert(message, options);
  } else {
    window.alert(message);
  }
}

/* -------------------------------------------------------------------------- */
/* Auth response helpers                                                      */
/* -------------------------------------------------------------------------- */
function normalizeAuthMessage(error, fallback) {
  if (window.VouxErrors?.normalizeAuthError) {
    return window.VouxErrors.normalizeAuthError(error, fallback);
  }
  return error?.message || fallback;
}

async function assertSession(res) {
  if (res?.status === 401) {
    const error = new Error('unauthorized');
    error.code = 'unauthorized';
    throw error;
  }
  if (res?.status === 403) {
    const payload = await res.clone().json().catch(() => ({}));
    if (payload?.error === 'csrf_blocked') {
      const error = new Error('csrf_blocked');
      error.code = 'csrf_blocked';
      error.error = 'csrf_blocked';
      throw error;
    }
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

export {
  showToast,
  showAlert,
  normalizeAuthMessage,
  assertSession,
  modalConfirm,
  modalConfirmWithInput
};
