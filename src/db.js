/*
  db.js

  Database access for counters, hits, daily activity, tags, and API keys.
*/

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { filterTagIds } = require('./configStore');

const DATA_DIR = path.resolve(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const dbPath = path.join(DATA_DIR, 'counters.db');
const db = new Database(dbPath);
db.defaultSafeIntegers(true);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
let unlimitedThrottleMs = 0;

db.exec(`
  CREATE TABLE IF NOT EXISTS counters (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    theme TEXT NOT NULL,
    note TEXT,
    value INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    count_mode TEXT NOT NULL DEFAULT 'unique'
  );

  CREATE TABLE IF NOT EXISTS hits (
    counter_id TEXT NOT NULL,
    ip TEXT NOT NULL,
    last_hit INTEGER NOT NULL,
    PRIMARY KEY (counter_id, ip),
    FOREIGN KEY (counter_id) REFERENCES counters(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS counter_daily (
    counter_id TEXT NOT NULL,
    day INTEGER NOT NULL,
    hits INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (counter_id, day),
    FOREIGN KEY (counter_id) REFERENCES counters(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_counter_daily_day ON counter_daily(day);

  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    scope TEXT NOT NULL DEFAULT 'global',
    allowed_counters TEXT,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER,
    disabled INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS counter_tags (
    counter_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (counter_id, tag_id),
    FOREIGN KEY (counter_id) REFERENCES counters(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_counter_tags_tag ON counter_tags(tag_id);
`);

const baseSelectFields = 'id, label, theme, note, value, created_at, count_mode';

const listCountersStmt = db.prepare(`SELECT ${baseSelectFields} FROM counters ORDER BY created_at DESC`);
const getCounterStmt = db.prepare(`SELECT ${baseSelectFields} FROM counters WHERE id = ?`);
const getLastHitStmt = db.prepare('SELECT last_hit FROM hits WHERE counter_id = ? ORDER BY last_hit DESC LIMIT 1');
const countHitsSinceStmt = db.prepare('SELECT COUNT(*) as total FROM hits WHERE counter_id = ? AND last_hit >= ?');
const insertCounterStmt = db.prepare(
  'INSERT INTO counters (id, label, theme, note, value, created_at, count_mode) VALUES (@id, @label, @theme, @note, @value, @created_at, @count_mode)'
);
const upsertCounterStmt = db.prepare(
  'INSERT INTO counters (id, label, theme, note, value, created_at, count_mode) VALUES (@id, @label, @theme, @note, @value, @created_at, @count_mode) '
    + 'ON CONFLICT(id) DO UPDATE SET label=excluded.label, theme=excluded.theme, note=excluded.note, value=excluded.value, created_at=excluded.created_at, count_mode=excluded.count_mode'
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
const getDailyTrendStmt = db.prepare(`
  SELECT day, hits
  FROM counter_daily
  WHERE counter_id = ?
  ORDER BY day DESC
  LIMIT ?
`);
const pruneHitsStmt = db.prepare('DELETE FROM hits WHERE last_hit < ?');
const clearHitsStmt = db.prepare('DELETE FROM hits');
const clearDailyStmt = db.prepare('DELETE FROM counter_daily');
const deleteCounterStmt = db.prepare('DELETE FROM counters WHERE id = ?');
const updateCounterValueStmt = db.prepare('UPDATE counters SET value = ? WHERE id = ?');
const updateCounterMetaStmt = db.prepare('UPDATE counters SET label = @label, value = @value, note = @note WHERE id = @id');
const countCountersStmt = db.prepare('SELECT COUNT(*) as total FROM counters');
const deleteAllCountersStmt = db.prepare('DELETE FROM counters');
const deleteCountersByModeStmt = {
  unique: db.prepare("DELETE FROM counters WHERE count_mode <> 'unlimited'"),
  unlimited: db.prepare("DELETE FROM counters WHERE count_mode = 'unlimited'")
};
const insertApiKeyStmt = db.prepare(`
  INSERT INTO api_keys (id, name, token_hash, scope, allowed_counters, created_at, last_used_at, disabled)
  VALUES (@id, @name, @token_hash, @scope, @allowed_counters, @created_at, NULL, 0)
`);
const listApiKeysStmt = db.prepare('SELECT id, name, scope, allowed_counters, created_at, last_used_at, disabled FROM api_keys ORDER BY created_at DESC');
const deleteApiKeyStmt = db.prepare('DELETE FROM api_keys WHERE id = ?');
const selectApiKeyByHashStmt = db.prepare('SELECT id, name, scope, allowed_counters, created_at, last_used_at, disabled FROM api_keys WHERE token_hash = ? AND disabled = 0');
const updateApiKeyUsageStmt = db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?');
const insertCounterTagStmt = db.prepare('INSERT OR IGNORE INTO counter_tags (counter_id, tag_id) VALUES (?, ?)');
const deleteCounterTagsStmt = db.prepare('DELETE FROM counter_tags WHERE counter_id = ?');
const deleteTagsByTagStmt = db.prepare('DELETE FROM counter_tags WHERE tag_id = ?');

function buildCounterQuery({ search, mode, tags, limit, offset, count = false, sort = 'newest', inactiveBefore = null }) {
  let sql = count ? 'SELECT COUNT(*) as total FROM counters' : `SELECT ${baseSelectFields} FROM counters`;
  const conditions = [];
  const params = {};
  const normalizedSearch = normalizeSearch(search);
  if (normalizedSearch) {
    conditions.push('(LOWER(id) LIKE @pattern OR LOWER(label) LIKE @pattern OR (note IS NOT NULL AND LOWER(note) LIKE @pattern))');
    params.pattern = normalizedSearch;
  }
  if (mode === 'unique') {
    conditions.push("count_mode <> 'unlimited'");
  } else if (mode === 'unlimited') {
    conditions.push("count_mode = 'unlimited'");
  }
  const tagFilters = Array.isArray(tags) ? tags.filter(Boolean) : [];
  if (tagFilters.length) {
    const placeholders = tagFilters.map((_, idx) => `@tag${idx}`);
    conditions.push(
      `id IN (
        SELECT counter_id
        FROM counter_tags
        WHERE tag_id IN (${placeholders.join(',')})
        GROUP BY counter_id
        HAVING COUNT(DISTINCT tag_id) = ${tagFilters.length}
      )`
    );
    tagFilters.forEach((tag, idx) => {
      params[`tag${idx}`] = tag;
    });
  }
  if (Number.isFinite(inactiveBefore)) {
    conditions.push(
      `COALESCE((SELECT MAX(last_hit) FROM hits WHERE counter_id = counters.id), created_at) < @inactiveBefore`
    );
    params.inactiveBefore = inactiveBefore;
  }
  if (conditions.length) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }
  if (!count) {
    let orderBy = 'created_at DESC';
    if (sort === 'oldest') {
      orderBy = 'created_at ASC';
    } else if (sort === 'views') {
      orderBy = 'value DESC, created_at DESC';
    } else if (sort === 'views_asc') {
      orderBy = 'value ASC, created_at ASC';
    } else if (sort === 'last_hit') {
      orderBy = `COALESCE((SELECT MAX(last_hit) FROM hits WHERE counter_id = counters.id), 0) DESC, created_at DESC`;
    }
    sql += ` ORDER BY ${orderBy} LIMIT @limit OFFSET @offset`;
    params.limit = limit;
    params.offset = offset;
  }
  return { sql, params };
}

const recordHitTx = db.transaction((counterId, ip, now) => {
  const counter = getCounterStmt.get(counterId);
  if (!counter) {
    return null;
  }
  const effectiveCooldownMs = counter.count_mode === 'unlimited' ? unlimitedThrottleMs : null;

  let shouldIncrement = true;
  let existingHit = null;
  if (ip) {
    existingHit = getHitStmt.get(counterId, ip);
    if (existingHit) {
      const lastHitTs = typeof existingHit.last_hit === 'bigint' ? Number(existingHit.last_hit) : existingHit.last_hit;
      if (effectiveCooldownMs === null) {
        shouldIncrement = false;
      } else if (effectiveCooldownMs === 0) {
        shouldIncrement = true;
      } else {
        const elapsed = now - lastHitTs;
        shouldIncrement = elapsed >= effectiveCooldownMs;
      }
    }
  }

  if (shouldIncrement) {
    incrementCounterStmt.run(counterId);
    if (ip) {
      upsertHitStmt.run(counterId, ip, now);
    }
    recordDailyHit(counterId, now);
  }

  const updated = getCounterStmt.get(counterId);
  return { counter: updated, incremented: shouldIncrement };
});

function createCounter({ label, theme = 'plain', startValue, mode, tags = [] }) {
  let initialValue = 0n;
  if (typeof startValue === 'bigint') {
    initialValue = startValue >= 0n ? startValue : 0n;
  } else if (typeof startValue === 'number' && Number.isFinite(startValue) && startValue >= 0) {
    initialValue = BigInt(Math.floor(startValue));
  }
  const modeResult = parseRequestedMode(mode);
  if (modeResult.error) {
    throw new Error(modeResult.error);
  }
  const counter = {
    id: generateId(8),
    label,
    theme,
    note: null,
    value: initialValue,
    created_at: Date.now(),
    count_mode: modeResult.mode
  };
  insertCounterStmt.run(counter);
  const appliedTags = replaceCounterTags(counter.id, tags);
  counter.tags = appliedTags;
  return counter;
}

function listCounters() {
  return attachTagsToCounters(listCountersStmt.all());
}

function listCountersPage(limit, offset, search, mode, tags, sort, inactiveBefore) {
  const { sql, params } = buildCounterQuery({ search, mode, tags, limit, offset, sort, inactiveBefore });
  const rows = db.prepare(sql).all(params);
  return attachTagsToCounters(rows);
}

function countCounters(search, mode, tags, inactiveBefore) {
  const { sql, params } = buildCounterQuery({ search, mode, tags, count: true, inactiveBefore });
  const { total } = db.prepare(sql).get(params);
  const normalized = typeof total === 'bigint' ? Number(total) : total;
  return Number.isFinite(normalized) ? normalized : 0;
}

function normalizeSearch(search) {
  if (!search && search !== 0) return null;
  const value = String(search).trim().toLowerCase();
  if (!value) return null;
  return `%${value}%`;
}

function getCounter(id) {
  const counter = getCounterStmt.get(id);
  if (!counter) return null;
  const [withTags] = attachTagsToCounters([counter]);
  return withTags;
}

function recordHit(counterId, ip) {
  return recordHitTx(counterId, ip, Date.now());
}

function updateCounterValue(id, value) {
  const result = updateCounterValueStmt.run(value, id);
  return result.changes > 0;
}

function updateCounterMetadata(id, { label, value, note, tags }) {
  const payload = {
    id,
    label,
    value,
    note: note || null
  };
  const result = updateCounterMetaStmt.run(payload);
  if (Array.isArray(tags)) {
    replaceCounterTags(id, tags);
  }
  return result.changes > 0;
}

function deleteCounter(id) {
  const result = deleteCounterStmt.run(id);
  return result.changes > 0;
}

function deleteInactiveCountersOlderThan(days) {
  const threshold = Date.now() - Math.max(1, days) * DAY_MS;
  const counters = listCounters();
  let removed = 0;
  counters.forEach((counter) => {
    const lastHit = getLastHitTimestamp(counter.id);
    const reference = lastHit || counter.created_at;
    if (reference !== null && reference < threshold) {
      if (deleteCounter(counter.id)) {
        removed += 1;
      }
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
  const result = statement.run();
  return result.changes || 0;
}

function getLastHitTimestamp(counterId) {
  const row = getLastHitStmt.get(counterId);
  if (!row) return null;
  const ts = row.last_hit;
  return typeof ts === 'bigint' ? Number(ts) : ts;
}

function countHitsSince(counterId, sinceTimestamp) {
  if (sinceTimestamp === undefined || sinceTimestamp === null) {
    return 0;
  }
  const row = countHitsSinceStmt.get(counterId, sinceTimestamp);
  if (!row) return 0;
  const total = typeof row.total === 'bigint' ? Number(row.total) : row.total;
  return Number.isFinite(total) ? total : 0;
}

function getCounterDailyTrend(counterId, days = 7) {
  const limit = Math.max(1, Math.min(30, Number(days) || 7));
  const rows = getDailyTrendStmt.all(counterId, limit);
  const map = new Map(
    rows.map((row) => {
      const day = typeof row.day === 'bigint' ? Number(row.day) : row.day;
      const hits = typeof row.hits === 'bigint' ? Number(row.hits) : row.hits;
      return [day, hits];
    })
  );
  const trend = [];
  const todayStart = getDayStartTimestamp(Date.now());
  for (let i = limit - 1; i >= 0; i -= 1) {
    const dayStart = todayStart - i * DAY_MS;
    trend.push({
      day: dayStart,
      hits: map.get(dayStart) || 0
    });
  }
  return trend;
}

function exportCounters() {
  return listCounters();
}

function exportCountersByIds(ids = []) {
  const normalized = normalizeIdList(ids);
  if (!normalized.length) return [];
  const placeholders = normalized.map(() => '?').join(',');
  const stmt = db.prepare(`SELECT ${baseSelectFields} FROM counters WHERE id IN (${placeholders}) ORDER BY created_at DESC`);
  const rows = stmt.all(normalized);
  return attachTagsToCounters(rows);
}

function importCounters(data, options = {}) {
  if (!Array.isArray(data)) {
    throw new Error('invalid_backup_format');
  }
  const normalized = data
    .map(normalizeImportedCounter)
    .filter(Boolean);
  if (!normalized.length) {
    throw new Error('no_valid_counters');
  }
  importCountersTx(normalized, Boolean(options.replace));
  return normalized.length;
}

const importCountersTx = db.transaction((items, replaceExisting) => {
  if (replaceExisting) {
    deleteAllCountersStmt.run();
    clearHitsStmt.run();
    clearDailyStmt.run();
  }
  items.forEach((item) => {
    upsertCounterStmt.run(item);
    replaceCounterTags(item.id, item.tags);
  });
});

function normalizeImportedCounter(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id) return null;
  const label = typeof raw.label === 'string' ? raw.label.trim().slice(0, 80) : '';
  const note = typeof raw.note === 'string' ? raw.note.trim().slice(0, 200) : '';
  const theme = typeof raw.theme === 'string' && raw.theme.trim() ? raw.theme.trim().slice(0, 40) : 'plain';
  const normalizedValue = extractIntegerDigits(raw.value);
  if (normalizedValue === null) return null;
  const createdAtRaw = Number(raw.created_at);
  const created_at = Number.isFinite(createdAtRaw) && createdAtRaw > 0 ? createdAtRaw : Date.now();
  const modeInput = raw.count_mode ?? raw.mode ?? raw.ip_cooldown_hours;
  const modeResult = parseRequestedMode(modeInput);
  if (modeResult.error) {
    return null;
  }
  return {
    id: id.slice(0, 64),
    label,
    theme,
    note: note || null,
    value: normalizedValue,
    created_at,
    count_mode: modeResult.mode,
    tags: filterTagIds(Array.isArray(raw.tags) ? raw.tags : [])
  };
}

function extractIntegerDigits(value) {
  if (value === undefined || value === null) return 0n;
  const raw = typeof value === 'bigint' ? value.toString() : String(value || '');
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return 0n;
  if (digits.length > 18) {
    return null;
  }
  try {
    return BigInt(digits);
  } catch (_) {
    return null;
  }
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
  const stmt = db.prepare(
    `SELECT counter_id, day, hits FROM counter_daily WHERE counter_id IN (${placeholders}) ORDER BY counter_id, day`
  );
  return stmt.all(normalized).map((row) => ({
    counter_id: row.counter_id,
    day: typeof row.day === 'bigint' ? Number(row.day) : row.day,
    hits: typeof row.hits === 'bigint' ? Number(row.hits) : row.hits
  }));
}

function importDailyActivity(data) {
  if (!Array.isArray(data) || !data.length) {
    return 0;
  }
  const rows = data.map(normalizeDailyEntry).filter(Boolean);
  if (!rows.length) {
    return 0;
  }
  importDailyActivityTx(rows);
  return rows.length;
}

const importDailyActivityTx = db.transaction((rows) => {
  rows.forEach((row) => {
    upsertDailyImportStmt.run(row);
  });
});

function normalizeDailyEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const counterId = typeof raw.counter_id === 'string' ? raw.counter_id.trim() : '';
  if (!counterId) return null;
  const day = Number(raw.day);
  const hits = Number(raw.hits);
  if (!Number.isFinite(day) || !Number.isFinite(hits) || hits < 0) {
    return null;
  }
  return {
    counter_id: counterId.slice(0, 64),
    day: Math.floor(day),
    hits: Math.floor(hits)
  };
}

function createApiKey({ name, scope = 'global', counters = [] }) {
  const trimmedName = String(name || '').trim().slice(0, 80);
  if (!trimmedName) {
    throw new Error('name_required');
  }
  const normalizedScope = scope === 'limited' ? 'limited' : 'global';
  let allowed = [];
  if (normalizedScope === 'limited') {
    allowed = Array.isArray(counters)
      ? counters
          .map((value) => String(value || '').trim().slice(0, 64))
          .filter(Boolean)
      : [];
    if (!allowed.length) {
      throw new Error('counters_required');
    }
  }
  const token = generateApiKeyToken();
  const record = {
    id: `key_${generateId(10)}`,
    name: trimmedName,
    token_hash: hashToken(token),
    scope: normalizedScope,
    allowed_counters: allowed.length ? JSON.stringify(allowed) : null,
    created_at: Date.now()
  };
  insertApiKeyStmt.run(record);
  const key = normalizeApiKeyRow({ ...record, last_used_at: null, disabled: 0 });
  return { token, key };
}

function listApiKeys() {
  return listApiKeysStmt.all().map(normalizeApiKeyRow);
}

function deleteApiKey(id) {
  if (!id) return false;
  const result = deleteApiKeyStmt.run(id);
  return result.changes > 0;
}

function findApiKeyByToken(token) {
  if (!token) return null;
  const hash = hashToken(token);
  const row = selectApiKeyByHashStmt.get(hash);
  if (!row || row.disabled) return null;
  return normalizeApiKeyRow(row);
}

function recordApiKeyUsage(id) {
  if (!id) return;
  try {
    updateApiKeyUsageStmt.run(Date.now(), id);
  } catch (error) {
    console.warn('Failed to record API key usage', error);
  }
}

function replaceCounterTags(counterId, tags = []) {
  if (!counterId) return [];
  const filtered = filterTagIds(Array.isArray(tags) ? tags : []);
  replaceCounterTagsTx(counterId, filtered);
  return filtered;
}

const replaceCounterTagsTx = db.transaction((counterId, tags) => {
  deleteCounterTagsStmt.run(counterId);
  tags.forEach((tagId) => {
    insertCounterTagStmt.run(counterId, tagId);
  });
});

function attachTagsToCounters(rows = []) {
  if (!Array.isArray(rows) || !rows.length) {
    return rows.map((row) => ({
      ...row,
      tags: []
    }));
  }
  const ids = rows.map((row) => row.id);
  const tagRows = fetchTagsForCounters(ids);
  const map = new Map();
  tagRows.forEach((entry) => {
    if (!map.has(entry.counter_id)) {
      map.set(entry.counter_id, []);
    }
    map.get(entry.counter_id).push(entry.tag_id);
  });
  return rows.map((row) => ({
    ...row,
    tags: map.get(row.id) || []
  }));
}

function fetchTagsForCounters(ids = []) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const stmt = db.prepare(`SELECT counter_id, tag_id FROM counter_tags WHERE counter_id IN (${placeholders}) ORDER BY rowid`);
  return stmt.all(ids);
}

module.exports = {
  createCounter,
  listCounters,
  listCountersPage,
  getCounter,
  recordHit,
  deleteCounter,
  deleteAllCounters,
  deleteCountersByMode,
  deleteInactiveCountersOlderThan,
  countCounters,
  getLastHitTimestamp,
  countHitsSince,
  getCounterDailyTrend,
  exportDailyActivity,
  exportDailyActivityFor,
  importDailyActivity,
  exportCounters,
  exportCountersByIds,
  importCounters,
  updateCounterValue,
  updateCounterMetadata,
  setUnlimitedThrottle,
  createApiKey,
  listApiKeys,
  deleteApiKey,
  findApiKeyByToken,
  recordApiKeyUsage,
  describeModeLabel,
  parseRequestedMode,
  removeTagAssignments
};

function normalizeIdList(ids, limit = 200) {
  if (!Array.isArray(ids)) return [];
  const normalized = [];
  const seen = new Set();
  ids.forEach((value) => {
    const id = typeof value === 'string' ? value.trim() : '';
    if (id && !seen.has(id)) {
      normalized.push(id.slice(0, 64));
      seen.add(id);
    }
  });
  return normalized.slice(0, limit);
}

function generateId(length = 8) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(length);
  let id = '';
  for (let i = 0; i < length; i += 1) {
    id += alphabet[bytes[i] % alphabet.length];
  }
  return id;
}

