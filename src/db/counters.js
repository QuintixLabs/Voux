/*
  src/db/counters.js

  Counter records, hit updates, and backup import/export.
*/

const fs = require('fs');

function createCountersApi(db, helpers, tagsApi) {
  const {
    DAY_MS,
    normalizeIdList,
    generateId,
    parseRequestedMode,
    normalizeSearch,
    extractIntegerDigits,
    normalizeDailyEntry,
    toSafeNumber
  } = helpers;

  const baseSelectFields = 'id, label, theme, note, value, created_at, count_mode, owner_id';
  let unlimitedThrottleMs = 0;

  const listCountersStmt = db.prepare(`SELECT ${baseSelectFields} FROM counters ORDER BY created_at DESC`);
  const listCountersByOwnerStmt = db.prepare(`SELECT ${baseSelectFields} FROM counters WHERE owner_id = ? ORDER BY created_at DESC`);
  const getCounterStmt = db.prepare(`SELECT ${baseSelectFields} FROM counters WHERE id = ?`);
  const getLastHitStmt = db.prepare('SELECT last_hit FROM hits WHERE counter_id = ? ORDER BY last_hit DESC LIMIT 1');
  const clampFutureHitsStmt = db.prepare('UPDATE hits SET last_hit = ? WHERE counter_id = ? AND last_hit > ?');
  const countHitsSinceStmt = db.prepare('SELECT COUNT(*) as total FROM hits WHERE counter_id = ? AND last_hit >= ?');
  const insertCounterStmt = db.prepare('INSERT INTO counters (id, label, theme, note, value, created_at, count_mode, owner_id) VALUES (@id, @label, @theme, @note, @value, @created_at, @count_mode, @owner_id)');
  const upsertCounterStmt = db.prepare(
    'INSERT INTO counters (id, label, theme, note, value, created_at, count_mode, owner_id) VALUES (@id, @label, @theme, @note, @value, @created_at, @count_mode, @owner_id) '
    + 'ON CONFLICT(id) DO UPDATE SET label=excluded.label, theme=excluded.theme, note=excluded.note, value=excluded.value, created_at=excluded.created_at, count_mode=excluded.count_mode, owner_id=excluded.owner_id'
  );
  const incrementCounterStmt = db.prepare('UPDATE counters SET value = value + 1 WHERE id = ?');
  const getHitStmt = db.prepare('SELECT last_hit FROM hits WHERE counter_id = ? AND ip = ?');
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
  const listDailyStmt = db.prepare('SELECT counter_id, day, hits FROM counter_daily ORDER BY counter_id, day');
  const getDailyTrendStmt = db.prepare(`SELECT day, hits FROM counter_daily WHERE counter_id = ? ORDER BY day DESC LIMIT ?`);

  const clearHitsStmt = db.prepare('DELETE FROM hits');
  const clearDailyStmt = db.prepare('DELETE FROM counter_daily');
  const deleteCounterStmt = db.prepare('DELETE FROM counters WHERE id = ?');
  const deleteAllCountersStmt = db.prepare('DELETE FROM counters');
  const deleteCountersByModeStmt = {
    unique: db.prepare("DELETE FROM counters WHERE count_mode <> 'unlimited'"),
    unlimited: db.prepare("DELETE FROM counters WHERE count_mode = 'unlimited'")
  };
  const deleteCountersByOwnerStmt = db.prepare('DELETE FROM counters WHERE owner_id = ?');
  const deleteCountersByOwnerAndModeStmt = {
    unique: db.prepare("DELETE FROM counters WHERE owner_id = ? AND count_mode <> 'unlimited'"),
    unlimited: db.prepare("DELETE FROM counters WHERE owner_id = ? AND count_mode = 'unlimited'")
  };

  const updateCounterValueStmt = db.prepare('UPDATE counters SET value = ? WHERE id = ?');
  const updateCounterMetaStmt = db.prepare('UPDATE counters SET label = @label, value = @value, note = @note WHERE id = @id');
  const countCountersStmt = db.prepare('SELECT COUNT(*) as total FROM counters');

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

  function buildCounterQuery({ search, mode, tags, limit, offset, count = false, sort = 'newest', inactiveBefore = null, ownerId = null }) {
    let sql = count ? 'SELECT COUNT(*) as total FROM counters' : `SELECT ${baseSelectFields} FROM counters`;
    const conditions = [];
    const params = {};
    const normalized = normalizeSearch(search);
    if (normalized) {
      conditions.push('(LOWER(id) LIKE @pattern OR LOWER(label) LIKE @pattern OR (note IS NOT NULL AND LOWER(note) LIKE @pattern))');
      params.pattern = normalized;
    }
    if (mode === 'unique') conditions.push("count_mode <> 'unlimited'");
    else if (mode === 'unlimited') conditions.push("count_mode = 'unlimited'");

    const tagFilters = Array.isArray(tags) ? tags.filter(Boolean) : [];
    if (tagFilters.length) {
      const placeholders = tagFilters.map((_, idx) => `@tag${idx}`);
      conditions.push(`id IN (SELECT counter_id FROM counter_tags WHERE tag_id IN (${placeholders.join(',')}) GROUP BY counter_id HAVING COUNT(DISTINCT tag_id) = ${tagFilters.length})`);
      tagFilters.forEach((tag, idx) => {
        params[`tag${idx}`] = tag;
      });
    }

    if (Number.isFinite(inactiveBefore)) {
      conditions.push('COALESCE((SELECT MAX(last_hit) FROM hits WHERE counter_id = counters.id), created_at) < @inactiveBefore');
      params.inactiveBefore = inactiveBefore;
    }
    if (ownerId) {
      conditions.push('owner_id = @ownerId');
      params.ownerId = ownerId;
    }
    if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;

    if (!count) {
      let orderBy = 'created_at DESC';
      if (sort === 'oldest') orderBy = 'created_at ASC';
      else if (sort === 'views') orderBy = 'value DESC, created_at DESC';
      else if (sort === 'views_asc') orderBy = 'value ASC, created_at ASC';
      else if (sort === 'last_hit') orderBy = 'COALESCE((SELECT MAX(last_hit) FROM hits WHERE counter_id = counters.id), 0) DESC, created_at DESC';
      sql += ` ORDER BY ${orderBy} LIMIT @limit OFFSET @offset`;
      params.limit = limit;
      params.offset = offset;
    }
    return { sql, params };
  }

  const recordHitTx = db.transaction((counterId, ip, now) => {
    const counter = getCounterStmt.get(counterId);
    if (!counter) return null;
    const effectiveCooldownMs = counter.count_mode === 'unlimited' ? unlimitedThrottleMs : null;

    let shouldIncrement = true;
    if (ip) {
      const existingHit = getHitStmt.get(counterId, ip);
      if (existingHit) {
        const lastHitTs = typeof existingHit.last_hit === 'bigint' ? Number(existingHit.last_hit) : existingHit.last_hit;
        if (effectiveCooldownMs === null) shouldIncrement = false;
        else if (effectiveCooldownMs > 0) shouldIncrement = now - lastHitTs >= effectiveCooldownMs;
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

  function createCounter({ label, theme = 'plain', startValue, mode, tags = [], ownerId = null }) {
    let initialValue = 0n;
    if (typeof startValue === 'bigint') initialValue = startValue >= 0n ? startValue : 0n;
    else if (typeof startValue === 'number' && Number.isFinite(startValue) && startValue >= 0) initialValue = BigInt(Math.floor(startValue));

    const modeResult = parseRequestedMode(mode);
    if (modeResult.error) throw new Error(modeResult.error);

    const counter = {
      id: generateId(8),
      label,
      theme,
      note: null,
      value: initialValue,
      created_at: Date.now(),
      count_mode: modeResult.mode,
      owner_id: ownerId || null
    };
    insertCounterStmt.run(counter);
    counter.tags = tagsApi.replaceCounterTags(counter.id, tags, counter.owner_id);
    return counter;
  }

  function listCounters() {
    return tagsApi.attachTagsToCounters(listCountersStmt.all());
  }

  function listCountersPage(limit, offset, search, mode, tags, sort, inactiveBefore, ownerId) {
    const { sql, params } = buildCounterQuery({ search, mode, tags, limit, offset, sort, inactiveBefore, ownerId });
    const rows = db.prepare(sql).all(params);
    return tagsApi.attachTagsToCounters(rows);
  }

  function countCounters(search, mode, tags, inactiveBefore, ownerId) {
    const { sql, params } = buildCounterQuery({ search, mode, tags, count: true, inactiveBefore, ownerId });
    const { total } = db.prepare(sql).get(params);
    const normalized = typeof total === 'bigint' ? Number(total) : total;
    return Number.isFinite(normalized) ? normalized : 0;
  }

  function getCounter(id) {
    const row = getCounterStmt.get(id);
    if (!row) return null;
    const [withTags] = tagsApi.attachTagsToCounters([row]);
    return withTags;
  }

  function recordHit(counterId, ip) {
    return recordHitTx(counterId, ip || 'unknown', Date.now());
  }

  function updateCounterValue(id, value) {
    return updateCounterValueStmt.run(value, id).changes > 0;
  }

  function updateCounterMetadata(id, { label, value, note, tags, ownerId = null }) {
    const result = updateCounterMetaStmt.run({ id, label, value, note: note || null });
    if (Array.isArray(tags)) {
      tagsApi.replaceCounterTags(id, tags, ownerId);
    }
    return result.changes > 0;
  }

  function deleteCounter(id) {
    return deleteCounterStmt.run(id).changes > 0;
  }

  function deleteInactiveCountersOlderThan(days) {
    const threshold = Date.now() - Math.max(1, days) * DAY_MS;
    const counters = listCounters();
    let removed = 0;
    counters.forEach((counter) => {
      const lastHit = getLastHitTimestamp(counter.id);
      const reference = lastHit || counter.created_at;
      if (reference !== null && reference < threshold && deleteCounter(counter.id)) {
        removed += 1;
      }
    });
    return removed;
  }

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

  function getLastHitTimestamp(counterId) {
    const row = getLastHitStmt.get(counterId);
    if (!row) return null;
    return typeof row.last_hit === 'bigint' ? Number(row.last_hit) : row.last_hit;
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
    const map = new Map(rows.map((row) => [typeof row.day === 'bigint' ? Number(row.day) : row.day, typeof row.hits === 'bigint' ? Number(row.hits) : row.hits]));
    const trend = [];
    const todayStart = getDayStartTimestamp(Date.now());
    for (let i = limit - 1; i >= 0; i -= 1) {
      const dayStart = todayStart - i * DAY_MS;
      trend.push({ day: dayStart, hits: map.get(dayStart) || 0 });
    }
    return trend;
  }

  function exportCounters(ownerId = null) {
    if (!ownerId) return listCounters();
    return tagsApi.attachTagsToCounters(listCountersByOwnerStmt.all(ownerId));
  }

  function exportCountersByIds(ids = [], ownerId = null) {
    const normalized = normalizeIdList(ids);
    if (!normalized.length) return [];
    const placeholders = normalized.map(() => '?').join(',');
    let sql = `SELECT ${baseSelectFields} FROM counters WHERE id IN (${placeholders})`;
    const params = [...normalized];
    if (ownerId) {
      sql += ' AND owner_id = ?';
      params.push(ownerId);
    }
    sql += ' ORDER BY created_at DESC';
    const rows = db.prepare(sql).all(params);
    return tagsApi.attachTagsToCounters(rows);
  }

  const importCountersTx = db.transaction((items, replaceExisting, tagOwnerId) => {
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
  });

  const importCountersByOwnerTx = db.transaction((items, replaceExisting, ownerId) => {
    if (replaceExisting) {
      deleteCountersByOwnerStmt.run(ownerId);
    }
    items.forEach((item) => {
      upsertCounterStmt.run(item);
      tagsApi.replaceCounterTags(item.id, item.tags, ownerId);
    });
  });

  function normalizeImportedCounter(raw, tagOwnerId = null) {
    if (!raw || typeof raw !== 'object') return null;
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    if (!id) return null;
    const modeResult = parseRequestedMode(raw.count_mode ?? raw.mode ?? raw.ip_cooldown_hours);
    if (modeResult.error) return null;

    let ownerId = typeof raw.owner_id === 'string' && raw.owner_id.trim() ? raw.owner_id.trim().slice(0, 64) : null;
    if (!ownerId && tagOwnerId) ownerId = tagOwnerId;
    const tagScope = tagOwnerId || ownerId || null;

    const normalizedValue = extractIntegerDigits(raw.value);
    if (normalizedValue === null) return null;

    const createdAtRaw = Number(raw.created_at);
    const created_at = Number.isFinite(createdAtRaw) && createdAtRaw > 0 ? createdAtRaw : Date.now();

    return {
      id: id.slice(0, 64),
      label: typeof raw.label === 'string' ? raw.label.trim().slice(0, 80) : '',
      theme: typeof raw.theme === 'string' && raw.theme.trim() ? raw.theme.trim().slice(0, 40) : 'plain',
      note: typeof raw.note === 'string' ? raw.note.trim().slice(0, 200) || null : null,
      value: normalizedValue,
      created_at,
      count_mode: modeResult.mode,
      owner_id: ownerId,
      tags: tagsApi.filterTagIds(Array.isArray(raw.tags) ? raw.tags : [], tagScope)
    };
  }

  function importCounters(data, options = {}) {
    if (!Array.isArray(data)) throw new Error('invalid_backup_format');
    const normalized = data.map((item) => normalizeImportedCounter(item, options.tagOwnerId || null)).filter(Boolean);
    if (!normalized.length) throw new Error('no_valid_counters');
    importCountersTx(normalized, Boolean(options.replace), options.tagOwnerId || null);
    return normalized.length;
  }

  function importCountersForOwner(data, options = {}, ownerId) {
    if (!ownerId) throw new Error('owner_required');
    if (!Array.isArray(data)) throw new Error('invalid_backup_format');

    const normalizedRaw = data.map((item) => normalizeImportedCounter(item, ownerId)).filter(Boolean);
    const hasForeignOwner = normalizedRaw.some((counter) => counter.owner_id && counter.owner_id !== ownerId);
    if (hasForeignOwner) throw new Error('backup_not_owned');

    const normalized = normalizedRaw.map((counter) => ({ ...counter, owner_id: ownerId }));
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
    const rows = db.prepare(`SELECT counter_id, day, hits FROM counter_daily WHERE counter_id IN (${placeholders}) ORDER BY counter_id, day`).all(normalized);
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
    const rows = data.map(normalizeDailyEntry).filter((row) => row && allowed.has(row.counter_id));
    if (!rows.length) return 0;
    importDailyActivityTx(rows);
    return rows.length;
  }

  function seedLastHitsFromDaily(data = [], options = {}) {
    if (!Array.isArray(data) || !data.length) return 0;
    const allowedIds = Array.isArray(options.ids) ? new Set(normalizeIdList(options.ids)) : null;
    const now = Date.now();
    const latestByCounter = new Map();

    data.forEach((raw) => {
      const row = normalizeDailyEntry(raw);
      if (!row) return;
      if (allowedIds && !allowedIds.has(row.counter_id)) return;
      const existing = latestByCounter.get(row.counter_id);
      if (!existing || row.day > existing) latestByCounter.set(row.counter_id, row.day);
    });

    if (!latestByCounter.size) return 0;

    let seeded = 0;
    latestByCounter.forEach((day, counterId) => {
      const lastHit = Math.min(day + DAY_MS - 1, now);
      const existingHit = getLastHitStmt.get(counterId);
      let existingTs = existingHit ? (typeof existingHit.last_hit === 'bigint' ? Number(existingHit.last_hit) : existingHit.last_hit) : 0;
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

  async function createDatabaseBackup(targetPath, dbPath) {
    if (!targetPath) throw new Error('backup_path_required');
    if (typeof db.backup === 'function') {
      await db.backup(targetPath);
      return;
    }
    db.pragma('wal_checkpoint(PASSIVE)');
    fs.copyFileSync(dbPath, targetPath);
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
    countCounters,
    getLastHitTimestamp,
    countHitsSince,
    getCounterDailyTrend,
    exportDailyActivity,
    exportDailyActivityFor,
    importDailyActivity,
    importDailyActivityFor,
    seedLastHitsFromDaily,
    exportCounters,
    exportCountersByIds,
    importCounters,
    importCountersForOwner,
    updateCounterValue,
    updateCounterMetadata,
    setUnlimitedThrottle,
    describeModeLabel: helpers.describeModeLabel,
    parseRequestedMode,
    createDatabaseBackup: (targetPath, dbPath) => createDatabaseBackup(targetPath, dbPath)
  };
}

module.exports = createCountersApi;
