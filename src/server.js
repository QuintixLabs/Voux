require('dotenv').config();
const express = require('express');
const path = require('path');
const {
  createCounter,
  listCounters,
  listCountersPage,
  getCounter,
  recordHit,
  deleteCounter,
  deleteAllCounters,
  deleteCountersByMode,
  deleteInactiveCountersOlderThan,
  countCounters,
  parseRequestedMode,
  describeModeLabel,
  getLastHitTimestamp,
  countHitsSince,
  getCounterDailyTrend,
  exportDailyActivity,
  importDailyActivity,
  createApiKey,
  listApiKeys,
  deleteApiKey,
  setUnlimitedThrottle,
  exportCounters,
  importCounters,
  updateCounterValue,
  updateCounterMetadata
} = require('./db');
const { getConfig, updateConfig } = require('./configStore');
const requireAdmin = require('./middleware/requireAdmin');
const {
  verifyAdmin,
  requireAdminOrKey,
  hasCounterAccess
} = require('./middleware/requireAdmin');

const PORT = process.env.PORT || 8787;
const DEFAULT_PAGE_SIZE = Number(process.env.ADMIN_PAGE_SIZE) || 5;
const CREATION_LIMIT_COUNT = Math.max(
  1,
  Number.isFinite(Number(process.env.COUNTER_CREATE_LIMIT))
    ? Number(process.env.COUNTER_CREATE_LIMIT)
    : 5 // 5 counters
);
const CREATION_LIMIT_WINDOW_MS = Math.max(
  1000,
  Number.isFinite(Number(process.env.COUNTER_CREATE_WINDOW_MS))
    ? Number(process.env.COUNTER_CREATE_WINDOW_MS)
    : 60 * 1000 // 1 min
);

const creationTracker = new Map();
const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVITY_WINDOW_DAYS = 30;
const INACTIVE_THRESHOLD_DAYS = Math.max(
  1,
  Number.isFinite(Number(process.env.INACTIVE_DAYS_THRESHOLD))
    ? Number(process.env.INACTIVE_DAYS_THRESHOLD)
    : 14
);
const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LABEL_LIMIT = 80;
const NOTE_LIMIT = 200;
setUnlimitedThrottle((getConfig().unlimitedThrottleSeconds || 0) * 1000);

const app = express();
app.set('trust proxy', true);
app.use(express.json());

const staticDir = path.join(__dirname, '..', 'public');
const notFoundPage = path.join(staticDir, '404.html');

app.get('/api/health', (req, res) => {
  res.json({ ok: true, timestamp: Date.now() });
});

app.get('/api/config', (req, res) => {
  const runtimeConfig = getConfig();
  const defaultMode = getDefaultMode(runtimeConfig);
  res.json({
    ...runtimeConfig,
    version: getVersion(),
    adminPageSize: DEFAULT_PAGE_SIZE,
    defaultMode,
    defaultCooldownLabel: describeModeLabel(defaultMode)
  });
});

app.get('/api/counters', requireAdmin, (req, res) => {
  const modeFilter = normalizeModeFilter(req.query.mode);
  if (req.query.mode !== undefined && !modeFilter) {
    return res.status(400).json({ error: 'invalid_mode' });
  }
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const pageSizeRaw = parseInt(req.query.pageSize, 10);
  const pageSize = Math.max(1, Math.min(pageSizeRaw || DEFAULT_PAGE_SIZE, 100));
  const searchQuery = extractSearchQuery(req.query.q ?? req.query.search);
  const totalOverall = countCounters();
  const totalMatching = searchQuery || modeFilter ? countCounters(searchQuery, modeFilter) : totalOverall;
  const totalPages = Math.max(1, Math.ceil(Math.max(totalMatching, 1) / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;
  const dayStart = getDayStart();
  const counters = listCountersPage(pageSize, offset, searchQuery, modeFilter).map((counter) =>
    serializeCounterWithStats(counter, dayStart, { includeNote: true })
  );

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
    }
  });
});

app.get('/api/counters/export', requireAdmin, (req, res) => {
  const counters = exportCounters();
  const daily = exportDailyActivity();
  res.json({ counters, daily, exportedAt: Date.now() });
});

app.post('/api/counters/import', requireAdmin, (req, res) => {
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
  }
  if (!payload) {
    return res.status(400).json({ error: 'invalid_backup_format' });
  }
  try {
    const imported = importCounters(payload, { replace: Boolean(replace) });
    let dailyImported = 0;
    if (dailyPayload.length) {
      dailyImported = importDailyActivity(dailyPayload);
    }
    res.json({ ok: true, imported, dailyImported });
  } catch (error) {
    res.status(400).json({ error: error.message || 'import_failed' });
  }
});

