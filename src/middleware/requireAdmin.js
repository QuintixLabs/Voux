/*
  requireAdmin.js

  Auth helpers for sessions, users, and API keys.
*/

/* ========================================================================== */
/* Dependencies                                                               */
/* ========================================================================== */
const {
  findApiKeyByToken,
  recordApiKeyUsage,
  findSession,
  getUserById
} = require('../db');
const getClientIp = require('../utils/ip');
const {
  checkLoginBlock,
  recordLoginFailure,
  clearLoginFailures
} = require('../utils/loginLimiter');

/* ========================================================================== */
/* Constants                                                                  */
/* ========================================================================== */
const SESSION_COOKIE = 'voux_session';

/* ========================================================================== */
/* Cookie + session helpers                                                   */
/* ========================================================================== */
function parseCookies(req) {
  const header = req.headers?.cookie;
  if (!header) return {};
  return header.split(';').reduce((acc, pair) => {
    const [rawKey, ...rest] = pair.split('=');
    if (!rawKey) return acc;
    const key = rawKey.trim();
    const value = rest.join('=').trim();
    if (!key) return acc;
    acc[key] = decodeURIComponent(value || '');
    return acc;
  }, {});
}

function getSessionToken(req) {
  const cookies = parseCookies(req);
  return cookies[SESSION_COOKIE] || '';
}

/* ========================================================================== */
/* Auth resolution                                                            */
/* ========================================================================== */
function authenticateRequest(req) {
  if (req.auth) {
    return req.auth;
  }
  const sessionToken = getSessionToken(req);
  if (sessionToken) {
    const session = findSession(sessionToken);
    if (session) {
      const user = getUserById(session.user_id);
      if (user) {
        req.auth = { type: user.role === 'admin' ? 'admin' : 'user', user };
        return req.auth;
      }
    }
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

/* ========================================================================== */
/* Role guards                                                                */
/* ========================================================================== */
function verifyAdmin(req) {
  const auth = authenticateRequest(req);
  return Boolean(auth && auth.type === 'admin');
}

function requireAdmin(req, res, next) {
  const auth = authenticateRequest(req);
  if (!auth || auth.type !== 'admin') {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

function requireAuth(req, res, next) {
  const auth = authenticateRequest(req);
  if (!auth || auth.type === 'key') {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

function requireAdminOrKey(req, res, next) {
  const auth = authenticateRequest(req);
  if (!auth || (auth.type !== 'admin' && auth.type !== 'key')) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

function requireAuthOrKey(req, res, next) {
  const auth = authenticateRequest(req);
  if (!auth) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

/* ========================================================================== */
/* Access checks                                                              */
/* ========================================================================== */
function hasCounterAccess(auth, counter) {
  if (!auth || !counter) return false;
  if (auth.type === 'admin') return true;
  if (auth.type === 'user') {
    return Boolean(counter.owner_id && auth.user?.id === counter.owner_id);
  }
  if (auth.type === 'key') {
    if (auth.key.scope === 'global') {
      return true;
    }
    const allowed = auth.key.allowedCounters || [];
    return allowed.includes(counter.id);
  }
  return false;
}

/* ========================================================================== */
/* Rate limiting                                                              */
/* ========================================================================== */
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

/* ========================================================================== */
/* Exports                                                                    */
/* ========================================================================== */
module.exports = requireAdmin;
module.exports.verifyAdmin = verifyAdmin;
module.exports.requireAdminOrKey = requireAdminOrKey;
module.exports.requireAuth = requireAuth;
module.exports.requireAuthOrKey = requireAuthOrKey;
module.exports.hasCounterAccess = hasCounterAccess;
module.exports.authenticateRequest = authenticateRequest;
module.exports.getClientIdentifier = getClientIdentifier;
module.exports.checkLoginBlock = checkLoginBlock;
module.exports.recordLoginFailure = recordLoginFailure;
module.exports.clearLoginFailures = clearLoginFailures;
module.exports.rateLimitPayload = rateLimitPayload;
module.exports.setRetryAfter = setRetryAfter;
module.exports.getSessionToken = getSessionToken;
