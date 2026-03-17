/*
  src/middleware/securityHeaders.js

  Common response security headers and trust-proxy parsing.
*/

function shouldUseSecureCookie(req) {
  if (req.secure) return true;
  const proto = req.get('x-forwarded-proto');
  return typeof proto === 'string' && proto.toLowerCase().includes('https');
}

function resolveTrustProxySetting(rawValue) {
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') {
    return 'loopback';
  }
  const value = String(rawValue).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(value)) return true;
  if (['false', '0', 'no', 'off'].includes(value)) return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

function createSecurityHeadersMiddleware() {
  return (req, res, next) => {
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
        "img-src 'self' data:",
        "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net data:",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
        "connect-src 'self' https://api.github.com"
      ].join('; ')
    );
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (shouldUseSecureCookie(req)) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  };
}

module.exports = {
  createSecurityHeadersMiddleware,
  shouldUseSecureCookie,
  resolveTrustProxySetting
};
