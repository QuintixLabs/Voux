const loginCard = document.querySelector('#loginCard');
const dashboardCard = document.querySelector('#dashboardCard');
const adminForm = document.querySelector('#admin-form');
const adminTokenInput = document.querySelector('#adminToken');
const loginError = document.querySelector('#loginError');
const dashboardSubtitle = document.querySelector('#dashboardSubtitle');
const adminControls = document.querySelector('#adminControls');
const counterListEl = document.querySelector('#counterList');
const deleteAllBtn = document.querySelector('#deleteAll');
const deleteFilteredBtn = document.querySelector('#deleteFiltered');
const paginationEl = document.querySelector('#adminPagination');
const prevPageBtn = document.querySelector('#prevPage');
const nextPageBtn = document.querySelector('#nextPage');
const paginationInfo = document.querySelector('#paginationInfo');
const counterTotalValue = document.querySelector('#counterTotalValue');
const counterSearchInput = document.querySelector('#counterSearchInput');
const counterSearchClear = document.querySelector('#counterSearchClear');
const createForm = document.querySelector('#create-admin-form');
const createLabelInput = document.querySelector('#adminLabel');
const createStartInput = document.querySelector('#adminStartValue');
const adminEmbedSnippet = document.querySelector('#adminEmbedSnippet');
const createCard = document.querySelector('#createCard');
const adminCooldownSelect = document.querySelector('#adminCooldownSelect');
const modeFilterSelect = document.querySelector('#modeFilter');
let toastContainer = document.querySelector('.toast-stack');
if (!toastContainer) {
  toastContainer = document.createElement('div');
  toastContainer.className = 'toast-stack';
  document.body.appendChild(toastContainer);
}

const STORAGE_KEY = 'vouxAdminAuth';
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12h

const state = {
  token: '',
  page: 1,
  totalPages: 1,
  total: 0,
  totalOverall: 0,
  searchQuery: '',
  pageSize: 5,
  privateMode: false,
  loadingLogin: false,
  allowedModes: { unique: true, unlimited: true },
  modeFilter: 'all',
  autoRefreshTimer: null,
  editPanelsOpen: 0
};

let searchDebounce = null;

function modalApi() {
  return window.VouxModal;
}

async function showAlert(message, options) {
  if (modalApi()?.alert) {
    await modalApi().alert(message, options);
  } else {
    window.alert(message);
  }
}

async function showConfirm(options) {
  if (modalApi()?.confirm) {
    return modalApi().confirm(options);
  }
  return window.confirm(options?.message || 'Are you sure?');
}

function showToast(message, variant = 'success') {
  if (!toastContainer) return;
  const toast = document.createElement('div');
  toast.className = `toast toast--${variant}`;
  toast.innerHTML = `<i class="${variant === 'success' ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'}"></i>
    <span>${message}</span>`;
  toastContainer.appendChild(toast);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('toast--visible'));
  });
  setTimeout(() => {
    toast.classList.remove('toast--visible');
    setTimeout(() => toast.remove(), 250);
  }, 2200);
}
window.showToast = showToast;

init();

function init() {
  if (deleteAllBtn) deleteAllBtn.disabled = true;
  adminForm?.addEventListener('submit', onLoginSubmit);
  prevPageBtn?.addEventListener('click', () => {
    if (state.page > 1) {
      refreshCounters(state.page - 1);
    }
  });
  nextPageBtn?.addEventListener('click', () => {
    if (state.page < state.totalPages) {
      refreshCounters(state.page + 1);
    }
  });
  deleteAllBtn?.addEventListener('click', handleDeleteAll);
  deleteFilteredBtn?.addEventListener('click', handleDeleteFiltered);
  createForm?.addEventListener('submit', handleCreateCounter);
  modeFilterSelect?.addEventListener('change', handleModeFilterChange);
  adminCooldownSelect?.addEventListener('change', refreshAdminModeControls);
  counterSearchInput?.addEventListener('input', handleSearchInput);
  counterSearchInput?.addEventListener('search', handleSearchInput);
  counterSearchClear?.addEventListener('click', handleSearchClear);
  toggleSearchClear();
  // no extra change handler needed for simple dropdown
  fetchConfig()
    .then(() => {
      const stored = loadStoredToken();
      if (stored) {
        state.token = stored;
        setTokenStoredState(true);
        attemptLogin(true);
      }
    })
    .catch((err) => console.warn('Admin init failed', err));
  updateDeleteFilteredState();
}

