/*
  theme.js

  Shared theme helper to apply allowed presets across pages.
*/

(function () {
  const THEMES = [
    'default',
    'neutral',
    'graphite',
    'ocean',
    'blush',
    'forest',
    'ember',
    'crimson',
  ];

  function sanitize(theme) {
    const key = String(theme || '').trim().toLowerCase();
    if (!key) return 'default';
    return THEMES.includes(key) ? key : 'default';
  }

  function apply(theme) {
    const safe = sanitize(theme);
    document.documentElement.setAttribute('data-theme', safe);
    try {
      localStorage.setItem('voux_theme', safe);
    } catch {}
    return safe;
  }

  window.VouxTheme = {
    THEMES,
    apply
  };
})();
