/*
  public/js/home/features/embed.js

  Embed mode toggles and live counter preview rendering.
*/

/* -------------------------------------------------------------------------- */
/* Embed manager                                                              */
/* -------------------------------------------------------------------------- */
function createHomeEmbedManager(deps) {
  const {
    embedToggles,
    embedPanels,
    embedDescs,
    previewTarget
  } = deps;

  let embedMode = 'script';

  function setEmbedMode(mode) {
    const target = mode === 'svg' ? 'svg' : 'script';
    embedMode = target;
    embedToggles.forEach((toggle) => {
      toggle.classList.toggle('is-active', toggle.dataset.embed === target);
    });
    embedPanels.forEach((panel) => {
      panel.classList.toggle('hidden', panel.dataset.embedPanel !== target);
    });
    embedDescs.forEach((desc) => {
      desc.classList.toggle('hidden', desc.dataset.embedDesc !== target);
    });
  }

  function getEmbedMode() {
    return embedMode;
  }

  function bindEmbedToggleEvents() {
    embedToggles.forEach((toggle) => {
      toggle.addEventListener('click', () => setEmbedMode(toggle.dataset.embed || 'script'));
    });
  }

  function renderPreview(embedUrl) {
    if (!previewTarget) return;
    previewTarget.innerHTML = '';
    const wrapper = document.createElement('span');
    wrapper.className = 'counter-widget counter-widget--preview';
    const script = document.createElement('script');
    script.async = true;
    script.src = appendPreviewParam(embedUrl);
    wrapper.appendChild(script);
    previewTarget.appendChild(wrapper);
  }

  function appendPreviewParam(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      parsed.searchParams.set('preview', '1');
      return parsed.toString();
    } catch {
      return url.includes('?') ? `${url}&preview=1` : `${url}?preview=1`;
    }
  }

  return {
    setEmbedMode,
    getEmbedMode,
    bindEmbedToggleEvents,
    renderPreview
  };
}

export { createHomeEmbedManager };