async function fetchConfig() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) return;
    const data = await res.json();
    if (!data) return;
    if (data.adminPageSize) {
      state.pageSize = Number(data.adminPageSize) || state.pageSize;
    }
    state.privateMode = Boolean(data.privateMode);
    state.allowedModes = normalizeAllowedModes(data.allowedModes);
    if (dashboardSubtitle) {
      dashboardSubtitle.textContent = state.privateMode
        ? 'Private instance'
        : 'Public instance';
    }
    updateCreateCardVisibility();
    refreshAdminModeControls();
    updateDeleteFilteredState();
  } catch (error) {
    console.warn('Failed to fetch config', error);
  }
}

function handleSearchInput() {
  if (!counterSearchInput) return;
  toggleSearchClear();
  const value = counterSearchInput.value.trim().slice(0, 80);
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    if (value === state.searchQuery) return;
    state.searchQuery = value;
    if (state.token) {
      refreshCounters(1);
    }
  }, 250);
}

function handleSearchClear() {
  if (!counterSearchInput) return;
  counterSearchInput.value = '';
  toggleSearchClear();
  if (!state.searchQuery) return;
  state.searchQuery = '';
  if (state.token) {
    refreshCounters(1);
  }
}

function handleModeFilterChange() {
  if (!modeFilterSelect) return;
  state.modeFilter = modeFilterSelect.value;
  updateDeleteFilteredState();
  if (state.token) {
    refreshCounters(1);
  }
}

function toggleSearchClear() {
  if (!counterSearchClear || !counterSearchInput) return;
  counterSearchClear.classList.toggle('hidden', counterSearchInput.value.trim().length === 0);
}

async function onLoginSubmit(event) {
  event.preventDefault();
  hideLoginError();
  const token = adminTokenInput?.value.trim();
  if (!token && !state.token) {
    showLoginError('Enter your admin token.');
    return;
  }
  if (token) {
    state.token = token;
  }
  await attemptLogin(false);
}

async function attemptLogin(fromStored) {
  if (!state.token) {
    showLoginError('Admin token missing.');
    return;
  }
  setLoginLoading(true);
  try {
    await refreshCounters(1);
    if (!fromStored) {
      storeToken(state.token);
      setTokenStoredState(true);
    }
    adminTokenInput.value = '';
    showDashboard();
  } catch (error) {
    handleAuthFailure(error);
  } finally {
    setLoginLoading(false);
  }
}

function handleAuthFailure(error) {
  clearStoredToken();
  state.token = '';
  hideDashboard();
  showLoginError(error?.message || 'Invalid admin token.');
}

async function refreshCounters(page = 1, options = {}) {
  const { silent = false } = options;
  if (!state.token) throw new Error('Admin token missing.');
  try {
    const data = await fetchCounters(page);
    renderCounterList(data.counters || []);
    state.page = data.pagination?.page || 1;
    state.totalPages = data.pagination?.totalPages || 1;
    state.total = data.pagination?.total || (data.counters?.length ?? 0);
    state.totalOverall = data.totals?.overall ?? state.totalOverall ?? state.total;
    updatePagination();
    updateCounterTotal();
    deleteAllBtn.disabled = false;
    adminControls?.classList.remove('hidden');
    if (!silent) {
      scheduleAutoRefresh();
    }
  } catch (error) {
    if (silent) {
      console.warn('Auto refresh failed', error);
      return;
    }
    throw error;
  }
}

