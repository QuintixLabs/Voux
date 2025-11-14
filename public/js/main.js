const form = document.querySelector('#create-form');
const resultSection = document.querySelector('#result');
const snippetArea = document.querySelector('#embedSnippet');
const previewTarget = document.querySelector('#previewTarget');
const builderSection = document.querySelector('#builderSection');
const privateDashboardCard = document.querySelector('#privateDashboardCard');
const stylingCard = document.querySelector('#stylingCard');
const selfHostCard = document.querySelector('#selfHostCard');
const noticeCard = document.querySelector('#noticeCard');
const cooldownSelect = document.querySelector('#cooldownSelect');
let isPrivateMode = false;
let showGuides = true;
let defaultMode = 'unique';
let allowedModes = { unique: true, unlimited: true };

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


if (form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isPrivateMode) {
      await showAlert('Private instance is enabled. Create counters from the dashboard.', {
        title: 'Private instance'
      });
      return;
    }

    const formData = new FormData(form);
    const payload = {
      label: (formData.get('label') || '').toString(),
      startValue: Number(formData.get('startValue') || 0)
    };
    try {
      payload.mode = getSelectedCooldown(cooldownSelect);
    } catch (error) {
      await showAlert(error.message || 'Invalid counting mode', {
        title: 'Invalid mode'
      });
      return;
    }

    try {
      setFormState(true);
      const response = await fetch('/api/counters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const message = buildCreateCounterErrorMessage(error, response.status);
        const err = new Error(message);
        err.code = error && error.error;
        throw err;
      }

      const data = await response.json();
      snippetArea.value = data.embedCode;
      resultSection.classList.remove('hidden');
      renderPreview(data.embedUrl);
    } catch (error) {
      await showAlert(error.message || 'Something went wrong', {
        title: 'Error'
      });
    } finally {
      setFormState(false);
    }
  });
}

function renderPreview(embedUrl) {
  previewTarget.innerHTML = '';
  const wrapper = document.createElement('span');
  wrapper.className = 'counter-widget counter-widget--preview';
  const script = document.createElement('script');
  script.async = true;
  script.src = appendPreviewParam(embedUrl);
  wrapper.appendChild(script);
  previewTarget.appendChild(wrapper);
}

function setFormState(disabled) {
  if (!form) return;
  Array.from(form.elements).forEach((el) => {
    el.disabled = disabled && el.type !== 'submit';
  });
}

// main.js
document.querySelectorAll('.copy-button').forEach((button) => {
  button.addEventListener('click', () => {
    const block = button.closest('.code-snippet') || button.parentElement;
    const code = block?.querySelector('code');
    if (!code) return;
    const text = code.textContent;

    navigator.clipboard.writeText(text).then(() => {
      const originalHTML = button.innerHTML;
      button.innerHTML = '<i class="ri-check-line"></i>Copied!';
      button.disabled = true;

      setTimeout(() => {
        button.innerHTML = originalHTML;
        button.disabled = false;
      }, 2000);
    });
  });
});


initConfig();

async function initConfig() {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    isPrivateMode = Boolean(data.privateMode);
    showGuides = data.showGuides !== undefined ? Boolean(data.showGuides) : true;
    allowedModes = normalizeAllowedModes(data.allowedModes);
    defaultMode = data.defaultMode === 'unlimited' && allowedModes.unlimited !== false ? 'unlimited' : 'unique';
    if (cooldownSelect) {
      applyAllowedModesToSelect(cooldownSelect);
      cooldownSelect.value = defaultMode;
    }

    if (isPrivateMode) {
      form?.classList.add('hidden');
      builderSection?.classList.add('hidden');
      privateDashboardCard?.classList.remove('hidden');
    } else {
      form?.classList.remove('hidden');
      builderSection?.classList.remove('hidden');
      privateDashboardCard?.classList.add('hidden');
    }

    toggleGuideCards();
  } catch (error) {
    console.warn('Failed to load config', error);
  } finally {
    document.body?.classList.remove('config-pending');
  }
}

function toggleGuideCards() {
  const shouldShow = showGuides;
  [stylingCard, selfHostCard].forEach((card) => {
    if (!card) return;
    card.classList.toggle('hidden', !shouldShow);
  });
}

function getSelectedCooldown(selectEl) {
  if (!selectEl) {
    return 'unique';
  }
  const value = selectEl.value;
  if (value === 'unlimited' && allowedModes.unlimited !== false) {
    return 'unlimited';
  }
  return 'unique';
}

function buildCreateCounterErrorMessage(error, status) {
  if (error && typeof error.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }
  if (error && error.error === 'rate_limited') {
    const wait = typeof error.retryAfterSeconds === 'number' ? error.retryAfterSeconds : null;
    if (wait) {
      const pretty = wait === 1 ? '1 second' : `${wait} seconds`;
      return `Too many new counters at once. Try again in ${pretty}.`;
    }
    return 'Too many new counters right now. Try again in a moment.';
  }
  if (error && typeof error.error === 'string') {
    return error.error;
  }
  if (status === 413) {
    return 'Payload too large.';
  }
  return 'Failed to create counter. Please try again.';
}

function appendPreviewParam(url) {
  try {
    const parsed = new URL(url, window.location.origin);
    parsed.searchParams.set('preview', '1');
    return parsed.toString();
  } catch (_) {
    return url.includes('?') ? `${url}&preview=1` : `${url}?preview=1`;
  }
}

function applyAllowedModesToSelect(selectEl) {
  if (!selectEl) return;
  const options = Array.from(selectEl.options);
  let firstAllowed = null;
  options.forEach((option) => {
    const mode = option.value === 'unlimited' ? 'unlimited' : 'unique';
    const allowed = allowedModes[mode] !== false;
    option.disabled = !allowed;
    option.hidden = !allowed;
    if (allowed && !firstAllowed) {
      firstAllowed = mode;
    }
  });
  if (!firstAllowed) {
    firstAllowed = 'unique';
  }
  const currentMode = selectEl.value === 'unlimited' ? 'unlimited' : 'unique';
  if (allowedModes[currentMode] === false) {
    selectEl.value = firstAllowed;
  }
}

function normalizeAllowedModes(raw) {
  if (!raw || typeof raw !== 'object') {
    return { unique: true, unlimited: true };
  }
  return {
    unique: raw.unique !== false,
    unlimited: raw.unlimited !== false
  };
}
