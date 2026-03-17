/*
  dashboard/index.js

  Admin dashboard logic: login, list/manage counters, create counters, tags, and previews.
*/

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */
import { enhanceCodeSnippets, bindSnippetCopyButtons } from '../utils/snippets.js';
import {
  formatNumber,
  formatLastHit,
  truncateQuery,
  extractTagIds,
  slugifyFilename,
  resolveActivityLevel
} from './shared/helpers.js';
import { applyTagStyles, buildTagBadges } from './features/tags.js';
import { createDashboardTagManager } from './features/tagManager.js';
import { createDashboardSelection } from './features/selection.js';
import { createDashboardActions } from './features/actions.js';
import { createDashboardCounters } from './features/counters.js';
import { createDashboardSession } from './core/session.js';
import { createDashboardFilters } from './core/filters.js';
import { createDashboardData } from './core/data.js';
import { createDashboardRender } from './core/render.js';
import {
  ensurePickrLoaded,
  createDashboardBootstrapHelpers,
  initDashboardBootstrap
} from './core/bootstrap.js';
import { createDashboardAdminUi } from './features/adminUi.js';
import {
  showAlert,
  normalizeAuthMessage,
  buildUnauthorizedError,
  buildForbiddenError,
  assertAuthorizedResponse as assertAuthorizedResponseUi,
  showConfirm,
  showConfirmWithInput,
  showToast,
  showActionToast
} from './shared/ui.js';
import {
  authFetch,
  fetchRuntimeConfig,
  fetchSession,
  login as loginRequest
} from './shared/api.js';
import {
  loginCard,
  dashboardCard,
  adminForm,
  loginUsernameInput,
  loginPasswordInput,
  loginError,
  loginStatus,
  dashboardSubtitle,
  selectionToolbar,
  selectionCountEl,
  selectAllBtn,
  downloadSelectedBtn,
  addTagsSelectedBtn,
  deleteSelectedBtn,
  clearSelectionBtn,
  adminControls,
  counterListEl,
  deleteAllBtn,
  deleteFilteredBtn,
  paginationEl,
  prevPageBtn,
  nextPageBtn,
  paginationInfo,
  counterTotalValue,
  counterSearchInput,
  counterSearchClear,
  createForm,
  createLabelInput,
  createNoteInput,
  createStartInput,
  adminEmbedBlock,
  adminEmbedSnippetCode,
  adminEmbedSvgSnippetCode,
  embedToggles,
  embedPanels,
  embedDescs,
  createCard,
  adminCooldownSelect,
  adminPreview,
  adminPreviewTarget,
  modeFilterSelect,
  sortFilterSelect,
  activityRangeControls,
  adminThrottleHint,
  tagFilterControls,
  tagFilterButton,
  tagFilterMenu,
  tagFilterList,
  clearTagFilterBtn,
  tagFilterCreateBtn,
  createTagPicker,
  createTagManageBtn,
  createTagCounterHint,
  tagFilterCountHint,
  topPaginationInfo,
  ownerFilterWrap,
  ownerFilterToggle,
  themeHelper
} from './shared/dom.js';
import {
  RANGE_LABELS,
  TAG_LIMIT,
  START_VALUE_DIGIT_LIMIT,
  state,
  tagSelectorRegistry,
  loadOwnerFilterPreference,
  hasSessionHint,
  saveOwnerFilterPreference
} from './shared/state.js';

function setSessionEventUser(user) {
  document.dispatchEvent(new CustomEvent('voux:session-updated', { detail: { user } }));
}

const bootstrapHelpers = createDashboardBootstrapHelpers({
  state,
  START_VALUE_DIGIT_LIMIT,
  authFetch,
  buildUnauthorizedError,
  buildForbiddenError,
  assertAuthorizedResponseUi,
  setUserSession: (...args) => setUserSession(...args),
  embedToggles,
  embedPanels,
  embedDescs
});

const {
  ensureSessionForAction,
  assertAuthorizedResponse,
  canDangerOnCounter,
  readStartValue,
  setEmbedMode
} = bootstrapHelpers;

const renderManager = createDashboardRender({
  state,
  RANGE_LABELS,
  authFetch,
  assertAuthorizedResponse,
  showToast,
  adminPreview,
  adminPreviewTarget,
  getCounterDataOps: () => ({
    fetchCounters,
    applyCounterResponse
  })
});

const {
  getRangeStatLabel,
  getRangeStatValue,
  refreshCounters,
  renderAdminPreview,
  updateCounterMetadataRequest,
  copyEmbedSnippet,
  scheduleAutoRefresh,
  cancelAutoRefresh,
  changeEditPanelCount,
  applyAllowedModesToSelect,
  getFirstAllowedMode,
  normalizeAllowedModes,
  isModeAllowed
} = renderManager;

const tagManager = createDashboardTagManager({
  state,
  TAG_LIMIT,
  tagSelectorRegistry,
  authFetch,
  assertAuthorizedResponse,
  showAlert,
  showToast,
  normalizeAuthMessage,
  showConfirm,
  refreshCounters,
  ensurePickrLoaded,
  applyTagStyles,
  tagFilterControls,
  tagFilterButton,
  tagFilterMenu,
  tagFilterList,
  clearTagFilterBtn,
  createTagCounterHint,
  tagFilterCountHint
});

const {
  fetchTags,
  renderTagFilterList,
  updateTagFilterButton,
  handleTagFilterToggle,
  closeTagFilterMenu,
  handleTagFilterLabelClick,
  handleDocumentClick,
  handleGlobalKeydown,
  clearTagFilterSelection,
  updateTagCounterHints,
  setTagFilter,
  handleTagCreate,
  registerTagSelector,
  refreshTagSelectorEntry,
  refreshTagSelectors,
  cleanupTagSelectors,
  openBulkTagDialog
} = tagManager;

