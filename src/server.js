/*
  src/server.js

  Express API + embed server for Voux. Serves API routes, embed script,
  and static HTML with versioned assets.
*/

require('dotenv').config();

/* core */
const express = require('express');
const path = require('path');
const fs = require('fs'); /* loads files and templates */
const {
  configureApp,
  registerPageRoutes,
  registerStaticAndErrorHandlers
} = require('./app');

/* db */
const {
  createCounter,
  listCountersPage,
  getCounter,
  recordHit,
  updateCounterValue,
  updateCounterMetadata,
  deleteCounter,
  deleteAllCounters,
  deleteCountersByMode,
  deleteCountersByOwner,
  deleteCountersByOwnerAndMode,
  deleteInactiveCountersOlderThan,
  countCounters,
  getLastHitTimestamp,
  getCounterDailyTrend,
  exportDailyActivity,
  exportDailyActivityFor,
  importDailyActivity,
  importDailyActivityFor,
  seedLastHitsFromDaily,
  exportCounters,
  exportCountersByIds,
  importCounters,
  importCountersForOwner,
  parseRequestedMode,
  describeModeLabel,
  removeTagAssignments,
  createDatabaseBackup,
  listTagCatalog,
  addTagToCatalog,
  updateTagInCatalog,
  removeTagFromCatalog,
  mergeTagCatalog,
  filterTagIds,
  createApiKey,
  listApiKeys,
  deleteApiKey,
  setUnlimitedThrottle,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  countUsers,
  countAdmins,
  getOwnerUser,
  getUserById,
  getUserByUsername,
  verifyPassword,
  createSession,
  deleteSession,
  recordUserLogin
} = require('./db');

/* config */
const {
  getConfig,
  updateConfig
} = require('./configStore');

/* middleware */
const requireAdmin = require('./middleware/requireAdmin');
const createCsrfGuard = require('./middleware/csrf');
const {
  createSecurityHeadersMiddleware,
  shouldUseSecureCookie,
  resolveTrustProxySetting
} = require('./middleware/securityHeaders');
const {
  requireAuth,
  requireAuthOrKey,
  hasCounterAccess,
  authenticateRequest,
  checkLoginBlock,
  recordLoginFailure,
  clearLoginFailures,
  rateLimitPayload,
  setRetryAfter,
  getSessionToken
} = require('./middleware/requireAdmin');

/* utils */
const getClientIp = require('./utils/ip');
const createCounterCreationLimiter = require('./services/counterCreationLimiter');
const createBackupService = require('./services/backups');
const createAvatarService = require('./services/avatars');
const createPermissionsService = require('./services/permissions');
const createCounterRequestService = require('./services/counterRequest');
const createCounterStatsService = require('./services/counterStats');
const createCounterResponseService = require('./services/counterResponse');
const registerAllRoutes = require('./routes');
const buildRouteDeps = require('./routes/deps');

/* basic settings */
const PORT = process.env.PORT || 8787;

/* pagination */
const DEFAULT_PAGE_SIZE = Number(process.env.ADMIN_PAGE_SIZE) || 5;
const DEFAULT_USERS_PAGE_SIZE = Math.max(
  1,
  Math.min(Number(process.env.USERS_PAGE_SIZE) || 4, 50)
);

/* rate limiting: counter creation */
const CREATION_LIMIT_COUNT = Math.max(
  1,
  Number.isFinite(Number(process.env.COUNTER_CREATE_LIMIT))
    ? Number(process.env.COUNTER_CREATE_LIMIT)
    : 5
);
const CREATION_LIMIT_WINDOW_MS = Math.max(
  1000,
  Number.isFinite(Number(process.env.COUNTER_CREATE_WINDOW_MS))
    ? Number(process.env.COUNTER_CREATE_WINDOW_MS)
    : 60 * 1000
);
const creationLimiter = createCounterCreationLimiter({
  limitCount: CREATION_LIMIT_COUNT,
  limitWindowMs: CREATION_LIMIT_WINDOW_MS,
  idleTtlMs: Number(process.env.COUNTER_CREATE_TRACKER_IDLE_TTL_MS),
  cleanupIntervalMs: Number(process.env.COUNTER_CREATE_TRACKER_CLEANUP_INTERVAL_MS),
  maxEntries: Number(process.env.COUNTER_CREATE_TRACKER_MAX_ENTRIES),
  evictPercent: Number(process.env.COUNTER_CREATE_TRACKER_EVICT_PERCENT)
});

