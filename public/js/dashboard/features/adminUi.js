/*
  dashboard/features/adminUi.js

  Dashboard admin-specific UI state and control helpers.
*/

/* -------------------------------------------------------------------------- */
/* Admin UI manager                                                           */
/* -------------------------------------------------------------------------- */
function createDashboardAdminUi(deps) {
  const {
    state,
    modeFilterSelect,
    sortFilterSelect,
    deleteFilteredBtn,
    deleteAllBtn,
    deleteSelectedBtn,
    ownerFilterWrap,
    tagFilterCreateBtn,
    createTagManageBtn,
    adminCooldownSelect,
    adminThrottleHint,
    createCard,
    adminEmbedBlock,
    adminEmbedSnippetCode,
    adminEmbedSvgSnippetCode,
    setEmbedMode,
    saveOwnerFilterPreference,
    applyAllowedModesToSelect
  } = deps;

/* -------------------------------------------------------------------------- */
/* Owner/filter visibility                                                    */
/* -------------------------------------------------------------------------- */
function syncOwnerFilterToggle() {
    const toggle = document.querySelector('#ownerFilterToggle');
    if (!toggle) return;
    toggle.setAttribute('aria-pressed', state.ownerOnly ? 'true' : 'false');
  }

  function updateCreateCardVisibility() {
    if (!createCard) return;
    const canCreate = !state.privateMode || Boolean(state.user);
    if (canCreate) {
      createCard.classList.remove('hidden');
    } else {
      createCard.classList.add('hidden');
      adminEmbedBlock?.classList.add('hidden');
      if (adminEmbedSnippetCode) adminEmbedSnippetCode.textContent = '';
      if (adminEmbedSvgSnippetCode) adminEmbedSvgSnippetCode.textContent = '';
      setEmbedMode(state.embedMode || 'script');
    }
  }

  function updateDeleteButtonLabels() {
    const myOnly = Boolean(state.ownerOnly);
    if (deleteAllBtn) {
      deleteAllBtn.innerHTML = `<i class="ri-indeterminate-circle-line"></i> ${
        myOnly ? 'Delete all of my counters' : 'Delete all counters'
      }`;
    }
    if (deleteFilteredBtn) {
      deleteFilteredBtn.innerHTML = `<i class="ri-delete-bin-line"></i> ${
        myOnly ? 'Delete my filtered' : 'Delete filtered'
      }`;
    }
  }

  function updateDeleteFilteredState() {
    updateDeleteButtonLabels();
    if (modeFilterSelect) {
      modeFilterSelect.value = state.modeFilter;
    }
    if (sortFilterSelect) {
      sortFilterSelect.value = state.sort || 'newest';
    }
    const dangerAllowed = !state.isAdmin || state.user?.adminPermissions?.danger === true;
    const allowMyDanger = dangerAllowed || (state.isAdmin && state.ownerOnly);
    const isGlobal = state.modeFilter === 'all';
    if (deleteFilteredBtn) {
      deleteFilteredBtn.disabled = isGlobal || !allowMyDanger;
      deleteFilteredBtn.classList.toggle('hidden', isGlobal || !allowMyDanger);
    }
    if (deleteAllBtn) {
      deleteAllBtn.classList.toggle('hidden', !isGlobal || !allowMyDanger);
      deleteAllBtn.disabled = !isGlobal || !allowMyDanger;
    }
    if (deleteSelectedBtn) {
      deleteSelectedBtn.disabled = !allowMyDanger;
      deleteSelectedBtn.classList.toggle('hidden', !allowMyDanger);
    }
  }

  function updateAdminVisibility() {
    const isAdmin = state.isAdmin;
    const hasUser = Boolean(state.user);
    tagFilterCreateBtn?.classList.toggle('hidden', !hasUser);
    createTagManageBtn?.classList.toggle('hidden', !hasUser);
    if (!isAdmin) {
      state.ownerOnly = false;
    }
    const dangerAllowed = !state.isAdmin || state.user?.adminPermissions?.danger === true;
    if (isAdmin && !dangerAllowed) {
      state.ownerOnly = true;
      state.ownerOnlyForced = true;
      saveOwnerFilterPreference(true);
    } else if (isAdmin && state.ownerOnlyForced) {
      state.ownerOnly = false;
      state.ownerOnlyForced = false;
      saveOwnerFilterPreference(false);
    }
    ownerFilterWrap?.classList.toggle('hidden', !isAdmin || (isAdmin && !dangerAllowed));
    syncOwnerFilterToggle();
    updateDeleteFilteredState();
  }

/* -------------------------------------------------------------------------- */
/* Mode + throttle hints                                                      */
/* -------------------------------------------------------------------------- */
function refreshAdminModeControls() {
    if (!adminCooldownSelect) return;
    applyAllowedModesToSelect(adminCooldownSelect, state.allowedModes);
  }

  function renderAdminThrottleHint() {
    if (!adminThrottleHint) return;
    if (!state.allowedModes.unlimited || state.throttleSeconds <= 0) {
      adminThrottleHint.classList.add('hidden');
      adminThrottleHint.textContent = '';
      return;
    }
    adminThrottleHint.textContent = `Every visit mode counts at most once per visitor every ${state.throttleSeconds} seconds.`;
    adminThrottleHint.classList.remove('hidden');
  }

  return {
    syncOwnerFilterToggle,
    updateCreateCardVisibility,
    updateDeleteFilteredState,
    updateDeleteButtonLabels,
    updateAdminVisibility,
    refreshAdminModeControls,
    renderAdminThrottleHint
  };
}

export { createDashboardAdminUi };