app.delete('/api/counters/:id', requireAdminOrKey, (req, res) => {
  if (!hasCounterAccess(req.auth, req.params.id)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const removed = deleteCounter(req.params.id);
  if (!removed) {
    return res.status(404).json({ error: 'counter_not_found' });
  }
  res.json({ ok: true });
});

app.post('/api/counters/:id/value', requireAdminOrKey, (req, res) => {
  const { value } = req.body || {};
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return res.status(400).json({ error: 'invalid_value' });
  }
  if (!hasCounterAccess(req.auth, req.params.id)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const updated = updateCounterValue(req.params.id, Math.floor(parsed));
  if (!updated) {
    return res.status(404).json({ error: 'counter_not_found' });
  }
  res.json({ ok: true });
});

app.patch('/api/counters/:id', requireAdminOrKey, (req, res) => {
  const counter = getCounter(req.params.id);
  if (!counter) {
    return res.status(404).json({ error: 'counter_not_found' });
  }
  if (!hasCounterAccess(req.auth, counter.id)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const { label, value, note } = req.body || {};
  const nextLabel =
    typeof label === 'string'
      ? label.trim().slice(0, LABEL_LIMIT)
      : typeof counter.label === 'string'
      ? counter.label.trim().slice(0, LABEL_LIMIT)
      : '';
  let nextValue = value !== undefined ? Number(value) : counter.value;
  if (!Number.isFinite(nextValue) || nextValue < 0) {
    return res.status(400).json({ error: 'invalid_value' });
  }
  nextValue = Math.floor(nextValue);
  let nextNote = note;
  if (typeof nextNote === 'string') {
    nextNote = nextNote.trim().slice(0, NOTE_LIMIT);
  } else if (nextNote === undefined || nextNote === null) {
    nextNote = counter.note || '';
  } else {
    nextNote = '';
  }
  const stored = updateCounterMetadata(req.params.id, {
    label: nextLabel,
    value: nextValue,
    note: nextNote || null
  });
  if (!stored) {
    return res.status(500).json({ error: 'update_failed' });
  }
  const updated = getCounter(req.params.id);
  res.json({ counter: serializeCounterWithStats(updated, getDayStart(), { includeNote: true }) });
});

app.get('/api/settings', requireAdmin, (req, res) => {
  res.json({ config: getConfig(), version: getVersion() });
});

app.post('/api/settings', requireAdmin, (req, res) => {
  const { privateMode, showGuides, homeTitle, brandName, allowedModes, unlimitedThrottleSeconds } = req.body || {};
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
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'no_valid_settings' });
  }
  const updated = updateConfig(patch);
  setUnlimitedThrottle((updated.unlimitedThrottleSeconds || 0) * 1000);
  res.json({ config: updated, version: getVersion() });
});

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

app.post('/api/counters/purge-inactive', requireAdmin, (req, res) => {
  const requestedDays = Number(req.body?.days);
  const safeDays = Math.max(1, Number.isFinite(requestedDays) ? Math.round(requestedDays) : INACTIVE_THRESHOLD_DAYS);
  const removed = deleteInactiveCountersOlderThan(safeDays);
  res.json({ ok: true, removed, days: safeDays });
});

app.delete('/api/counters', requireAdmin, (req, res) => {
  const modeFilter = normalizeModeFilter(req.query.mode);
  if (req.query.mode !== undefined && !modeFilter) {
    return res.status(400).json({ error: 'invalid_mode' });
  }
  if (modeFilter) {
    const deletedFiltered = deleteCountersByMode(modeFilter);
    return res.json({ ok: true, deleted: deletedFiltered, mode: modeFilter });
  }
  const deletedCount = deleteAllCounters();
  res.json({ ok: true, deleted: deletedCount });
});

