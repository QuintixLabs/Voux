const {
  findApiKeyByToken,
  recordApiKeyUsage
} = require('../db');

function authenticateRequest(req) {
  if (req.auth) {
    return req.auth;
  }
  const adminToken = process.env.ADMIN_TOKEN;
  const providedAdmin = req.get('x-voux-admin');
  if (adminToken && providedAdmin && providedAdmin === adminToken) {
    req.auth = { type: 'admin' };
    return req.auth;
  }
  const apiToken = req.get('x-voux-key');
  if (apiToken) {
    const key = findApiKeyByToken(apiToken);
    if (key && !key.disabled) {
      recordApiKeyUsage(key.id);
      req.auth = { type: 'key', key };
      return req.auth;
    }
  }
  return null;
}

function verifyAdmin(req) {
  const auth = authenticateRequest(req);
  return Boolean(auth && auth.type === 'admin');
}

function requireAdmin(req, res, next) {
  if (!process.env.ADMIN_TOKEN) {
    return res.status(403).json({ error: 'admin_token_not_configured' });
  }
  const auth = authenticateRequest(req);
  if (!auth || auth.type !== 'admin') {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

function requireAdminOrKey(req, res, next) {
  const auth = authenticateRequest(req);
  if (!auth) {
    if (!process.env.ADMIN_TOKEN) {
      return res.status(403).json({ error: 'admin_token_not_configured' });
    }
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

function hasCounterAccess(auth, counterId) {
  if (!auth) return false;
  if (auth.type === 'admin') return true;
  if (auth.type === 'key') {
    if (auth.key.scope === 'global') {
      return true;
    }
    const allowed = auth.key.allowedCounters || [];
    return allowed.includes(counterId);
  }
  return false;
}

module.exports = requireAdmin;
module.exports.verifyAdmin = verifyAdmin;
module.exports.requireAdminOrKey = requireAdminOrKey;
module.exports.hasCounterAccess = hasCounterAccess;
module.exports.authenticateRequest = authenticateRequest;
