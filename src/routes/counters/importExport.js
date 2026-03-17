/*
  src/routes/counters/importExport.js

  Counter import/export endpoints.
*/

function registerCounterImportExportRoutes(app, deps) {
  const {
    requireAuth,
    authenticateRequest,
    hasAdminPermission,
    getOwnerId,
    exportCounters,
    exportDailyActivityFor,
    exportDailyActivity,
    normalizeCounterForExport,
    listTagCatalog,
    exportCountersByIds,
    normalizeIdsInput,
    importCounters,
    importCountersForOwner,
    mergeTagCatalog,
    importDailyActivity,
    importDailyActivityFor,
    seedLastHitsFromDaily,
    isKnownOwner
  } = deps;

  /* -------------------------------------------------------------------------- */
  /* Export All Counters                                                        */
  /* -------------------------------------------------------------------------- */
  app.get('/api/counters/export', requireAuth, (req, res) => {
    const auth = authenticateRequest(req);
    const isAdmin = auth?.type === 'admin';
    const canDanger = !isAdmin || hasAdminPermission(auth, 'danger');
    const ownerId = auth?.type === 'user' ? auth.user.id : isAdmin && !canDanger ? auth.user.id : null;
    const tagOwnerId = auth?.type === 'user' ? auth.user.id : auth?.type === 'admin' ? auth.user.id : null;
    const counters = exportCounters(ownerId)
      .map(normalizeCounterForExport)
      .filter(Boolean)
      .map((counter) => {
        const ownerKnown = isKnownOwner(counter.owner_id);
        if (tagOwnerId && counter.owner_id && counter.owner_id !== tagOwnerId && ownerKnown) {
          return { ...counter, tags: [] };
        }
        return counter;
      });
    const counterIds = counters.map((counter) => counter.id);
    const daily = ownerId ? exportDailyActivityFor(counterIds) : exportDailyActivity();
    return res.json({
      counters,
      daily,
      tagCatalog: tagOwnerId ? listTagCatalog(tagOwnerId) : [],
      exportedAt: Date.now()
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Export Selected Counters                                                   */
  /* -------------------------------------------------------------------------- */
  app.post('/api/counters/export-selected', requireAuth, (req, res) => {
    const auth = authenticateRequest(req);
    const isAdmin = auth?.type === 'admin';
    const canDanger = !isAdmin || hasAdminPermission(auth, 'danger');
    const ownerId = auth?.type === 'user' ? auth.user.id : isAdmin && !canDanger ? auth.user.id : null;
    const tagOwnerId = auth?.type === 'user' ? auth.user.id : auth?.type === 'admin' ? auth.user.id : null;
    const ids = normalizeIdsInput(req.body?.ids);
    if (!ids.length) {
      return res.status(400).json({ error: 'ids_required' });
    }
    const counters = exportCountersByIds(ids, ownerId)
      .map(normalizeCounterForExport)
      .filter(Boolean)
      .map((counter) => {
        const ownerKnown = isKnownOwner(counter.owner_id);
        if (tagOwnerId && counter.owner_id && counter.owner_id !== tagOwnerId && ownerKnown) {
          return { ...counter, tags: [] };
        }
        return counter;
      });
    if (!counters.length) {
      return res.status(404).json({ error: 'counters_not_found' });
    }
    if (ownerId && counters.length !== ids.length) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const counterIds = counters.map((counter) => counter.id);
    const daily = exportDailyActivityFor(counterIds);
    return res.json({
      counters,
      daily,
      tagCatalog: tagOwnerId ? listTagCatalog(tagOwnerId) : [],
      exportedAt: Date.now()
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Import Counters                                                            */
  /* -------------------------------------------------------------------------- */
  app.post('/api/counters/import', requireAuth, (req, res) => {
    const auth = authenticateRequest(req);
    if (!auth) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const isAdmin = auth.type === 'admin';
    const canDanger = !isAdmin || hasAdminPermission(auth, 'danger');
    const ownerId = getOwnerId();
    const requesterIsOwner = isAdmin && ownerId && auth.user.id === ownerId;
    const { replace = false } = req.body || {};
    let payload = null;
    let dailyPayload = [];
    const incomingTags = Array.isArray(req.body?.tagCatalog) ? req.body.tagCatalog : null;
    if (Array.isArray(req.body)) {
      payload = req.body;
    } else if (req.body && Array.isArray(req.body.counters)) {
      payload = req.body.counters;
      if (Array.isArray(req.body.daily)) {
        dailyPayload = req.body.daily;
      }
    }
    if (!payload) {
      return res.status(400).json({ error: 'invalid_backup_format' });
    }
    if (incomingTags) {
      if (auth?.type === 'user') {
        mergeTagCatalog(incomingTags, auth.user.id);
      } else if (auth?.type === 'admin' && (requesterIsOwner || !canDanger)) {
        mergeTagCatalog(incomingTags, auth.user.id);
      } else if (auth?.type === 'admin' && requesterIsOwner) {
        mergeTagCatalog(incomingTags, ownerId);
        mergeTagCatalog(incomingTags, ownerId);
      }
    }
    try {
      if (auth.type === 'admin' && canDanger) {
        const imported = importCounters(payload, {
          replace: Boolean(replace),
          tagOwnerId: requesterIsOwner ? ownerId : null
        });
        let dailyImported = 0;
        if (dailyPayload.length) {
          dailyImported = importDailyActivity(dailyPayload);
          seedLastHitsFromDaily(dailyPayload);
        }
        return res.json({ ok: true, imported, dailyImported });
      }
      const userOwnerId = auth.user.id;
      const imported = importCountersForOwner(payload, { replace: Boolean(replace) }, userOwnerId);
      let dailyImported = 0;
      if (dailyPayload.length) {
        const ids = payload.map((entry) => String(entry?.id || '').trim()).filter(Boolean);
        dailyImported = importDailyActivityFor(ids, dailyPayload);
        seedLastHitsFromDaily(dailyPayload, { ids });
      }
      return res.json({ ok: true, imported, dailyImported });
    } catch (error) {
      const message = error.message || 'import_failed';
      if (message === 'counter_id_taken') {
        return res.status(409).json({ error: 'counter_id_taken' });
      }
      return res.status(400).json({ error: message });
    }
  });
}

module.exports = registerCounterImportExportRoutes;
