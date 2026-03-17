/*
  settings/features/runtime.js

  Runtime settings actions (throttle + inactive counter cleanup).
*/

/* -------------------------------------------------------------------------- */
/* Runtime actions manager                                                    */
/* -------------------------------------------------------------------------- */
function createRuntimeManager(deps) {
  const {
    throttleSelect,
    purgeInactiveButton,
    inactiveHint,
    DEFAULT_THROTTLE_SECONDS,
    authFetch,
    assertSession,
    showToast,
    showAlert,
    normalizeAuthMessage,
    modalConfirm,
    modalConfirmWithInput,
    applyConfigUpdate,
    setStatus
  } = deps;

  let inactiveDaysThreshold = 30;

/* -------------------------------------------------------------------------- */
/* Inactive counter threshold                                                 */
/* -------------------------------------------------------------------------- */
function setInactiveDaysThreshold(value) {
    if (Number.isFinite(value) && value > 0) {
      inactiveDaysThreshold = Math.max(1, Math.round(value));
    }
  }

  function updateInactiveButtonLabel() {
    if (!purgeInactiveButton) return;
    const days = Number.isFinite(inactiveDaysThreshold) ? inactiveDaysThreshold : 30;
    const label = days === 1 ? '1 day' : `${days} days`;
    purgeInactiveButton.innerHTML = `<i class="ri-delete-bin-line"></i> Delete counters inactive for ${label}`;
    if (inactiveHint) {
      inactiveHint.textContent = `Counters with no hits for ${label} will be permanently removed.`;
    }
  }

/* -------------------------------------------------------------------------- */
/* Event wiring                                                               */
/* -------------------------------------------------------------------------- */
function setupRuntimeActions() {
    throttleSelect?.addEventListener('change', () => handleThrottleChange());
    purgeInactiveButton?.addEventListener('click', () => handlePurgeInactive());
  }

/* -------------------------------------------------------------------------- */
/* Throttle + purge actions                                                   */
/* -------------------------------------------------------------------------- */
async function handleThrottleChange() {
    if (!throttleSelect) return;
    const value = Math.max(0, Number(throttleSelect.value) || DEFAULT_THROTTLE_SECONDS);
    try {
      setStatus('');
      const res = await authFetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ unlimitedThrottleSeconds: value })
      });
      await assertSession(res);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update throttle');
      }
      const payload = await res.json().catch(() => ({}));
      applyConfigUpdate(payload);
      setStatus('');
      showToast(
        value
          ? `Every-visit hits now throttle to ${value}s per IP`
          : 'Throttle disabled'
      );
    } catch (error) {
      setStatus('');
      await showAlert(normalizeAuthMessage(error, 'Failed to update throttle'));
    }
  }

  async function handlePurgeInactive() {
    if (!purgeInactiveButton) {
      await showAlert('Log in again to manage counters.');
      return;
    }
    const days = Number.isFinite(inactiveDaysThreshold) ? inactiveDaysThreshold : 30;
    const daysLabel = days === 1 ? '1 day' : `${days} days`;
    const siteUrl = window.location?.origin || window.location?.href || 'this site';
    const confirmedFinal = await modalConfirm({
      title: 'Really remove inactive counters?',
      message: `This will permanently remove every counter that has no hits for ${daysLabel} on: ${siteUrl}. You'll confirm by typing DELETE next.`,
      messageParts: [
        'This will permanently remove every counter that has no hits for ',
        { strong: daysLabel },
        ' on: ',
        { strong: siteUrl },
        ". You'll confirm by typing DELETE next."
      ],
      confirmLabel: 'Continue',
      cancelLabel: 'Cancel',
      variant: 'danger'
    });
    if (!confirmedFinal) return;
    const confirmedInput = await modalConfirmWithInput({
      title: 'Delete inactive counters?',
      message: `Type DELETE to permanently remove inactive counters (${daysLabel}).`,
      inputPlaceholder: 'DELETE',
      inputMatch: 'DELETE',
      inputHint: 'This cannot be undone.',
      promptMessage: `Type DELETE to permanently remove inactive counters (${daysLabel}).`,
      confirmLabel: 'Delete inactive',
      cancelLabel: 'Cancel',
      variant: 'danger'
    });
    if (!confirmedInput) return;
    purgeInactiveButton.disabled = true;
    try {
      const res = await authFetch('/api/counters/purge-inactive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ days })
      });
      await assertSession(res);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete inactive counters');
      }
      const payload = await res.json().catch(() => ({}));
      const removed = payload.removed || 0;
      showToast(`Deleted ${removed} inactive ${removed === 1 ? 'counter' : 'counters'}`);
    } catch (error) {
      await showAlert(normalizeAuthMessage(error, 'Failed to delete inactive counters'));
    } finally {
      purgeInactiveButton.disabled = false;
    }
  }

  return {
    setInactiveDaysThreshold,
    updateInactiveButtonLabel,
    setupRuntimeActions
  };
}

export {
  createRuntimeManager
};
