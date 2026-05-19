/*
  public/js/dashboard/features/counters/updates/patch.js

  This file patches existing counter rows after data changes.
*/

import { createCounterMetaHelpers } from '../render/meta.js';

function createCounterRowPatcher(deps) {
  const {
    // Row container
    counterListEl,

    // Shared state
    state,

    // Counter formatting
    formatNumber,
    formatLastHit,
    getRangeLabel,
    getRangeValue,

    // Counter UI helpers
    buildTagBadges,
    applyNoteMarkdown
  } = deps;

const { buildStatusBadges, buildActivityBlock, updateActivityBlockData } =
  createCounterMetaHelpers({
    // Counter formatting
    formatNumber,
    formatLastHit,
    getRangeLabel,
    getRangeValue,

    // Counter UI helpers
    buildTagBadges,
    applyNoteMarkdown,

    // Shared state
    state
  });

  /* -------------------------------------------------------------------------- */
  /* Patch checks                                                               */
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

  /* -------------------------------------------------------------------------- */
  /* Row patching                                                               */
  /* -------------------------------------------------------------------------- */
  function patchCounterRows(counters = []) {
    if (!counterListEl) return false;
    for (let i = 0; i < counters.length; i += 1) {
      const counter = counters[i];
      const row = counterListEl.querySelector(
        `.counter-row[data-counter-id="${counter.id}"]`
      );
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
      modeEl.innerHTML = `<i class="icon" style="--icon:url('/assets/icons/ui/timer.svg')" aria-hidden="true"></i> Mode: ${labelText}`;
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

  /* -------------------------------------------------------------------------- */
  /* Section updates                                                            */
  /* -------------------------------------------------------------------------- */
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
    const newStatus = buildStatusBadges(counter, {
      forceInactive: state.debugInactive
    });

    if (existing && newStatus) {
      existing.replaceWith(newStatus);
    } else if (!existing && newStatus) {
      const noteOrValue = row.querySelector(
        '.counter-meta__note, .counter-meta__value'
      );

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
        applyNoteMarkdown(noteEl, counter.note);
      } else {
        noteEl = document.createElement('div');
        noteEl.className = 'counter-meta__note';
        applyNoteMarkdown(noteEl, counter.note);
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
    const isHovered =
      activityEl &&
      (activityEl.matches(':hover') || activityEl.querySelector(':hover'));
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

  /* -------------------------------------------------------------------------- */
  /* Edit form defaults                                                         */
  /* -------------------------------------------------------------------------- */
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

  return {
    // Patch checks
    canPatchCounters,

    // Row patching
    patchCounterRows
  };
}

export { createCounterRowPatcher };
