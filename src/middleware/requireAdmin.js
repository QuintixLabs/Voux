function verifyAdmin(req) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    return false;
  }
  const provided = req.get('x-voux-admin');
  return provided === expected;
}

function requireAdmin(req, res, next) {
  if (!process.env.ADMIN_TOKEN) {
    return res.status(403).json({ error: 'admin_token_not_configured' });
  }
  if (!verifyAdmin(req)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

module.exports = requireAdmin;
module.exports.verifyAdmin = verifyAdmin;
