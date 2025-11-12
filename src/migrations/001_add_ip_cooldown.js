const Database = require('better-sqlite3');
const path = require('path');

function addIpCooldownColumn(db) {
  const hasColumn = db
    .prepare(`PRAGMA table_info(counters)`)
    .all()
    .some((column) => column.name === 'ip_cooldown_hours');
  if (!hasColumn) {
    db.prepare('ALTER TABLE counters ADD COLUMN ip_cooldown_hours REAL').run();
  }
}

module.exports = function runMigrations() {
  const dbPath = path.join(__dirname, '..', '..', 'data', 'counters.db');
  const db = new Database(dbPath);
  try {
    addIpCooldownColumn(db);
  } finally {
    db.close();
  }
};
