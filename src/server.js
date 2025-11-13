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
  countCounters,
  parseRequestedCooldown,
  describeCooldownLabel,
  getLastHitTimestamp,
  countHitsSince,
  exportCounters,
  importCounters
} = require('./db');
const { getConfig, updateConfig } = require('./configStore');
const requireAdmin = require('./middleware/requireAdmin');
const { verifyAdmin } = require('./middleware/requireAdmin');

const PORT = process.env.PORT || 8787;
const DEFAULT_PAGE_SIZE = Number(process.env.ADMIN_PAGE_SIZE) || 20;

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
  res.json({
    ...runtimeConfig,
    version: getVersion(),
    adminPageSize: DEFAULT_PAGE_SIZE,
    defaultMode: 'unique',
    defaultCooldownLabel: describeCooldownLabel('unique')
  });
});

app.get('/api/counters', requireAdmin, (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const pageSizeRaw = parseInt(req.query.pageSize, 10);
  const pageSize = Math.max(1, Math.min(pageSizeRaw || DEFAULT_PAGE_SIZE, 100));
  const searchQuery = extractSearchQuery(req.query.q ?? req.query.search);
  const totalOverall = countCounters();
  const totalMatching = searchQuery ? countCounters(searchQuery) : totalOverall;
  const totalPages = Math.max(1, Math.ceil(Math.max(totalMatching, 1) / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;
  const dayStart = getDayStart();
  const counters = listCountersPage(pageSize, offset, searchQuery).map((counter) =>
    serializeCounterWithStats(counter, dayStart)
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
  res.json({ counters, exportedAt: Date.now() });
});

app.post('/api/counters/import', requireAdmin, (req, res) => {
  const { replace = false, counters } = req.body || {};
  const payload = Array.isArray(counters)
    ? counters
    : Array.isArray(req.body)
    ? req.body
    : null;
  if (!payload) {
    return res.status(400).json({ error: 'invalid_backup_format' });
  }
  try {
    const imported = importCounters(payload, { replace: Boolean(replace) });
    res.json({ ok: true, imported });
  } catch (error) {
    res.status(400).json({ error: error.message || 'import_failed' });
  }
});

app.delete('/api/counters/:id', requireAdmin, (req, res) => {
  const removed = deleteCounter(req.params.id);
  if (!removed) {
    return res.status(404).json({ error: 'counter_not_found' });
  }
  res.json({ ok: true });
});

app.get('/api/settings', requireAdmin, (req, res) => {
  res.json({ config: getConfig(), version: getVersion() });
});

app.post('/api/settings', requireAdmin, (req, res) => {
  const { privateMode, showGuides, homeTitle } = req.body || {};
  const patch = {};
  if (typeof privateMode === 'boolean') patch.privateMode = privateMode;
  if (typeof showGuides === 'boolean') patch.showGuides = showGuides;
  if (typeof homeTitle === 'string') patch.homeTitle = homeTitle.trim().slice(0, 80);
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'no_valid_settings' });
  }
  const updated = updateConfig(patch);
  res.json({ config: updated, version: getVersion() });
});

app.delete('/api/counters', requireAdmin, (req, res) => {
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

  const { label = '', startValue = 0, ipCooldownHours } = req.body || {};
  const normalizedLabel = typeof label === 'string' ? label.trim().slice(0, 80) : '';
  const parsedStart = Number(startValue);
  const cooldownResult = parseRequestedCooldown(ipCooldownHours);

  if (!Number.isFinite(parsedStart) || parsedStart < 0) {
    return res.status(400).json({ error: 'startValue must be a positive number' });
  }
  if (cooldownResult.error) {
    return res.status(400).json({ error: cooldownResult.error });
  }

  const counter = createCounter({
    label: normalizedLabel,
    startValue: Math.floor(parsedStart),
    ipCooldownHours: cooldownResult.value
  });

  const baseUrl = getBaseUrl(req);
  const embedUrl = `${baseUrl}/embed/${counter.id}.js`;
  const embedCode = `<script async src="${embedUrl}"></script>`;
  res.status(201).json({
    counter: serializeCounter(counter),
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

function serializeCounter(counter) {
  if (!counter) return null;
  const mode = counter.ip_cooldown_hours === 0 ? 'unlimited' : 'unique';
  return {
    id: counter.id,
    label: counter.label,
    theme: counter.theme,
    value: counter.value,
    createdAt: counter.created_at,
    cooldownMode: mode,
    cooldownLabel: describeCooldownLabel(mode)
  };
}

function serializeCounterWithStats(counter, dayStart) {
  const base = serializeCounter(counter);
  if (!base) return base;
  const lastHit = getLastHitTimestamp(counter.id);
  const hitsToday = dayStart ? countHitsSince(counter.id, dayStart) : 0;
  return {
    ...base,
    lastHit,
    hitsToday
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
