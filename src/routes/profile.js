/*
  src/routes/profile.js

  Logged-in profile routes.
*/

function registerProfileRoutes(app, deps) {
  const {
    requireAuth,
    authenticateRequest,
    getOwnerId,
    serializeUser,
    getEffectiveAdminPermissions,
    getUserByUsername,
    verifyPassword,
    resolveAvatarUrl,
    updateUser
  } = deps;

  /* -------------------------------------------------------------------------- */
  /* Read Profile                                                               */
  /* -------------------------------------------------------------------------- */
  app.get('/api/profile', requireAuth, (req, res) => {
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
  /* Update Profile                                                             */
  /* -------------------------------------------------------------------------- */
  app.patch('/api/profile', requireAuth, (req, res) => {
    const auth = authenticateRequest(req);
    if (!auth || auth.type === 'key') {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const { displayName, avatarUrl, currentPassword, newPassword, username } = req.body || {};
    if (username !== undefined && !String(username || '').trim()) {
      return res.status(400).json({ error: 'username_required' });
    }
    if (username !== undefined && String(username).trim().toLowerCase() === auth.user.username) {
      return res.status(400).json({ error: 'username_unchanged' });
    }
    let password = null;
    const userRow = getUserByUsername(auth.user.username);
    const usernameChange = username !== undefined && String(username).trim().toLowerCase() !== auth.user.username;
    if (usernameChange || newPassword) {
      if (!userRow || !verifyPassword(userRow.password_hash, currentPassword || '')) {
        return res.status(401).json({ error: 'invalid_credentials' });
      }
    }
    if (newPassword) {
      if (String(newPassword).length < 6) {
        return res.status(400).json({ error: 'password_too_short' });
      }
      password = String(newPassword);
    }
    const avatarResult = resolveAvatarUrl(auth.user.id, avatarUrl, userRow?.avatar_url);
    if (avatarResult.error) {
      return res.status(400).json({ error: avatarResult.error });
    }
    try {
      const updated = updateUser(auth.user.id, {
        displayName,
        avatarUrl: avatarResult.value,
        password,
        username
      });
      if (!updated) {
        return res.status(404).json({ error: 'user_not_found' });
      }
      const ownerId = getOwnerId();
      return res.json({ user: serializeUser(updated, ownerId) });
    } catch (error) {
      if (error.message === 'username_exists') {
        return res.status(409).json({ error: 'username_exists' });
      }
      if (error.message === 'username_required') {
        return res.status(400).json({ error: 'username_required' });
      }
      return res.status(400).json({ error: 'failed_to_update_user' });
    }
  });
}

module.exports = registerProfileRoutes;
