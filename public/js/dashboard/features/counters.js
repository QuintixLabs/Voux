/*
  dashboard/features/counters.js

  Counter row rendering and in-place patch updates.
*/

/* -------------------------------------------------------------------------- */
/* Counters manager                                                           */
/* -------------------------------------------------------------------------- */
function createDashboardCounters(deps) {
  const {
    state,
    counterListEl,
    START_VALUE_DIGIT_LIMIT,
    truncateQuery,
    formatNumber,
    formatLastHit,
    extractTagIds,
    applyTagStyles,
    buildTagBadges,
    resolveActivityLevel,
    canDangerOnCounter,
    toggleSelection,
    copyEmbedSnippet,
    handleTagCreate,
    registerTagSelector,
    refreshTagSelectorEntry,
    changeEditPanelCount,
    showAlert,
    showToast,
    normalizeAuthMessage,
    updateCounterMetadataRequest,
    refreshCounters,
    handleDownloadSingle,
    removeCounter,
    updateSelectionToolbar,
    applyAllowedModesToSelect,
    adminCooldownSelect,
    getRangeLabel,
    getRangeValue,
    cleanupTagSelectors
  } = deps;

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
        : 'No counters yet.';
      counterListEl.appendChild(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    list.forEach((counter) => {
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

      const selectWrapper = document.createElement('label');
      selectWrapper.className = 'counter-select';
      const selectInput = document.createElement('input');
      selectInput.type = 'checkbox';
      selectInput.checked = isSelected;
      selectInput.addEventListener('change', (event) => toggleSelection(counter.id, event.target.checked, row));
      selectWrapper.appendChild(selectInput);
      if (!canSelect) {
        selectWrapper.classList.add('hidden');
        selectInput.disabled = true;
        selectInput.checked = false;
      }

      const meta = document.createElement('div');
      meta.className = 'counter-meta';

      const label = document.createElement('div');
      label.className = 'counter-meta__label';
      label.textContent = counter.label || '';

      const id = document.createElement('div');
      id.className = 'counter-meta__id';
      const idValue = document.createElement('span');
      idValue.textContent = counter.id;
      const copyWrap = document.createElement('div');
      copyWrap.className = 'counter-copy';
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'counter-copy-button';
      copyBtn.innerHTML = '<i class="ri-file-copy-line"></i>';
      const copyMenu = document.createElement('div');
      copyMenu.className = 'counter-copy__menu';
      const copyScript = document.createElement('button');
      copyScript.type = 'button';
      copyScript.innerHTML = '<i class="ri-code-s-slash-line" aria-hidden="true"></i><span>Copy script</span>';
      const copySvg = document.createElement('button');
      copySvg.type = 'button';
      copySvg.innerHTML = '<i class="ri-image-line" aria-hidden="true"></i><span>Copy SVG</span>';
      copyMenu.append(copyScript, copySvg);
      copyBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        document.querySelectorAll('.counter-copy__menu.is-open').forEach((menu) => {
          if (menu !== copyMenu) menu.classList.remove('is-open');
        });
        copyMenu.classList.toggle('is-open');
      });
      copyScript.addEventListener('click', (event) => {
        event.stopPropagation();
        copyMenu.classList.remove('is-open');
        copyEmbedSnippet(counter.id, copyBtn, 'script');
      });
      copySvg.addEventListener('click', (event) => {
        event.stopPropagation();
        copyMenu.classList.remove('is-open');
        copyEmbedSnippet(counter.id, copyBtn, 'svg');
      });
      copyWrap.append(copyBtn, copyMenu);
      id.append(idValue, copyWrap);

      const value = document.createElement('div');
      value.className = 'counter-meta__value';
      value.innerHTML = `<i class="ri-eye-line" aria-hidden="true"></i> Value <span class="badge">${formatNumber(counter.value)}</span>`;

      const mode = document.createElement('div');
      mode.className = 'counter-meta__mode';
      const labelText = counter.cooldownLabel || 'Unique visitors';
      mode.innerHTML = `<i class="ri-timer-2-line" aria-hidden="true"></i> Mode: ${labelText}`;

      const stats = document.createElement('div');
      stats.className = 'counter-meta__stats';

      const lastHitStat = document.createElement('span');
      lastHitStat.className = 'counter-meta__stat';
      lastHitStat.innerHTML = `<span class="counter-meta__stat-label">Last hit</span><span class="counter-meta__stat-value">${formatLastHit(
        counter.lastHit
      )}</span>`;

      const rangeStat = document.createElement('span');
      rangeStat.className = 'counter-meta__stat';
      const rangeLabel = getRangeLabel();
      const rangeValue = getRangeValue(counter);
      rangeStat.innerHTML = `<span class="counter-meta__stat-label">${rangeLabel}</span><span class="counter-meta__stat-value">${formatNumber(
        rangeValue
      )}</span>`;
      stats.append(lastHitStat, rangeStat);

      const actions = document.createElement('div');
      actions.className = 'counter-actions';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'ghost setvalue';
      editBtn.innerHTML = '<i class="ri-edit-line"></i> Edit';

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

      const fieldsWrapper = document.createElement('div');
      fieldsWrapper.className = 'counter-edit__fields';
      fieldsWrapper.append(
        buildEditField('Label <span class="optional-tag">Optional</span>', labelInput, { allowHtml: true }),
        buildEditField('Value', valueInput),
        buildEditField('Note <span class="optional-tag">Optional</span>', noteInput, { allowHtml: true })
      );
      let editTags = extractTagIds(counter.tags);
      let canEditTags = counter.canEditTags !== false;
      const tagField = document.createElement('div');
      tagField.className = 'counter-edit__field counter-edit__field--tags';
      const tagHead = document.createElement('div');
      tagHead.className = 'counter-edit__field-label counter-edit__field-label--actions';
      const tagLabelText = document.createElement('span');
      tagLabelText.innerHTML = 'Tags <span class="optional-tag">Optional</span>';
      const tagInlineBtn = document.createElement('button');
      tagInlineBtn.type = 'button';
      tagInlineBtn.className = 'ghost tag-inline-button';
      tagInlineBtn.innerHTML = '<i class="ri-price-tag-3-line" aria-hidden="true"></i><span>New tag</span>';
      tagInlineBtn.addEventListener('click', () => handleTagCreate('edit'));
      tagHead.append(tagLabelText, tagInlineBtn);
      const tagSelector = document.createElement('div');
      tagSelector.className = 'tag-picker';
      const tagDisabledHint = document.createElement('p');
      tagDisabledHint.className = 'tag-disabled-hint hidden';
      const ownerLabel = counter.ownerUsername || 'someone else';
      tagDisabledHint.textContent = 'Tags are disabled because this counter is owned by ';
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
          labelInput.setSelectionRange(labelInput.value.length, labelInput.value.length);
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
        const rawValue = (valueInput.value || '').replace(/[^\d]/g, '').slice(0, START_VALUE_DIGIT_LIMIT);
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
            payload.tags = editTags;
          }
          await updateCounterMetadataRequest(counter.id, payload);
          toggleEdit(false);
          await refreshCounters(state.page);
          showToast(`Updated ${counter.id}`);
        } catch (error) {
          await showAlert(normalizeAuthMessage(error, 'Failed to update counter'));
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
        editTags = extractTagIds(counter.tags);
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

      const dangerAllowed = !state.isAdmin || state.user?.adminPermissions?.danger === true;
      const canEditOthers = state.isAdmin && dangerAllowed;
      const isOwnerCounter = counter.ownerId && counter.ownerId === state.user?.id;
      if (!state.isAdmin || isOwnerCounter || canEditOthers) {
        actions.append(editBtn);
      }

      const downloadBtn = document.createElement('button');
      downloadBtn.type = 'button';
      downloadBtn.className = 'ghost counter-download-btn';
      downloadBtn.innerHTML = '<i class="ri-download-2-line"></i><span> Download</span>';
      downloadBtn.addEventListener('click', () => handleDownloadSingle(counter.id, counter.label || counter.id, downloadBtn));
      if (!state.isAdmin || isOwnerCounter || canEditOthers) {
        actions.append(downloadBtn);
      }

      const canDelete = dangerAllowed || (state.isAdmin && state.ownerOnly && counter.ownerId === state.user?.id);
      if (canDelete) {
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'danger ghost counter-delete-btn';
        deleteBtn.innerHTML = '<i class="ri-delete-bin-line" aria-hidden="true"></i><span> Delete</span>';
        deleteBtn.addEventListener('click', () => removeCounter(counter.id));
        actions.append(deleteBtn);
      }

      meta.append(label, id);
      const tagsLine = buildTagBadges(counter.tags);
      if (tagsLine) {
        meta.append(tagsLine);
      }
      const statusLine = buildStatusBadges(counter, { forceInactive: state.debugInactive });
      if (statusLine) {
        meta.append(statusLine);
      }
      if (counter.note) {
        const note = document.createElement('div');
        note.className = 'counter-meta__note';
        note.textContent = counter.note;
        meta.append(note);
      }
      meta.append(value, mode, stats);

      const activityBlock = buildActivityBlock(counter.activity);
      if (activityBlock) {
        meta.append(activityBlock);
      }

      meta.append(actions, editPanel);
      row.append(meta, selectWrapper);
      fragment.appendChild(row);
    });
    counterListEl.appendChild(fragment);
    updateSelectionToolbar();
  }

