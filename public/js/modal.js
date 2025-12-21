/*
  modal.js

  Lightweight modal helpers for alert/confirm flows.
*/

(() => {
  const OVERLAY_CLASS = 'modal-overlay';
  const OPEN_CLASS = 'modal-overlay--open';
  let overlay;
  let modal;
  let titleEl;
  let messageEl;
  let actionsEl;
  let inputWrap;
  let inputEl;
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

  function clearInput() {
    if (inputWrap) {
      inputWrap.remove();
      inputWrap = null;
      inputEl = null;
    }
  }

  function openModal({ title, message, buttons, allowClose = true, allowHtml = false, input }) {
    ensureElements();
    dismissible = allowClose;
    overlay.style.display = 'flex';
    titleEl.textContent = title || '';
    if (allowHtml) {
      messageEl.innerHTML = message || '';
    } else {
      messageEl.textContent = message || '';
    }
    clearInput();
    actionsEl.innerHTML = '';
    let confirmButton = null;
    buttons.forEach((btn) => {
      const buttonEl = document.createElement('button');
      buttonEl.type = 'button';
      buttonEl.className = `modal__button ${btn.variant ? `modal__button--${btn.variant}` : ''}`.trim();
      buttonEl.textContent = btn.label;
      buttonEl.addEventListener('click', () => {
        closeModal(btn.value);
      });
      if (btn.value === true) {
        confirmButton = buttonEl;
      }
      actionsEl.appendChild(buttonEl);
    });

    if (input) {
      inputWrap = document.createElement('div');
      inputWrap.className = 'modal__input-wrap';
      if (input.label) {
        const labelEl = document.createElement('label');
        labelEl.className = 'modal__input-label';
        labelEl.setAttribute('for', 'vouxModalInput');
        labelEl.textContent = input.label;
        inputWrap.appendChild(labelEl);
      }
      inputEl = document.createElement('input');
      inputEl.id = 'vouxModalInput';
      inputEl.className = 'modal__input';
      inputEl.type = input.type || 'text';
      inputEl.placeholder = input.placeholder || '';
      inputEl.autocomplete = 'off';
      inputEl.spellcheck = false;
      inputWrap.appendChild(inputEl);
      if (input.hint) {
        const hintEl = document.createElement('small');
        hintEl.className = 'modal__input-hint';
        hintEl.textContent = input.hint;
        inputWrap.appendChild(hintEl);
      }
      modal.insertBefore(inputWrap, actionsEl);
      if (confirmButton) {
        confirmButton.disabled = true;
        const required = String(input.match || '');
        const check = () => {
          confirmButton.disabled = inputEl.value.trim() !== required;
        };
        inputEl.addEventListener('input', check);
        inputEl.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' && !confirmButton.disabled) {
            event.preventDefault();
            confirmButton.click();
          }
        });
        check();
      }
    }

    overlay.classList.remove(OPEN_CLASS);
    void overlay.offsetWidth;
    if (openFrame) {
      cancelAnimationFrame(openFrame);
    }
    document.body.classList.add('modal-open');
    openFrame = requestAnimationFrame(() => {
      overlay.classList.add(OPEN_CLASS);
      if (inputEl) {
        inputEl.focus({ preventScroll: true });
      } else {
        modal.focus({ preventScroll: true });
      }
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
      allowHtml: options.allowHtml === true,
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
      allowHtml: options.allowHtml === true,
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
    confirm: showConfirm,
    confirmWithInput(options = {}) {
      return openModal({
        title: options.title || 'Confirm',
        message: options.message || 'Are you sure?',
        allowClose: options.dismissible !== false,
        allowHtml: options.allowHtml === true,
        input: {
          label: options.inputLabel,
          placeholder: options.inputPlaceholder,
          match: options.inputMatch,
          hint: options.inputHint,
          type: options.inputType
        },
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
  };
})();