/* activity + cleanup */
const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVITY_WINDOW_DAYS = 30;
const INACTIVE_THRESHOLD_DAYS = Math.max(
  1,
  Number.isFinite(Number(process.env.INACTIVE_DAYS_THRESHOLD))
    ? Number(process.env.INACTIVE_DAYS_THRESHOLD)
    : 30
);
const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/* validation limits */
const LABEL_LIMIT = 80;
const NOTE_LIMIT = 200;
const START_VALUE_DIGIT_LIMIT = 18;
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/* sessions */
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SESSION_COOKIE = 'voux_session';

/* throttling config */
setUnlimitedThrottle((getConfig().unlimitedThrottleSeconds || 0) * 1000);

const app = express();
configureApp(app, {
  express,
  resolveTrustProxySetting,
  createSecurityHeadersMiddleware,
  createCsrfGuard,
  getSessionToken,
  getBaseUrl
});

/* static files + html */
// Web-served static root (example absolute path: /mnt/c/Users/lain/Downloads/Voux/public).
const staticDir = path.join(__dirname, '..', 'public');
const dataDir = path.join(__dirname, '..', 'data');
// User-uploaded files root (example absolute path: /mnt/c/Users/lain/Downloads/Voux/data/uploads).
const uploadsDir = path.join(dataDir, 'uploads');
const avatarUploadsDir = path.join(uploadsDir, 'avatars');
const notFoundPage = path.join(staticDir, '404.html');

const { resolveAvatarUrl } = createAvatarService({
  fs,
  path,
  avatarUploadsDir,
  staticDir,
  avatarMaxBytes: AVATAR_MAX_BYTES
});

const {
  validateCounterValue,
  extractSearchQuery,
  isPreviewRequest,
  normalizeIdsInput,
  normalizeCounterValue,
  normalizeCounterForExport,
  normalizeModeFilter,
  normalizeSort,
  normalizeInactiveFilter,
  normalizeTagFilter,
  normalizeAllowedModesPatch
} = createCounterRequestService({
  startValueDigitLimit: START_VALUE_DIGIT_LIMIT,
  filterTagIds
});

const {
  formatActivityTrend,
  buildInactiveStatus,
  toSafeNumber
} = createCounterStatsService({
  weekdayLabels,
  activityWindowDays: ACTIVITY_WINDOW_DAYS,
  inactiveThresholdDays: INACTIVE_THRESHOLD_DAYS,
  dayMs: DAY_MS
});

const {
  serializeCounter,
  serializeCounterWithStats,
  serializeUser
} = createCounterResponseService({
  normalizeCounterValue,
  describeModeLabel,
  listTagCatalog,
  toSafeNumber,
  getLastHitTimestamp,
  getCounterDailyTrend,
  formatActivityTrend,
  buildInactiveStatus,
  activityWindowDays: ACTIVITY_WINDOW_DAYS
});

const {
  getOwnerId,
  isKnownOwner,
  getEffectiveAdminPermissions,
  hasAdminPermission
} = createPermissionsService({
  getConfig,
  getOwnerUser,
  getUserById
});

const backupService = createBackupService({
  fs,
  path,
  dataDir,
  staticDir,
  uploadsDir,
  requestedBackupDir: process.env.BACKUP_DIR,
  getConfig,
  createDatabaseBackup,
  exportCounters,
  exportDailyActivity,
  normalizeCounterForExport
});

/* html cache + env */
const htmlCache = new Map();
const IS_DEV = String(process.env.DEV_MODE || process.env.NODE_ENV || '').toLowerCase() === 'development';

/*
==========================================================================
Routes: Health + Config
==========================================================================
*/
app.get('/api/health', (req, res) => {
  res.json({ ok: true, timestamp: Date.now() });
});

