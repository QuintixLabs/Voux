/*
  public/js/dashboard/features/counters/index.js

  Renders the list, wires row helpers together, and handles row patching.
*/

import {
  applyNoteMarkdown,
  attachNoteMarkdownPasteBehavior
} from '../../../utils/markdown.js';
import { createCounterRowPatcher } from './updates/patch.js';
import { createCounterRowHelpers } from './render/row.js';
import { createCounterMetaHelpers } from './render/meta.js';
import { createCounterEditHandlers } from './actions/edit.js';

/* -------------------------------------------------------------------------- */
/* Counters manager                                                           */
/* -------------------------------------------------------------------------- */
function createDashboardCounters(deps) {
  const {
    // State
    state,
    counterListEl,
    START_VALUE_DIGIT_LIMIT,

    // Counter formatting
    truncateQuery,
    formatNumber,
    formatLastHit,
    extractTagIds,
    buildTagBadges,
    resolveActivityLevel,

    // Counter actions
    canDangerOnCounter,
    toggleSelection,
    copyEmbedSnippet,
    handleTagCreate,
    registerTagSelector,
    refreshTagSelectorEntry,
    changeEditPanelCount,

    // Feedback + auth
    showAlert,
    showToast,
    normalizeAuthMessage,
    updateCounterMetadataRequest,

    // Counter data
    refreshCounters,
    handleDownloadSingle,
    removeCounter,
    updateSelectionToolbar,

    // Mode controls
    applyAllowedModesToSelect,
    adminCooldownSelect,

    // Activity stats
    getRangeLabel,
    getRangeValue,

    // Cleanup
    cleanupTagSelectors
  } = deps;

  const {
    // Meta builders
    buildCounterMetaBlocks,
    appendCounterMetaContent,

    // Status + activity
    buildStatusBadges,
    buildActivityBlock
  } = createCounterMetaHelpers({
    // Counter formatting
    formatNumber,
    formatLastHit,
    resolveActivityLevel,
    getRangeLabel,
    getRangeValue,

    // Counter UI helpers
    copyEmbedSnippet,
    buildTagBadges,
    applyNoteMarkdown,

    // Shared state
    state
  });

  const { createCounterRowElement } = createCounterRowHelpers({
    // Input helpers
    START_VALUE_DIGIT_LIMIT,
    attachNoteMarkdownPasteBehavior,

    // Tag helpers
    handleTagCreate,
    registerTagSelector,
    extractTagIds,

    // Shared state
    state,

    // Counter actions
    handleDownloadSingle,
    removeCounter,
    canDangerOnCounter,
    toggleSelection,

    // Meta builders
    buildCounterMetaBlocks,
    appendCounterMetaContent,
    buildStatusBadges,
    buildActivityBlock
  });

  const { attachCounterEditBehavior } = createCounterEditHandlers({
    // Shared state
    state,

    // Input helpers
    START_VALUE_DIGIT_LIMIT,

    // Tag helpers
    extractTagIds,
    refreshTagSelectorEntry,

    // Edit UI state
    changeEditPanelCount,

    // Requests + feedback
    updateCounterMetadataRequest,
    showAlert,
    showToast,
    normalizeAuthMessage,

    // Counter refresh
    refreshCounters
  });

/* -------------------------------------------------------------------------- */
/* Row render pipeline                                                        */
/* -------------------------------------------------------------------------- */
function renderCounterList(counters = state.latestCounters) {
  if (!counterListEl) return;
  cleanupTagSelectors();

  const list = Array.isArray(counters) ? counters : [];
  state.editPanelsOpen = 0;
  counterListEl.innerHTML = '';

  if (!list.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = state.searchQuery
      ? `No counters match "${truncateQuery(state.searchQuery)}".`
      : state.tagFilter.length ||
          state.modeFilter !== 'all' ||
          state.inactiveOnly
        ? 'No counters match the current filters.'
        : 'No counters yet.';
    counterListEl.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  list.forEach((counter) => {
    const rowEntry = createCounterRowElement(counter);
    attachCounterEditBehavior(counter, rowEntry);
    fragment.appendChild(rowEntry.row);
  });
  counterListEl.appendChild(fragment);
  updateSelectionToolbar();
}

const { canPatchCounters, patchCounterRows } = createCounterRowPatcher({
  // Shared state
  counterListEl,
  state,

  // Counter formatting
  formatNumber,
  formatLastHit,
  getRangeLabel,
  getRangeValue,

  // Counter UI helpers
  buildTagBadges,
  applyNoteMarkdown
});

// mode select helpers
function refreshModeControls() {
  if (!adminCooldownSelect) return;
  applyAllowedModesToSelect(adminCooldownSelect, state.allowedModes);
}

return {
  // List rendering
  renderCounterList,

  // Row patching
  canPatchCounters,
  patchCounterRows,

  // Mode controls
  refreshModeControls
};
}

export { createDashboardCounters };
