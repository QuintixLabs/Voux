/*
  public/js/profile/features/avatar.js

  Avatar preview/update/remove behavior.
*/

/* -------------------------------------------------------------------------- */
/* Avatar feature                                                             */
/* -------------------------------------------------------------------------- */
function createProfileAvatarFeature(deps) {
  const {
    profileAvatarButton,
    profileAvatarFile,
    profileAvatarPreview,
    profileAvatarFallback,
    profileAvatarRemove,
    showToast,
    normalizeProfileError,
    authFetch,
    syncProfile
  } = deps;

  function setAvatarPreview(url, username) {
    const safeUrl = url || '';
    if (profileAvatarRemove) {
      profileAvatarRemove.disabled = !safeUrl;
    }
    if (profileAvatarPreview) {
      profileAvatarPreview.src = safeUrl;
      profileAvatarPreview.classList.toggle('hidden', !safeUrl);
    }
    if (profileAvatarFallback) {
      const fallback = (username || '?').trim().charAt(0).toUpperCase() || '?';
      profileAvatarFallback.textContent = fallback;
      profileAvatarFallback.classList.toggle('hidden', Boolean(safeUrl));
    }
  }

  async function saveAvatarChange(avatarUrl) {
    try {
      const res = await authFetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update photo');
      }
      const data = await res.json().catch(() => ({}));
      const updated = data.user || {};
      showToast('Profile photo updated');
      syncProfile(updated);
    } catch (error) {
      showToast(normalizeProfileError(error, 'Failed to update photo.'), 'danger');
    }
  }

  function bind() {
    profileAvatarPreview?.addEventListener('error', () => {
      profileAvatarPreview.classList.add('hidden');
      if (profileAvatarFallback) {
        profileAvatarFallback.classList.remove('hidden');
      }
      if (profileAvatarRemove) {
        profileAvatarRemove.disabled = true;
      }
    });

    profileAvatarButton?.addEventListener('click', () => {
      profileAvatarFile?.click();
    });

    profileAvatarFile?.addEventListener('change', () => {
      const file = profileAvatarFile.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        showToast('Choose an image file.', 'danger');
        profileAvatarFile.value = '';
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        showToast('Image must be under 2MB.', 'danger');
        profileAvatarFile.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        if (!result) return;
        saveAvatarChange(result);
      };
      reader.readAsDataURL(file);
    });

    profileAvatarRemove?.addEventListener('click', () => {
      if (profileAvatarFile) profileAvatarFile.value = '';
      saveAvatarChange('');
    });
  }

  return {
    bind,
    setAvatarPreview
  };
}

export { createProfileAvatarFeature };
