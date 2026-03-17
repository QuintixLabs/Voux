/*
  src/services/counterCreationLimiter.js

  In-memory limiter for POST /api/counters creation bursts.
*/

function createCounterCreationLimiter(options = {}) {
  const limitCount = Math.max(1, Number(options.limitCount) || 5);
  const limitWindowMs = Math.max(1000, Number(options.limitWindowMs) || 60 * 1000);
  const idleTtlMs = Math.max(
    limitWindowMs,
    Number(options.idleTtlMs) || 15 * 60 * 1000
  );
  const maxEntries = Math.max(1000, Number(options.maxEntries) || 20000);
  const cleanupIntervalMs = Math.max(
    1000,
    Number(options.cleanupIntervalMs) || 60 * 1000
  );
  const evictPercent = Math.min(
    0.5,
    Math.max(0.01, Number(options.evictPercent) || 0.1)
  );

  const tracker = new Map();
  let nextMaintenanceAt = 0;

  function getEntry(ip, now) {
    const existing = tracker.get(ip);
    if (!existing) {
      return { timestamps: [], lastSeen: now };
    }
    const timestamps = Array.isArray(existing.timestamps)
      ? existing.timestamps.filter((ts) => now - ts < limitWindowMs)
      : [];
    const lastSeen = Number.isFinite(existing.lastSeen) ? existing.lastSeen : now;
    return { timestamps, lastSeen };
  }

  function prune(now) {
    for (const [ip] of tracker.entries()) {
      const entry = getEntry(ip, now);
      const isExpired = now - entry.lastSeen > idleTtlMs;
      if (isExpired && entry.timestamps.length === 0) {
        tracker.delete(ip);
        continue;
      }
      tracker.set(ip, entry);
    }
  }

  function enforceMaxSize() {
    if (tracker.size <= maxEntries) {
      return;
    }
    const entries = Array.from(tracker.entries())
      .map(([ip, entry]) => ({ ip, lastSeen: Number(entry?.lastSeen) || 0 }))
      .sort((a, b) => a.lastSeen - b.lastSeen);

    const overflow = tracker.size - maxEntries;
    const percentBatch = Math.ceil(maxEntries * evictPercent);
    const deleteCount = Math.max(overflow, percentBatch);

    for (let i = 0; i < deleteCount && i < entries.length; i += 1) {
      tracker.delete(entries[i].ip);
    }
  }

  function maintain(now) {
    if (now < nextMaintenanceAt && tracker.size <= maxEntries) {
      return;
    }
    nextMaintenanceAt = now + cleanupIntervalMs;
    prune(now);
    enforceMaxSize();
  }

  return {
    check(ip, now = Date.now()) {
      if (!ip) {
        return { allowed: true, retryAfterSeconds: 0 };
      }
      maintain(now);
      const entry = getEntry(ip, now);
      if (entry.timestamps.length >= limitCount) {
        const oldest = entry.timestamps[0];
        const retryAfterMs = limitWindowMs - (now - oldest);
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000))
        };
      }
      return { allowed: true, retryAfterSeconds: 0 };
    },

    record(ip, now = Date.now()) {
      if (!ip) return;
      maintain(now);
      const entry = getEntry(ip, now);
      entry.timestamps.push(now);
      entry.lastSeen = now;
      tracker.set(ip, entry);
      enforceMaxSize();
    }
  };
}

module.exports = createCounterCreationLimiter;
