/*
  src/db/schema.js

  Creates tables/indexes and applies simple schema upgrades.
*/

function initializeSchema(db) {
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

  const countersTableInfo = db.prepare('PRAGMA table_info(counters)').all();
  const hasOwnerIdColumn = countersTableInfo.some((col) => col.name === 'owner_id');
  if (!hasOwnerIdColumn) {
    db.exec('ALTER TABLE counters ADD COLUMN owner_id TEXT');
  }

  db.exec('CREATE INDEX IF NOT EXISTS idx_counters_owner ON counters(owner_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash)');
}

module.exports = initializeSchema;
