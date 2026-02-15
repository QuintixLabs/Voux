/*
  ip.js

  Extracts client IP from proxy headers and socket info.
*/

function getClientIp(req) {
  if (!req) return null;
  const ip = req.ip || req.socket?.remoteAddress || null;
  if (!ip) return null;
  const normalized = String(ip).trim();
  if (!normalized) return null;
  return normalized.replace(/^::ffff:/, '');
}

module.exports = getClientIp;
