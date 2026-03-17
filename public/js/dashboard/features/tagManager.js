/*
  dashboard/features/tagManager.js

  Tag filters, CRUD, selectors, and tag dialogs.
*/

import { normalizeHexColor } from '../shared/helpers.js';

/* -------------------------------------------------------------------------- */
/* Tag manager                                                                */
/* -------------------------------------------------------------------------- */
function createDashboardTagManager(deps) {
  const {
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
  } = deps;

  let tagFilterMenuOpen = false;

/* -------------------------------------------------------------------------- */
/* Tag filter list + menu                                                     */
/* -------------------------------------------------------------------------- */
async function fetchTags() {
    if (!state.user) return;
    if (state.isAdmin && state.user?.adminPermissions?.tags === false) {
      state.tags = [];
      state.tagFilter = [];
      state.createTags = [];
      refreshTagSelectors();
      renderTagFilterList();
      updateTagCounterHints();
      updateTagFilterButton();
      return;
    }
    try {
      const res = await authFetch('/api/tags');
      await assertAuthorizedResponse(res);
      if (!res.ok) {
        throw new Error('Failed to load tags');
      }
      const payload = await res.json().catch(() => ({}));
      const tags = Array.isArray(payload.tags) ? payload.tags : [];
      state.tags = tags;
      state.tagFilter = state.tagFilter.filter((id) => tags.some((tag) => tag.id === id));
      state.createTags = state.createTags.filter((id) => tags.some((tag) => tag.id === id));
      refreshTagSelectors();
      renderTagFilterList();
      updateTagCounterHints();
      updateTagFilterButton();
    } catch (error) {
      if (error?.code !== 'forbidden') {
        console.warn('Failed to fetch tags', error);
      }
    }
  }

  function renderTagFilterList() {
    if (!tagFilterList) return;
    tagFilterList.innerHTML = '';
    if (!state.tags.length) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = 'No tags yet. Create one to filter counters.';
      tagFilterList.appendChild(empty);
      return;
    }
    state.tags.forEach((tag) => {
      const item = document.createElement('label');
      item.className = 'tag-filter__item';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = state.tagFilter.includes(tag.id);
      input.addEventListener('change', () => {
        const next = input.checked
          ? [...state.tagFilter, tag.id]
          : state.tagFilter.filter((value) => value !== tag.id);
        setTagFilter(next);
      });
      const chip = document.createElement('span');
      chip.className = 'tag-chip tag-filter__chip';
      applyTagStyles(chip, tag.color, { textContrast: false });
      const chipLabel = document.createElement('span');
      chipLabel.className = 'tag-chip__label tag-filter__label';
      const tagText = tag.name || tag.id;
      chipLabel.textContent = tagText;
      chipLabel.title = tagText;
      chip.appendChild(chipLabel);
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'tag-chip__edit';
      editBtn.setAttribute('aria-label', `Edit ${tag.name || tag.id}`);
      editBtn.innerHTML = '<i class="ri-edit-2-line"></i>';
      editBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openTagEditDialog(tag);
      });
      chip.appendChild(editBtn);
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'tag-chip__remove';
      removeBtn.setAttribute('aria-label', `Delete ${tag.name || tag.id}`);
      removeBtn.innerHTML = '<i class="ri-close-line"></i>';
      removeBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        confirmTagDeletion(tag);
      });
      chip.appendChild(removeBtn);
      chip.addEventListener('contextmenu', (event) => handleTagContextMenu(event, tag));
      item.append(input, chip);
      tagFilterList.appendChild(item);
    });
  }

  function updateTagFilterButton() {
    if (tagFilterButton) {
      const count = state.tagFilter.length;
      tagFilterButton.innerHTML = `<i class="ri-price-tag-3-line"></i> ${count ? `Filter (${count})` : 'Filter'}`;
    }
    if (clearTagFilterBtn) {
      clearTagFilterBtn.disabled = state.tagFilter.length === 0;
    }
  }

  function handleTagFilterToggle(event) {
    event?.preventDefault();
    event?.stopPropagation();
    toggleTagFilterMenu(!tagFilterMenuOpen);
  }

  function toggleTagFilterMenu(force) {
    if (!tagFilterMenu) return;
    const next = typeof force === 'boolean' ? force : !tagFilterMenuOpen;
    tagFilterMenuOpen = next;
    tagFilterMenu.classList.toggle('hidden', !next);
    if (next) {
      positionTagFilterMenu();
    }
  }

  function closeTagFilterMenu() {
    toggleTagFilterMenu(false);
  }

  function positionTagFilterMenu() {
    if (!tagFilterMenu || tagFilterMenu.classList.contains('hidden')) return;
    tagFilterMenu.style.left = '0';
    tagFilterMenu.style.right = 'auto';
    tagFilterMenu.style.transform = 'none';
  }

  function handleTagFilterLabelClick(event) {
    event?.preventDefault();
    event?.stopPropagation();
    closeTagFilterMenu();
  }

  function handleDocumentClick(event) {
    if (!tagFilterMenuOpen) return;
    if (!tagFilterControls) return;
    if (event.target.closest('.modal') || event.target.closest('.modal-overlay')) {
      return;
    }
    if (!tagFilterControls.contains(event.target)) {
      closeTagFilterMenu();
    }
  }

  function handleGlobalKeydown(event) {
    if (event.key === 'Escape' && tagFilterMenuOpen) {
      closeTagFilterMenu();
    }
  }

  function clearTagFilterSelection(event) {
    event?.preventDefault();
    if (!state.tagFilter.length) return;
    setTagFilter([]);
    closeTagFilterMenu();
  }

  function updateTagCounterHints() {
    const count = Math.max(0, Array.isArray(state.tags) ? state.tags.length : 0);
    if (createTagCounterHint) {
      createTagCounterHint.textContent = `${count.toLocaleString()} / ${TAG_LIMIT}`;
    }
    if (tagFilterCountHint) {
      const text = `${count.toLocaleString()} / ${TAG_LIMIT.toLocaleString()}`;
      tagFilterCountHint.textContent = text;
    }
  }

  function setTagFilter(ids) {
    const normalized = Array.isArray(ids)
      ? ids
          .map((id) => String(id || '').trim())
          .filter((id, index, arr) => id && arr.indexOf(id) === index && state.tags.some((tag) => tag.id === id))
      : [];
    const changed =
      normalized.length !== state.tagFilter.length ||
      normalized.some((id, idx) => id !== state.tagFilter[idx]);
    state.tagFilter = normalized;
    updateTagFilterButton();
    renderTagFilterList();
    updateTagCounterHints();
    if (changed) {
      refreshCounters(1).catch((err) => console.warn('Failed to refresh counters', err));
    }
  }

