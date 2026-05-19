/*
  src/db/counters/read/queries.js

  Counter listing, filtering, and export helpers.
*/

function createCounterReadHelpers(deps) {
  const {
    // Search + IDs
    normalizeSearch,
    normalizeIdList,

    // Database
    db,
    baseSelectFields,
    listCountersStmt,
    listCountersByOwnerStmt,
    getCounterStmt,

    // Counter helpers
    tagsApi
  } = deps;

/* -------------------------------------------------------------------------- */
/* Query builders                                                             */
/* -------------------------------------------------------------------------- */
function buildCounterQuery({
  search,
  mode,
  tags,
  limit,
  offset,
  count = false,
  sort = 'newest',
  inactiveBefore = null,
  ownerId = null
}) {
  let sql = count
    ? 'SELECT COUNT(*) as total FROM counters'
    : `SELECT ${baseSelectFields} FROM counters`;
  const conditions = [];
  const params = {};
  const normalized = normalizeSearch(search);
  if (normalized) {
    conditions.push(
      '(LOWER(id) LIKE @pattern OR LOWER(label) LIKE @pattern OR (note IS NOT NULL AND LOWER(note) LIKE @pattern))'
    );
    params.pattern = normalized;
  }

  if (mode === 'unique') conditions.push("count_mode <> 'unlimited'");
  else if (mode === 'unlimited') conditions.push("count_mode = 'unlimited'");

  const tagFilters = Array.isArray(tags) ? tags.filter(Boolean) : [];
  if (tagFilters.length) {
    const placeholders = tagFilters.map((_, idx) => `@tag${idx}`);
    conditions.push(
      `id IN (SELECT DISTINCT counter_id FROM counter_tags WHERE tag_id IN (${placeholders.join(',')}))`
    );
    tagFilters.forEach((tag, idx) => {
      params[`tag${idx}`] = tag;
    });
  }

  if (Number.isFinite(inactiveBefore)) {
    conditions.push(
      'COALESCE((SELECT MAX(last_hit) FROM hits WHERE counter_id = counters.id), created_at) < @inactiveBefore'
    );
    params.inactiveBefore = inactiveBefore;
  }

  if (ownerId) {
    conditions.push('owner_id = @ownerId');
    params.ownerId = ownerId;
  }
  
  if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;

  if (!count) {
    let orderBy = 'created_at DESC';
    if (sort === 'oldest') orderBy = 'created_at ASC';
    else if (sort === 'views') orderBy = 'value DESC, created_at DESC';
    else if (sort === 'views_asc') orderBy = 'value ASC, created_at ASC';
    else if (sort === 'last_hit')
      orderBy =
        'COALESCE((SELECT MAX(last_hit) FROM hits WHERE counter_id = counters.id), 0) DESC, created_at DESC';
    sql += ` ORDER BY ${orderBy} LIMIT @limit OFFSET @offset`;
    params.limit = limit;
    params.offset = offset;
  }
  return { sql, params };
}

/* -------------------------------------------------------------------------- */
/* Counter listing                                                            */
/* -------------------------------------------------------------------------- */
function listCounters() {
  return tagsApi.attachTagsToCounters(listCountersStmt.all());
}

function listCountersForOwner(ownerId) {
  if (!ownerId) return [];
  return tagsApi.attachTagsToCounters(listCountersByOwnerStmt.all(ownerId));
}

function listCountersPage(
  limit,
  offset,
  search,
  mode,
  tags,
  sort,
  inactiveBefore,
  ownerId
) {
  const { sql, params } = buildCounterQuery({
    search,
    mode,
    tags,
    limit,
    offset,
    sort,
    inactiveBefore,
    ownerId
  });
  const rows = db.prepare(sql).all(params);
  return tagsApi.attachTagsToCounters(rows);
}

function countCounters(search, mode, tags, inactiveBefore, ownerId) {
  const { sql, params } = buildCounterQuery({
    search,
    mode,
    tags,
    count: true,
    inactiveBefore,
    ownerId
  });
  const { total } = db.prepare(sql).get(params);
  const normalized = typeof total === 'bigint' ? Number(total) : total;
  return Number.isFinite(normalized) ? normalized : 0;
}

function getCounter(id) {
  const row = getCounterStmt.get(id);
  if (!row) return null;
  const [withTags] = tagsApi.attachTagsToCounters([row]);
  return withTags;
}

/* -------------------------------------------------------------------------- */
/* Counter export                                                             */
/* -------------------------------------------------------------------------- */
function exportCounters(ownerId = null) {
  if (!ownerId) return listCounters();
  return tagsApi.attachTagsToCounters(listCountersByOwnerStmt.all(ownerId));
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
  const rows = db.prepare(sql).all(params);
  return tagsApi.attachTagsToCounters(rows);
}

return {
  // Counter reads
  listCounters,
  listCountersForOwner,
  listCountersPage,
  countCounters,
  getCounter,

  // Counter export
  exportCounters,
  exportCountersByIds
  };
}

module.exports = createCounterReadHelpers;
