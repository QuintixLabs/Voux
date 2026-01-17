/*
  footer.js

  Injects footer markup and sets year, version, branding text.
*/

async function injectFooter() {
  const roots = document.querySelectorAll('[data-footer-root]');
  if (!roots.length) return;

  try {
    const [footerMarkup, config, session] = await Promise.all([
      fetch('/footer.html').then((res) => {
        if (!res.ok) throw new Error('footer_load_failed');
        return res.text();
      }),
      fetch('/api/config')
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
      fetch('/api/session', { credentials: 'include', cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null)
    ]);

    roots.forEach((root) => {
      root.innerHTML = footerMarkup;
      hydrateFooter(root, config, session?.user || null);
    });
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.warn('Footer failed to load', error);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Footer render                                                              */
/* -------------------------------------------------------------------------- */
function hydrateFooter(root, config, user) {
  const yearEl = root.querySelector('[data-footer-year]');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }
  const versionEl = root.querySelector('[data-footer-version]');
  if (versionEl) {
    const version = config?.version;
    versionEl.textContent = version ? `Powered by Voux • v${version}` : 'Powered by Voux • v?.?.?';
  }
  const updateEl = root.querySelector('[data-footer-update]');
  if (updateEl) {
    updateEl.classList.add('hidden');
  }
  const brandName = (config?.brandName || 'Voux').trim() || 'Voux';
  const brandHeading = root.querySelector('[data-brand-name]');
  if (brandHeading) {
    brandHeading.textContent = `About ${brandName}`;
  }
  const brandDesc = root.querySelector('[data-brand-description]');
  if (brandDesc) {
    brandDesc.textContent = `${brandName} is a free and open source counter for blogs and websites. You can host it yourself or use an instance run by someone else.`;
  }
  if (user?.isAdmin) {
    checkForUpdates(updateEl, config?.version);
  }
}

/* -------------------------------------------------------------------------- */
/* Update checks                                                              */
/* -------------------------------------------------------------------------- */
function normalizeVersionLabel(version) {
  if (!version) return '';
  return String(version).startsWith('v') ? String(version) : `v${version}`;
}

function compareVersions(a, b) {
  const strip = (value) => String(value || '').replace(/^v/i, '');
  const partsA = strip(a).split('.').map((part) => parseInt(part, 10) || 0);
  const partsB = strip(b).split('.').map((part) => parseInt(part, 10) || 0);
  const maxLen = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < maxLen; i += 1) {
    const left = partsA[i] || 0;
    const right = partsB[i] || 0;
    if (left > right) return 1;
    if (left < right) return -1;
  }
  return 0;
}

async function checkForUpdates(updateEl, currentVersion) {
  if (!updateEl || !currentVersion) return;
  try {
    const res = await fetch('https://api.github.com/repos/QuintixLabs/voux/releases/latest');
    if (!res.ok) return;
    const data = await res.json().catch(() => ({}));
    const latest = data?.tag_name || data?.name || '';
    if (!latest) return;
    if (compareVersions(latest, currentVersion) > 0) {
      const label = `New version available · ${normalizeVersionLabel(latest)}`;
      updateEl.dataset.tooltip = label;
      updateEl.dataset.updateUrl = 'https://github.com/QuintixLabs/voux/releases/latest';
      updateEl.classList.remove('hidden');
      setupUpdateTooltip(updateEl);
    }
  } catch (_) {}
}

function setupUpdateTooltip(updateEl) {
  if (!updateEl || updateEl.dataset.updateReady) return;
  updateEl.dataset.updateReady = 'true';

  const trigger = updateEl.querySelector('.footer__update');
  let tooltip = updateEl.querySelector('.footer__update-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('a');
    tooltip.className = 'footer__update-tooltip';
    updateEl.appendChild(tooltip);
  }
  tooltip.href = updateEl.dataset.updateUrl || 'https://github.com/QuintixLabs/voux/releases/latest';
  tooltip.target = '_blank';
  tooltip.rel = 'noopener';
  tooltip.textContent = updateEl.dataset.tooltip || 'New version available';

  trigger?.addEventListener('click', (event) => {
    event.stopPropagation();
    updateEl.classList.toggle('is-open');
  });

  document.addEventListener('click', () => {
    updateEl.classList.remove('is-open');
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectFooter);
} else {
  injectFooter();
}
