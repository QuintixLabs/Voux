/*
  main.js

  Public builder page: creates counters, shows embed snippet, preview, and copy helpers.
*/

/* -------------------------------------------------------------------------- */
/* DOM references                                                             */
/* -------------------------------------------------------------------------- */
const form = document.querySelector('#create-form');
const resultSection = document.querySelector('#result');
const snippetCode = document.querySelector('#embedSnippetCode');
const svgSnippetCode = document.querySelector('#embedSvgSnippetCode');
const embedToggles = Array.from(document.querySelectorAll('.embed-toggle'));
const embedPanels = Array.from(document.querySelectorAll('[data-embed-panel]'));
const embedDescs = Array.from(document.querySelectorAll('[data-embed-desc]'));
let embedMode = 'script';
const previewTarget = document.querySelector('#previewTarget');
const builderSection = document.querySelector('#builderSection');
const privateDashboardCard = document.querySelector('#privateDashboardCard');
const stylingCard = document.querySelector('#stylingCard');
const selfHostCard = document.querySelector('#selfHostCard');
const cooldownSelect = document.querySelector('#cooldownSelect');
const startValueInput = document.querySelector('#startValue');
let isPrivateMode = false;
let showGuides = true;
let defaultMode = 'unique';
let allowedModes = { unique: true, unlimited: true };
let currentThrottleSeconds = 0;
const themeHelper = window.VouxTheme;
const START_VALUE_DIGIT_LIMIT = 18;


/* -------------------------------------------------------------------------- */
/* Guides                                                                     */
/* -------------------------------------------------------------------------- */

document.querySelectorAll('.expander').forEach((details) => {
  const content = details.querySelector('.expander__content');
  const summary = details.querySelector('summary');
  const arrow = summary.querySelector('i');
  let isAnimating = false;
  let closeTimeout = null;
  
  summary.addEventListener('click', (e) => {
    // Always prevent default and handle manually
    e.preventDefault();
    
    // If already animating, ignore the click
    if (isAnimating) {
      return;
    }
    
    // Clear any pending close timeout
    if (closeTimeout) {
      clearTimeout(closeTimeout);
      closeTimeout = null;
    }
    
    isAnimating = true;
    
    // If currently open, animate close
    if (details.open) {
      
      // Manually rotate arrow immediately
      if (arrow) {
        arrow.style.transform = 'rotate(0deg)';
      }
      
      // Animate closing
      content.style.gridTemplateRows = '1fr';
      void content.offsetHeight;
      requestAnimationFrame(() => {
        content.style.gridTemplateRows = '0fr';
      });
      
      // Wait for animation to finish, then actually close
      closeTimeout = setTimeout(() => {
        details.removeAttribute('open');
        if (arrow) {
          arrow.style.transform = ''; // Reset to CSS control
        }
        isAnimating = false;
        closeTimeout = null;
      }, 400); // Match the CSS transition duration
    } else {
      
      // Opening - add open attribute first
      details.setAttribute('open', '');
      
      // Manually rotate arrow immediately
      if (arrow) {
        arrow.style.transform = 'rotate(180deg)';
      }
      
      content.style.gridTemplateRows = '0fr';
      void content.offsetHeight;
      requestAnimationFrame(() => {
        content.style.gridTemplateRows = '1fr';
        setTimeout(() => {
          if (arrow) {
            arrow.style.transform = ''; // Reset to CSS control
          }
          isAnimating = false;
        }, 400);
      });
    }
  });
  
  // Initialize closed state
  if (!details.open) {
    content.style.gridTemplateRows = '0fr';
  }
});


/* -------------------------------------------------------------------------- */
/* Modal helpers                                                              */
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

/* -------------------------------------------------------------------------- */
/* Input helpers                                                              */
/* -------------------------------------------------------------------------- */
function limitStartValueInput(input) {
  if (!input) return;
  const enforceDigits = () => {
    const digitsOnly = (input.value || '').replace(/[^\d]/g, '');
    const trimmed = digitsOnly.slice(0, START_VALUE_DIGIT_LIMIT);
    if (trimmed !== input.value) {
      input.value = trimmed;
    }
  };
  enforceDigits();
  input.addEventListener('input', enforceDigits);
}

function readStartValue(input) {
  if (!input) return '0';
  const digits = (input.value || '').replace(/[^\d]/g, '').slice(0, START_VALUE_DIGIT_LIMIT);
  return digits || '0';
}

limitStartValueInput(startValueInput);

/* -------------------------------------------------------------------------- */
/* Form submission                                                            */
/* -------------------------------------------------------------------------- */
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
      startValue: readStartValue(startValueInput)
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
      if (snippetCode) snippetCode.textContent = data.embedCode || '';
      if (svgSnippetCode) svgSnippetCode.textContent = data.embedSvgCode || '';
      if (window.Prism?.highlightAll) {
        window.Prism.highlightAll();
      }
      resultSection.classList.remove('hidden');
      setEmbedMode(embedMode);
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

