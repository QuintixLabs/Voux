/*
  loginLimiter.js

  Tracks admin login attempts and blocks after too many failures.
*/

const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 60 * 1000; // 1 minute window
const LOCK_DURATION_MS = 45 * 1000; // lock for 45 seconds

const attempts = new Map();

function cleanEntry(entry, now) {
  if (!entry) return null;
  const current = entry;
  if (current.blockUntil && current.blockUntil <= now) {
    current.blockUntil = 0;
  }
  if (Array.isArray(current.failures)) {
    current.failures = current.failures.filter((ts) => now - ts < ATTEMPT_WINDOW_MS);
  } else {
    current.failures = [];
  }
  return current;
}

function ensureEntry(ip) {
  const now = Date.now();
  const existing = attempts.get(ip);
  if (existing) {
    return cleanEntry(existing, now);
  }
  const entry = { failures: [], blockUntil: 0 };
  attempts.set(ip, entry);
  return entry;
}

function checkLoginBlock(ip, now = Date.now()) {
  if (!ip || !attempts.has(ip)) {
    return { blocked: false, retryAfterSeconds: 0 };
  }
  const entry = cleanEntry(attempts.get(ip), now);
  if (!entry || !entry.blockUntil) {
    return { blocked: false, retryAfterSeconds: 0 };
  }
  if (entry.blockUntil > now) {
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.blockUntil - now) / 1000));
    return { blocked: true, retryAfterSeconds };
  }
  entry.blockUntil = 0;
  return { blocked: false, retryAfterSeconds: 0 };
}

function recordLoginFailure(ip, now = Date.now()) {
  if (!ip) {
    return { blocked: false, retryAfterSeconds: 0 };
  }
  const entry = ensureEntry(ip);
  cleanEntry(entry, now);
  entry.failures.push(now);
  if (entry.failures.length >= MAX_ATTEMPTS) {
    entry.blockUntil = now + LOCK_DURATION_MS;
    entry.failures = [];
    const retryAfterSeconds = Math.max(1, Math.ceil(LOCK_DURATION_MS / 1000));
    return { blocked: true, retryAfterSeconds };
  }
  attempts.set(ip, entry);
  return checkLoginBlock(ip, now);
}

function clearLoginFailures(ip) {
  if (!ip) return;
  attempts.delete(ip);
}

module.exports = {
  checkLoginBlock,
  recordLoginFailure,
  clearLoginFailures
};
