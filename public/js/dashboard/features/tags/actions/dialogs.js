/*
  public/js/dashboard/features/tags/actions/dialogs.js

  This file creates the tag create/edit modal and the bulk tag modal.
*/

import { normalizeHexColor } from '../../../shared/helpers.js';

function createTagDialogHelpers(deps) {
  const {
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
  } = deps;

/* -------------------------------------------------------------------------- */
/* Tag dialog UI                                                              */
/* -------------------------------------------------------------------------- */
function openTagDialog(existingCount = 0, _counterTotal = 0, defaults = {}) {
  return new Promise((resolve) => {
    const isEdit = Boolean(defaults && defaults.id);
    const defaultName = (defaults && defaults.name) || '';
    const defaultColor =
      normalizeHexColor(defaults && defaults.color) || '#4c6ef5';

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
        if (!window.Pickr || typeof window.Pickr.create !== 'function')
          return;
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
    overlay.classList.add('modal-overlay', 'tag-dialog-overlay');
    const dialog = document.createElement('div');
    dialog.className = 'modal tag-dialog';
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
    refreshTagSelectorEntry(selectorEntry);

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
    actions.append(saveBtn, cancelBtn);

    let closing = false;
    let openFrame = null;
    const closeDialog = (result = null) => {
      if (closing) return;
      closing = true;
      if (openFrame) {
        cancelAnimationFrame(openFrame);
        openFrame = null;
      }
      document.body.classList.remove('modal-open');
      overlay.classList.remove('modal-overlay--open');
      const removeOverlay = () => {
        overlay.removeEventListener('transitionend', removeOverlay);
        overlay.remove();
        resolve(result);
      };
      overlay.addEventListener('transitionend', removeOverlay);
      setTimeout(removeOverlay, 250);
    };

    cancelBtn.addEventListener('click', () => closeDialog());
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeDialog();
    });
    saveBtn.addEventListener('click', () => {
      closeDialog(selectedTags.slice());
    });
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDialog();
      }
      if (
        event.key === 'Enter' &&
        event.target !== cancelBtn &&
        event.target?.tagName !== 'BUTTON'
      ) {
        event.preventDefault();
        saveBtn.click();
      }
    });

    dialog.append(title, hint, tagsField, actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    overlay.classList.remove('modal-overlay--open');
    void overlay.offsetWidth;
    document.body.classList.add('modal-open');
    openFrame = requestAnimationFrame(() => {
      overlay.classList.add('modal-overlay--open');
      openFrame = null;
      dialog.focus();
    });
  });
}


/* -------------------------------------------------------------------------- */
/* Dialog actions                                                             */
/* -------------------------------------------------------------------------- */
function handleTagContextMenu(event, tag) {
  if (!tag || !tag.id) return;
  event.preventDefault();
  event.stopPropagation();
  confirmTagDeletion(tag);
}

async function openTagEditDialog(tag) {
  const result = await openTagDialog(
    state.tags.length,
    state.totalOverall || state.total || 0,
    {
      id: tag?.id,
      name: tag?.name,
      color: tag?.color
    }
  );
  if (!result || !result.name) return;
  await updateTagRequest(tag.id, {
    name: result.name,
    color: result.color
  });
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

  return {
    // Dialog builders
    openTagDialog,
    openBulkTagDialog,

    // Dialog actions
    openTagEditDialog,
    confirmTagDeletion,
    handleTagContextMenu
  };
}

export { createTagDialogHelpers };
