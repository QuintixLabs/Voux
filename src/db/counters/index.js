/*
  src/db/counters/index.js

  Counter records, hit updates, and backup import/export.
*/

const createCounterBackupHelpers = require('./backup/transfer');
const createCounterCleanupHelpers = require('./maintenance/cleanup');
const createCounterReadHelpers = require('./read/queries');
const createCounterStatsHelpers = require('./read/stats');
const createCounterMutationHelpers = require('./write/mutations');

function createCountersApi(db, helpers, tagsApi) {
  const {
    // Time + IDs
    DAY_MS,
    normalizeIdList,
    generateId,

    // Modes + search
    parseRequestedMode,
    normalizeSearch,

    // Import normalization
    extractIntegerDigits,
    normalizeDailyEntry
  } = helpers;

/* -------------------------------------------------------------------------- */
/* Counter queries                                                            */
/* -------------------------------------------------------------------------- */
const baseSelectFields =
  'id, label, theme, note, value, created_at, count_mode, owner_id';

const listCountersStmt = db.prepare(
  `SELECT ${baseSelectFields} FROM counters ORDER BY created_at DESC`
);
const listCountersByOwnerStmt = db.prepare(
  `SELECT ${baseSelectFields} FROM counters WHERE owner_id = ? ORDER BY created_at DESC`
);
const getCounterStmt = db.prepare(
  `SELECT ${baseSelectFields} FROM counters WHERE id = ?`
);
const getLastHitStmt = db.prepare(
  'SELECT last_hit FROM hits WHERE counter_id = ? ORDER BY last_hit DESC LIMIT 1'
);
const clampFutureHitsStmt = db.prepare(
  'UPDATE hits SET last_hit = ? WHERE counter_id = ? AND last_hit > ?'
);
const countHitsSinceStmt = db.prepare(
  'SELECT COUNT(*) as total FROM hits WHERE counter_id = ? AND last_hit >= ?'
);
const insertCounterStmt = db.prepare(
  'INSERT INTO counters (id, label, theme, note, value, created_at, count_mode, owner_id) VALUES (@id, @label, @theme, @note, @value, @created_at, @count_mode, @owner_id)'
);
const upsertCounterStmt = db.prepare(
  'INSERT INTO counters (id, label, theme, note, value, created_at, count_mode, owner_id) VALUES (@id, @label, @theme, @note, @value, @created_at, @count_mode, @owner_id) ' +
    'ON CONFLICT(id) DO UPDATE SET label=excluded.label, theme=excluded.theme, note=excluded.note, value=excluded.value, created_at=excluded.created_at, count_mode=excluded.count_mode, owner_id=excluded.owner_id'
);
const incrementCounterStmt = db.prepare(
  'UPDATE counters SET value = value + 1 WHERE id = ?'
);
const getHitStmt = db.prepare(
  'SELECT last_hit FROM hits WHERE counter_id = ? AND ip = ?'
);
const upsertHitStmt = db.prepare(`
  INSERT INTO hits (counter_id, ip, last_hit)
  VALUES (?, ?, ?)
  ON CONFLICT(counter_id, ip) DO UPDATE SET last_hit = excluded.last_hit
`);
const upsertDailyStmt = db.prepare(`
  INSERT INTO counter_daily (counter_id, day, hits)
  VALUES (?, ?, 1)
  ON CONFLICT(counter_id, day) DO UPDATE SET hits = counter_daily.hits + 1
`);
const upsertDailyImportStmt = db.prepare(`
  INSERT INTO counter_daily (counter_id, day, hits)
  VALUES (@counter_id, @day, @hits)
  ON CONFLICT(counter_id, day) DO UPDATE SET hits = excluded.hits
`);
const listDailyStmt = db.prepare(
  'SELECT counter_id, day, hits FROM counter_daily ORDER BY counter_id, day'
);
const getDailyTrendStmt = db.prepare(
  `SELECT day, hits FROM counter_daily WHERE counter_id = ? ORDER BY day DESC LIMIT ?`
);

const clearHitsStmt = db.prepare('DELETE FROM hits');
const clearDailyStmt = db.prepare('DELETE FROM counter_daily');
const deleteCounterStmt = db.prepare('DELETE FROM counters WHERE id = ?');
const deleteAllCountersStmt = db.prepare('DELETE FROM counters');
const deleteCountersByModeStmt = {
  unique: db.prepare("DELETE FROM counters WHERE count_mode <> 'unlimited'"),
  unlimited: db.prepare("DELETE FROM counters WHERE count_mode = 'unlimited'")
};

const deleteCountersByOwnerStmt = db.prepare(
  'DELETE FROM counters WHERE owner_id = ?'
);
const deleteCountersByOwnerAndModeStmt = {
  unique: db.prepare(
    "DELETE FROM counters WHERE owner_id = ? AND count_mode <> 'unlimited'"
  ),
  unlimited: db.prepare(
    "DELETE FROM counters WHERE owner_id = ? AND count_mode = 'unlimited'"
  )
};

const updateCounterValueStmt = db.prepare(
  'UPDATE counters SET value = ? WHERE id = ?'
);
const updateCounterMetaStmt = db.prepare(
  'UPDATE counters SET label = @label, value = @value, note = @note WHERE id = @id'
);
const countCountersStmt = db.prepare(
  'SELECT COUNT(*) as total FROM counters'
);

/* -------------------------------------------------------------------------- */
/* Local helpers                                                              */
/* -------------------------------------------------------------------------- */
function getDayStartTimestamp(timestamp) {
  const target = timestamp ? new Date(timestamp) : new Date();
  target.setHours(0, 0, 0, 0);
  return target.getTime();
}

function recordDailyHit(counterId, now) {
  try {
    upsertDailyStmt.run(counterId, getDayStartTimestamp(now));
  } catch (error) {
    console.warn('Failed to record daily hit', error);
  }
}

  const {
    // Counter reads
    listCounters,
    listCountersForOwner,
    listCountersPage,
    countCounters,
    getCounter,

    // Counter export
    exportCounters,
    exportCountersByIds
  } = createCounterReadHelpers({
  // Search + IDs
  normalizeSearch,
  normalizeIdList,

  // Database
  db,
  baseSelectFields,
  listCountersStmt,
  listCountersByOwnerStmt,
  getCounterStmt,

  // Counter helpers
  tagsApi
});

const {
  createCounter,
  recordHit,
  updateCounterValue,
  updateCounterMetadata,
  deleteCounter,
  setUnlimitedThrottle
} = createCounterMutationHelpers({
  // IDs + modes
  generateId,
  parseRequestedMode,

  // Database
  db,
  getCounterStmt,
  insertCounterStmt,
  incrementCounterStmt,
  getHitStmt,
  upsertHitStmt,
  updateCounterValueStmt,
  updateCounterMetaStmt,
  deleteCounterStmt,

  // Counter helpers
  recordDailyHit,
  tagsApi
});

const { getLastHitTimestamp, countHitsSince, getCounterDailyTrend } =
  createCounterStatsHelpers({
    // Time
    DAY_MS,
    getDayStartTimestamp,

    // Database
    getLastHitStmt,
    countHitsSinceStmt,
    getDailyTrendStmt
  });

const {
  deleteInactiveCountersOlderThan,
  deleteInactiveCountersOlderThanForOwner,
  deleteAllCounters,
  deleteCountersByMode,
  deleteCountersByOwner,
  deleteCountersByOwnerAndMode
} = createCounterCleanupHelpers({
  // Time
  DAY_MS,

  // Database
  db,
  countCountersStmt,
  deleteAllCountersStmt,
  deleteCountersByModeStmt,
  deleteCountersByOwnerStmt,
  deleteCountersByOwnerAndModeStmt,

  // Counter queries
  listCounters,
  listCountersForOwner,
  getLastHitTimestamp,
  deleteCounter
});

const {
  importCounters,
  importCountersForOwner,
  exportDailyActivity,
  exportDailyActivityFor,
  importDailyActivity,
  importDailyActivityFor,
  seedLastHitsFromDaily,
  createDatabaseBackup
} = createCounterBackupHelpers({
  // Time + IDs
  DAY_MS,
  normalizeIdList,

  // Import normalization
  parseRequestedMode,
  extractIntegerDigits,
  normalizeDailyEntry,

  // Database
  db,
  upsertCounterStmt,
  clearHitsStmt,
  clearDailyStmt,
  deleteAllCountersStmt,
  deleteCountersByOwnerStmt,
  upsertDailyImportStmt,
  listDailyStmt,
  clampFutureHitsStmt,
  getLastHitStmt,
  upsertHitStmt,

  // Counter reads
  getCounter,
  exportCounters,
  exportCountersByIds,

  // Counter helpers
  tagsApi
});

return {
  // Counter CRUD
  createCounter,
  listCounters,
  listCountersPage,
  getCounter,
  recordHit,
  deleteCounter,
  deleteAllCounters,
  deleteCountersByMode,
  deleteCountersByOwner,
  deleteCountersByOwnerAndMode,
  deleteInactiveCountersOlderThan,
  deleteInactiveCountersOlderThanForOwner,
  countCounters,

  // Counter stats
  getLastHitTimestamp,
  countHitsSince,
  getCounterDailyTrend,

  // Daily activity backup
  exportDailyActivity,
  exportDailyActivityFor,
  importDailyActivity,
  importDailyActivityFor,
  seedLastHitsFromDaily,

  // Counter backup import/export
  exportCounters,
  exportCountersByIds,
  importCounters,
  importCountersForOwner,

  // Counter updates + modes
  updateCounterValue,
  updateCounterMetadata,
  setUnlimitedThrottle,
  describeModeLabel: helpers.describeModeLabel,
  parseRequestedMode,

  // Database backup
  createDatabaseBackup
  };
}

module.exports = createCountersApi;
