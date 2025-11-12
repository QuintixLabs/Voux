const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.resolve(__dirname, '..', 'data', 'counters.db');

if (!fs.existsSync(dbPath)) {
  console.log('No database file found, nothing to clear.');
  process.exit(0);
}

const db = new Database(dbPath);
const result = db.prepare('DELETE FROM hits').run();
console.log(`Removed ${result.changes} IP entr${result.changes === 1 ? 'y' : 'ies'} from the hits table.`);
db.close();
