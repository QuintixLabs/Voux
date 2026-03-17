/*
  src/db/crypto.js

  Token/password hashing and verification helpers.
*/

const crypto = require('crypto');

function generateApiKeyToken() {
  return `voux_${crypto.randomBytes(10).toString('hex')}`;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function hashPassword(password, salt = null) {
  const safePassword = String(password || '');
  const saltBytes = salt ? Buffer.from(salt, 'hex') : crypto.randomBytes(16);
  const iterations = 120000;
  const hash = crypto.pbkdf2Sync(safePassword, saltBytes, iterations, 32, 'sha256');
  return `pbkdf2$${iterations}$${saltBytes.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(storedHash, password) {
  if (!storedHash || typeof storedHash !== 'string') return false;
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  const salt = parts[2];
  const expected = parts[3];
  if (!Number.isFinite(iterations) || !salt || !expected) return false;
  const hash = crypto.pbkdf2Sync(String(password || ''), Buffer.from(salt, 'hex'), iterations, expected.length / 2, 'sha256');
  const expectedBuf = Buffer.from(expected, 'hex');
  return expectedBuf.length === hash.length && crypto.timingSafeEqual(expectedBuf, hash);
}

module.exports = {
  generateApiKeyToken,
  hashToken,
  hashPassword,
  verifyPassword
};
