/*
  public/js/dashboard/features/counters/render/row.js

  This file creates the row layout, action buttons, and edit form structure.
*/

function createCounterRowHelpers(deps) {
  const {
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
  } = deps;

  /* -------------------------------------------------------------------------- */
  /* Row shell                                                                  */
  /* -------------------------------------------------------------------------- */
  function buildSelectionControl(counter, isSelected, canSelect) {
    const selectWrapper = document.createElement('label');
    selectWrapper.className = 'counter-select';

    const selectInput = document.createElement('input');
    selectInput.type = 'checkbox';
    selectInput.checked = isSelected;
    selectInput.addEventListener('change', (event) =>
      toggleSelection(
        counter.id,
        event.target.checked,
        event.target.closest('.counter-row')
      )
    );

    selectWrapper.appendChild(selectInput);
    if (!canSelect) {
      selectWrapper.classList.add('hidden');
      selectInput.disabled = true;
      selectInput.checked = false;
    }

    return { selectWrapper, selectInput };
  }

  /* -------------------------------------------------------------------------- */
  /* Edit form structure                                                        */
  /* -------------------------------------------------------------------------- */
  function buildEditPanelStructure(counter) {
    const editPanel = document.createElement('div');
    editPanel.className = 'counter-edit hidden';

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.name = 'counterLabel';
    labelInput.maxLength = 80;
    labelInput.placeholder = 'Views:';
    labelInput.value = counter.label || '';

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.name = 'counterValue';
    valueInput.inputMode = 'numeric';
    valueInput.pattern = '[0-9]*';
    valueInput.maxLength = START_VALUE_DIGIT_LIMIT;
    valueInput.placeholder = '0';
    valueInput.value = counter.value;
    const enforceDigits = () => {
      const digitsOnly = (valueInput.value || '').replace(/[^\d]/g, '');
      const trimmed = digitsOnly.slice(0, START_VALUE_DIGIT_LIMIT);
      if (trimmed !== valueInput.value) {
        valueInput.value = trimmed;
      }
    };
    enforceDigits();
    valueInput.addEventListener('input', enforceDigits);

    const noteInput = document.createElement('textarea');
    noteInput.rows = 2;
    noteInput.maxLength = 200;
    noteInput.placeholder = 'Optional note';
    noteInput.value = counter.note || '';
    attachNoteMarkdownPasteBehavior(noteInput);

    const fieldsWrapper = document.createElement('div');
    fieldsWrapper.className = 'counter-edit__fields';
    fieldsWrapper.append(
      buildEditField(
        'Label <span class="optional-tag">Optional</span>',
        labelInput,
        { allowHtml: true }
      ),
      buildEditField('Value', valueInput),
      buildEditField(
        'Note <span class="optional-tag">Optional</span>',
        noteInput,
        { allowHtml: true }
      )
    );

    let editTags = extractTagIds(counter.tags);
    const tagField = document.createElement('div');
    tagField.className = 'counter-edit__field counter-edit__field--tags';

    const tagHead = document.createElement('div');
    tagHead.className =
      'counter-edit__field-label counter-edit__field-label--actions';

    const tagLabelText = document.createElement('span');
    tagLabelText.innerHTML = 'Tags <span class="optional-tag">Optional</span>';

    const tagInlineBtn = document.createElement('button');
    tagInlineBtn.type = 'button';
    tagInlineBtn.className = 'ghost tag-inline-button';
    tagInlineBtn.innerHTML =
      `<i class="icon" style="--icon:url('/assets/icons/ui/price-tag.svg')" aria-hidden="true"></i><span>New tag</span>`;
    tagInlineBtn.addEventListener('click', () => handleTagCreate('edit'));
    tagHead.append(tagLabelText, tagInlineBtn);

    const tagSelector = document.createElement('div');
    tagSelector.className = 'tag-picker';

    const tagDisabledHint = document.createElement('p');
    tagDisabledHint.className = 'tag-disabled-hint hidden';
    const ownerLabel = counter.ownerUsername || 'someone else';
    tagDisabledHint.textContent =
      'Tags are disabled because this counter is owned by ';
    const ownerStrong = document.createElement('strong');
    ownerStrong.textContent = ownerLabel;
    tagDisabledHint.append(ownerStrong, document.createTextNode('.'));

    const editTagSelectorEntry = registerTagSelector(tagSelector, {
      getSelected: () => editTags.slice(),
      setSelected: (next) => {
        editTags = next;
      },
      emptyMessage: 'No tags yet. Use "New tag" to create one.'
    });

    tagField.append(tagHead, tagSelector, tagDisabledHint);
    fieldsWrapper.appendChild(tagField);

    const editActions = document.createElement('div');
    editActions.className = 'counter-edit__actions';

    const editSave = document.createElement('button');
    editSave.type = 'button';
    editSave.className = 'savebtn';
    editSave.textContent = 'Save';

    const editCancel = document.createElement('button');
    editCancel.type = 'button';
    editCancel.className = 'ghost cancelbtn';
    editCancel.textContent = 'Cancel';
    editActions.append(editSave, editCancel);

    editPanel.append(fieldsWrapper, editActions);

    return {
      // Edit panel
      editPanel,
      labelInput,
      valueInput,
      noteInput,

      // Edit actions
      editActions,
      editSave,
      editCancel,

      // Tag controls
      tagInlineBtn,
      tagSelector,
      tagDisabledHint,
      editTagSelectorEntry,
      getEditTags: () => editTags,
      setEditTags: (next) => {
        editTags = next;
      }
    };
  }

  function buildEditField(labelText, control, options = {}) {
    const wrapper = document.createElement('label');
    wrapper.className = 'counter-edit__field';

    const title = document.createElement('span');
    title.className = 'counter-edit__field-label';

    if (options.allowHtml) {
      title.innerHTML = labelText;
    } else {
      title.textContent = labelText;
    }
    wrapper.append(title, control);
    return wrapper;
  }

  /* -------------------------------------------------------------------------- */
  /* Row actions                                                                */
  /* -------------------------------------------------------------------------- */
  function buildCounterActions(counter, editBtn) {
    const actions = document.createElement('div');
    actions.className = 'counter-actions';

    const dangerAllowed =
      !state.isAdmin || state.user?.adminPermissions?.danger === true;
    const canEditOthers = state.isAdmin && dangerAllowed;
    const isOwnerCounter =
      counter.ownerId && counter.ownerId === state.user?.id;
    if (!state.isAdmin || isOwnerCounter || canEditOthers) {
      actions.append(editBtn);
    }

    const downloadBtn = document.createElement('button');
    downloadBtn.type = 'button';
    downloadBtn.className = 'ghost counter-download-btn';
    downloadBtn.innerHTML =
      `<i class="icon" style="--icon:url('/assets/icons/ui/download.svg')" aria-hidden="true"></i><span> Download</span>`;
    downloadBtn.addEventListener('click', () =>
      handleDownloadSingle(counter.id, counter.label || counter.id, downloadBtn)
    );
    if (!state.isAdmin || isOwnerCounter || canEditOthers) {
      actions.append(downloadBtn);
    }

    const canDelete =
      dangerAllowed ||
      (state.isAdmin && state.ownerOnly && counter.ownerId === state.user?.id);
    if (canDelete) {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'danger ghost counter-delete-btn';
      deleteBtn.innerHTML =
        `<i class="icon" style="--icon:url('/assets/icons/ui/delete.svg')" aria-hidden="true"></i><span> Delete</span>`;
      deleteBtn.addEventListener('click', () => removeCounter(counter.id));
      actions.append(deleteBtn);
    }

    return { actions };
  }

  /* -------------------------------------------------------------------------- */
  /* Row assembly                                                               */
  /* -------------------------------------------------------------------------- */
  function createCounterRowElement(counter) {
    const row = document.createElement('div');
    row.className = 'counter-row';
    row.dataset.counterId = counter.id;
    const isSelected = state.selectedIds.has(counter.id);
    const canSelect = canDangerOnCounter(counter);

    if (!canSelect && isSelected) {
      state.selectedIds.delete(counter.id);
    }

    if (isSelected) {
      row.classList.add('counter-row--selected');
    }

    const { selectWrapper } = buildSelectionControl(counter, isSelected, canSelect);
    const { meta, label, id, value, mode, stats } =
      buildCounterMetaBlocks(counter);

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'ghost setvalue';
    editBtn.innerHTML = `<i class="icon" style="--icon:url('/assets/icons/ui/edit.svg')" aria-hidden="true"></i> Edit`;
    const { actions } = buildCounterActions(counter, editBtn);

    const editStructure = buildEditPanelStructure(counter);

    appendCounterMetaContent(
      meta,
      {
        label,
        id,
        value,
        mode,
        stats,
        actions,
        editPanel: editStructure.editPanel
      },
      counter,
      { buildStatusBadges, buildActivityBlock }
    );
    row.append(meta, selectWrapper);

    return {
      row,
      counter,
      editBtn,
      ...editStructure
    };
  }

  return {
    // Row shell
    buildSelectionControl,
    createCounterRowElement,

    // Edit form structure
    buildEditPanelStructure,
    buildEditField,

    // Row actions
    buildCounterActions
  };
}

export { createCounterRowHelpers };
