/*
  public/js/settings/features/apiKeys.js

  API key list/create/delete logic for settings.
*/

/* -------------------------------------------------------------------------- */
/* API key manager                                                            */
/* -------------------------------------------------------------------------- */
function createApiKeysManager(deps) {
  const {
    // API key state
    apiKeyPager,

    // API key UI
    apiKeysCard,
    apiKeysList,
    apiKeySearchInput,
    apiKeyFilterSelect,
    apiKeyCreateOpen,
    apiKeyForm,
    apiKeyNameInput,
    apiKeyScopeSelect,
    apiKeyCountersField,
    apiKeyCountersInput,
    apiKeyCountersError,
    apiKeyStatusLabel,
    apiKeysPagination,
    apiKeysPrevBtn,
    apiKeysNextBtn,
    apiKeysPageInfo,
    apiKeysCountLabel,
    apiKeyModal,
    apiKeyCancel,

    // Requests + auth
    authFetch,
    assertSession,

    // Feedback
    showToast,
    showAlert,
    normalizeAuthMessage,
    modalConfirm,

    // Session state
    getActiveUser,

    // Formatting
    formatTimestamp,
    escapeHtml
  } = deps;

  let apiKeyCountersErrorHideTimer = null;

  function canCreateGlobalKey() {
    const activeUser = getActiveUser?.();
    if (!activeUser?.isAdmin) return false;
    if (activeUser?.isOwner) return true;
    return activeUser?.adminPermissions?.danger === true;
  }

  function formatApiKeysPageInfo(page, totalPages) {
    const isSmallScreen = window.matchMedia('(max-width: 620px)').matches;
    return isSmallScreen
      ? `${page} / ${totalPages}`
      : `Page ${page} / ${totalPages}`;
  }

  /* -------------------------------------------------------------------------- */
  /* Key list rendering                                                         */
  /* -------------------------------------------------------------------------- */

  function getFilteredApiKeys() {
    const query = (apiKeySearchInput?.value || '').trim().toLowerCase();
    let filtered = apiKeyPager.list || [];

    if (apiKeyFilterSelect?.value === 'global') {
      filtered = filtered.filter((key) => key.scope !== 'limited');
    }

    if (apiKeyFilterSelect?.value === 'limited') {
      filtered = filtered.filter((key) => key.scope === 'limited');
    }

    if (apiKeyFilterSelect?.value === 'unused') {
      filtered = filtered.filter((key) => !key.lastUsedAt);
    }

    if (apiKeyFilterSelect?.value === 'recent') {
      filtered = filtered.filter((key) => Boolean(key.lastUsedAt));
    }

    if (!query) {
      return filtered;
    }

    return filtered.filter((key) => {
      const haystack = [
        key.name || '',
        key.id || '',
        key.scope || '',
        ...(Array.isArray(key.allowedCounters) ? key.allowedCounters : [])
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }

  function setApiKeyCountersError(message) {
    if (!apiKeyCountersError) return;
    const isHidden = apiKeyCountersError.classList.contains('is-hidden');
    const prev = apiKeyCountersError.dataset.errorText || '';
    const nextHidden = !message;
    if (apiKeyCountersErrorHideTimer) {
      window.clearTimeout(apiKeyCountersErrorHideTimer);
      apiKeyCountersErrorHideTimer = null;
    }
    if (nextHidden) {
      if (!isHidden) {
        apiKeyCountersError.classList.add('is-hidden');
        apiKeyCountersError.dataset.errorText = '';
        apiKeyCountersErrorHideTimer = window.setTimeout(() => {
          if (apiKeyCountersError.classList.contains('is-hidden')) {
            apiKeyCountersError.textContent = '';
          }
          apiKeyCountersErrorHideTimer = null;
        }, 160);
      }
      return;
    }
    if (!isHidden && prev === message) {
      return;
    }
    apiKeyCountersError.dataset.errorText = message;
    if (apiKeyCountersError.textContent !== message) {
      apiKeyCountersError.textContent = message;
    }
    if (isHidden) {
      apiKeyCountersError.classList.remove('is-hidden');
    }
  }

  async function loadApiKeys(silent = false) {
    if (!apiKeysList) return;
    try {
      if (!silent) {
        apiKeysList.innerHTML = '<p class="hint">Loading keys...</p>';
      }
      const res = await authFetch('/api/api-keys');
      if (!res.ok) throw new Error('Failed to load API keys');
      const data = await res.json();
      apiKeyPager.list = Array.isArray(data.keys) ? data.keys : [];
      apiKeyPager.page = 1;
      renderApiKeys();
      setApiKeyStatus('');
    } catch (error) {
      apiKeysList.innerHTML =
        '<p class="hint error">Unable to load API keys.</p>';
      setApiKeyStatus('');
      console.warn(error);
    }
  }

  function renderApiKeys() {
    if (!apiKeysList) return;
    const keys = getFilteredApiKeys();
    const query = (apiKeySearchInput?.value || '').trim();
    const totalPages = Math.max(
      1,
      Math.ceil(keys.length / apiKeyPager.pageSize)
    );
    apiKeyPager.page = Math.min(Math.max(1, apiKeyPager.page), totalPages);
    const start = (apiKeyPager.page - 1) * apiKeyPager.pageSize;
    const visible = keys.slice(start, start + apiKeyPager.pageSize);

    apiKeysList.innerHTML = '';
    if (!visible.length) {
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = query
        ? `No API keys found for "${query}".`
        : 'No API keys yet.';
      apiKeysList.appendChild(hint);
    }

    visible.forEach((key) => {
      const row = document.createElement('div');
      row.className = 'api-key-row';
      const meta = document.createElement('div');
      meta.className = 'api-key-meta';
      const scopeLabel =
        key.scope === 'limited'
          ? `Limited · ${key.allowedCounters?.length || 0} counters`
          : 'Full access';

      const scope = document.createElement('small');
      scope.className = 'api-key-meta__scope';
      scope.dataset.scope = key.scope === 'limited' ? 'limited' : 'global';
      scope.textContent = scopeLabel;
      const detail = document.createElement('small');
      const allowedText =
        key.scope === 'limited' && key.allowedCounters?.length
          ? `Allowed: ${key.allowedCounters.join(', ')}`
          : '';

      const timeline = document.createElement('small');
      timeline.className = 'api-key-meta__timeline';
      timeline.textContent = `Created ${formatTimestamp(key.createdAt, { includeYear: true })} · Last used ${formatTimestamp(key.lastUsedAt, { includeYear: true })}`;
      meta.innerHTML = `<strong>${escapeHtml(key.name || key.id)}</strong>`;
      meta.appendChild(scope);

      if (allowedText) {
        detail.className = 'api-key-meta__allowed';
        const allowedIcon = document.createElement('i');
        allowedIcon.className = 'icon';
        allowedIcon.setAttribute('aria-hidden', 'true');
        allowedIcon.style.setProperty(
          '--icon',
          "url('/assets/icons/ui/shield-check.svg')"
        );
        detail.append(allowedIcon, ' ', allowedText);
        meta.appendChild(detail);
      }
      
      const timelineIcon = document.createElement('i');
      timelineIcon.className = 'icon api-key-meta__timeline-icon';
      timelineIcon.setAttribute('aria-hidden', 'true');
      timelineIcon.style.setProperty(
        '--icon',
        "url('/assets/icons/ui/calendar.svg')"
      );

      timeline.prepend(timelineIcon, ' ');
      meta.appendChild(timeline);
      const actions = document.createElement('div');
      actions.className = 'api-key-actions';
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'danger ghost';
      deleteBtn.innerHTML = `<i class="icon" style="--icon:url('/assets/icons/ui/delete.svg')" aria-hidden="true"></i>`;
      deleteBtn.addEventListener('click', () =>
        handleApiKeyDelete({
          id: key.id,
          name: key.name || '',
          createdAt: key.createdAt || ''
        })
      );
      actions.appendChild(deleteBtn);
      row.append(meta, actions);
      apiKeysList.appendChild(row);
    });

    if (
      keys.length > apiKeyPager.pageSize &&
      apiKeysPagination &&
      apiKeysPrevBtn &&
      apiKeysNextBtn &&
      apiKeysPageInfo
    ) {
      apiKeysPagination.classList.remove('hidden');
      apiKeysPrevBtn.disabled = apiKeyPager.page <= 1;
      apiKeysNextBtn.disabled = apiKeyPager.page >= totalPages;
      apiKeysPageInfo.textContent = formatApiKeysPageInfo(
        apiKeyPager.page,
        totalPages
      );
    } else if (apiKeysPagination) {
      apiKeysPagination.classList.add('hidden');
    }

    if (apiKeysCountLabel) {
      const total = apiKeyPager.list.length;
      apiKeysCountLabel.textContent = `${total} key${total === 1 ? '' : 's'}`;
    }
  }

  /* -------------------------------------------------------------------------- */
  /* Key create/delete                                                          */
  /* -------------------------------------------------------------------------- */
  function openApiKeyModal() {
    if (!apiKeyModal) return;
    apiKeyForm?.reset();
    updateApiKeyScopeState();
    setApiKeyStatus('');
    setApiKeyCountersError('');
    apiKeyModal.classList.add('modal-overlay--open');
    apiKeyModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    apiKeyNameInput?.focus();
  }

  function closeApiKeyModal() {
    if (!apiKeyModal) return;
    apiKeyModal.classList.remove('modal-overlay--open');
    apiKeyModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  async function handleApiKeyCreate(event) {
    event.preventDefault();
    if (!apiKeyNameInput || !apiKeyScopeSelect) return;
    const name = apiKeyNameInput.value.trim();
    const scope = apiKeyScopeSelect.value === 'limited' ? 'limited' : 'global';
    const previousScope = apiKeyScopeSelect.value;
    let allowed = [];
    if (scope === 'limited' && apiKeyCountersInput) {
      allowed = apiKeyCountersInput.value
        .split(/[\n,]/)
        .map((value) => value.trim())
        .filter(Boolean);
    }
    setApiKeyCountersError('');
    if (scope === 'limited' && allowed.length === 0) {
      setApiKeyCountersError(
        'Provide at least one counter ID for limited keys.'
      );
      apiKeyCountersInput?.focus();
      return;
    }
    try {
      setApiKeyStatus('');
      const res = await authFetch('/api/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name, scope, counters: allowed })
      });
      await assertSession(res);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create key');
      }
      const payload = await res.json();
      setApiKeyStatus('');
      closeApiKeyModal();
      apiKeyForm?.reset();
      if (apiKeyScopeSelect) {
        apiKeyScopeSelect.value = previousScope;
      }
      updateApiKeyScopeState();
      if (payload.token) {
        await showAlert('', {
          title: 'API key created'
          ,
          messageParts: [
            'Copy your new API key now:',
            { br: true },
            { strong: payload.token }
          ]
        });
      }
      loadApiKeys(true);
    } catch (error) {
      setApiKeyStatus('');
      if (error.message === 'missing_counters') {
        setApiKeyCountersError(
          'Provide at least one counter ID for limited keys.'
        );
        apiKeyCountersInput?.focus();
        return;
      }
      await showAlert(normalizeAuthMessage(error, 'Failed to create API key'));
    }
  }

  function formatKeyIdSuffix(id) {
    const raw = String(id || '');
    if (!raw) return 'unknown';
    return raw.length <= 8 ? raw : `...${raw.slice(-8)}`;
  }

  async function handleApiKeyDelete(key = {}) {
    const id = key.id;
    if (!id) return;
    const name = String(key.name || '').trim() || '(unnamed key)';
    const idSuffix = formatKeyIdSuffix(id);
    const created = formatTimestamp(key.createdAt);
    const confirmed = await modalConfirm({
      title: 'Delete API key?',
      message: `This key will immediately stop working.<hr><strong>Key name:</strong> ${escapeHtml(name)}<br><strong>Key reference:</strong> ${escapeHtml(idSuffix)}<br><strong>Created:</strong> ${escapeHtml(created)}`,
      allowHtml: true,
      confirmLabel: 'Delete key',
      variant: 'danger'
    });
    if (!confirmed) return;
    try {
      const res = await authFetch(`/api/api-keys/${id}`, {
        method: 'DELETE'
      });
      await assertSession(res);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete API key');
      }
      showToast('API key deleted');
      loadApiKeys(true);
    } catch (error) {
      await showAlert(normalizeAuthMessage(error, 'Failed to delete API key'));
    }
  }

  /* -------------------------------------------------------------------------- */
  /* Form state                                                                 */
  /* -------------------------------------------------------------------------- */
  function updateApiKeyScopeState() {
    if (!apiKeyScopeSelect || !apiKeyCountersField) return;
    const globalOption = apiKeyScopeSelect.querySelector(
      'option[value="global"]'
    );
    const allowGlobal = canCreateGlobalKey();
    if (globalOption) {
      globalOption.disabled = !allowGlobal;
      globalOption.hidden = !allowGlobal;
    }
    if (!allowGlobal && apiKeyScopeSelect.value !== 'limited') {
      apiKeyScopeSelect.value = 'limited';
    }
    apiKeyCountersField.classList.toggle(
      'hidden',
      apiKeyScopeSelect.value !== 'limited'
    );
    if (apiKeyScopeSelect.value !== 'limited') {
      setApiKeyCountersError('');
    }
  }

  function setApiKeyStatus(message) {
    if (apiKeyStatusLabel) {
      apiKeyStatusLabel.textContent = message || '';
    }
  }

  function changeApiKeyPage(delta) {
    apiKeyPager.page += delta;
    renderApiKeys();
  }

  /* -------------------------------------------------------------------------- */
  /* Event wiring                                                               */
  /* -------------------------------------------------------------------------- */
  function setup() {
    if (!apiKeysCard) return;
    loadApiKeys();
    apiKeyCreateOpen?.addEventListener('click', openApiKeyModal);
    apiKeySearchInput?.addEventListener('input', () => {
      apiKeyPager.page = 1;
      renderApiKeys();
    });
    apiKeyFilterSelect?.addEventListener('change', () => {
      apiKeyPager.page = 1;
      renderApiKeys();
    });
    apiKeyForm?.addEventListener('submit', (event) =>
      handleApiKeyCreate(event)
    );
    apiKeyCancel?.addEventListener('click', closeApiKeyModal);
    apiKeyModal?.addEventListener('click', (event) => {
      if (event.target === apiKeyModal) closeApiKeyModal();
    });
    apiKeyScopeSelect?.addEventListener('change', updateApiKeyScopeState);
    apiKeyCountersInput?.addEventListener('input', () =>
      setApiKeyCountersError('')
    );
    apiKeysPrevBtn?.addEventListener('click', () => changeApiKeyPage(-1));
    apiKeysNextBtn?.addEventListener('click', () => changeApiKeyPage(1));
    updateApiKeyScopeState();
  }

  return {
    // Lifecycle
    setup,

    // API key data
    loadApiKeys,
    renderApiKeys
  };
}

export { createApiKeysManager };
