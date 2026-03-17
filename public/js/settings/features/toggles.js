/*
  settings/features/toggles.js

  Runtime toggles and status line handling for settings page.
*/

/* -------------------------------------------------------------------------- */
/* Toggle manager                                                             */
/* -------------------------------------------------------------------------- */
function createTogglesManager(deps) {
  const {
    statusLabel,
    allowModeUniqueInput,
    allowModeUnlimitedInput,
    authFetch,
    assertSession,
    showToast,
    showAlert,
    normalizeAuthMessage,
    applyConfigUpdate
  } = deps;

  let statusTimeout = null;

/* -------------------------------------------------------------------------- */
/* Settings toggle updates                                                    */
/* -------------------------------------------------------------------------- */
async function handleToggleChange(patch, successMessage = 'Updated', control) {
    try {
      setStatus('');
      if (control) control.disabled = true;
      const res = await authFetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(patch)
      });
      await assertSession(res);
      if (!res.ok) throw new Error('Failed to save');
      const payload = await res.json().catch(() => ({}));
      applyConfigUpdate(payload);
      setStatus('');
      showToast(successMessage);
    } catch (error) {
      await showAlert(normalizeAuthMessage(error, 'Failed to save settings'));
      resetStatusAfterDelay();
    } finally {
      if (control) control.disabled = false;
    }
  }

/* -------------------------------------------------------------------------- */
/* Status label helpers                                                       */
/* -------------------------------------------------------------------------- */
function setStatus(text) {
    if (statusLabel) statusLabel.textContent = text || '';
  }

  function resetStatusAfterDelay() {
    clearTimeout(statusTimeout);
    statusTimeout = setTimeout(() => {
      setStatus('');
    }, 1200);
  }

/* -------------------------------------------------------------------------- */
/* Allowed mode constraints                                                   */
/* -------------------------------------------------------------------------- */
function handleAllowedModesChange(sourceInput) {
    const allowed = {
      unique: allowModeUniqueInput?.checked !== false,
      unlimited: allowModeUnlimitedInput?.checked !== false
    };
    if (!allowed.unique && !allowed.unlimited) {
      if (sourceInput) sourceInput.checked = true;
      showToast('Keep at least one mode enabled!', 'danger');
      return;
    }
    handleToggleChange({ allowedModes: allowed }, 'Allowed modes updated', sourceInput);
  }

  return {
    handleToggleChange,
    setStatus,
    handleAllowedModesChange
  };
}

export {
  createTogglesManager
};
