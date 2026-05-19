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
    // State
    state,
    START_VALUE_DIGIT_LIMIT,

    // Requests + auth
    authFetch,
    buildUnauthorizedError,
    buildForbiddenError,
    assertAuthorizedResponseUi,
    setUserSession,

    // Embed controls
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

  function canDangerOnCounter(counter) {
    if (!state.isAdmin) return true;
    if (state.user?.adminPermissions?.danger === true) return true;
    return Boolean(counter?.ownerId && counter.ownerId === state.user?.id);
  }

  function readStartValue(input) {
    if (!input) return '0';
    const digits = (input.value || '')
      .replace(/[^\d]/g, '')
      .slice(0, START_VALUE_DIGIT_LIMIT);
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

    // Login controls
    adminForm,
    loginCard,
    loginUsernameInput,
    loginPasswordInput,
    hasSessionHint,
    onLoginSubmit,
    setLoginPending,
    revealLoginCard,
    hideLoginError,

    // Counter creation controls
    createForm,
    createStartInput,
    createTagPicker,
    createTagManageBtn,
    setEmbedMode,
    embedToggles,
    handleCreateCounter,

    // Counter filters + pagination
    prevPageBtn,
    nextPageBtn,
    modeFilterSelect,
    sortFilterSelect,
    ownerFilterToggle,
    adminCooldownSelect,
    counterSearchInput,
    counterSearchClear,
    activityRangeControls,
    handlePageNavigation,
    handleModeFilterChange,
    handleSortChange,
    handleOwnerFilterToggle,
    refreshAdminModeControls,
    handleSearchInput,
    handleSearchClear,
    handleActivityRangeClick,
    handlePaginationHotkeys,
    toggleSearchClear,
    updateDeleteFilteredState,
    updateActivityRangeButtons,

    // Bulk counter actions
    deleteAllBtn,
    deleteFilteredBtn,
    selectAllBtn,
    downloadSelectedBtn,
    addTagsSelectedBtn,
    deleteSelectedBtn,
    clearSelectionBtn,
    handleDeleteAll,
    handleDeleteFiltered,
    handleSelectAll,
    handleDownloadSelected,
    handleAddTagsSelected,
    handleDeleteSelected,
    clearSelection,

    // Tag filter controls
    tagFilterButton,
    tagFilterControls,
    clearTagFilterBtn,
    tagFilterCreateBtn,
    handleTagFilterToggle,
    handleTagFilterLabelClick,
    clearTagFilterSelection,
    handleTagCreate,
    registerTagSelector,
    renderTagFilterList,
    updateTagFilterButton,
    updateTagCounterHints,

    // Global dashboard handlers
    handleDocumentClick,
    handleGlobalKeydown,
    fetchConfig,
    checkSession,
    enhanceCodeSnippets,
    bindSnippetCopyButtons
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

    // Login wiring
    adminForm?.addEventListener('submit', onLoginSubmit);
    loginUsernameInput?.addEventListener('input', hideLoginError);
    loginPasswordInput?.addEventListener('input', hideLoginError);

    // Pagination controls
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
    window.addEventListener('keydown', handlePaginationHotkeys);

    // Counter creation controls
    createForm?.addEventListener('submit', handleCreateCounter);
    embedToggles.forEach((toggle) => {
      toggle.addEventListener('click', () =>
        setEmbedMode(toggle.dataset.embed || 'script')
      );
    });
    limitStartValueInput(createStartInput);

    // Counter filters.
    modeFilterSelect?.addEventListener('change', handleModeFilterChange);
    sortFilterSelect?.addEventListener('change', handleSortChange);
    ownerFilterToggle?.addEventListener('click', handleOwnerFilterToggle);
    adminCooldownSelect?.addEventListener('change', refreshAdminModeControls);
    counterSearchInput?.addEventListener('input', handleSearchInput);
    counterSearchInput?.addEventListener('search', handleSearchInput);
    counterSearchClear?.addEventListener('click', handleSearchClear);
    activityRangeControls?.addEventListener('click', handleActivityRangeClick);

    // Bulk actions
    deleteAllBtn?.addEventListener('click', handleDeleteAll);
    deleteFilteredBtn?.addEventListener('click', handleDeleteFiltered);
    selectAllBtn?.addEventListener('click', handleSelectAll);
    downloadSelectedBtn?.addEventListener('click', handleDownloadSelected);
    addTagsSelectedBtn?.addEventListener('click', handleAddTagsSelected);
    deleteSelectedBtn?.addEventListener('click', handleDeleteSelected);
    clearSelectionBtn?.addEventListener('click', () => clearSelection());

    // Tag controls
    tagFilterButton?.addEventListener('click', handleTagFilterToggle);
    const tagFilterLabel = tagFilterControls?.querySelector('span');
    tagFilterLabel?.addEventListener('click', handleTagFilterLabelClick);
    clearTagFilterBtn?.addEventListener('click', clearTagFilterSelection);
    tagFilterCreateBtn?.addEventListener('click', (event) => {
      event.stopPropagation();
      handleTagCreate('filter');
    });
    createTagManageBtn?.addEventListener('click', () =>
      handleTagCreate('create')
    );
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
    updateTagCounterHints();

    // Global document handlers
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleGlobalKeydown);
    document.addEventListener('click', () => {
      document
        .querySelectorAll('.counter-copy__menu.is-open')
        .forEach((menu) => {
          menu.classList.remove('is-open');
        });
    });
    window.addEventListener('pageshow', (event) => {
      if (event.persisted && hasSessionHint()) {
        checkSession();
      }
    });

    // Initial UI state
    toggleSearchClear();
    updateDeleteFilteredState();
    updateActivityRangeButtons();
    enhanceCodeSnippets();
    bindSnippetCopyButtons('.code-snippet .copy-button');

    // Session bootstrap
    if (hasSessionHint()) {
      setLoginPending(true, 'Checking your session...');
    } else {
      revealLoginCard();
    }
    setTimeout(() => {
      if (
        !state.user &&
        !hasSessionHint() &&
        loginCard?.classList.contains('hidden')
      ) {
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
  }

  return init();
}

export {
  ensurePickrLoaded,
  createDashboardBootstrapHelpers,
  initDashboardBootstrap
};
