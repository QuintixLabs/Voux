async function injectFooter() {
  const roots = document.querySelectorAll('[data-footer-root]');
  if (!roots.length) return;

  try {
    const [footerMarkup, config] = await Promise.all([
      fetch('/footer.html').then((res) => {
        if (!res.ok) throw new Error('footer_load_failed');
        return res.text();
      }),
      fetch('/api/config')
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null)
    ]);

    roots.forEach((root) => {
      root.innerHTML = footerMarkup;
      hydrateFooter(root, config);
    });
  } catch (error) {
    console.warn('Footer failed to load', error);
  }
}

function hydrateFooter(root, config) {
  const yearEl = root.querySelector('[data-footer-year]');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }
  const versionEl = root.querySelector('[data-footer-version]');
if (versionEl) {
  const version = config?.version;
  versionEl.textContent = version
    ? `Version: v${version}`
    : 'Version: v?.?.?';
}

}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectFooter);
} else {
  injectFooter();
}
