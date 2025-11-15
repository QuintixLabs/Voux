function getClientIp(req) {
  if (!req) return null;
  const forwarded = req.headers?.['x-forwarded-for'];
  const forwardedIp = Array.isArray(forwarded)
    ? forwarded[0]
    : typeof forwarded === 'string'
    ? forwarded.split(',')[0]
    : null;
  return (
    req.headers?.['cf-connecting-ip'] ||
    (forwardedIp ? forwardedIp.trim() : null) ||
    req.ip ||
    req.socket?.remoteAddress ||
    null
  );
}

module.exports = getClientIp;