/* -------------------------------------------------------------------------- */
/* Row section builders                                                       */
/* -------------------------------------------------------------------------- */
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

  function buildStatusBadges(counter, options = {}) {
    if (!counter) return null;
    const { forceInactive = false } = options;
    const info = counter.inactive || {};
    const isInactive = forceInactive || info.isInactive;
    const badges = [];
    if (isInactive) {
      const badge = document.createElement('span');
      badge.className = 'counter-status__badge counter-status__badge--inactive';
      badge.textContent = forceInactive ? 'Inactive (preview)' : info.label || 'Inactive';
      badges.push(badge);
    }
    if (!badges.length) return null;
    const wrapper = document.createElement('div');
    wrapper.className = 'counter-status';
    badges.forEach((badge) => wrapper.appendChild(badge));
    return wrapper;
  }

  function buildActivityBlock(activity) {
    if (!activity || !Array.isArray(activity.trend) || activity.trend.length === 0) {
      return null;
    }
    const wrapper = document.createElement('div');
    wrapper.className = 'counter-activity';
    const activityState = {
      bars: [],
      tooltip: null,
      activeBar: null
    };
    wrapper._activityState = activityState;
    const label = document.createElement('p');
    label.className = 'counter-activity__label';
    label.textContent = 'Weekly activity';
    const bars = document.createElement('div');
    bars.className = 'activity-bars';
    const maxHits = Math.max(1, Number(activity.maxHits) || 0);
    const tooltip = document.createElement('div');
    tooltip.className = 'activity-tooltip';
    let tooltipAnchor = null;
    let hideTimeout = null;
    activityState.tooltip = tooltip;

    const showTooltip = (bar) => {
      if (!bar || !bar._tooltipData) return;
      const info = bar._tooltipData;
      tooltip.textContent = `${info.label || 'Day'}: ${formatNumber(info.hits)} hits`;
      const trackRect = bar.getBoundingClientRect();
      const parentRect = wrapper.getBoundingClientRect();
      const center = trackRect.left - parentRect.left + trackRect.width / 2;
      tooltip.style.left = `${center}px`;
      tooltip.classList.add('activity-tooltip--visible');
      tooltipAnchor = bar;
      activityState.activeBar = bar;
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
    };

    const scheduleHide = () => {
      if (hideTimeout) return;
      hideTimeout = setTimeout(() => {
        tooltip.classList.remove('activity-tooltip--visible');
        tooltipAnchor = null;
        activityState.activeBar = null;
        hideTimeout = null;
      }, 250);
    };

    const cancelHide = () => {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
    };

    wrapper.addEventListener('mouseleave', scheduleHide);
    wrapper.addEventListener('focusout', scheduleHide);
    tooltip.addEventListener('mouseenter', cancelHide);
    tooltip.addEventListener('mouseleave', scheduleHide);

    activity.trend.forEach((day) => {
      const bar = document.createElement('div');
      bar.className = 'activity-bar';
      const track = document.createElement('span');
      track.className = 'activity-bar__track';
      const fill = document.createElement('span');
      fill.className = 'activity-bar__fill';
      const ratio = maxHits > 0 ? day.hits / maxHits : 0;
      if (ratio > 0) {
        fill.style.height = `${Math.max(12, ratio * 100)}%`;
        fill.dataset.level = resolveActivityLevel(day.hits, ratio);
      } else {
        fill.style.height = '4px';
        fill.classList.add('activity-bar__fill--empty');
        fill.dataset.level = 'low';
      }
      track.appendChild(fill);
      const dayLabel = document.createElement('span');
      dayLabel.className = 'activity-bar__label';
      dayLabel.textContent = day.label || '';
      bar.tabIndex = 0;
      bar.setAttribute('role', 'button');
      bar.setAttribute('aria-label', `${day.label || 'Day'} has ${formatNumber(day.hits)} hits`);
      bar._tooltipData = { label: day.label, hits: day.hits };
      const handleEnter = () => {
        if (tooltipAnchor === bar) {
          cancelHide();
          return;
        }
        cancelHide();
        showTooltip(bar);
      };
      const handleLeave = () => {
        if (tooltipAnchor === bar) {
          scheduleHide();
        }
      };
      track.addEventListener('mouseenter', handleEnter);
      track.addEventListener('mouseleave', handleLeave);
      track.addEventListener('click', handleEnter);
      bar.addEventListener('focus', handleEnter);
      bar.addEventListener('blur', handleLeave);
      bar.append(track, dayLabel);
      bars.appendChild(bar);
      activityState.bars.push(bar);
    });
    wrapper.append(label, bars, tooltip);
    return wrapper;
  }

  function updateActivityBlockData(activityEl, activity) {
    if (!activityEl || !activity || !Array.isArray(activity.trend)) return;
    const activityState = activityEl._activityState;
    if (!activityState || !Array.isArray(activityState.bars)) return;
    const bars = activityState.bars;
    if (!bars.length) return;
    const trend = activity.trend;
    const maxHits = Math.max(1, Number(activity.maxHits) || 0);
    for (let i = 0; i < bars.length; i += 1) {
      const bar = bars[i];
      const day = trend[i];
      if (!bar || !day) continue;
      bar._tooltipData = { label: day.label, hits: day.hits };
      const track = bar.querySelector('.activity-bar__track');
      const fill = track?.querySelector('.activity-bar__fill');
      const ratio = maxHits > 0 ? day.hits / maxHits : 0;
      if (fill) {
        if (ratio > 0) {
          fill.style.height = `${Math.max(12, ratio * 100)}%`;
          fill.dataset.level = resolveActivityLevel(day.hits, ratio);
          fill.classList.remove('activity-bar__fill--empty');
        } else {
          fill.style.height = '4px';
          fill.classList.add('activity-bar__fill--empty');
          fill.dataset.level = 'low';
        }
      }
      const labelEl = bar.querySelector('.activity-bar__label');
      if (labelEl) {
        labelEl.textContent = day.label || '';
      }
      bar.setAttribute('aria-label', `${day.label || 'Day'} has ${formatNumber(day.hits)} hits`);
    }
    if (activityState.tooltip && activityState.activeBar && activityState.activeBar._tooltipData) {
      if (activityState.tooltip.classList.contains('activity-tooltip--visible')) {
        const info = activityState.activeBar._tooltipData;
        activityState.tooltip.textContent = `${info.label || 'Day'}: ${formatNumber(info.hits)} hits`;
      }
    }
  }

