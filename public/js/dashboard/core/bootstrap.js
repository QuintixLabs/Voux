/*
  public/js/dashboard/core/bootstrap.js

  Dashboard bootstrap helpers and startup wiring.
*/

/* -------------------------------------------------------------------------- */
/* Shared library helpers                                                     */
/* -------------------------------------------------------------------------- */
function ensurePickrLoaded() {
  if (window.Pickr && typeof window.Pickr.create === 'function') {
    return Promise.resolve(window.Pickr);
  }
  return Promise.reject(new Error('Pickr not loaded'));
}

/* -------------------------------------------------------------------------- */
/* Shared bootstrap helpers                                                   */
/* -------------------------------------------------------------------------- */
function createDashboardBootstrapHelpers(deps) {
  const {
    state,
    START_VALUE_DIGIT_LIMIT,
    authFetch,
    buildUnauthorizedError,
    buildForbiddenError,
    assertAuthorizedResponseUi,
    setUserSession,
    embedToggles,
    embedPanels,
    embedDescs
  } = deps;

  async function ensureSessionForAction() {
    const res = await authFetch('/api/session', { cache: 'no-store' });
    if (res.status === 401) {
      await setUserSession(null);
      throw buildUnauthorizedError();
    }
    if (res.status === 403) {
      throw buildForbiddenError();
    }
  }

  async function assertAuthorizedResponse(res) {
    await assertAuthorizedResponseUi(res, () => {
      setUserSession(null);
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

  function canDangerOnCounter(counter) {
    if (!state.isAdmin) return true;
    if (state.user?.adminPermissions?.danger === true) return true;
    return Boolean(counter?.ownerId && counter.ownerId === state.user?.id);
  }

  function readStartValue(input) {
    if (!input) return '0';
    const digits = (input.value || '').replace(/[^\d]/g, '').slice(0, START_VALUE_DIGIT_LIMIT);
    return digits || '0';
  }

  function setEmbedMode(mode) {
    const target = mode === 'svg' ? 'svg' : 'script';
    state.embedMode = target;
    embedToggles.forEach((toggle) => {
      toggle.classList.toggle('is-active', toggle.dataset.embed === target);
    });
    embedPanels.forEach((panel) => {
      panel.classList.toggle('hidden', panel.dataset.embedPanel !== target);
    });
    embedDescs.forEach((desc) => {
      desc.classList.toggle('hidden', desc.dataset.embedDesc !== target);
    });
  }

  return {
    ensureSessionForAction,
    assertAuthorizedResponse,
    canDangerOnCounter,
    readStartValue,
    setEmbedMode
  };
}

/* -------------------------------------------------------------------------- */
/* Dashboard startup wiring                                                   */
/* -------------------------------------------------------------------------- */
function initDashboardBootstrap(deps) {
  const {
    state,
    START_VALUE_DIGIT_LIMIT,
    createStartInput,
    adminForm,
    prevPageBtn,
    nextPageBtn,
    deleteAllBtn,
    deleteFilteredBtn,
    createForm,
    modeFilterSelect,
    sortFilterSelect,
    ownerFilterToggle,
    adminCooldownSelect,
    counterSearchInput,
    counterSearchClear,
    activityRangeControls,
    selectAllBtn,
    downloadSelectedBtn,
    addTagsSelectedBtn,
    deleteSelectedBtn,
    clearSelectionBtn,
    embedToggles,
    tagFilterButton,
    tagFilterControls,
    clearTagFilterBtn,
    tagFilterCreateBtn,
    createTagManageBtn,
    createTagPicker,
    loginCard,
    hasSessionHint,
    onLoginSubmit,
    handlePageNavigation,
    handleDeleteAll,
    handleDeleteFiltered,
    handleCreateCounter,
    handleModeFilterChange,
    handleSortChange,
    handleOwnerFilterToggle,
    refreshAdminModeControls,
    handleSearchInput,
    handleSearchClear,
    handleActivityRangeClick,
    handlePaginationHotkeys,
    handleSelectAll,
    handleDownloadSelected,
    handleAddTagsSelected,
    handleDeleteSelected,
    clearSelection,
    handleDocumentClick,
    handleGlobalKeydown,
    handleTagFilterToggle,
    handleTagFilterLabelClick,
    clearTagFilterSelection,
    handleTagCreate,
    registerTagSelector,
    renderTagFilterList,
    updateTagFilterButton,
    toggleSearchClear,
    setLoginPending,
    revealLoginCard,
    fetchConfig,
    checkSession,
    updateDeleteFilteredState,
    updateActivityRangeButtons,
    updateTagCounterHints,
    enhanceCodeSnippets,
    bindSnippetCopyButtons,
    setEmbedMode
  } = deps;

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

  function init() {
    if (deleteAllBtn) deleteAllBtn.disabled = true;
    adminForm?.addEventListener('submit', onLoginSubmit);
    prevPageBtn?.addEventListener('click', () => {
      if (state.page > 1) {
        handlePageNavigation(state.page - 1);
      }
    });
    nextPageBtn?.addEventListener('click', () => {
      if (state.page < state.totalPages) {
        handlePageNavigation(state.page + 1);
      }
    });
    deleteAllBtn?.addEventListener('click', handleDeleteAll);
    deleteFilteredBtn?.addEventListener('click', handleDeleteFiltered);
    createForm?.addEventListener('submit', handleCreateCounter);
    modeFilterSelect?.addEventListener('change', handleModeFilterChange);
    sortFilterSelect?.addEventListener('change', handleSortChange);
    ownerFilterToggle?.addEventListener('click', handleOwnerFilterToggle);
    adminCooldownSelect?.addEventListener('change', refreshAdminModeControls);
    counterSearchInput?.addEventListener('input', handleSearchInput);
    counterSearchInput?.addEventListener('search', handleSearchInput);
    counterSearchClear?.addEventListener('click', handleSearchClear);
    activityRangeControls?.addEventListener('click', handleActivityRangeClick);
    window.addEventListener('keydown', handlePaginationHotkeys);
    selectAllBtn?.addEventListener('click', handleSelectAll);
    downloadSelectedBtn?.addEventListener('click', handleDownloadSelected);
    addTagsSelectedBtn?.addEventListener('click', handleAddTagsSelected);
    deleteSelectedBtn?.addEventListener('click', handleDeleteSelected);
    embedToggles.forEach((toggle) => {
      toggle.addEventListener('click', () => setEmbedMode(toggle.dataset.embed || 'script'));
    });
    clearSelectionBtn?.addEventListener('click', () => clearSelection());
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleGlobalKeydown);
    tagFilterButton?.addEventListener('click', handleTagFilterToggle);
    const tagFilterLabel = tagFilterControls?.querySelector('span');
    tagFilterLabel?.addEventListener('click', handleTagFilterLabelClick);
    clearTagFilterBtn?.addEventListener('click', clearTagFilterSelection);
    tagFilterCreateBtn?.addEventListener('click', (event) => {
      event.stopPropagation();
      handleTagCreate('filter');
    });
    createTagManageBtn?.addEventListener('click', () => handleTagCreate('create'));
    if (createTagPicker) {
      registerTagSelector(createTagPicker, {
        getSelected: () => state.createTags.slice(),
        setSelected: (next) => {
          state.createTags = next;
        },
        emptyMessage: 'No tags yet. Use "New tag" to create one.'
      });
    }
    renderTagFilterList();
    updateTagFilterButton();
    toggleSearchClear();
    limitStartValueInput(deps.createStartInput);
    if (hasSessionHint()) {
      setLoginPending(true, 'Checking your session...');
    } else {
      revealLoginCard();
    }
    setTimeout(() => {
      if (!state.user && !hasSessionHint() && loginCard?.classList.contains('hidden')) {
        revealLoginCard();
      }
    }, 150);
    fetchConfig()
      .then(() => {
        checkSession();
      })
      .catch((err) => {
        console.warn('Admin init failed', err);
        revealLoginCard();
      });
    updateDeleteFilteredState();
    updateActivityRangeButtons();
    updateTagCounterHints();
    enhanceCodeSnippets();
    bindSnippetCopyButtons('.code-snippet .copy-button');

    window.addEventListener('pageshow', (event) => {
      if (event.persisted && hasSessionHint()) {
        checkSession();
      }
    });

    document.addEventListener('click', () => {
      document.querySelectorAll('.counter-copy__menu.is-open').forEach((menu) => {
        menu.classList.remove('is-open');
      });
    });
  }

  return init();
}

export {
  ensurePickrLoaded,
  createDashboardBootstrapHelpers,
  initDashboardBootstrap
};
