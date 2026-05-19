/*
  public/js/dashboard/features/counters/render/meta.js

  This file handles the details area, inactive badges, and weekly activity UI.
*/

import { createCounterCopyMenu } from '../actions/copy-menu.js';

function createCounterMetaHelpers(deps) {
  const {
    // Counter formatting
    formatNumber,
    formatLastHit,
    resolveActivityLevel,
    getRangeLabel,
    getRangeValue,

    // Counter UI helpers
    copyEmbedSnippet,
    buildTagBadges,
    applyNoteMarkdown,

    // Shared state
    state
  } = deps;

/* -------------------------------------------------------------------------- */
/* Counter details                                                            */
/* -------------------------------------------------------------------------- */
function buildCounterMetaBlocks(counter) {
  const meta = document.createElement('div');
  meta.className = 'counter-meta';

  const label = document.createElement('div');
  label.className = 'counter-meta__label';
  label.textContent = counter.label || '';

  const id = document.createElement('div');
  id.className = 'counter-meta__id';

  const idValue = document.createElement('span');
  idValue.textContent = counter.id;

  const copyWrap = createCounterCopyMenu(counter.id, copyEmbedSnippet);
  id.append(idValue, copyWrap);

  const value = document.createElement('div');
  value.className = 'counter-meta__value';
  value.innerHTML = `<i class="icon" style="--icon:url('/assets/icons/ui/eye.svg')" aria-hidden="true"></i> Value <span class="badge">${formatNumber(counter.value)}</span>`;

  const mode = document.createElement('div');
  mode.className = 'counter-meta__mode';
  const labelText = counter.cooldownLabel || 'Unique visitors';
  mode.innerHTML = `<i class="icon" style="--icon:url('/assets/icons/ui/timer.svg')" aria-hidden="true"></i> Mode: ${labelText}`;

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

  return { meta, label, id, value, mode, stats };
}

function appendCounterMetaContent(
  meta,
  { label, id, value, mode, stats, actions, editPanel },
  counter,
  options = {}
  ){
  const statusBuilder = options.buildStatusBadges || buildStatusBadges;
  const activityBuilder = options.buildActivityBlock || buildActivityBlock;

  meta.append(label, id);
  const tagsLine = buildTagBadges(counter.tags);
  if (tagsLine) {
    meta.append(tagsLine);
  }

  const statusLine = statusBuilder(counter, {
    forceInactive: state.debugInactive
  });
  if (statusLine) {
    meta.append(statusLine);
  }

  if (counter.note) {
    const note = document.createElement('div');
    note.className = 'counter-meta__note';
    applyNoteMarkdown(note, counter.note);
    meta.append(note);
  }
  meta.append(value, mode, stats);

  const activityBlock = activityBuilder(counter.activity);
  if (activityBlock) {
    meta.append(activityBlock);
  }

  meta.append(actions, editPanel);
}

/* -------------------------------------------------------------------------- */
/* Status badges                                                              */
/* -------------------------------------------------------------------------- */
function buildStatusBadges(counter, options = {}) {
  if (!counter) return null;
  const { forceInactive = false } = options;
  const info = counter.inactive || {};
  const isInactive = forceInactive || info.isInactive;
  const badges = [];

  if (isInactive) {
    const badge = document.createElement('span');
    badge.className = 'counter-status__badge counter-status__badge--inactive';
    badge.textContent = forceInactive
      ? 'Inactive (preview)'
      : info.label || 'Inactive';
    badges.push(badge);
  }

  if (!badges.length) return null;
  const wrapper = document.createElement('div');
  wrapper.className = 'counter-status';
  badges.forEach((badge) => wrapper.appendChild(badge));
  return wrapper;
}

/* -------------------------------------------------------------------------- */
/* Weekly activity                                                            */
/* -------------------------------------------------------------------------- */
function buildActivityBlock(activity) {
  if (
    !activity ||
    !Array.isArray(activity.trend) ||
    activity.trend.length === 0
  ) {
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
    bar.setAttribute(
      'aria-label',
      `${day.label || 'Day'} has ${formatNumber(day.hits)} hits`
    );

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

    bar.setAttribute(
      'aria-label',
      `${day.label || 'Day'} has ${formatNumber(day.hits)} hits`
    );
  }
  if (
    activityState.tooltip &&
    activityState.activeBar &&
    activityState.activeBar._tooltipData &&
    activityState.tooltip.classList.contains('activity-tooltip--visible')
  ) {
    const info = activityState.activeBar._tooltipData;
    activityState.tooltip.textContent = `${info.label || 'Day'}: ${formatNumber(info.hits)} hits`;
  }
}

return {
  // Counter details
  buildCounterMetaBlocks,
  appendCounterMetaContent,

  // Status + activity
  buildStatusBadges,
  buildActivityBlock,
  updateActivityBlockData
};
}

export { createCounterMetaHelpers };
