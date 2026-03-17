/*
  settings/core/form.js

  Settings payload fetch + form population helpers.
*/

/* -------------------------------------------------------------------------- */
/* Form manager                                                               */
/* -------------------------------------------------------------------------- */
function createSettingsFormManager(deps) {
  const {
    authFetch,
    togglePrivate,
    toggleGuides,
    allowModeUniqueInput,
    allowModeUnlimitedInput,
    throttleSelect,
    applyBrandingFromConfig,
    applyAutoBackupForm,
    applyAutoBackupPath
  } = deps;

/* -------------------------------------------------------------------------- */
/* Settings fetch                                                             */
/* -------------------------------------------------------------------------- */
async function fetchSettings() {
    const res = await authFetch('/api/settings');
    if (!res.ok) throw new Error('Unauthorized');
    const data = await res.json();
    return {
      config: data.config || {},
      usersPageSize: Number(data.usersPageSize),
      inactiveDaysThreshold: Number(data.inactiveDaysThreshold),
      adminPermissions: data.adminPermissions || null,
      backupDirectory: data.backupDirectory || ''
    };
  }

/* -------------------------------------------------------------------------- */
/* Settings form apply                                                        */
/* -------------------------------------------------------------------------- */
function populateForm(config, options = {}) {
    if (togglePrivate) togglePrivate.checked = Boolean(config.privateMode);
    if (toggleGuides) toggleGuides.checked = Boolean(config.showGuides);
    if (allowModeUniqueInput) allowModeUniqueInput.checked = config.allowedModes ? config.allowedModes.unique !== false : true;
    if (allowModeUnlimitedInput) allowModeUnlimitedInput.checked = config.allowedModes ? config.allowedModes.unlimited !== false : true;

    applyBrandingFromConfig(config);

    if (throttleSelect) {
      const value = Number(config.unlimitedThrottleSeconds);
      const safe = Number.isFinite(value) ? String(value) : '0';
      let option = throttleSelect.querySelector(`option[value="${safe}"]`);
      if (!option) {
        option = document.createElement('option');
        option.value = safe;
        const seconds = Number(safe);
        const labelSeconds = Number.isFinite(seconds) ? seconds : 0;
        const pretty = labelSeconds === 1 ? '1 second' : `${labelSeconds} seconds`;
        option.textContent = `Throttle to ${pretty} per visitor`;
        option.dataset.custom = 'true';
        throttleSelect.appendChild(option);
      }
      throttleSelect.value = safe;
    }

    applyAutoBackupForm(config.autoBackup || {});
    applyAutoBackupPath(options.backupDirectory || '');
  }

  return {
    fetchSettings,
    populateForm
  };
}

export {
  createSettingsFormManager
};
