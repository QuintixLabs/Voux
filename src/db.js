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
    value INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    ip_cooldown_hours REAL
  );

  CREATE TABLE IF NOT EXISTS hits (
    counter_id TEXT NOT NULL,
    ip TEXT NOT NULL,
    last_hit INTEGER NOT NULL,
    PRIMARY KEY (counter_id, ip),
    FOREIGN KEY (counter_id) REFERENCES counters(id) ON DELETE CASCADE
  );
`);

function ensureIpCooldownColumn() {
  try {
    const columns = db.prepare('PRAGMA table_info(counters)').all();
    const hasColumn = columns.some((column) => column.name === 'ip_cooldown_hours');
    if (!hasColumn) {
      db.prepare('ALTER TABLE counters ADD COLUMN ip_cooldown_hours REAL').run();
    }
  } catch (err) {
    console.error('Failed to ensure ip_cooldown_hours column', err);
  }
}

const listCountersStmt = db.prepare(
  'SELECT id, label, theme, value, created_at, ip_cooldown_hours FROM counters ORDER BY created_at DESC'
);
const listCountersPageStmt = db.prepare(
  'SELECT id, label, theme, value, created_at, ip_cooldown_hours FROM counters ORDER BY created_at DESC LIMIT ? OFFSET ?'
);
const listCountersSearchStmt = db.prepare(
  `SELECT id, label, theme, value, created_at, ip_cooldown_hours
   FROM counters
   WHERE LOWER(id) LIKE @pattern OR LOWER(label) LIKE @pattern
   ORDER BY created_at DESC
   LIMIT @limit OFFSET @offset`
);
const getCounterStmt = db.prepare(
  'SELECT id, label, theme, value, created_at, ip_cooldown_hours FROM counters WHERE id = ?'
);
const getLastHitStmt = db.prepare('SELECT last_hit FROM hits WHERE counter_id = ? ORDER BY last_hit DESC LIMIT 1');
const countHitsSinceStmt = db.prepare(
  'SELECT COUNT(*) as total FROM hits WHERE counter_id = ? AND last_hit >= ?'
);
const insertCounterStmt = db.prepare(
  'INSERT INTO counters (id, label, theme, value, created_at, ip_cooldown_hours) VALUES (@id, @label, @theme, @value, @created_at, @ip_cooldown_hours)'
);

ensureIpCooldownColumn();
const upsertCounterStmt = db.prepare(
  'INSERT INTO counters (id, label, theme, value, created_at, ip_cooldown_hours) VALUES (@id, @label, @theme, @value, @created_at, @ip_cooldown_hours) '
    + 'ON CONFLICT(id) DO UPDATE SET label=excluded.label, theme=excluded.theme, value=excluded.value, created_at=excluded.created_at, ip_cooldown_hours=excluded.ip_cooldown_hours'
);
const incrementCounterStmt = db.prepare('UPDATE counters SET value = value + 1 WHERE id = ?');
const getHitStmt = db.prepare('SELECT last_hit FROM hits WHERE counter_id = ? AND ip = ?');
const upsertHitStmt = db.prepare(`
  INSERT INTO hits (counter_id, ip, last_hit)
  VALUES (?, ?, ?)
  ON CONFLICT(counter_id, ip) DO UPDATE SET last_hit = excluded.last_hit