const adminUiManager = createDashboardAdminUi({
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
});

const {
  syncOwnerFilterToggle,
  updateCreateCardVisibility,
  updateDeleteFilteredState,
  updateAdminVisibility,
  refreshAdminModeControls,
  renderAdminThrottleHint
} = adminUiManager;

const sessionManager = createDashboardSession({
  state,
  hasSessionHint,
  loadOwnerFilterPreference,
  saveOwnerFilterPreference,
  fetchRuntimeConfig,
  fetchSession,
  loginRequest,
  themeHelper,
  loginCard,
  dashboardCard,
  adminForm,
  loginUsernameInput,
  loginPasswordInput,
  loginError,
  loginStatus,
  dashboardSubtitle,
  adminControls,
  adminEmbedBlock,
  adminEmbedSnippetCode,
  adminEmbedSvgSnippetCode,
  paginationEl,
  deleteAllBtn,
  showToast,
  renderTagFilterList,
  updateTagFilterButton,
  refreshTagSelectors,
  closeTagFilterMenu,
  syncOwnerFilterToggle,
  refreshCounters,
  fetchTags,
  updateAdminVisibility,
  updateCreateCardVisibility,
  refreshAdminModeControls,
  updateDeleteFilteredState,
  renderAdminThrottleHint,
  setEmbedMode,
  cancelAutoRefresh,
  setSessionEventUser
});

const {
  fetchConfig,
  checkSession,
  onLoginSubmit,
  showDashboard,
  hideDashboard,
  showLoginError,
  hideLoginError,
  setLoginLoading,
  setUserSession,
  setLoginPending,
  revealLoginCard,
  showStatusHint
} = sessionManager;

const selectionManager = createDashboardSelection({
  state,
  counterListEl,
  selectionToolbar,
  selectionCountEl,
  deleteSelectedBtn,
  downloadSelectedBtn,
  addTagsSelectedBtn,
  canDangerOnCounter,
  authFetch,
  assertAuthorizedResponse,
  showAlert,
  showConfirm,
  showToast,
  showActionToast,
  normalizeAuthMessage,
  refreshCounters,
  extractTagIds,
  openBulkTagDialog,
  updateCounterMetadataRequest,
  slugifyFilename
});

const {
  toggleSelection,
  clearSelection,
  refreshSelectionState,
  updateSelectionToolbar,
  handleDownloadSelected,
  handleAddTagsSelected,
  handleDownloadSingle,
  handleDeleteSelected,
  handleSelectAll
} = selectionManager;

const actionsManager = createDashboardActions({
  state,
  authFetch,
  assertAuthorizedResponse,
  showAlert,
  showConfirm,
  showConfirmWithInput,
  showToast,
  normalizeAuthMessage,
  refreshCounters,
  clearSelection,
  updateSelectionToolbar,
  ensureSessionForAction,
  readStartValue,
  createLabelInput,
  createNoteInput,
  createStartInput,
  adminCooldownSelect,
  isModeAllowed,
  getFirstAllowedMode,
  refreshTagSelectors,
  updateCounterMetadataRequest,
  renderAdminPreview,
  setEmbedMode,
  adminEmbedSnippetCode,
  adminEmbedSvgSnippetCode,
  adminEmbedBlock,
  deleteAllBtn,
  deleteFilteredBtn,
  counterListEl,
  updateDeleteFilteredState
});

const {
  handleDeleteAll,
  handleCreateCounter,
  removeCounter,
  handleDeleteFiltered
} = actionsManager;

const countersManager = createDashboardCounters({
  state,
  counterListEl,
  START_VALUE_DIGIT_LIMIT,
  truncateQuery,
  formatNumber,
  formatLastHit,
  extractTagIds,
  applyTagStyles,
  buildTagBadges,
  resolveActivityLevel,
  canDangerOnCounter,
  toggleSelection,
  copyEmbedSnippet,
  handleTagCreate,
  registerTagSelector,
  refreshTagSelectorEntry,
  changeEditPanelCount,
  showAlert,
  showToast,
  normalizeAuthMessage,
  updateCounterMetadataRequest,
  refreshCounters,
  handleDownloadSingle,
  removeCounter,
  updateSelectionToolbar,
  applyAllowedModesToSelect,
  adminCooldownSelect,
  getRangeLabel: getRangeStatLabel,
  getRangeValue: getRangeStatValue,
  cleanupTagSelectors
});

const {
  renderCounterList,
  canPatchCounters,
  patchCounterRows
} = countersManager;

const filtersManager = createDashboardFilters({
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
});

const {
  handleSearchInput,
  handleSearchClear,
  handleOwnerFilterToggle,
  handleModeFilterChange,
  handleSortChange,
  toggleSearchClear,
  handleActivityRangeClick,
  updateActivityRangeButtons,
  updatePagination,
  updateCounterTotal,
  handlePaginationHotkeys,
  handlePageNavigation
} = filtersManager;

const dataManager = createDashboardData({
  state,
  authFetch,
  buildUnauthorizedError,
  canPatchCounters,
  patchCounterRows,
  renderCounterList,
  updatePagination,
  updateCounterTotal,
  updateTagCounterHints,
  updateDeleteFilteredState,
  adminControls,
  counterListEl
});

const {
  applyCounterResponse,
  fetchCounters,
  updateCounterCache
} = dataManager;

document.addEventListener('DOMContentLoaded', () => {
  initDashboardBootstrap({
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
  });
});
