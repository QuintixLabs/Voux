/*
  src/routes/auth.js

  Session/auth routes.
*/

function registerAuthRoutes(app, deps) {
  const {
    authenticateRequest,
    getOwnerId,
    serializeUser,
    getEffectiveAdminPermissions,
    getClientIp,
    checkLoginBlock,
    setRetryAfter,
    rateLimitPayload,
    getUserByUsername,
    verifyPassword,
    recordLoginFailure,
    clearLoginFailures,
    createSession,
    SESSION_TTL_MS,
    recordUserLogin,
    setSessionCookie,
    deleteSession,
    getSessionToken,
    clearSessionCookie
  } = deps;

  /* -------------------------------------------------------------------------- */
  /* Session                                                                    */
  /* -------------------------------------------------------------------------- */
  app.get('/api/session', (req, res) => {
    const auth = authenticateRequest(req);
    if (!auth || auth.type === 'key') {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const ownerId = getOwnerId();
    const user = serializeUser(auth.user, ownerId);
    const adminPermissions = auth.type === 'admin' ? getEffectiveAdminPermissions(auth.user?.id) : null;
    return res.json({ user, adminPermissions });
  });

  /* -------------------------------------------------------------------------- */
  /* Login                                                                      */
  /* -------------------------------------------------------------------------- */
  app.post('/api/login', (req, res) => {
    const ip = getClientIp(req);
    const block = checkLoginBlock(ip);
    if (block.blocked) {
      setRetryAfter(res, block.retryAfterSeconds);
      return res.status(429).json(rateLimitPayload(block.retryAfterSeconds));
    }
    const { username, password } = req.body || {};
    const normalizedUsername = typeof username === 'string' ? username.trim().toLowerCase() : '';
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
    const { token } = createSession(user.id, SESSION_TTL_MS);
    recordUserLogin(user.id);
    setSessionCookie(res, token, req);
    const ownerId = getOwnerId();
    const adminPermissions = user.role === 'admin' ? getEffectiveAdminPermissions(user.id) : null;
    return res.json({ user: serializeUser(user, ownerId), adminPermissions });
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
