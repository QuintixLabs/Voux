/*
  dashboard/index.js

  Admin dashboard logic: login, list/manage counters, create counters, tags, and previews.
*/

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */
import {
  enhanceCodeSnippets,
  bindSnippetCopyButtons
} from '../utils/snippets.js';
import { attachNoteMarkdownPasteBehavior } from '../utils/markdown.js';
import {
  // Formatting helpers
  formatNumber,
  formatLastHit,
  truncateQuery,
  slugifyFilename,

  // Counter helpers
  extractTagIds,
  resolveActivityLevel
} from './shared/helpers.js';

import {
  // Alert + confirm helpers
  showAlert,
  showConfirm,
  showConfirmWithInput,

  // Toast helpers
  showToast,
  showActionToast,

  // Auth UI helpers
  normalizeAuthMessage,
  buildUnauthorizedError,
  buildForbiddenError,
  assertAuthorizedResponse as assertAuthorizedResponseUi
} from './shared/ui.js';

import {
  // Session + auth requests
  authFetch,
  fetchRuntimeConfig,
  fetchSession,
  login as loginRequest
} from './shared/api.js';

import {
  // Login UI
  loginCard,
  dashboardCard,
  adminForm,
  loginUsernameInput,
  loginPasswordInput,
  loginRememberDeviceInput,
  loginError,
  loginStatus,
  dashboardSubtitle,

  // Selection UI
  selectionToolbar,
  selectionCountEl,
  selectAllBtn,
  downloadSelectedBtn,
  addTagsSelectedBtn,
  deleteSelectedBtn,
  clearSelectionBtn,

  // Counter list UI
  adminControls,
  counterListEl,
  deleteAllBtn,
  deleteFilteredBtn,
  paginationEl,
  prevPageBtn,
  nextPageBtn,
  paginationInfo,
  topPaginationInfo,
  counterTotalValue,

  // Counter filter UI
  counterSearchInput,
  counterSearchClear,
  modeFilterSelect,
  sortFilterSelect,
  activityRangeControls,
  ownerFilterWrap,
  ownerFilterToggle,
  adminCooldownSelect,
  adminThrottleHint,

  // Counter creation UI
  createForm,
  createLabelInput,
  createNoteInput,
  createStartInput,
  createCard,
  createTagPicker,
  createTagManageBtn,

  // Embed UI
  adminEmbedBlock,
  adminEmbedSnippetCode,
  adminEmbedSvgSnippetCode,
  embedToggles,
  embedPanels,
  embedDescs,
  adminPreview,
  adminPreviewTarget,

  // Tag filter UI
  tagFilterControls,
  tagFilterButton,
  tagFilterMenu,
  tagFilterList,
  clearTagFilterBtn,
  tagFilterCreateBtn,
  createTagCounterHint,
  tagFilterCountHint,

  // Shared UI helpers
  themeHelper
} from './shared/dom.js';

import {
  // Shared state
  state,
  tagSelectorRegistry,

  // Limits + labels
  RANGE_LABELS,
  TAG_LIMIT,
  START_VALUE_DIGIT_LIMIT,

  // Preference helpers
  loadOwnerFilterPreference,
  hasSessionHint,
  saveOwnerFilterPreference
} from './shared/state.js';

// Dashboard feature modules
import { applyTagStyles, buildTagBadges } from './features/tags.js';
import { createDashboardTagManager } from './features/tagManager.js';
import { createDashboardSelection } from './features/selection.js';
import { createDashboardActions } from './features/actions.js';
import { createDashboardCounters } from './features/counters.js';
import { createDashboardAdminUi } from './features/adminUi.js';

// Dashboard core modules
import { createDashboardSession } from './core/session.js';
import { createDashboardFilters } from './core/filters.js';
import { createDashboardData } from './core/data.js';
import { createDashboardRender } from './core/render.js';
import {
  ensurePickrLoaded,
  createDashboardBootstrapHelpers,
  initDashboardBootstrap
} from './core/bootstrap.js';

function setSessionEventUser(user) {
  document.dispatchEvent(
    new CustomEvent('voux:session-updated', { detail: { user } })
  );
}

/* -------------------------------------------------------------------------- */
/* Shared bootstrap helpers                                                   */
/* -------------------------------------------------------------------------- */
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

attachNoteMarkdownPasteBehavior(createNoteInput);

