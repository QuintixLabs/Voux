const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

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
  unlimitedThrottleSeconds: sanitizeThrottle(process.env.UNLIMITED_THROTTLE_SECONDS)
};

let config = loadConfig();

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

module.exports = {
  getConfig,
  updateConfig
};

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
