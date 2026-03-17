/*
  src/services/counterResponse.js

  API response serialization for counters/users.
*/

function createCounterResponseService(deps) {
  const {
    normalizeCounterValue,
    describeModeLabel,
    listTagCatalog,
    toSafeNumber,
    getLastHitTimestamp,
    getCounterDailyTrend,
    formatActivityTrend,
    buildInactiveStatus,
    activityWindowDays
  } = deps;

  function mapTagIdsToObjects(ids, ownerId) {
    if (!Array.isArray(ids) || !ids.length || !ownerId) return [];
    const catalog = listTagCatalog(ownerId);
    const map = new Map(catalog.map((tag) => [tag.id, tag]));
    return ids
      .map((id) => map.get(id))
      .filter(Boolean)
      .map((tag) => ({ ...tag }));
  }

  function serializeCounter(counter, options = {}) {
    if (!counter) return null;
    const {
      includeNote = false,
      includeTags = false,
      includeOwner = false,
      tagOwnerId = null
    } = options;
    const mode = counter.count_mode === 'unlimited' ? 'unlimited' : 'unique';
    const value = normalizeCounterValue(counter.value);
    const createdAt = toSafeNumber(counter.created_at);
    const payload = {
      id: counter.id,
      label: counter.label,
      theme: counter.theme,
      value,
      createdAt,
      cooldownMode: mode,
      cooldownLabel: describeModeLabel(mode)
    };
    if (includeOwner) {
      payload.ownerId = counter.owner_id || null;
    }
    if (includeNote) {
      payload.note = counter.note || '';
    }
    if (includeTags) {
      payload.tags = mapTagIdsToObjects(counter.tags, tagOwnerId);
    }
    return payload;
  }

  function serializeCounterWithStats(counter, options = {}) {
    const base = serializeCounter(counter, options);
    if (!base) return base;
    const lastHit = toSafeNumber(getLastHitTimestamp(counter.id));
    const activityTrend = formatActivityTrend(getCounterDailyTrend(counter.id, activityWindowDays));
    const hitsToday = toSafeNumber(activityTrend.todayHits ?? 0);
    const inactivity = buildInactiveStatus(counter, lastHit);
    return {
      ...base,
      lastHit,
      hitsToday,
      activity: activityTrend,
      inactive: inactivity
    };
  }

  function serializeUser(user, ownerId = null) {
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.displayName ?? user.display_name ?? '',
      avatarUrl: user.avatarUrl ?? user.avatar_url ?? '',
      isAdmin: user.role === 'admin',
      isOwner: ownerId ? user.id === ownerId : false
    };
  }

  return {
    serializeCounter,
    serializeCounterWithStats,
    serializeUser
  };
}

module.exports = createCounterResponseService;