function setEmbedMode(mode) {
  const target = mode === 'svg' ? 'svg' : 'script';
  embedMode = target;
  embedToggles.forEach((toggle) => {
    toggle.classList.toggle('is-active', toggle.dataset.embed === target);
  });
  embedPanels.forEach((panel) => {
    panel.classList.toggle('hidden', panel.dataset.embedPanel !== target);
  });
  embedDescs.forEach((desc) => {
    desc.classList.toggle('hidden', desc.dataset.embedDesc !== target);
  });
}

embedToggles.forEach((toggle) => {
  toggle.addEventListener('click', () => setEmbedMode(toggle.dataset.embed || 'script'));
});

/* -------------------------------------------------------------------------- */
/* Preview                                                                    */
/* -------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------- */
/* Form state                                                                 */
/* -------------------------------------------------------------------------- */
function setFormState(disabled) {
  if (!form) return;
  Array.from(form.elements).forEach((el) => {
    el.disabled = disabled && el.type !== 'submit';
  });
}

/* -------------------------------------------------------------------------- */
/* Guide code copy                                                            */
/* -------------------------------------------------------------------------- */
document.querySelectorAll('.copy-button').forEach((button) => {
  button.addEventListener('click', () => {
    const block = button.closest('.code-snippet') || button.parentElement;
    const code = block?.querySelector('code');
    if (!code) return;
    const text = code.textContent;

    navigator.clipboard.writeText(text).then(() => {
      const originalHTML = button.innerHTML;
      button.innerHTML = '<i class="ri-check-line"></i>';
      button.classList.add('copied');
      button.disabled = true;

      setTimeout(() => {
        button.innerHTML = originalHTML;
        button.classList.remove('copied');
        button.disabled = false;
      }, 2000);
    });
  });
});


/* -------------------------------------------------------------------------- */
/* Config                                                                     */
/* -------------------------------------------------------------------------- */
initConfig();

async function initConfig() {
  try {
    const getConfig = window.VouxState?.getConfig
      ? window.VouxState.getConfig()
      : fetch('/api/config').then((res) => (res.ok ? res.json() : null));
    const data = await getConfig;
    if (!data) return;
    isPrivateMode = Boolean(data.privateMode);
    showGuides = data.showGuides !== undefined ? Boolean(data.showGuides) : true;
    allowedModes = normalizeAllowedModes(data.allowedModes);
    defaultMode = data.defaultMode === 'unlimited' && allowedModes.unlimited !== false ? 'unlimited' : 'unique';
    currentThrottleSeconds = Number(data.unlimitedThrottleSeconds) || 0;
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
    themeHelper?.apply(data.theme);
  } catch (error) {
    console.warn('Failed to load config', error);
  } finally {
    document.body?.classList.remove('config-pending');
  }
}

/* -------------------------------------------------------------------------- */
/* Guide cards                                                                */
/* -------------------------------------------------------------------------- */
function toggleGuideCards() {
  const shouldShow = showGuides;
  [stylingCard, selfHostCard].forEach((card) => {
    if (!card) return;
    card.classList.toggle('hidden', !shouldShow);
  });
}

/* -------------------------------------------------------------------------- */
/* Cooldown select                                                            */
/* -------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------- */
/* Error messaging                                                            */
/* -------------------------------------------------------------------------- */
function buildCreateCounterErrorMessage(error, status) {
  if (status === 401 || status === 403) {
    return 'This instance is private. Log in to create counters.';
  }
  if (error && error.error === 'unauthorized') {
    return 'This instance is private. Log in to create counters.';
  }
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

/* -------------------------------------------------------------------------- */
/* URL helpers                                                                */
/* -------------------------------------------------------------------------- */
function appendPreviewParam(url) {
  try {
    const parsed = new URL(url, window.location.origin);
    parsed.searchParams.set('preview', '1');
    return parsed.toString();
  } catch {
    return url.includes('?') ? `${url}&preview=1` : `${url}?preview=1`;
  }
}

/* -------------------------------------------------------------------------- */
/* Allowed modes                                                              */
/* -------------------------------------------------------------------------- */
function applyAllowedModesToSelect(selectEl) {
  if (!selectEl) return;
  const options = Array.from(selectEl.options);
  let firstAllowed = null;

  const throttleLabel = currentThrottleSeconds > 0
    ? `Every visit (${currentThrottleSeconds}s)`
    : 'Every visit';

  options.forEach((option) => {
    const mode = option.value === 'unlimited' ? 'unlimited' : 'unique';
    const allowed = allowedModes[mode] !== false;
    option.disabled = !allowed;
    option.hidden = !allowed;
    if (mode === 'unlimited') {
      option.textContent = throttleLabel;
    }
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