/* -------------------------------------------------------------------------- */
/* Tag create/edit/delete                                                     */
/* -------------------------------------------------------------------------- */
async function handleTagCreate(context) {
    if (state.tags.length >= TAG_LIMIT) {
      await showAlert(`You can only create up to ${TAG_LIMIT} tags. Delete an existing tag first.`, {
        title: 'Tag limit reached'
      });
      return;
    }
    if (context !== 'filter') {
      closeTagFilterMenu();
    }
    const result = await openTagDialog(state.tags.length, state.totalOverall || state.total || 0);
    if (!result || !result.name) return;
    let createdTagId = null;
    let createdTagName = result.name;
    try {
      const res = await authFetch('/api/tags', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(result)
      });
      const payload = await res.json().catch(() => ({}));
      await assertAuthorizedResponse(res);
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to create tag');
      }
      createdTagId = payload?.tag?.id || null;
      createdTagName = payload?.tag?.name || createdTagName;
      await fetchTags();
      if (context === 'create' && createdTagId && !state.createTags.includes(createdTagId)) {
        state.createTags = [...state.createTags, createdTagId];
        refreshTagSelectors();
      }
      showToast(`Created tag "${createdTagName}"`);
    } catch (error) {
      await showAlert(normalizeAuthMessage(error, 'Failed to create tag'));
    }
  }

  function handleTagContextMenu(event, tag) {
    if (!tag || !tag.id) return;
    event.preventDefault();
    event.stopPropagation();
    confirmTagDeletion(tag);
  }

  async function openTagEditDialog(tag) {
    const result = await openTagDialog(state.tags.length, state.totalOverall || state.total || 0, {
      id: tag?.id,
      name: tag?.name,
      color: tag?.color
    });
    if (!result || !result.name) return;
    try {
      const res = await authFetch(`/api/tags/${tag.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: result.name,
          color: result.color
        })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to update tag');
      }
      await fetchTags();
      refreshTagSelectors();
      showToast(`Updated tag "${result.name}"`);
    } catch (error) {
      await showAlert(normalizeAuthMessage(error, 'Failed to update tag'));
    }
  }

  async function confirmTagDeletion(tag) {
    const name = tag.name || tag.id;
    const confirmed = await showConfirm({
      title: 'Delete tag?',
      message: `"${name}" will be removed from all filters and counters.`,
      messageParts: [
        '"',
        { strong: name },
        '" will be removed from all filters and counters.'
      ],
      confirmLabel: 'Delete tag',
      variant: 'danger'
    });
    if (!confirmed) return;
    await deleteTagRequest(tag.id, name);
    updateTagCounterHints();
  }

  async function deleteTagRequest(tagId, name) {
    try {
      const res = await authFetch(`/api/tags/${encodeURIComponent(tagId)}`, {
        method: 'DELETE'
      });
      await assertAuthorizedResponse(res);
      if (res.status === 404) throw new Error('Tag not found.');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete tag');
      }
      await fetchTags();
      await refreshCounters(state.page, { silent: true });
      updateTagCounterHints();
      showToast(`Deleted tag "${name || tagId}"`);
    } catch (error) {
      await showAlert(normalizeAuthMessage(error, 'Failed to delete tag'));
    }
  }

/* -------------------------------------------------------------------------- */
/* Tag selector registry                                                      */
/* -------------------------------------------------------------------------- */
function registerTagSelector(container, config = {}) {
    if (!container) return null;
    const entry = {
      container,
      getSelected: config.getSelected || (() => []),
      setSelected: config.setSelected || (() => {}),
      emptyMessage: config.emptyMessage || 'No tags yet.'
    };
    tagSelectorRegistry.add(entry);
    renderTagSelectorEntry(entry);
    return entry;
  }

  function renderTagSelectorEntry(entry) {
    if (!entry || !entry.container) return;
    const container = entry.container;
    container.innerHTML = '';
    if (!state.tags.length) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = entry.emptyMessage || 'No tags yet.';
      container.appendChild(empty);
      return;
    }
    const list = document.createElement('div');
    list.className = 'tag-picker__list';
    const selected = entry.getSelected ? entry.getSelected() : [];
    state.tags.forEach((tag) => {
      const pill = document.createElement('button');
      pill.type = 'button';
      const isSelected = Array.isArray(selected) && selected.includes(tag.id);
      pill.className = `tag-pill${isSelected ? ' tag-pill--selected' : ''}`;
      applyTagStyles(pill, tag.color);
      const pillLabel = document.createElement('span');
      pillLabel.className = 'tag-chip__label';
      pillLabel.textContent = tag.name || tag.id;
      pill.appendChild(pillLabel);
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'tag-chip__edit';
      editBtn.setAttribute('aria-label', `Edit ${tag.name || tag.id}`);
      editBtn.innerHTML = '<i class="ri-edit-2-line"></i>';
      editBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openTagEditDialog(tag);
      });
      pill.appendChild(editBtn);
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'tag-chip__remove';
      removeBtn.setAttribute('aria-label', `Delete ${tag.name || tag.id}`);
      removeBtn.innerHTML = '<i class="ri-close-line"></i>';
      removeBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        confirmTagDeletion(tag);
      });
      pill.appendChild(removeBtn);
      pill.addEventListener('contextmenu', (event) => handleTagContextMenu(event, tag));
      pill.addEventListener('click', () => {
        const next = toggleTagSelection(selected, tag.id);
        entry.setSelected?.(next);
        renderTagSelectorEntry(entry);
      });
      list.appendChild(pill);
    });
    container.appendChild(list);
  }

  function refreshTagSelectorEntry(entry) {
    if (!entry || !entry.container) return;
    if (!entry.container.isConnected) {
      tagSelectorRegistry.delete(entry);
      return;
    }
    renderTagSelectorEntry(entry);
  }

  function refreshTagSelectors() {
    cleanupTagSelectors();
    tagSelectorRegistry.forEach((entry) => {
      renderTagSelectorEntry(entry);
    });
  }

  function cleanupTagSelectors() {
    tagSelectorRegistry.forEach((entry) => {
      if (!entry.container || !entry.container.isConnected) {
        tagSelectorRegistry.delete(entry);
      }
    });
  }

  function toggleTagSelection(selected, tagId) {
    const current = Array.isArray(selected) ? [...selected] : [];
    if (!tagId) return current;
    if (current.includes(tagId)) {
      return current.filter((id) => id !== tagId);
    }
    return [...current, tagId];
  }

/* -------------------------------------------------------------------------- */
/* Tag dialog UI                                                              */
/* -------------------------------------------------------------------------- */
function openTagDialog(existingCount = 0, counterTotal = 0, defaults = {}) {
    return new Promise((resolve) => {
      const isEdit = Boolean(defaults && defaults.id);
      const defaultName = (defaults && defaults.name) || '';
      const defaultColor = normalizeHexColor(defaults && defaults.color) || '#4c6ef5';

      const overlay = document.createElement('div');
      overlay.classList.add('modal-overlay', 'tag-dialog-overlay');
      const dialog = document.createElement('div');
      dialog.className = 'modal tag-dialog';

      const title = document.createElement('h3');
      title.className = 'tag-dialog__title';
      title.textContent = isEdit ? 'Edit tag' : 'New tag';
      const limitHint = document.createElement('p');
      limitHint.className = 'tag-dialog__hint';
      if (isEdit) {
        limitHint.textContent = 'Update the tag name or color.';
      } else {
        const remaining = Math.max(0, TAG_LIMIT - existingCount);
        limitHint.textContent = `You can create up to ${TAG_LIMIT} tags. ${remaining} left.`;
      }

      const nameField = document.createElement('div');
      nameField.className = 'tag-dialog__field';
      const nameLabel = document.createElement('label');
      nameLabel.textContent = 'Name';
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.maxLength = 40;
      nameInput.placeholder = 'Blog posts';
      nameInput.value = defaultName;
      nameField.append(nameLabel, nameInput);

      const colorField = document.createElement('div');
      colorField.className = 'tag-dialog__field';
      const colorLabel = document.createElement('label');
      colorLabel.textContent = 'Color';
      const colorInput = document.createElement('input');
      colorInput.type = 'hidden';
      colorInput.value = defaultColor;
      const colorPickerRow = document.createElement('div');
      colorPickerRow.className = 'tag-dialog__color-row';
      const colorSwatch = document.createElement('button');
      colorSwatch.type = 'button';
      colorSwatch.className = 'tag-dialog__color-swatch';
      colorSwatch.setAttribute('aria-label', 'Pick a color');
      const colorValue = document.createElement('span');
      colorValue.className = 'tag-dialog__color-value';
      colorPickerRow.append(colorSwatch, colorValue);
      colorField.append(colorLabel, colorPickerRow, colorInput);
      let pickrInstance = null;

      const updateColor = (hex) => {
        if (!hex) return;
        colorInput.value = hex;
        colorSwatch.style.background = hex;
        colorValue.textContent = hex.toUpperCase();
      };

      let savedColor = colorInput.value;
      updateColor(colorInput.value);

      ensurePickrLoaded()
        .then(() => {
          if (!window.Pickr || typeof window.Pickr.create !== 'function') return;
          pickrInstance = window.Pickr.create({
            el: colorSwatch,
            theme: 'monolith',
            useAsButton: true,
            default: colorInput.value,
            components: {
              preview: true,
              opacity: false,
              hue: true,
              interaction: {
                input: true,
                save: true,
                cancel: true,
                clear: false
              }
            }
          });

          const root = pickrInstance?.getRoot?.();
          if (root?.app) {
            ['mousedown', 'click'].forEach((evt) => {
              root.app.addEventListener(evt, (e) => e.stopPropagation());
            });
            const lastColor = root.app.querySelector('.pcr-last-color');
            if (lastColor) {
              lastColor.addEventListener('click', (e) => {
                e.stopPropagation();
                pickrInstance.show();
              });
            }
          }

          pickrInstance.on('change', (color) => {
            const hex = color?.toHEXA?.()?.toString();
            if (hex) updateColor(hex);
          });
          pickrInstance.on('save', (color) => {
            const hex = color?.toHEXA?.()?.toString();
            if (hex) {
              updateColor(hex);
              savedColor = hex;
            }
            pickrInstance.hide();
          });
          pickrInstance.on('cancel', () => {
            updateColor(savedColor);
            if (pickrInstance && typeof pickrInstance.setColor === 'function') {
              pickrInstance.setColor(savedColor, true);
            }
            pickrInstance.hide();
          });
          pickrInstance.on('swatchselect', (color) => {
            const hex = color?.toHEXA?.()?.toString();
            if (hex) updateColor(hex);
          });
        })
        .catch(() => {
          colorSwatch.addEventListener('click', () => {
            const tempInput = document.createElement('input');
            tempInput.type = 'color';
            tempInput.value = colorInput.value || '#4c6ef5';
            tempInput.addEventListener('change', () => {
              updateColor(tempInput.value);
            });
            tempInput.click();
          });
        });

      const actions = document.createElement('div');
      actions.className = 'tag-dialog__actions';
      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'savebtn';
      saveBtn.textContent = 'Save';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'ghost';
      cancelBtn.textContent = 'Close';
      actions.append(saveBtn, cancelBtn);

      dialog.append(title);
      dialog.append(limitHint);
      dialog.append(nameField);
      dialog.append(colorField);
      dialog.append(actions);

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      requestAnimationFrame(() => {
        overlay.classList.add('modal-overlay--open');
      });
      document.body.classList.add('modal-open');
      nameInput.focus();

      function cleanup(result) {
        document.body.classList.remove('modal-open');
        overlay.classList.remove('modal-overlay--open');
        const removeOverlay = () => {
          overlay.removeEventListener('transitionend', removeOverlay);
          overlay.remove();
        };
        overlay.addEventListener('transitionend', removeOverlay);
        setTimeout(removeOverlay, 250);
        document.removeEventListener('keydown', onKeyDown);
        if (pickrInstance && pickrInstance.destroyAndRemove) {
          pickrInstance.destroyAndRemove();
        }
        resolve(result);
      }

      function onKeyDown(event) {
        if (event.key === 'Escape') {
          event.preventDefault();
          cleanup(null);
        }
        if (event.key === 'Enter' && event.target === nameInput) {
          event.preventDefault();
          submit();
        }
      }

      function submit() {
        const name = nameInput.value.trim();
        if (!name) {
          nameInput.classList.add('input-error');
          nameInput.focus();
          return;
        }
        const color = colorInput.value || '#4c6ef5';
        cleanup({ name, color });
      }

      nameInput.addEventListener('input', () => {
        nameInput.classList.remove('input-error');
      });
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
          cleanup(null);
        }
      });
      cancelBtn.addEventListener('click', () => cleanup(null));
      saveBtn.addEventListener('click', submit);
      document.addEventListener('keydown', onKeyDown);
    });
  }

/* -------------------------------------------------------------------------- */
/* Bulk tag dialog                                                            */
/* -------------------------------------------------------------------------- */
function openBulkTagDialog(selectedCount = 0) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.classList.add('modal-overlay', 'modal-overlay--open', 'tag-dialog-overlay');
      const dialog = document.createElement('div');
      dialog.className = 'tag-dialog';
      dialog.tabIndex = -1;

      const title = document.createElement('h3');
      title.className = 'tag-dialog__title';
      title.textContent = 'Add tags';

      const hint = document.createElement('p');
      hint.className = 'tag-dialog__hint';
      hint.textContent = `Apply tags to ${selectedCount} selected counters (replaces existing tags).`;

      const tagsField = document.createElement('div');
      tagsField.className = 'tag-dialog__field';
      const tagsLabel = document.createElement('label');
      tagsLabel.textContent = 'Tags';
      const tagsPicker = document.createElement('div');
      tagsPicker.className = 'tag-picker';
      tagsField.append(tagsLabel, tagsPicker);

      let selectedTags = [];
      const selectorEntry = registerTagSelector(tagsPicker, {
        getSelected: () => selectedTags.slice(),
        setSelected: (next) => {
          selectedTags = next;
        },
        emptyMessage: 'No tags yet. Use "New tag" to create one.'
      });
      renderTagSelectorEntry(selectorEntry);

      const actions = document.createElement('div');
      actions.className = 'tag-dialog__actions';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'ghost';
      cancelBtn.textContent = 'Cancel';
      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'savebtn';
      saveBtn.textContent = 'Apply tags';
      actions.append(cancelBtn, saveBtn);

      const closeDialog = () => {
        document.body.classList.remove('modal-open');
        overlay.remove();
        resolve(null);
      };

      cancelBtn.addEventListener('click', closeDialog);
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeDialog();
      });
      saveBtn.addEventListener('click', () => {
        document.body.classList.remove('modal-open');
        overlay.remove();
        resolve(selectedTags.slice());
      });
      dialog.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          closeDialog();
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          saveBtn.click();
        }
      });

      dialog.append(title, hint, tagsField, actions);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      document.body.classList.add('modal-open');
      dialog.focus();
    });
  }

  return {
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
  };
}

export { createDashboardTagManager };
