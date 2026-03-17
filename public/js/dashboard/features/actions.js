/*
  dashboard/features/actions.js

  Counter create/delete actions and related API flows.
*/

/* -------------------------------------------------------------------------- */
/* Actions manager                                                            */
/* -------------------------------------------------------------------------- */
function createDashboardActions(deps) {
  const {
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
  } = deps;

/* -------------------------------------------------------------------------- */
/* Create counter helpers                                                     */
/* -------------------------------------------------------------------------- */
function getCooldownPayload(selectEl) {
    if (!selectEl) return 'unique';
    const mode = selectEl.value === 'unlimited' ? 'unlimited' : 'unique';
    if (!isModeAllowed(mode, state.allowedModes)) {
      return getFirstAllowedMode(state.allowedModes);
    }
    return mode;
  }

/* -------------------------------------------------------------------------- */
/* Delete actions                                                             */
/* -------------------------------------------------------------------------- */
async function handleDeleteAll() {
    const siteUrl = window.location?.origin || window.location?.href || 'this site';
    const targetLabel = state.ownerOnly ? 'every counter and their data for your account' : 'every counter and their data';
    const confirmed = await showConfirm({
      title: 'Delete all counters?',
      message: `This will permanently remove ${targetLabel} on: ${siteUrl}. You'll confirm by typing DELETE next.`,
      messageParts: [
        'This will permanently remove ',
        { strong: targetLabel },
        ' and their data on: ',
        { strong: siteUrl },
        ". You'll confirm by typing DELETE next."
      ],
      confirmLabel: 'Continue',
      cancelLabel: 'Cancel',
      variant: 'danger'
    });
    if (!confirmed) return;
    const confirmedFinal = await showConfirmWithInput({
      title: 'Delete all counters?',
      message: `Type DELETE to permanently remove ${targetLabel}.`,
      inputPlaceholder: 'DELETE',
      inputMatch: 'DELETE',
      inputHint: 'This cannot be undone.',
      promptMessage: `Type DELETE to permanently remove ${targetLabel}.`,
      confirmLabel: 'Delete all counters',
      cancelLabel: 'Cancel',
      variant: 'danger'
    });
    if (!confirmedFinal) return;
    try {
      deleteAllBtn.disabled = true;
      const dangerAllowed = !state.isAdmin || state.user?.adminPermissions?.danger === true;
      const ownerParam = state.ownerOnly ? 'owner=me' : '';
      const url = state.ownerOnly && !dangerAllowed
        ? '/api/counters?owner=me'
        : ownerParam
        ? `/api/counters?${ownerParam}`
        : '/api/counters';
      const res = await authFetch(url, {
        method: 'DELETE'
      });
      await assertAuthorizedResponse(res);
      if (!res.ok) throw new Error('Failed to delete counters');
      const payload = await res.json().catch(() => ({}));
      await refreshCounters(1);
      clearSelection();
      showToast(`Deleted ${payload.deleted ?? 'all'} counters`);
    } catch (error) {
      await showAlert(normalizeAuthMessage(error, 'Failed to delete counters'));
    } finally {
      deleteAllBtn.disabled = false;
    }
  }

  async function handleCreateCounter(event) {
    event.preventDefault();
    if (!state.user) {
      await showAlert('Log in first.');
      return;
    }
    try {
      await ensureSessionForAction();
    } catch (error) {
      await showAlert(normalizeAuthMessage(error, 'Session expired. Please log in again.'));
      return;
    }
    const noteValue = createNoteInput?.value?.trim() || '';
    const payload = {
      label: createLabelInput?.value?.trim() || '',
      startValue: readStartValue(createStartInput)
    };
    if (state.createTags.length) {
      payload.tags = state.createTags.slice(0, 20);
    }
    try {
      payload.mode = getCooldownPayload(adminCooldownSelect);
    } catch (error) {
      await showAlert(normalizeAuthMessage(error, 'Invalid counting mode'));
      return;
    }
    try {
      const res = await authFetch('/api/counters', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      if (res.status === 403) {
        const err = await res.json().catch(() => ({}));
        if (err?.error === 'csrf_blocked') {
          throw Object.assign(new Error('csrf_blocked'), { error: 'csrf_blocked' });
        }
      }
      await assertAuthorizedResponse(res);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (err && typeof err.message === 'string' && err.message.trim()) {
          throw new Error(err.message.trim());
        }
        if (err && err.error === 'rate_limited') {
          const wait = typeof err.retryAfterSeconds === 'number' ? err.retryAfterSeconds : null;
          if (wait) {
            const pretty = wait === 1 ? '1 second' : `${wait} seconds`;
            throw new Error(`Too many new counters at once. Try again in ${pretty}.`);
          }
          throw new Error('Too many new counters right now. Try again in a moment.');
        }
        throw new Error(err.error || 'Failed to create counter');
      }
      const data = await res.json();
      if (adminEmbedSnippetCode) {
        adminEmbedSnippetCode.textContent = data.embedCode || '';
      }
      if (adminEmbedSvgSnippetCode) {
        adminEmbedSvgSnippetCode.textContent = data.embedSvgCode || '';
      }
      if (window.Prism?.highlightAll) {
        window.Prism.highlightAll();
      }
      adminEmbedBlock?.classList.remove('hidden');
      setEmbedMode(state.embedMode || 'script');
      if (data.embedUrl) {
        renderAdminPreview(data.embedUrl);
      }
      if (noteValue) {
        try {
          await updateCounterMetadataRequest(data.counter.id, { note: noteValue });
        } catch (err) {
          console.warn('Failed to set note on create', err);
        }
      }
      if (createLabelInput) createLabelInput.value = payload.label;
      if (createNoteInput) createNoteInput.value = '';
      if (state.createTags.length) {
        state.createTags = [];
        refreshTagSelectors();
      }
      await refreshCounters(state.page);
    } catch (error) {
      await showAlert(normalizeAuthMessage(error, 'Failed to create counter'));
    }
  }

  async function removeCounter(id) {
    const confirmed = await showConfirm({
      title: 'Delete counter?',
      message: `Counter "${id}" will be removed permanently.`,
      messageParts: [
        'Counter "',
        { strong: id },
        '" will be removed permanently.'
      ],
      confirmLabel: 'Delete counter',
      variant: 'danger'
    });
    if (!confirmed) return;
    try {
      const res = await authFetch(`/api/counters/${id}`, {
        method: 'DELETE'
      });
      await assertAuthorizedResponse(res);
      if (!res.ok) throw new Error('Failed to delete counter');
      state.selectedIds.delete(id);
      const nextPage = state.page > 1 && counterListEl.children.length === 1 ? state.page - 1 : state.page;
      await refreshCounters(nextPage);
      updateSelectionToolbar();
      showToast(`Deleted ${id}`);
    } catch (error) {
      await showAlert(normalizeAuthMessage(error, 'Failed to delete counter'));
    }
  }

  async function handleDeleteFiltered() {
    if (state.modeFilter === 'all') return;
    const label = state.modeFilter === 'unique' ? 'unique counters' : 'every-visit counters';
    const siteUrl = window.location?.origin || window.location?.href || 'this site';
    const scopeLabel = state.isAdmin ? `all ${label}` : `your ${label}`;
    const confirmed = await showConfirm({
      title: 'Delete filtered counters?',
      message: `This will permanently remove ${scopeLabel} on: ${siteUrl}. You'll confirm by typing DELETE next.`,
      messageParts: [
        'This will permanently remove ',
        { strong: scopeLabel },
        ' on: ',
        { strong: siteUrl },
        ". You'll confirm by typing DELETE next."
      ],
      confirmLabel: 'Continue',
      cancelLabel: 'Cancel',
      variant: 'danger'
    });
    if (!confirmed) return;
    const confirmedFinal = await showConfirmWithInput({
      title: 'Delete filtered counters?',
      message: `Type DELETE to permanently remove ${scopeLabel}.`,
      inputPlaceholder: 'DELETE',
      inputMatch: 'DELETE',
      inputHint: 'This cannot be undone.',
      promptMessage: `Type DELETE to permanently remove ${scopeLabel}.`,
      confirmLabel: 'Delete filtered',
      cancelLabel: 'Cancel',
      variant: 'danger'
    });
    if (!confirmedFinal) return;
    try {
      deleteFilteredBtn.disabled = true;
      const ownerParam = state.ownerOnly ? '&owner=me' : '';
      const res = await authFetch(`/api/counters?mode=${state.modeFilter}${ownerParam}`, {
        method: 'DELETE'
      });
      await assertAuthorizedResponse(res);
      if (!res.ok) throw new Error('Failed to delete counters');
      await refreshCounters(1);
      clearSelection();
      showToast(`Deleted ${scopeLabel}`);
    } catch (error) {
      await showAlert(normalizeAuthMessage(error, 'Failed to delete counters'));
    } finally {
      deleteFilteredBtn.disabled = false;
      updateDeleteFilteredState();
    }
  }

  return {
    handleDeleteAll,
    handleCreateCounter,
    removeCounter,
    handleDeleteFiltered
  };
}

export { createDashboardActions };