`);
const pruneHitsStmt = db.prepare('DELETE FROM hits WHERE last_hit < ?');
const clearHitsStmt = db.prepare('DELETE FROM hits');
const deleteCounterStmt = db.prepare('DELETE FROM counters WHERE id = ?');
const updateCounterValueStmt = db.prepare('UPDATE counters SET value = ? WHERE id = ?');
const countCountersStmt = db.prepare('SELECT COUNT(*) as total FROM counters');
const countCountersSearchStmt = db.prepare(
  'SELECT COUNT(*) as total FROM counters WHERE LOWER(id) LIKE ? OR LOWER(label) LIKE ?'
);
const deleteAllCountersStmt = db.prepare('DELETE FROM counters');

const recordHitTx = db.transaction((counterId, ip, now) => {
  const counter = getCounterStmt.get(counterId);
  if (!counter) {
    return null;
  }
  const effectiveCooldownMs = resolveCooldownMs(counter);

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
  }

  const updated = getCounterStmt.get(counterId);
  return { counter: updated, incremented: shouldIncrement };
});

function createCounter({ label, theme = 'plain', startValue, ipCooldownHours }) {
  const initialValue =
    typeof startValue === 'number' && Number.isFinite(startValue) && startValue >= 0
      ? Math.floor(startValue)
      : 0;
  const cooldownResult = parseRequestedCooldown(ipCooldownHours);
  if (cooldownResult.error) {
    throw new Error(cooldownResult.error);
  }
  const counter = {
    id: generateId(8),
    label,
    theme,
    value: initialValue,
    created_at: Date.now(),
    ip_cooldown_hours: cooldownResult.value
  };
  insertCounterStmt.run(counter);
  return counter;
}

function listCounters() {
  return listCountersStmt.all();
}

function listCountersPage(limit, offset, search) {
  const normalized = normalizeSearch(search);
  if (normalized) {
    return listCountersSearchStmt.all({ pattern: normalized, limit, offset });
  }
  return listCountersPageStmt.all(limit, offset);
}

function countCounters(search) {
  const normalized = normalizeSearch(search);
  if (normalized) {
    const { total } = countCountersSearchStmt.get(normalized, normalized);
    return total;
  }
  const { total } = countCountersStmt.get();
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

function deleteCounter(id) {
  const result = deleteCounterStmt.run(id);
  return result.changes > 0;
}

const deleteAllCounters = db.transaction(() => {
  const { total } = countCountersStmt.get();
  deleteAllCountersStmt.run();
  return total;
});

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
  const theme = typeof raw.theme === 'string' && raw.theme.trim() ? raw.theme.trim().slice(0, 40) : 'plain';
  const value = Number(raw.value);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  const createdAtRaw = Number(raw.created_at);
  const created_at = Number.isFinite(createdAtRaw) && createdAtRaw > 0 ? createdAtRaw : Date.now();
  let cooldown = raw.ip_cooldown_hours;
  if (cooldown === '' || cooldown === undefined) {
    cooldown = null;
  }
  if (cooldown !== null) {
    const coerced = Number(cooldown);
    cooldown = Number.isFinite(coerced) ? coerced : null;
  }
  return {
    id: id.slice(0, 64),
    label,
    theme,
    value: Math.floor(value),
    created_at,
    ip_cooldown_hours: cooldown
  };
}

module.exports = {
  createCounter,
  listCounters,
  listCountersPage,
  getCounter,
  recordHit,
  deleteCounter,
  deleteAllCounters,
  countCounters,
  getLastHitTimestamp,
  countHitsSince,
  exportCounters,
  importCounters,
  updateCounterValue,
  describeCooldownLabel,
  parseRequestedCooldown
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

function resolveCooldownMs(counter) {
  const mode = normalizeMode(counter?.ip_cooldown_hours);
  return mode === 'unlimited' ? 0 : null;
}

function normalizeMode(value) {
  if (value === 0 || value === '0') {
    return 'unlimited';
  }
  return 'unique';
}

function describeCooldownLabel(mode) {
  return mode === 'unlimited' ? 'Every visit' : 'Unique visitors';
}

function parseRequestedCooldown(input) {
  if (input === undefined || input === null || input === '' || input === 'default') {
    return { value: null };
  }
  const normalized = String(input).trim().toLowerCase();
  if (normalized === 'unique') {
    return { value: null };
  }
  if (normalized === 'unlimited') {
    return { value: 0 };
  }
  if (normalized === 'never') {
    return { value: null };
  }
  if (normalized === '0') {
    return { value: 0 };
  }
  return { error: 'ipCooldownHours must be "unique" or "unlimited"' };
}
