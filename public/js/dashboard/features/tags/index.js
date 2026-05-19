/*
  public/js/dashboard/features/tags/index.js

  Tag filters, CRUD, selectors, and tag dialogs.
*/

import {
  applyTagStyles,
  createTagSelectorHelpers
} from './render/selectors.js';
import { createTagDialogHelpers } from './actions/dialogs.js';
import { createTagFilterHelpers } from './actions/filters.js';
import { createTagCatalogHelpers } from './updates/catalog.js';

/* -------------------------------------------------------------------------- */
/* Tag manager                                                                */
/* -------------------------------------------------------------------------- */
function createDashboardTagManager(deps) {
  const {
    // State
    state,
    TAG_LIMIT,
    tagSelectorRegistry,

    // Requests + auth
    authFetch,
    assertAuthorizedResponse,

    // Feedback
    showAlert,
    showToast,
    normalizeAuthMessage,
    showConfirm,

    // Counter data
    refreshCounters,

    // Tag UI helpers
    ensurePickrLoaded,

    // Tag filter controls
    tagFilterControls,
    tagFilterButton,
    tagFilterMenu,
    tagFilterList,
    clearTagFilterBtn,

    // Tag count hints
    createTagCounterHint,
    tagFilterCountHint
  } = deps;

  let dialogActions = null;
  let tagCatalogActions = null;
  let tagFilterActions = null;

  function openTagEditDialog(...args) {
    return dialogActions?.openTagEditDialog(...args);
  }

  function confirmTagDeletion(...args) {
    return dialogActions?.confirmTagDeletion(...args);
  }

  function handleTagContextMenu(...args) {
    return dialogActions?.handleTagContextMenu(...args);
  }

  function updateTagRequest(...args) {
    return tagCatalogActions?.updateTagRequest(...args);
  }

  function deleteTagRequest(...args) {
    return tagCatalogActions?.deleteTagRequest(...args);
  }

  function updateTagCounterHints(...args) {
    return tagFilterActions?.updateTagCounterHints(...args);
  }

  const {
    // Tag selector registry
    registerTagSelector,
    refreshTagSelectorEntry,
    refreshTagSelectors,
    cleanupTagSelectors
  } = createTagSelectorHelpers({
    // Shared state
    state,
    tagSelectorRegistry,

    // Tag UI helpers
    applyTagStyles,

    // Tag actions
    openTagEditDialog,
    confirmTagDeletion,
    handleTagContextMenu
  });

  const {
    // Tag dialogs
    openTagDialog,
    openBulkTagDialog,
    openTagEditDialog: openTagEditDialogAction,
    confirmTagDeletion: confirmTagDeletionAction,
    handleTagContextMenu: handleTagContextMenuAction
  } = createTagDialogHelpers({
    // Shared state
    state,

    // Feedback
    showConfirm,

    // Tag limits
    TAG_LIMIT,

    // Tag UI helpers
    ensurePickrLoaded,

    // Tag selector helpers
    registerTagSelector,
    refreshTagSelectorEntry,

    // Tag requests
    updateTagRequest,
    deleteTagRequest,

    // Tag sync
    updateTagCounterHints
  });
  dialogActions = {
    openTagEditDialog: openTagEditDialogAction,
    confirmTagDeletion: confirmTagDeletionAction,
    handleTagContextMenu: handleTagContextMenuAction
  };

  const {
    // Tag filter UI
    renderTagFilterList,
    updateTagFilterButton,
    handleTagFilterToggle,
    closeTagFilterMenu,
    handleTagFilterLabelClick,
    handleDocumentClick,
    handleGlobalKeydown,
    clearTagFilterSelection,
    updateTagCounterHints: updateTagCounterHintsAction,
    setTagFilter
  } = createTagFilterHelpers({
    // Shared state
    state,
    TAG_LIMIT,

    // Counter data
    refreshCounters,

    // Tag UI helpers
    applyTagStyles,

    // Tag filter controls
    tagFilterControls,
    tagFilterButton,
    tagFilterMenu,
    tagFilterList,
    clearTagFilterBtn,

    // Tag count hints
    createTagCounterHint,
    tagFilterCountHint,

    // Tag actions
    openTagEditDialog,
    confirmTagDeletion,
    handleTagContextMenu
  });
  tagFilterActions = {
    updateTagCounterHints: updateTagCounterHintsAction
  };

  const {
    // Tag requests
    fetchTags,
    createTagRequest,
    updateTagRequest: updateTagRequestAction,
    deleteTagRequest: deleteTagRequestAction
  } = createTagCatalogHelpers({
      // Shared state
      state,

      // Feedback
      normalizeAuthMessage,
      showAlert,
      showToast,

      // Requests + auth
      authFetch,
      assertAuthorizedResponse,

      // Counter data
      refreshCounters,

      // Tag UI refresh
      refreshTagSelectors,
      renderTagFilterList,
      updateTagCounterHints,
      updateTagFilterButton
    });
  tagCatalogActions = {
    updateTagRequest: updateTagRequestAction,
    deleteTagRequest: deleteTagRequestAction
  };


/* -------------------------------------------------------------------------- */
/* Tag create/edit/delete                                                     */
/* -------------------------------------------------------------------------- */
async function handleTagCreate(context) {
  if (state.tags.length >= TAG_LIMIT) {
    await showAlert(
      `You can only create up to ${TAG_LIMIT} tags. Delete an existing tag first.`,
      {
        title: 'Tag limit reached'
      }
    );
    return;
  }
  
  if (context !== 'filter') {
    closeTagFilterMenu();
  }
  const result = await openTagDialog(
    state.tags.length,
    state.totalOverall || state.total || 0
  );

  if (!result || !result.name) return;
  const created = await createTagRequest(result);
  if (!created) return;

  const createdTagId = created.id || null;
  if (
    context === 'create' &&
    createdTagId &&
    !state.createTags.includes(createdTagId)
  ) {
    state.createTags = [...state.createTags, createdTagId];
    refreshTagSelectors();
  }
}

  return {
    // Tag filter UI
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

    // Tag CRUD
    handleTagCreate,

    // Tag selector registry
    registerTagSelector,
    refreshTagSelectorEntry,
    refreshTagSelectors,
    cleanupTagSelectors,

    // Tag dialogs
    openBulkTagDialog
  };
}

export { createDashboardTagManager };
