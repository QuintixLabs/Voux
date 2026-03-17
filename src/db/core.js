/*
  src/db/core.js

  Opens the database and wires all DB modules together.
*/

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { listTagCatalog: listLegacyTagCatalog } = require('../configStore');

const initializeSchema = require('./schema');
const helpers = require('./helpers');
const cryptoApi = require('./crypto');
const createTagsApi = require('./tags');
const createCountersApi = require('./counters');
const createApiKeysApi = require('./apiKeys');
const createUsersApi = require('./users');
const createSessionsApi = require('./sessions');

const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const dbPath = path.join(DATA_DIR, 'counters.db');
const db = new Database(dbPath);
db.defaultSafeIntegers(true);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

initializeSchema(db);

const tagsApi = createTagsApi(db, helpers);
const countersApi = createCountersApi(db, helpers, tagsApi);
const apiKeysApi = createApiKeysApi(db, helpers, cryptoApi);
const usersApi = createUsersApi(db, helpers, cryptoApi);
const sessionsApi = createSessionsApi(db, helpers, cryptoApi, usersApi);

// migrate legacy config.json tags once tags/users tables are available
try {
  tagsApi.migrateLegacyTagCatalog(listLegacyTagCatalog);
} catch (error) {
  console.warn('Failed to migrate legacy tags', error.message);
}

async function createDatabaseBackup(targetPath) {
  return countersApi.createDatabaseBackup(targetPath, dbPath);
}

module.exports = {
  ...countersApi,
  ...apiKeysApi,
  ...tagsApi,
  ...cryptoApi,

  listUsers: usersApi.listUsers,
  getOwnerUser: usersApi.getOwnerUser,
  getUserById: usersApi.getUserById,
  getUserByUsername: usersApi.getUserByUsername,
  createUser: usersApi.createUser,
  updateUser: usersApi.updateUser,
  deleteUser: sessionsApi.deleteUser,
  countUsers: usersApi.countUsers,
  countAdmins: usersApi.countAdmins,

  createSession: sessionsApi.createSession,
  findSession: sessionsApi.findSession,
  deleteSession: sessionsApi.deleteSession,
  recordUserLogin: sessionsApi.recordUserLogin,

  createDatabaseBackup
};