/* -------------------------------------------------------------------------- */
/* Incremental row patching                                                   */
/* -------------------------------------------------------------------------- */
function canPatchCounters(previous = [], next = []) {
    if (!counterListEl) return false;
    if (!Array.isArray(previous) || !Array.isArray(next)) return false;
    if (previous.length !== next.length) return false;
    for (let i = 0; i < next.length; i += 1) {
      if (!previous[i] || previous[i].id !== next[i].id) {
        return false;
      }
    }
    return true;
  }

  function patchCounterRows(counters = []) {
    if (!counterListEl) return false;
    for (let i = 0; i < counters.length; i += 1) {
      const counter = counters[i];
      const row = counterListEl.querySelector(`.counter-row[data-counter-id="${counter.id}"]`);
      if (!row) {
        return false;
      }
      updateCounterRow(row, counter);
    }
    return true;
  }

  function updateCounterRow(row, counter) {
    const meta = row.querySelector('.counter-meta');
    if (!meta) return;
    row.dataset.counterValue = counter.value;
    row.dataset.counterLabel = counter.label || '';
    row.dataset.counterNote = counter.note || '';
    const labelEl = row.querySelector('.counter-meta__label');
    if (labelEl) {
      labelEl.textContent = counter.label || '';
    }
    const valueBadge = row.querySelector('.counter-meta__value .badge');
    if (valueBadge) {
      valueBadge.textContent = formatNumber(counter.value);
    }
    const modeEl = row.querySelector('.counter-meta__mode');
    if (modeEl) {
      const labelText = counter.cooldownLabel || 'Unique visitors';
      modeEl.innerHTML = `<i class="ri-timer-2-line" aria-hidden="true"></i> Mode: ${labelText}`;
    }
    const statEls = row.querySelectorAll('.counter-meta__stat');
    const lastHitStat = statEls[0];
    if (lastHitStat) {
      const valueEl = lastHitStat.querySelector('.counter-meta__stat-value');
      if (valueEl) {
        valueEl.textContent = formatLastHit(counter.lastHit);
      }
    }
    const rangeStat = statEls[1];
    if (rangeStat) {
      const labelSpan = rangeStat.querySelector('.counter-meta__stat-label');
      if (labelSpan) {
        labelSpan.textContent = getRangeLabel();
      }
      const valueSpan = rangeStat.querySelector('.counter-meta__stat-value');
      if (valueSpan) {
        valueSpan.textContent = formatNumber(getRangeValue(counter));
      }
    }
    updateTagsSection(row, counter);
    updateStatusSection(row, counter);
    updateNoteSection(row, counter);
    updateActivitySection(row, counter);
    updateEditDefaults(row, counter);
  }

  function updateTagsSection(row, counter) {
    const meta = row.querySelector('.counter-meta');
    if (!meta) return;
    const existing = row.querySelector('.counter-tags');
    const newTags = buildTagBadges(counter.tags);
    if (existing && newTags) {
      existing.replaceWith(newTags);
    } else if (!existing && newTags) {
      const idBlock = row.querySelector('.counter-meta__id');
      if (idBlock && idBlock.parentElement) {
        idBlock.parentElement.insertBefore(newTags, idBlock.nextSibling);
      } else {
        meta.insertBefore(newTags, meta.firstChild);
      }
    } else if (existing && !newTags) {
      existing.remove();
    }
  }

  function updateStatusSection(row, counter) {
    const meta = row.querySelector('.counter-meta');
    if (!meta) return;
    const existing = row.querySelector('.counter-status');
    const newStatus = buildStatusBadges(counter, { forceInactive: state.debugInactive });
    if (existing && newStatus) {
      existing.replaceWith(newStatus);
    } else if (!existing && newStatus) {
      const noteOrValue = row.querySelector('.counter-meta__note, .counter-meta__value');
      if (noteOrValue && noteOrValue.parentElement) {
        noteOrValue.parentElement.insertBefore(newStatus, noteOrValue);
      } else {
        meta.appendChild(newStatus);
      }
    } else if (existing && !newStatus) {
      existing.remove();
    }
  }

  function updateNoteSection(row, counter) {
    const meta = row.querySelector('.counter-meta');
    if (!meta) return;
    let noteEl = row.querySelector('.counter-meta__note');
    if (counter.note) {
      if (noteEl) {
        noteEl.textContent = counter.note;
      } else {
        noteEl = document.createElement('div');
        noteEl.className = 'counter-meta__note';
        noteEl.textContent = counter.note;
        const valueEl = row.querySelector('.counter-meta__value');
        if (valueEl && valueEl.parentElement) {
          valueEl.parentElement.insertBefore(noteEl, valueEl);
        } else {
          meta.appendChild(noteEl);
        }
      }
    } else if (noteEl) {
      noteEl.remove();
    }
  }

  function updateActivitySection(row, counter) {
    const meta = row.querySelector('.counter-meta');
    if (!meta) return;
    const activityEl = row.querySelector('.counter-activity');
    const isHovered = activityEl && (activityEl.matches(':hover') || activityEl.querySelector(':hover'));
    const newActivity = buildActivityBlock(counter.activity);
    if (activityEl && isHovered) {
      updateActivityBlockData(activityEl, counter.activity);
      return;
    }
    if (activityEl && newActivity) {
      activityEl.replaceWith(newActivity);
    } else if (!activityEl && newActivity) {
      const actionsEl = row.querySelector('.counter-actions');
      if (actionsEl && actionsEl.parentElement) {
        actionsEl.parentElement.insertBefore(newActivity, actionsEl);
      } else {
        meta.appendChild(newActivity);
      }
    } else if (activityEl && !newActivity) {
      activityEl.remove();
    }
  }

  function updateEditDefaults(row, counter) {
    const editPanel = row.querySelector('.counter-edit');
    if (!editPanel || !editPanel.classList.contains('hidden')) {
      return;
    }
    const labelInput = editPanel.querySelector('input[name="counterLabel"]');
    const valueInput = editPanel.querySelector('input[name="counterValue"]');
    const noteInput = editPanel.querySelector('textarea');
    if (labelInput) {
      labelInput.value = row.dataset.counterLabel || counter.label || '';
    }
    if (valueInput) {
      valueInput.value = row.dataset.counterValue ?? counter.value;
    }
    if (noteInput) {
      noteInput.value = row.dataset.counterNote || counter.note || '';
    }
  }

/* -------------------------------------------------------------------------- */
/* Mode select helpers                                                        */
/* -------------------------------------------------------------------------- */
function refreshModeControls() {
    if (!adminCooldownSelect) return;
    applyAllowedModesToSelect(adminCooldownSelect, state.allowedModes);
  }

  return {
    renderCounterList,
    canPatchCounters,
    patchCounterRows,
    refreshModeControls
  };
}

export { createDashboardCounters };
