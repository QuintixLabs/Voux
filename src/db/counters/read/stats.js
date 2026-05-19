/*
  src/db/counters/read/stats.js

  Counter hit and trend stats helpers.
*/

function createCounterStatsHelpers(deps) {
  const {
    // Time
    DAY_MS,
    getDayStartTimestamp,

    // Database
    getLastHitStmt,
    countHitsSinceStmt,
    getDailyTrendStmt
  } = deps;

/* -------------------------------------------------------------------------- */
/* Counter stats                                                              */
/* -------------------------------------------------------------------------- */
function getLastHitTimestamp(counterId) {
  const row = getLastHitStmt.get(counterId);
  if (!row) return null;
  return typeof row.last_hit === 'bigint'
    ? Number(row.last_hit)
    : row.last_hit;
}

function countHitsSince(counterId, sinceTimestamp) {
  if (sinceTimestamp === undefined || sinceTimestamp === null) return 0;

  const row = countHitsSinceStmt.get(counterId, sinceTimestamp);
  if (!row) return 0;

  const total = typeof row.total === 'bigint' ? Number(row.total) : row.total;
  return Number.isFinite(total) ? total : 0;
}

function getCounterDailyTrend(counterId, days = 7) {
  const limit = Math.max(1, Math.min(30, Number(days) || 7));
  const rows = getDailyTrendStmt.all(counterId, limit);
  const map = new Map(
    rows.map((row) => [
      typeof row.day === 'bigint' ? Number(row.day) : row.day,
      typeof row.hits === 'bigint' ? Number(row.hits) : row.hits
    ])
  );
  const trend = [];
  const todayStart = getDayStartTimestamp(Date.now());
  for (let i = limit - 1; i >= 0; i -= 1) {
    const dayStart = todayStart - i * DAY_MS;
    trend.push({ day: dayStart, hits: map.get(dayStart) || 0 });
  }
  return trend;
}

return {
  getLastHitTimestamp,
  countHitsSince,
  getCounterDailyTrend
  };
}

module.exports = createCounterStatsHelpers;
