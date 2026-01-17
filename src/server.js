/*
  server.js

  Express API + embed server for Voux. Serves API routes, embed script,
  and static HTML with versioned assets.
*/

require('dotenv').config();

/* core */
const express = require('express');
const path = require('path');
const fs = require('fs'); /* loads files and templates */

/* db: counters */
const {
  createCounter,
  listCounters,
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
  countHitsSince,
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
  listTagCatalog,
  addTagToCatalog,
  updateTagInCatalog,
  removeTagFromCatalog,
  mergeTagCatalog,
  filterTagIds
} = require('./db');

/* db: api keys */
const {
  createApiKey,
  listApiKeys,
  deleteApiKey,
  setUnlimitedThrottle
} = require('./db');

/* db: users + auth */
const {
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
const {
  requireAdminOrKey,
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

/* basic settings */
const PORT = process.env.PORT || 8787;
const OWNER_USERNAME = '';

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
// tracks creation timestamps per IP
const creationTracker = new Map();

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

/* sessions */
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SESSION_COOKIE = 'voux_session';

/* throttling config */
setUnlimitedThrottle((getConfig().unlimitedThrottleSeconds || 0) * 1000);

/*
==========================================================================
App Setup
==========================================================================
*/
const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '3mb' }));
// CSP
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "img-src 'self' data:",
      "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net data:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
      "connect-src 'self' https://api.github.com"
    ].join('; ')
  );
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (shouldUseSecureCookie(req)) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

/* static files + html */
const staticDir = path.join(__dirname, '..', 'public');
const notFoundPage = path.join(staticDir, '404.html');

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
    ...runtimeConfig,
    version: getAppVersion(),
    adminPageSize: DEFAULT_PAGE_SIZE,
    usersPageSize: DEFAULT_USERS_PAGE_SIZE,
    defaultMode,
    defaultCooldownLabel: describeModeLabel(defaultMode)
  });
});

