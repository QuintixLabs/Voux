/*
  public/js/dashboard/features/tags/actions/filters.js

  Tag filter menu and filter list behavior.
*/

function createTagFilterHelpers(deps) {
  const {
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
  } = deps;

  let tagFilterMenuOpen = false;

/* -------------------------------------------------------------------------- */
/* Tag filter list                                                            */
/* -------------------------------------------------------------------------- */
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
    editBtn.innerHTML = `<i class="icon" style="--icon:url('/assets/icons/ui/edit-2.svg')" aria-hidden="true"></i>`;
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
    removeBtn.innerHTML = `<i class="icon" style="--icon:url('/assets/icons/ui/close.svg')" aria-hidden="true"></i>`;
    removeBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      confirmTagDeletion(tag);
    });

    chip.appendChild(removeBtn);
    chip.addEventListener('contextmenu', (event) =>
      handleTagContextMenu(event, tag)
    );
    item.append(input, chip);
    tagFilterList.appendChild(item);
  });
}

function updateTagFilterButton() {
  if (tagFilterButton) {
    const count = state.tagFilter.length;
    tagFilterButton.innerHTML = `<i class="icon" style="--icon:url('/assets/icons/ui/price-tag.svg')" aria-hidden="true"></i> ${count ? `Filter (${count})` : 'Filter'}`;
  }

  if (clearTagFilterBtn) {
    clearTagFilterBtn.disabled = state.tagFilter.length === 0;
  }
}

/* -------------------------------------------------------------------------- */
/* Filter menu                                                                */
/* -------------------------------------------------------------------------- */
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
  if (
    event.target.closest('.pcr-app') ||
    event.target.closest('.pickr') ||
    event.target.closest('.modal') ||
    event.target.closest('.modal-overlay')
  ) {
    return;
  }

  if (!tagFilterControls.contains(event.target)) {
    closeTagFilterMenu();
  }
}

function handleGlobalKeydown(event) {
  if (event.key !== 'Escape' || !tagFilterMenuOpen) {
    return;
  }

  if (document.querySelector('.modal-overlay.modal-overlay--open')) {
    return;
  }
  closeTagFilterMenu();
}

function clearTagFilterSelection(event) {
  event?.preventDefault();
  if (!state.tagFilter.length) return;
  setTagFilter([]);
  closeTagFilterMenu();
}

/* -------------------------------------------------------------------------- */
/* Filter state                                                               */
/* -------------------------------------------------------------------------- */
function updateTagCounterHints() {
  const count = Math.max(
    0,
    Array.isArray(state.tags) ? state.tags.length : 0
  );
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
        .filter(
          (id, index, arr) =>
            id &&
            arr.indexOf(id) === index &&
            state.tags.some((tag) => tag.id === id)
        )
    : [];
  const changed =
    normalized.length !== state.tagFilter.length ||
    normalized.some((id, idx) => id !== state.tagFilter[idx]);
  state.tagFilter = normalized;
  updateTagFilterButton();
  renderTagFilterList();
  updateTagCounterHints();
  if (changed) {
    refreshCounters(1).catch((err) =>
      console.warn('Failed to refresh counters', err)
    );
  }
}

  return {
    // Filter list
    renderTagFilterList,
    updateTagFilterButton,

    // Filter menu
    handleTagFilterToggle,
    closeTagFilterMenu,
    handleTagFilterLabelClick,
    handleDocumentClick,
    handleGlobalKeydown,
    clearTagFilterSelection,

    // Filter state
    updateTagCounterHints,
    setTagFilter
  };
}

export { createTagFilterHelpers };
