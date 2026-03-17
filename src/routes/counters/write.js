/*
  src/routes/counters/write.js

  Counter create/update/delete endpoints.
*/

function registerCounterWriteRoutes(app, deps) {
  const {
    requireAuth,
    requireAuthOrKey,
    authenticateRequest,
    hasAdminPermission,
    hasCounterAccess,
    normalizeModeFilter,
    getCounter,
    deleteCounter,
    updateCounterValue,
    validateCounterValue,
    updateCounterMetadata,
    LABEL_LIMIT,
    NOTE_LIMIT,
    isKnownOwner,
    filterTagIds,
    serializeCounterWithStats,
    normalizeIdsInput,
    deleteCountersByOwnerAndMode,
    deleteCountersByOwner,
    deleteCountersByMode,
    deleteAllCounters,
    isPrivateMode,
    getClientIp,
    checkCreationRate,
    CREATION_LIMIT_COUNT,
    CREATION_LIMIT_WINDOW_MS,
    getConfig,
    getDefaultMode,
    parseRequestedMode,
    isModeAllowed,
    createCounter,
    recordCreationAttempt,
    getBaseUrl,
    serializeCounter
  } = deps;

  /* -------------------------------------------------------------------------- */
  /* Bulk Delete                                                                */
  /* -------------------------------------------------------------------------- */
  app.post('/api/counters/bulk-delete', requireAuth, (req, res) => {
    const auth = authenticateRequest(req);
    const ids = normalizeIdsInput(req.body?.ids);
    if (!ids.length) {
      return res.status(400).json({ error: 'ids_required' });
    }
    let deleted = 0;
    ids.forEach((id) => {
      const counter = getCounter(id);
      if (!counter) {
        return;
      }
      if (
        auth?.type === 'admin' &&
        !hasAdminPermission(auth, 'danger') &&
        counter.owner_id !== auth.user?.id
      ) {
        return;
      }
      if (!hasCounterAccess(auth, counter)) {
        return;
      }
      if (deleteCounter(id)) {
        deleted += 1;
      }
    });
    return res.json({ ok: true, deleted });
  });

  /* -------------------------------------------------------------------------- */
  /* Delete Counter                                                             */
  /* -------------------------------------------------------------------------- */
  app.delete('/api/counters/:id', requireAuthOrKey, (req, res) => {
    const counter = getCounter(req.params.id);
    if (!counter) {
      return res.status(404).json({ error: 'counter_not_found' });
    }
    if (
      req.auth?.type === 'admin' &&
      !hasAdminPermission(req.auth, 'danger') &&
      counter.owner_id !== req.auth.user?.id
    ) {
      return res.status(403).json({ error: 'admin_permission_denied' });
    }
    if (!hasCounterAccess(req.auth, counter)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const removed = deleteCounter(req.params.id);
    if (!removed) {
      return res.status(404).json({ error: 'counter_not_found' });
    }
    return res.json({ ok: true });
  });

  /* -------------------------------------------------------------------------- */
  /* Set Counter Value                                                          */
  /* -------------------------------------------------------------------------- */
  app.post('/api/counters/:id/value', requireAuthOrKey, (req, res) => {
    const { value } = req.body || {};
    const validation = validateCounterValue(value);
    if (validation.error) {
      return res.status(400).json({ error: validation.error, message: validation.message });
    }
    const counter = getCounter(req.params.id);
    if (!counter) {
      return res.status(404).json({ error: 'counter_not_found' });
    }
    if (
      req.auth?.type === 'admin' &&
      !hasAdminPermission(req.auth, 'danger') &&
      counter.owner_id !== req.auth.user?.id
    ) {
      return res.status(403).json({ error: 'admin_permission_denied' });
    }
    if (!hasCounterAccess(req.auth, counter)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const updated = updateCounterValue(req.params.id, validation.value);
    if (!updated) {
      return res.status(404).json({ error: 'counter_not_found' });
    }
    return res.json({ ok: true });
  });

  /* -------------------------------------------------------------------------- */
  /* Update Counter Metadata                                                    */
  /* -------------------------------------------------------------------------- */
  app.patch('/api/counters/:id', requireAuthOrKey, (req, res) => {
    const counter = getCounter(req.params.id);
    if (!counter) {
      return res.status(404).json({ error: 'counter_not_found' });
    }
    if (
      req.auth?.type === 'admin' &&
      !hasAdminPermission(req.auth, 'danger') &&
      counter.owner_id !== req.auth.user?.id
    ) {
      return res.status(403).json({ error: 'admin_permission_denied' });
    }
    if (!hasCounterAccess(req.auth, counter)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const auth = authenticateRequest(req);
    const isAdmin = auth?.type === 'admin';
    const ownerKnown = isKnownOwner(counter.owner_id);
    const isOwner = Boolean(counter.owner_id && auth?.user?.id === counter.owner_id);
    const canAdminTag = isAdmin && (!counter.owner_id || !ownerKnown);
    const tagOwnerId = isOwner ? counter.owner_id : canAdminTag ? auth.user.id : null;
    const canEditTags = Boolean(isOwner || canAdminTag);
    const { label, value, note, tags } = req.body || {};
    const nextLabel =
      typeof label === 'string'
        ? label.trim().slice(0, LABEL_LIMIT)
        : typeof counter.label === 'string'
        ? counter.label.trim().slice(0, LABEL_LIMIT)
        : '';
    let nextValue = counter.value;
    if (value !== undefined) {
      const validation = validateCounterValue(value);
      if (validation.error) {
        return res.status(400).json({ error: validation.error, message: validation.message });
      }
      nextValue = validation.value;
    }
    let nextNote = note;
    if (typeof nextNote === 'string') {
      nextNote = nextNote.trim().slice(0, NOTE_LIMIT);
    } else if (nextNote === undefined || nextNote === null) {
      nextNote = counter.note || '';
    } else {
      nextNote = '';
    }
    let nextTagIds = Array.isArray(counter.tags) ? [...counter.tags] : [];
    let includeTagsPatch = false;
    if (tags !== undefined && canEditTags) {
      nextTagIds = filterTagIds(Array.isArray(tags) ? tags : [], tagOwnerId);
      includeTagsPatch = true;
    }
    const stored = updateCounterMetadata(req.params.id, {
      label: nextLabel,
      value: nextValue,
      note: nextNote || null,
      tags: includeTagsPatch ? nextTagIds : undefined,
      ownerId: tagOwnerId
    });
    if (!stored) {
      return res.status(500).json({ error: 'update_failed' });
    }
    const updated = getCounter(req.params.id);
    const canShowTags = Boolean(
      tagOwnerId &&
        ((counter.owner_id && auth?.type && auth.user?.id === tagOwnerId) ||
          (isAdmin && (!counter.owner_id || !ownerKnown)))
    );
    return res.json({
      counter: serializeCounterWithStats(updated, {
        includeNote: true,
        includeTags: canShowTags,
        tagOwnerId: canShowTags ? tagOwnerId : null
      })
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Delete All / Filtered Counters                                             */
  /* -------------------------------------------------------------------------- */
  app.delete('/api/counters', requireAuth, (req, res) => {
    const auth = authenticateRequest(req);
    const modeFilter = normalizeModeFilter(req.query.mode);
    if (req.query.mode !== undefined && !modeFilter) {
      return res.status(400).json({ error: 'invalid_mode' });
    }
    const ownerOnly =
      auth?.type === 'admin' && String(req.query.owner || '').toLowerCase() === 'me';
    if (auth?.type === 'admin' && !hasAdminPermission(auth, 'danger') && !ownerOnly) {
      return res.status(403).json({ error: 'admin_permission_denied' });
    }
    if (auth?.type === 'user' || ownerOnly) {
      const ownerId = auth.user.id;
      if (modeFilter) {
        const deletedFiltered = deleteCountersByOwnerAndMode(ownerId, modeFilter);
        return res.json({ ok: true, deleted: deletedFiltered, mode: modeFilter });
      }
      const deletedCount = deleteCountersByOwner(ownerId);
      return res.json({ ok: true, deleted: deletedCount });
    }
    if (modeFilter) {
      const deletedFiltered = deleteCountersByMode(modeFilter);
      return res.json({ ok: true, deleted: deletedFiltered, mode: modeFilter });
    }
    const deletedCount = deleteAllCounters();
    return res.json({ ok: true, deleted: deletedCount });
  });

  /* -------------------------------------------------------------------------- */
  /* Create Counter                                                             */
  /* -------------------------------------------------------------------------- */
  app.post('/api/counters', (req, res) => {
    if (isPrivateMode()) {
      const auth = authenticateRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'unauthorized' });
      }
    }

    const clientIp = getClientIp(req) || 'unknown';
    if (!isPrivateMode()) {
      const rateCheck = checkCreationRate(clientIp);
      if (!rateCheck.allowed) {
        const retrySeconds = rateCheck.retryAfterSeconds;
        const prettySeconds = retrySeconds === 1 ? '1 second' : `${retrySeconds} seconds`;
        res.set('Retry-After', String(Math.max(1, retrySeconds || 1)));
        return res.status(429).json({
          error: 'rate_limited',
          message: `Too many new counters at once. Try again in about ${prettySeconds}.`,
          retryAfterSeconds: retrySeconds,
          limit: CREATION_LIMIT_COUNT,
          windowSeconds: Math.round(CREATION_LIMIT_WINDOW_MS / 1000)
        });
      }
    }

    const runtimeConfig = getConfig();
    const defaultMode = getDefaultMode(runtimeConfig);
    const {
      label = '',
      startValue = 0,
      tags = [],
      mode
    } = req.body || {};
    const requestedModeInput = typeof mode === 'string' ? mode : defaultMode;
    const normalizedLabel = typeof label === 'string' ? label.trim().slice(0, 80) : '';
    const startValidation = validateCounterValue(startValue);
    const auth = authenticateRequest(req);
    const ownerId = auth && (auth.type === 'admin' || auth.type === 'user') ? auth.user?.id || null : null;
    const tagIds = filterTagIds(Array.isArray(tags) ? tags : [], ownerId);
    const modeResult = parseRequestedMode(requestedModeInput);
    if (modeResult.error) {
      return res.status(400).json({ error: modeResult.error });
    }
    const requestedMode = modeResult.mode;
    if (!isModeAllowed(requestedMode, runtimeConfig)) {
      return res.status(400).json({ error: 'mode_not_allowed' });
    }
    if (startValidation.error) {
      const errorPayload = { error: startValidation.error };
      if (startValidation.message) {
        errorPayload.message = startValidation.message;
      }
      return res.status(400).json(errorPayload);
    }

    const counter = createCounter({
      label: normalizedLabel,
      startValue: startValidation.value,
      mode: requestedMode,
      tags: tagIds,
      ownerId
    });
    if (!isPrivateMode()) {
      recordCreationAttempt(clientIp);
    }

    const baseUrl = getBaseUrl(req);
    const embedUrl = `${baseUrl}/embed/${counter.id}.js`;
    const embedCode = `<script async src="${embedUrl}"></script>`;
    const embedSvgUrl = `${baseUrl}/embed/${counter.id}.svg`;
    const embedSvgCode = `<img src="${embedSvgUrl}" alt="Voux counter">`;
    return res.status(201).json({
      counter: serializeCounter(counter, { includeNote: true, includeTags: true, tagOwnerId: ownerId }),
      embedCode,
      embedUrl,
      embedSvgCode,
      embedSvgUrl
    });
  });
}

module.exports = registerCounterWriteRoutes;
