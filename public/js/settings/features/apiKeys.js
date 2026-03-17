/*
  settings/features/apiKeys.js

  API key list/create/delete logic for settings.
*/

/* -------------------------------------------------------------------------- */
/* API key manager                                                            */
/* -------------------------------------------------------------------------- */
function createApiKeysManager(deps) {
  const {
    apiKeyPager,
    apiKeysCard,
    apiKeysList,
    apiKeyForm,
    apiKeyNameInput,
    apiKeyScopeSelect,
    apiKeyCountersField,
    apiKeyCountersInput,
    apiKeyStatusLabel,
    apiKeysPagination,
    apiKeysPrevBtn,
    apiKeysNextBtn,
    apiKeysPageInfo,
    authFetch,
    assertSession,
    showToast,
    showAlert,
    normalizeAuthMessage,
    modalConfirm,
    formatTimestamp,
    escapeHtml
  } = deps;

/* -------------------------------------------------------------------------- */
/* Key list rendering                                                         */
/* -------------------------------------------------------------------------- */
async function loadApiKeys() {
    if (!apiKeysList) return;
    try {
      apiKeysList.innerHTML = '<p class="hint">Loading keys...</p>';
      const res = await authFetch('/api/api-keys');
      if (!res.ok) throw new Error('Failed to load API keys');
      const data = await res.json();
      apiKeyPager.list = Array.isArray(data.keys) ? data.keys : [];
      apiKeyPager.page = 1;
      renderApiKeys();
      setApiKeyStatus('');
    } catch (error) {
      apiKeysList.innerHTML = '<p class="hint error">Unable to load API keys.</p>';
      setApiKeyStatus('');
      console.warn(error);
    }
  }

  function renderApiKeys() {
    if (!apiKeysList) return;
    const keys = apiKeyPager.list || [];
    const totalPages = Math.max(1, Math.ceil(keys.length / apiKeyPager.pageSize));
    apiKeyPager.page = Math.min(Math.max(1, apiKeyPager.page), totalPages);
    const start = (apiKeyPager.page - 1) * apiKeyPager.pageSize;
    const visible = keys.slice(start, start + apiKeyPager.pageSize);

    apiKeysList.innerHTML = '';
    if (!visible.length) {
      apiKeysList.innerHTML = '';
    }
    visible.forEach((key) => {
      const row = document.createElement('div');
      row.className = 'api-key-row';
      const meta = document.createElement('div');
      meta.className = 'api-key-meta';
      const scopeLabel = key.scope === 'limited'
        ? `Limited · ${key.allowedCounters?.length || 0} counters`
        : 'Full access';
      const detail = document.createElement('small');
      const allowedText = key.scope === 'limited' && key.allowedCounters?.length
        ? `Allowed: ${key.allowedCounters.join(', ')}`
        : '';
      const timeline = document.createElement('small');
      timeline.textContent = `Created ${formatTimestamp(key.createdAt)} · Last used ${formatTimestamp(key.lastUsedAt)}`;
      meta.innerHTML = `<strong>${escapeHtml(key.name || key.id)}</strong><small>${scopeLabel}</small>`;
      if (allowedText) {
        detail.textContent = allowedText;
        meta.appendChild(detail);
      }
      meta.appendChild(timeline);
      const actions = document.createElement('div');
      actions.className = 'api-key-actions';
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'danger ghost';
      deleteBtn.innerHTML = '<i class="ri-delete-bin-line"></i>';
      deleteBtn.addEventListener('click', () => handleApiKeyDelete({
        id: key.id,
        name: key.name || '',
        createdAt: key.createdAt || ''
      }));
      actions.appendChild(deleteBtn);
      row.append(meta, actions);
      apiKeysList.appendChild(row);
    });

    if (keys.length > apiKeyPager.pageSize && apiKeysPagination && apiKeysPrevBtn && apiKeysNextBtn && apiKeysPageInfo) {
      apiKeysPagination.classList.remove('hidden');
      apiKeysPrevBtn.disabled = apiKeyPager.page <= 1;
      apiKeysNextBtn.disabled = apiKeyPager.page >= totalPages;
      apiKeysPageInfo.textContent = `Page ${apiKeyPager.page} / ${totalPages}`;
    } else if (apiKeysPagination) {
      apiKeysPagination.classList.add('hidden');
    }
  }

/* -------------------------------------------------------------------------- */
/* Key create/delete                                                          */
/* -------------------------------------------------------------------------- */
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
      showToast('API key generated');
      if (payload.token) {
        await showAlert(`Copy your new API key now:\n${payload.token}`, { title: 'API key created' });
      }
      apiKeyForm?.reset();
      if (apiKeyScopeSelect) {
        apiKeyScopeSelect.value = previousScope;
      }
      updateApiKeyScopeState();
      loadApiKeys();
    } catch (error) {
      setApiKeyStatus('');
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
      loadApiKeys();
    } catch (error) {
      await showAlert(normalizeAuthMessage(error, 'Failed to delete API key'));
    }
  }

/* -------------------------------------------------------------------------- */
/* Form state                                                                 */
/* -------------------------------------------------------------------------- */
function updateApiKeyScopeState() {
    if (!apiKeyScopeSelect || !apiKeyCountersField) return;
    apiKeyCountersField.classList.toggle('hidden', apiKeyScopeSelect.value !== 'limited');
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
    apiKeyForm?.addEventListener('submit', (event) => handleApiKeyCreate(event));
    apiKeyScopeSelect?.addEventListener('change', updateApiKeyScopeState);
    apiKeysPrevBtn?.addEventListener('click', () => changeApiKeyPage(-1));
    apiKeysNextBtn?.addEventListener('click', () => changeApiKeyPage(1));
    updateApiKeyScopeState();
  }

  return {
    setup,
    loadApiKeys,
    renderApiKeys
  };
}

export {
  createApiKeysManager
};