/* -------------------------------------------------------------------------- */
/* Render manager                                                             */
/* -------------------------------------------------------------------------- */
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
  cancelAutoRefresh,
  changeEditPanelCount,
  applyAllowedModesToSelect,
  getFirstAllowedMode,
  isModeAllowed
} = renderManager;

/* -------------------------------------------------------------------------- */
/* Tag manager                                                               */
/* -------------------------------------------------------------------------- */
const tagManager = createDashboardTagManager({
  state,
  TAG_LIMIT,
  tagSelectorRegistry,

  // Tag requests
  authFetch,
  assertAuthorizedResponse,
  refreshCounters,
  ensurePickrLoaded,

  // Tag feedback
  showAlert,
  showToast,
  normalizeAuthMessage,
  showConfirm,

  // Tag UI
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
  handleTagCreate,
  registerTagSelector,
  refreshTagSelectorEntry,
  refreshTagSelectors,
  cleanupTagSelectors,
  openBulkTagDialog
} = tagManager;

/* -------------------------------------------------------------------------- */
/* Admin UI manager                                                          */
/* -------------------------------------------------------------------------- */
const adminUiManager = createDashboardAdminUi({
  state,

  // Filter controls
  modeFilterSelect,
  sortFilterSelect,
  ownerFilterWrap,
  adminCooldownSelect,

  // Danger controls
  deleteFilteredBtn,
  deleteAllBtn,
  deleteSelectedBtn,

  // Tag controls
  tagFilterCreateBtn,
  createTagManageBtn,

  // Create + embed UI
  adminThrottleHint,
  createCard,
  adminEmbedBlock,
  adminEmbedSnippetCode,
  adminEmbedSvgSnippetCode,
  setEmbedMode,

  // Shared helpers
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

/* -------------------------------------------------------------------------- */
/* Session manager                                                           */
/* -------------------------------------------------------------------------- */
const sessionManager = createDashboardSession({
  state,
  hasSessionHint,

  // Session requests
  fetchRuntimeConfig,
  fetchSession,
  loginRequest,
  setSessionEventUser,

  // Session persistence
  loadOwnerFilterPreference,
  saveOwnerFilterPreference,
  cancelAutoRefresh,

  // Login UI
  themeHelper,
  loginCard,
  dashboardCard,
  adminForm,
  loginUsernameInput,
  loginPasswordInput,
  loginRememberDeviceInput,
  loginError,
  loginStatus,
  dashboardSubtitle,

  // Dashboard shell
  adminControls,
  adminEmbedBlock,
  adminEmbedSnippetCode,
  adminEmbedSvgSnippetCode,
  paginationEl,
  deleteAllBtn,

  // Tag state sync
  renderTagFilterList,
  updateTagFilterButton,
  refreshTagSelectors,
  closeTagFilterMenu,
  fetchTags,

  // Dashboard state sync
  syncOwnerFilterToggle,
  refreshCounters,
  updateAdminVisibility,
  updateCreateCardVisibility,
  refreshAdminModeControls,
  updateDeleteFilteredState,
  renderAdminThrottleHint,
  setEmbedMode
});

const {
  fetchConfig,
  checkSession,
  onLoginSubmit,
  hideLoginError,
  setUserSession,
  setLoginPending,
  revealLoginCard
} = sessionManager;

/* -------------------------------------------------------------------------- */
/* Selection manager                                                         */
/* -------------------------------------------------------------------------- */
const selectionManager = createDashboardSelection({
  state,

  // Selection UI
  counterListEl,
  selectionToolbar,
  selectionCountEl,
  deleteSelectedBtn,
  downloadSelectedBtn,
  addTagsSelectedBtn,

  // Access + requests
  canDangerOnCounter,
  authFetch,
  assertAuthorizedResponse,
  refreshCounters,
  updateCounterMetadataRequest,

  // Selection actions
  extractTagIds,
  openBulkTagDialog,
  slugifyFilename,

  // Selection feedback
  showAlert,
  showConfirm,
  showToast,
  showActionToast,
  normalizeAuthMessage
});

const {
  toggleSelection,
  clearSelection,
  updateSelectionToolbar,
  handleDownloadSelected,
  handleAddTagsSelected,
  handleDownloadSingle,
  handleDeleteSelected,
  handleSelectAll
} = selectionManager;

/* -------------------------------------------------------------------------- */
/* Actions manager                                                           */
/* -------------------------------------------------------------------------- */
const actionsManager = createDashboardActions({
  state,

  // Requests + auth
  authFetch,
  assertAuthorizedResponse,
  ensureSessionForAction,
  refreshCounters,
  updateCounterMetadataRequest,

  // Feedback
  showAlert,
  showConfirm,
  showConfirmWithInput,
  showToast,
  normalizeAuthMessage,

  // Selection sync
  clearSelection,
  updateSelectionToolbar,
  updateDeleteFilteredState,

  // Create counter controls
  readStartValue,
  createLabelInput,
  createNoteInput,
  createStartInput,
  adminCooldownSelect,
  isModeAllowed,
  getFirstAllowedMode,
  refreshTagSelectors,

  // Embed preview UI
  renderAdminPreview,
  setEmbedMode,
  adminEmbedSnippetCode,
  adminEmbedSvgSnippetCode,
  adminEmbedBlock,

  // Counter list UI
  deleteAllBtn,
  deleteFilteredBtn,
  counterListEl
});

const {
  handleDeleteAll,
  handleCreateCounter,
  removeCounter,
  handleDeleteFiltered
} = actionsManager;

/* -------------------------------------------------------------------------- */
/* Counters manager                                                          */
/* -------------------------------------------------------------------------- */
const countersManager = createDashboardCounters({
  state,
  counterListEl,
  START_VALUE_DIGIT_LIMIT,

  // Formatting helpers
  truncateQuery,
  formatNumber,
  formatLastHit,
  extractTagIds,
  resolveActivityLevel,

  // Tag helpers
  applyTagStyles,
  buildTagBadges,
  handleTagCreate,
  registerTagSelector,
  refreshTagSelectorEntry,
  cleanupTagSelectors,

  // Counter actions
  canDangerOnCounter,
  toggleSelection,
  copyEmbedSnippet,
  changeEditPanelCount,
  updateCounterMetadataRequest,
  refreshCounters,
  handleDownloadSingle,
  removeCounter,
  updateSelectionToolbar,

  // Counter feedback
  showAlert,
  showToast,
  normalizeAuthMessage,

  // Mode + range controls
  applyAllowedModesToSelect,
  adminCooldownSelect,
  getRangeLabel: getRangeStatLabel,
  getRangeValue: getRangeStatValue
});

const { renderCounterList, canPatchCounters, patchCounterRows } =
  countersManager;

/* -------------------------------------------------------------------------- */
/* Filters manager                                                           */
/* -------------------------------------------------------------------------- */
const filtersManager = createDashboardFilters({
  state,

  // Search + filter controls
  counterSearchInput,
  counterSearchClear,
  ownerFilterToggle,
  modeFilterSelect,
  sortFilterSelect,
  activityRangeControls,

  // Pagination UI
  paginationEl,
  paginationInfo,
  prevPageBtn,
  nextPageBtn,
  topPaginationInfo,
  counterTotalValue,

  // Filter state sync
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

/* -------------------------------------------------------------------------- */
/* Data manager                                                              */
/* -------------------------------------------------------------------------- */
const dataManager = createDashboardData({
  state,

  // Data requests
  authFetch,
  buildUnauthorizedError,

  // Counter rendering
  canPatchCounters,
  patchCounterRows,
  renderCounterList,

  // Pagination + totals
  updatePagination,
  updateCounterTotal,
  updateTagCounterHints,
  updateDeleteFilteredState,

  // Dashboard shell
  adminControls,
  counterListEl
});

const { applyCounterResponse, fetchCounters } = dataManager;

/* -------------------------------------------------------------------------- */
/* Dashboard bootstrap                                                       */
/* -------------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  initDashboardBootstrap({
    state,
    START_VALUE_DIGIT_LIMIT,

    // Login controls
    adminForm,
    loginCard,
    loginUsernameInput,
    loginPasswordInput,
    hasSessionHint,
    onLoginSubmit,
    hideLoginError,
    setLoginPending,
    revealLoginCard,

    // Counter creation controls
    createForm,
    createStartInput,
    createTagPicker,
    createTagManageBtn,
    embedToggles,
    handleCreateCounter,
    registerTagSelector,
    handleTagCreate,
    setEmbedMode,

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

    // Bulk actions
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
  });
});
