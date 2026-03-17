/*
  src/db/tags.js

  Tag catalog storage and counter tag mapping helpers.
*/

const crypto = require('crypto');

function createTagsApi(db, helpers) {
  const { sanitizeTagColor, sanitizeTagCatalog } = helpers;

  const listTagsByOwnerStmt = db.prepare('SELECT id, name, color FROM tags WHERE owner_id = ? ORDER BY name COLLATE NOCASE');
  const getTagByOwnerStmt = db.prepare('SELECT id, name, color FROM tags WHERE id = ? AND owner_id = ?');
  const getTagByIdAnyStmt = db.prepare('SELECT id FROM tags WHERE id = ? LIMIT 1');
  const insertTagStmt = db.prepare('INSERT INTO tags (id, owner_id, name, color) VALUES (@id, @owner_id, @name, @color)');
  const updateTagStmt = db.prepare('UPDATE tags SET name = @name, color = @color WHERE id = @id AND owner_id = @owner_id');
  const deleteTagStmt = db.prepare('DELETE FROM tags WHERE id = ? AND owner_id = ?');

  const insertCounterTagStmt = db.prepare('INSERT OR IGNORE INTO counter_tags (counter_id, tag_id) VALUES (?, ?)');
  const deleteCounterTagsStmt = db.prepare('DELETE FROM counter_tags WHERE counter_id = ?');
  const deleteTagsByTagStmt = db.prepare('DELETE FROM counter_tags WHERE tag_id = ?');

  function createTagId() {
    let id = '';
    do {
      id = crypto.randomBytes(6).toString('hex');
    } while (getTagByIdAnyStmt.get(id));
    return id;
  }

  function listTagCatalog(ownerId) {
    if (!ownerId) return [];
    return listTagsByOwnerStmt.all(ownerId).map((tag) => ({ ...tag }));
  }

  function addTagToCatalog({ name, color, ownerId }) {
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    if (!ownerId) throw new Error('owner_required');
    if (!normalizedName) throw new Error('name_required');
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
    if (!ownerId) throw new Error('owner_required');
    const normalizedId = typeof tagId === 'string' ? tagId.trim() : '';
    if (!normalizedId) throw new Error('tag_id_required');
    const existing = getTagByOwnerStmt.get(normalizedId, ownerId);
    if (!existing) return null;

    const next = { id: existing.id, owner_id: ownerId, name: existing.name, color: existing.color };
    if (name !== undefined) {
      const normalizedName = typeof name === 'string' ? name.trim() : '';
      if (!normalizedName) throw new Error('name_required');
      const collision = listTagsByOwnerStmt
        .all(ownerId)
        .some((tag) => tag.id !== normalizedId && tag.name.toLowerCase() === normalizedName.toLowerCase());
      if (collision) throw new Error('tag_exists');
      next.name = normalizedName.slice(0, 40);
    }
    if (color !== undefined) {
      next.color = sanitizeTagColor(color);
    }
    updateTagStmt.run(next);
    return { id: next.id, name: next.name, color: next.color };
  }

  function removeTagFromCatalog(tagId, ownerId) {
    if (!ownerId) throw new Error('owner_required');
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

  const replaceCounterTagsTx = db.transaction((counterId, tags) => {
    deleteCounterTagsStmt.run(counterId);
    tags.forEach((tagId) => {
      insertCounterTagStmt.run(counterId, tagId);
    });
  });

  function replaceCounterTags(counterId, tags = [], ownerId) {
    if (!counterId) return [];
    const filtered = filterTagIds(Array.isArray(tags) ? tags : [], ownerId);
    replaceCounterTagsTx(counterId, filtered);
    return filtered;
  }

  function fetchTagsForCounters(ids = []) {
    if (!ids.length) return [];
    const placeholders = ids.map(() => '?').join(',');
    const stmt = db.prepare(`SELECT counter_id, tag_id FROM counter_tags WHERE counter_id IN (${placeholders}) ORDER BY rowid`);
    return stmt.all(ids);
  }

  function attachTagsToCounters(rows = []) {
    if (!Array.isArray(rows) || !rows.length) {
      return rows.map((row) => ({ ...row, tags: [] }));
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
    return rows.map((row) => ({ ...row, tags: map.get(row.id) || [] }));
  }

  function removeTagAssignments(tagId) {
    if (!tagId) return 0;
    const result = deleteTagsByTagStmt.run(tagId);
    return result.changes || 0;
  }

  function migrateLegacyTagCatalog(listLegacyTagCatalog) {
    const legacyTags = listLegacyTagCatalog();
    if (!legacyTags.length) return;

    const tagCount = db.prepare('SELECT COUNT(*) as total FROM tags').get();
    const totalTags = typeof tagCount?.total === 'bigint' ? Number(tagCount.total) : Number(tagCount?.total || 0);
    if (totalTags) return;

    const ownerRow = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1").get();
    const ownerId = ownerRow?.id || null;
    if (!ownerId) return;

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

  return {
    listTagCatalog,
    addTagToCatalog,
    updateTagInCatalog,
    removeTagFromCatalog,
    mergeTagCatalog,
    filterTagIds,
    replaceCounterTags,
    attachTagsToCounters,
    removeTagAssignments,
    migrateLegacyTagCatalog
  };
}

module.exports = createTagsApi;
