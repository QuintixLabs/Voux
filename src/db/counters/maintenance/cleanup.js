/*
  src/db/counters/maintenance/cleanup.js

  Counter cleanup and bulk delete helpers.
*/

function createCounterCleanupHelpers(deps) {
  const {
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
  } = deps;

/* -------------------------------------------------------------------------- */
/* Inactive cleanup                                                           */
/* -------------------------------------------------------------------------- */
function deleteInactiveCountersOlderThan(days) {
  const threshold = Date.now() - Math.max(1, days) * DAY_MS;
  const counters = listCounters();
  let removed = 0;
  counters.forEach((counter) => {
    const lastHit = getLastHitTimestamp(counter.id);
    const reference = lastHit || counter.created_at;
    if (
      reference !== null &&
      reference < threshold &&
      deleteCounter(counter.id)
    ) {
      removed += 1;
    }
  });
  return removed;
}

function deleteInactiveCountersOlderThanForOwner(days, ownerId) {
  if (!ownerId) return 0;
  const threshold = Date.now() - Math.max(1, days) * DAY_MS;
  const counters = listCountersForOwner(ownerId);
  let removed = 0;
  counters.forEach((counter) => {
    const lastHit = getLastHitTimestamp(counter.id);
    const reference = lastHit || counter.created_at;
    if (
      reference !== null &&
      reference < threshold &&
      deleteCounter(counter.id)
    ) {
      removed += 1;
    }
  });
  return removed;
}

/* -------------------------------------------------------------------------- */
/* Bulk delete                                                                */
/* -------------------------------------------------------------------------- */
const deleteAllCounters = db.transaction(() => {
  const { total } = countCountersStmt.get();
  deleteAllCountersStmt.run();
  const normalized = typeof total === 'bigint' ? Number(total) : total;
  return Number.isFinite(normalized) ? normalized : 0;
});

function deleteCountersByMode(mode) {
  const statement = deleteCountersByModeStmt[mode];
  if (!statement) return 0;
  return statement.run().changes || 0;
}

function deleteCountersByOwner(ownerId) {
  if (!ownerId) return 0;
  return deleteCountersByOwnerStmt.run(ownerId).changes || 0;
}

function deleteCountersByOwnerAndMode(ownerId, mode) {
  if (!ownerId) return 0;
  const statement = deleteCountersByOwnerAndModeStmt[mode];

  if (!statement) return 0;
  return statement.run(ownerId).changes || 0;
}

return {
  // Inactive cleanup
  deleteInactiveCountersOlderThan,
  deleteInactiveCountersOlderThanForOwner,

  // Bulk delete
  deleteAllCounters,
  deleteCountersByMode,
  deleteCountersByOwner,
  deleteCountersByOwnerAndMode
  };
}

module.exports = createCounterCleanupHelpers;