/*
==========================================================================
Routes: Session + Auth
==========================================================================
*/
app.get('/api/session', (req, res) => {
  const auth = authenticateRequest(req);
  if (!auth || auth.type === 'key') {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const ownerId = getOwnerId();
  res.json({ user: serializeUser(auth.user, ownerId) });
});

/* auth */
app.post('/api/login', (req, res) => {
  const ip = getClientIp(req);
  const block = checkLoginBlock(ip);
  if (block.blocked) {
    setRetryAfter(res, block.retryAfterSeconds);
    return res.status(429).json(rateLimitPayload(block.retryAfterSeconds));
  }
  const { username, password } = req.body || {};
  const normalizedUsername = typeof username === 'string' ? username.trim().toLowerCase() : '';
  if (!normalizedUsername || !password) {
    return res.status(400).json({ error: 'username_password_required' });
  }
  const user = getUserByUsername(normalizedUsername);
  if (!user || !verifyPassword(user.password_hash, password)) {
    const result = recordLoginFailure(ip);
    if (result.blocked) {
      setRetryAfter(res, result.retryAfterSeconds);
      return res.status(429).json(rateLimitPayload(result.retryAfterSeconds));
    }
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  clearLoginFailures(ip);
  const { token } = createSession(user.id, SESSION_TTL_MS);
  recordUserLogin(user.id);
  setSessionCookie(res, token, req);
  const ownerId = getOwnerId();
  res.json({ user: serializeUser(user, ownerId) });
});

app.post('/api/logout', (req, res) => {
  const token = getSessionToken(req);
  if (token) {
    deleteSession(token);
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

/*
==========================================================================
Routes: Profile
==========================================================================
*/
app.get('/api/profile', requireAuth, (req, res) => {
  const auth = authenticateRequest(req);
  if (!auth || auth.type === 'key') {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const ownerId = getOwnerId();
  res.json({ user: serializeUser(auth.user, ownerId) });
});

app.patch('/api/profile', requireAuth, (req, res) => {
  const auth = authenticateRequest(req);
  if (!auth || auth.type === 'key') {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const { displayName, avatarUrl, currentPassword, newPassword, username } = req.body || {};
  if (username !== undefined && !String(username || '').trim()) {
    return res.status(400).json({ error: 'username_required' });
  }
  if (username !== undefined && String(username).trim().toLowerCase() === auth.user.username) {
    return res.status(400).json({ error: 'username_unchanged' });
  }
  let password = null;
  const userRow = getUserByUsername(auth.user.username);
  const usernameChange = username !== undefined && String(username).trim().toLowerCase() !== auth.user.username;
  if (usernameChange || newPassword) {
    if (!userRow || !verifyPassword(userRow.password_hash, currentPassword || '')) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }
  }
  if (newPassword) {
    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: 'password_too_short' });
    }
    password = String(newPassword);
  }
  try {
    const updated = updateUser(auth.user.id, { displayName, avatarUrl, password, username });
    if (!updated) {
      return res.status(404).json({ error: 'user_not_found' });
    }
    const ownerId = getOwnerId();
    res.json({ user: serializeUser(updated, ownerId) });
  } catch (error) {
    if (error.message === 'username_exists') {
      return res.status(409).json({ error: 'username_exists' });
    }
    if (error.message === 'username_required') {
      return res.status(400).json({ error: 'username_required' });
    }
    res.status(400).json({ error: 'failed_to_update_user' });
  }
});

/*
==========================================================================
Routes: Users (Admin)
==========================================================================
*/
app.get('/api/users', requireAdmin, (_req, res) => {
  const ownerId = getOwnerId();
  const users = listUsers().map((user) => ({
    ...user,
    isOwner: ownerId ? user.id === ownerId : false
  }));
  res.json({ users });
});

app.post('/api/users', requireAdmin, (req, res) => {
  const { username, password, role, displayName, avatarUrl } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username_password_required' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'password_too_short' });
  }
  try {
    const user = createUser({ username, password, role, displayName, avatarUrl });
    res.status(201).json({ user });
  } catch (error) {
    if (error.message === 'username_exists') {
      return res.status(409).json({ error: 'username_exists' });
    }
    if (error.message === 'username_required') {
      return res.status(400).json({ error: 'username_required' });
    }
    res.status(400).json({ error: 'failed_to_create_user' });
  }
});

app.patch('/api/users/:id', requireAdmin, (req, res) => {
  const { role, displayName, avatarUrl, password, username } = req.body || {};
  const auth = authenticateRequest(req);
  const target = getUserById(req.params.id);
  if (!target) {
    return res.status(404).json({ error: 'user_not_found' });
  }
  const ownerId = getOwnerId();
  const requesterIsOwner = Boolean(ownerId && auth?.user?.id === ownerId);
  if (ownerId && target.id === ownerId && !requesterIsOwner) {
    return res.status(403).json({ error: 'owner_locked' });
  }
  if (target.role === 'admin' && !requesterIsOwner) {
    return res.status(403).json({ error: 'admin_edit_forbidden' });
  }
  if (password && String(password).length < 6) {
    return res.status(400).json({ error: 'password_too_short' });
  }
  if (username !== undefined && !String(username || '').trim()) {
    return res.status(400).json({ error: 'username_required' });
  }
  try {
    const updated = updateUser(req.params.id, { role, displayName, avatarUrl, password, username });
    if (!updated) {
      return res.status(404).json({ error: 'user_not_found' });
    }
    res.json({ user: updated });
  } catch (error) {
    if (error.message === 'username_exists') {
      return res.status(409).json({ error: 'username_exists' });
    }
    if (error.message === 'username_required') {
      return res.status(400).json({ error: 'username_required' });
    }
    res.status(400).json({ error: 'failed_to_update_user' });
  }
});

app.delete('/api/users/:id', requireAdmin, (req, res) => {
  const auth = authenticateRequest(req);
  if (auth?.user?.id === req.params.id) {
    return res.status(400).json({ error: 'cannot_delete_self' });
  }
  const target = getUserById(req.params.id);
  const ownerId = getOwnerId();
  const requesterIsOwner = Boolean(ownerId && auth?.user?.id === ownerId);
  if (ownerId && target?.id === ownerId && !requesterIsOwner) {
    return res.status(403).json({ error: 'owner_locked' });
  }
  if (target?.role === 'admin' && !requesterIsOwner) {
    return res.status(403).json({ error: 'admin_delete_forbidden' });
  }
  if (target?.role === 'admin' && countAdmins() <= 1) {
    return res.status(400).json({ error: 'last_admin' });
  }
  const removed = deleteUser(req.params.id);
  if (!removed) {
    return res.status(404).json({ error: 'user_not_found' });
  }
  res.json({ ok: true });
});

/*
==========================================================================
Counters: List + Filters
==========================================================================
*/
app.get('/api/counters', requireAuth, (req, res) => {
  /* auth + owner scope */
  const auth = authenticateRequest(req);
  let ownerId = auth?.type === 'user' ? auth.user.id : null;
  const tagOwnerId = auth?.type === 'user' ? auth.user.id : auth?.type === 'admin' ? auth.user.id : null;
  if (auth?.type === 'admin' && String(req.query.owner || '').toLowerCase() === 'me') {
    ownerId = auth.user.id;
  }

  /* filters */
  const modeFilter = normalizeModeFilter(req.query.mode);
  if (req.query.mode !== undefined && !modeFilter) {
    return res.status(400).json({ error: 'invalid_mode' });
  }
  const sort = normalizeSort(req.query.sort);
  if (req.query.sort !== undefined && !sort) {
    return res.status(400).json({ error: 'invalid_sort' });
  }
  const inactiveOnly = normalizeInactiveFilter(req.query.inactive);
  if (req.query.inactive !== undefined && inactiveOnly === null) {
    return res.status(400).json({ error: 'invalid_inactive' });
  }

  const tagFilter = normalizeTagFilter(req.query.tags, tagOwnerId);
  const searchQuery = extractSearchQuery(req.query.q ?? req.query.search);

  /* pagination */
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const pageSizeRaw = parseInt(req.query.pageSize, 10);
  const pageSize = Math.max(1, Math.min(pageSizeRaw || DEFAULT_PAGE_SIZE, 100));

  /* counts */
  const inactiveBefore = inactiveOnly ? Date.now() - INACTIVE_THRESHOLD_DAYS * DAY_MS : null;
  const totalOverall = countCounters(null, null, null, null, ownerId);
  const totalMatching =
    searchQuery || modeFilter || tagFilter.length || inactiveOnly
      ? countCounters(searchQuery, modeFilter, tagFilter, inactiveBefore, ownerId)
      : totalOverall;
  const totalPages = Math.max(1, Math.ceil(Math.max(totalMatching, 1) / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;

  /* data */
  const dayStart = getDayStart();
  const ownerLabelCache = new Map();
  const resolveOwnerLabel = (id) => {
    if (!id) return '';
    if (ownerLabelCache.has(id)) return ownerLabelCache.get(id);
    const user = getUserById(id);
    const label = user?.username || '';
    ownerLabelCache.set(id, label);
    return label;
  };

  const counters = listCountersPage(
    pageSize,
    offset,
    searchQuery,
    modeFilter,
    tagFilter,
    sort || 'newest',
    inactiveBefore,
    ownerId
  ).map((counter) => {
    const ownerKnown = isKnownOwner(counter.owner_id);
    const isAdmin = auth?.type === 'admin';
    const isOwner = Boolean(counter.owner_id && auth?.user?.id === counter.owner_id);
    const canAdminTag = isAdmin && (!counter.owner_id || !ownerKnown);
    const canEditTags = Boolean(isOwner || canAdminTag);
    const canShowTags = Boolean(
      tagOwnerId &&
        ((counter.owner_id && counter.owner_id === tagOwnerId) ||
          (isAdmin && (!counter.owner_id || !ownerKnown)))
    );
    const payload = serializeCounterWithStats(counter, dayStart, {
      includeNote: true,
      includeTags: canShowTags,
      tagOwnerId: canShowTags ? tagOwnerId : null
    });
    return {
      ...payload,
      canEditTags,
      ownerUsername: counter.owner_id ? resolveOwnerLabel(counter.owner_id) : ''
    };
  });

  /* response */
  res.json({
    counters,
    pagination: {
      page: safePage,
      pageSize,
      total: totalMatching,
      totalPages
    },
    query: searchQuery || '',
    totals: {
      overall: totalOverall
    },
    filters: {
      tags: tagFilter
    }
  });
});

/*
==========================================================================
Counters: Export/Import
==========================================================================
*/
app.get('/api/counters/export', requireAuth, (req, res) => {
  const auth = authenticateRequest(req);
  const ownerId = auth?.type === 'user' ? auth.user.id : null;
  const tagOwnerId = auth?.type === 'user' ? auth.user.id : auth?.type === 'admin' ? auth.user.id : null;
  const counters = exportCounters(ownerId)
    .map(normalizeCounterForExport)
    .filter(Boolean)
    .map((counter) => {
      const ownerKnown = isKnownOwner(counter.owner_id);
      if (tagOwnerId && counter.owner_id && counter.owner_id !== tagOwnerId && ownerKnown) {
        return { ...counter, tags: [] };
      }
      return counter;
    });
  const counterIds = counters.map((counter) => counter.id);
  const daily = ownerId ? exportDailyActivityFor(counterIds) : exportDailyActivity();
  res.json({
    counters,
    daily,
    tagCatalog: tagOwnerId ? listTagCatalog(tagOwnerId) : [],
    exportedAt: Date.now()
  });
});

app.post('/api/counters/export-selected', requireAuth, (req, res) => {
  const auth = authenticateRequest(req);
  const ownerId = auth?.type === 'user' ? auth.user.id : null;
  const tagOwnerId = auth?.type === 'user' ? auth.user.id : auth?.type === 'admin' ? auth.user.id : null;
  const ids = normalizeIdsInput(req.body?.ids);
  if (!ids.length) {
    return res.status(400).json({ error: 'ids_required' });
  }
  const counters = exportCountersByIds(ids, ownerId)
    .map(normalizeCounterForExport)
    .filter(Boolean)
    .map((counter) => {
      const ownerKnown = isKnownOwner(counter.owner_id);
      if (tagOwnerId && counter.owner_id && counter.owner_id !== tagOwnerId && ownerKnown) {
        return { ...counter, tags: [] };
      }
      return counter;
    });
  if (!counters.length) {
    return res.status(404).json({ error: 'counters_not_found' });
  }
  if (ownerId && counters.length !== ids.length) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const counterIds = counters.map((counter) => counter.id);
  const daily = exportDailyActivityFor(counterIds);
  res.json({
    counters,
    daily,
    tagCatalog: tagOwnerId ? listTagCatalog(tagOwnerId) : [],
    exportedAt: Date.now()
  });
});

app.post('/api/counters/import', requireAuth, (req, res) => {
  const auth = authenticateRequest(req);
  if (!auth) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const ownerId = getOwnerId();
  const requesterIsOwner = auth?.type === 'admin' && ownerId && auth.user.id === ownerId;
  const { replace = false } = req.body || {};
  let payload = null;
  let dailyPayload = [];
  if (Array.isArray(req.body)) {
    payload = req.body;
  } else if (req.body && Array.isArray(req.body.counters)) {
    payload = req.body.counters;
    if (Array.isArray(req.body.daily)) {
      dailyPayload = req.body.daily;
    }
  } else if (req.body && Array.isArray(req.body.tagCatalog)) {
    if (auth?.type === 'user') {
      mergeTagCatalog(req.body.tagCatalog, auth.user.id);
    } else if (auth?.type === 'admin' && requesterIsOwner) {
      mergeTagCatalog(req.body.tagCatalog, ownerId);
    }
  }
  if (!payload) {
    return res.status(400).json({ error: 'invalid_backup_format' });
  }
  try {
    if (auth.type === 'admin') {
      const imported = importCounters(payload, {
        replace: Boolean(replace),
        tagOwnerId: requesterIsOwner ? ownerId : null
      });
      let dailyImported = 0;
      if (dailyPayload.length) {
        dailyImported = importDailyActivity(dailyPayload);
        seedLastHitsFromDaily(dailyPayload);
      }
      return res.json({ ok: true, imported, dailyImported });
    }
    const userOwnerId = auth.user.id;
    const imported = importCountersForOwner(payload, { replace: Boolean(replace) }, userOwnerId);
    let dailyImported = 0;
    if (dailyPayload.length) {
      const ids = payload.map((entry) => String(entry?.id || '').trim()).filter(Boolean);
      dailyImported = importDailyActivityFor(ids, dailyPayload);
      seedLastHitsFromDaily(dailyPayload, { ids });
    }
    return res.json({ ok: true, imported, dailyImported });
  } catch (error) {
    const message = error.message || 'import_failed';
    if (message === 'counter_id_taken') {
      return res.status(409).json({ error: 'counter_id_taken' });
    }
    res.status(400).json({ error: message });
  }
});

/*
==========================================================================
Counters: Bulk Actions
==========================================================================
*/
app.post('/api/counters/bulk-delete', requireAuth, (req, res) => {
  const auth = authenticateRequest(req);
  const ids = normalizeIdsInput(req.body?.ids);
  if (!ids.length) {
    return res.status(400).json({ error: 'ids_required' });
  }
  let deleted = 0;
  ids.forEach((id) => {
    const counter = getCounter(id);
    if (!counter) {
      return;
    }
    if (!hasCounterAccess(auth, counter)) {
      return;
    }
    if (deleteCounter(id)) {
      deleted += 1;
    }
  });
  res.json({ ok: true, deleted });
});

/*
==========================================================================
Counters: Single Counter Actions
==========================================================================
*/
app.delete('/api/counters/:id', requireAuthOrKey, (req, res) => {
  const counter = getCounter(req.params.id);
  if (!counter) {
    return res.status(404).json({ error: 'counter_not_found' });
  }
  if (!hasCounterAccess(req.auth, counter)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const removed = deleteCounter(req.params.id);
  if (!removed) {
    return res.status(404).json({ error: 'counter_not_found' });
  }
  res.json({ ok: true });
});

app.post('/api/counters/:id/value', requireAuthOrKey, (req, res) => {
  const { value } = req.body || {};
  const validation = validateCounterValue(value);
  if (validation.error) {
    return res.status(400).json({ error: validation.error, message: validation.message });
  }
  const counter = getCounter(req.params.id);
  if (!counter) {
    return res.status(404).json({ error: 'counter_not_found' });
  }
  if (!hasCounterAccess(req.auth, counter)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const updated = updateCounterValue(req.params.id, validation.value);
  if (!updated) {
    return res.status(404).json({ error: 'counter_not_found' });
  }
  res.json({ ok: true });
});

app.patch('/api/counters/:id', requireAuthOrKey, (req, res) => {
  const counter = getCounter(req.params.id);
  if (!counter) {
    return res.status(404).json({ error: 'counter_not_found' });
  }
  if (!hasCounterAccess(req.auth, counter)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const auth = authenticateRequest(req);
  const isAdmin = auth?.type === 'admin';
  const ownerKnown = isKnownOwner(counter.owner_id);
  const isOwner = Boolean(counter.owner_id && auth?.user?.id === counter.owner_id);
  const canAdminTag = isAdmin && (!counter.owner_id || !ownerKnown);
  const tagOwnerId = isOwner ? counter.owner_id : canAdminTag ? auth.user.id : null;
  const canEditTags = Boolean(isOwner || canAdminTag);
  const { label, value, note, tags } = req.body || {};
  const nextLabel =
    typeof label === 'string'
      ? label.trim().slice(0, LABEL_LIMIT)
      : typeof counter.label === 'string'
      ? counter.label.trim().slice(0, LABEL_LIMIT)
      : '';
  let nextValue = counter.value;
  if (value !== undefined) {
    const validation = validateCounterValue(value);
    if (validation.error) {
      return res.status(400).json({ error: validation.error, message: validation.message });
    }
    nextValue = validation.value;
  }
  let nextNote = note;
  if (typeof nextNote === 'string') {
    nextNote = nextNote.trim().slice(0, NOTE_LIMIT);
  } else if (nextNote === undefined || nextNote === null) {
    nextNote = counter.note || '';
  } else {
    nextNote = '';
  }
  let nextTagIds = Array.isArray(counter.tags) ? [...counter.tags] : [];
  let includeTagsPatch = false;
  if (tags !== undefined && canEditTags) {
    nextTagIds = filterTagIds(Array.isArray(tags) ? tags : [], tagOwnerId);
    includeTagsPatch = true;
  }
  const stored = updateCounterMetadata(req.params.id, {
    label: nextLabel,
    value: nextValue,
    note: nextNote || null,
    tags: includeTagsPatch ? nextTagIds : undefined,
    ownerId: tagOwnerId
  });
  if (!stored) {
    return res.status(500).json({ error: 'update_failed' });
  }
  const updated = getCounter(req.params.id);
  const canShowTags = Boolean(
    tagOwnerId &&
      ((counter.owner_id && auth?.type && auth.user?.id === tagOwnerId) ||
        (isAdmin && (!counter.owner_id || !ownerKnown)))
  );
  res.json({
    counter: serializeCounterWithStats(updated, getDayStart(), {
      includeNote: true,
      includeTags: canShowTags,
      tagOwnerId: canShowTags ? tagOwnerId : null
    })
  });
});

/*
==========================================================================
Admin: Settings
==========================================================================
*/
app.get('/api/settings', requireAdmin, (req, res) => {
  res.json({ config: getConfig(), version: getVersion(), usersPageSize: DEFAULT_USERS_PAGE_SIZE });
});

app.post('/api/settings', requireAdmin, (req, res) => {
  const { privateMode, showGuides, homeTitle, brandName, allowedModes, unlimitedThrottleSeconds, theme } = req.body || {};
  const patch = {};
  if (typeof privateMode === 'boolean') patch.privateMode = privateMode;
  if (typeof showGuides === 'boolean') patch.showGuides = showGuides;
  if (typeof homeTitle === 'string') patch.homeTitle = homeTitle.trim().slice(0, 120);
  if (typeof brandName === 'string') patch.brandName = brandName.trim().slice(0, 80);
  if (Number.isFinite(Number(unlimitedThrottleSeconds))) {
    const value = Math.max(0, Math.round(Number(unlimitedThrottleSeconds)));
    patch.unlimitedThrottleSeconds = value;
  }
  if (allowedModes && typeof allowedModes === 'object') {
    const normalizedModes = normalizeAllowedModesPatch(allowedModes);
    if (!normalizedModes) {
      return res.status(400).json({ error: 'at_least_one_mode' });
    }
    patch.allowedModes = normalizedModes;
  }
  if (typeof theme === 'string') {
    patch.theme = theme.trim().toLowerCase();
  }
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'no_valid_settings' });
  }
  const updated = updateConfig(patch);
  setUnlimitedThrottle((updated.unlimitedThrottleSeconds || 0) * 1000);
  res.json({ config: updated, version: getVersion() });
});

/*
==========================================================================
Admin: Tags
==========================================================================
*/
app.get('/api/tags', requireAuth, (req, res) => {
  const auth = authenticateRequest(req);
  if (!auth || auth.type === 'key') {
    return res.status(401).json({ error: 'unauthorized' });
  }
  res.json({ tags: listTagCatalog(auth.user.id) });
});

app.post('/api/tags', requireAuth, (req, res) => {
  const auth = authenticateRequest(req);
  if (!auth || auth.type === 'key') {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const { name, color } = req.body || {};
  try {
    const tag = addTagToCatalog({ name, color, ownerId: auth.user.id });
    res.status(201).json({ tag });
  } catch (error) {
    if (error.message === 'tag_exists') {
      return res.status(409).json({ error: 'Tag already exists.' });
    }
    if (error.message === 'name_required') {
      return res.status(400).json({ error: 'Tag name required.' });
    }
    res.status(400).json({ error: error.message || 'Failed to create tag.' });
  }
});

app.patch('/api/tags/:id', requireAuth, (req, res) => {
  const auth = authenticateRequest(req);
  if (!auth || auth.type === 'key') {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const tagId = String(req.params.id || '').trim();
  if (!tagId) {
    return res.status(400).json({ error: 'tag_id_required' });
  }
  const { name, color } = req.body || {};
  try {
    const updated = updateTagInCatalog(tagId, { name, color }, auth.user.id);
    if (!updated) {
      return res.status(404).json({ error: 'tag_not_found' });
    }
    res.json({ tag: updated });
  } catch (error) {
    if (error.message === 'tag_exists') {
      return res.status(409).json({ error: 'Tag already exists.' });
    }
    if (error.message === 'name_required') {
      return res.status(400).json({ error: 'Tag name required.' });
    }
    res.status(400).json({ error: error.message || 'Failed to update tag.' });
  }
});

app.delete('/api/tags/:id', requireAuth, (req, res) => {
  const auth = authenticateRequest(req);
  if (!auth || auth.type === 'key') {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const tagId = String(req.params.id || '').trim();
  if (!tagId) {
    return res.status(400).json({ error: 'tag_id_required' });
  }
  const removed = removeTagFromCatalog(tagId, auth.user.id);
  if (!removed) {
    return res.status(404).json({ error: 'tag_not_found' });
  }
  const cleared = removeTagAssignments(tagId);
  res.json({ ok: true, removed, cleared });
});

/*
==========================================================================
Admin: API Keys
==========================================================================
*/
app.get('/api/api-keys', requireAdmin, (req, res) => {
  const keys = listApiKeys();
  res.json({ keys });
});

app.post('/api/api-keys', requireAdmin, (req, res) => {
  const { name, scope = 'global', counters } = req.body || {};
  try {
    const allowed = Array.isArray(counters)
      ? counters
      : typeof counters === 'string'
      ? counters
          .split(/[\n,]/)
          .map((value) => value.trim())
          .filter(Boolean)
      : [];
    const result = createApiKey({ name, scope, counters: allowed });
    res.status(201).json({ key: result.key, token: result.token });
  } catch (error) {
    const message = error.message === 'counters_required'
      ? 'Provide at least one counter ID for limited keys.'
      : error.message === 'name_required'
      ? 'Name is required.'
      : error.message || 'failed_to_create_key';
    res.status(400).json({ error: message });
  }
});

app.delete('/api/api-keys/:id', requireAdmin, (req, res) => {
  const removed = deleteApiKey(req.params.id);
  if (!removed) {
    return res.status(404).json({ error: 'api_key_not_found' });
  }
  res.json({ ok: true });
});

/*
==========================================================================
Admin: Cleanup
==========================================================================
*/
app.post('/api/counters/purge-inactive', requireAdmin, (req, res) => {
  const requestedDays = Number(req.body?.days);
  const safeDays = Math.max(1, Number.isFinite(requestedDays) ? Math.round(requestedDays) : INACTIVE_THRESHOLD_DAYS);
  const removed = deleteInactiveCountersOlderThan(safeDays);
  res.json({ ok: true, removed, days: safeDays });
});

/*
==========================================================================
Admin: Delete Counters
==========================================================================
*/
app.delete('/api/counters', requireAuth, (req, res) => {
  const auth = authenticateRequest(req);
  const modeFilter = normalizeModeFilter(req.query.mode);
  if (req.query.mode !== undefined && !modeFilter) {
    return res.status(400).json({ error: 'invalid_mode' });
  }
  if (auth?.type === 'user') {
    const ownerId = auth.user.id;
    if (modeFilter) {
      const deletedFiltered = deleteCountersByOwnerAndMode(ownerId, modeFilter);
      return res.json({ ok: true, deleted: deletedFiltered, mode: modeFilter });
    }
    const deletedCount = deleteCountersByOwner(ownerId);
    return res.json({ ok: true, deleted: deletedCount });
  }
  if (modeFilter) {
    const deletedFiltered = deleteCountersByMode(modeFilter);
    return res.json({ ok: true, deleted: deletedFiltered, mode: modeFilter });
  }
  const deletedCount = deleteAllCounters();
  res.json({ ok: true, deleted: deletedCount });
});

app.post('/api/counters', (req, res) => {
  /* creation is limited per IP when not in private mode */
  if (isPrivateMode()) {
    const auth = authenticateRequest(req);
    if (!auth || auth.type !== 'admin') {
      return res.status(401).json({ error: 'unauthorized' });
    }
  }

  const clientIp = getClientIp(req) || 'unknown';
  if (!isPrivateMode()) {
    const rateCheck = checkCreationRate(clientIp);
    if (!rateCheck.allowed) {
      const retrySeconds = rateCheck.retryAfterSeconds;
      const prettySeconds = retrySeconds === 1 ? '1 second' : `${retrySeconds} seconds`;
      res.set('Retry-After', String(Math.max(1, retrySeconds || 1)));
      return res.status(429).json({
        error: 'rate_limited',
        message: `Too many new counters at once. Try again in about ${prettySeconds}.`,
        retryAfterSeconds: retrySeconds,
        limit: CREATION_LIMIT_COUNT,
        windowSeconds: Math.round(CREATION_LIMIT_WINDOW_MS / 1000)
      });
    }
  }

  const runtimeConfig = getConfig();
  const defaultMode = getDefaultMode(runtimeConfig);
  const {
    label = '',
    startValue = 0,
    tags = [],
    mode
  } = req.body || {};
  const requestedModeInput = typeof mode === 'string' ? mode : defaultMode;
  const normalizedLabel = typeof label === 'string' ? label.trim().slice(0, 80) : '';
  const startValidation = validateCounterValue(startValue);
  const auth = authenticateRequest(req);
  const ownerId = auth && (auth.type === 'admin' || auth.type === 'user') ? auth.user?.id || null : null;
  const tagIds = filterTagIds(Array.isArray(tags) ? tags : [], ownerId);
  const modeResult = parseRequestedMode(requestedModeInput);
  if (modeResult.error) {
    return res.status(400).json({ error: modeResult.error });
  }
  const requestedMode = modeResult.mode;
  if (!isModeAllowed(requestedMode, runtimeConfig)) {
    return res.status(400).json({ error: 'mode_not_allowed' });
  }

  if (startValidation.error) {
    const errorPayload = { error: startValidation.error };
    if (startValidation.message) {
      errorPayload.message = startValidation.message;
    }
    return res.status(400).json(errorPayload);
  }

  const counter = createCounter({
    label: normalizedLabel,
    startValue: startValidation.value,
    mode: requestedMode,
    tags: tagIds,
    ownerId
  });
  if (!isPrivateMode()) {
    recordCreationAttempt(clientIp);
  }

  const baseUrl = getBaseUrl(req);
  const embedUrl = `${baseUrl}/embed/${counter.id}.js`;
  const embedCode = `<script async src="${embedUrl}"></script>`;
  res.status(201).json({
    counter: serializeCounter(counter, { includeNote: true, includeTags: true, tagOwnerId: ownerId }),
    embedCode,
    embedUrl
  });
});

app.get('/api/counters/:id', (req, res) => {
  const counter = getCounter(req.params.id);
  if (!counter) {
    return res.status(404).json({ error: 'counter_not_found' });
  }
  const baseUrl = getBaseUrl(req);
  const embedUrl = `${baseUrl}/embed/${counter.id}.js`;
  const embedCode = `<script async src="${embedUrl}"></script>`;
  res.json({
    counter: serializeCounterWithStats(counter, getDayStart(), { includeTags: false }),
    embedCode,
    embedUrl
  });
});

/* embed script (no-store) */
app.get('/embed/:id.js', (req, res) => {
  res.type('application/javascript');
  res.set('Cache-Control', 'no-store');

  const isPreview = isPreviewRequest(req);
  let result = null;
  if (isPreview) {
    const counter = getCounter(req.params.id);
    if (!counter) {
      return res.send(`console.warn('Counter "${req.params.id}" not found');`);
    }
    result = { counter, incremented: false };
  } else {
    result = recordHit(req.params.id, getClientIp(req));
    if (!result) {
      return res.send(`console.warn('Counter "${req.params.id}" not found');`);
    }
  }

  const { counter } = result;
  const data = {
    id: counter.id,
    value: normalizeCounterValue(counter.value),
    label: counter.label
  };

  const payload = JSON.stringify(data);
  // Embed script
  //
  // If you want to pretty-print (deminify) this code:
  // 1. Copy everything inside the template string (remove the starting const script = ` and the ending `;).
  // 2. Paste the code into a JS formatter such as:
  //    https://beautifier.io/
  //    https://prettier.io/playground
  // 3. After formatting, you can wrap it back in const script = ` ... `;
  // -------------------------------------------------------------------------------------------------------
  const script = `(function(){try{var data=${payload};var doc=document;var formatValue=function(v){var str=String(v==null?'0':v);return str.replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',');};var scriptEl=doc.currentScript;if(!scriptEl){return;}var host=scriptEl.parentElement;var wrapper; if(host&&host.classList&&host.classList.contains('counter-widget')){wrapper=host;host.innerHTML='';scriptEl.remove();}else{wrapper=doc.createElement('span');wrapper.className='counter-widget';scriptEl.replaceWith(wrapper);}wrapper.setAttribute('role','status');wrapper.setAttribute('aria-live','polite');if(data.label){var labelEl=doc.createElement('span');labelEl.className='counter-widget__label';labelEl.textContent=data.label;labelEl.setAttribute('aria-hidden','true');wrapper.appendChild(labelEl);wrapper.appendChild(doc.createTextNode(' '));}var valueEl=doc.createElement('span');valueEl.className='counter-widget__value';valueEl.textContent=formatValue(data.value);wrapper.appendChild(valueEl);}catch(err){if(console&&console.warn){console.warn('counter embed failed',err);}}})();`;
  res.send(script);
});

/*
==========================================================================
Routes: Pages
==========================================================================
*/

app.get('/', serveHtml('index.html'));
app.get('/index.html', serveHtml('index.html'));
app.get('/dashboard', serveHtml('dashboard.html'));
app.get('/about', serveHtml('about.html'));
app.get('/settings', serveHtml('settings.html'));
app.get('/profile', serveHtml('profile.html'));
app.get('/privacy', serveHtml('privacy.html'));
app.get('/terms', serveHtml('terms.html'));

/*
==========================================================================
Static Assets + 404
==========================================================================
*/
app.use(
  express.static(staticDir, {
    extensions: ['html'],
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
        if (IS_DEV) {
          res.setHeader('Cache-Control', 'no-store');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      }
    }
  })
);

/* HTML 404 fallback */
app.use((req, res, next) => {
  if (req.accepts('html')) {
    const html = loadHtmlTemplate('404.html');
    if (html) {
      res.set('Cache-Control', 'no-store');
      return res.status(404).send(html);
    }
    return res.status(404).sendFile(notFoundPage);
  }
  next();
});

/* JSON 404 fallback */
app.use((req, res) => {
  res.status(404).json({ error: 'not_found' });
});

/* error handler */
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
});

/*
==========================================================================
Boot
==========================================================================
*/
bootstrapAdminUser();

app.listen(PORT, () => {
  console.log(`Voux running at http://localhost:${PORT}`);
});

/* ========================================================================== */
/* Helpers                                                                    */
/* ========================================================================== */

/* -------------------------------------------------------------------------- */
/* Session + bootstrap                                                        */
/* -------------------------------------------------------------------------- */
function getBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/+$/, '');
  }
  const host = req.get('host');
  const protocol = req.protocol || 'http';
  return `${protocol}://${host}`;
}

function shouldUseSecureCookie(req) {
  if (req.secure) return true;
  const forwarded = req.get('x-forwarded-proto');
  if (forwarded && forwarded.includes('https')) return true;
  const base = process.env.PUBLIC_BASE_URL;
  return typeof base === 'string' && base.startsWith('https://');
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
  if (!ip) {
    return { allowed: true, retryAfterSeconds: 0 };
  }
  const entries = creationTracker.get(ip) || [];
  const recent = entries.filter((ts) => now - ts < CREATION_LIMIT_WINDOW_MS);
  creationTracker.set(ip, recent);
  if (recent.length >= CREATION_LIMIT_COUNT) {
    const oldest = recent[0];
    const retryAfterMs = CREATION_LIMIT_WINDOW_MS - (now - oldest);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000))
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

function recordCreationAttempt(ip, now = Date.now()) {
  if (!ip) return;
  const entries = creationTracker.get(ip) || [];
  const recent = entries.filter((ts) => now - ts < CREATION_LIMIT_WINDOW_MS);
  recent.push(now);
  creationTracker.set(ip, recent);
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */
function validateCounterValue(rawValue) {
  const normalizedRaw = rawValue === undefined || rawValue === null ? '0' : String(rawValue).trim();
  if (!normalizedRaw) {
    return { value: 0n };
  }
  if (!/^\d+$/.test(normalizedRaw)) {
    return { error: 'startValue must be a positive number', message: 'Starting value must be a positive number.' };
  }
  if (normalizedRaw.length > START_VALUE_DIGIT_LIMIT) {
    return {
      error: 'startValue_too_large',
      message: `Starting value cannot exceed ${START_VALUE_DIGIT_LIMIT} digits.`
    };
  }
  try {
    return { value: BigInt(normalizedRaw) };
  } catch (_) {
    return { error: 'startValue must be a positive number', message: 'Starting value must be a positive number.' };
  }
}

/* -------------------------------------------------------------------------- */
/* Query / request parsing                                                    */
/* -------------------------------------------------------------------------- */
function extractSearchQuery(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = String(raw).trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, 80);
}

function isPreviewRequest(req) {
  const previewParam = req.query.preview;
  if (previewParam === undefined) return false;
  const value = Array.isArray(previewParam) ? previewParam[0] : previewParam;
  if (value === undefined || value === null) return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function normalizeIdsInput(value, limit = 200) {
  if (!Array.isArray(value)) return [];
  const normalized = [];
  const seen = new Set();
  value.forEach((entry) => {
    const id = typeof entry === 'string' ? entry.trim() : '';
    if (id && !seen.has(id)) {
      normalized.push(id.slice(0, 64));
      seen.add(id);
    }
  });
  return normalized.slice(0, limit);
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

// Reads and caches HTML templates with version tokens applied
function loadHtmlTemplate(filename) {
  if (!IS_DEV && htmlCache.has(filename)) {
    return htmlCache.get(filename);
  }
  try {
    const filePath = path.join(staticDir, filename);
    const raw = fs.readFileSync(filePath, 'utf8');
    const compiled = injectVersion(raw);
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
  } catch (_) {
    return '0.0.0';
  }
}

// Public-facing version string for cache-busting in HTML
function getAppVersion() {
  return String(getVersion() || '0.0.0');
}

/* -------------------------------------------------------------------------- */
/* Serialization                                                              */
/* -------------------------------------------------------------------------- */
function serializeCounter(counter, options = {}) {
  if (!counter) return null;
  const { includeNote = false, includeTags = false, tagOwnerId = null } = options;
  const mode = counter.count_mode === 'unlimited' ? 'unlimited' : 'unique';
  const value = normalizeCounterValue(counter.value);
  const createdAt = toSafeNumber(counter.created_at);
  const payload = {
    id: counter.id,
    label: counter.label,
    theme: counter.theme,
    value,
    createdAt,
    cooldownMode: mode,
    cooldownLabel: describeModeLabel(mode)
  };
  if (includeNote) {
    payload.note = counter.note || '';
  }
  if (includeTags) {
    payload.tags = mapTagIdsToObjects(counter.tags, tagOwnerId);
  }
  return payload;
}

function serializeCounterWithStats(counter, dayStart, options = {}) {
  const base = serializeCounter(counter, options);
  if (!base) return base;
  const lastHit = toSafeNumber(getLastHitTimestamp(counter.id));
  const hitsToday = dayStart ? toSafeNumber(countHitsSince(counter.id, dayStart)) : 0;
  const activityTrend = formatActivityTrend(getCounterDailyTrend(counter.id, ACTIVITY_WINDOW_DAYS));
  const inactivity = buildInactiveStatus(counter, lastHit);
  return {
    ...base,
    lastHit,
    hitsToday,
    activity: activityTrend,
    inactive: inactivity
  };
}

function serializeUser(user, ownerId = null) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    displayName: user.displayName ?? user.display_name ?? '',
    avatarUrl: user.avatarUrl ?? user.avatar_url ?? '',
    isAdmin: user.role === 'admin',
    isOwner: ownerId ? user.id === ownerId : false
  };
}

/* -------------------------------------------------------------------------- */
/* Normalization                                                              */
/* -------------------------------------------------------------------------- */
function normalizeCounterValue(value) {
  if (value === undefined || value === null) {
    return '0';
  }
  if (typeof value === 'bigint') {
    return value < 0n ? '0' : value.toString();
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return '0';
    return Math.floor(value).toString();
  }
  const digits = String(value).replace(/[^\d]/g, '');
  return digits || '0';
}

function normalizeCounterForExport(counter) {
  if (!counter) return null;
  return {
    ...counter,
    value: normalizeCounterValue(counter.value),
    created_at: toSafeNumber(counter.created_at)
  };
}

function normalizeModeFilter(value) {
  if (value === undefined || value === null) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === null) return null;
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === 'unique' || normalized === 'unlimited') {
    return normalized;
  }
  return null;
}

