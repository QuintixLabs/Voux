/*
  dashboard/shared/helpers.js

  Shared helper functions for dashboard formatting and normalization.
*/

/* -------------------------------------------------------------------------- */
/* Formatting helpers                                                         */
/* -------------------------------------------------------------------------- */
function formatNumber(value) {
  if (value === null || value === undefined) return '0';
  if (typeof value === 'bigint') {
    return value.toLocaleString();
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    try {
      return BigInt(value).toLocaleString();
    } catch {
      // fall through
    }
  }
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString();
}

function formatLastHit(timestamp) {
  if (!timestamp) {
    return 'No hits yet';
  }
  const diff = Date.now() - timestamp;
  if (diff <= 0) return 'Just now';
  const seconds = Math.floor(diff / 1000);
  const minute = 60;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (seconds < minute) {
    return 'Just now';
  }
  if (seconds < hour) {
    const mins = Math.floor(seconds / minute);
    return `${mins}m ago`;
  }
  if (seconds < day) {
    const hours = Math.floor(seconds / hour);
    return `${hours}h ago`;
  }
  if (seconds < day * 30) {
    const days = Math.floor(seconds / day);
    return `${days}d ago`;
  }
  return new Date(timestamp).toLocaleDateString();
}

/* -------------------------------------------------------------------------- */
/* Search/tag text helpers                                                    */
/* -------------------------------------------------------------------------- */
function truncateQuery(query) {
  if (!query) return '';
  return query.length > 32 ? `${query.slice(0, 32)}...` : query;
}

function extractTagIds(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) => {
      if (!tag) return '';
      if (typeof tag === 'string') return tag;
      if (typeof tag.id === 'string') return tag.id;
      return '';
    })
    .filter(Boolean);
}

function slugifyFilename(value) {
  return String(value || 'counter')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'counter';
}

/* -------------------------------------------------------------------------- */
/* Color helpers                                                              */
/* -------------------------------------------------------------------------- */
function normalizeHexColor(color) {
  if (typeof color !== 'string') return null;
  const value = color.trim();
  const withHash = value.startsWith('#') ? value : `#${value}`;
  if (/^#[0-9a-fA-F]{6}$/.test(withHash)) return withHash.toLowerCase();
  return null;
}

function getTagContrastColor(hex) {
  if (!hex) return '#ffffff';
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  if ([r, g, b].some((channel) => Number.isNaN(channel))) {
    return '#ffffff';
  }
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.65 ? '#0b0f19' : '#ffffff';
}

/* -------------------------------------------------------------------------- */
/* Activity helpers                                                           */
/* -------------------------------------------------------------------------- */
function resolveActivityLevel(hits, ratio) {
  const count = Number(hits) || 0;
  if (count >= 50) return 'max';
  if (count >= 20) return 'high';
  if (count >= 5) return 'mid';
  if (count >= 1 && ratio >= 0.8) return 'mid';
  return 'low';
}

export {
  formatNumber,
  formatLastHit,
  truncateQuery,
  extractTagIds,
  slugifyFilename,
  normalizeHexColor,
  getTagContrastColor,
  resolveActivityLevel
};
