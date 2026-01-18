/*
  modal.js

  Lightweight modal helpers for alert/confirm flows.
*/

(() => {
  /* ------------------------------------------------------------------------ */
  /* Constants + state                                                        */
  /* ------------------------------------------------------------------------ */
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
  let globalKeysInstalled = false;

  /* ------------------------------------------------------------------------ */
  /* Global key handling                                                      */
  /* ------------------------------------------------------------------------ */
  function handleGlobalModalKeys(event) {
    if (event.defaultPrevented) return;
    const activeOverlay = document.querySelector(`.${OVERLAY_CLASS}.${OPEN_CLASS}`);
    if (!activeOverlay) return;
    const allowEscape = activeOverlay.dataset.modalAllowEscape !== 'false';
    const allowEnter = activeOverlay.dataset.modalAllowEnter !== 'false';
    if (event.key === 'Escape' && allowEscape) {
      event.preventDefault();
      if (activeOverlay === overlay) {
        if (dismissible) {
          closeModal(false);
        }
        return;
      }
      const escapeSelector = activeOverlay.dataset.modalEscape;
      const escapeTarget = escapeSelector ? activeOverlay.querySelector(escapeSelector) : null;
      escapeTarget?.click();
      return;
    }
    if (event.key === 'Enter' && allowEnter) {
      if (event.target?.tagName === 'TEXTAREA') return;
      event.preventDefault();
      if (activeOverlay === overlay) {
        const primary = activeOverlay.querySelector('.modal__button--primary');
        if (primary && !primary.disabled) {
          primary.click();
        }
        return;
      }
      const enterSelector = activeOverlay.dataset.modalEnter;
      const enterTarget = enterSelector ? activeOverlay.querySelector(enterSelector) : null;
      if (enterTarget && !enterTarget.disabled) {
        enterTarget.click();
      }
    }
  }

  function ensureGlobalKeys() {
    if (globalKeysInstalled) return;
    document.addEventListener('keydown', handleGlobalModalKeys);
    globalKeysInstalled = true;
  }

  ensureGlobalKeys();

  /* ------------------------------------------------------------------------ */
  /* Element setup                                                            */
  /* ------------------------------------------------------------------------ */
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
  }

  /* ------------------------------------------------------------------------ */
  /* Input helpers                                                            */
  /* ------------------------------------------------------------------------ */
  function clearInput() {
    if (inputWrap) {
      inputWrap.remove();
      inputWrap = null;
      inputEl = null;
    }
  }

  function setModalMessage(message, allowHtml) {
    if (!messageEl) return;
    if (!allowHtml) {
      messageEl.textContent = message || '';
      return;
    }
    const template = document.createElement('template');
    template.innerHTML = message || '';
    const allowed = new Set(['STRONG', 'EM', 'BR']);
    const walker = document.createTreeWalker(
      template.content,
      NodeFilter.SHOW_ELEMENT,
      null
    );
    const toStrip = [];
    while (walker.nextNode()) {
      const el = walker.currentNode;
      if (!allowed.has(el.tagName)) {
        toStrip.push(el);
        continue;
      }
      [...el.attributes].forEach((attr) => el.removeAttribute(attr.name));
    }
    toStrip.forEach((el) => {
      const text = document.createTextNode(el.textContent || '');
      el.replaceWith(text);
    });
    messageEl.textContent = '';
    messageEl.appendChild(template.content);
  }

  /* ------------------------------------------------------------------------ */
  /* Modal open/close                                                         */
  /* ------------------------------------------------------------------------ */
  function openModal({ title, message, buttons, allowClose = true, allowHtml = false, input }) {
    ensureElements();
    dismissible = allowClose;
    ensureGlobalKeys();
    overlay.style.display = 'flex';
    overlay.dataset.modalEnter = '.modal__button--primary';
    overlay.dataset.modalEscape = '.modal__button--ghost';
    overlay.dataset.modalAllowEnter = 'true';
    overlay.dataset.modalAllowEscape = dismissible ? 'true' : 'false';
    titleEl.textContent = title || '';
    setModalMessage(message, false);
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

  /* ------------------------------------------------------------------------ */
  /* Public API                                                               */
  /* ------------------------------------------------------------------------ */
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
