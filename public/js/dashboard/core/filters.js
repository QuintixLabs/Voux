/*
  dashboard/core/filters.js

  Search, filters, activity range, and pagination helpers.
*/

/* -------------------------------------------------------------------------- */
/* Filters manager                                                            */
/* -------------------------------------------------------------------------- */
function createDashboardFilters(deps) {
  const {
    state,
    counterSearchInput,
    counterSearchClear,
    ownerFilterToggle,
    modeFilterSelect,
    sortFilterSelect,
    activityRangeControls,
    paginationEl,
    paginationInfo,
    prevPageBtn,
    nextPageBtn,
    topPaginationInfo,
    counterTotalValue,
    saveOwnerFilterPreference,
    refreshCounters,
    renderCounterList,
    updateDeleteFilteredState,
    handleSelectAll
  } = deps;

  let searchDebounce = null;

/* -------------------------------------------------------------------------- */
/* Search + owner filters                                                     */
/* -------------------------------------------------------------------------- */
function handleSearchInput() {
    if (!counterSearchInput) return;
    toggleSearchClear();
    const value = counterSearchInput.value.trim().slice(0, 80);
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      if (value === state.searchQuery) return;
      state.searchQuery = value;
      if (state.user) {
        refreshCounters(1);
      }
    }, 250);
  }

  function handleSearchClear() {
    if (!counterSearchInput) return;
    counterSearchInput.value = '';
    toggleSearchClear();
    if (!state.searchQuery) return;
    state.searchQuery = '';
    if (state.user) {
      refreshCounters(1);
    }
  }

  function handleOwnerFilterToggle() {
    if (!state.isAdmin) return;
    state.ownerOnly = !state.ownerOnly;
    saveOwnerFilterPreference(state.ownerOnly);
    syncOwnerFilterToggle();
    if (state.user) {
      refreshCounters(1);
    }
  }

  function syncOwnerFilterToggle() {
    if (!ownerFilterToggle) return;
    ownerFilterToggle.setAttribute('aria-pressed', state.ownerOnly ? 'true' : 'false');
  }

  function handleModeFilterChange() {
    if (!modeFilterSelect) return;
    state.modeFilter = modeFilterSelect.value;
    updateDeleteFilteredState();
    if (state.user) {
      refreshCounters(1);
    }
  }

  function handleSortChange() {
    if (!sortFilterSelect) return;
    state.sort = sortFilterSelect.value || 'newest';
    if (state.user) {
      refreshCounters(1);
    }
  }

  function toggleSearchClear() {
    if (!counterSearchClear || !counterSearchInput) return;
    counterSearchClear.classList.toggle('hidden', counterSearchInput.value.trim().length === 0);
  }

/* -------------------------------------------------------------------------- */
/* Activity range + totals                                                    */
/* -------------------------------------------------------------------------- */
function handleActivityRangeClick(event) {
    const button = event.target.closest('button[data-range]');
    if (!button) return;
    const range = button.dataset.range;
    if (!range || range === state.activityRange) return;
    state.activityRange = range;
    updateActivityRangeButtons();
    renderCounterList(state.latestCounters);
  }

  function updateActivityRangeButtons() {
    if (!activityRangeControls) return;
    const buttons = activityRangeControls.querySelectorAll('button[data-range]');
    buttons.forEach((button) => {
      const isActive = button.dataset.range === state.activityRange;
      button.classList.toggle('activity-range__button--active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function updatePagination() {
    if (!paginationEl || !paginationInfo || !prevPageBtn || !nextPageBtn) return;
    if (state.totalPages <= 1) {
      paginationEl.classList.add('hidden');
      if (topPaginationInfo) topPaginationInfo.classList.add('hidden');
      return;
    }
    paginationEl.classList.remove('hidden');
    paginationInfo.textContent = `Page ${state.page} / ${state.totalPages}`;
    if (topPaginationInfo) {
      topPaginationInfo.textContent = `Page ${state.page} / ${state.totalPages}`;
      topPaginationInfo.classList.remove('hidden');
    }
    prevPageBtn.disabled = state.page <= 1;
    nextPageBtn.disabled = state.page >= state.totalPages;
  }

  function updateCounterTotal() {
    if (!counterTotalValue) return;
    const total = Math.max(0, Number(state.total) || 0);
    counterTotalValue.textContent = total.toLocaleString();
  }

/* -------------------------------------------------------------------------- */
/* Pagination controls                                                        */
/* -------------------------------------------------------------------------- */
function handlePaginationHotkeys(event) {
    const { activeElement } = document;
    if (activeElement) {
      const tag = activeElement.tagName;
      const type = (activeElement.getAttribute('type') || '').toLowerCase();
      const isTextInput =
        tag === 'TEXTAREA' || (tag === 'INPUT' && ['text', 'search', 'password', 'email', 'url', 'number'].includes(type));
      if (isTextInput) return;
    }
    const keepScroll = () => {
      const top = window.scrollY;
      requestAnimationFrame(() => window.scrollTo({ top, left: 0, behavior: 'auto' }));
    };
    if (event.key === 'ArrowLeft' && !prevPageBtn?.disabled) {
      event.preventDefault();
      handlePageNavigation(Math.max(1, state.page - 1), { skipScroll: true });
      keepScroll();
    }
    if (event.key === 'ArrowRight' && !nextPageBtn?.disabled) {
      event.preventDefault();
      handlePageNavigation(Math.min(state.totalPages, state.page + 1), { skipScroll: true });
      keepScroll();
    }
    if (event.shiftKey && (event.key === 'A' || event.key === 'a')) {
      event.preventDefault();
      handleSelectAll();
    }
  }

  async function handlePageNavigation(nextPage, options = {}) {
    try {
      await refreshCounters(nextPage);
      if (!options.skipScroll) {
        ensurePaginationInView();
      }
    } catch (error) {
      console.warn('Page change failed', error);
    }
  }

  function ensurePaginationInView() {
    if (!paginationEl) return;
    const rect = paginationEl.getBoundingClientRect();
    const inView = rect.top >= 0 && rect.bottom <= window.innerHeight;
    if (!inView) {
      paginationEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  return {
    handleSearchInput,
    handleSearchClear,
    handleOwnerFilterToggle,
    syncOwnerFilterToggle,
    handleModeFilterChange,
    handleSortChange,
    toggleSearchClear,
    handleActivityRangeClick,
    updateActivityRangeButtons,
    updatePagination,
    updateCounterTotal,
    handlePaginationHotkeys,
    handlePageNavigation
  };
}

export { createDashboardFilters };
