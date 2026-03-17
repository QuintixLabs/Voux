/*
  src/services/counterStats.js

  Time/activity formatting helpers for counters.
*/

function createCounterStatsService(deps) {
  const {
    weekdayLabels,
    activityWindowDays,
    inactiveThresholdDays,
    dayMs
  } = deps;

  function formatActivityTrend(trend = []) {
    const chronological = Array.isArray(trend) ? trend.slice(-activityWindowDays) : [];
    const total30d = chronological.reduce((sum, item) => sum + (item.hits || 0), 0);
    const recentWeek = chronological.slice(-7);
    const weekOrdered = orderWeekByLabel(recentWeek);
    const todayHits = chronological.length ? (chronological[chronological.length - 1].hits || 0) : 0;
    const total7d = recentWeek.reduce((sum, item) => sum + (item.hits || 0), 0);
    const maxHits = weekOrdered.reduce((peak, item) => Math.max(peak, item.hits || 0), 0);
    return {
      trend: weekOrdered,
      todayHits,
      total7d,
      total30d,
      maxHits
    };
  }

  function orderWeekByLabel(days = []) {
    const map = new Map();
    days.forEach((entry) => {
      const idx = getWeekdayIndex(entry.day);
      if (idx === null || idx === undefined) return;
      map.set(idx, entry);
    });
    const ordered = [];
    for (let i = 0; i < weekdayLabels.length; i += 1) {
      const found = map.get(i);
      ordered.push({
        day: found?.day || null,
        hits: found?.hits || 0,
        label: weekdayLabels[i]
      });
    }
    return ordered;
  }

  function getWeekdayIndex(timestamp) {
    if (timestamp === null || timestamp === undefined) return null;
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return null;
    const weekDay = date.getDay();
    return (weekDay + 6) % 7;
  }

  function buildInactiveStatus(counter, lastHit) {
    const reference = toSafeNumber(lastHit || counter.created_at || 0);
    if (!reference) {
      return {
        isInactive: true,
        days: inactiveThresholdDays,
        label: `Inactive ${inactiveThresholdDays}d`,
        thresholdDays: inactiveThresholdDays
      };
    }
    const elapsedMs = Date.now() - reference;
    const days = Math.max(0, Math.floor(elapsedMs / dayMs));
    const isInactive = elapsedMs >= inactiveThresholdDays * dayMs;
    return {
      isInactive,
      days,
      label: isInactive ? `Inactive ${inactiveThresholdDays}d` : '',
      thresholdDays: inactiveThresholdDays
    };
  }

  function getDayStart() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now.getTime();
  }

  function toSafeNumber(value) {
    if (typeof value === 'bigint') {
      return Number(value);
    }
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  return {
    formatActivityTrend,
    buildInactiveStatus,
    getDayStart,
    toSafeNumber
  };
}

module.exports = createCounterStatsService;
