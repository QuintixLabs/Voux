/*
  src/db/apiKeys.js

  API key storage and lookup helpers.
*/

function createApiKeysApi(db, helpers, cryptoApi) {
  const { normalizeApiKeyRow, generateId } = helpers;
  const { generateApiKeyToken, hashToken } = cryptoApi;

  const insertApiKeyStmt = db.prepare(`
    INSERT INTO api_keys (id, name, token_hash, scope, allowed_counters, created_at, last_used_at, disabled)
    VALUES (@id, @name, @token_hash, @scope, @allowed_counters, @created_at, NULL, 0)
  `);
  const listApiKeysStmt = db.prepare('SELECT id, name, scope, allowed_counters, created_at, last_used_at, disabled FROM api_keys ORDER BY created_at DESC');
  const deleteApiKeyStmt = db.prepare('DELETE FROM api_keys WHERE id = ?');
  const selectApiKeyByHashStmt = db.prepare('SELECT id, name, scope, allowed_counters, created_at, last_used_at, disabled FROM api_keys WHERE token_hash = ? AND disabled = 0');
  const updateApiKeyUsageStmt = db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?');

  function createApiKey({ name, scope = 'global', counters = [] }) {
    const trimmedName = String(name || '').trim().slice(0, 80);
    if (!trimmedName) throw new Error('name_required');

    const normalizedScope = scope === 'limited' ? 'limited' : 'global';
    let allowed = [];
    if (normalizedScope === 'limited') {
      allowed = Array.isArray(counters)
        ? counters.map((value) => String(value || '').trim().slice(0, 64)).filter(Boolean)
        : [];
      if (!allowed.length) throw new Error('counters_required');
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

  return {
    createApiKey,
    listApiKeys,
    deleteApiKey,
    findApiKeyByToken,
    recordApiKeyUsage
  };
}

module.exports = createApiKeysApi;
