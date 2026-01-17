/*
  db.js

  Database access for counters, hits, daily activity, tags, and API keys.
*/

/* ========================================================================== */
/* Dependencies                                                               */
/* ========================================================================== */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { listTagCatalog: listLegacyTagCatalog } = require('./configStore');

/* ========================================================================== */
/* Database setup                                                             */
/* ========================================================================== */
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

/* ========================================================================== */
/* Schema                                                                     */
/* ========================================================================== */
db.exec(`
  CREATE TABLE IF NOT EXISTS counters (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    theme TEXT NOT NULL,
    note TEXT,
    value INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    count_mode TEXT NOT NULL DEFAULT 'unique',
    owner_id TEXT
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

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    display_name TEXT,
    avatar_url TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_login_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS counter_tags (
    counter_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (counter_id, tag_id),
    FOREIGN KEY (counter_id) REFERENCES counters(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_counter_tags_tag ON counter_tags(tag_id);

  CREATE TABLE IF NOT EXISTS tags (
    id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    PRIMARY KEY (id, owner_id)
  );

  CREATE INDEX IF NOT EXISTS idx_tags_owner ON tags(owner_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_owner_name ON tags(owner_id, name);
`);

/* ========================================================================== */
/* Migrations + indexes                                                       */
/* ========================================================================== */
const countersTableInfo = db.prepare('PRAGMA table_info(counters)').all();
const hasOwnerIdColumn = countersTableInfo.some((col) => col.name === 'owner_id');
if (!hasOwnerIdColumn) {
  db.exec('ALTER TABLE counters ADD COLUMN owner_id TEXT');
}
db.exec('CREATE INDEX IF NOT EXISTS idx_counters_owner ON counters(owner_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash)');

/* ========================================================================== */
/* Prepared statements                                                       */
/* ========================================================================== */
const baseSelectFields = 'id, label, theme, note, value, created_at, count_mode, owner_id';

const listCountersStmt = db.prepare(`SELECT ${baseSelectFields} FROM counters ORDER BY created_at DESC`);
const listCountersByOwnerStmt = db.prepare(`SELECT ${baseSelectFields} FROM counters WHERE owner_id = ? ORDER BY created_at DESC`);
const getCounterStmt = db.prepare(`SELECT ${baseSelectFields} FROM counters WHERE id = ?`);
const getLastHitStmt = db.prepare('SELECT last_hit FROM hits WHERE counter_id = ? ORDER BY last_hit DESC LIMIT 1');
const countHitsSinceStmt = db.prepare('SELECT COUNT(*) as total FROM hits WHERE counter_id = ? AND last_hit >= ?');
const insertCounterStmt = db.prepare(
  'INSERT INTO counters (id, label, theme, note, value, created_at, count_mode, owner_id) VALUES (@id, @label, @theme, @note, @value, @created_at, @count_mode, @owner_id)'
);
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
const getDailyTrendStmt = db.prepare(`
  SELECT day, hits
  FROM counter_daily
  WHERE counter_id = ?
  ORDER BY day DESC
  LIMIT ?
`);
/* -- counters: cleanup + delete ------------------------------------------- */
const pruneHitsStmt = db.prepare('DELETE FROM hits WHERE last_hit < ?');
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

/* -- counters: updates + counts ------------------------------------------- */
const updateCounterValueStmt = db.prepare('UPDATE counters SET value = ? WHERE id = ?');
const updateCounterMetaStmt = db.prepare('UPDATE counters SET label = @label, value = @value, note = @note WHERE id = @id');
const countCountersStmt = db.prepare('SELECT COUNT(*) as total FROM counters');

/* -- api keys -------------------------------------------------------------- */
const insertApiKeyStmt = db.prepare(`
  INSERT INTO api_keys (id, name, token_hash, scope, allowed_counters, created_at, last_used_at, disabled)
  VALUES (@id, @name, @token_hash, @scope, @allowed_counters, @created_at, NULL, 0)
`);
const listApiKeysStmt = db.prepare('SELECT id, name, scope, allowed_counters, created_at, last_used_at, disabled FROM api_keys ORDER BY created_at DESC');
const deleteApiKeyStmt = db.prepare('DELETE FROM api_keys WHERE id = ?');
const selectApiKeyByHashStmt = db.prepare('SELECT id, name, scope, allowed_counters, created_at, last_used_at, disabled FROM api_keys WHERE token_hash = ? AND disabled = 0');
const updateApiKeyUsageStmt = db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?');

