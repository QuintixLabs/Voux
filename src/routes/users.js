/*
  src/routes/users.js

  Admin user-management routes.
*/

function registerUsersRoutes(app, deps) {
  const {
    requireAdmin,
    authenticateRequest,
    hasAdminPermission,
    getOwnerId,
    listUsers,
    createUser,
    updateUser,
    deleteUser,
    countAdmins,
    getUserById,
    resolveAvatarUrl
  } = deps;

  /* -------------------------------------------------------------------------- */
  /* List Users                                                                 */
  /* -------------------------------------------------------------------------- */
  app.get('/api/users', requireAdmin, (req, res) => {
    const auth = authenticateRequest(req);
    if (auth?.type === 'admin' && !hasAdminPermission(auth, 'users')) {
      return res.status(403).json({ error: 'admin_permission_denied' });
    }
    const ownerId = getOwnerId();
    const users = listUsers().map((user) => ({
      ...user,
      isOwner: ownerId ? user.id === ownerId : false
    }));
    return res.json({ users });
  });

  /* -------------------------------------------------------------------------- */
  /* Create User                                                                */
  /* -------------------------------------------------------------------------- */
  app.post('/api/users', requireAdmin, (req, res) => {
    const auth = authenticateRequest(req);
    if (auth?.type === 'admin' && !hasAdminPermission(auth, 'users')) {
      return res.status(403).json({ error: 'admin_permission_denied' });
    }
    const { username, password, role, displayName, avatarUrl } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'username_password_required' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'password_too_short' });
    }
    const avatarResult = resolveAvatarUrl(`user-${Date.now()}`, avatarUrl, null);
    if (avatarResult.error) {
      return res.status(400).json({ error: avatarResult.error });
    }
    try {
      const user = createUser({
        username,
        password,
        role,
        displayName,
        avatarUrl: avatarResult.value
      });
      return res.status(201).json({ user });
    } catch (error) {
      if (error.message === 'username_exists') {
        return res.status(409).json({ error: 'username_exists' });
      }
      if (error.message === 'username_required') {
        return res.status(400).json({ error: 'username_required' });
      }
      return res.status(400).json({ error: 'failed_to_create_user' });
    }
  });

  /* -------------------------------------------------------------------------- */
  /* Update User                                                                */
  /* -------------------------------------------------------------------------- */
  app.patch('/api/users/:id', requireAdmin, (req, res) => {
    const auth = authenticateRequest(req);
    if (auth?.type === 'admin' && !hasAdminPermission(auth, 'users')) {
      return res.status(403).json({ error: 'admin_permission_denied' });
    }
    const { role, displayName, avatarUrl, password, username } = req.body || {};
    const target = getUserById(req.params.id);
    if (!target) {
      return res.status(404).json({ error: 'user_not_found' });
    }
    const ownerId = getOwnerId();
    const requesterIsOwner = Boolean(ownerId && auth?.user?.id === ownerId);
    if (ownerId && target.id === ownerId && !requesterIsOwner) {
      return res.status(403).json({ error: 'owner_locked' });
    }
    if (target.role === 'admin' && !requesterIsOwner) {
      return res.status(403).json({ error: 'admin_edit_forbidden' });
    }
    if (password && String(password).length < 6) {
      return res.status(400).json({ error: 'password_too_short' });
    }
    if (username !== undefined && !String(username || '').trim()) {
      return res.status(400).json({ error: 'username_required' });
    }
    const avatarResult = resolveAvatarUrl(target.id, avatarUrl, target.avatar_url);
    if (avatarResult.error) {
      return res.status(400).json({ error: avatarResult.error });
    }
    try {
      const updated = updateUser(req.params.id, {
        role,
        displayName,
        avatarUrl: avatarResult.value,
        password,
        username
      });
      if (!updated) {
        return res.status(404).json({ error: 'user_not_found' });
      }
      return res.json({ user: updated });
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

  /* -------------------------------------------------------------------------- */
  /* Delete User                                                                */
  /* -------------------------------------------------------------------------- */
  app.delete('/api/users/:id', requireAdmin, (req, res) => {
    const auth = authenticateRequest(req);
    if (auth?.type === 'admin' && !hasAdminPermission(auth, 'users')) {
      return res.status(403).json({ error: 'admin_permission_denied' });
    }
    if (auth?.user?.id === req.params.id) {
      return res.status(400).json({ error: 'cannot_delete_self' });
    }
    const target = getUserById(req.params.id);
    const ownerId = getOwnerId();
    const requesterIsOwner = Boolean(ownerId && auth?.user?.id === ownerId);
    if (ownerId && target?.id === ownerId && !requesterIsOwner) {
      return res.status(403).json({ error: 'owner_locked' });
    }
    if (target?.role === 'admin' && !requesterIsOwner) {
      return res.status(403).json({ error: 'admin_delete_forbidden' });
    }
    if (target?.role === 'admin' && countAdmins() <= 1) {
      return res.status(400).json({ error: 'last_admin' });
    }
    const removed = deleteUser(req.params.id);
    if (!removed) {
      return res.status(404).json({ error: 'user_not_found' });
    }
    return res.json({ ok: true });
  });
}

module.exports = registerUsersRoutes;
