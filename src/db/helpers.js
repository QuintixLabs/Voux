/*
  src/db/helpers.js

  Shared small helpers used across DB modules.
*/

const crypto = require('crypto');

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeIdList(ids, limit = 200) {
  if (!Array.isArray(ids)) return [];
  const normalized = [];
  const seen = new Set();
  ids.forEach((value) => {
    const id = typeof value === 'string' ? value.trim() : '';
    if (id && !seen.has(id)) {
      normalized.push(id.slice(0, 64));
      seen.add(id);
    }
  });
  return normalized.slice(0, limit);
}

function generateId(length = 8) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(length);
  let id = '';
  for (let i = 0; i < length; i += 1) {
    id += alphabet[bytes[i] % alphabet.length];
  }
  return id;
}

function describeModeLabel(mode) {
  return mode === 'unlimited' ? 'Every visit' : 'Unique visitors';
}

function parseRequestedMode(input) {
  if (input === undefined || input === null || input === '' || input === 'default') {
    return { mode: 'unique' };
  }
  const normalized = String(input).trim().toLowerCase();
  if (normalized === 'unique') return { mode: 'unique' };
  if (normalized === 'unlimited') return { mode: 'unlimited' };
  return { error: 'mode must be "unique" or "unlimited"' };
}

function sanitizeTagColor(value) {
  if (typeof value !== 'string') return '#4c6ef5';
  const normalized = value.trim().startsWith('#') ? value.trim() : `#${value.trim()}`;
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) return normalized.toLowerCase();
  return '#4c6ef5';
}

function sanitizeTagCatalog(entries = []) {
  if (!Array.isArray(entries)) return [];
  const seen = new Set();
  const sanitized = [];
  entries.forEach((entry) => {
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    if (!id || !name || seen.has(id)) return;
    sanitized.push({ id, name: name.slice(0, 40), color: sanitizeTagColor(entry.color) });
    seen.add(id);
  });
  return sanitized;
}

function getDayStartTimestamp(timestamp) {
  const target = timestamp ? new Date(timestamp) : new Date();
  target.setHours(0, 0, 0, 0);
  return target.getTime();
}

function toSafeNumber(value) {
  if (value == null) return 0;
  if (typeof value === 'bigint') return Number(value);
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function normalizeSearch(search) {
  if (!search && search !== 0) return null;
  const value = String(search).trim().toLowerCase();
  if (!value) return null;
  return `%${value}%`;
}

function extractIntegerDigits(value) {
  if (value === undefined || value === null) return 0n;
  const raw = typeof value === 'bigint' ? value.toString() : String(value || '');
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return 0n;
  if (digits.length > 18) return null;
  try {
    return BigInt(digits);
  } catch {
    return null;
  }
}

function normalizeDailyEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const counterId = typeof raw.counter_id === 'string' ? raw.counter_id.trim() : '';
  if (!counterId) return null;
  const day = Number(raw.day);
  const hits = Number(raw.hits);
  if (!Number.isFinite(day) || !Number.isFinite(hits) || hits < 0) return null;
  return {
    counter_id: counterId.slice(0, 64),
    day: Math.floor(day),
    hits: Math.floor(hits)
  };
}

function normalizeApiKeyRow(row) {
  if (!row) return null;
  const normalizeTimestamp = (value) => {
    if (value == null) return null;
    if (typeof value === 'bigint') return Number(value);
    return Number(value);
  };
  let allowed = [];
  if (row.allowed_counters) {
    try {
      const parsed = JSON.parse(row.allowed_counters);
      if (Array.isArray(parsed)) {
        allowed = parsed.map((item) => String(item)).filter(Boolean);
      }
    } catch {
      allowed = [];
    }
  }
  return {
    id: row.id,
    name: row.name,
    scope: row.scope === 'limited' ? 'limited' : 'global',
    allowedCounters: allowed,
    createdAt: normalizeTimestamp(row.created_at) || 0,
    lastUsedAt: normalizeTimestamp(row.last_used_at),
    disabled: Boolean(row.disabled)
  };
}

function normalizeUserRow(row) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    displayName: row.display_name || '',
    avatarUrl: row.avatar_url || '',
    createdAt: toSafeNumber(row.created_at),
    updatedAt: toSafeNumber(row.updated_at),
    lastLoginAt: toSafeNumber(row.last_login_at)
  };
}

module.exports = {
  DAY_MS,
  normalizeIdList,
  generateId,
  describeModeLabel,
  parseRequestedMode,
  sanitizeTagColor,
  sanitizeTagCatalog,
  getDayStartTimestamp,
  toSafeNumber,
  normalizeSearch,
  extractIntegerDigits,
  normalizeDailyEntry,
  normalizeApiKeyRow,
  normalizeUserRow
};
