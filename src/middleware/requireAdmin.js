/*
  requireAdmin.js

  Auth helpers for admin token and API keys. Applies login blocking for admin.
*/

const {
  findApiKeyByToken,
  recordApiKeyUsage
} = require('../db');
const getClientIp = require('../utils/ip');
const {
  checkLoginBlock,
  recordLoginFailure,
  clearLoginFailures
} = require('../utils/loginLimiter');

function authenticateRequest(req) {
  if (req.auth) {
    return req.auth;
  }
  const adminToken = process.env.ADMIN_TOKEN;
  const providedAdmin = req.get('x-voux-admin');
  if (adminToken && providedAdmin && providedAdmin === adminToken) {
    req.auth = { type: 'admin' };
    const ip = getClientIdentifier(req);
    clearLoginFailures(ip);
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
  const ip = getClientIdentifier(req);
  const block = checkLoginBlock(ip);
  if (block.blocked) {
    req.adminLoginBlocked = block;
    return false;
  }
  const auth = authenticateRequest(req);
  if (auth && auth.type === 'admin') {
    clearLoginFailures(ip);
    return true;
  }
  const providedAdmin = req.get('x-voux-admin');
  if (providedAdmin) {
    const result = recordLoginFailure(ip);
    if (result.blocked) {
      req.adminLoginBlocked = result;
    }
  }
  return false;
}

function requireAdmin(req, res, next) {
  if (!process.env.ADMIN_TOKEN) {
    return res.status(403).json({ error: 'admin_token_not_configured' });
  }
  const ip = getClientIdentifier(req);
  const block = checkLoginBlock(ip);
  if (block.blocked) {
    setRetryAfter(res, block.retryAfterSeconds);
    return res.status(429).json(rateLimitPayload(block.retryAfterSeconds));
  }
  const auth = authenticateRequest(req);
  if (!auth || auth.type !== 'admin') {
    const providedAdmin = req.get('x-voux-admin');
    if (providedAdmin) {
      const result = recordLoginFailure(ip);
      if (result.blocked) {
        setRetryAfter(res, result.retryAfterSeconds);
        return res.status(429).json(rateLimitPayload(result.retryAfterSeconds));
      }
    }
    return res.status(401).json({ error: 'unauthorized' });
  }
  clearLoginFailures(ip);
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
module.exports.getClientIdentifier = getClientIdentifier;
function getClientIdentifier(req) {
  return getClientIp(req);
}

function rateLimitPayload(seconds) {
  const retrySeconds = Math.max(1, Number(seconds) || 0);
  const pretty = retrySeconds === 1 ? '1 second' : `${retrySeconds} seconds`;
  return {
    error: 'login_rate_limited',
    message: `Too many incorrect passwords. Try again in about ${pretty}.`,
    retryAfterSeconds: retrySeconds
  };
}

function setRetryAfter(res, seconds) {
  const retrySeconds = Math.max(1, Number(seconds) || 0);
  res.set('Retry-After', String(retrySeconds));
}