function normalizeSort(value) {
  if (value === undefined || value === null) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === null) return null;
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === 'newest' || normalized === 'oldest' || normalized === 'views' || normalized === 'views_asc' || normalized === 'last_hit') {
    return normalized;
  }
  return null;
}

function normalizeInactiveFilter(value) {
  if (value === undefined || value === null) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === null) return null;
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes') {
    return true;
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no') {
    return false;
  }
  return null;
}

function normalizeTagFilter(value, ownerId) {
  if (value === undefined || value === null) return [];
  const entries = Array.isArray(value) ? value : [value];
  const flattened = entries
    .flatMap((entry) => String(entry || '').split(','))
    .map((part) => part.trim())
    .filter(Boolean);
  if (!flattened.length) return [];
  return filterTagIds(flattened, ownerId);
}

function normalizeAllowedModesPatch(input) {
  if (!input || typeof input !== 'object') return null;
  const normalized = {
    unique: input.unique !== false,
    unlimited: input.unlimited !== false
  };
  if (!normalized.unique && !normalized.unlimited) {
    return null;
  }
  return normalized;
}

/* -------------------------------------------------------------------------- */
/* Tags                                                                       */
/* -------------------------------------------------------------------------- */
function mapTagIdsToObjects(ids, ownerId) {
  if (!Array.isArray(ids) || !ids.length || !ownerId) return [];
  const catalog = listTagCatalog(ownerId);
  const map = new Map(catalog.map((tag) => [tag.id, tag]));
  return ids
    .map((id) => map.get(id))
    .filter(Boolean)
    .map((tag) => ({ ...tag }));
}

