(() => {
  const OVERLAY_CLASS = 'modal-overlay';
  const OPEN_CLASS = 'modal-overlay--open';
  let overlay;
  let modal;
  let titleEl;
  let messageEl;
  let actionsEl;
  let dismissible = true;
  let resolver = null;
  let openFrame = null;

  function ensureElements() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = OVERLAY_CLASS;
    overlay.setAttribute('role', 'presentation');

    modal = document.createElement('div');
    modal.className = 'modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.tabIndex = -1;

    titleEl = document.createElement('h2');
    titleEl.className = 'modal__title';
    titleEl.id = 'vouxModalTitle';

    messageEl = document.createElement('p');
    messageEl.className = 'modal__message';
    messageEl.id = 'vouxModalMessage';

    actionsEl = document.createElement('div');
    actionsEl.className = 'modal__actions';

    modal.append(titleEl, messageEl, actionsEl);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (event) => {
      if (!dismissible) return;
      if (event.target === overlay) {
        closeModal(false);
      }
    });

    document.addEventListener('keydown', (event) => {
      if (!overlay.classList.contains(OPEN_CLASS)) return;
      if (event.key === 'Escape' && dismissible) {
        event.preventDefault();
        closeModal(false);
      }
    });
  }

  function openModal({ title, message, buttons, allowClose = true }) {
    ensureElements();
    dismissible = allowClose;
    titleEl.textContent = title || '';
    messageEl.textContent = message || '';
    actionsEl.innerHTML = '';
    buttons.forEach((btn) => {
      const buttonEl = document.createElement('button');
      buttonEl.type = 'button';
      buttonEl.className = `modal__button ${btn.variant ? `modal__button--${btn.variant}` : ''}`.trim();
      buttonEl.textContent = btn.label;
      buttonEl.addEventListener('click', () => {
        closeModal(btn.value);
      });
      actionsEl.appendChild(buttonEl);
    });

    overlay.classList.remove(OPEN_CLASS);
    void overlay.offsetWidth;
    if (openFrame) {
      cancelAnimationFrame(openFrame);
    }
    document.body.classList.add('modal-open');
    openFrame = requestAnimationFrame(() => {
      overlay.classList.add(OPEN_CLASS);
      modal.focus({ preventScroll: true });
    });

    return new Promise((resolve) => {
      resolver = resolve;
    });
  }

  function closeModal(result) {
    if (!overlay) return;
    if (openFrame) {
      cancelAnimationFrame(openFrame);
      openFrame = null;
    }
    overlay.classList.remove(OPEN_CLASS);
    document.body.classList.remove('modal-open');
    if (resolver) {
      resolver(result);
      resolver = null;
    }
  }

  async function showAlert(message, options = {}) {
    return openModal({
      title: options.title || 'Heads up',
      message,
      allowClose: options.dismissible !== false,
      buttons: [
        {
          label: options.confirmLabel || 'OK',
          variant: 'primary',
          value: true
        }
      ]
    });
  }

  async function showConfirm(options = {}) {
    const message = options.message || 'Are you sure?';
    return openModal({
      title: options.title || 'Confirm',
      message,
      allowClose: options.dismissible !== false,
      buttons: [
        {
          label: options.confirmLabel || 'Continue',
          variant: options.variant || 'primary',
          value: true
        },
        {
          label: options.cancelLabel || 'Cancel',
          variant: 'ghost',
          value: false
        }
      ]
    });
  }

  window.VouxModal = {
    alert: showAlert,
    confirm: showConfirm
  };
})();
