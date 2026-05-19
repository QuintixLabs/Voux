/*
  src/db/counters/write/mutations.js

  Counter create, hit, update, and delete helpers.
*/

function createCounterMutationHelpers(deps) {
  const {
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
  } = deps;

  let unlimitedThrottleMs = 0;

/* -------------------------------------------------------------------------- */
/* Counter hit transactions                                                   */
/* -------------------------------------------------------------------------- */
const recordHitTx = db.transaction((counterId, ip, now) => {
  const counter = getCounterStmt.get(counterId);
  if (!counter) return null;
  const effectiveCooldownMs =
    counter.count_mode === 'unlimited' ? unlimitedThrottleMs : null;

  let shouldIncrement = true;
  if (ip) {
    const existingHit = getHitStmt.get(counterId, ip);
    if (existingHit) {
      const lastHitTs =
        typeof existingHit.last_hit === 'bigint'
          ? Number(existingHit.last_hit)
          : existingHit.last_hit;
      if (effectiveCooldownMs === null) shouldIncrement = false;
      else if (effectiveCooldownMs > 0)
        shouldIncrement = now - lastHitTs >= effectiveCooldownMs;
    }
  }

  if (shouldIncrement) {
    incrementCounterStmt.run(counterId);
    if (ip) upsertHitStmt.run(counterId, ip, now);
    recordDailyHit(counterId, now);
  }

  const updated = getCounterStmt.get(counterId);
  return { counter: updated, incremented: shouldIncrement };
});

/* -------------------------------------------------------------------------- */
/* Counter create/update/delete                                               */
/* -------------------------------------------------------------------------- */
function createCounter({
  label,
  theme = 'plain',
  note = null,
  startValue,
  mode,
  tags = [],
  ownerId = null
}) {
  let initialValue = 0n;
  if (typeof startValue === 'bigint')
    initialValue = startValue >= 0n ? startValue : 0n;
  else if (
    typeof startValue === 'number' &&
    Number.isFinite(startValue) &&
    startValue >= 0
  )
    initialValue = BigInt(Math.floor(startValue));

  const modeResult = parseRequestedMode(mode);
  if (modeResult.error) throw new Error(modeResult.error);

  const counter = {
    id: generateId(8),
    label,
    theme,
    note: typeof note === 'string' && note.trim() ? note.trim() : null,
    value: initialValue,
    created_at: Date.now(),
    count_mode: modeResult.mode,
    owner_id: ownerId || null
  };
  insertCounterStmt.run(counter);
  counter.tags = tagsApi.replaceCounterTags(
    counter.id,
    tags,
    counter.owner_id
  );
  return counter;
}

function recordHit(counterId, ip) {
  return recordHitTx(counterId, ip || 'unknown', Date.now());
}

function updateCounterValue(id, value) {
  return updateCounterValueStmt.run(value, id).changes > 0;
}

function updateCounterMetadata(
  id,
  { label, value, note, tags, ownerId = null }
) {
  const result = updateCounterMetaStmt.run({
    id,
    label,
    value,
    note: note || null
  });
  if (Array.isArray(tags)) {
    tagsApi.replaceCounterTags(id, tags, ownerId);
  }
  return result.changes > 0;
}

function deleteCounter(id) {
  return deleteCounterStmt.run(id).changes > 0;
}

function setUnlimitedThrottle(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) {
    unlimitedThrottleMs = 0;
  } else {
    unlimitedThrottleMs = Math.round(value);
  }
}

return {
  // Counter CRUD
  createCounter,
  recordHit,
  updateCounterValue,
  updateCounterMetadata,
  deleteCounter,

  // Counter mode settings
  setUnlimitedThrottle
  };
}

module.exports = createCounterMutationHelpers;
