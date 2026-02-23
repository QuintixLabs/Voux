/*
  configStore.js

  Loads, stores, and updates runtime config (private mode, branding, allowed modes, tags).
*/

/* ========================================================================== */
/* Dependencies                                                               */
/* ========================================================================== */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* ========================================================================== */
/* Paths + defaults                                                           */
/* ========================================================================== */
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const THEME_HELPER_PATH = path.resolve(__dirname, '..', 'public', 'js', 'theme.js');
const ALLOWED_THEMES = loadAllowedThemesFromThemeHelper();

const defaultConfig = {
  privateMode: String(process.env.PRIVATE_MODE || '').toLowerCase() === 'true',
  showGuides:
    process.env.SHOW_PUBLIC_GUIDES === undefined
      ? true
      : String(process.env.SHOW_PUBLIC_GUIDES).toLowerCase() === 'true',
  allowedModes: normalizeAllowedModes(process.env.DEFAULT_ALLOWED_MODES),
  brandName: sanitizeText(process.env.BRAND_NAME, 'Voux', 80),
  homeTitle: sanitizeText(
    process.env.HOME_TITLE,
    'Voux · Simple Free & Open Source Hit Counter for Blogs and Websites',
    120
  ),
  unlimitedThrottleSeconds: sanitizeThrottle(process.env.UNLIMITED_THROTTLE_SECONDS),
  theme: sanitizeTheme(process.env.THEME || 'default'),
  autoBackup: sanitizeAutoBackup({
    frequency: process.env.AUTO_BACKUP_FREQUENCY || 'off',
    time: process.env.AUTO_BACKUP_TIME || '03:00',
    weekday: process.env.AUTO_BACKUP_WEEKDAY,
    retention: process.env.AUTO_BACKUP_RETENTION,
    includeJson: process.env.AUTO_BACKUP_INCLUDE_JSON
  }),
  tagCatalog: [],
  adminPermissions: {
    runtime: true,
    branding: true,
    apiKeys: true,
    users: true,
    danger: true
  },
  adminPermissionOverrides: {}
};

let config = loadConfig();

/* ========================================================================== */
/* Config lifecycle                                                           */
/* ========================================================================== */
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      return sanitizeConfig(parsed);
    }
  } catch (error) {
    console.warn('Failed to load config.json, using defaults', error);
  }
  return { ...defaultConfig };
}

function sanitizeConfig(raw) {
  const safe = { ...defaultConfig };
  if (typeof raw.privateMode === 'boolean') {
    safe.privateMode = raw.privateMode;
  }
  if (typeof raw.showGuides === 'boolean') {
    safe.showGuides = raw.showGuides;
  }
  if (raw && typeof raw.allowedModes === 'object') {
    const normalized = {
      unique: raw.allowedModes.unique !== false,
      unlimited: raw.allowedModes.unlimited !== false
    };
    if (!normalized.unique && !normalized.unlimited) {
      normalized.unique = true;
    }
    safe.allowedModes = normalized;
  }
  if (typeof raw.brandName === 'string') {
    safe.brandName = sanitizeText(raw.brandName, defaultConfig.brandName, 80);
  }
  if (typeof raw.homeTitle === 'string') {
    safe.homeTitle = sanitizeText(raw.homeTitle, defaultConfig.homeTitle, 120);
  }
  if (Number.isFinite(Number(raw.unlimitedThrottleSeconds))) {
    safe.unlimitedThrottleSeconds = sanitizeThrottle(raw.unlimitedThrottleSeconds);
  }
  if (typeof raw.theme === 'string') {
    safe.theme = sanitizeTheme(raw.theme);
  }
  safe.autoBackup = sanitizeAutoBackup(raw.autoBackup || safe.autoBackup);
  safe.tagCatalog = Array.isArray(raw.tagCatalog) ? sanitizeTagCatalog(raw.tagCatalog) : [];
  if (raw && typeof raw.adminPermissions === 'object') {
    safe.adminPermissions = sanitizeAdminPermissions(raw.adminPermissions, defaultConfig.adminPermissions);
  }
  if (raw && typeof raw.adminPermissionOverrides === 'object') {
    safe.adminPermissionOverrides = sanitizeAdminPermissionOverrides(
      raw.adminPermissionOverrides,
      defaultConfig.adminPermissions
    );
  }
  return safe;
}

