/*
  state.js

  Shared config/session cache to avoid duplicate fetches on page load.
*/

(function () {
  const CONFIG_TTL_MS = 5 * 60 * 1000;
  const SESSION_TTL_MS = 30 * 1000;
  const CONFIG_KEY = 'voux_config_cache';

  let configCache = null;
  let configCacheTs = 0;
  let configInFlight = null;

  let sessionCache = null;
  let sessionCacheTs = 0;
  let sessionInFlight = null;

  function loadStoredConfig() {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      if (!parsed.ts || !parsed.data) return null;
      if (Date.now() - parsed.ts > CONFIG_TTL_MS) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function storeConfig(data) {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify({ ts: Date.now(), data }));
    } catch {}
  }

  function clearConfig() {
    configCache = null;
    configCacheTs = 0;
    try {
      localStorage.removeItem(CONFIG_KEY);
    } catch {}
  }

  function setConfig(data) {
    if (!data) return;
    configCache = data;
    configCacheTs = Date.now();
    storeConfig(data);
  }

  async function fetchConfig(force = false) {
    if (!force && configCache && Date.now() - configCacheTs < CONFIG_TTL_MS) {
      return configCache;
    }
    if (configInFlight) return configInFlight;
    const fallback = !force ? loadStoredConfig() : null;
    configInFlight = fetch('/api/config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        configInFlight = null;
        if (data) {
          configCache = data;
          configCacheTs = Date.now();
          storeConfig(data);
        }
        return data;
      })
      .catch(() => {
        configInFlight = null;
        if (fallback) {
          configCache = fallback.data;
          configCacheTs = fallback.ts;
          return configCache;
        }
        return null;
      });
    return configInFlight;
  }

  async function fetchSession(force = false) {
    if (!force && sessionCache && Date.now() - sessionCacheTs < SESSION_TTL_MS) {
      return sessionCache;
    }
    if (sessionInFlight) return sessionInFlight;
    sessionInFlight = fetch('/api/session', { credentials: 'include', cache: 'no-store' })
      .then((res) => {
        if (!res.ok) {
          if (res.status === 401) {
            return { unauthorized: true };
          }
          return null;
        }
        return res.json().catch(() => null);
      })
      .then((data) => {
        sessionInFlight = null;
        sessionCache = data;
        sessionCacheTs = Date.now();
        return data;
      })
      .catch(() => {
        sessionInFlight = null;
        return null;
      });
    return sessionInFlight;
  }

  function clearSession() {
    sessionCache = null;
    sessionCacheTs = 0;
  }

  window.VouxState = {
    getConfig: (opts = {}) => fetchConfig(Boolean(opts.force)),
    getSession: (opts = {}) => fetchSession(Boolean(opts.force)),
    clearSession,
    clearConfig,
    setConfig
  };
})();