app.get('/api/config', (req, res) => {
  const runtimeConfig = getConfig();
  const defaultMode = getDefaultMode(runtimeConfig);
  res.json({
    // Public-safe config only. 
    // Admin permissions/overrides should never be exposed here.
    // even tho its nun harmful there's no reason to expose admin-related data publicly :/
    privateMode: Boolean(runtimeConfig.privateMode),
    showGuides: Boolean(runtimeConfig.showGuides),
    allowedModes: runtimeConfig.allowedModes || { unique: true, unlimited: true },
    brandName: runtimeConfig.brandName || 'Voux',
    homeTitle: runtimeConfig.homeTitle || '',
    unlimitedThrottleSeconds: Number(runtimeConfig.unlimitedThrottleSeconds) || 0,
    theme: runtimeConfig.theme || 'default',
    version: getAppVersion(),
    adminPageSize: DEFAULT_PAGE_SIZE,
    usersPageSize: DEFAULT_USERS_PAGE_SIZE,
    inactiveDaysThreshold: INACTIVE_THRESHOLD_DAYS,
    defaultMode,
    defaultCooldownLabel: describeModeLabel(defaultMode)
  });
});

const routeDeps = buildRouteDeps({
  requireAdmin,
  requireAuth,
  requireAuthOrKey,
  authenticateRequest,
  hasAdminPermission,
  hasCounterAccess,
  getOwnerId,
  getConfig,
  updateConfig,
  normalizeAllowedModesPatch,
  backupService,
  htmlCache,
  setUnlimitedThrottle,
  getVersion,
  DEFAULT_USERS_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  INACTIVE_THRESHOLD_DAYS,
  DAY_MS,
  serializeUser,
  getEffectiveAdminPermissions,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  countAdmins,
  getUserById,
  resolveAvatarUrl,
  normalizeModeFilter,
  normalizeSort,
  normalizeInactiveFilter,
  normalizeTagFilter,
  extractSearchQuery,
  countCounters,
  listCountersPage,
  isKnownOwner,
  serializeCounterWithStats,
  exportCounters,
  exportDailyActivityFor,
  exportDailyActivity,
  normalizeCounterForExport,
  listTagCatalog,
  exportCountersByIds,
  normalizeIdsInput,
  importCounters,
  importCountersForOwner,
  mergeTagCatalog,
  importDailyActivity,
  importDailyActivityFor,
  seedLastHitsFromDaily,
  getCounter,
  deleteCounter,
  updateCounterValue,
  validateCounterValue,
  updateCounterMetadata,
  LABEL_LIMIT,
  NOTE_LIMIT,
  filterTagIds,
  deleteCountersByOwnerAndMode,
  deleteCountersByOwner,
  deleteCountersByMode,
  deleteAllCounters,
  isPrivateMode,
  getClientIp,
  checkCreationRate,
  CREATION_LIMIT_COUNT,
  CREATION_LIMIT_WINDOW_MS,
  getDefaultMode,
  parseRequestedMode,
  isModeAllowed,
  createCounter,
  recordCreationAttempt,
  getBaseUrl,
  serializeCounter,
  addTagToCatalog,
  updateTagInCatalog,
  removeTagFromCatalog,
  removeTagAssignments,
  listApiKeys,
  createApiKey,
  deleteApiKey,
  deleteInactiveCountersOlderThan,
  isPreviewRequest,
  recordHit,
  normalizeCounterValue,
  checkLoginBlock,
  setRetryAfter,
  rateLimitPayload,
  getUserByUsername,
  verifyPassword,
  recordLoginFailure,
  clearLoginFailures,
  createSession,
  SESSION_TTL_MS,
  recordUserLogin,
  setSessionCookie,
  deleteSession,
  getSessionToken,
  clearSessionCookie
});

registerAllRoutes(app, routeDeps);

registerPageRoutes(app, serveHtml);
registerStaticAndErrorHandlers(app, {
  express,
  uploadsDir,
  staticDir,
  isDev: IS_DEV,
  loadHtmlTemplate,
  notFoundPage
});

/*
==========================================================================
Boot
==========================================================================
*/
bootstrapAdminUser();
backupService.init();

app.listen(PORT, () => {
  console.log(`Voux running at http://localhost:${PORT}`);
});

