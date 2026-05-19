/*
  public/js/profile/shared/ui.js

  Toasts, inline errors, and modal alert helpers for the profile page.
*/

/* -------------------------------------------------------------------------- */
/* Toast container                                                            */
/* -------------------------------------------------------------------------- */
let toastContainer = document.querySelector('.toast-stack');
if (!toastContainer) {
  toastContainer = document.createElement('div');
  toastContainer.className = 'toast-stack';
  document.body.appendChild(toastContainer);
}

/* -------------------------------------------------------------------------- */
/* Modal helper                                                               */
/* -------------------------------------------------------------------------- */
async function showAlert(message, options = {}) {
  if (window.VouxModal?.alert) {
    await window.VouxModal.alert(message, options);
  } else {
    window.alert(message);
  }
}

/* -------------------------------------------------------------------------- */
/* Toasts                                                                     */
/* -------------------------------------------------------------------------- */
function showToast(message, variant = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast--${variant}`;

  const icon = document.createElement('i');
  icon.className = 'icon';
  icon.style.setProperty(
    '--icon',
    variant === 'success'
      ? "url('/assets/icons/ui/checkbox-circle.svg')"
      : "url('/assets/icons/ui/error-warning.svg')"
  );
  icon.setAttribute('aria-hidden', 'true');

  const text = document.createElement('span');
  text.className = 'toast__message';
  text.textContent = String(message ?? '');

  const timer = document.createElement('span');
  timer.className = 'toast__timer';

  toast.append(icon, text, timer);
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
    toastContainer
      .querySelectorAll('.toast')
      .forEach((node) => node._pauseToast?.());
  };

  const resumeAll = () => {
    toastContainer
      .querySelectorAll('.toast')
      .forEach((node) => node._resumeToast?.());
  };

  toast.addEventListener('mouseenter', pauseAll);
  toast.addEventListener('mouseleave', resumeAll);
}

/* -------------------------------------------------------------------------- */
/* Error helpers                                                              */
/* -------------------------------------------------------------------------- */
function normalizeProfileError(error, fallback) {
  const message = error?.error || error?.message || '';
  if (message === 'invalid_avatar') {
    return 'This type of file is not supported.';
  }
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
  if (el._inlineErrorHideTimer) {
    window.clearTimeout(el._inlineErrorHideTimer);
    el._inlineErrorHideTimer = null;
  }
  if (nextHidden) {
    if (!isHidden) {
      el.classList.add('is-hidden');
      el.dataset.errorText = '';
      el._inlineErrorHideTimer = window.setTimeout(() => {
        if (el.classList.contains('is-hidden')) {
          el.textContent = '';
        }
        el._inlineErrorHideTimer = null;
      }, 160);
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

export { showAlert, showToast, normalizeProfileError, setInlineError };
