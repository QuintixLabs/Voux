/*
  src/routes/counters/read.js

  Counter read/list endpoints.
*/

function registerCounterReadRoutes(app, deps) {
  const {
    requireAuth,
    authenticateRequest,
    normalizeModeFilter,
    normalizeSort,
    normalizeInactiveFilter,
    normalizeTagFilter,
    extractSearchQuery,
    DEFAULT_PAGE_SIZE,
    INACTIVE_THRESHOLD_DAYS,
    DAY_MS,
    countCounters,
    listCountersPage,
    getUserById,
    isKnownOwner,
    serializeCounterWithStats
  } = deps;

  /* -------------------------------------------------------------------------- */
  /* List Counters                                                              */
  /* -------------------------------------------------------------------------- */
  app.get('/api/counters', requireAuth, (req, res) => {
    const auth = authenticateRequest(req);
    let ownerId = auth?.type === 'user' ? auth.user.id : null;
    const tagOwnerId = auth?.type === 'user' ? auth.user.id : auth?.type === 'admin' ? auth.user.id : null;
    if (auth?.type === 'admin' && String(req.query.owner || '').toLowerCase() === 'me') {
      ownerId = auth.user.id;
    }

    const modeFilter = normalizeModeFilter(req.query.mode);
    if (req.query.mode !== undefined && !modeFilter) {
      return res.status(400).json({ error: 'invalid_mode' });
    }
    const sort = normalizeSort(req.query.sort);
    if (req.query.sort !== undefined && !sort) {
      return res.status(400).json({ error: 'invalid_sort' });
    }
    const inactiveOnly = normalizeInactiveFilter(req.query.inactive);
    if (req.query.inactive !== undefined && inactiveOnly === null) {
      return res.status(400).json({ error: 'invalid_inactive' });
    }

    const tagFilter = normalizeTagFilter(req.query.tags, tagOwnerId);
    const searchQuery = extractSearchQuery(req.query.q ?? req.query.search);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSizeRaw = parseInt(req.query.pageSize, 10);
    const pageSize = Math.max(1, Math.min(pageSizeRaw || DEFAULT_PAGE_SIZE, 100));

    const inactiveBefore = inactiveOnly ? Date.now() - INACTIVE_THRESHOLD_DAYS * DAY_MS : null;
    const totalOverall = countCounters(null, null, null, null, ownerId);
    const totalMatching =
      searchQuery || modeFilter || tagFilter.length || inactiveOnly
        ? countCounters(searchQuery, modeFilter, tagFilter, inactiveBefore, ownerId)
        : totalOverall;
    const totalPages = Math.max(1, Math.ceil(Math.max(totalMatching, 1) / pageSize));
    const safePage = Math.min(page, totalPages);
    const offset = (safePage - 1) * pageSize;

    const ownerLabelCache = new Map();
    const resolveOwnerLabel = (id) => {
      if (!id) return '';
      if (ownerLabelCache.has(id)) return ownerLabelCache.get(id);
      const user = getUserById(id);
      const label = user?.username || '';
      ownerLabelCache.set(id, label);
      return label;
    };

    const counters = listCountersPage(
      pageSize,
      offset,
      searchQuery,
      modeFilter,
      tagFilter,
      sort || 'newest',
      inactiveBefore,
      ownerId
    ).map((counter) => {
      const ownerKnown = isKnownOwner(counter.owner_id);
      const isAdmin = auth?.type === 'admin';
      const isOwner = Boolean(counter.owner_id && auth?.user?.id === counter.owner_id);
      const canAdminTag = isAdmin && (!counter.owner_id || !ownerKnown);
      const canEditTags = Boolean(isOwner || canAdminTag);
      const canShowTags = Boolean(
        tagOwnerId &&
          ((counter.owner_id && counter.owner_id === tagOwnerId) ||
            (isAdmin && (!counter.owner_id || !ownerKnown)))
      );
      const payload = serializeCounterWithStats(counter, {
        includeNote: true,
        includeTags: canShowTags,
        includeOwner: true,
        tagOwnerId: canShowTags ? tagOwnerId : null
      });
      return {
        ...payload,
        canEditTags,
        ownerUsername: counter.owner_id ? resolveOwnerLabel(counter.owner_id) : ''
      };
    });

    return res.json({
      counters,
      pagination: {
        page: safePage,
        pageSize,
        total: totalMatching,
        totalPages
      },
      query: searchQuery || '',
      totals: {
        overall: totalOverall
      },
      filters: {
        tags: tagFilter
      }
    });
  });
}

module.exports = registerCounterReadRoutes;