/* -------------------------------------------------------------------------- */
/* Security, session + bootstrap                                              */
/* -------------------------------------------------------------------------- */
function getBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) {
    return String(process.env.PUBLIC_BASE_URL).replace(/\/+$/, '');
  }
  const host = String(req.get('host') || '').trim();
  if (!host) return '';
  let protocol = req.protocol || 'http';
  if (req.secure) {
    protocol = 'https';
  } else {
    const forwarded = req.get('x-forwarded-proto');
    if (forwarded && String(forwarded).toLowerCase().includes('https')) {
      protocol = 'https';
    }
  }
  return `${protocol}://${host}`;
}

function setSessionCookie(res, token, req) {
  const secure = shouldUseSecureCookie(req);
  const maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000);
  const cookie = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'SameSite=Lax'
  ];
  if (secure) cookie.push('Secure');
  res.setHeader('Set-Cookie', cookie.join('; '));
}

function clearSessionCookie(res) {
  const cookie = [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax'
  ];
  res.setHeader('Set-Cookie', cookie.join('; '));
}

function bootstrapAdminUser() {
  if (countUsers() > 0) return;
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    console.warn('No users exist. Set ADMIN_USERNAME and ADMIN_PASSWORD to bootstrap the first admin.');
    return;
  }
  try {
    createUser({ username, password, role: 'admin' });
    console.log('Created initial admin user.');
  } catch (error) {
    console.warn('Failed to bootstrap admin user:', error.message);
  }
}

/* -------------------------------------------------------------------------- */
/* Rate limiting                                                              */
/* -------------------------------------------------------------------------- */
function checkCreationRate(ip, now = Date.now()) {
  return creationLimiter.check(ip, now);
}

function recordCreationAttempt(ip, now = Date.now()) {
  creationLimiter.record(ip, now);
}

/* -------------------------------------------------------------------------- */
/* HTML + templates                                                           */
/* -------------------------------------------------------------------------- */
function injectVersion(html) {
  if (!html) return html;
  if (IS_DEV) {
    return html.replace(/\?v=%APP_VERSION%/g, '');
  }
  const versionToken = `?v=${getAppVersion()}`;
  return html.replace(/\?v=%APP_VERSION%/g, versionToken);
}

function injectTheme(html) {
  if (!html) return html;
  const rawTheme = String(getConfig()?.theme || 'default').trim().toLowerCase();
  const theme = rawTheme.replace(/[^a-z0-9_-]/g, '') || 'default';
  return html.replace(/<html\b([^>]*)>/i, (match, attrs) => {
    if (/data-theme=/.test(attrs)) return match;
    return `<html${attrs} data-theme="${theme}">`;
  });
}

// Reads and caches HTML templates with version tokens applied
function loadHtmlTemplate(filename) {
  if (!IS_DEV && htmlCache.has(filename)) {
    return htmlCache.get(filename);
  }
  try {
    const filePath = path.join(staticDir, filename);
    const raw = fs.readFileSync(filePath, 'utf8');
    const compiled = injectTheme(injectVersion(raw));
    if (!IS_DEV) {
      htmlCache.set(filename, compiled);
    }
    return compiled;
  } catch (error) {
    console.error(`Failed to load HTML template ${filename}`, error);
    return null;
  }
}

function serveHtml(filename, status = 200) {
  return (req, res) => {
    const html = loadHtmlTemplate(filename);
    if (!html) {
      return res.status(404).sendFile(notFoundPage);
    }
    res.set('Cache-Control', 'no-store'); // always fetch fresh HTML so versioned assets update
    res.status(status).send(html);
  };
}

/* -------------------------------------------------------------------------- */
/* Versioning                                                                 */
/* -------------------------------------------------------------------------- */
function getVersion() {
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

// Public-facing version string for cache-busting in HTML
function getAppVersion() {
  return String(getVersion() || '0.0.0');
}

function isPrivateMode() {
  return Boolean(getConfig().privateMode);
}

function getDefaultMode(runtimeConfig = getConfig()) {
  const allowed = runtimeConfig?.allowedModes || {};
  return allowed.unique !== false ? 'unique' : 'unlimited';
}

function isModeAllowed(mode, runtimeConfig = getConfig()) {
  const allowed = runtimeConfig?.allowedModes || {};
  if (mode === 'unlimited') {
    return allowed.unlimited !== false;
  }
  return allowed.unique !== false;
}
