/*
  src/routes/settings.js

  Settings/admin metadata/tag/api-key routes.
*/

function registerSettingsRoutes(app, deps) {
  const {
    requireAdmin,
    requireAuth,
    authenticateRequest,
    hasAdminPermission,
    getOwnerId,
    getConfig,
    updateConfig,
    normalizeAllowedModesPatch,
    backupService,
    htmlCache,
    setUnlimitedThrottle,
    getVersion,
    DEFAULT_USERS_PAGE_SIZE,
    INACTIVE_THRESHOLD_DAYS,
    getEffectiveAdminPermissions,
    listTagCatalog,
    addTagToCatalog,
    updateTagInCatalog,
    removeTagFromCatalog,
    removeTagAssignments,
    listApiKeys,
    createApiKey,
    deleteApiKey,
    deleteInactiveCountersOlderThan
  } = deps;

  /* -------------------------------------------------------------------------- */
  /* Settings                                                                   */
  /* -------------------------------------------------------------------------- */
  app.get('/api/settings', requireAdmin, (req, res) => {
    const auth = authenticateRequest(req);
    const ownerId = getOwnerId();
    const isOwner = Boolean(ownerId && auth?.user?.id === ownerId);
    const runtimeConfig = getConfig();
    const visibleConfig = isOwner ? runtimeConfig : { ...runtimeConfig, autoBackup: undefined };
    const adminPermissions = auth?.type === 'admin'
      ? {
          effective: getEffectiveAdminPermissions(auth.user?.id),
          defaults: isOwner ? (runtimeConfig.adminPermissions || {}) : null
        }
      : null;
    const payload = {
      config: visibleConfig,
      version: getVersion(),
      usersPageSize: DEFAULT_USERS_PAGE_SIZE,
      inactiveDaysThreshold: INACTIVE_THRESHOLD_DAYS,
      adminPermissions
    };
    if (isOwner) {
      payload.backupDirectory = backupService.getBackupDirectory();
    }
    return res.json(payload);
  });

  /* -------------------------------------------------------------------------- */
  /* Update Settings                                                            */
  /* -------------------------------------------------------------------------- */
  app.post('/api/settings', requireAdmin, (req, res) => {
    const auth = authenticateRequest(req);
    const ownerId = getOwnerId();
    const wantsAutoBackup = Boolean(req.body && Object.prototype.hasOwnProperty.call(req.body, 'autoBackup'));
    if (auth?.type === 'admin') {
      const wantsRuntime = req.body && ('privateMode' in req.body || 'showGuides' in req.body || 'allowedModes' in req.body || 'unlimitedThrottleSeconds' in req.body || wantsAutoBackup);
      const wantsBranding = req.body && ('homeTitle' in req.body || 'brandName' in req.body || 'theme' in req.body);
      if (wantsRuntime && !hasAdminPermission(auth, 'runtime')) {
        return res.status(403).json({ error: 'admin_permission_denied' });
      }
      if (wantsBranding && !hasAdminPermission(auth, 'branding')) {
        return res.status(403).json({ error: 'admin_permission_denied' });
      }
      if (wantsAutoBackup && (!ownerId || auth.user?.id !== ownerId)) {
        return res.status(403).json({ error: 'owner_only' });
      }
    }
    const { privateMode, showGuides, homeTitle, brandName, allowedModes, unlimitedThrottleSeconds, theme, autoBackup } = req.body || {};
    const patch = {};
    if (typeof privateMode === 'boolean') patch.privateMode = privateMode;
    if (typeof showGuides === 'boolean') patch.showGuides = showGuides;
    if (typeof homeTitle === 'string') patch.homeTitle = homeTitle.trim().slice(0, 120);
    if (typeof brandName === 'string') patch.brandName = brandName.trim().slice(0, 80);
    if (Number.isFinite(Number(unlimitedThrottleSeconds))) {
      const value = Math.max(0, Math.round(Number(unlimitedThrottleSeconds)));
      patch.unlimitedThrottleSeconds = value;
    }
    if (allowedModes && typeof allowedModes === 'object') {
      const normalizedModes = normalizeAllowedModesPatch(allowedModes);
      if (!normalizedModes) {
        return res.status(400).json({ error: 'at_least_one_mode' });
      }
      patch.allowedModes = normalizedModes;
    }
    if (typeof theme === 'string') {
      patch.theme = theme.trim().toLowerCase();
    }
    if (wantsAutoBackup && autoBackup && typeof autoBackup === 'object') {
      patch.autoBackup = autoBackup;
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'no_valid_settings' });
    }
    const updated = updateConfig(patch);
    if (patch.autoBackup) {
      backupService.restartScheduler();
    }
    if (patch.theme) {
      htmlCache.clear();
    }
    setUnlimitedThrottle((updated.unlimitedThrottleSeconds || 0) * 1000);
    const isOwner = Boolean(ownerId && auth?.user?.id === ownerId);
    const visibleConfig = isOwner ? updated : { ...updated, autoBackup: undefined };
    return res.json({ config: visibleConfig, version: getVersion() });
  });

  /* -------------------------------------------------------------------------- */
  /* Backups                                                                    */
  /* -------------------------------------------------------------------------- */
  app.post('/api/backups/run', requireAdmin, async (req, res) => {
    const auth = authenticateRequest(req);
    const ownerId = getOwnerId();
    const isOwner = Boolean(ownerId && auth?.user?.id === ownerId);
    if (!isOwner) {
      return res.status(403).json({ error: 'owner_only' });
    }
    if (backupService.isBusy()) {
      return res.status(409).json({ error: 'backup_busy' });
    }
    try {
      const created = await backupService.createNow('manual');
      return res.status(201).json({ ok: true, backup: created.dbBackup, jsonBackup: created.jsonBackup || null });
    } catch (error) {
      console.error('Manual backup failed', error);
      return res.status(500).json({ error: 'backup_failed' });
    }
  });

  /* -------------------------------------------------------------------------- */
  /* Admin Permissions                                                          */
  /* -------------------------------------------------------------------------- */
  app.get('/api/admin-permissions', requireAdmin, (req, res) => {
    const auth = authenticateRequest(req);
    const ownerId = getOwnerId();
    if (!ownerId || auth?.user?.id !== ownerId) {
      return res.status(403).json({ error: 'owner_only' });
    }
    const cfg = getConfig();
    return res.json({
      defaults: cfg.adminPermissions || {},
      overrides: cfg.adminPermissionOverrides || {}
    });
  });

  app.post('/api/admin-permissions', requireAdmin, (req, res) => {
    const auth = authenticateRequest(req);
    const ownerId = getOwnerId();
    if (!ownerId || auth?.user?.id !== ownerId) {
      return res.status(403).json({ error: 'owner_only' });
    }
    const { defaults } = req.body || {};
    if (!defaults || typeof defaults !== 'object') {
      return res.status(400).json({ error: 'invalid_permissions' });
    }
    const updated = updateConfig({ adminPermissions: defaults });
    return res.json({ defaults: updated.adminPermissions || {} });
  });

  app.post('/api/admin-permissions/:id', requireAdmin, (req, res) => {
    const auth = authenticateRequest(req);
    const ownerId = getOwnerId();
    if (!ownerId || auth?.user?.id !== ownerId) {
      return res.status(403).json({ error: 'owner_only' });
    }
    const userId = String(req.params.id || '').trim();
    if (!userId) return res.status(400).json({ error: 'user_id_required' });
    const { override } = req.body || {};
    const cfg = getConfig();
    const overrides = { ...(cfg.adminPermissionOverrides || {}) };
    if (!override || typeof override !== 'object' || !Object.keys(override).length) {
      delete overrides[userId];
    } else {
      overrides[userId] = override;
    }
    const updated = updateConfig({ adminPermissionOverrides: overrides });
    return res.json({ overrides: updated.adminPermissionOverrides || {} });
  });

  /* -------------------------------------------------------------------------- */
  /* Tags                                                                       */
  /* -------------------------------------------------------------------------- */
  app.get('/api/tags', requireAuth, (req, res) => {
    const auth = authenticateRequest(req);
    if (!auth || auth.type === 'key') {
      return res.status(401).json({ error: 'unauthorized' });
    }
    return res.json({ tags: listTagCatalog(auth.user.id) });
  });

  app.post('/api/tags', requireAuth, (req, res) => {
    const auth = authenticateRequest(req);
    if (!auth || auth.type === 'key') {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const { name, color } = req.body || {};
    try {
      const tag = addTagToCatalog({ name, color, ownerId: auth.user.id });
      return res.status(201).json({ tag });
    } catch (error) {
      if (error.message === 'tag_exists') {
        return res.status(409).json({ error: 'Tag already exists.' });
      }
      if (error.message === 'name_required') {
        return res.status(400).json({ error: 'Tag name required.' });
      }
      return res.status(400).json({ error: error.message || 'Failed to create tag.' });
    }
  });

  app.patch('/api/tags/:id', requireAuth, (req, res) => {
    const auth = authenticateRequest(req);
    if (!auth || auth.type === 'key') {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const tagId = String(req.params.id || '').trim();
    if (!tagId) {
      return res.status(400).json({ error: 'tag_id_required' });
    }
    const { name, color } = req.body || {};
    try {
      const updated = updateTagInCatalog(tagId, { name, color }, auth.user.id);
      if (!updated) {
        return res.status(404).json({ error: 'tag_not_found' });
      }
      return res.json({ tag: updated });
    } catch (error) {
      if (error.message === 'tag_exists') {
        return res.status(409).json({ error: 'Tag already exists.' });
      }
      if (error.message === 'name_required') {
        return res.status(400).json({ error: 'Tag name required.' });
      }
      return res.status(400).json({ error: error.message || 'Failed to update tag.' });
    }
  });

  app.delete('/api/tags/:id', requireAuth, (req, res) => {
    const auth = authenticateRequest(req);
    if (!auth || auth.type === 'key') {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const tagId = String(req.params.id || '').trim();
    if (!tagId) {
      return res.status(400).json({ error: 'tag_id_required' });
    }
    const removed = removeTagFromCatalog(tagId, auth.user.id);
    if (!removed) {
      return res.status(404).json({ error: 'tag_not_found' });
    }
    const cleared = removeTagAssignments(tagId);
    return res.json({ ok: true, removed, cleared });
  });

  /* -------------------------------------------------------------------------- */
  /* API Keys                                                                   */
  /* -------------------------------------------------------------------------- */
  app.get('/api/api-keys', requireAdmin, (req, res) => {
    const auth = authenticateRequest(req);
    if (auth?.type === 'admin' && !hasAdminPermission(auth, 'apiKeys')) {
      return res.status(403).json({ error: 'admin_permission_denied' });
    }
    const keys = listApiKeys();
    return res.json({ keys });
  });

  app.post('/api/api-keys', requireAdmin, (req, res) => {
    const auth = authenticateRequest(req);
    if (auth?.type === 'admin' && !hasAdminPermission(auth, 'apiKeys')) {
      return res.status(403).json({ error: 'admin_permission_denied' });
    }
    const { name, scope = 'global', counters } = req.body || {};
    try {
      const allowed = Array.isArray(counters)
        ? counters
        : typeof counters === 'string'
        ? counters
            .split(/[\n,]/)
            .map((value) => value.trim())
            .filter(Boolean)
        : [];
      const result = createApiKey({ name, scope, counters: allowed });
      return res.status(201).json({ key: result.key, token: result.token });
    } catch (error) {
      const message = error.message === 'counters_required'
        ? 'Provide at least one counter ID for limited keys.'
        : error.message === 'name_required'
        ? 'Name is required.'
        : error.message || 'failed_to_create_key';
      return res.status(400).json({ error: message });
    }
  });

  app.delete('/api/api-keys/:id', requireAdmin, (req, res) => {
    const auth = authenticateRequest(req);
    if (auth?.type === 'admin' && !hasAdminPermission(auth, 'apiKeys')) {
      return res.status(403).json({ error: 'admin_permission_denied' });
    }
    const removed = deleteApiKey(req.params.id);
    if (!removed) {
      return res.status(404).json({ error: 'api_key_not_found' });
    }
    return res.json({ ok: true });
  });

  /* -------------------------------------------------------------------------- */
  /* Counter Cleanup                                                            */
  /* -------------------------------------------------------------------------- */
  app.post('/api/counters/purge-inactive', requireAdmin, (req, res) => {
    const auth = authenticateRequest(req);
    if (auth?.type === 'admin' && !hasAdminPermission(auth, 'danger')) {
      return res.status(403).json({ error: 'admin_permission_denied' });
    }
    const requestedDays = Number(req.body?.days);
    const safeDays = Math.max(1, Number.isFinite(requestedDays) ? Math.round(requestedDays) : INACTIVE_THRESHOLD_DAYS);
    const removed = deleteInactiveCountersOlderThan(safeDays);
    return res.json({ ok: true, removed, days: safeDays });
  });
}

module.exports = registerSettingsRoutes;