/* -- tags --------------------------------------------------------------- */
const insertCounterTagStmt = db.prepare('INSERT OR IGNORE INTO counter_tags (counter_id, tag_id) VALUES (?, ?)');
const deleteCounterTagsStmt = db.prepare('DELETE FROM counter_tags WHERE counter_id = ?');
const deleteTagsByTagStmt = db.prepare('DELETE FROM counter_tags WHERE tag_id = ?');

/* -- tag catalog ---------------------------------------------------------- */
const listTagsByOwnerStmt = db.prepare('SELECT id, name, color FROM tags WHERE owner_id = ? ORDER BY name COLLATE NOCASE');
const getTagByOwnerStmt = db.prepare('SELECT id, name, color FROM tags WHERE id = ? AND owner_id = ?');
const getTagByIdAnyStmt = db.prepare('SELECT id FROM tags WHERE id = ? LIMIT 1');
const insertTagStmt = db.prepare('INSERT INTO tags (id, owner_id, name, color) VALUES (@id, @owner_id, @name, @color)');
const updateTagStmt = db.prepare('UPDATE tags SET name = @name, color = @color WHERE id = @id AND owner_id = @owner_id');
const deleteTagStmt = db.prepare('DELETE FROM tags WHERE id = ? AND owner_id = ?');

/* -------------------------------------------------------------------------- */
/* Tag catalog migration (legacy config.json)                                 */
/* -------------------------------------------------------------------------- */
const legacyTags = listLegacyTagCatalog();
if (legacyTags.length) {
  const tagCount = db.prepare('SELECT COUNT(*) as total FROM tags').get();
  const totalTags = typeof tagCount?.total === 'bigint' ? Number(tagCount.total) : Number(tagCount?.total || 0);
  if (!totalTags) {
    const ownerRow = db
      .prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1")
      .get();
    const ownerId = ownerRow?.id || null;
    if (ownerId) {
      const insertLegacy = db.transaction((entries) => {
        entries.forEach((tag) => {
          if (!tag?.id) return;
          if (getTagByIdAnyStmt.get(String(tag.id))) return;
          insertTagStmt.run({
            id: String(tag.id),
            owner_id: ownerId,
            name: String(tag.name || '').slice(0, 40),
            color: sanitizeTagColor(tag.color)
          });
        });
      });
      insertLegacy(legacyTags);
    }
  }
}

/* -- users ---------------------------------------------------------------- */
const listUsersStmt = db.prepare('SELECT id, username, role, display_name, avatar_url, created_at, updated_at, last_login_at FROM users ORDER BY created_at DESC');
const getUserByIdStmt = db.prepare('SELECT id, username, role, display_name, avatar_url, created_at, updated_at, last_login_at FROM users WHERE id = ?');
const getUserByUsernameStmt = db.prepare('SELECT id, username, role, display_name, avatar_url, password_hash, created_at, updated_at, last_login_at FROM users WHERE username = ?');
const getOwnerUserStmt = db.prepare(
  "SELECT id, username, role, display_name, avatar_url, created_at, updated_at, last_login_at FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1"
);
const insertUserStmt = db.prepare(`
  INSERT INTO users (id, username, password_hash, role, display_name, avatar_url, created_at, updated_at, last_login_at)
  VALUES (@id, @username, @password_hash, @role, @display_name, @avatar_url, @created_at, @updated_at, NULL)
`);
const updateUserStmt = db.prepare(`
  UPDATE users
  SET username = @username,
      role = @role,
      display_name = @display_name,
      avatar_url = @avatar_url,
      password_hash = COALESCE(@password_hash, password_hash),
      updated_at = @updated_at
  WHERE id = @id
`);
const updateUserLoginStmt = db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?');
const deleteUserStmt = db.prepare('DELETE FROM users WHERE id = ?');
const countUsersStmt = db.prepare('SELECT COUNT(*) as total FROM users');
const countAdminsStmt = db.prepare("SELECT COUNT(*) as total FROM users WHERE role = 'admin'");

