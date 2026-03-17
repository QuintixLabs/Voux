/*
  public/js/profile/features/username.js

  Username update modal behavior.
*/

/* -------------------------------------------------------------------------- */
/* Username feature                                                           */
/* -------------------------------------------------------------------------- */
function createProfileUsernameFeature(deps) {
  const {
    profileUsernameEdit,
    profileUsernameText,
    profileUsernameModal,
    profileUsernameNew,
    profileUsernamePassword,
    profileUsernameError,
    profileUsernameNewError,
    profileUsernameSave,
    profileUsernameCancel,
    authFetch,
    showToast,
    normalizeProfileError,
    setInlineError,
    syncProfile
  } = deps;

  function openUsernameModal() {
    if (!profileUsernameModal) return;
    if (profileUsernameNew) profileUsernameNew.value = profileUsernameText?.textContent || '';
    if (profileUsernamePassword) profileUsernamePassword.value = '';
    setInlineError(profileUsernameNewError, '');
    setInlineError(profileUsernameError, '');
    profileUsernameModal.classList.add('modal-overlay--open');
    profileUsernameModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    profileUsernameNew?.focus();
  }

  function closeUsernameModal() {
    if (!profileUsernameModal) return;
    profileUsernameModal.classList.remove('modal-overlay--open');
    profileUsernameModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  async function saveUsernameChange() {
    const username = profileUsernameNew?.value?.trim().toLowerCase() || '';
    const currentPassword = profileUsernamePassword?.value || '';
    const currentUsername = profileUsernameText?.textContent?.trim().toLowerCase() || '';

    if (!username) {
      setInlineError(profileUsernameNewError, 'Username is required.');
      return;
    }
    if (currentUsername && username === currentUsername) {
      setInlineError(profileUsernameNewError, 'Choose a different username.');
      return;
    }
    if (!currentPassword) {
      setInlineError(profileUsernameError, 'Enter your current password.');
      return;
    }

    try {
      const res = await authFetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, currentPassword })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update username');
      }

      const data = await res.json().catch(() => ({}));
      const updated = data.user || {};
      if (profileUsernameText) profileUsernameText.textContent = updated.username || username;
      showToast('Username updated');
      syncProfile(updated);
      setInlineError(profileUsernameNewError, '');
      setInlineError(profileUsernameError, '');
      closeUsernameModal();
    } catch (error) {
      const message = error.message === 'username_exists'
        ? 'That username is already taken.'
        : error.message === 'username_unchanged'
          ? 'Choose a different username.'
          : error.message === 'invalid_credentials'
            ? 'Current password is incorrect.'
            : normalizeProfileError(error, 'Failed to update username.');

      if (error.message === 'username_exists' || error.message === 'username_unchanged') {
        setInlineError(profileUsernameNewError, message);
      } else {
        setInlineError(profileUsernameError, message);
      }
    }
  }

  function bind() {
    profileUsernameEdit?.addEventListener('click', openUsernameModal);
    profileUsernameCancel?.addEventListener('click', closeUsernameModal);
    profileUsernameModal?.addEventListener('click', (event) => {
      if (event.target === profileUsernameModal) closeUsernameModal();
    });
    profileUsernameSave?.addEventListener('click', saveUsernameChange);
    profileUsernameNew?.addEventListener('input', () => setInlineError(profileUsernameNewError, ''));
    profileUsernamePassword?.addEventListener('input', () => setInlineError(profileUsernameError, ''));
  }

  return { bind };
}

export { createProfileUsernameFeature };
