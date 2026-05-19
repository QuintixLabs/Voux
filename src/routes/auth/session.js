/*
  src/routes/auth/session.js

  Session/auth routes.
*/

function registerAuthRoutes(app, deps) {
  const {
    // Auth serialization
    authenticateRequest,
    getOwnerId,
    serializeUser,
    getEffectiveAdminPermissions,

    // User setup + lookup
    countUsers,
    createUser,

    // Rate limit + client info
    getClientIp,
    checkLoginBlock,
    setRetryAfter,
    rateLimitPayload,

    // Credentials
    getUserByUsername,
    verifyPassword,
    recordLoginFailure,
    clearLoginFailures,

    // Session creation
    createSession,
    SESSION_TTL_MS,
    REMEMBER_DEVICE_TTL_MS,
    recordUserLogin,
    setSessionCookie,

    // Session cleanup
    deleteSession,
    getSessionToken,
    clearSessionCookie
  } = deps;

  function isLoopbackSetupRequest(req) {
    const rawHost = String(req.hostname || req.get('host') || '')
      .trim()
      .toLowerCase();
    const host = rawHost.replace(/^\[|\]$/g, '');
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  }

  function isSameOriginSetupRequest(req) {
    const expectedHost = String(req.get('host') || '')
      .trim()
      .toLowerCase();
    if (!expectedHost) {
      return false;
    }

    const origin = String(req.get('origin') || '').trim();
    const referer = String(req.get('referer') || '').trim();
    const source = origin || referer;
    if (!source) {
      return false;
    }

    try {
      const parsed = new URL(source);
      return parsed.host.toLowerCase() === expectedHost;
    } catch {
      return false;
    }
  }

  /* -------------------------------------------------------------------------- */
  /* Session                                                                    */
  /* -------------------------------------------------------------------------- */
  app.get('/api/setup/status', (req, res) => {
    return res.json({
      setupRequired: countUsers() === 0,
      setupAllowed: isLoopbackSetupRequest(req)
    });
  });

  app.get('/api/session', (req, res) => {
    const auth = authenticateRequest(req);
    if (!auth || auth.type === 'key') {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const ownerId = getOwnerId();
    const user = serializeUser(auth.user, ownerId);
    const adminPermissions =
      auth.type === 'admin'
        ? getEffectiveAdminPermissions(auth.user?.id)
        : null;
    return res.json({ user, adminPermissions });
  });

  /* -------------------------------------------------------------------------- */
  /* Login                                                                      */
  /* -------------------------------------------------------------------------- */
  app.post('/api/login', (req, res) => {
    if (countUsers() === 0) {
      return res.status(409).json({ error: 'setup_required' });
    }

    const ip = getClientIp(req);
    const block = checkLoginBlock(ip);
    if (block.blocked) {
      setRetryAfter(res, block.retryAfterSeconds);
      return res.status(429).json(rateLimitPayload(block.retryAfterSeconds));
    }

    const { username, password, rememberDevice } = req.body || {};
    const normalizedUsername =
      typeof username === 'string' ? username.trim().toLowerCase() : '';
    if (!normalizedUsername || !password) {
      return res.status(400).json({ error: 'username_password_required' });
    }

    const user = getUserByUsername(normalizedUsername);
    if (!user || !verifyPassword(user.password_hash, password)) {
      const result = recordLoginFailure(ip);
      if (result.blocked) {
        setRetryAfter(res, result.retryAfterSeconds);
        return res.status(429).json(rateLimitPayload(result.retryAfterSeconds));
      }
      return res.status(401).json({ error: 'invalid_credentials' });
    }
    
    clearLoginFailures(ip);
    const ttlMs =
      rememberDevice === true ? REMEMBER_DEVICE_TTL_MS : SESSION_TTL_MS;
    const { token } = createSession(user.id, ttlMs);
    recordUserLogin(user.id);
    setSessionCookie(res, token, req, ttlMs);
    const ownerId = getOwnerId();
    const adminPermissions =
      user.role === 'admin' ? getEffectiveAdminPermissions(user.id) : null;
    return res.json({ user: serializeUser(user, ownerId), adminPermissions });
  });

  /* -------------------------------------------------------------------------- */
  /* First User Setup                                                           */
  /* -------------------------------------------------------------------------- */
  app.post('/api/setup/first-user', (req, res) => {
    if (countUsers() > 0) {
      return res.status(409).json({ error: 'setup_unavailable' });
    }
    if (!isLoopbackSetupRequest(req)) {
      return res.status(403).json({ error: 'setup_local_only' });
    }
    if (!isSameOriginSetupRequest(req)) {
      return res.status(403).json({ error: 'csrf_blocked' });
    }

    const { username, password, displayName, rememberDevice } = req.body || {};
    const normalizedUsername =
      typeof username === 'string' ? username.trim().toLowerCase() : '';
    if (!normalizedUsername || !password) {
      return res.status(400).json({ error: 'username_password_required' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'password_too_short' });
    }

    try {
      const user = createUser({
        username: normalizedUsername,
        password,
        displayName,
        role: 'admin'
      });
      const ttlMs =
        rememberDevice === true ? REMEMBER_DEVICE_TTL_MS : SESSION_TTL_MS;
      const { token } = createSession(user.id, ttlMs);
      recordUserLogin(user.id);
      setSessionCookie(res, token, req, ttlMs);
      const ownerId = getOwnerId();
      const adminPermissions = getEffectiveAdminPermissions(user.id);
      return res.status(201).json({
        user: serializeUser(user, ownerId),
        adminPermissions
      });
    } catch (error) {
      if (error.message === 'username_exists') {
        return res.status(409).json({ error: 'username_exists' });
      }
      if (error.message === 'username_required') {
        return res.status(400).json({ error: 'username_required' });
      }
      return res.status(400).json({ error: 'setup_failed' });
    }
  });

  /* -------------------------------------------------------------------------- */
  /* Logout                                                                     */
  /* -------------------------------------------------------------------------- */
  app.post('/api/logout', (req, res) => {
    const token = getSessionToken(req);
    if (token) {
      deleteSession(token);
    }
    clearSessionCookie(res);
    return res.json({ ok: true });
  });
}

module.exports = registerAuthRoutes;
