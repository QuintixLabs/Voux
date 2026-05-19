/*
  public/js/dashboard/features/counters/actions/edit.js

  This file opens the edit panel, fills the form, and saves updates.
*/

function createCounterEditHandlers(deps) {
  const {
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
  } = deps;

  /* -------------------------------------------------------------------------- */
  /* Edit behavior                                                              */
  /* -------------------------------------------------------------------------- */
  function attachCounterEditBehavior(counter, rowEntry) {
    const {
      // Row shell
      row,
      editBtn,

      // Edit panel
      editPanel,
      labelInput,
      valueInput,
      noteInput,
      editSave,
      editCancel,

      // Tag controls
      tagInlineBtn,
      tagSelector,
      tagDisabledHint,
      editTagSelectorEntry,

      // Tag state
      getEditTags,
      setEditTags
    } = rowEntry;

    let canEditTags = counter.canEditTags !== false;
    let isEditOpen = false;

    const toggleEdit = (open) => {
      if (isEditOpen === open) return;
      isEditOpen = open;
      editPanel.classList.toggle('hidden', !open);
      row.classList.toggle('counter-row--editing', open);
      editBtn.classList.toggle('active', open);
      editBtn.setAttribute('aria-expanded', open ? 'true' : 'false');

      if (open) {
        labelInput.focus();
        labelInput.setSelectionRange(
          labelInput.value.length,
          labelInput.value.length
        );
      }
      changeEditPanelCount(open ? 1 : -1);
    };

    const updateTagEditState = (allowTags) => {
      canEditTags = allowTags;
      tagInlineBtn.classList.toggle('hidden', !allowTags);
      tagSelector.classList.toggle('hidden', !allowTags);
      tagDisabledHint.classList.toggle('hidden', allowTags);
    };

    const submitEdit = async () => {
      const nextLabel = labelInput.value.trim();
      const rawValue = (valueInput.value || '')
        .replace(/[^\d]/g, '')
        .slice(0, START_VALUE_DIGIT_LIMIT);
      if (!/^\d+$/.test(rawValue || '0')) {
        await showAlert('Use digits only when setting a value.');
        return;
      }
      const nextValue = rawValue || '0';
      const nextNote = noteInput.value.trim();
      editSave.disabled = true;
      try {
        const payload = {
          label: nextLabel,
          value: nextValue,
          note: nextNote
        };
        if (canEditTags) {
          payload.tags = getEditTags();
        }
        await updateCounterMetadataRequest(counter.id, payload);
        toggleEdit(false);
        await refreshCounters(state.page);
        showToast(`Updated ${counter.id}`);
      } catch (error) {
        await showAlert(
          normalizeAuthMessage(error, 'Failed to update counter')
        );
      } finally {
        editSave.disabled = false;
      }
    };

    editBtn.addEventListener('click', () => {
      const isOpen = !editPanel.classList.contains('hidden');
      if (isOpen) {
        toggleEdit(false);
        return;
      }

      labelInput.value = row.dataset.counterLabel || counter.label || '';
      valueInput.value = row.dataset.counterValue ?? counter.value;
      noteInput.value = row.dataset.counterNote || counter.note || '';
      setEditTags(extractTagIds(counter.tags));

      refreshTagSelectorEntry(editTagSelectorEntry);
      updateTagEditState(counter.canEditTags !== false);
      toggleEdit(true);
    });

    editCancel.addEventListener('click', () => toggleEdit(false));
    editSave.addEventListener('click', submitEdit);

    [labelInput, valueInput].forEach((input) => {
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submitEdit();
        }
      });
    });

    noteInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        submitEdit();
      }
    });
  }

  return { attachCounterEditBehavior };
}

export { createCounterEditHandlers };