/* -------------------------------------------------------------------------- */
/* Activity / stats                                                           */
/* -------------------------------------------------------------------------- */
function formatActivityTrend(trend = []) {
  const chronological = Array.isArray(trend) ? trend.slice(-ACTIVITY_WINDOW_DAYS) : [];
  const total30d = chronological.reduce((sum, item) => sum + (item.hits || 0), 0);
  const recentWeek = chronological.slice(-7);
  const weekOrdered = orderWeekByLabel(recentWeek);
  const total7d = recentWeek.reduce((sum, item) => sum + (item.hits || 0), 0);
  const maxHits = weekOrdered.reduce((peak, item) => Math.max(peak, item.hits || 0), 0);
  return {
    trend: weekOrdered,
    total7d,
    total30d,
    maxHits
  };
}

function orderWeekByLabel(days = []) {
  const map = new Map();
  days.forEach((entry) => {
    const idx = getWeekdayIndex(entry.day);
    if (idx === null || idx === undefined) return;
    map.set(idx, entry);
  });
  const ordered = [];
  for (let i = 0; i < weekdayLabels.length; i += 1) {
    const found = map.get(i);
    ordered.push({
      day: found?.day || null,
      hits: found?.hits || 0,
      label: weekdayLabels[i]
    });
  }
  return ordered;
}

