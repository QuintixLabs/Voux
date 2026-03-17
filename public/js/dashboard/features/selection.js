/*
  dashboard/features/selection.js

  Selection state and bulk counter actions.
*/

/* -------------------------------------------------------------------------- */
/* Selection manager                                                          */
/* -------------------------------------------------------------------------- */
function createDashboardSelection(deps) {
  const {
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
  } = deps;

/* -------------------------------------------------------------------------- */
/* Selection state updates                                                    */
/* -------------------------------------------------------------------------- */
function toggleSelection(counterId, selected, row) {
    if (!counterId) return;
    if (selected && !canDangerOnCounter(state.counterCache?.get(counterId))) {
      return;
    }
    if (selected) {
      state.selectedIds.add(counterId);
    } else {
      state.selectedIds.delete(counterId);
    }
    if (row) {
      row.classList.toggle('counter-row--selected', selected);
    }
    updateSelectionToolbar();
  }

  function clearSelection() {
    if (!state.selectedIds.size) {
      refreshSelectionState();
      return;
    }
    state.selectedIds.clear();
    refreshSelectionState();
  }

  function refreshSelectionState() {
    const invalidIds = [];
    state.selectedIds.forEach((id) => {
      if (!canDangerOnCounter(state.counterCache?.get(id))) {
        invalidIds.push(id);
      }
    });
    if (invalidIds.length) {
      invalidIds.forEach((id) => state.selectedIds.delete(id));
    }
    if (counterListEl) {
      counterListEl.querySelectorAll('.counter-row').forEach((row) => {
        const counterId = row.dataset?.counterId;
        const selected = counterId && state.selectedIds.has(counterId);
        row.classList.toggle('counter-row--selected', selected);
        const checkbox = row.querySelector('.counter-select input');
        if (checkbox) {
          checkbox.checked = Boolean(selected);
        }
      });
    }
    updateSelectionToolbar();
  }

  function updateSelectionToolbar() {
    const count = state.selectedIds.size;
    if (selectionCountEl) {
      selectionCountEl.textContent = `${count} selected`;
    }
    const active = count > 0;
    selectionToolbar?.classList.toggle('hidden', !active);
    document.body.classList.toggle('selection-active', active);
  }

/* -------------------------------------------------------------------------- */
/* Bulk download/tag/delete actions                                           */
/* -------------------------------------------------------------------------- */
async function handleDownloadSelected() {
    const ids = Array.from(state.selectedIds).filter((id) => canDangerOnCounter(state.counterCache?.get(id)));
    if (!ids.length) {
      await showAlert('Select at least one counter.');
      return;
    }
    if (downloadSelectedBtn) downloadSelectedBtn.disabled = true;
    try {
      await downloadCountersByIds(ids, 'selected-counters');
    } finally {
      if (downloadSelectedBtn) downloadSelectedBtn.disabled = false;
    }
  }

  async function handleAddTagsSelected() {
    const ids = Array.from(state.selectedIds);
    const allowedIds = ids.filter((id) => canDangerOnCounter(state.counterCache?.get(id)));
    const skippedCount = ids.length - allowedIds.length;
    if (!ids.length) {
      await showAlert('Select at least one counter.');
      return;
    }
    if (!allowedIds.length) {
      await showAlert("You don't have permission to do that.");
      return;
    }
    if (!state.tags.length) {
      await showAlert('Create a tag first.');
      return;
    }
    const undoSnapshot = new Map();
    ids.forEach((id) => {
      const cached = state.counterCache?.get(id);
      if (cached) {
        undoSnapshot.set(id, extractTagIds(cached.tags));
      }
    });
    if (addTagsSelectedBtn) addTagsSelectedBtn.disabled = true;
    const selectedTags = await openBulkTagDialog(ids.length);
    if (addTagsSelectedBtn) addTagsSelectedBtn.disabled = false;
    if (!selectedTags) return;
    if (!selectedTags.length) {
      await showAlert('Pick at least one tag.');
      return;
    }
    let updated = 0;
    let skipped = 0;
    let lastError = null;
    const updatedIds = [];
    const nextTagObjects = state.tags.filter((tag) => selectedTags.includes(tag.id));
    for (const id of allowedIds) {
      try {
        await updateCounterMetadataRequest(id, { tags: selectedTags });
        updated += 1;
        updatedIds.push(id);
        const cached = state.counterCache?.get(id);
        if (cached) {
          cached.tags = nextTagObjects.slice();
        }
      } catch (error) {
        if (error?.message === 'forbidden' || error?.message === 'admin_permission_denied') {
          skipped += 1;
        } else {
          lastError = error;
        }
      }
    }
    await refreshCounters(state.page);
    if (updated) {
      const message =
        `Updated tags for ${updated} counter${updated === 1 ? '' : 's'}` +
        (skipped || skippedCount ? ` · ${skipped + skippedCount} skipped` : '');
      showActionToast(message, 'Undo', async () => {
        let reverted = 0;
        let failed = 0;
        for (const id of updatedIds) {
          const previous = undoSnapshot.get(id);
          if (!previous) {
            failed += 1;
            continue;
          }
          try {
            await updateCounterMetadataRequest(id, { tags: previous });
            reverted += 1;
            const cached = state.counterCache?.get(id);
            if (cached) {
              cached.tags = state.tags.filter((tag) => previous.includes(tag.id));
            }
          } catch {
            failed += 1;
          }
        }
        await refreshCounters(state.page);
        if (reverted) {
          showToast(`Reverted tags for ${reverted} counter${reverted === 1 ? '' : 's'}`);
        }
        if (failed) {
          showToast(`Could not revert ${failed} counter${failed === 1 ? '' : 's'}`, 'danger');
        }
      });
    }
    if (lastError) {
      await showAlert(normalizeAuthMessage(lastError, 'Failed to update tags'));
    } else if (!updated && (skipped + skippedCount)) {
      showToast(
        `${skipped + skippedCount} counter${skipped + skippedCount === 1 ? '' : 's'} skipped (no permission).`
      );
    }
  }

/* -------------------------------------------------------------------------- */
/* Single/bulk JSON export                                                    */
/* -------------------------------------------------------------------------- */
async function handleDownloadSingle(id, label, button) {
    if (!id) return;
    if (button) button.disabled = true;
    try {
      await downloadCountersByIds([id], `counter-${slugifyFilename(label || id)}`);
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function downloadCountersByIds(ids, filenamePrefix) {
    if (!ids.length) return;
    try {
      const res = await authFetch('/api/counters/export-selected', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ids })
      });
      await assertAuthorizedResponse(res);
      if (res.status === 404) {
        throw new Error('Counters not found.');
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to download counters');
      }
      const payload = await res.json();
      triggerJsonDownload(payload, filenamePrefix || 'counters');
      showToast(ids.length === 1 ? `Exported ${ids[0]}` : `Exported ${ids.length} counters`);
    } catch (error) {
      await showAlert(normalizeAuthMessage(error, 'Failed to download counters'));
    }
  }

  function triggerJsonDownload(payload, filenamePrefix) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safePrefix = slugifyFilename(filenamePrefix || 'counters');
    const link = document.createElement('a');
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `${safePrefix}-${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function handleDeleteSelected() {
    const ids = Array.from(state.selectedIds);
    if (!ids.length) {
      await showAlert('Select at least one counter.');
      return;
    }
    const allowedIds = ids.filter((id) => canDangerOnCounter(state.counterCache?.get(id)));
    const skippedCount = ids.length - allowedIds.length;
    if (!allowedIds.length) {
      await showAlert("You don't have permission to do that.");
      return;
    }
    const confirmed = await showConfirm({
      title: 'Delete selected counters?',
      message: `This removes ${allowedIds.length} counter(s) permanently.${skippedCount ? ` (${skippedCount} skipped)` : ''}`,
      confirmLabel: 'Delete',
      variant: 'danger'
    });
    if (!confirmed) return;
    if (deleteSelectedBtn) deleteSelectedBtn.disabled = true;
    try {
      const res = await authFetch('/api/counters/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ids: allowedIds })
      });
      await assertAuthorizedResponse(res);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete counters');
      }
      const data = await res.json();
      const deletedCount = Number(data?.deleted || 0);
      const skippedTotal = Math.max(0, ids.length - deletedCount);
      if (!deletedCount) {
        await showAlert("You don't have permission to do that.");
        return;
      }
      allowedIds.forEach((id) => state.selectedIds.delete(id));
      await refreshCounters(state.page);
      updateSelectionToolbar();
      showToast(
        `Deleted ${deletedCount} counter${deletedCount === 1 ? '' : 's'}` +
          (skippedTotal ? ` · ${skippedTotal} skipped (no permission)` : '')
      );
    } catch (error) {
      await showAlert(normalizeAuthMessage(error, 'Failed to delete counters'));
    } finally {
      if (deleteSelectedBtn) deleteSelectedBtn.disabled = false;
    }
  }

/* -------------------------------------------------------------------------- */
/* Select-all flow                                                            */
/* -------------------------------------------------------------------------- */
function handleSelectAll() {
    const ids = state.latestCounters.map((counter) => counter.id);
    const allowedIds = ids.filter((id) => canDangerOnCounter(state.counterCache?.get(id)));
    const skippedCount = ids.length - allowedIds.length;
    const allSelected = allowedIds.length && allowedIds.every((id) => state.selectedIds.has(id));
    if (allSelected) {
      allowedIds.forEach((id) => state.selectedIds.delete(id));
    } else {
      allowedIds.forEach((id) => state.selectedIds.add(id));
    }
    refreshSelectionState();
    if (skippedCount) {
      showToast(`${skippedCount} counter${skippedCount === 1 ? '' : 's'} skipped (no permission).`);
    }
  }

  return {
    toggleSelection,
    clearSelection,
    refreshSelectionState,
    updateSelectionToolbar,
    handleDownloadSelected,
    handleAddTagsSelected,
    handleDownloadSingle,
    handleDeleteSelected,
    handleSelectAll
  };
}

export { createDashboardSelection };
