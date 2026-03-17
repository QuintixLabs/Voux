/*
  public/js/profile/features/displayName.js

  Display-name modal behavior.
*/

/* -------------------------------------------------------------------------- */
/* Display-name feature                                                       */
/* -------------------------------------------------------------------------- */
function createProfileDisplayNameFeature(deps) {
  const {
    profileDisplayEdit,
    profileDisplayText,
    profileDisplayModal,
    profileDisplayNew,
    profileDisplayError,
    profileDisplaySave,
    profileDisplayCancel,
    authFetch,
    showToast,
    normalizeProfileError,
    setInlineError,
    syncProfile
  } = deps;

  function openDisplayModal() {
    if (!profileDisplayModal) return;
    setInlineError(profileDisplayError, '');
    if (profileDisplayNew) {
      const current = profileDisplayText?.textContent || '';
      profileDisplayNew.value = current === 'No display name' ? '' : current;
    }
    profileDisplayModal.classList.add('modal-overlay--open');
    profileDisplayModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    profileDisplayNew?.focus();
  }

  function closeDisplayModal() {
    if (!profileDisplayModal) return;
    profileDisplayModal.classList.remove('modal-overlay--open');
    profileDisplayModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    setInlineError(profileDisplayError, '');
  }

  async function saveDisplayName() {
    const displayName = profileDisplayNew?.value?.trim() || '';

    try {
      const res = await authFetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update display name');
      }
      const data = await res.json().catch(() => ({}));
      const updated = data.user || {};
      showToast('Display name updated');
      syncProfile(updated);
      closeDisplayModal();
    } catch (error) {
      setInlineError(
        profileDisplayError,
        normalizeProfileError(error, 'Failed to update display name.')
      );
    }
  }

  function bind() {
    profileDisplayEdit?.addEventListener('click', openDisplayModal);
    profileDisplayCancel?.addEventListener('click', closeDisplayModal);
    profileDisplayModal?.addEventListener('click', (event) => {
      if (event.target === profileDisplayModal) closeDisplayModal();
    });
    profileDisplaySave?.addEventListener('click', saveDisplayName);
  }

  return { bind };
}

export { createProfileDisplayNameFeature };
