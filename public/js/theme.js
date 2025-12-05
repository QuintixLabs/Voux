/*
  theme.js

  Shared theme helper to apply allowed presets across pages.
*/

(function () {
  const THEMES = [
    'default',
    'neutral',
    'ocean',
    'forest',
    'ember',
    'blush',
    'crimson'
  ];

  function sanitize(theme) {
    const key = String(theme || '').trim().toLowerCase();
    if (!key) return 'default';
    return THEMES.includes(key) ? key : 'default';
  }

  function apply(theme) {
    const safe = sanitize(theme);
    document.body.setAttribute('data-theme', safe);
    return safe;
  }

  window.VouxTheme = {
    THEMES,
    apply
  };
})();