function persistConfig() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Failed to write config.json', error);
  }
}

function getConfig() {
  return { ...config };
}

function updateConfig(patch = {}) {
  config = sanitizeConfig({ ...config, ...patch });
  persistConfig();
  return getConfig();
}

/* ========================================================================== */
/* Exports                                                                    */
/* ========================================================================== */
module.exports = {
  getConfig,
  updateConfig,
  listTagCatalog,
  addTagToCatalog,
  updateTagInCatalog,
  ensureTagExists,
  mergeTagCatalog,
  filterTagIds,
  removeTagFromCatalog
};

/* ========================================================================== */
/* Sanitizers                                                                 */
/* ========================================================================== */
function normalizeAllowedModes(envValue) {
  const normalized = String(envValue || '').trim().toLowerCase();
  if (!normalized) {
    return { unique: true, unlimited: true };
  }
  const parts = normalized.split(',').map((part) => part.trim()).filter(Boolean);
  const allowed = {
    unique: parts.includes('unique'),
    unlimited: parts.includes('unlimited')
  };
  if (!allowed.unique && !allowed.unlimited) {
    allowed.unique = true;
  }
  return allowed;
}

function sanitizeText(value, fallback, limit) {
  const source = typeof value === 'string' ? value : fallback || '';
  return source.trim().slice(0, limit || 120);
}

function sanitizeThrottle(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return 0;
  }
  return Math.min(60, Math.max(1, Math.round(num)));
}

function sanitizeTheme(value) {
  const key = String(value || '').trim().toLowerCase();
  return ALLOWED_THEMES.has(key) ? key : 'default';
}

function sanitizeAutoBackup(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const frequency = ['off', 'daily', 'weekly'].includes(String(raw.frequency || '').toLowerCase())
    ? String(raw.frequency || '').toLowerCase()
    : 'off';
  const time = sanitizeBackupTime(raw.time);
  const weekdayRaw = Number(raw.weekday);
  const weekday = Number.isFinite(weekdayRaw)
    ? Math.max(0, Math.min(6, Math.floor(weekdayRaw)))
    : 0;
  const retentionRaw = Number(raw.retention);
  const retention = Number.isFinite(retentionRaw)
    ? Math.max(1, Math.min(30, Math.round(retentionRaw)))
    : 7;
  return {
    frequency,
    time,
    weekday,
    retention,
    includeJson: toBoolean(raw.includeJson, false)
  };
}

function sanitizeBackupTime(value) {
  const raw = String(value || '').trim();
  if (!/^\d{2}:\d{2}$/.test(raw)) {
    return '03:00';
  }
  const [h, m] = raw.split(':').map((part) => Number(part));
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return '03:00';
  }
  const hour = Math.max(0, Math.min(23, Math.floor(h)));
  const minute = Math.max(0, Math.min(59, Math.floor(m)));
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') return false;
  }
  return fallback;
}

function loadAllowedThemesFromThemeHelper() {
  const fallback = new Set(['default']);
  try {
    const source = fs.readFileSync(THEME_HELPER_PATH, 'utf8');
    const match = source.match(/const\s+THEMES\s*=\s*\[([\s\S]*?)\];/);
    if (!match) return fallback;
    const entries = [];
    const valueRegex = /['"]([a-z0-9_-]+)['"]/gi;
    let next = valueRegex.exec(match[1]);
    while (next) {
      entries.push(next[1].toLowerCase());
      next = valueRegex.exec(match[1]);
    }
    if (!entries.length) return fallback;
    return new Set(entries);
  } catch {
    return fallback;
  }
}

function sanitizeTagCatalog(list) {
  const seen = new Set();
  const sanitized = [];
  list.forEach((entry) => {
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    if (!id || !name || seen.has(id)) return;
    sanitized.push({
      id,
      name: name.slice(0, 40),
      color: sanitizeColor(entry.color)
    });
    seen.add(id);
  });
  return sanitized;
}

function sanitizeColor(value) {
  if (typeof value !== 'string') return '#4c6ef5';
  const normalized = value.trim().startsWith('#') ? value.trim() : `#${value.trim()}`;
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return normalized.toLowerCase();
  }
  return '#4c6ef5';
}

