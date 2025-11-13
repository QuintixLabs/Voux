
const Database = require('better-sqlite3');
const path = require('path');

function addNoteColumn(db) {
  const hasColumn = db
    .prepare(`PRAGMA table_info(counters)`)
    .all()
    .some((column) => column.name === 'note');
  if (!hasColumn) {
    db.prepare('ALTER TABLE counters ADD COLUMN note TEXT').run();
  }
}

module.exports = function runMigrations() {
  const dbPath = path.join(__dirname, '..', '..', 'data', 'counters.db');
  const db = new Database(dbPath);
  try {
    addNoteColumn(db);
  } finally {
    db.close();
  }
};
