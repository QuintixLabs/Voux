/*
  src/middleware/csrf.js

  Same-origin guard for cookie-authenticated API writes.
*/

function isUnsafeMethod(method) {
  const m = String(method || '').toUpperCase();
  return m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE';
}

function normalizeOrigin(value) {
  if (!value) return '';
  const raw = String(value).trim().toLowerCase();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}`;
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

function createCsrfGuard(options = {}) {
  const {
    getSessionToken,
    getBaseUrl
  } = options;

  return (req, res, next) => {
    if (!isUnsafeMethod(req.method)) {
      return next();
    }
    if (!req.path.startsWith('/api/')) {
      return next();
    }
    if (!getSessionToken || !getSessionToken(req)) {
      return next();
    }

    const expected = normalizeOrigin(getBaseUrl ? getBaseUrl(req) : '');
    if (!expected) {
      return next();
    }

    const origin = normalizeOrigin(req.get('origin'));
    const referer = normalizeOrigin(req.get('referer'));
    if (origin) {
      if (origin === expected) return next();
      return res.status(403).json({ error: 'csrf_blocked' });
    }
    if (referer) {
      if (referer === expected || referer.startsWith(`${expected}/`)) return next();
      return res.status(403).json({ error: 'csrf_blocked' });
    }
    return res.status(403).json({ error: 'csrf_blocked' });
  };
}

module.exports = createCsrfGuard;
