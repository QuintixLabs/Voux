/*
  settings/features/branding.js

  Branding/theme form behavior for settings.
*/

/* -------------------------------------------------------------------------- */
/* Branding manager                                                           */
/* -------------------------------------------------------------------------- */
function createBrandingManager(deps) {
  const {
    brandingForm,
    brandNameInputField,
    homeTitleInputField,
    themeSelect,
    brandingStatusLabel,
    resetBrandingBtn,
    DEFAULT_BRAND_NAME,
    DEFAULT_HOME_TITLE,
    ALLOWED_THEMES,
    authFetch,
    assertSession,
    showToast,
    showAlert,
    normalizeAuthMessage,
    modalConfirm,
    applyConfigUpdate,
    applyThemeClass
  } = deps;

  let initialBranding = {
    brandName: null,
    homeTitle: null,
    theme: null
  };

  function resolveAllowedThemes() {
    const runtimeThemes = window.VouxTheme?.THEMES;
    if (Array.isArray(runtimeThemes) && runtimeThemes.length) {
      return runtimeThemes;
    }
    if (Array.isArray(ALLOWED_THEMES) && ALLOWED_THEMES.length) {
      return ALLOWED_THEMES;
    }
    return ['default'];
  }

/* -------------------------------------------------------------------------- */
/* Event wiring                                                               */
/* -------------------------------------------------------------------------- */
function setupBrandingForm() {
    if (!brandingForm) return;
    brandingForm.addEventListener('submit', (event) => handleBrandingSubmit(event));
    themeSelect?.addEventListener('change', handleThemePreview);
    brandNameInputField?.addEventListener('input', checkBrandingDirty);
    homeTitleInputField?.addEventListener('input', checkBrandingDirty);
    resetBrandingBtn?.addEventListener('click', handleBrandingReset);
  }

  function applyBrandingFromConfig(config = {}) {
    populateThemeOptions();
    if (brandNameInputField) brandNameInputField.value = config.brandName || DEFAULT_BRAND_NAME;
    if (homeTitleInputField) {
      homeTitleInputField.value = config.homeTitle || DEFAULT_HOME_TITLE;
    }
    if (themeSelect) {
      const theme = config.theme || 'default';
      if (themeSelect.querySelector(`option[value="${theme}"]`)) {
        themeSelect.value = theme;
      }
      applyThemeClass(theme);
    }
    initialBranding = {
      brandName: brandNameInputField?.value?.trim() || DEFAULT_BRAND_NAME,
      homeTitle: homeTitleInputField?.value?.trim() || DEFAULT_HOME_TITLE,
      theme: (themeSelect?.value || 'default').trim()
    };
    setBrandingDirty(false);
  }

/* -------------------------------------------------------------------------- */
/* Save/reset actions                                                         */
/* -------------------------------------------------------------------------- */
async function handleBrandingSubmit(event) {
    event.preventDefault();
    const payload = {
      brandName:
        (brandNameInputField?.value?.trim() || DEFAULT_BRAND_NAME).slice(0, 80),
      homeTitle:
        (homeTitleInputField?.value?.trim() || DEFAULT_HOME_TITLE).slice(0, 120),
      theme: (themeSelect?.value || 'default').trim()
    };
    if (brandNameInputField) brandNameInputField.value = payload.brandName;
    if (homeTitleInputField) homeTitleInputField.value = payload.homeTitle;
    try {
      setBrandingStatus('');
      const res = await authFetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      await assertSession(res);
      await assertSession(res);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update branding');
      }
      const updated = await res.json().catch(() => ({}));
      applyConfigUpdate(updated);
      setBrandingStatus('');
      applyThemeClass(payload.theme);
      showToast('Branding updated');
      initialBranding = {
        brandName: payload.brandName,
        homeTitle: payload.homeTitle,
        theme: payload.theme
      };
      setBrandingDirty(false);
    } catch (error) {
      setBrandingStatus('');
      await showAlert(normalizeAuthMessage(error, 'Failed to update branding'));
    }
  }

/* -------------------------------------------------------------------------- */
/* Theme options + dirty state                                                */
/* -------------------------------------------------------------------------- */
function handleThemePreview() {
    if (!themeSelect) return;
    const theme = (themeSelect.value || 'default').trim();
    applyThemeClass(theme);
    checkBrandingDirty();
  }

  function populateThemeOptions() {
    if (!themeSelect) return;
    const current = themeSelect.value;
    const themes = resolveAllowedThemes();
    themeSelect.innerHTML = '';
    themes.forEach((key) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = key.charAt(0).toUpperCase() + key.slice(1);
      themeSelect.appendChild(opt);
    });
    if (themes.includes(current)) {
      themeSelect.value = current;
    }
  }

  function setBrandingStatus(message) {
    if (brandingStatusLabel) {
      brandingStatusLabel.textContent = message || '';
    }
  }

  function setBrandingDirty(isDirty) {
    setBrandingStatus(isDirty ? 'Unsaved changes' : '');
  }

  function checkBrandingDirty() {
    const current = {
      brandName: (brandNameInputField?.value || '').trim() || DEFAULT_BRAND_NAME,
      homeTitle: (homeTitleInputField?.value || '').trim() || DEFAULT_HOME_TITLE,
      theme: (themeSelect?.value || 'default').trim()
    };
    const isDirty =
      current.brandName !== initialBranding.brandName ||
      current.homeTitle !== initialBranding.homeTitle ||
      current.theme !== initialBranding.theme;
    setBrandingDirty(isDirty);
  }

  async function handleBrandingReset() {
    const confirmed = await modalConfirm({
      title: 'Reset branding to defaults?',
      message: 'This will reset branding to the default values and save them immediately.',
      confirmLabel: 'Reset to defaults',
      cancelLabel: 'Cancel',
      variant: 'danger'
    });
    if (!confirmed) return;
    const defaults = {
      brandName: DEFAULT_BRAND_NAME,
      homeTitle: DEFAULT_HOME_TITLE,
      theme: 'default'
    };
    if (brandNameInputField) {
      brandNameInputField.value = defaults.brandName;
    }
    if (homeTitleInputField) {
      homeTitleInputField.value = defaults.homeTitle;
    }
    if (themeSelect) {
      themeSelect.value = defaults.theme;
      applyThemeClass(defaults.theme);
    }
    try {
      setBrandingStatus('');
      const res = await authFetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(defaults)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to reset branding');
      }
      const updated = await res.json().catch(() => ({}));
      applyConfigUpdate(updated);
      initialBranding = { ...defaults };
      setBrandingDirty(false);
      showToast('Branding reset to defaults');
    } catch (error) {
      await showAlert(normalizeAuthMessage(error, 'Failed to reset branding'));
    }
  }

  return {
    setupBrandingForm,
    applyBrandingFromConfig
  };
}

export {
  createBrandingManager
};
