/*
  src/db/counters/backup/transfer.js

  Counter backup, import, and daily activity helpers.
*/

const fs = require('fs');

function createCounterBackupHelpers(deps) {
  const {
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
  } = deps;

/* -------------------------------------------------------------------------- */
/* Counter import transactions                                                */
/* -------------------------------------------------------------------------- */
const importCountersTx = db.transaction(
  (items, replaceExisting, tagOwnerId) => {
    if (replaceExisting) {
      deleteAllCountersStmt.run();
      clearHitsStmt.run();
      clearDailyStmt.run();
    }
    items.forEach((item) => {
      upsertCounterStmt.run(item);
      const tagScope = tagOwnerId || item.owner_id || null;
      tagsApi.replaceCounterTags(item.id, item.tags, tagScope);
    });
  }
);

const importCountersByOwnerTx = db.transaction(
  (items, replaceExisting, ownerId) => {
    if (replaceExisting) {
      deleteCountersByOwnerStmt.run(ownerId);
    }
    items.forEach((item) => {
      upsertCounterStmt.run(item);
      tagsApi.replaceCounterTags(item.id, item.tags, ownerId);
    });
  }
);

/* -------------------------------------------------------------------------- */
/* Counter import normalization                                               */
/* -------------------------------------------------------------------------- */
function normalizeImportedCounter(raw, tagOwnerId = null) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';

  if (!id) return null;
  const modeResult = parseRequestedMode(
    raw.count_mode ?? raw.mode ?? raw.ip_cooldown_hours
  );
  if (modeResult.error) return null;

  let ownerId =
    typeof raw.owner_id === 'string' && raw.owner_id.trim()
      ? raw.owner_id.trim().slice(0, 64)
      : null;
  if (!ownerId && tagOwnerId) ownerId = tagOwnerId;
  const tagScope = tagOwnerId || ownerId || null;

  const normalizedValue = extractIntegerDigits(raw.value);
  if (normalizedValue === null) return null;

  const createdAtRaw = Number(raw.created_at);
  const created_at =
    Number.isFinite(createdAtRaw) && createdAtRaw > 0
      ? createdAtRaw
      : Date.now();

  return {
    id: id.slice(0, 64),
    label: typeof raw.label === 'string' ? raw.label.trim().slice(0, 80) : '',
    theme:
      typeof raw.theme === 'string' && raw.theme.trim()
        ? raw.theme.trim().slice(0, 40)
        : 'plain',
    note:
      typeof raw.note === 'string'
        ? raw.note.trim().slice(0, 200) || null
        : null,
    value: normalizedValue,
    created_at,
    count_mode: modeResult.mode,
    owner_id: ownerId,
    tags: tagsApi.filterTagIds(
      Array.isArray(raw.tags) ? raw.tags : [],
      tagScope
    )
  };
}

/* -------------------------------------------------------------------------- */
/* Counter import                                                             */
/* -------------------------------------------------------------------------- */
function importCounters(data, options = {}) {
  if (!Array.isArray(data)) throw new Error('invalid_backup_format');
  const normalized = data
    .map((item) => normalizeImportedCounter(item, options.tagOwnerId || null))
    .filter(Boolean);

  if (!normalized.length) throw new Error('no_valid_counters');
  importCountersTx(
    normalized,
    Boolean(options.replace),
    options.tagOwnerId || null
  );
  return normalized.length;
}

function importCountersForOwner(data, options = {}, ownerId) {
  if (!ownerId) throw new Error('owner_required');
  if (!Array.isArray(data)) throw new Error('invalid_backup_format');

  const normalizedRaw = data
    .map((item) => normalizeImportedCounter(item, ownerId))
    .filter(Boolean);
  const hasForeignOwner = normalizedRaw.some(
    (counter) => counter.owner_id && counter.owner_id !== ownerId
  );
  if (hasForeignOwner) throw new Error('backup_not_owned');

  const normalized = normalizedRaw.map((counter) => ({
    ...counter,
    owner_id: ownerId
  }));
  if (!normalized.length) throw new Error('no_valid_counters');

  normalized.forEach((counter) => {
    const existing = getCounter(counter.id);
    if (existing && existing.owner_id !== ownerId) {
      throw new Error('counter_id_taken');
    }
  });

  importCountersByOwnerTx(normalized, Boolean(options.replace), ownerId);
  return normalized.length;
}

