/*
  dashboard/shared/ui.js

  Dashboard UI helpers for modals and toasts.
*/

/* -------------------------------------------------------------------------- */
/* Modal bridge + auth errors                                                 */
/* -------------------------------------------------------------------------- */
function modalApi() {
  return window.VouxModal;
}

async function showAlert(message, options) {
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

function buildUnauthorizedError(message = 'unauthorized') {
  const error = new Error(message);
  error.code = 'unauthorized';
  return error;
}

function buildForbiddenError(message = 'forbidden') {
  const error = new Error(message);
  error.code = 'forbidden';
  return error;
}

async function assertAuthorizedResponse(res, onUnauthorized = null) {
  if (res.status === 401) {
    if (typeof onUnauthorized === 'function') {
      onUnauthorized();
    }
    throw buildUnauthorizedError();
  }
  if (res.status === 403) {
    const payload = await res.clone().json().catch(() => ({}));
    if (payload?.error === 'csrf_blocked') {
      const error = new Error('csrf_blocked');
      error.code = 'csrf_blocked';
      error.error = 'csrf_blocked';
      throw error;
    }
    throw buildForbiddenError();
  }
}

/* -------------------------------------------------------------------------- */
/* Confirm helpers                                                            */
/* -------------------------------------------------------------------------- */
async function showConfirm(options) {
  if (modalApi()?.confirm) {
    return modalApi().confirm(options);
  }
  return window.confirm(options?.message || 'Are you sure?');
}

async function showConfirmWithInput(options) {
  if (modalApi()?.confirmWithInput) {
    return modalApi().confirmWithInput(options);
  }
  const entered = window.prompt(options?.promptMessage || 'Type DELETE to confirm');
  return entered && entered.trim() === (options?.inputMatch || 'DELETE');
}

let toastContainer = document.querySelector('.toast-stack');
if (!toastContainer) {
  toastContainer = document.createElement('div');
  toastContainer.className = 'toast-stack';
  document.body.appendChild(toastContainer);
}

/* -------------------------------------------------------------------------- */
/* Toast helpers                                                              */
/* -------------------------------------------------------------------------- */
function showToast(message, variant = 'success') {
  if (!toastContainer) return;
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
/* Action toast                                                               */
/* -------------------------------------------------------------------------- */
function showActionToast(message, actionLabel, onAction) {
  if (!toastContainer) return;
  const toast = document.createElement('div');
  toast.className = 'toast toast--action';
  const icon = document.createElement('i');
  icon.className = 'ri-checkbox-circle-line';
  const text = document.createElement('span');
  text.className = 'toast__message';
  text.textContent = message;
  const actionBtn = document.createElement('button');
  actionBtn.type = 'button';
  actionBtn.className = 'toast__action';
  actionBtn.textContent = actionLabel;
  const actionTimer = document.createElement('span');
  actionTimer.className = 'toast__timer';
  toast.append(icon, text, actionBtn, actionTimer);
  toastContainer.appendChild(toast);
  toastContainer.classList.add('toast-stack--interactive');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('toast--visible'));
  });

  const timeout = setTimeout(() => {
    toast.classList.remove('toast--visible');
    setTimeout(() => toast.remove(), 250);
  }, 5200);

  actionBtn.addEventListener('click', async () => {
    clearTimeout(timeout);
    toast.classList.remove('toast--visible');
    setTimeout(() => toast.remove(), 250);
    try {
      await onAction?.();
    } catch {
      // ignore
    }
  });
}

window.showToast = showToast;

export {
  modalApi,
  showAlert,
  normalizeAuthMessage,
  buildUnauthorizedError,
  buildForbiddenError,
  assertAuthorizedResponse,
  showConfirm,
  showConfirmWithInput,
  showToast,
  showActionToast
};