function getWeekdayIndex(timestamp) {
  if (timestamp === null || timestamp === undefined) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  const weekDay = date.getDay(); // 0 Sunday, 6 Saturday
  return (weekDay + 6) % 7; // convert to Monday=0
}

function buildInactiveStatus(counter, lastHit) {
  const reference = toSafeNumber(lastHit || counter.created_at || 0);
  if (!reference) {
    return {
      isInactive: true,
      days: INACTIVE_THRESHOLD_DAYS,
      label: `Inactive ${INACTIVE_THRESHOLD_DAYS}d`,
      thresholdDays: INACTIVE_THRESHOLD_DAYS
    };
  }
  const elapsedMs = Date.now() - reference;
  const days = Math.max(0, Math.floor(elapsedMs / DAY_MS));
  const isInactive = elapsedMs >= INACTIVE_THRESHOLD_DAYS * DAY_MS;
  return {
    isInactive,
    days,
    label: isInactive ? `Inactive ${INACTIVE_THRESHOLD_DAYS}d` : '',
    thresholdDays: INACTIVE_THRESHOLD_DAYS
  };
}

/* -------------------------------------------------------------------------- */
/* Time / misc                                                                */
/* -------------------------------------------------------------------------- */
function getDayStart() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

function toSafeNumber(value) {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function getOwnerId() {
  const owner = getOwnerUser();
  return owner?.id || null;
}

function isKnownOwner(ownerId) {
  if (!ownerId) return false;
  return Boolean(getUserById(ownerId));
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
