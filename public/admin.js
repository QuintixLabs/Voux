const loginCard = document.querySelector('#loginCard');
const dashboardCard = document.querySelector('#dashboardCard');
const adminForm = document.querySelector('#admin-form');
const adminTokenInput = document.querySelector('#adminToken');
const loginError = document.querySelector('#loginError');
const dashboardSubtitle = document.querySelector('#dashboardSubtitle');
const adminControls = document.querySelector('#adminControls');
const counterListEl = document.querySelector('#counterList');
const deleteAllBtn = document.querySelector('#deleteAll');
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

const STORAGE_KEY = 'vouxAdminAuth';
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12h

const state = {
  token: '',
  page: 1,
  totalPages: 1,
  total: 0,
  totalOverall: 0,
  searchQuery: '',
  pageSize: 20,
  privateMode: false,
  loadingLogin: false
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
  createForm?.addEventListener('submit', handleCreateCounter);
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
    if (dashboardSubtitle) {
      dashboardSubtitle.textContent = state.privateMode
        ? 'Private mode'
        : 'Public instance';
    }
    updateCreateCardVisibility();
    adminCooldownSelect?.dispatchEvent(new Event('change'));
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

async function refreshCounters(page = 1) {
  if (!state.token) throw new Error('Admin token missing.');
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
}

async function fetchCounters(page) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(state.pageSize)
  });
  if (state.searchQuery) {
    params.append('q', state.searchQuery);
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
    await refreshCounters(1);
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
    payload.ipCooldownHours = getCooldownPayload(adminCooldownSelect);
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
  counterListEl.innerHTML = '';
  if (!counters.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = state.searchQuery
      ? `No counters match "${state.searchQuery}".`
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
    label.textContent = counter.label || '(no label)';

    const id = document.createElement('div');
    id.className = 'counter-meta__id';
    id.textContent = counter.id;

    const value = document.createElement('div');
    value.className = 'counter-meta__value';
    value.innerHTML = `Value <span class="badge">${counter.value}</span>`;

    const mode = document.createElement('div');
    mode.className = 'counter-meta__mode';
    const labelText = counter.cooldownLabel || 'Unique visitors';
    mode.textContent = `Mode: ${labelText}`;

    meta.append(label, id, value, mode);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'danger ghost';
    deleteBtn.textContent = 'Delete';
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
  const total = Math.max(0, Number(state.totalOverall ?? state.total) || 0);
  counterTotalValue.textContent = total.toLocaleString();
}

function showDashboard() {
  loginCard?.classList.add('hidden');
  dashboardCard?.classList.remove('hidden');
  hideLoginError();
}

function hideDashboard() {
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
  return selectEl.value === 'unlimited' ? 'unlimited' : 'unique';
}

const yearEl = document.getElementById('currentYear');
if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
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
