/*
  public/js/dashboard/core/render.js

  Counter render/refresh orchestration and embed preview helpers.
*/

/* -------------------------------------------------------------------------- */
/* Render manager                                                             */
/* -------------------------------------------------------------------------- */
function createDashboardRender(deps) {
  const {
    state,
    RANGE_LABELS,
    authFetch,
    assertAuthorizedResponse,
    showToast,
    adminPreview,
    adminPreviewTarget,
    getCounterDataOps
  } = deps;

  function getRangeStatLabel() {
    return RANGE_LABELS[state.activityRange] || RANGE_LABELS['7d'];
  }

  function getRangeStatValue(counter) {
    if (!counter) return 0;
    switch (state.activityRange) {
      case 'today':
        return counter.hitsToday ?? 0;
      case '30d':
        return counter.activity?.total30d ?? counter.activity?.total7d ?? counter.hitsToday ?? 0;
      case '7d':
      default:
        return counter.activity?.total7d ?? counter.hitsToday ?? 0;
    }
  }

  async function refreshCounters(page = 1, options = {}) {
    const { silent = false } = options;
    if (!state.user) throw new Error('Not authenticated.');
    const { fetchCounters, applyCounterResponse } = getCounterDataOps();
    try {
      const data = await fetchCounters(page);
      const counters = data.counters || [];
      applyCounterResponse(data, counters, { silent });
      if (!silent) {
        scheduleAutoRefresh();
      }
    } catch (error) {
      if (silent) {
        if (error?.code !== 'unauthorized') {
          console.warn('Auto refresh failed', error);
        }
        return;
      }
      throw error;
    }
  }

  function renderAdminPreview(embedUrl) {
    if (!adminPreview || !adminPreviewTarget) return;
    adminPreviewTarget.innerHTML = '';
    const wrapper = document.createElement('span');
    wrapper.className = 'counter-widget counter-widget--preview';
    const script = document.createElement('script');
    script.async = true;
    script.src = appendPreviewParam(embedUrl);
    wrapper.appendChild(script);
    adminPreviewTarget.appendChild(wrapper);
    adminPreview.classList.remove('hidden');
  }

  async function updateCounterMetadataRequest(id, payload) {
    const res = await authFetch(`/api/counters/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    await assertAuthorizedResponse(res);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update counter');
    }
    return res.json().catch(() => ({}));
  }

  async function copyEmbedSnippet(counterId, button, format = 'script') {
    const origin = window.location.origin.replace(/\/+$/, '');
    const snippet =
      format === 'svg'
        ? `<img src="${origin}/embed/${counterId}.svg" alt="Voux counter">`
        : `<script async src="${origin}/embed/${counterId}.js"></script>`;
    try {
      await navigator.clipboard.writeText(snippet);
      if (button) {
        if (button._copyTimeout) {
          clearTimeout(button._copyTimeout);
          button._copyTimeout = null;
        }
        const original = button.dataset.originalIcon || button.innerHTML;
        button.dataset.originalIcon = original;
        button.classList.add('copied');
        button.innerHTML = '<i class="ri-check-line"></i>';
        button._copyTimeout = setTimeout(() => {
          button.classList.remove('copied');
          button.innerHTML = button.dataset.originalIcon || original;
          button._copyTimeout = null;
        }, 1400);
      }
      showToast(format === 'svg' ? 'Copied SVG embed.' : 'Copied script embed.');
    } catch {
      window.alert('Unable to copy snippet');
    }
  }

  function scheduleAutoRefresh(delay = 5000) {
    cancelAutoRefresh();
    state.autoRefreshTimer = setTimeout(async () => {
      if (!state.user) return;
      if (document.visibilityState !== 'visible') {
        scheduleAutoRefresh(delay);
        return;
      }
      if (state.editPanelsOpen > 0) {
        scheduleAutoRefresh(delay);
        return;
      }
      try {
        await refreshCounters(state.page, { silent: true });
      } catch {
        // refreshCounters handles logging
      }
      scheduleAutoRefresh(delay);
    }, delay);
  }

  function cancelAutoRefresh() {
    if (state.autoRefreshTimer) {
      clearTimeout(state.autoRefreshTimer);
      state.autoRefreshTimer = null;
    }
  }

  function changeEditPanelCount(delta) {
    state.editPanelsOpen = Math.max(0, state.editPanelsOpen + delta);
  }

  function applyAllowedModesToSelect(selectEl, allowed) {
    if (!selectEl) return;
    const options = Array.from(selectEl.options);
    let firstAllowed = null;
    const label = state.throttleSeconds > 0
      ? `Every visit (${state.throttleSeconds}s)`
      : 'Every visit';
    options.forEach((option) => {
      const mode = option.value === 'unlimited' ? 'unlimited' : 'unique';
      const isAllowed = isModeAllowed(mode, allowed);
      option.disabled = !isAllowed;
      option.hidden = !isAllowed;
      if (mode === 'unlimited') {
        option.textContent = label;
      }
      if (isAllowed && !firstAllowed) {
        firstAllowed = mode;
      }
    });
    if (!firstAllowed) {
      firstAllowed = 'unique';
    }
    const current = selectEl.value === 'unlimited' ? 'unlimited' : 'unique';
    if (!isModeAllowed(current, allowed)) {
      selectEl.value = firstAllowed;
    }
  }

  function getFirstAllowedMode(allowed) {
    if (allowed?.unique !== false) return 'unique';
    return 'unlimited';
  }

  function normalizeAllowedModes(raw) {
    if (!raw || typeof raw !== 'object') {
      return { unique: true, unlimited: true };
    }
    return {
      unique: raw.unique !== false,
      unlimited: raw.unlimited !== false
    };
  }

  function isModeAllowed(mode, allowed) {
    if (mode === 'unlimited') {
      return allowed?.unlimited !== false;
    }
    return allowed?.unique !== false;
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
    getRangeStatLabel,
    getRangeStatValue,
    refreshCounters,
    renderAdminPreview,
    updateCounterMetadataRequest,
    copyEmbedSnippet,
    scheduleAutoRefresh,
    cancelAutoRefresh,
    changeEditPanelCount,
    applyAllowedModesToSelect,
    getFirstAllowedMode,
    normalizeAllowedModes,
    isModeAllowed
  };
}

export { createDashboardRender };
