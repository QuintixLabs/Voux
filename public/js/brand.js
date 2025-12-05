/*
  brand.js

  Fetches config and applies brand name/title text to the page.
*/

(() => {
  const themeHelper = window.VouxTheme;
  if (!window.fetch) return;
  fetch('/api/config')
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (!data) return;
      window.__VOUX_CONFIG = data;
      applyBranding(data);
      themeHelper?.apply(data.theme);
    })
    .catch(() => {
      /* ignore */
    });

  function applyBranding(config) {
    const brand = (config.brandName || 'Voux').trim() || 'Voux';
    document.querySelectorAll('[data-brand-text]').forEach((el) => {
      const suffix = el.getAttribute('data-brand-page');
      el.textContent = suffix ? `${brand} · ${suffix}` : brand;
    });
    document.querySelectorAll('[data-brand-name]').forEach((el) => {
      el.textContent = `About ${brand}`;
    });
    document.querySelectorAll('[data-brand-inline]').forEach((el) => {
      el.textContent = brand;
    });

    const pageTitleNode = document.querySelector('title[data-page-title]');
    if (pageTitleNode) {
      const suffix = pageTitleNode.getAttribute('data-page-title') || '';
      document.title = suffix ? `${brand} · ${suffix}` : brand;
    }

    const bodyPage = document.body?.dataset?.page;
    if (bodyPage === 'home') {
      applyHomeMeta(config, brand);
    }
  }

  function applyHomeMeta(config, fallbackBrand) {
    const customTitle = (config.homeTitle || '').trim();
    if (customTitle) {
      document.title = customTitle;
    } else {
      document.title = fallbackBrand;
    }
  }

})();