async function fetchCounters(page) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(state.pageSize)
  });
  if (state.searchQuery) {
    params.append('q', state.searchQuery);
  }
  if (state.modeFilter && state.modeFilter !== 'all') {
    params.append('mode', state.modeFilter);
  }
  const url = `/api/counters?${params.toString()}`;
  const res = await fetch(url, {
    headers: authHeaders()
  });
  if (res.status === 401) {
    throw new Error('Invalid admin token.');
  }
  if (!res.ok) {
    throw new Error('Failed to load counters');
  }
  return res.json();
}

async function handleDeleteAll() {
  if (!state.token) {
    await showAlert('Log in first.');
    return;
  }
  const confirmed = await showConfirm({
    title: 'Delete all counters?',
    message: 'This action removes every counter permanently. This cannot be undone.',
    confirmLabel: 'Delete all',
    variant: 'danger',
    cancelLabel: 'Cancel'
  });
  if (!confirmed) return;
  try {
    deleteAllBtn.disabled = true;
    const res = await fetch('/api/counters', {
      method: 'DELETE',
      headers: authHeaders()
    });
    if (res.status === 401) throw new Error('Invalid admin token.');
    if (!res.ok) throw new Error('Failed to delete counters');
    const payload = await res.json().catch(() => ({}));
    await refreshCounters(1);
    showToast(`Deleted ${payload.deleted ?? 'all'} counters`);
  } catch (error) {
    await showAlert(error.message || 'Failed to delete counters');
  } finally {
    deleteAllBtn.disabled = false;
  }
}

