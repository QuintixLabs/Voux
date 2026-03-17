/*
  public/js/home/core/createCounter.js

  Handles counter creation on the home page.
*/

/* -------------------------------------------------------------------------- */
/* Create counter manager                                                     */
/* -------------------------------------------------------------------------- */
function createHomeCreateCounterManager(deps) {
  const {
    form,
    cooldownSelect,
    startValueInput,
    builderSection,
    privateDashboardCard,
    START_VALUE_DIGIT_LIMIT,
    showAlert,
    buildCreateCounterErrorMessage,
    themeHelper,
    onGuideVisibilityChange,
    onCounterCreated
  } = deps;

  let isPrivateMode = false;
  let showGuides = true;
  let defaultMode = 'unique';
  let allowedModes = { unique: true, unlimited: true };
  let currentThrottleSeconds = 0;

  function init() {
    limitStartValueInput(startValueInput);
    bindCreateForm();
    initConfig();
  }

  function bindCreateForm() {
    if (!form) return;
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
        onCounterCreated?.(data);
      } catch (error) {
        await showAlert(error.message || 'Something went wrong', {
          title: 'Error'
        });
      } finally {
        setFormState(false);
      }
    });
  }

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

      onGuideVisibilityChange?.(showGuides);
      themeHelper?.apply(data.theme);
    } catch (error) {
      console.warn('Failed to load config', error);
    } finally {
      document.body?.classList.remove('config-pending');
    }
  }

  function setFormState(disabled) {
    if (!form) return;
    Array.from(form.elements).forEach((el) => {
      el.disabled = disabled && el.type !== 'submit';
    });
  }

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

  return { init };
}

export { createHomeCreateCounterManager };