function sanitizeAdminPermissions(input, fallback = {}) {
  const safe = {};
  const keys = Object.keys(fallback || {});
  keys.forEach((key) => {
    const raw = input && Object.prototype.hasOwnProperty.call(input, key) ? input[key] : fallback[key];
    safe[key] = raw !== false;
  });
  return safe;
}

function sanitizeAdminPermissionOverrides(overrides = {}, fallback = {}) {
  const safe = {};
  Object.entries(overrides || {}).forEach(([userId, perms]) => {
    if (!userId || typeof perms !== 'object') return;
    safe[userId] = sanitizeAdminPermissions(perms, fallback);
  });
  return safe;
}

/* ========================================================================== */
/* Tag catalog                                                                */
/* ========================================================================== */
function listTagCatalog() {
  return Array.isArray(config.tagCatalog) ? config.tagCatalog.map((tag) => ({ ...tag })) : [];
}

function addTagToCatalog({ name, color }) {
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  if (!normalizedName) {
    throw new Error('name_required');
  }
  if (listTagCatalog().some((tag) => tag.name.toLowerCase() === normalizedName.toLowerCase())) {
    throw new Error('tag_exists');
  }
  const newTag = {
    id: crypto.randomBytes(6).toString('hex'),
    name: normalizedName.slice(0, 40),
    color: sanitizeColor(color)
  };
  config.tagCatalog = [...listTagCatalog(), newTag];
  persistConfig();
  return newTag;
}

function updateTagInCatalog(tagId, { name, color } = {}) {
  const normalizedId = typeof tagId === 'string' ? tagId.trim() : '';
  if (!normalizedId) {
    throw new Error('tag_id_required');
  }
  const catalog = listTagCatalog();
  const index = catalog.findIndex((tag) => tag.id === normalizedId);
  if (index === -1) return null;

  const next = { ...catalog[index] };

  if (name !== undefined) {
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    if (!normalizedName) {
      throw new Error('name_required');
    }
    const collision = catalog.some(
      (tag) => tag.id !== normalizedId && tag.name.toLowerCase() === normalizedName.toLowerCase()
    );
    if (collision) {
      throw new Error('tag_exists');
    }
    next.name = normalizedName.slice(0, 40);
  }

  if (color !== undefined) {
    next.color = sanitizeColor(color);
  }

  catalog[index] = next;
  config.tagCatalog = catalog;
  persistConfig();
  return next;
}

/* -------------------------------------------------------------------------- */
/* Tag helpers                                                                */
/* -------------------------------------------------------------------------- */
function ensureTagExists(tagId) {
  const catalog = listTagCatalog();
  return catalog.some((tag) => tag.id === tagId);
}

function mergeTagCatalog(entries = []) {
  const incoming = sanitizeTagCatalog(entries);
  if (!incoming.length) return;
  const current = new Map(listTagCatalog().map((tag) => [tag.id, tag]));
  incoming.forEach((tag) => {
    if (!current.has(tag.id)) {
      current.set(tag.id, tag);
    }
  });
  config.tagCatalog = Array.from(current.values());
  persistConfig();
}

function removeTagFromCatalog(tagId) {
  const normalized = typeof tagId === 'string' ? tagId.trim() : '';
  if (!normalized) return null;
  const catalog = listTagCatalog();
  const index = catalog.findIndex((tag) => tag.id === normalized);
  if (index === -1) return null;
  const [removed] = catalog.splice(index, 1);
  config.tagCatalog = catalog;
  persistConfig();
  return removed;
}

function filterTagIds(ids = [], limit = 20) {
  if (!Array.isArray(ids)) return [];
  const catalog = listTagCatalog();
  const valid = new Set(catalog.map((tag) => tag.id));
  const normalized = [];
  ids.forEach((value) => {
    const id = typeof value === 'string' ? value.trim() : '';
    if (id && valid.has(id) && !normalized.includes(id)) {
      normalized.push(id);
    }
  });
  return normalized.slice(0, limit);
}
