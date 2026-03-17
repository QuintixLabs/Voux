/*
  src/db/users.js

  User read/write helpers for auth and profile data.
*/

function createUsersApi(db, helpers, cryptoApi) {
  const { generateId, normalizeUserRow } = helpers;
  const { hashPassword } = cryptoApi;

  const listUsersStmt = db.prepare('SELECT id, username, role, display_name, avatar_url, created_at, updated_at, last_login_at FROM users ORDER BY created_at DESC');
  const getUserByIdStmt = db.prepare('SELECT id, username, role, display_name, avatar_url, created_at, updated_at, last_login_at FROM users WHERE id = ?');
  const getUserByUsernameStmt = db.prepare('SELECT id, username, role, display_name, avatar_url, password_hash, created_at, updated_at, last_login_at FROM users WHERE username = ?');
  const getOwnerUserStmt = db.prepare("SELECT id, username, role, display_name, avatar_url, created_at, updated_at, last_login_at FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1");
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
    return getUserByUsernameStmt.get(String(username).toLowerCase()) || null;
  }

  function createUser({ username, password, role = 'user', displayName = '', avatarUrl = '' }) {
    const safeUsername = String(username || '').trim().toLowerCase();
    if (!safeUsername) throw new Error('username_required');
    if (getUserByUsername(safeUsername)) throw new Error('username_exists');

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
    if (!nextUsername) throw new Error('username_required');
    if (nextUsername !== existing.username) {
      const taken = getUserByUsername(nextUsername);
      if (taken && taken.id !== existing.id) throw new Error('username_exists');
    }

    const payload = {
      id,
      username: nextUsername,
      role: role !== undefined ? (role === 'admin' ? 'admin' : 'user') : existing.role,
      display_name: displayName !== undefined ? String(displayName || '').trim().slice(0, 80) || null : existing.display_name,
      avatar_url: avatarUrl !== undefined ? String(avatarUrl || '').trim().slice(0, 3000000) || null : existing.avatar_url,
      password_hash: password ? hashPassword(password) : null,
      updated_at: Date.now()
    };
    updateUserStmt.run(payload);
    return getUserById(id);
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

  return {
    listUsers,
    getOwnerUser,
    getUserById,
    getUserByUsername,
    createUser,
    updateUser,
    countUsers,
    countAdmins,
    _stmts: {
      deleteUserStmt,
      updateUserLoginStmt
    }
  };
}

module.exports = createUsersApi;
