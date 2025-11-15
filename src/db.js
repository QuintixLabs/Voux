const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const DATA_DIR = path.resolve(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const dbPath = path.join(DATA_DIR, 'counters.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

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

function buildCounterQuery({ search, mode, limit, offset, count = false }) {
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
  if (conditions.length) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }
  if (!count) {
    sql += ' ORDER BY created_at DESC LIMIT @limit OFFSET @offset';
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
  const effectiveCooldownMs = counter.count_mode === 'unlimited' ? 0 : null;

  let shouldIncrement = true;
  let existingHit = null;
  if (ip) {
    existingHit = getHitStmt.get(counterId, ip);
    if (existingHit) {
      if (effectiveCooldownMs === null) {
        shouldIncrement = false;
      } else if (effectiveCooldownMs === 0) {
        shouldIncrement = true;
      } else {
        const elapsed = now - existingHit.last_hit;
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

function createCounter({ label, theme = 'plain', startValue, mode }) {
  const initialValue =
    typeof startValue === 'number' && Number.isFinite(startValue) && startValue >= 0
      ? Math.floor(startValue)
      : 0;
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
  return counter;
}

function listCounters() {
  return listCountersStmt.all();
}

function listCountersPage(limit, offset, search, mode) {
  const { sql, params } = buildCounterQuery({ search, mode, limit, offset });
  return db.prepare(sql).all(params);
}

function countCounters(search, mode) {
  const { sql, params } = buildCounterQuery({ search, mode, count: true });
  const { total } = db.prepare(sql).get(params);
  return total;
}

function normalizeSearch(search) {
  if (!search && search !== 0) return null;
  const value = String(search).trim().toLowerCase();
  if (!value) return null;
  return `%${value}%`;
}

function getCounter(id) {
  return getCounterStmt.get(id);
}

function recordHit(counterId, ip) {
  return recordHitTx(counterId, ip, Date.now());
}

function updateCounterValue(id, value) {
  const result = updateCounterValueStmt.run(value, id);
  return result.changes > 0;
}

function updateCounterMetadata(id, { label, value, note }) {
  const payload = {
    id,
    label,
    value,
    note: note || null
  };
  const result = updateCounterMetaStmt.run(payload);
  return result.changes > 0;
}

function deleteCounter(id) {
  const result = deleteCounterStmt.run(id);
  return result.changes > 0;
}

const deleteAllCounters = db.transaction(() => {
  const { total } = countCountersStmt.get();
  deleteAllCountersStmt.run();
  return total;
});

function deleteCountersByMode(mode) {
  const statement = deleteCountersByModeStmt[mode];
  if (!statement) return 0;
  const result = statement.run();
  return result.changes || 0;
}

function getLastHitTimestamp(counterId) {
  const row = getLastHitStmt.get(counterId);
  return row ? row.last_hit : null;
}

function countHitsSince(counterId, sinceTimestamp) {
  if (sinceTimestamp === undefined || sinceTimestamp === null) {
    return 0;
  }
  const row = countHitsSinceStmt.get(counterId, sinceTimestamp);
  return row && typeof row.total === 'number' ? row.total : 0;
}

function getCounterDailyTrend(counterId, days = 7) {
  const limit = Math.max(1, Math.min(30, Number(days) || 7));
  const rows = getDailyTrendStmt.all(counterId, limit);
  const map = new Map(rows.map((row) => [row.day, row.hits]));
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
  return listCountersStmt.all();
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
  });
});

function normalizeImportedCounter(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id) return null;
  const label = typeof raw.label === 'string' ? raw.label.trim().slice(0, 80) : '';
  const note = typeof raw.note === 'string' ? raw.note.trim().slice(0, 200) : '';
  const theme = typeof raw.theme === 'string' && raw.theme.trim() ? raw.theme.trim().slice(0, 40) : 'plain';
  const value = Number(raw.value);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
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
    value: Math.floor(value),
    created_at,
    count_mode: modeResult.mode
  };
}

function exportDailyActivity() {
  return listDailyStmt.all();
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

module.exports = {
  createCounter,
  listCounters,
  listCountersPage,
  getCounter,
  recordHit,
  deleteCounter,
  deleteAllCounters,
  deleteCountersByMode,
  countCounters,
  getLastHitTimestamp,
  countHitsSince,
  getCounterDailyTrend,
  exportDailyActivity,
  importDailyActivity,
  exportCounters,
  importCounters,
  updateCounterValue,
  updateCounterMetadata,
  createApiKey,
  listApiKeys,
  deleteApiKey,
  findApiKeyByToken,
  recordApiKeyUsage,
  describeModeLabel,
  parseRequestedMode
};

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

function generateApiKeyToken() {
  const random = crypto.randomBytes(10).toString('hex');
  return `voux_${random}`;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function normalizeApiKeyRow(row) {
  if (!row) return null;
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
    createdAt: row.created_at || 0,
    lastUsedAt: row.last_used_at || null,
    disabled: Boolean(row.disabled)
  };
}