function describeModeLabel(mode) {
  return mode === 'unlimited' ? 'Every visit' : 'Unique visitors';
}

function parseRequestedMode(input) {
  if (input === undefined || input === null || input === '' || input === 'default') {
    return { mode: 'unique' };
  }
  const normalized = String(input).trim().toLowerCase();
  if (normalized === 'unique') {
    return { mode: 'unique' };
  }
  if (normalized === 'unlimited') {
    return { mode: 'unlimited' };
  }
  return { error: 'mode must be "unique" or "unlimited"' };
}

const DAY_MS = 24 * 60 * 60 * 1000;

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

function setUnlimitedThrottle(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) {
    unlimitedThrottleMs = 0;
  } else {
    unlimitedThrottleMs = Math.round(value);
  }
}

function generateApiKeyToken() {
  const random = crypto.randomBytes(10).toString('hex');
  return `voux_${random}`;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function normalizeApiKeyRow(row) {
  if (!row) return null;
  const normalizeTimestamp = (value) => {
    if (value == null) return null;
    if (typeof value === 'bigint') return Number(value);
    return Number(value);
  };
  let allowed = [];
  if (row.allowed_counters) {
    try {
      const parsed = JSON.parse(row.allowed_counters);
      if (Array.isArray(parsed)) {
        allowed = parsed.map((item) => String(item)).filter(Boolean);
      }
    } catch (_) {
      allowed = [];
    }
  }
  return {
    id: row.id,
    name: row.name,
    scope: row.scope === 'limited' ? 'limited' : 'global',
    allowedCounters: allowed,
    createdAt: normalizeTimestamp(row.created_at) || 0,
    lastUsedAt: normalizeTimestamp(row.last_used_at),
    disabled: Boolean(row.disabled)
  };
}
function removeTagAssignments(tagId) {
  if (!tagId) return 0;
  const result = deleteTagsByTagStmt.run(tagId);
  return result.changes || 0;
}