/* -- sessions -------------------------------------------------------------- */
const insertSessionStmt = db.prepare(`
  INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at)
  VALUES (@id, @user_id, @token_hash, @created_at, @expires_at)
`);
const getSessionByHashStmt = db.prepare('SELECT id, user_id, token_hash, created_at, expires_at FROM sessions WHERE token_hash = ?');
const deleteSessionByHashStmt = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
const deleteSessionsByUserStmt = db.prepare('DELETE FROM sessions WHERE user_id = ?');
const clearUserCountersStmt = db.prepare('UPDATE counters SET owner_id = NULL WHERE owner_id = ?');

/* ========================================================================== */
/* Counters                                                                   */
/* ========================================================================== */

/* -------------------------------------------------------------------------- */
/* Listing + filters                                                          */
/* -------------------------------------------------------------------------- */
function buildCounterQuery({ search, mode, tags, limit, offset, count = false, sort = 'newest', inactiveBefore = null, ownerId = null }) {
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
  if (ownerId) {
    conditions.push('owner_id = @ownerId');
    params.ownerId = ownerId;
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

/* -------------------------------------------------------------------------- */
/* Hits + daily activity                                                      */
/* -------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------- */
/* Create + update                                                            */
/* -------------------------------------------------------------------------- */
function createCounter({ label, theme = 'plain', startValue, mode, tags = [], ownerId = null }) {
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
    count_mode: modeResult.mode,
    owner_id: ownerId || null
  };
  insertCounterStmt.run(counter);
  const appliedTags = replaceCounterTags(counter.id, tags, counter.owner_id);
  counter.tags = appliedTags;
  return counter;
}

function listCounters() {
  return attachTagsToCounters(listCountersStmt.all());
}

function listCountersPage(limit, offset, search, mode, tags, sort, inactiveBefore, ownerId) {
  const { sql, params } = buildCounterQuery({ search, mode, tags, limit, offset, sort, inactiveBefore, ownerId });
  const rows = db.prepare(sql).all(params);
  return attachTagsToCounters(rows);
}

function countCounters(search, mode, tags, inactiveBefore, ownerId) {
  const { sql, params } = buildCounterQuery({ search, mode, tags, count: true, inactiveBefore, ownerId });
  const { total } = db.prepare(sql).get(params);
  const normalized = typeof total === 'bigint' ? Number(total) : total;
  return Number.isFinite(normalized) ? normalized : 0;
}

/* -------------------------------------------------------------------------- */
/* Search helpers                                                             */
/* -------------------------------------------------------------------------- */
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

function updateCounterMetadata(id, { label, value, note, tags, ownerId = null }) {
  const payload = {
    id,
    label,
    value,
    note: note || null
  };
  const result = updateCounterMetaStmt.run(payload);
  if (Array.isArray(tags)) {
    replaceCounterTags(id, tags, ownerId);
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

function deleteCountersByOwner(ownerId) {
  if (!ownerId) return 0;
  const result = deleteCountersByOwnerStmt.run(ownerId);
  return result.changes || 0;
}

function deleteCountersByOwnerAndMode(ownerId, mode) {
  if (!ownerId) return 0;
  const statement = deleteCountersByOwnerAndModeStmt[mode];
  if (!statement) return 0;
  const result = statement.run(ownerId);
  return result.changes || 0;
}

/* -------------------------------------------------------------------------- */
/* Hits + stats                                                               */
/* -------------------------------------------------------------------------- */
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

/* ========================================================================== */
/* Export / import                                                            */
/* ========================================================================== */
function exportCounters(ownerId = null) {
  if (!ownerId) return listCounters();
  return attachTagsToCounters(listCountersByOwnerStmt.all(ownerId));
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
  const stmt = db.prepare(sql);
  const rows = stmt.all(params);
  return attachTagsToCounters(rows);
}

/* -------------------------------------------------------------------------- */
/* Import                                                                     */
/* -------------------------------------------------------------------------- */
function importCounters(data, options = {}) {
  if (!Array.isArray(data)) {
    throw new Error('invalid_backup_format');
  }
  const normalized = data
    .map((item) => normalizeImportedCounter(item, options.tagOwnerId || null))
    .filter(Boolean);
  if (!normalized.length) {
    throw new Error('no_valid_counters');
  }
  importCountersTx(normalized, Boolean(options.replace), options.tagOwnerId || null);
  return normalized.length;
}

function importCountersForOwner(data, options = {}, ownerId) {
  if (!ownerId) {
    throw new Error('owner_required');
  }
  if (!Array.isArray(data)) {
    throw new Error('invalid_backup_format');
  }
  const normalizedRaw = data
    .map((item) => normalizeImportedCounter(item, ownerId))
    .filter(Boolean);
  const hasForeignOwner = normalizedRaw.some((counter) => {
    return counter.owner_id && counter.owner_id !== ownerId;
  });
  if (hasForeignOwner) {
    throw new Error('backup_not_owned');
  }
  const normalized = normalizedRaw.map((counter) => ({ ...counter, owner_id: ownerId }));
  if (!normalized.length) {
    throw new Error('no_valid_counters');
  }
  normalized.forEach((counter) => {
    const existing = getCounter(counter.id);
    if (existing && existing.owner_id !== ownerId) {
      throw new Error('counter_id_taken');
    }
  });
  importCountersByOwnerTx(normalized, Boolean(options.replace), ownerId);
  return normalized.length;
}

const importCountersTx = db.transaction((items, replaceExisting, tagOwnerId) => {
  if (replaceExisting) {
    deleteAllCountersStmt.run();
    clearHitsStmt.run();
    clearDailyStmt.run();
  }
  items.forEach((item) => {
    upsertCounterStmt.run(item);
    const tagScope = item.owner_id || tagOwnerId || null;
    replaceCounterTags(item.id, item.tags, tagScope);
  });
});

const importCountersByOwnerTx = db.transaction((items, replaceExisting, ownerId) => {
  if (replaceExisting) {
    deleteCountersByOwnerStmt.run(ownerId);
  }
  items.forEach((item) => {
    upsertCounterStmt.run(item);
    replaceCounterTags(item.id, item.tags, ownerId);
  });
});

/* -------------------------------------------------------------------------- */
/* Import helpers                                                             */
/* -------------------------------------------------------------------------- */
function normalizeImportedCounter(raw, tagOwnerId = null) {
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
  const ownerId = typeof raw.owner_id === 'string' && raw.owner_id.trim() ? raw.owner_id.trim().slice(0, 64) : null;
  const tagScope = ownerId || tagOwnerId || null;
  return {
    id: id.slice(0, 64),
    label,
    theme,
    note: note || null,
    value: normalizedValue,
    created_at,
    count_mode: modeResult.mode,
    owner_id: ownerId,
    tags: filterTagIds(Array.isArray(raw.tags) ? raw.tags : [], tagScope)
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

/* -------------------------------------------------------------------------- */
/* Daily activity                                                             */
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

function importDailyActivityFor(ids = [], data = []) {
  const normalizedIds = normalizeIdList(ids);
  if (!normalizedIds.length || !Array.isArray(data) || !data.length) {
    return 0;
  }
  const allowed = new Set(normalizedIds);
  const rows = data
    .map(normalizeDailyEntry)
    .filter((row) => row && allowed.has(row.counter_id));
  if (!rows.length) {
    return 0;
  }
  importDailyActivityTx(rows);
  return rows.length;
}

// migration code for last_hits fixes backups from older versions
function seedLastHitsFromDaily(data = [], options = {}) {
  if (!Array.isArray(data) || !data.length) return 0;
  const allowedIds = Array.isArray(options.ids) ? new Set(normalizeIdList(options.ids)) : null;
  const latestByCounter = new Map();
  data.forEach((raw) => {
    const row = normalizeDailyEntry(raw);
    if (!row) return;
    if (allowedIds && !allowedIds.has(row.counter_id)) return;
    const existing = latestByCounter.get(row.counter_id);
    if (!existing || row.day > existing) {
      latestByCounter.set(row.counter_id, row.day);
    }
  });
  if (!latestByCounter.size) return 0;
  let seeded = 0;
  latestByCounter.forEach((day, counterId) => {
    const lastHit = day + 24 * 60 * 60 * 1000 - 1;
    const existingHit = getLastHitStmt.get(counterId);
    const existingTs = existingHit
      ? typeof existingHit.last_hit === 'bigint'
        ? Number(existingHit.last_hit)
        : existingHit.last_hit
      : 0;
    if (existingTs && existingTs >= lastHit) return;
    upsertHitStmt.run(counterId, 'import', lastHit);
    seeded += 1;
  });
  return seeded;
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

/* ========================================================================== */
/* API keys                                                                   */
/* ========================================================================== */
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

/* ========================================================================== */
/* Tag catalog                                                                */
/* ========================================================================== */
function listTagCatalog(ownerId) {
  if (!ownerId) return [];
  return listTagsByOwnerStmt.all(ownerId).map((tag) => ({ ...tag }));
}

function addTagToCatalog({ name, color, ownerId }) {
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  if (!ownerId) {
    throw new Error('owner_required');
  }
  if (!normalizedName) {
    throw new Error('name_required');
  }
  const existing = listTagsByOwnerStmt.all(ownerId);
  if (existing.some((tag) => tag.name.toLowerCase() === normalizedName.toLowerCase())) {
    throw new Error('tag_exists');
  }
  const id = createTagId();
  const record = {
    id,
    owner_id: ownerId,
    name: normalizedName.slice(0, 40),
    color: sanitizeTagColor(color)
  };
  insertTagStmt.run(record);
  return { id: record.id, name: record.name, color: record.color };
}

function updateTagInCatalog(tagId, { name, color } = {}, ownerId) {
  if (!ownerId) {
    throw new Error('owner_required');
  }
  const normalizedId = typeof tagId === 'string' ? tagId.trim() : '';
  if (!normalizedId) {
    throw new Error('tag_id_required');
  }
  const existing = getTagByOwnerStmt.get(normalizedId, ownerId);
  if (!existing) return null;
  const next = {
    id: existing.id,
    owner_id: ownerId,
    name: existing.name,
    color: existing.color
  };
  if (name !== undefined) {
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    if (!normalizedName) {
      throw new Error('name_required');
    }
    const collision = listTagsByOwnerStmt
      .all(ownerId)
      .some((tag) => tag.id !== normalizedId && tag.name.toLowerCase() === normalizedName.toLowerCase());
    if (collision) {
      throw new Error('tag_exists');
    }
    next.name = normalizedName.slice(0, 40);
  }
  if (color !== undefined) {
    next.color = sanitizeTagColor(color);
  }
  updateTagStmt.run(next);
  return { id: next.id, name: next.name, color: next.color };
}

function removeTagFromCatalog(tagId, ownerId) {
  if (!ownerId) {
    throw new Error('owner_required');
  }
  const normalized = typeof tagId === 'string' ? tagId.trim() : '';
  if (!normalized) return null;
  const existing = getTagByOwnerStmt.get(normalized, ownerId);
  if (!existing) return null;
  const result = deleteTagStmt.run(normalized, ownerId);
  if (!result.changes) return null;
  return { id: existing.id, name: existing.name, color: existing.color };
}

function mergeTagCatalog(entries = [], ownerId) {
  if (!ownerId) return;
  const incoming = sanitizeTagCatalog(entries);
  if (!incoming.length) return;
  const current = new Map(listTagsByOwnerStmt.all(ownerId).map((tag) => [tag.id, tag]));
  incoming.forEach((tag) => {
    if (!current.has(tag.id)) {
      current.set(tag.id, { ...tag, owner_id: ownerId });
    }
  });
  const insertMany = db.transaction((items) => {
    items.forEach((tag) => {
      if (!tag?.id || !tag?.name) return;
      if (getTagByIdAnyStmt.get(tag.id)) return;
      insertTagStmt.run({
        id: tag.id,
        owner_id: ownerId,
        name: tag.name,
        color: sanitizeTagColor(tag.color)
      });
    });
  });
  insertMany(Array.from(current.values()));
}

function filterTagIds(ids = [], ownerId, limit = 20) {
  if (!Array.isArray(ids) || !ownerId) return [];
  const catalog = listTagsByOwnerStmt.all(ownerId);
  const valid = new Set(catalog.map((tag) => tag.id));
  const normalized = [];
  ids.forEach((value) => {
    const id = typeof value === 'string' ? value.trim() : '';
    if (id && valid.has(id) && !normalized.includes(id)) {
      normalized.push(id);
    }
  });
  return normalized.slice(0, limit);
}

/* ========================================================================== */
/* Tags (counter assignments)                                                 */
/* ========================================================================== */
function replaceCounterTags(counterId, tags = [], ownerId) {
  if (!counterId) return [];
  const filtered = filterTagIds(Array.isArray(tags) ? tags : [], ownerId);
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

/* ========================================================================== */
/* Exports                                                                    */
/* ========================================================================== */
module.exports = {
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
  createApiKey,
  listApiKeys,
  deleteApiKey,
  listTagCatalog,
  addTagToCatalog,
  updateTagInCatalog,
  removeTagFromCatalog,
  mergeTagCatalog,
  filterTagIds,
  findApiKeyByToken,
  recordApiKeyUsage,
  describeModeLabel,
  parseRequestedMode,
  removeTagAssignments,
  hashPassword,
  verifyPassword,
  listUsers,
  getOwnerUser,
  getUserById,
  getUserByUsername,
  createUser,
  updateUser,
  deleteUser,
  countUsers,
  countAdmins,
  createSession,
  findSession,
  deleteSession,
  recordUserLogin
};

/* ========================================================================== */
/* Helpers                                                                    */
/* ========================================================================== */

/* -------------------------------------------------------------------------- */
/* IDs + modes                                                                */
/* -------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------- */
/* Tag helpers                                                                */
/* -------------------------------------------------------------------------- */
function createTagId() {
  let id = '';
  do {
    id = crypto.randomBytes(6).toString('hex');
  } while (getTagByIdAnyStmt.get(id));
  return id;
}

function sanitizeTagCatalog(entries = []) {
  if (!Array.isArray(entries)) return [];
  const seen = new Set();
  const sanitized = [];
  entries.forEach((entry) => {
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    if (!id || !name || seen.has(id)) return;
    sanitized.push({
      id,
      name: name.slice(0, 40),
      color: sanitizeTagColor(entry.color)
    });
    seen.add(id);
  });
  return sanitized;
}

function sanitizeTagColor(value) {
  if (typeof value !== 'string') return '#4c6ef5';
  const normalized = value.trim().startsWith('#') ? value.trim() : `#${value.trim()}`;
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return normalized.toLowerCase();
  }
  return '#4c6ef5';
}

/* -------------------------------------------------------------------------- */
/* Time helpers                                                               */
/* -------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------- */
/* Throttling                                                                 */
/* -------------------------------------------------------------------------- */
function setUnlimitedThrottle(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) {
    unlimitedThrottleMs = 0;
  } else {
    unlimitedThrottleMs = Math.round(value);
  }
}

/* -------------------------------------------------------------------------- */
/* Tokens + hashing                                                           */
/* -------------------------------------------------------------------------- */
function generateApiKeyToken() {
  const random = crypto.randomBytes(10).toString('hex');
  return `voux_${random}`;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function hashPassword(password, salt = null) {
  const safePassword = String(password || '');
  const saltBytes = salt ? Buffer.from(salt, 'hex') : crypto.randomBytes(16);
  const iterations = 120000;
  const hash = crypto.pbkdf2Sync(safePassword, saltBytes, iterations, 32, 'sha256');
  return `pbkdf2$${iterations}$${saltBytes.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(storedHash, password) {
  if (!storedHash || typeof storedHash !== 'string') return false;
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  const salt = parts[2];
  const expected = parts[3];
  if (!Number.isFinite(iterations) || !salt || !expected) return false;
  const hash = crypto.pbkdf2Sync(String(password || ''), Buffer.from(salt, 'hex'), iterations, expected.length / 2, 'sha256');
  const expectedBuf = Buffer.from(expected, 'hex');
  return expectedBuf.length === hash.length && crypto.timingSafeEqual(expectedBuf, hash);
}

/* -------------------------------------------------------------------------- */
/* Normalization                                                              */
/* -------------------------------------------------------------------------- */
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

function toSafeNumber(value) {
  if (value == null) return 0;
  if (typeof value === 'bigint') return Number(value);
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function normalizeUserRow(row) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    displayName: row.display_name || '',
    avatarUrl: row.avatar_url || '',
    createdAt: toSafeNumber(row.created_at),
    updatedAt: toSafeNumber(row.updated_at),
    lastLoginAt: toSafeNumber(row.last_login_at)
  };
}

/* -------------------------------------------------------------------------- */
/* Users                                                                      */
/* -------------------------------------------------------------------------- */
function listUsers() {
  return listUsersStmt.all().map(normalizeUserRow);
}

function getOwnerUser() {
  const row = getOwnerUserStmt.get();
  return row ? normalizeUserRow(row) : null;
}

function getUserById(id) {
  const row = getUserByIdStmt.get(id);
  return row ? normalizeUserRow(row) : null;
}

function getUserByUsername(username) {
  if (!username) return null;
  const row = getUserByUsernameStmt.get(String(username).toLowerCase());
  return row || null;
}

function createUser({ username, password, role = 'user', displayName = '', avatarUrl = '' }) {
  const safeUsername = String(username || '').trim().toLowerCase();
  if (!safeUsername) {
    throw new Error('username_required');
  }
  if (getUserByUsername(safeUsername)) {
    throw new Error('username_exists');
  }
  const passwordHash = hashPassword(password);
  const now = Date.now();
  const user = {
    id: generateId(12),
    username: safeUsername,
    password_hash: passwordHash,
    role: role === 'admin' ? 'admin' : 'user',
    display_name: displayName ? String(displayName).trim().slice(0, 80) : null,
    avatar_url: avatarUrl ? String(avatarUrl).trim().slice(0, 3000000) : null,
    created_at: now,
    updated_at: now
  };
  insertUserStmt.run(user);
  return normalizeUserRow(user);
}

function updateUser(id, { role, displayName, avatarUrl, password, username }) {
  const existing = getUserByIdStmt.get(id);
  if (!existing) return null;
  const nextUsername = username !== undefined ? String(username || '').trim().toLowerCase() : existing.username;
  if (!nextUsername) {
    throw new Error('username_required');
  }
  if (nextUsername !== existing.username) {
    const taken = getUserByUsername(nextUsername);
    if (taken && taken.id !== existing.id) {
      throw new Error('username_exists');
    }
  }
  const now = Date.now();
  const payload = {
    id,
    username: nextUsername,
    role: role !== undefined ? (role === 'admin' ? 'admin' : 'user') : existing.role,
    display_name: displayName !== undefined ? String(displayName || '').trim().slice(0, 80) || null : existing.display_name,
    avatar_url: avatarUrl !== undefined ? String(avatarUrl || '').trim().slice(0, 3000000) || null : existing.avatar_url,
    password_hash: password ? hashPassword(password) : null,
    updated_at: now
  };
  updateUserStmt.run(payload);
  return getUserById(id);
}

function deleteUser(id) {
  const result = deleteUserStmt.run(id);
  if (result.changes > 0) {
    clearUserCountersStmt.run(id);
    deleteSessionsByUserStmt.run(id);
    return true;
  }
  return false;
}

function countUsers() {
  const { total } = countUsersStmt.get();
  const normalized = typeof total === 'bigint' ? Number(total) : total;
  return Number.isFinite(normalized) ? normalized : 0;
}

function countAdmins() {
  const { total } = countAdminsStmt.get();
  const normalized = typeof total === 'bigint' ? Number(total) : total;
  return Number.isFinite(normalized) ? normalized : 0;
}

/* -------------------------------------------------------------------------- */
/* Sessions                                                                   */
/* -------------------------------------------------------------------------- */
function createSession(userId, ttlMs) {
  const token = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  const session = {
    id: generateId(16),
    user_id: userId,
    token_hash: hashToken(token),
    created_at: now,
    expires_at: now + Math.max(1, Number(ttlMs) || 0)
  };
  insertSessionStmt.run(session);
  return { token, session };
}

function findSession(token) {
  if (!token) return null;
  const hash = hashToken(token);
  const row = getSessionByHashStmt.get(hash);
  if (!row) return null;
  const expiresAt = typeof row.expires_at === 'bigint' ? Number(row.expires_at) : row.expires_at;
  if (expiresAt && expiresAt < Date.now()) {
    deleteSessionByHashStmt.run(hash);
    return null;
  }
  return row;
}

function deleteSession(token) {
  if (!token) return false;
  const hash = hashToken(token);
  const result = deleteSessionByHashStmt.run(hash);
  return result.changes > 0;
}

function recordUserLogin(userId) {
  updateUserLoginStmt.run(Date.now(), userId);
}

/* -------------------------------------------------------------------------- */
/* Cleanup                                                                    */
/* -------------------------------------------------------------------------- */
function removeTagAssignments(tagId) {
  if (!tagId) return 0;
  const result = deleteTagsByTagStmt.run(tagId);
  return result.changes || 0;
}