async function handleCreateCounter(event) {
  event.preventDefault();
  if (!state.token) {
    await showAlert('Log in first.');
    return;
  }
  const payload = {
    label: createLabelInput?.value?.trim() || '',
    startValue: Number(createStartInput?.value || 0)
  };
  try {
    payload.mode = getCooldownPayload(adminCooldownSelect);
  } catch (error) {
    await showAlert(error.message || 'Invalid counting mode');
    return;
  }
  try {
    const res = await fetch('/api/counters', {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (res.status === 401) throw new Error('Invalid admin token.');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create counter');
    }
    const data = await res.json();
    if (adminEmbedSnippet) {
      adminEmbedSnippet.value = data.embedCode;
      adminEmbedSnippet.classList.remove('hidden');
    }
    if (createLabelInput) createLabelInput.value = '';
    if (createStartInput) createStartInput.value = '0';
    await refreshCounters(state.page);
  } catch (error) {
    await showAlert(error.message || 'Failed to create counter');
  }
}

function renderCounterList(counters) {
  if (!counterListEl) return;
  state.editPanelsOpen = 0;
  counterListEl.innerHTML = '';
  if (!counters.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = state.searchQuery
      ? `No counters match "${truncateQuery(state.searchQuery)}".`
      : 'No counters yet.';
    counterListEl.appendChild(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  counters.forEach((counter) => {
    const row = document.createElement('div');
    row.className = 'counter-row';

    const meta = document.createElement('div');
    meta.className = 'counter-meta';

    const label = document.createElement('div');
    label.className = 'counter-meta__label';
    label.textContent = counter.label || '';

    const id = document.createElement('div');
    id.className = 'counter-meta__id';
    const idValue = document.createElement('span');
    idValue.textContent = counter.id;
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'counter-copy-button';
    copyBtn.innerHTML = '<i class="ri-file-copy-line"></i>';
    copyBtn.title = 'Copy embed snippet';
    copyBtn.addEventListener('click', () => copyEmbedSnippet(counter.id, copyBtn));
    id.append(idValue, copyBtn);

    const value = document.createElement('div');
    value.className = 'counter-meta__value';
    value.innerHTML = `Value <span class="badge">${formatNumber(counter.value)}</span>`;

    const mode = document.createElement('div');
    mode.className = 'counter-meta__mode';
    const labelText = counter.cooldownLabel || 'Unique visitors';
    mode.textContent = `Mode: ${labelText}`;

    const stats = document.createElement('div');
    stats.className = 'counter-meta__stats';

    const todayStat = document.createElement('span');
    todayStat.className = 'counter-meta__stat';
    todayStat.innerHTML = `<span class="counter-meta__stat-label">Today</span><span class="counter-meta__stat-value">${formatNumber(
      counter.hitsToday ?? 0
    )}</span>`;

    const lastHitStat = document.createElement('span');
    lastHitStat.className = 'counter-meta__stat';
    lastHitStat.innerHTML = `<span class="counter-meta__stat-label">Last hit</span><span class="counter-meta__stat-value">${formatLastHit(
      counter.lastHit
    )}</span>`;

    stats.append(todayStat, lastHitStat);

    const actions = document.createElement('div');
    actions.className = 'counter-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'ghost setvalue';
    editBtn.innerHTML = '<i class="ri-edit-line"></i> Edit';

    const editPanel = document.createElement('div');
    editPanel.className = 'counter-edit hidden';

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.maxLength = 80;
    labelInput.value = counter.label || '';

    const valueInput = document.createElement('input');
    valueInput.type = 'number';
    valueInput.min = '0';
    valueInput.step = '1';
    valueInput.value = counter.value;

    const noteInput = document.createElement('textarea');
    noteInput.rows = 2;
    noteInput.maxLength = 200;
    noteInput.placeholder = 'Optional note';
    noteInput.value = counter.note || '';

    const fieldsWrapper = document.createElement('div');
    fieldsWrapper.className = 'counter-edit__fields';
    fieldsWrapper.append(
      buildEditField('Label (optional)', labelInput),
      buildEditField('Value', valueInput),
      buildEditField('Note (optional)', noteInput)
    );

    const editActions = document.createElement('div');
    editActions.className = 'counter-edit__actions';
    const editSave = document.createElement('button');
    editSave.type = 'button';
    editSave.className = 'savebtn';
    editSave.textContent = 'Save';
    const editCancel = document.createElement('button');
    editCancel.type = 'button';
    editCancel.className = 'ghost cancelbtn';
    editCancel.textContent = 'Cancel';
    editActions.append(editSave, editCancel);

    editPanel.append(fieldsWrapper, editActions);

    let isEditOpen = false;

    const toggleEdit = (open) => {
      if (isEditOpen === open) return;
      isEditOpen = open;
      editPanel.classList.toggle('hidden', !open);
      editBtn.classList.toggle('active', open);
      editBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
        labelInput.focus();
        labelInput.setSelectionRange(labelInput.value.length, labelInput.value.length);
      }
      changeEditPanelCount(open ? 1 : -1);
    };

    const submitEdit = async () => {
      const nextLabel = labelInput.value.trim();
      const rawValue = valueInput.value.trim();
      if (!/^\d+$/.test(rawValue)) {
        await showAlert('Use digits only when setting a value.');
        return;
      }
      const nextValue = Number(rawValue);
      const nextNote = noteInput.value.trim();
      editSave.disabled = true;
      try {
        await updateCounterMetadataRequest(counter.id, {
          label: nextLabel,
          value: Math.floor(nextValue),
          note: nextNote
        });
        toggleEdit(false);
        await refreshCounters(state.page);
        showToast(`Updated ${counter.id}`);
      } catch (error) {
        await showAlert(error.message || 'Failed to update counter');
      } finally {
        editSave.disabled = false;
      }
    };

    editBtn.addEventListener('click', () => {
      const isOpen = !editPanel.classList.contains('hidden');
      if (isOpen) {
        toggleEdit(false);
        return;
      }
      labelInput.value = counter.label || '';
      valueInput.value = counter.value;
      noteInput.value = counter.note || '';
      toggleEdit(true);
    });

    editCancel.addEventListener('click', () => toggleEdit(false));
    editSave.addEventListener('click', submitEdit);

    [labelInput, valueInput].forEach((input) => {
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submitEdit();
        }
      });
    });
    noteInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        submitEdit();
      }
    });

    actions.append(editBtn);

    meta.append(label, id);
    if (counter.note) {
      const note = document.createElement('div');
      note.className = 'counter-meta__note';
      note.textContent = counter.note;
      meta.append(note);
    }
    meta.append(value, mode, stats, actions, editPanel);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'danger ghost';
    deleteBtn.innerHTML = '<i class="ri-delete-bin-line" aria-hidden="true"></i><span> Delete</span>';
    deleteBtn.addEventListener('click', () => removeCounter(counter.id));

    row.append(meta, deleteBtn);
    fragment.appendChild(row);
  });
  counterListEl.appendChild(fragment);
}