app.post('/api/counters', (req, res) => {
  if (isPrivateMode()) {
    if (!process.env.ADMIN_TOKEN) {
      return res.status(403).json({ error: 'admin_token_not_configured' });
    }
    if (!verifyAdmin(req)) {
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
    mode
  } = req.body || {};
  const requestedModeInput = typeof mode === 'string' ? mode : defaultMode;
  const normalizedLabel = typeof label === 'string' ? label.trim().slice(0, 80) : '';
  const parsedStart = Number(startValue);
  const modeResult = parseRequestedMode(requestedModeInput);
  if (modeResult.error) {
    return res.status(400).json({ error: modeResult.error });
  }
  const requestedMode = modeResult.mode;
  if (!isModeAllowed(requestedMode, runtimeConfig)) {
    return res.status(400).json({ error: 'mode_not_allowed' });
  }

  if (!Number.isFinite(parsedStart) || parsedStart < 0) {
    return res.status(400).json({ error: 'startValue must be a positive number' });
  }

  const counter = createCounter({
    label: normalizedLabel,
    startValue: Math.floor(parsedStart),
    mode: requestedMode
  });
  if (!isPrivateMode()) {
    recordCreationAttempt(clientIp);
  }

  const baseUrl = getBaseUrl(req);
  const embedUrl = `${baseUrl}/embed/${counter.id}.js`;
  const embedCode = `<script async src="${embedUrl}"></script>`;
  res.status(201).json({
    counter: serializeCounter(counter, { includeNote: true }),
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
    counter: serializeCounterWithStats(counter, getDayStart()),
    embedCode,
    embedUrl
  });
});

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
    value: counter.value,
    label: counter.label
  };

  const payload = JSON.stringify(data);
  const script = `(function(){try{var data=${payload};var doc=document;var scriptEl=doc.currentScript;if(!scriptEl){return;}var host=scriptEl.parentElement;var wrapper; if(host&&host.classList&&host.classList.contains('counter-widget')){wrapper=host;host.innerHTML='';scriptEl.remove();}else{wrapper=doc.createElement('span');wrapper.className='counter-widget';scriptEl.replaceWith(wrapper);}wrapper.setAttribute('role','status');wrapper.setAttribute('aria-live','polite');if(data.label){var labelEl=doc.createElement('span');labelEl.className='counter-widget__label';labelEl.textContent=data.label;labelEl.setAttribute('aria-hidden','true');wrapper.appendChild(labelEl);wrapper.appendChild(doc.createTextNode(' '));}var valueEl=doc.createElement('span');valueEl.className='counter-widget__value';valueEl.textContent=String(data.value);wrapper.appendChild(valueEl);}catch(err){if(console&&console.warn){console.warn('counter embed failed',err);}}})();`;
  res.send(script);
});

app.use(express.static(staticDir, { extensions: ['html'] }));

app.use((req, res, next) => {
  if (req.accepts('html')) {
    return res.status(404).sendFile(notFoundPage);
  }
  next();
});

app.use((req, res) => {
  res.status(404).json({ error: 'not_found' });
});

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
});

app.listen(PORT, () => {
  console.log(`Counter service listening on http://localhost:${PORT}`);
});

function getBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/+$/, '');
  }
  const host = req.get('host');
  const protocol = req.protocol || 'http';
  return `${protocol}://${host}`;
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const forwardedIp = Array.isArray(forwarded)
    ? forwarded[0]
    : typeof forwarded === 'string'
    ? forwarded.split(',')[0]
    : null;
  return (
    req.headers['cf-connecting-ip'] ||
    (forwardedIp ? forwardedIp.trim() : null) ||
    req.socket?.remoteAddress ||
    null
  );
}

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

function getVersion() {
  try {
    const pkg = require('../package.json');
    return pkg.version || '0.0.0';
  } catch (_) {
    return '0.0.0';
  }
}

function serializeCounter(counter, options = {}) {
  if (!counter) return null;
  const { includeNote = false } = options;
  const mode = counter.count_mode === 'unlimited' ? 'unlimited' : 'unique';
  const payload = {
    id: counter.id,
    label: counter.label,
    theme: counter.theme,
    value: counter.value,
    createdAt: counter.created_at,
    cooldownMode: mode,
    cooldownLabel: describeModeLabel(mode)
  };
  if (includeNote) {
    payload.note = counter.note || '';
  }
  return payload;
}

function serializeCounterWithStats(counter, dayStart, options = {}) {
  const base = serializeCounter(counter, options);
  if (!base) return base;
  const lastHit = getLastHitTimestamp(counter.id);
  const hitsToday = dayStart ? countHitsSince(counter.id, dayStart) : 0;
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

function isPrivateMode() {
  return Boolean(getConfig().privateMode);
}

function getDayStart() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
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
  const reference = lastHit || counter.created_at || 0;
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
    label: isInactive ? `Inactive ${Math.max(1, days)}d` : '',
    thresholdDays: INACTIVE_THRESHOLD_DAYS
  };
}