/* -------------------------------------------------------------------------- */
/* Daily activity import/export                                               */
/* -------------------------------------------------------------------------- */
function exportDailyActivity() {
  return listDailyStmt.all().map((row) => ({
    counter_id: row.counter_id,
    day: typeof row.day === 'bigint' ? Number(row.day) : row.day,
    hits: typeof row.hits === 'bigint' ? Number(row.hits) : row.hits
  }));
}

function exportDailyActivityFor(ids = []) {
  const normalized = normalizeIdList(ids);
  if (!normalized.length) return [];

  const placeholders = normalized.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT counter_id, day, hits FROM counter_daily WHERE counter_id IN (${placeholders}) ORDER BY counter_id, day`
    )
    .all(normalized);
  return rows.map((row) => ({
    counter_id: row.counter_id,
    day: typeof row.day === 'bigint' ? Number(row.day) : row.day,
    hits: typeof row.hits === 'bigint' ? Number(row.hits) : row.hits
  }));
}

const importDailyActivityTx = db.transaction((rows) => {
  rows.forEach((row) => {
    upsertDailyImportStmt.run(row);
  });
});

function importDailyActivity(data) {
  if (!Array.isArray(data) || !data.length) return 0;
  const rows = data.map(normalizeDailyEntry).filter(Boolean);
  if (!rows.length) return 0;
  importDailyActivityTx(rows);
  return rows.length;
}

function importDailyActivityFor(ids = [], data = []) {
  const normalizedIds = normalizeIdList(ids);
  if (!normalizedIds.length || !Array.isArray(data) || !data.length) return 0;
  const allowed = new Set(normalizedIds);
  const rows = data
    .map(normalizeDailyEntry)
    .filter((row) => row && allowed.has(row.counter_id));
  if (!rows.length) return 0;
  importDailyActivityTx(rows);
  return rows.length;
}

/* -------------------------------------------------------------------------- */
/* Last-hit seeding                                                           */
/* -------------------------------------------------------------------------- */
function seedLastHitsFromDaily(data = [], options = {}) {
  if (!Array.isArray(data) || !data.length) return 0;
  const allowedIds = Array.isArray(options.ids)
    ? new Set(normalizeIdList(options.ids))
    : null;
  const now = Date.now();
  const latestByCounter = new Map();

  data.forEach((raw) => {
    const row = normalizeDailyEntry(raw);
    if (!row) return;
    if (allowedIds && !allowedIds.has(row.counter_id)) return;

    const existing = latestByCounter.get(row.counter_id);
    if (!existing || row.day > existing)
      latestByCounter.set(row.counter_id, row.day);
  });

  if (!latestByCounter.size) return 0;

  let seeded = 0;
  latestByCounter.forEach((day, counterId) => {
    const lastHit = Math.min(day + DAY_MS - 1, now);
    const existingHit = getLastHitStmt.get(counterId);
    let existingTs = existingHit
      ? typeof existingHit.last_hit === 'bigint'
        ? Number(existingHit.last_hit)
        : existingHit.last_hit
      : 0;
    if (existingTs > now) {
      clampFutureHitsStmt.run(now, counterId, now);
      existingTs = now;
    }

    if (existingTs && existingTs >= lastHit) return;
    upsertHitStmt.run(counterId, 'import', lastHit);
    seeded += 1;
  });
  return seeded;
}

/* -------------------------------------------------------------------------- */
/* Database backup                                                            */
/* -------------------------------------------------------------------------- */
async function createDatabaseBackup(targetPath, dbPath) {
  if (!targetPath) throw new Error('backup_path_required');
  if (typeof db.backup === 'function') {
    await db.backup(targetPath);
    return;
  }
  db.pragma('wal_checkpoint(PASSIVE)');
  fs.copyFileSync(dbPath, targetPath);
}

return {
  // Counter backup import/export
  exportCounters,
  exportCountersByIds,
  importCounters,
  importCountersForOwner,

  // Daily activity backup
  exportDailyActivity,
  exportDailyActivityFor,
  importDailyActivity,
  importDailyActivityFor,
  seedLastHitsFromDaily,

  // Database backup
  createDatabaseBackup
  };
}

module.exports = createCounterBackupHelpers;
