/*
  src/services/permissions.js

  Owner/admin permission helpers used by route handlers.
*/

function createPermissionsService(deps) {
  const {
    getConfig,
    getOwnerUser,
    getUserById
  } = deps;

  function getOwnerId() {
    const owner = getOwnerUser();
    return owner?.id || null;
  }

  function isKnownOwner(ownerId) {
    if (!ownerId) return false;
    return Boolean(getUserById(ownerId));
  }

  function getEffectiveAdminPermissions(userId) {
    const cfg = getConfig();
    const defaults = cfg.adminPermissions || {};
    const ownerId = getOwnerId();
    if (ownerId && userId === ownerId) {
      const ownerPerms = {};
      Object.keys(defaults).forEach((key) => {
        ownerPerms[key] = true;
      });
      return ownerPerms;
    }
    const overrides = cfg.adminPermissionOverrides || {};
    const override = overrides[userId];
    const merged = {};
    Object.keys(defaults).forEach((key) => {
      if (override && Object.prototype.hasOwnProperty.call(override, key)) {
        merged[key] = override[key] !== false;
      } else {
        merged[key] = defaults[key] !== false;
      }
    });
    return merged;
  }

  function hasAdminPermission(auth, key) {
    if (!auth || auth.type !== 'admin') return false;
    const ownerId = getOwnerId();
    if (ownerId && auth.user?.id === ownerId) return true;
    const perms = getEffectiveAdminPermissions(auth.user?.id);
    return perms && perms[key] !== false;
  }

  return {
    getOwnerId,
    isKnownOwner,
    getEffectiveAdminPermissions,
    hasAdminPermission
  };
}

module.exports = createPermissionsService;