async function removeCounter(id) {
  const confirmed = await showConfirm({
    title: 'Delete counter?',
    message: `Counter "${id}" will be removed permanently.`,
    confirmLabel: 'Delete counter',
    variant: 'danger'
  });
  if (!confirmed) return;
  try {
    const res = await fetch(`/api/counters/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    if (res.status === 401) throw new Error('Invalid admin token.');
    if (!res.ok) throw new Error('Failed to delete counter');
    const nextPage = state.page > 1 && counterListEl.children.length === 1 ? state.page - 1 : state.page;
    await refreshCounters(nextPage);
    showToast(`Deleted ${id}`);
  } catch (error) {
    await showAlert(error.message || 'Failed to delete counter');
  }
}

function updatePagination() {
  if (!paginationEl || !paginationInfo || !prevPageBtn || !nextPageBtn) return;
  if (state.totalPages <= 1) {
    paginationEl.classList.add('hidden');
    return;
  }
  paginationEl.classList.remove('hidden');
  paginationInfo.textContent = `Page ${state.page} / ${state.totalPages}`;
  prevPageBtn.disabled = state.page <= 1;
  nextPageBtn.disabled = state.page >= state.totalPages;
}

function updateCounterTotal() {
  if (!counterTotalValue) return;
  const total = Math.max(0, Number(state.total) || 0);
  counterTotalValue.textContent = total.toLocaleString();
}

function showDashboard() {
  loginCard?.classList.add('hidden');
  dashboardCard?.classList.remove('hidden');
  hideLoginError();
}

function hideDashboard() {
  stopAutoRefresh();
  loginCard?.classList.remove('hidden');
  dashboardCard?.classList.add('hidden');
  adminControls?.classList.add('hidden');
  adminEmbedSnippet?.classList.add('hidden');
  paginationEl?.classList.add('hidden');
  deleteAllBtn.disabled = true;
}

function showLoginError(message) {
  if (loginError) {
    loginError.textContent = message;
    loginError.classList.remove('hidden');
  }
}

function hideLoginError() {
  loginError?.classList.add('hidden');
}

function setLoginLoading(loading) {
  if (!adminForm) return;
  state.loadingLogin = loading;
  Array.from(adminForm.elements).forEach((el) => {
    el.disabled = loading && el.type !== 'button';
  });
}

function storeToken(token) {
  try {
    const payload = { token, expiresAt: Date.now() + TOKEN_TTL_MS };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('Unable to store token', err);
  }
}

function loadStoredToken() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.token || !parsed.expiresAt || parsed.expiresAt < Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed.token;
  } catch (err) {
    console.warn('Failed to parse stored token', err);
    return null;
  }
}

function clearStoredToken() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('Failed to clear stored token', err);
  }
  setTokenStoredState(false);
}

function setTokenStoredState(stored) {
  if (adminTokenInput) {
    adminTokenInput.placeholder = stored ? 'Token saved (expires in 12h)' : 'Admin token';
  }
}

function authHeaders() {
  return { 'x-voux-admin': state.token };
}

function getCooldownPayload(selectEl) {
  if (!selectEl) return 'unique';
  const mode = selectEl.value === 'unlimited' ? 'unlimited' : 'unique';
  if (!isModeAllowed(mode, state.allowedModes)) {
    return getFirstAllowedMode(state.allowedModes);
  }
  return mode;
}

async function handleDeleteFiltered() {
  if (!state.token || state.modeFilter === 'all') return;
  const label = state.modeFilter === 'unique' ? 'unique counters' : 'every-visit counters';
  const confirmed = await showConfirm({
    title: 'Delete filtered counters?',
    message: `This removes every ${label} currently on this instance. Continue?`,
    confirmLabel: 'Delete filtered',
    variant: 'danger'
  });
  if (!confirmed) return;
  try {
    deleteFilteredBtn.disabled = true;
    const res = await fetch(`/api/counters?mode=${state.modeFilter}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    if (res.status === 401) throw new Error('Invalid admin token.');
    if (!res.ok) throw new Error('Failed to delete counters');
    await refreshCounters(1);
    showToast(`Deleted ${label}`);
  } catch (error) {
    await showAlert(error.message || 'Failed to delete counters');
  } finally {
    updateDeleteFilteredState();
  }
}

function formatNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString();
}

