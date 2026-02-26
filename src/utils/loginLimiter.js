/*
  loginLimiter.js

  Tracks admin login attempts and blocks after too many failures.
*/

/* ========================================================================== */
/* Settings                                                                   */
/* ========================================================================== */
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 60 * 1000; // 1 minute window
const LOCK_DURATION_MS = 45 * 1000; // lock for 45 seconds
const TRACKER_IDLE_TTL_MS = Math.max(
  ATTEMPT_WINDOW_MS,
  Number.isFinite(Number(process.env.LOGIN_LIMITER_IDLE_TTL_MS))
    ? Number(process.env.LOGIN_LIMITER_IDLE_TTL_MS)
    : 30 * 60 * 1000
);
const TRACKER_MAX_ENTRIES = Math.max(
  1000,
  Number.isFinite(Number(process.env.LOGIN_LIMITER_MAX_ENTRIES))
    ? Number(process.env.LOGIN_LIMITER_MAX_ENTRIES)
    : 20000
);
const TRACKER_CLEANUP_INTERVAL_MS = Math.max(
  1000,
  Number.isFinite(Number(process.env.LOGIN_LIMITER_CLEANUP_INTERVAL_MS))
    ? Number(process.env.LOGIN_LIMITER_CLEANUP_INTERVAL_MS)
    : 60 * 1000
);
const TRACKER_EVICT_PERCENT = Math.min(
  0.5,
  Math.max(
    0.01,
    Number.isFinite(Number(process.env.LOGIN_LIMITER_EVICT_PERCENT))
      ? Number(process.env.LOGIN_LIMITER_EVICT_PERCENT)
      : 0.1
  )
);

/* ========================================================================== */
/* State                                                                      */
/* ========================================================================== */
const attempts = new Map();
let nextMaintenanceAt = 0;

/* ========================================================================== */
/* Helpers                                                                    */
/* ========================================================================== */
function cleanEntry(entry, now, touch = true) {
  if (!entry) return null;
  const current = entry;
  if (touch) {
    current.lastSeen = now;
  }
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
  maybeRunMaintenance(now);
  const existing = attempts.get(ip);
  if (existing) {
    return cleanEntry(existing, now);
  }
  const entry = { failures: [], blockUntil: 0, lastSeen: now };
  attempts.set(ip, entry);
  enforceMaxSize();
  return entry;
}

function checkLoginBlock(ip, now = Date.now()) {
  maybeRunMaintenance(now);
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

function maybeRunMaintenance(now) {
  if (now < nextMaintenanceAt && attempts.size <= TRACKER_MAX_ENTRIES) {
    return;
  }
  nextMaintenanceAt = now + TRACKER_CLEANUP_INTERVAL_MS;
  pruneExpiredEntries(now);
  enforceMaxSize();
}

function pruneExpiredEntries(now) {
  for (const [ip, entry] of attempts.entries()) {
    const cleaned = cleanEntry(entry, now, false);
    const isExpired = now - (cleaned.lastSeen || 0) > TRACKER_IDLE_TTL_MS;
    const hasNoFailures = !cleaned.failures || cleaned.failures.length === 0;
    const isBlocked = Boolean(cleaned.blockUntil && cleaned.blockUntil > now);
    if (isExpired && hasNoFailures && !isBlocked) {
      attempts.delete(ip);
    }
  }
}

function enforceMaxSize() {
  if (attempts.size <= TRACKER_MAX_ENTRIES) {
    return;
  }
  const entries = Array.from(attempts.entries())
    .map(([ip, entry]) => ({ ip, lastSeen: entry?.lastSeen || 0 }))
    .sort((a, b) => a.lastSeen - b.lastSeen);
  const overflow = attempts.size - TRACKER_MAX_ENTRIES;
  const percentBatch = Math.ceil(TRACKER_MAX_ENTRIES * TRACKER_EVICT_PERCENT);
  const deleteCount = Math.max(overflow, percentBatch);
  for (let i = 0; i < deleteCount && i < entries.length; i += 1) {
    attempts.delete(entries[i].ip);
  }
}

/* ========================================================================== */
/* Exports                                                                    */
/* ========================================================================== */
module.exports = {
  checkLoginBlock,
  recordLoginFailure,
  clearLoginFailures
};
