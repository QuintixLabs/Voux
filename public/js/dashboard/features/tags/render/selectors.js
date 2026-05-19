/*
  public/js/dashboard/features/tags/render/selectors.js

  Tag UI helpers shared across dashboard sections.
*/

import { normalizeHexColor, getTagContrastColor } from '../../../shared/helpers.js';

/* -------------------------------------------------------------------------- */
/* Tag helpers                                                                */
/* -------------------------------------------------------------------------- */
function applyTagStyles(element, color, options = {}) {
  if (!element) return;
  const normalized = normalizeHexColor(color) || '#4c6ef5';
  element.style.setProperty('--tag-color', normalized);
  const shouldApplyText = options.textContrast !== false;

  if (shouldApplyText) {
    element.style.setProperty(
      '--tag-text-color',
      getTagContrastColor(normalized)
    );
  } else {
    element.style.removeProperty('--tag-text-color');
  }
}

function buildTagBadges(tags) {
  if (!Array.isArray(tags) || !tags.length) return null;
  const wrapper = document.createElement('div');
  wrapper.className = 'counter-tags';
  
  tags.forEach((tag) => {
    if (!tag) return;
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    
    const tagId = typeof tag === 'string' ? tag : tag.id;
    if (tagId) {
      chip.dataset.tagId = tagId;
    }

    applyTagStyles(chip, tag.color, { textContrast: false });
    const chipLabel = document.createElement('span');
    chipLabel.className = 'tag-chip__label';
    chipLabel.textContent = tag.name || tag.id;
    chip.appendChild(chipLabel);
    wrapper.appendChild(chip);
  });
  return wrapper;
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
/* Tag selector registry                                                      */
/* -------------------------------------------------------------------------- */
function createTagSelectorHelpers(deps) {
  const {
    // Shared state
    state,
    tagSelectorRegistry,

    // Tag UI helpers
    applyTagStyles,

    // Tag actions
    openTagEditDialog,
    confirmTagDeletion,
    handleTagContextMenu
  } = deps;

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
      editBtn.innerHTML = `<i class="icon" style="--icon:url('/assets/icons/ui/edit-2.svg')" aria-hidden="true"></i>`;
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
      removeBtn.innerHTML = `<i class="icon" style="--icon:url('/assets/icons/ui/close.svg')" aria-hidden="true"></i>`;
      removeBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        confirmTagDeletion(tag);
      });
      
      pill.appendChild(removeBtn);
      pill.addEventListener('contextmenu', (event) =>
        handleTagContextMenu(event, tag)
      );
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

  return {
    registerTagSelector,
    refreshTagSelectorEntry,
    refreshTagSelectors,
    cleanupTagSelectors
  };
}

export { applyTagStyles, buildTagBadges, createTagSelectorHelpers };
