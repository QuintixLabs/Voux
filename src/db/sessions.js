/*
  src/db/sessions.js

  Session create/find/delete helpers and user session cleanup.
*/

const crypto = require('crypto');

function createSessionsApi(db, helpers, cryptoApi, usersApi) {
  const { generateId } = helpers;
  const { hashToken } = cryptoApi;

  const insertSessionStmt = db.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at)
    VALUES (@id, @user_id, @token_hash, @created_at, @expires_at)
  `);
  const getSessionByHashStmt = db.prepare('SELECT id, user_id, token_hash, created_at, expires_at FROM sessions WHERE token_hash = ?');
  const deleteSessionByHashStmt = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
  const deleteSessionsByUserStmt = db.prepare('DELETE FROM sessions WHERE user_id = ?');
  const clearUserCountersStmt = db.prepare('UPDATE counters SET owner_id = NULL WHERE owner_id = ?');

  function deleteUser(id) {
    const result = usersApi._stmts.deleteUserStmt.run(id);
    if (result.changes > 0) {
      clearUserCountersStmt.run(id);
      deleteSessionsByUserStmt.run(id);
      return true;
    }
    return false;
  }

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
    const row = getSessionByHashStmt.get(hashToken(token));
    if (!row) return null;
    const expiresAt = typeof row.expires_at === 'bigint' ? Number(row.expires_at) : row.expires_at;
    if (expiresAt && expiresAt < Date.now()) {
      deleteSessionByHashStmt.run(hashToken(token));
      return null;
    }
    return row;
  }

  function deleteSession(token) {
    if (!token) return false;
    const result = deleteSessionByHashStmt.run(hashToken(token));
    return result.changes > 0;
  }

  function recordUserLogin(userId) {
    usersApi._stmts.updateUserLoginStmt.run(Date.now(), userId);
  }

  return {
    createSession,
    findSession,
    deleteSession,
    recordUserLogin,
    deleteUser
  };
}

module.exports = createSessionsApi;
