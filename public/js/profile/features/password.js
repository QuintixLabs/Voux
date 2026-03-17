/*
  public/js/profile/features/password.js

  Password reset modal behavior.
*/

/* -------------------------------------------------------------------------- */
/* Password feature                                                           */
/* -------------------------------------------------------------------------- */
function createProfilePasswordFeature(deps) {
  const {
    profilePasswordReset,
    profilePasswordModal,
    profilePasswordMessage,
    profilePasswordCurrent,
    profilePasswordNew,
    profilePasswordCurrentError,
    profilePasswordNewError,
    profilePasswordSave,
    profilePasswordCancel,
    profileUsernameText,
    profileDisplayText,
    authFetch,
    showToast,
    showAlert,
    normalizeProfileError,
    setInlineError
  } = deps;

  function openPasswordModal() {
    if (!profilePasswordModal) return;

    const username = profileUsernameText?.textContent || '';
    const displayName = profileDisplayText && !profileDisplayText.classList.contains('hint')
      ? profileDisplayText.textContent
      : '';

    if (profilePasswordMessage) {
      profilePasswordMessage.textContent = displayName
        ? `Reset password for ${displayName}.`
        : `Reset password for ${username || 'this account'}.`;
    }

    if (profilePasswordCurrent) profilePasswordCurrent.value = '';
    if (profilePasswordNew) profilePasswordNew.value = '';
    setInlineError(profilePasswordCurrentError, '');
    setInlineError(profilePasswordNewError, '');

    profilePasswordModal.classList.add('modal-overlay--open');
    profilePasswordModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    profilePasswordCurrent?.focus();
  }

  function closePasswordModal() {
    if (!profilePasswordModal) return;
    profilePasswordModal.classList.remove('modal-overlay--open');
    profilePasswordModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  async function savePasswordReset() {
    const currentPassword = profilePasswordCurrent?.value || '';
    const newPassword = profilePasswordNew?.value || '';
    let hasError = false;

    if (!currentPassword) {
      setInlineError(profilePasswordCurrentError, 'Enter your current password.');
      hasError = true;
    }

    if (!newPassword) {
      setInlineError(profilePasswordNewError, 'Enter a new password.');
      hasError = true;
    } else if (newPassword.length < 6) {
      setInlineError(profilePasswordNewError, 'New password must be at least 6 characters.');
      hasError = true;
    }

    if (hasError) return;

    try {
      const res = await authFetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to reset password');
      }

      showToast('Password updated');
      setInlineError(profilePasswordCurrentError, '');
      setInlineError(profilePasswordNewError, '');
      closePasswordModal();
    } catch (error) {
      const message = error.message === 'invalid_credentials'
        ? 'Current password is incorrect.'
        : normalizeProfileError(error, 'Failed to reset password');

      if (profilePasswordCurrentError) {
        setInlineError(profilePasswordCurrentError, message);
      } else {
        await showAlert(message);
      }
    }
  }

  function bind() {
    profilePasswordReset?.addEventListener('click', openPasswordModal);
    profilePasswordCancel?.addEventListener('click', closePasswordModal);
    profilePasswordModal?.addEventListener('click', (event) => {
      if (event.target === profilePasswordModal) closePasswordModal();
    });
    profilePasswordSave?.addEventListener('click', savePasswordReset);
    profilePasswordCurrent?.addEventListener('input', () => setInlineError(profilePasswordCurrentError, ''));
    profilePasswordNew?.addEventListener('input', () => setInlineError(profilePasswordNewError, ''));
  }

  return { bind };
}

export { createProfilePasswordFeature };