function formatLastHit(timestamp) {
  if (!timestamp) {
    return 'No hits yet';
  }
  const diff = Date.now() - timestamp;
  if (diff <= 0) return 'Just now';
  const seconds = Math.floor(diff / 1000);
  const minute = 60;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (seconds < minute) {
    return 'Just now';
  }
  if (seconds < hour) {
    const mins = Math.floor(seconds / minute);
    return `${mins}m ago`;
  }
  if (seconds < day) {
    const hours = Math.floor(seconds / hour);
    return `${hours}h ago`;
  }
  if (seconds < day * 7) {
    const days = Math.floor(seconds / day);
    return `${days}d ago`;
  }
  return new Date(timestamp).toLocaleDateString();
}

function truncateQuery(query) {
  if (!query) return '';
  return query.length > 32 ? `${query.slice(0, 32)}…` : query;
}

async function updateCounterMetadataRequest(id, payload) {
  const res = await fetch(`/api/counters/${id}`, {
    method: 'PATCH',
    headers: {
      ...authHeaders(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (res.status === 401) throw new Error('Invalid admin token.');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update counter');
  }
  return res.json().catch(() => ({}));
}

async function copyEmbedSnippet(counterId, button) {
  const origin = window.location.origin.replace(/\/+$/, '');
  const snippet = `<script async src="${origin}/embed/${counterId}.js"></script>`;
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
  } catch (error) {
    window.alert('Unable to copy snippet');
  }
}

function updateCreateCardVisibility() {
  if (!createCard) return;
  if (state.privateMode) {
    createCard.classList.remove('hidden');
  } else {
    createCard.classList.add('hidden');
    adminEmbedSnippet?.classList.add('hidden');
  }
}

function updateDeleteFilteredState() {
  if (modeFilterSelect) {
    modeFilterSelect.value = state.modeFilter;
  }
  if (!deleteFilteredBtn) return;
  const disabled = state.modeFilter === 'all';
  deleteFilteredBtn.disabled = disabled;
  deleteFilteredBtn.classList.toggle('hidden', disabled);
}

function refreshAdminModeControls() {
  if (!adminCooldownSelect) return;
  applyAllowedModesToSelect(adminCooldownSelect, state.allowedModes);
}

function buildEditField(labelText, control) {
  const wrapper = document.createElement('label');
  wrapper.className = 'counter-edit__field';
  const title = document.createElement('span');
  title.className = 'counter-edit__field-label';
  title.textContent = labelText;
  wrapper.append(title, control);
  return wrapper;
}

function scheduleAutoRefresh(delay = 5000) {
  cancelAutoRefresh();
  state.autoRefreshTimer = setTimeout(async () => {
    if (!state.token) return;
    if (state.editPanelsOpen > 0) {
      scheduleAutoRefresh(delay);
      return;
    }
    try {
      await refreshCounters(state.page, { silent: true });
    } catch (_) {
      // already logged in refreshCounters
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
  options.forEach((option) => {
    const mode = option.value === 'unlimited' ? 'unlimited' : 'unique';
    const isAllowed = isModeAllowed(mode, allowed);
    option.disabled = !isAllowed;
    option.hidden = !isAllowed;
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
