/*
  dashboard.js

  Admin dashboard logic: login, list/manage counters, create counters, tags, and previews.
*/

/* -------------------------------------------------------------------------- */
/* DOM references                                                             */
/* -------------------------------------------------------------------------- */
const loginCard = document.querySelector('#loginCard');
const dashboardCard = document.querySelector('#dashboardCard');
const adminForm = document.querySelector('#admin-form');
const loginUsernameInput = document.querySelector('#loginUsername');
const loginPasswordInput = document.querySelector('#loginPassword');
const loginError = document.querySelector('#loginError');
const loginStatus = document.querySelector('#loginStatus');
const dashboardSubtitle = document.querySelector('#dashboardSubtitle');
const selectionToolbar = document.querySelector('#selectionToolbar');
const selectionCountEl = document.querySelector('#selectionCount');
const selectAllBtn = document.querySelector('#selectAll');
const downloadSelectedBtn = document.querySelector('#downloadSelected');
const addTagsSelectedBtn = document.querySelector('#addTagsSelected');
const deleteSelectedBtn = document.querySelector('#deleteSelected');
const clearSelectionBtn = document.querySelector('#clearSelection');
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
const createNoteInput = document.querySelector('#adminNote');
const createStartInput = document.querySelector('#adminStartValue');
const adminEmbedBlock = document.querySelector('#adminEmbedBlock');
const adminEmbedCopy = document.querySelector('#adminEmbedCopy');
const adminEmbedSnippet = document.querySelector('#adminEmbedSnippet');
const createCard = document.querySelector('#createCard');
const adminCooldownSelect = document.querySelector('#adminCooldownSelect');
const adminPreview = document.querySelector('#adminPreview');
const adminPreviewTarget = document.querySelector('#adminPreviewTarget');
const modeFilterSelect = document.querySelector('#modeFilter');
const sortFilterSelect = document.querySelector('#sortFilter');
const activityRangeControls = document.querySelector('#activityRangeControls');
const adminThrottleHint = document.querySelector('#adminThrottleHint');
const tagFilterControls = document.querySelector('#tagFilterControls');
const tagFilterButton = document.querySelector('#tagFilterButton');
const tagFilterMenu = document.querySelector('#tagFilterMenu');
const tagFilterList = document.querySelector('#tagFilterList');
const clearTagFilterBtn = document.querySelector('#clearTagFilter');
const tagFilterCreateBtn = document.querySelector('#tagFilterCreate');
const createTagPicker = document.querySelector('#createTagPicker');
const createTagManageBtn = document.querySelector('#createTagManage');
const createTagCounterHint = document.querySelector('#createTagCounterHint');
const tagFilterCountHint = document.querySelector('.tag-count-hint');
const topPaginationInfo = document.querySelector('#topPaginationInfo');
const ownerFilterWrap = document.querySelector('#ownerFilterWrap');
const ownerFilterToggle = document.querySelector('#ownerFilterToggle');
const themeHelper = window.VouxTheme;

/* -------------------------------------------------------------------------- */
/* Toasts                                                                     */
/* -------------------------------------------------------------------------- */
let toastContainer = document.querySelector('.toast-stack');
if (!toastContainer) {
  toastContainer = document.createElement('div');
  toastContainer.className = 'toast-stack';
  document.body.appendChild(toastContainer);
}
let tagFilterMenuOpen = false;
const tagSelectorRegistry = new Set();
let pickrReadyPromise = null;

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */
const RANGE_LABELS = {
  today: 'Today',
  '7d': '7 days',
  '30d': '30 days'
};

const TAG_LIMIT = 20;
const START_VALUE_DIGIT_LIMIT = 18;

/* -------------------------------------------------------------------------- */
/* State                                                                      */
/* -------------------------------------------------------------------------- */
const state = {
  user: null,
  isAdmin: false,
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
  sort: 'newest',
  autoRefreshTimer: null,
  editPanelsOpen: 0,
  activityRange: '7d',
  ownerOnly: false,
  latestCounters: [],
  selectedIds: new Set(),
  counterCache: new Map(),
  tags: [],
  tagFilter: [],
  createTags: [],
  debugInactive: new URLSearchParams(window.location.search).has('debugInactive') // use ?debugInactive in the browser to preview the inactive badge
};

let searchDebounce = null;
const OWNER_FILTER_STORAGE_KEY = 'voux_owner_only';

function loadOwnerFilterPreference() {
  try {
    return window.localStorage.getItem(OWNER_FILTER_STORAGE_KEY) === 'true';
  } catch (_) {
    return false;
  }
}

function saveOwnerFilterPreference(value) {
  try {
    window.localStorage.setItem(OWNER_FILTER_STORAGE_KEY, value ? 'true' : 'false');
  } catch (_) {
    // ignore
  }
}

/* -------------------------------------------------------------------------- */
/* Modal helpers                                                              */
/* -------------------------------------------------------------------------- */

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

function normalizeAuthMessage(error, fallback) {
  if (window.VouxErrors?.normalizeAuthError) {
    return window.VouxErrors.normalizeAuthError(error, fallback);
  }
  return error?.message || fallback;
}

async function showConfirm(options) {
  if (modalApi()?.confirm) {
    return modalApi().confirm(options);
  }
  return window.confirm(options?.message || 'Are you sure?');
}

async function showConfirmWithInput(options) {
  if (modalApi()?.confirmWithInput) {
    return modalApi().confirmWithInput(options);
  }
  const entered = window.prompt(options?.promptMessage || 'Type DELETE to confirm');
  return entered && entered.trim() === (options?.inputMatch || 'DELETE');
}

function showToast(message, variant = 'success') {
  if (!toastContainer) return;
  const toast = document.createElement('div');
  toast.className = `toast toast--${variant}`;
  toast.innerHTML = `<i class="${variant === 'success' ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'}"></i>
    <span>${message}</span>`;
  toastContainer.appendChild(toast);
  toastContainer.classList.add('toast-stack--interactive');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('toast--visible'));
  });
  let remaining = 2200;
  let startedAt = Date.now();
  let timeout = setTimeout(removeToast, remaining);

  function removeToast() {
    if (toast.dataset.removing) return;
    toast.dataset.removing = 'true';
    toast.classList.remove('toast--visible');
    setTimeout(() => toast.remove(), 250);
    setTimeout(() => {
      if (!toastContainer.querySelector('.toast')) {
        toastContainer.classList.remove('toast-stack--interactive');
      }
    }, 260);
  }

  const pauseTimer = () => {
    if (!timeout) return;
    const elapsed = Date.now() - startedAt;
    remaining = Math.max(0, remaining - elapsed);
    clearTimeout(timeout);
    timeout = null;
  };

  const resumeTimer = () => {
    if (timeout || toast.dataset.removing) return;
    startedAt = Date.now();
    timeout = setTimeout(removeToast, remaining);
  };

  toast._pauseToast = pauseTimer;
  toast._resumeToast = resumeTimer;

  const pauseAll = () => {
    toastContainer.querySelectorAll('.toast').forEach((node) => node._pauseToast?.());
  };

  const resumeAll = () => {
    toastContainer.querySelectorAll('.toast').forEach((node) => node._resumeToast?.());
  };

  toast.addEventListener('mouseenter', pauseAll);
  toast.addEventListener('mouseleave', resumeAll);
}
window.showToast = showToast;

function showActionToast(message, actionLabel, onAction) {
  if (!toastContainer) return;
  const toast = document.createElement('div');
  toast.className = 'toast toast--action';
  const icon = document.createElement('i');
  icon.className = 'ri-checkbox-circle-line';
  const text = document.createElement('span');
  text.textContent = message;
  const actionBtn = document.createElement('button');
  actionBtn.type = 'button';
  actionBtn.className = 'toast__action';
  actionBtn.textContent = actionLabel;
  toast.append(icon, text, actionBtn);
  toastContainer.appendChild(toast);
  toastContainer.classList.add('toast-stack--interactive');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('toast--visible'));
  });

  const removeToast = () => {
    if (toast.dataset.removing) return;
    toast.dataset.removing = 'true';
    toast.classList.remove('toast--visible');
    setTimeout(() => {
      toast.remove();
      if (!toastContainer.querySelector('.toast--action')) {
        toastContainer.classList.remove('toast-stack--interactive');
      }
    }, 250);
  };

  let remaining = 6000;
  let startedAt = Date.now();
  let timeout = setTimeout(removeToast, remaining);

  const pauseTimer = () => {
    if (!timeout) return;
    const elapsed = Date.now() - startedAt;
    remaining = Math.max(0, remaining - elapsed);
    clearTimeout(timeout);
    timeout = null;
  };

  const resumeTimer = () => {
    if (timeout || toast.dataset.removing) return;
    startedAt = Date.now();
    timeout = setTimeout(removeToast, remaining);
  };

  toast.addEventListener('mouseenter', pauseTimer);
  toast.addEventListener('mouseleave', resumeTimer);
  actionBtn.addEventListener('click', async () => {
    if (actionBtn.disabled) return;
    actionBtn.disabled = true;
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    try {
      await onAction?.();
    } finally {
      removeToast();
    }
  });
}

function authFetch(url, options = {}) {
  return fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      ...options.headers
    }
  });
}

function limitStartValueInput(input) {
  if (!input) return;
  const enforceDigits = () => {
    const digitsOnly = (input.value || '').replace(/[^\d]/g, '');
    const trimmed = digitsOnly.slice(0, START_VALUE_DIGIT_LIMIT);
    if (trimmed !== input.value) {
      input.value = trimmed;
    }
  };
  enforceDigits();
  input.addEventListener('input', enforceDigits);
}

function readStartValue(input) {
  if (!input) return '0';
  const digits = (input.value || '').replace(/[^\d]/g, '').slice(0, START_VALUE_DIGIT_LIMIT);
  return digits || '0';
}

function appendPreviewParam(url) {
  try {
    const parsed = new URL(url, window.location.origin);
    parsed.searchParams.set('preview', '1');
    return parsed.toString();
  } catch (_) {
    return url.includes('?') ? `${url}&preview=1` : `${url}?preview=1`;
  }
}

document.addEventListener('DOMContentLoaded', init);

window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    checkSession();
  }
});

/* -------------------------------------------------------------------------- */
/* Init + boot                                                                */
/* -------------------------------------------------------------------------- */
function init() {
  if (deleteAllBtn) deleteAllBtn.disabled = true;
  adminForm?.addEventListener('submit', onLoginSubmit);
  prevPageBtn?.addEventListener('click', () => {
    if (state.page > 1) {
      handlePageNavigation(state.page - 1);
    }
  });
  nextPageBtn?.addEventListener('click', () => {
    if (state.page < state.totalPages) {
      handlePageNavigation(state.page + 1);
    }
  });
  deleteAllBtn?.addEventListener('click', handleDeleteAll);
  deleteFilteredBtn?.addEventListener('click', handleDeleteFiltered);
  createForm?.addEventListener('submit', handleCreateCounter);
  adminEmbedCopy?.addEventListener('click', handleAdminEmbedCopy);
  modeFilterSelect?.addEventListener('change', handleModeFilterChange);
  sortFilterSelect?.addEventListener('change', handleSortChange);
  ownerFilterToggle?.addEventListener('click', handleOwnerFilterToggle);
  adminCooldownSelect?.addEventListener('change', refreshAdminModeControls);
  counterSearchInput?.addEventListener('input', handleSearchInput);
  counterSearchInput?.addEventListener('search', handleSearchInput);
  counterSearchClear?.addEventListener('click', handleSearchClear);
 activityRangeControls?.addEventListener('click', handleActivityRangeClick);
  window.addEventListener('keydown', handlePaginationHotkeys);
  selectAllBtn?.addEventListener('click', handleSelectAll);
  downloadSelectedBtn?.addEventListener('click', handleDownloadSelected);
  addTagsSelectedBtn?.addEventListener('click', handleAddTagsSelected);
  deleteSelectedBtn?.addEventListener('click', handleDeleteSelected);
  clearSelectionBtn?.addEventListener('click', () => clearSelection());
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('keydown', handleGlobalKeydown);
  tagFilterButton?.addEventListener('click', handleTagFilterToggle);
  const tagFilterLabel = tagFilterControls?.querySelector('span');
  tagFilterLabel?.addEventListener('click', handleTagFilterLabelClick);
  clearTagFilterBtn?.addEventListener('click', clearTagFilterSelection);
  tagFilterCreateBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    handleTagCreate('filter');
  });
  createTagManageBtn?.addEventListener('click', () => handleTagCreate('create'));
  if (createTagPicker) {
    registerTagSelector(createTagPicker, {
      getSelected: () => state.createTags.slice(),
      setSelected: (next) => {
        state.createTags = next;
      },
      emptyMessage: 'No tags yet. Use "New tag" to create one.'
    });
  }
  renderTagFilterList();
  updateTagFilterButton();
  toggleSearchClear();
  limitStartValueInput(createStartInput);
  // no extra change handler needed for simple dropdown
  fetchConfig()
    .then(() => {
      showStatusHint('Checking your session...');
      checkSession();
    })
    .catch((err) => {
      console.warn('Admin init failed', err);
      revealLoginCard();
    });
  updateDeleteFilteredState();
  updateActivityRangeButtons();
  updateTagCounterHints();
}

/* -------------------------------------------------------------------------- */
/* Pickr loader                                                               */
/* -------------------------------------------------------------------------- */
// function to ensure that pickr library is loaded
function ensurePickrLoaded() {
    if (window.Pickr && typeof window.Pickr.create === 'function') {
      return Promise.resolve(window.Pickr);
    }
    return Promise.reject(new Error('Pickr not loaded'));
  }

/* -------------------------------------------------------------------------- */
/* Config + session                                                           */
/* -------------------------------------------------------------------------- */
async function fetchConfig() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) return;
    const data = await res.json();
    if (!data) return;
    if (data.adminPageSize) {
      state.pageSize = Number(data.adminPageSize) || state.pageSize;
    }
    document.documentElement.style.setProperty('--admin-page-size', state.pageSize);
    state.privateMode = Boolean(data.privateMode);
    state.allowedModes = normalizeAllowedModes(data.allowedModes);
    state.throttleSeconds = Number(data.unlimitedThrottleSeconds) || 0;
    themeHelper?.apply(data.theme);
    if (dashboardSubtitle) {
      dashboardSubtitle.textContent = state.privateMode
        ? 'Private instance'
        : 'Public instance';
    }
    updateCreateCardVisibility();
    refreshAdminModeControls();
    updateDeleteFilteredState();
    renderAdminThrottleHint();
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.warn('Failed to fetch config', error);
    }
  }
}

async function checkSession() {
  setLoginPending(true, 'Checking your session...');
  setLoginLoading(true);
  try {
    const res = await fetch('/api/session', { credentials: 'include' });
    if (!res.ok) {
      revealLoginCard();
      return;
    }
    const data = await res.json();
    setUserSession(data?.user || null);
    showDashboard();
  } catch (error) {
    console.warn('Session check failed', error);
    revealLoginCard();
  } finally {
    setLoginLoading(false);
  }
}

/* -------------------------------------------------------------------------- */
/* Search + filters                                                           */
/* -------------------------------------------------------------------------- */
function handleSearchInput() {
  if (!counterSearchInput) return;
  toggleSearchClear();
  const value = counterSearchInput.value.trim().slice(0, 80);
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    if (value === state.searchQuery) return;
    state.searchQuery = value;
    if (state.user) {
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
  if (state.user) {
    refreshCounters(1);
  }
}

function handleOwnerFilterToggle() {
  if (!state.isAdmin) return;
  state.ownerOnly = !state.ownerOnly;
  saveOwnerFilterPreference(state.ownerOnly);
  syncOwnerFilterToggle();
  if (state.user) {
    refreshCounters(1);
  }
}

function syncOwnerFilterToggle() {
  if (!ownerFilterToggle) return;
  ownerFilterToggle.setAttribute('aria-pressed', state.ownerOnly ? 'true' : 'false');
}

function handleModeFilterChange() {
  if (!modeFilterSelect) return;
  state.modeFilter = modeFilterSelect.value;
  updateDeleteFilteredState();
  if (state.user) {
    refreshCounters(1);
  }
}

function handleSortChange() {
  if (!sortFilterSelect) return;
  state.sort = sortFilterSelect.value || 'newest';
  if (state.user) {
    refreshCounters(1);
  }
}

function toggleSearchClear() {
  if (!counterSearchClear || !counterSearchInput) return;
  counterSearchClear.classList.toggle('hidden', counterSearchInput.value.trim().length === 0);
}

function handleActivityRangeClick(event) {
  const button = event.target.closest('button[data-range]');
  if (!button) return;
  const range = button.dataset.range;
  if (!range || range === state.activityRange) return;
  state.activityRange = range;
  updateActivityRangeButtons();
  renderCounterList(state.latestCounters);
}

/* -------------------------------------------------------------------------- */
/* Auth + login                                                               */
/* -------------------------------------------------------------------------- */
async function onLoginSubmit(event) {
  event.preventDefault();
  hideLoginError();
  const username = loginUsernameInput?.value.trim();
  const password = loginPasswordInput?.value;
  if (!username || !password) {
    showLoginError('Enter your username and password.');
    return;
  }
  setLoginPending(true /*, 'Signing in...'*/);
  await attemptLogin(username, password);
}

async function attemptLogin(username, password) {
  setLoginLoading(true);
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      const code = error?.error;
      if (res.status === 429) {
        throw Object.assign(new Error(error?.message || 'Too many attempts. Try again soon.'), { code: 'rate_limit' });
      }
      throw Object.assign(new Error(error?.message || 'Login failed. Check your details.'), { code: code || 'unauthorized' });
    }
    const data = await res.json();
    setUserSession(data?.user || null);
    if (window.VouxErrors?.cacheNavUser) {
      window.VouxErrors.cacheNavUser(data?.user || null);
    }
    if (loginUsernameInput) loginUsernameInput.value = '';
    loginPasswordInput.value = '';
    showDashboard();
  } catch (error) {
    const code = error?.code;
    if (code === 'rate_limit') {
      showLoginError(error?.message || 'Too many attempts. Try again soon.');
    } else {
      showLoginError(error?.message || 'Login failed. Check your details.');
    }
    revealLoginCard();
  } finally {
    setLoginLoading(false);
  }
}

/* -------------------------------------------------------------------------- */
/* Counters fetch + refresh                                                   */
/* -------------------------------------------------------------------------- */
async function refreshCounters(page = 1, options = {}) {
  const { silent = false } = options;
  if (!state.user) throw new Error('Not authenticated.');
  try {
    const data = await fetchCounters(page);
    const counters = data.counters || [];
    let patched = false;
    if (silent && canPatchCounters(state.latestCounters, counters)) {
      patched = patchCounterRows(counters);
    }
    if (!patched) {
      renderCounterList(counters);
    }
    state.latestCounters = counters;
    updateCounterCache(counters);
    state.page = data.pagination?.page || 1;
    state.totalPages = data.pagination?.totalPages || 1;
    state.total = data.pagination?.total || (data.counters?.length ?? 0);
    state.totalOverall = data.totals?.overall ?? state.totalOverall ?? state.total;
    updatePagination();
    updateCounterTotal();
    updateTagCounterHints();
    updateDeleteFilteredState();
    adminControls?.classList.remove('hidden');
    adminControls?.classList.remove('is-loading');
    document.body.classList.remove('dashboard-footer-hidden');
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
  if (state.sort === 'inactive') {
    params.append('inactive', '1');
  } else if (state.sort && state.sort !== 'newest') {
    params.append('sort', state.sort);
  }
  if (state.tagFilter && state.tagFilter.length) {
    state.tagFilter.forEach((tagId) => {
      params.append('tags', tagId);
    });
  }
  if (state.ownerOnly && state.isAdmin) {
    params.append('owner', 'me');
  }
  const url = `/api/counters?${params.toString()}`;
  const res = await authFetch(url);
  if (res.status === 401 || res.status === 403) {
    const err = await res.json().catch(() => ({}));
    const unauthorized = new Error(err?.message || 'Unauthorized.');
    unauthorized.code = 'unauthorized';
    throw unauthorized;
  }
  if (res.status === 429) {
    const err = await res.json().catch(() => ({}));
    const rateError = new Error(err?.message || 'Too many attempts. Try again soon.');
    rateError.retryAfterSeconds = err?.retryAfterSeconds;
    rateError.code = 'rate_limit';
    throw rateError;
  }
  if (!res.ok) {
    const generic = new Error('Failed to load counters');
    generic.code = 'network';
    throw generic;
  }
  return res.json();
}

/* -------------------------------------------------------------------------- */
/* Bulk actions + create                                                      */
/* -------------------------------------------------------------------------- */
async function handleDeleteAll() {
  const siteUrl = window.location?.origin || window.location?.href || 'this site';
  const targetLabel = state.isAdmin ? 'every counter' : 'your counters';
  const confirmed = await showConfirm({
    title: 'Really delete everything?',
    message: `This will permanently remove ${targetLabel} and their data on: <strong style="color:#fff;">${siteUrl}</strong>. You'll confirm by typing DELETE next.`,
    allowHtml: true,
    confirmLabel: 'Continue',
    cancelLabel: 'Cancel',
    variant: 'danger'
  });
  if (!confirmed) return;
  const confirmedFinal = await showConfirmWithInput({
    title: 'Delete all counters?',
    message: `Type DELETE to permanently remove ${targetLabel}.`,
    inputPlaceholder: 'DELETE',
    inputMatch: 'DELETE',
    inputHint: 'This cannot be undone.',
    promptMessage: `Type DELETE to permanently remove ${targetLabel}.`, // fallback
    confirmLabel: 'Delete all counters',
    cancelLabel: 'Cancel',
    variant: 'danger'
  });
  if (!confirmedFinal) return;
  try {
    deleteAllBtn.disabled = true;
    const res = await authFetch('/api/counters', {
      method: 'DELETE'
    });
    if (res.status === 401) throw new Error('Unauthorized.');
    if (!res.ok) throw new Error('Failed to delete counters');
    const payload = await res.json().catch(() => ({}));
    await refreshCounters(1);
    clearSelection();
    showToast(`Deleted ${payload.deleted ?? 'all'} counters`);
  } catch (error) {
    await showAlert(normalizeAuthMessage(error, 'Failed to delete counters'));
  } finally {
    deleteAllBtn.disabled = false;
  }
}

async function handleCreateCounter(event) {
  event.preventDefault();
  if (!state.user) {
    await showAlert('Log in first.');
    return;
  }
  const noteValue = createNoteInput?.value?.trim() || '';
  const payload = {
    label: createLabelInput?.value?.trim() || '',
    startValue: readStartValue(createStartInput)
  };
  if (state.createTags.length) {
    payload.tags = state.createTags.slice(0, 20);
  }
  try {
    payload.mode = getCooldownPayload(adminCooldownSelect);
  } catch (error) {
    await showAlert(normalizeAuthMessage(error, 'Invalid counting mode'));
    return;
  }
  try {
    const res = await authFetch('/api/counters', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (res.status === 401) throw new Error('Unauthorized.');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (err && typeof err.message === 'string' && err.message.trim()) {
        throw new Error(err.message.trim());
      }
      if (err && err.error === 'rate_limited') {
        const wait = typeof err.retryAfterSeconds === 'number' ? err.retryAfterSeconds : null;
        if (wait) {
          const pretty = wait === 1 ? '1 second' : `${wait} seconds`;
          throw new Error(`Too many new counters at once. Try again in ${pretty}.`);
        }
        throw new Error('Too many new counters right now. Try again in a moment.');
      }
      throw new Error(err.error || 'Failed to create counter');
    }
    const data = await res.json();
    if (adminEmbedSnippet) {
      adminEmbedSnippet.value = data.embedCode;
      adminEmbedBlock?.classList.remove('hidden');
    }
    if (data.embedUrl) {
      renderAdminPreview(data.embedUrl);
    }
    if (noteValue) {
      try {
        await updateCounterMetadataRequest(data.counter.id, { note: noteValue });
      } catch (err) {
        console.warn('Failed to set note on create', err);
      }
    }
    if (createLabelInput) createLabelInput.value = payload.label;
    if (createNoteInput) createNoteInput.value = '';
    if (state.createTags.length) {
      state.createTags = [];
      refreshTagSelectors();
    }
    await refreshCounters(state.page);
  } catch (error) {
    await showAlert(normalizeAuthMessage(error, 'Failed to create counter'));
  }
}

/* -------------------------------------------------------------------------- */
/* Render: admin preview + list                                               */
/* -------------------------------------------------------------------------- */
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

function renderCounterList(counters = state.latestCounters) {
  if (!counterListEl) return;
  cleanupTagSelectors();
  const list = Array.isArray(counters) ? counters : [];
  state.editPanelsOpen = 0;
  counterListEl.innerHTML = '';
  if (!list.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = state.searchQuery
      ? `No counters match "${truncateQuery(state.searchQuery)}".`
      : 'No counters yet.';
    counterListEl.appendChild(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  list.forEach((counter) => {
    const row = document.createElement('div');
    row.className = 'counter-row';
    row.dataset.counterId = counter.id;
    const isSelected = state.selectedIds.has(counter.id);
    if (isSelected) {
      row.classList.add('counter-row--selected');
    }

    const selectWrapper = document.createElement('label');
    selectWrapper.className = 'counter-select';
    const selectInput = document.createElement('input');
    selectInput.type = 'checkbox';
    selectInput.checked = isSelected;
    selectInput.addEventListener('change', (event) => toggleSelection(counter.id, event.target.checked, row));
    selectWrapper.appendChild(selectInput);

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
    value.innerHTML = `<i class="ri-eye-line" aria-hidden="true"></i> Value <span class="badge">${formatNumber(counter.value)}</span>`;

    const mode = document.createElement('div');
    mode.className = 'counter-meta__mode';
    const labelText = counter.cooldownLabel || 'Unique visitors';
    mode.innerHTML = `<i class="ri-timer-2-line" aria-hidden="true"></i> Mode: ${labelText}`;

    const stats = document.createElement('div');
    stats.className = 'counter-meta__stats';

    const lastHitStat = document.createElement('span');
    lastHitStat.className = 'counter-meta__stat';
    lastHitStat.innerHTML = `<span class="counter-meta__stat-label">Last hit</span><span class="counter-meta__stat-value">${formatLastHit(
      counter.lastHit
    )}</span>`;

    const rangeStat = document.createElement('span');
    rangeStat.className = 'counter-meta__stat';
    const rangeLabel = getRangeStatLabel();
    const rangeValue = getRangeStatValue(counter);
    rangeStat.innerHTML = `<span class="counter-meta__stat-label">${rangeLabel}</span><span class="counter-meta__stat-value">${formatNumber(
      rangeValue
    )}</span>`;
    stats.append(lastHitStat, rangeStat);

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
    labelInput.name = 'counterLabel';
    labelInput.maxLength = 80;
    labelInput.placeholder = 'Views:';
    labelInput.value = counter.label || '';

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.name = 'counterValue';
    valueInput.inputMode = 'numeric';
    valueInput.pattern = '[0-9]*';
    valueInput.maxLength = START_VALUE_DIGIT_LIMIT;
    valueInput.placeholder = '0';
    valueInput.value = counter.value;
    limitStartValueInput(valueInput);

    const noteInput = document.createElement('textarea');
    noteInput.rows = 2;
    noteInput.maxLength = 200;
    noteInput.placeholder = 'Optional note';
    noteInput.value = counter.note || '';

    const fieldsWrapper = document.createElement('div');
    fieldsWrapper.className = 'counter-edit__fields';
    fieldsWrapper.append(
      buildEditField('Label <span class="optional-tag">Optional</span>', labelInput, { allowHtml: true }),
      buildEditField('Value', valueInput),
      buildEditField('Note <span class="optional-tag">Optional</span>', noteInput, { allowHtml: true })
    );
    let editTags = extractTagIds(counter.tags);
    let canEditTags = counter.canEditTags !== false;
    const tagField = document.createElement('div');
    tagField.className = 'counter-edit__field counter-edit__field--tags';
    const tagHead = document.createElement('div');
    tagHead.className = 'counter-edit__field-label counter-edit__field-label--actions';
    const tagLabelText = document.createElement('span');
    tagLabelText.innerHTML = 'Tags <span class="optional-tag">Optional</span>';
    const tagInlineBtn = document.createElement('button');
    tagInlineBtn.type = 'button';
    tagInlineBtn.className = 'ghost tag-inline-button';
    tagInlineBtn.innerHTML = '<i class="ri-price-tag-3-line" aria-hidden="true"></i><span>New tag</span>';
    tagInlineBtn.addEventListener('click', () => handleTagCreate('edit'));
    tagHead.append(tagLabelText, tagInlineBtn);
    const tagSelector = document.createElement('div');
    tagSelector.className = 'tag-picker';
    const tagDisabledHint = document.createElement('p');
    tagDisabledHint.className = 'tag-disabled-hint hidden';
    const ownerLabel = counter.ownerUsername || 'someone else';
    tagDisabledHint.textContent = 'Tags are disabled because this counter is owned by ';
    const ownerStrong = document.createElement('strong');
    ownerStrong.textContent = ownerLabel;
    tagDisabledHint.append(ownerStrong, document.createTextNode('.'));
    const editTagSelectorEntry = registerTagSelector(tagSelector, {
      getSelected: () => editTags.slice(),
      setSelected: (next) => {
        editTags = next;
      },
      emptyMessage: 'No tags yet. Use "New tag" to create one.'
    });
    tagField.append(tagHead, tagSelector, tagDisabledHint);
    fieldsWrapper.appendChild(tagField);

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
      row.classList.toggle('counter-row--editing', open);
      editBtn.classList.toggle('active', open);
      editBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
        labelInput.focus();
        labelInput.setSelectionRange(labelInput.value.length, labelInput.value.length);
      }
      changeEditPanelCount(open ? 1 : -1);
    };

    const updateTagEditState = (allowTags) => {
      canEditTags = allowTags;
      tagInlineBtn.classList.toggle('hidden', !allowTags);
      tagSelector.classList.toggle('hidden', !allowTags);
      tagDisabledHint.classList.toggle('hidden', allowTags);
    };

    const submitEdit = async () => {
      const nextLabel = labelInput.value.trim();
      const rawValue = (valueInput.value || '').replace(/[^\d]/g, '').slice(0, START_VALUE_DIGIT_LIMIT);
      if (!/^\d+$/.test(rawValue || '0')) {
        await showAlert('Use digits only when setting a value.');
        return;
      }
      const nextValue = rawValue || '0';
      const nextNote = noteInput.value.trim();
      editSave.disabled = true;
      try {
        const payload = {
          label: nextLabel,
          value: nextValue,
          note: nextNote
        };
        if (canEditTags) {
          payload.tags = editTags;
        }
        await updateCounterMetadataRequest(counter.id, payload);
        toggleEdit(false);
        await refreshCounters(state.page);
        showToast(`Updated ${counter.id}`);
      } catch (error) {
        await showAlert(normalizeAuthMessage(error, 'Failed to update counter'));
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
      editTags = extractTagIds(counter.tags);
      refreshTagSelectorEntry(editTagSelectorEntry);
      updateTagEditState(counter.canEditTags !== false);
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

    const downloadBtn = document.createElement('button');
    downloadBtn.type = 'button';
    downloadBtn.className = 'ghost counter-download-btn';
    downloadBtn.innerHTML = '<i class="ri-download-2-line"></i><span> Download</span>';
    downloadBtn.addEventListener('click', () => handleDownloadSingle(counter.id, counter.label || counter.id, downloadBtn));
    actions.append(downloadBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'danger ghost counter-delete-btn';
    deleteBtn.innerHTML = '<i class="ri-delete-bin-line" aria-hidden="true"></i><span> Delete</span>';
    deleteBtn.addEventListener('click', () => removeCounter(counter.id));
    actions.append(deleteBtn);

    meta.append(label, id);
    const tagsLine = buildTagBadges(counter.tags);
    if (tagsLine) {
      meta.append(tagsLine);
    }
    const statusLine = buildStatusBadges(counter, { forceInactive: state.debugInactive });
    if (statusLine) {
      meta.append(statusLine);
    }
    if (counter.note) {
      const note = document.createElement('div');
      note.className = 'counter-meta__note';
      note.textContent = counter.note;
      meta.append(note);
    }
    meta.append(value, mode, stats);

    const activityBlock = buildActivityBlock(counter.activity);
    if (activityBlock) {
      meta.append(activityBlock);
    }

    meta.append(actions, editPanel);
    row.append(meta, selectWrapper);
    fragment.appendChild(row);
  });
  counterListEl.appendChild(fragment);
  updateSelectionToolbar();
}

/* -------------------------------------------------------------------------- */
/* Row actions                                                                */
/* -------------------------------------------------------------------------- */
async function removeCounter(id) {
  const confirmed = await showConfirm({
    title: 'Delete counter?',
    message: `Counter "${id}" will be removed permanently.`,
    confirmLabel: 'Delete counter',
    variant: 'danger'
  });
  if (!confirmed) return;
  try {
    const res = await authFetch(`/api/counters/${id}`, {
      method: 'DELETE'
    });
    if (res.status === 401) throw new Error('Unauthorized.');
    if (!res.ok) throw new Error('Failed to delete counter');
    state.selectedIds.delete(id);
    const nextPage = state.page > 1 && counterListEl.children.length === 1 ? state.page - 1 : state.page;
    await refreshCounters(nextPage);
    updateSelectionToolbar();
    showToast(`Deleted ${id}`);
  } catch (error) {
    await showAlert(normalizeAuthMessage(error, 'Failed to delete counter'));
  }
}

/* -------------------------------------------------------------------------- */
/* Pagination + totals                                                        */
/* -------------------------------------------------------------------------- */
function updatePagination() {
  if (!paginationEl || !paginationInfo || !prevPageBtn || !nextPageBtn) return;
  if (state.totalPages <= 1) {
    paginationEl.classList.add('hidden');
    if (topPaginationInfo) topPaginationInfo.classList.add('hidden');
    return;
  }
  paginationEl.classList.remove('hidden');
  paginationInfo.textContent = `Page ${state.page} / ${state.totalPages}`;
  if (topPaginationInfo) {
    topPaginationInfo.textContent = `Page ${state.page} / ${state.totalPages}`;
    topPaginationInfo.classList.remove('hidden');
  }
  prevPageBtn.disabled = state.page <= 1;
  nextPageBtn.disabled = state.page >= state.totalPages;
}

function updateCounterTotal() {
  if (!counterTotalValue) return;
  const total = Math.max(0, Number(state.total) || 0);
  counterTotalValue.textContent = total.toLocaleString();
}

/* -------------------------------------------------------------------------- */
/* Dashboard UI                                                               */
/* -------------------------------------------------------------------------- */
function showDashboard() {
  loginCard?.classList.add('hidden');
  loginCard?.classList.remove('login-card--pending');
  dashboardCard?.classList.remove('hidden');
  document.body.classList.add('dashboard-footer-hidden');
  if (adminControls) {
    adminControls.classList.remove('hidden');
    adminControls.classList.add('is-loading');
  }
  if (dashboardSubtitle) {
    const name = state.user?.displayName || state.user?.username || 'Signed in';
    const instanceLabel = state.privateMode ? 'Private instance' : 'Public instance';
    dashboardSubtitle.textContent = `${name} · ${instanceLabel}`;
  }
  hideLoginError();
}

function hideDashboard() {
  cancelAutoRefresh();
  loginCard?.classList.remove('hidden');
  loginCard?.classList.remove('login-card--pending');
  dashboardCard?.classList.add('hidden');
  adminControls?.classList.add('hidden');
  adminControls?.classList.remove('is-loading');
  document.body.classList.add('dashboard-footer-hidden');
  adminEmbedBlock?.classList.add('hidden');
  if (adminEmbedSnippet) adminEmbedSnippet.value = '';
  paginationEl?.classList.add('hidden');
  deleteAllBtn.disabled = true;
  state.tags = [];
  state.tagFilter = [];
  state.createTags = [];
  renderTagFilterList();
  updateTagFilterButton();
  refreshTagSelectors();
  closeTagFilterMenu();
}

/* -------------------------------------------------------------------------- */
/* Login UI                                                                   */
/* -------------------------------------------------------------------------- */
function showLoginError(message) {
  showToast(message || 'Login failed. Check your details.', 'danger');
  loginPasswordInput?.classList.add('input-error');
  loginPasswordInput?.setAttribute('aria-invalid', 'true');
}

function hideLoginError() {
  loginError?.classList.add('hidden');
  loginPasswordInput?.classList.remove('input-error');
  loginPasswordInput?.removeAttribute('aria-invalid');
}

function setLoginLoading(loading) {
  if (!adminForm) return;
  state.loadingLogin = loading;
  Array.from(adminForm.elements).forEach((el) => {
    el.disabled = loading && el.type !== 'button';
  });
}

/* -------------------------------------------------------------------------- */
/* Session state                                                              */
/* -------------------------------------------------------------------------- */
async function setUserSession(user) {
  state.user = user || null;
  state.isAdmin = Boolean(user?.isAdmin || user?.role === 'admin');
  if (!state.user) {
    state.ownerOnly = false;
    syncOwnerFilterToggle();
    hideDashboard();
    revealLoginCard();
    return;
  }
  state.ownerOnly = state.isAdmin ? loadOwnerFilterPreference() : false;
  syncOwnerFilterToggle();
  document.dispatchEvent(new CustomEvent('voux:session-updated', { detail: { user: state.user } }));
  updateCreateCardVisibility();
  try {
    await refreshCounters(1);
    await fetchTags();
    updateAdminVisibility();
  } catch (error) {
    hideDashboard();
    revealLoginCard();
    showLoginError(error?.message || 'Session expired. Log in again.');
  }
}

function setLoginPending(pending, message) {
  if (!loginCard) return;
  loginCard.classList.toggle('login-card--pending', Boolean(pending));
  if (pending) {
    // showStatusHint(message || 'Working...');
  } else {
    showStatusHint('');
  }
}

function revealLoginCard() {
  if (!loginCard) return;
  loginCard.classList.remove('login-card--pending');
  loginCard.classList.remove('hidden');
  document.body.classList.remove('dashboard-footer-hidden');
  showStatusHint('');
}

/* -------------------------------------------------------------------------- */
/* Create helpers                                                             */
/* -------------------------------------------------------------------------- */
function showStatusHint(message) {
  if (!loginStatus) return;
  loginStatus.textContent = message || '';
  loginStatus.classList.toggle('hidden', !message);
}

function getCooldownPayload(selectEl) {
  if (!selectEl) return 'unique';
  const mode = selectEl.value === 'unlimited' ? 'unlimited' : 'unique';
  if (!isModeAllowed(mode, state.allowedModes)) {
    return getFirstAllowedMode(state.allowedModes);
  }
  return mode;
}

/* -------------------------------------------------------------------------- */
/* Bulk delete (filtered)                                                     */
/* -------------------------------------------------------------------------- */
async function handleDeleteFiltered() {
  if (state.modeFilter === 'all') return;
  const label = state.modeFilter === 'unique' ? 'unique counters' : 'every-visit counters';
  const siteUrl = window.location?.origin || window.location?.href || 'this site';
  const scopeLabel = state.isAdmin ? `all ${label}` : `your ${label}`;
  const confirmed = await showConfirm({
    title: 'Delete filtered counters?',
    message: `This will permanently remove ${scopeLabel} on: <strong style="color:#fff;">${siteUrl}</strong>. You'll confirm by typing DELETE next.`,
    allowHtml: true,
    confirmLabel: 'Continue',
    cancelLabel: 'Cancel',
    variant: 'danger'
  });
  if (!confirmed) return;
  const confirmedFinal = await showConfirmWithInput({
    title: 'Delete filtered counters?',
    message: `Type DELETE to permanently remove ${scopeLabel}.`,
    inputPlaceholder: 'DELETE',
    inputMatch: 'DELETE',
    inputHint: 'This cannot be undone.',
    promptMessage: `Type DELETE to permanently remove ${scopeLabel}.`, // fallback
    confirmLabel: 'Delete filtered',
    cancelLabel: 'Cancel',
    variant: 'danger'
  });
  if (!confirmedFinal) return;
  try {
    deleteFilteredBtn.disabled = true;
    const res = await authFetch(`/api/counters?mode=${state.modeFilter}`, {
      method: 'DELETE'
    });
    if (res.status === 401) throw new Error('Unauthorized.');
    if (!res.ok) throw new Error('Failed to delete counters');
    await refreshCounters(1);
    clearSelection();
    showToast(`Deleted ${scopeLabel}`);
  } catch (error) {
    await showAlert(normalizeAuthMessage(error, 'Failed to delete counters'));
  } finally {
    deleteFilteredBtn.disabled = false;
    updateDeleteFilteredState();
  }
}

/* -------------------------------------------------------------------------- */
/* Selection + bulk actions                                                   */
/* -------------------------------------------------------------------------- */
function toggleSelection(counterId, selected, row) {
  if (!counterId) return;
  if (selected) {
    state.selectedIds.add(counterId);
  } else {
    state.selectedIds.delete(counterId);
  }
  if (row) {
    row.classList.toggle('counter-row--selected', selected);
  }
  updateSelectionToolbar();
}

function clearSelection() {
  if (!state.selectedIds.size) {
    refreshSelectionState();
    return;
  }
  state.selectedIds.clear();
  refreshSelectionState();
}

function refreshSelectionState() {
  if (counterListEl) {
    counterListEl.querySelectorAll('.counter-row').forEach((row) => {
      const counterId = row.dataset?.counterId;
      const selected = counterId && state.selectedIds.has(counterId);
      row.classList.toggle('counter-row--selected', selected);
      const checkbox = row.querySelector('.counter-select input');
      if (checkbox) {
        // eslint-disable-next-line no-param-reassign
        checkbox.checked = Boolean(selected);
      }
    });
  }
  updateSelectionToolbar();
}

function updateSelectionToolbar() {
  const count = state.selectedIds.size;
  if (selectionCountEl) {
    selectionCountEl.textContent = `${count} selected`;
  }
  const active = count > 0;
  selectionToolbar?.classList.toggle('hidden', !active);
  document.body.classList.toggle('selection-active', active);
}

/* -------------------------------------------------------------------------- */
/* Exports + downloads                                                        */
/* -------------------------------------------------------------------------- */
async function handleDownloadSelected() {
  const ids = Array.from(state.selectedIds);
  if (!ids.length) {
    await showAlert('Select at least one counter.');
    return;
  }
  if (downloadSelectedBtn) downloadSelectedBtn.disabled = true;
  try {
    await downloadCountersByIds(ids, 'selected-counters');
  } finally {
    if (downloadSelectedBtn) downloadSelectedBtn.disabled = false;
  }
}

function updateCounterCache(counters = []) {
  if (!state.counterCache) {
    state.counterCache = new Map();
  }
  counters.forEach((counter) => {
    if (counter?.id) {
      state.counterCache.set(counter.id, counter);
    }
  });
}

async function handleAddTagsSelected() {
  const ids = Array.from(state.selectedIds);
  if (!ids.length) {
    await showAlert('Select at least one counter.');
    return;
  }
  if (!state.tags.length) {
    await showAlert('Create a tag first.');
    return;
  }
  const undoSnapshot = new Map();
  ids.forEach((id) => {
    const cached = state.counterCache?.get(id);
    if (cached) {
      undoSnapshot.set(id, extractTagIds(cached.tags));
    }
  });
  if (addTagsSelectedBtn) addTagsSelectedBtn.disabled = true;
  const selectedTags = await openBulkTagDialog(ids.length);
  if (addTagsSelectedBtn) addTagsSelectedBtn.disabled = false;
  if (!selectedTags) return;
  if (!selectedTags.length) {
    await showAlert('Pick at least one tag.');
    return;
  }
  let updated = 0;
  let skipped = 0;
  let lastError = null;
  const updatedIds = [];
  const nextTagObjects = state.tags.filter((tag) => selectedTags.includes(tag.id));
  for (const id of ids) {
    try {
      await updateCounterMetadataRequest(id, { tags: selectedTags });
      updated += 1;
      updatedIds.push(id);
      const cached = state.counterCache?.get(id);
      if (cached) {
        cached.tags = nextTagObjects.slice();
      }
    } catch (error) {
      if (error?.message === 'forbidden') {
        skipped += 1;
      } else {
        lastError = error;
      }
    }
  }
  await refreshCounters(state.page);
  if (updated) {
    const message = `Updated tags for ${updated} counter${updated === 1 ? '' : 's'}` + (skipped ? ` · ${skipped} skipped` : '');
    showActionToast(message, 'Undo', async () => {
      let reverted = 0;
      let failed = 0;
      for (const id of updatedIds) {
        const previous = undoSnapshot.get(id);
        if (!previous) {
          failed += 1;
          continue;
        }
        try {
          await updateCounterMetadataRequest(id, { tags: previous });
          reverted += 1;
          const cached = state.counterCache?.get(id);
          if (cached) {
            cached.tags = state.tags.filter((tag) => previous.includes(tag.id));
          }
        } catch (_) {
          failed += 1;
        }
      }
      await refreshCounters(state.page);
      if (reverted) {
        showToast(`Reverted tags for ${reverted} counter${reverted === 1 ? '' : 's'}`);
      }
      if (failed) {
        showToast(`Could not revert ${failed} counter${failed === 1 ? '' : 's'}`, 'danger');
      }
    });
  }
  if (lastError) {
    await showAlert(normalizeAuthMessage(lastError, 'Failed to update tags'));
  }
}

async function handleDownloadSingle(id, label, button) {
  if (!id) return;
  if (button) button.disabled = true;
  try {
    await downloadCountersByIds([id], `counter-${slugifyFilename(label || id)}`);
  } finally {
    if (button) button.disabled = false;
  }
}

async function downloadCountersByIds(ids, filenamePrefix) {
  if (!ids.length) return;
  try {
    const res = await authFetch('/api/counters/export-selected', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ids })
    });
    if (res.status === 401) {
      throw new Error('Unauthorized.');
    }
    if (res.status === 404) {
      throw new Error('Counters not found.');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to download counters');
    }
    const payload = await res.json();
    triggerJsonDownload(payload, filenamePrefix || 'counters');
    showToast(ids.length === 1 ? `Exported ${ids[0]}` : `Exported ${ids.length} counters`);
  } catch (error) {
    await showAlert(normalizeAuthMessage(error, 'Failed to download counters'));
  }
}

function triggerJsonDownload(payload, filenamePrefix) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safePrefix = slugifyFilename(filenamePrefix || 'counters');
  const link = document.createElement('a');
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `${safePrefix}-${timestamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function slugifyFilename(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'counter';
}

async function handleDeleteSelected() {
  const ids = Array.from(state.selectedIds);
  if (!ids.length) {
    await showAlert('Select at least one counter.');
    return;
  }
  const confirmed = await showConfirm({
    title: 'Delete selected counters?',
    message: `This removes ${ids.length} counter(s) permanently.`,
    confirmLabel: 'Delete',
    variant: 'danger'
  });
  if (!confirmed) return;
  if (deleteSelectedBtn) deleteSelectedBtn.disabled = true;
  try {
    const res = await authFetch('/api/counters/bulk-delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ids })
    });
    if (res.status === 401) throw new Error('Unauthorized.');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to delete counters');
    }
    const data = await res.json();
    ids.forEach((id) => state.selectedIds.delete(id));
    await refreshCounters(state.page);
    updateSelectionToolbar();
    showToast(`Deleted ${data.deleted ?? ids.length} counters`);
  } catch (error) {
    await showAlert(normalizeAuthMessage(error, 'Failed to delete counters'));
  } finally {
    if (deleteSelectedBtn) deleteSelectedBtn.disabled = false;
  }
}

/* -------------------------------------------------------------------------- */
/* Pagination hotkeys                                                         */
/* -------------------------------------------------------------------------- */
function handleSelectAll() {
  const ids = state.latestCounters.map((counter) => counter.id);
  const allSelected = ids.every((id) => state.selectedIds.has(id));
  if (allSelected) {
    ids.forEach((id) => state.selectedIds.delete(id));
  } else {
    ids.forEach((id) => state.selectedIds.add(id));
  }
  refreshSelectionState();
}

function handlePaginationHotkeys(event) {
  const { activeElement } = document;
  if (activeElement) {
    const tag = activeElement.tagName;
    const type = (activeElement.getAttribute('type') || '').toLowerCase();
    const isTextInput =
      tag === 'TEXTAREA' || (tag === 'INPUT' && ['text', 'search', 'password', 'email', 'url', 'number'].includes(type));
    if (isTextInput) return;
  }
  const keepScroll = () => {
    const top = window.scrollY;
    requestAnimationFrame(() => window.scrollTo({ top, left: 0, behavior: 'auto' }));
  };
  // arrow left previous page
  if (event.key === 'ArrowLeft' && !prevPageBtn?.disabled) {
    event.preventDefault();
    handlePageNavigation(Math.max(1, state.page - 1), { skipScroll: true });
    keepScroll();
  }
  // arrow right next page
  if (event.key === 'ArrowRight' && !nextPageBtn?.disabled) {
    event.preventDefault();
    handlePageNavigation(Math.min(state.totalPages, state.page + 1), { skipScroll: true });
    keepScroll();
  }
  // shift + a select all 
  if (event.shiftKey && (event.key === 'A' || event.key === 'a')) {
    event.preventDefault();
    handleSelectAll();
  }
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */
function formatNumber(value) {
  if (value === null || value === undefined) return '0';
  if (typeof value === 'bigint') {
    return value.toLocaleString();
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    try {
      return BigInt(value).toLocaleString();
    } catch (_) {
      // fall through
    }
  }
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
  const monthWindow = 30 * day;
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
  if (seconds < day * 30) {
    const days = Math.floor(seconds / day);
    return `${days}d ago`;
  }
  return new Date(timestamp).toLocaleDateString();
}

/* -------------------------------------------------------------------------- */
/* Pagination navigation                                                      */
/* -------------------------------------------------------------------------- */
async function handlePageNavigation(nextPage, options = {}) {
  try {
    await refreshCounters(nextPage);
    if (!options.skipScroll) {
      ensurePaginationInView();
    }
  } catch (error) {
    console.warn('Page change failed', error);
  }
}

function ensurePaginationInView() {
  if (!paginationEl) return;
  const rect = paginationEl.getBoundingClientRect();
  const inView = rect.top >= 0 && rect.bottom <= window.innerHeight;
  if (!inView) {
    paginationEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

/* -------------------------------------------------------------------------- */
/* Query helpers                                                              */
/* -------------------------------------------------------------------------- */
function truncateQuery(query) {
  if (!query) return '';
  return query.length > 32 ? `${query.slice(0, 32)}…` : query;
}

function extractTagIds(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) => {
      if (!tag) return '';
      if (typeof tag === 'string') return tag;
      if (typeof tag.id === 'string') return tag.id;
      return '';
    })
    .filter(Boolean);
}

/* -------------------------------------------------------------------------- */
/* Counter updates                                                            */
/* -------------------------------------------------------------------------- */
async function updateCounterMetadataRequest(id, payload) {
  const res = await authFetch(`/api/counters/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (res.status === 401) throw new Error('Unauthorized.');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update counter');
  }
  return res.json().catch(() => ({}));
}

/* -------------------------------------------------------------------------- */
/* Clipboard helpers                                                          */
/* -------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------- */
/* Create card UI                                                             */
/* -------------------------------------------------------------------------- */
function updateCreateCardVisibility() {
  if (!createCard) return;
  const canCreate = !state.privateMode || state.isAdmin;
  if (canCreate) {
    createCard.classList.remove('hidden');
  } else {
    createCard.classList.add('hidden');
    adminEmbedBlock?.classList.add('hidden');
    if (adminEmbedSnippet) adminEmbedSnippet.value = '';
  }
}

/* -------------------------------------------------------------------------- */
/* Admin embed copy                                                           */
/* -------------------------------------------------------------------------- */
function handleAdminEmbedCopy() {
  const text = adminEmbedSnippet?.value || '';
  if (!text || !adminEmbedCopy) return;
  if (adminEmbedCopy._copying) return;
  adminEmbedCopy._copying = true;
  navigator.clipboard.writeText(text).then(() => {
    const original = adminEmbedCopy.dataset.originalIcon || adminEmbedCopy.innerHTML;
    adminEmbedCopy.dataset.originalIcon = original;
    adminEmbedCopy.classList.add('copied');
    adminEmbedCopy.innerHTML = '<i class="ri-check-line"></i>';
    if (adminEmbedCopy._copyTimeout) {
      clearTimeout(adminEmbedCopy._copyTimeout);
    }
    adminEmbedCopy._copyTimeout = setTimeout(() => {
      adminEmbedCopy.classList.remove('copied');
      adminEmbedCopy.innerHTML = adminEmbedCopy.dataset.originalIcon || original;
      adminEmbedCopy._copying = false;
    }, 1400);
  }).catch(() => {
    adminEmbedCopy._copying = false;
  });
}

/* -------------------------------------------------------------------------- */
/* Admin UI state                                                             */
/* -------------------------------------------------------------------------- */
function updateDeleteFilteredState() {
  if (modeFilterSelect) {
    modeFilterSelect.value = state.modeFilter;
  }
  if (sortFilterSelect) {
    sortFilterSelect.value = state.sort || 'newest';
  }
  const isGlobal = state.modeFilter === 'all';
  if (deleteFilteredBtn) {
    deleteFilteredBtn.disabled = isGlobal;
    deleteFilteredBtn.classList.toggle('hidden', isGlobal);
  }
  if (deleteAllBtn) {
    deleteAllBtn.classList.toggle('hidden', !isGlobal);
    deleteAllBtn.disabled = !isGlobal;
  }
}

function updateAdminVisibility() {
  const isAdmin = state.isAdmin;
  const hasUser = Boolean(state.user);
  tagFilterCreateBtn?.classList.toggle('hidden', !hasUser);
  createTagManageBtn?.classList.toggle('hidden', !hasUser);
  if (!isAdmin) {
    state.ownerOnly = false;
  }
  ownerFilterWrap?.classList.toggle('hidden', !isAdmin);
  syncOwnerFilterToggle();
  updateDeleteFilteredState();
}

/* -------------------------------------------------------------------------- */
/* Activity range                                                             */
/* -------------------------------------------------------------------------- */
function updateActivityRangeButtons() {
  if (!activityRangeControls) return;
  const buttons = activityRangeControls.querySelectorAll('button[data-range]');
  buttons.forEach((button) => {
    const isActive = button.dataset.range === state.activityRange;
    button.classList.toggle('activity-range__button--active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

/* -------------------------------------------------------------------------- */
/* Tags                                                                       */
/* -------------------------------------------------------------------------- */
async function fetchTags() {
  if (!state.user) return;
  try {
    const res = await authFetch('/api/tags');
    if (res.status === 401) {
      throw new Error('Unauthorized.');
    }
    if (!res.ok) {
      throw new Error('Failed to load tags');
    }
    const payload = await res.json().catch(() => ({}));
    const tags = Array.isArray(payload.tags) ? payload.tags : [];
    state.tags = tags;
    state.tagFilter = state.tagFilter.filter((id) => tags.some((tag) => tag.id === id));
    state.createTags = state.createTags.filter((id) => tags.some((tag) => tag.id === id));
    refreshTagSelectors();
    renderTagFilterList();
    updateTagCounterHints();
    updateTagFilterButton();
  } catch (error) {
    console.warn('Failed to fetch tags', error);
  }
}

function renderTagFilterList() {
  if (!tagFilterList) return;
  tagFilterList.innerHTML = '';
  if (!state.tags.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'No tags yet. Create one to filter counters.';
    tagFilterList.appendChild(empty);
    return;
  }
  state.tags.forEach((tag) => {
    const item = document.createElement('label');
    item.className = 'tag-filter__item';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = state.tagFilter.includes(tag.id);
    input.addEventListener('change', () => {
      const next = input.checked
        ? [...state.tagFilter, tag.id]
        : state.tagFilter.filter((value) => value !== tag.id);
      setTagFilter(next);
    });
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    applyTagStyles(chip, tag.color, { textContrast: false });
    const chipLabel = document.createElement('span');
    chipLabel.className = 'tag-chip__label';
    chipLabel.textContent = tag.name || tag.id;
    chip.appendChild(chipLabel);
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'tag-chip__edit';
    editBtn.setAttribute('aria-label', `Edit ${tag.name || tag.id}`);
    editBtn.innerHTML = '<i class="ri-edit-2-line"></i>';
    editBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openTagEditDialog(tag);
    });
    chip.appendChild(editBtn);
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'tag-chip__remove';
    removeBtn.setAttribute('aria-label', `Delete ${tag.name || tag.id}`);
    removeBtn.innerHTML = '<i class="ri-close-line"></i>';
    removeBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      confirmTagDeletion(tag);
    });
    chip.appendChild(removeBtn);
    chip.addEventListener('contextmenu', (event) => handleTagContextMenu(event, tag));
    item.append(input, chip);
    tagFilterList.appendChild(item);
  });
}

/* -------------------------------------------------------------------------- */
/* Tag filter menu                                                            */
/* -------------------------------------------------------------------------- */
function updateTagFilterButton() {
  if (tagFilterButton) {
    const count = state.tagFilter.length;
    tagFilterButton.innerHTML = `<i class="ri-price-tag-3-line"></i> ${count ? `Filter (${count})` : 'Filter'}`;
  }
  if (clearTagFilterBtn) {
    clearTagFilterBtn.disabled = state.tagFilter.length === 0;
  }
}

function handleTagFilterToggle(event) {
  event?.preventDefault();
  event?.stopPropagation();
  toggleTagFilterMenu(!tagFilterMenuOpen);
}

function toggleTagFilterMenu(force) {
  if (!tagFilterMenu) return;
  const next = typeof force === 'boolean' ? force : !tagFilterMenuOpen;
  tagFilterMenuOpen = next;
  tagFilterMenu.classList.toggle('hidden', !next);
}

function closeTagFilterMenu() {
  toggleTagFilterMenu(false);
}

function handleTagFilterLabelClick(event) {
  event?.preventDefault();
  event?.stopPropagation();
  closeTagFilterMenu();
}

function handleDocumentClick(event) {
  if (!tagFilterMenuOpen) return;
  if (!tagFilterControls) return;
  if (event.target.closest('.modal') || event.target.closest('.modal-overlay')) {
    return;
  }
  if (!tagFilterControls.contains(event.target)) {
    closeTagFilterMenu();
  }
}

function handleGlobalKeydown(event) {
  if (event.key === 'Escape' && tagFilterMenuOpen) {
    closeTagFilterMenu();
  }
}

function clearTagFilterSelection(event) {
  event?.preventDefault();
  if (!state.tagFilter.length) return;
  setTagFilter([]);
  closeTagFilterMenu();
}

function updateTagCounterHints() {
  const count = Math.max(0, Array.isArray(state.tags) ? state.tags.length : 0);
  if (createTagCounterHint) {
    createTagCounterHint.textContent = `${count.toLocaleString()} / ${TAG_LIMIT}`;
  }
  if (tagFilterCountHint) {
    const text = `${count.toLocaleString()} / ${TAG_LIMIT.toLocaleString()}`;
    tagFilterCountHint.textContent = text;
  }
}

function setTagFilter(ids) {
  const normalized = Array.isArray(ids)
    ? ids
        .map((id) => String(id || '').trim())
        .filter((id, index, arr) => id && arr.indexOf(id) === index && state.tags.some((tag) => tag.id === id))
    : [];
  const changed =
    normalized.length !== state.tagFilter.length ||
    normalized.some((id, idx) => id !== state.tagFilter[idx]);
  state.tagFilter = normalized;
  updateTagFilterButton();
  renderTagFilterList();
  updateTagCounterHints();
  if (changed) {
    refreshCounters(1).catch((err) => console.warn('Failed to refresh counters', err));
  }
}

/* -------------------------------------------------------------------------- */
/* Tag CRUD                                                                   */
/* -------------------------------------------------------------------------- */
async function handleTagCreate(context) {
  if (state.tags.length >= TAG_LIMIT) {
    await showAlert(`You can only create up to ${TAG_LIMIT} tags. Delete an existing tag first.`, {
      title: 'Tag limit reached'
    });
    return;
  }
  if (context !== 'filter') {
    closeTagFilterMenu();
  }
  const result = await openTagDialog(state.tags.length, state.totalOverall || state.total || 0);
  if (!result || !result.name) return;
  let createdTagId = null;
  let createdTagName = result.name;
  try {
    const res = await authFetch('/api/tags', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(result)
    });
    const payload = await res.json().catch(() => ({}));
    if (res.status === 401) {
      throw new Error('Unauthorized.');
    }
    if (!res.ok) {
      throw new Error(payload.error || 'Failed to create tag');
    }
    createdTagId = payload?.tag?.id || null;
    createdTagName = payload?.tag?.name || createdTagName;
    await fetchTags();
    if (context === 'create' && createdTagId && !state.createTags.includes(createdTagId)) {
      state.createTags = [...state.createTags, createdTagId];
      refreshTagSelectors();
    }
    showToast(`Created tag "${createdTagName}"`);
  } catch (error) {
    await showAlert(normalizeAuthMessage(error, 'Failed to create tag'));
  }
}

function handleTagContextMenu(event, tag) {
  if (!tag || !tag.id) return;
  event.preventDefault();
  event.stopPropagation();
  confirmTagDeletion(tag);
}

async function openTagEditDialog(tag) {
  const result = await openTagDialog(state.tags.length, state.totalOverall || state.total || 0, {
    id: tag?.id,
    name: tag?.name,
    color: tag?.color
  });
  if (!result || !result.name) return;
  try {
    const res = await authFetch(`/api/tags/${tag.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: result.name,
        color: result.color
      })
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload.error || 'Failed to update tag');
    }
    await fetchTags();
    refreshTagSelectors();
    showToast(`Updated tag "${result.name}"`);
  } catch (error) {
    await showAlert(normalizeAuthMessage(error, 'Failed to update tag'));
  }
}

async function confirmTagDeletion(tag) {
  const name = tag.name || tag.id;
  const confirmed = await showConfirm({
    title: 'Delete tag?',
    message: `"${name}" will be removed from all filters and counters.`,
    confirmLabel: 'Delete tag',
    variant: 'danger'
  });
  if (!confirmed) return;
  await deleteTagRequest(tag.id, name);
  updateTagCounterHints();
}

async function deleteTagRequest(tagId, name) {
  try {
    const res = await authFetch(`/api/tags/${encodeURIComponent(tagId)}`, {
      method: 'DELETE'
    });
    if (res.status === 401) throw new Error('Unauthorized.');
    if (res.status === 404) throw new Error('Tag not found.');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to delete tag');
    }
    await fetchTags();
    await refreshCounters(state.page, { silent: true });
    updateTagCounterHints();
    showToast(`Deleted tag "${name || tagId}"`);
  } catch (error) {
    await showAlert(normalizeAuthMessage(error, 'Failed to delete tag'));
  }
}

/* -------------------------------------------------------------------------- */
/* Tag selectors                                                              */
/* -------------------------------------------------------------------------- */
function registerTagSelector(container, config = {}) {
  if (!container) return null;
  const entry = {
    container,
    getSelected: config.getSelected || (() => []),
    setSelected: config.setSelected || (() => {}),
    emptyMessage: config.emptyMessage || 'No tags yet.'
  };
  tagSelectorRegistry.add(entry);
  renderTagSelectorEntry(entry);
  return entry;
}

function renderTagSelectorEntry(entry) {
  if (!entry || !entry.container) return;
  const container = entry.container;
  container.innerHTML = '';
  if (!state.tags.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = entry.emptyMessage || 'No tags yet.';
    container.appendChild(empty);
    return;
  }
  const list = document.createElement('div');
  list.className = 'tag-picker__list';
  const selected = entry.getSelected ? entry.getSelected() : [];
  state.tags.forEach((tag) => {
    const pill = document.createElement('button');
    pill.type = 'button';
    const isSelected = Array.isArray(selected) && selected.includes(tag.id);
    pill.className = `tag-pill${isSelected ? ' tag-pill--selected' : ''}`;
    applyTagStyles(pill, tag.color);
    const pillLabel = document.createElement('span');
    pillLabel.className = 'tag-chip__label';
    pillLabel.textContent = tag.name || tag.id;
    pill.appendChild(pillLabel);
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'tag-chip__edit';
    editBtn.setAttribute('aria-label', `Edit ${tag.name || tag.id}`);
    editBtn.innerHTML = '<i class="ri-edit-2-line"></i>';
    editBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openTagEditDialog(tag);
    });
    pill.appendChild(editBtn);
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'tag-chip__remove';
    removeBtn.setAttribute('aria-label', `Delete ${tag.name || tag.id}`);
    removeBtn.innerHTML = '<i class="ri-close-line"></i>';
    removeBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      confirmTagDeletion(tag);
    });
    pill.appendChild(removeBtn);
    pill.addEventListener('contextmenu', (event) => handleTagContextMenu(event, tag));
    pill.addEventListener('click', () => {
      const next = toggleTagSelection(selected, tag.id);
      entry.setSelected?.(next);
      renderTagSelectorEntry(entry);
    });
    list.appendChild(pill);
  });
  container.appendChild(list);
}

function refreshTagSelectorEntry(entry) {
  if (!entry || !entry.container) return;
  if (!entry.container.isConnected) {
    tagSelectorRegistry.delete(entry);
    return;
  }
  renderTagSelectorEntry(entry);
}

function refreshTagSelectors() {
  cleanupTagSelectors();
  tagSelectorRegistry.forEach((entry) => {
    renderTagSelectorEntry(entry);
  });
}

function cleanupTagSelectors() {
  tagSelectorRegistry.forEach((entry) => {
    if (!entry.container || !entry.container.isConnected) {
      tagSelectorRegistry.delete(entry);
    }
  });
}

function toggleTagSelection(selected, tagId) {
  const current = Array.isArray(selected) ? [...selected] : [];
  if (!tagId) return current;
  if (current.includes(tagId)) {
    return current.filter((id) => id !== tagId);
  }
  return [...current, tagId];
}

/* -------------------------------------------------------------------------- */
/* Tag dialog                                                                 */
/* -------------------------------------------------------------------------- */
function openTagDialog(existingCount = 0, counterTotal = 0, defaults = {}) {
  return new Promise((resolve) => {
    const isEdit = Boolean(defaults && defaults.id);
    const defaultName = (defaults && defaults.name) || '';
    const defaultColor = normalizeHexColor(defaults && defaults.color) || '#4c6ef5';

    const overlay = document.createElement('div');
    overlay.classList.add('modal-overlay', 'tag-dialog-overlay');
    const dialog = document.createElement('div');
    dialog.className = 'modal tag-dialog';

    const title = document.createElement('h3');
    title.className = 'tag-dialog__title';
    title.textContent = isEdit ? 'Edit tag' : 'New tag';
    const limitHint = document.createElement('p');
    limitHint.className = 'tag-dialog__hint';
    if (isEdit) {
      limitHint.textContent = 'Update the tag name or color.';
    } else {
      const remaining = Math.max(0, TAG_LIMIT - existingCount);
      limitHint.textContent = `You can create up to ${TAG_LIMIT} tags. ${remaining} left.`;
    }
  

    const nameField = document.createElement('div');
    nameField.className = 'tag-dialog__field';
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Name';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.maxLength = 40;
    nameInput.placeholder = 'Blog posts';
    nameInput.value = defaultName;
    nameField.append(nameLabel, nameInput);


/* Pickr library. some js i added */     
  const colorField = document.createElement('div');
  colorField.className = 'tag-dialog__field';
  const colorLabel = document.createElement('label');
  colorLabel.textContent = 'Color';
  const colorInput = document.createElement('input');
  colorInput.type = 'hidden';
  colorInput.value = defaultColor;
  const colorPickerRow = document.createElement('div');
  colorPickerRow.className = 'tag-dialog__color-row';
  const colorSwatch = document.createElement('button');
  colorSwatch.type = 'button';
  colorSwatch.className = 'tag-dialog__color-swatch';
  colorSwatch.setAttribute('aria-label', 'Pick a color');
  const colorValue = document.createElement('span');
  colorValue.className = 'tag-dialog__color-value';
  colorPickerRow.append(colorSwatch, colorValue);
  colorField.append(colorLabel, colorPickerRow, colorInput);
  let pickrInstance = null;

  const updateColor = (hex) => {
    if (!hex) return;
    colorInput.value = hex;
    colorSwatch.style.background = hex;
    colorValue.textContent = hex.toUpperCase();
  };

  const blurHandlers = () => {
    // prevent immediate hide when clicking current color
    if (pickrInstance && pickrInstance.hide) {
      pickrInstance.hide();
    }
  };

  const initialColor = colorInput.value;
  updateColor(colorInput.value);

  ensurePickrLoaded()
    .then(() => {
      if (!window.Pickr || typeof window.Pickr.create !== 'function') return;
      pickrInstance = window.Pickr.create({
        el: colorSwatch,
        theme: 'monolith',
        useAsButton: true,
        default: colorInput.value,
        components: {
          preview: true,
          opacity: false,
          hue: true,
          interaction: {
            input: true,
            save: true,
            cancel: true,
            clear: false
          }
        }
      });

      const root = pickrInstance?.getRoot?.();
      if (root?.app) {
        ['mousedown', 'click'].forEach((evt) => {
          root.app.addEventListener(evt, (e) => e.stopPropagation());
        });
        const lastColor = root.app.querySelector('.pcr-last-color');
        if (lastColor) {
          lastColor.addEventListener('click', (e) => {
            e.stopPropagation();
            pickrInstance.show();
          });
        }
      }

      pickrInstance.on('change', (color) => {
        const hex = color?.toHEXA?.()?.toString();
        if (hex) updateColor(hex);
      });
      pickrInstance.on('save', (color) => {
        const hex = color?.toHEXA?.()?.toString();
        if (hex) updateColor(hex);
        pickrInstance.hide();
      });
      pickrInstance.on('cancel', () => {
        updateColor(initialColor);
        if (pickrInstance && typeof pickrInstance.setColor === 'function') {
          pickrInstance.setColor(initialColor, true);
        }
        pickrInstance.hide();
      });
      // avoid closing when clicking preview; leave open for double-click
      pickrInstance.on('swatchselect', (color) => {
        const hex = color?.toHEXA?.()?.toString();
        if (hex) updateColor(hex);
      });
    })
    .catch(() => {
      // fallback to native color input if Pickr fails to load
      colorSwatch.addEventListener('click', () => {
        const tempInput = document.createElement('input');
        tempInput.type = 'color';
        tempInput.value = colorInput.value || '#4c6ef5';
        tempInput.addEventListener('change', () => {
          updateColor(tempInput.value);
        });
        tempInput.click();
      });
    });

    const actions = document.createElement('div');
    actions.className = 'tag-dialog__actions';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'savebtn';
    saveBtn.textContent = 'Save';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'ghost';
    cancelBtn.textContent = 'Close';
    actions.append(saveBtn, cancelBtn);

    dialog.append(title);
    dialog.append(limitHint);
    dialog.append(nameField);
    dialog.append(colorField);
    dialog.append(actions);

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      overlay.classList.add('modal-overlay--open');
    });
    document.body.classList.add('modal-open');
    nameInput.focus();

    function cleanup(result) {
      document.body.classList.remove('modal-open');
      overlay.classList.remove('modal-overlay--open');
      const removeOverlay = () => {
        overlay.removeEventListener('transitionend', removeOverlay);
        overlay.remove();
      };
      overlay.addEventListener('transitionend', removeOverlay);
      setTimeout(removeOverlay, 250);
      document.removeEventListener('keydown', onKeyDown);
      if (pickrInstance && pickrInstance.destroyAndRemove) {
        pickrInstance.destroyAndRemove();
      }
      resolve(result);
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        cleanup(null);
      }
      if (event.key === 'Enter' && event.target === nameInput) {
        event.preventDefault();
        submit();
      }
    }

    function submit() {
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.classList.add('input-error');
        nameInput.focus();
        return;
      }
      const color = colorInput.value || '#4c6ef5';
      cleanup({ name, color });
    }

    nameInput.addEventListener('input', () => {
      nameInput.classList.remove('input-error');
    });
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        cleanup(null);
      }
    });
    cancelBtn.addEventListener('click', () => cleanup(null));
    saveBtn.addEventListener('click', submit);
    document.addEventListener('keydown', onKeyDown);
  });
}

function openBulkTagDialog(selectedCount = 0) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.classList.add('modal-overlay', 'modal-overlay--open', 'tag-dialog-overlay');
    const dialog = document.createElement('div');
    dialog.className = 'tag-dialog';
    dialog.tabIndex = -1;

    const title = document.createElement('h3');
    title.className = 'tag-dialog__title';
    title.textContent = 'Add tags';

    const hint = document.createElement('p');
    hint.className = 'tag-dialog__hint';
    hint.textContent = `Apply tags to ${selectedCount} selected counters (replaces existing tags).`;

    const tagsField = document.createElement('div');
    tagsField.className = 'tag-dialog__field';
    const tagsLabel = document.createElement('label');
    tagsLabel.textContent = 'Tags';
    const tagsPicker = document.createElement('div');
    tagsPicker.className = 'tag-picker';
    tagsField.append(tagsLabel, tagsPicker);

    let selectedTags = [];
    const selectorEntry = registerTagSelector(tagsPicker, {
      getSelected: () => selectedTags.slice(),
      setSelected: (next) => {
        selectedTags = next;
      },
      emptyMessage: 'No tags yet. Use "New tag" to create one.'
    });
    renderTagSelectorEntry(selectorEntry);

    const actions = document.createElement('div');
    actions.className = 'tag-dialog__actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'ghost';
    cancelBtn.textContent = 'Cancel';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'savebtn';
    saveBtn.textContent = 'Apply tags';
    actions.append(cancelBtn, saveBtn);

    const closeDialog = () => {
      document.body.classList.remove('modal-open');
      overlay.remove();
      resolve(null);
    };

    cancelBtn.addEventListener('click', closeDialog);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeDialog();
    });
    saveBtn.addEventListener('click', () => {
      document.body.classList.remove('modal-open');
      overlay.remove();
      resolve(selectedTags.slice());
    });
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDialog();
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        saveBtn.click();
      }
    });

    dialog.append(title, hint, tagsField, actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    document.body.classList.add('modal-open');
    dialog.focus();
  });
}

/* -------------------------------------------------------------------------- */
/* Tag styling                                                                */
/* -------------------------------------------------------------------------- */
function applyTagStyles(element, color, options = {}) {
  if (!element) return;
  const normalized = normalizeHexColor(color) || '#4c6ef5';
  element.style.setProperty('--tag-color', normalized);
  const shouldApplyText = options.textContrast !== false;
  if (shouldApplyText) {
    element.style.setProperty('--tag-text-color', getTagContrastColor(normalized));
  } else {
    element.style.removeProperty('--tag-text-color');
  }
}

function normalizeHexColor(color) {
  if (typeof color !== 'string') return null;
  const value = color.trim();
  const withHash = value.startsWith('#') ? value : `#${value}`;
  if (/^#[0-9a-fA-F]{6}$/.test(withHash)) return withHash.toLowerCase();
  return null;
}

function getTagContrastColor(hex) {
  if (!hex) return '#ffffff';
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  if ([r, g, b].some((channel) => Number.isNaN(channel))) {
    return '#ffffff';
  }
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.65 ? '#0b0f19' : '#ffffff';
}

/* -------------------------------------------------------------------------- */
/* Admin mode controls                                                        */
/* -------------------------------------------------------------------------- */
function refreshAdminModeControls() {
  if (!adminCooldownSelect) return;
  applyAllowedModesToSelect(adminCooldownSelect, state.allowedModes);
}

function renderAdminThrottleHint() {
  if (!adminThrottleHint) return;
  if (!state.allowedModes.unlimited || state.throttleSeconds <= 0) {
    adminThrottleHint.classList.add('hidden');
    adminThrottleHint.textContent = '';
    return;
  }
  adminThrottleHint.textContent = `Every visit mode counts at most once per visitor every ${state.throttleSeconds} seconds.`;
  adminThrottleHint.classList.remove('hidden');
}

/* -------------------------------------------------------------------------- */
/* UI builders                                                                */
/* -------------------------------------------------------------------------- */
function buildEditField(labelText, control, options = {}) {
  const wrapper = document.createElement('label');
  wrapper.className = 'counter-edit__field';
  const title = document.createElement('span');
  title.className = 'counter-edit__field-label';
  if (options.allowHtml) {
    title.innerHTML = labelText;
  } else {
    title.textContent = labelText;
  }
  wrapper.append(title, control);
  return wrapper;
}

function buildStatusBadges(counter, options = {}) {
  if (!counter) return null;
  const { forceInactive = false } = options;
  const info = counter.inactive || {};
  const isInactive = forceInactive || info.isInactive;
  const badges = [];
  if (isInactive) {
    const badge = document.createElement('span');
    badge.className = 'counter-status__badge counter-status__badge--inactive';
    badge.textContent = forceInactive ? 'Inactive (preview)' : info.label || 'Inactive';
    badges.push(badge);
  }
  if (!badges.length) return null;
  const wrapper = document.createElement('div');
  wrapper.className = 'counter-status';
  badges.forEach((badge) => wrapper.appendChild(badge));
  return wrapper;
}

function buildTagBadges(tags) {
  if (!Array.isArray(tags) || !tags.length) return null;
  const wrapper = document.createElement('div');
  wrapper.className = 'counter-tags';
  tags.forEach((tag) => {
    if (!tag) return;
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    const tagId = typeof tag === 'string' ? tag : tag.id;
    if (tagId) {
      chip.dataset.tagId = tagId;
    }
    applyTagStyles(chip, tag.color, { textContrast: false });
    const chipLabel = document.createElement('span');
    chipLabel.className = 'tag-chip__label';
    chipLabel.textContent = tag.name || tag.id;
    chip.appendChild(chipLabel);
    wrapper.appendChild(chip);
  });
  return wrapper;
}

/* -------------------------------------------------------------------------- */
/* Activity widgets                                                           */
/* -------------------------------------------------------------------------- */
function buildActivityBlock(activity) {
  if (!activity || !Array.isArray(activity.trend) || activity.trend.length === 0) {
    return null;
  }
  const wrapper = document.createElement('div');
  wrapper.className = 'counter-activity';
  const activityState = {
    bars: [],
    tooltip: null,
    activeBar: null
  };
  wrapper._activityState = activityState;
  const label = document.createElement('p');
  label.className = 'counter-activity__label';
  label.textContent = 'Weekly activity';
  const bars = document.createElement('div');
  bars.className = 'activity-bars';
  const maxHits = Math.max(1, Number(activity.maxHits) || 0);
  const tooltip = document.createElement('div');
  tooltip.className = 'activity-tooltip';
  let tooltipAnchor = null;
  let hideTimeout = null;
  activityState.tooltip = tooltip;

  const showTooltip = (bar) => {
    if (!bar || !bar._tooltipData) return;
    const info = bar._tooltipData;
    tooltip.textContent = `${info.label || 'Day'}: ${formatNumber(info.hits)} hits`;
    const trackRect = bar.getBoundingClientRect();
    const parentRect = wrapper.getBoundingClientRect();
    const center = trackRect.left - parentRect.left + trackRect.width / 2;
    tooltip.style.left = `${center}px`;
    tooltip.classList.add('activity-tooltip--visible');
    tooltipAnchor = bar;
    activityState.activeBar = bar;
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
  };

  const scheduleHide = () => {
    if (hideTimeout) return;
    hideTimeout = setTimeout(() => {
      tooltip.classList.remove('activity-tooltip--visible');
      tooltipAnchor = null;
      activityState.activeBar = null;
      hideTimeout = null;
    }, 250);
  };

  const cancelHide = () => {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
  };

  wrapper.addEventListener('mouseleave', scheduleHide);
  wrapper.addEventListener('focusout', scheduleHide);
  tooltip.addEventListener('mouseenter', cancelHide);
  tooltip.addEventListener('mouseleave', scheduleHide);

  activity.trend.forEach((day) => {
    const bar = document.createElement('div');
    bar.className = 'activity-bar';
    const track = document.createElement('span');
    track.className = 'activity-bar__track';
    const fill = document.createElement('span');
    fill.className = 'activity-bar__fill';
    const ratio = maxHits > 0 ? day.hits / maxHits : 0;
    if (ratio > 0) {
      fill.style.height = `${Math.max(12, ratio * 100)}%`;
      fill.dataset.level = resolveActivityLevel(day.hits, ratio);
    } else {
      fill.style.height = '4px';
      fill.classList.add('activity-bar__fill--empty');
      fill.dataset.level = 'low';
    }
    track.appendChild(fill);
    const dayLabel = document.createElement('span');
    dayLabel.className = 'activity-bar__label';
    dayLabel.textContent = day.label || '';
    bar.tabIndex = 0;
    bar.setAttribute('role', 'button');
    bar.setAttribute('aria-label', `${day.label || 'Day'} has ${formatNumber(day.hits)} hits`);
    bar._tooltipData = { label: day.label, hits: day.hits };
    const handleEnter = () => {
      if (tooltipAnchor === bar) {
        cancelHide();
        return;
      }
      cancelHide();
      showTooltip(bar);
    };
    const handleLeave = () => {
      if (tooltipAnchor === bar) {
        scheduleHide();
      }
    };
    track.addEventListener('mouseenter', handleEnter);
    track.addEventListener('mouseleave', handleLeave);
    track.addEventListener('click', handleEnter);
    bar.addEventListener('focus', handleEnter);
    bar.addEventListener('blur', handleLeave);
    bar.append(track, dayLabel);
    bars.appendChild(bar);
    activityState.bars.push(bar);
  });
  wrapper.append(label, bars, tooltip);
  return wrapper;
}

function updateActivityBlockData(activityEl, activity) {
  if (!activityEl || !activity || !Array.isArray(activity.trend)) return;
  const state = activityEl._activityState;
  if (!state || !Array.isArray(state.bars)) return;
  const bars = state.bars;
  if (!bars.length) return;
  const trend = activity.trend;
  const maxHits = Math.max(1, Number(activity.maxHits) || 0);
  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i];
    const day = trend[i];
    if (!bar || !day) continue;
    bar._tooltipData = { label: day.label, hits: day.hits };
    const track = bar.querySelector('.activity-bar__track');
    const fill = track?.querySelector('.activity-bar__fill');
    const ratio = maxHits > 0 ? day.hits / maxHits : 0;
    if (fill) {
      if (ratio > 0) {
        fill.style.height = `${Math.max(12, ratio * 100)}%`;
        fill.dataset.level = resolveActivityLevel(day.hits, ratio);
        fill.classList.remove('activity-bar__fill--empty');
      } else {
        fill.style.height = '4px';
        fill.classList.add('activity-bar__fill--empty');
        fill.dataset.level = 'low';
      }
    }
    const labelEl = bar.querySelector('.activity-bar__label');
    if (labelEl) {
      labelEl.textContent = day.label || '';
    }
    bar.setAttribute('aria-label', `${day.label || 'Day'} has ${formatNumber(day.hits)} hits`);
  }
  if (state.tooltip && state.activeBar && state.activeBar._tooltipData) {
    if (state.tooltip.classList.contains('activity-tooltip--visible')) {
      const info = state.activeBar._tooltipData;
      state.tooltip.textContent = `${info.label || 'Day'}: ${formatNumber(info.hits)} hits`;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Patch updates                                                              */
/* -------------------------------------------------------------------------- */
function canPatchCounters(previous = [], next = []) {
  if (!counterListEl) return false;
  if (!Array.isArray(previous) || !Array.isArray(next)) return false;
  if (previous.length !== next.length) return false;
  for (let i = 0; i < next.length; i += 1) {
    if (!previous[i] || previous[i].id !== next[i].id) {
      return false;
    }
  }
  return true;
}

function patchCounterRows(counters = []) {
  if (!counterListEl) return false;
  for (let i = 0; i < counters.length; i += 1) {
    const counter = counters[i];
    const row = counterListEl.querySelector(`.counter-row[data-counter-id="${counter.id}"]`);
    if (!row) {
      return false;
    }
    updateCounterRow(row, counter);
  }
  return true;
}

function updateCounterRow(row, counter) {
  const meta = row.querySelector('.counter-meta');
  if (!meta) return;
  const labelEl = row.querySelector('.counter-meta__label');
  if (labelEl) {
    labelEl.textContent = counter.label || '';
  }
  const valueBadge = row.querySelector('.counter-meta__value .badge');
  if (valueBadge) {
    valueBadge.textContent = formatNumber(counter.value);
  }
  const modeEl = row.querySelector('.counter-meta__mode');
  if (modeEl) {
    const labelText = counter.cooldownLabel || 'Unique visitors';
    modeEl.innerHTML = `<i class="ri-timer-2-line" aria-hidden="true"></i> Mode: ${labelText}`;
  }
  const statEls = row.querySelectorAll('.counter-meta__stat');
  const lastHitStat = statEls[0];
  if (lastHitStat) {
    const valueEl = lastHitStat.querySelector('.counter-meta__stat-value');
    if (valueEl) {
      valueEl.textContent = formatLastHit(counter.lastHit);
    }
  }
  const rangeStat = statEls[1];
  if (rangeStat) {
    const labelSpan = rangeStat.querySelector('.counter-meta__stat-label');
    if (labelSpan) {
      labelSpan.textContent = getRangeStatLabel();
    }
    const valueSpan = rangeStat.querySelector('.counter-meta__stat-value');
    if (valueSpan) {
      valueSpan.textContent = formatNumber(getRangeStatValue(counter));
    }
  }
  updateTagsSection(row, counter);
  updateStatusSection(row, counter);
  updateNoteSection(row, counter);
  updateActivitySection(row, counter);
  updateEditDefaults(row, counter);
}

/* -------------------------------------------------------------------------- */
/* Row section updates                                                        */
/* -------------------------------------------------------------------------- */
function updateTagsSection(row, counter) {
  const meta = row.querySelector('.counter-meta');
  if (!meta) return;
  const existing = row.querySelector('.counter-tags');
  const newTags = buildTagBadges(counter.tags);
  if (existing && newTags) {
    existing.replaceWith(newTags);
  } else if (!existing && newTags) {
    const idBlock = row.querySelector('.counter-meta__id');
    if (idBlock && idBlock.parentElement) {
      idBlock.parentElement.insertBefore(newTags, idBlock.nextSibling);
    } else {
      meta.insertBefore(newTags, meta.firstChild);
    }
  } else if (existing && !newTags) {
    existing.remove();
  }
}

function updateStatusSection(row, counter) {
  const meta = row.querySelector('.counter-meta');
  if (!meta) return;
  const existing = row.querySelector('.counter-status');
  const newStatus = buildStatusBadges(counter, { forceInactive: state.debugInactive });
  if (existing && newStatus) {
    existing.replaceWith(newStatus);
  } else if (!existing && newStatus) {
    const noteOrValue = row.querySelector('.counter-meta__note, .counter-meta__value');
    if (noteOrValue && noteOrValue.parentElement) {
      noteOrValue.parentElement.insertBefore(newStatus, noteOrValue);
    } else {
      meta.appendChild(newStatus);
    }
  } else if (existing && !newStatus) {
    existing.remove();
  }
}

function updateNoteSection(row, counter) {
  const meta = row.querySelector('.counter-meta');
  if (!meta) return;
  let noteEl = row.querySelector('.counter-meta__note');
  if (counter.note) {
    if (noteEl) {
      noteEl.textContent = counter.note;
    } else {
      noteEl = document.createElement('div');
      noteEl.className = 'counter-meta__note';
      noteEl.textContent = counter.note;
      const valueEl = row.querySelector('.counter-meta__value');
      if (valueEl && valueEl.parentElement) {
        valueEl.parentElement.insertBefore(noteEl, valueEl);
      } else {
        meta.appendChild(noteEl);
      }
    }
  } else if (noteEl) {
    noteEl.remove();
  }
}

function updateActivitySection(row, counter) {
  const meta = row.querySelector('.counter-meta');
  if (!meta) return;
  const activityEl = row.querySelector('.counter-activity');
  const isHovered = activityEl && (activityEl.matches(':hover') || activityEl.querySelector(':hover'));
  const newActivity = buildActivityBlock(counter.activity);
  if (activityEl && isHovered) {
    updateActivityBlockData(activityEl, counter.activity);
    return;
  }
  if (activityEl && newActivity) {
    activityEl.replaceWith(newActivity);
  } else if (!activityEl && newActivity) {
    const actionsEl = row.querySelector('.counter-actions');
    if (actionsEl && actionsEl.parentElement) {
      actionsEl.parentElement.insertBefore(newActivity, actionsEl);
    } else {
      meta.appendChild(newActivity);
    }
  } else if (activityEl && !newActivity) {
    activityEl.remove();
  }
}

function updateEditDefaults(row, counter) {
  const editPanel = row.querySelector('.counter-edit');
  if (!editPanel || !editPanel.classList.contains('hidden')) {
    return;
  }
  const labelInput = editPanel.querySelector('input[name="counterLabel"]');
  const valueInput = editPanel.querySelector('input[name="counterValue"]');
  const noteInput = editPanel.querySelector('textarea');
  if (labelInput) {
    labelInput.value = counter.label || '';
  }
  if (valueInput) {
    valueInput.value = counter.value;
  }
  if (noteInput) {
    noteInput.value = counter.note || '';
  }
}

/* -------------------------------------------------------------------------- */
/* Activity helpers                                                           */
/* -------------------------------------------------------------------------- */
function resolveActivityLevel(hits, ratio) {
  const count = Number(hits) || 0;
  if (count >= 50) return 'max';
  if (count >= 20) return 'high';
  if (count >= 5) return 'mid';
  if (count >= 1 && ratio >= 0.8) return 'mid';
  return 'low';
}

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

/* -------------------------------------------------------------------------- */
/* Auto refresh                                                               */
/* -------------------------------------------------------------------------- */
function scheduleAutoRefresh(delay = 5000) {
  cancelAutoRefresh();
  state.autoRefreshTimer = setTimeout(async () => {
    if (!state.user) return;
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

/* -------------------------------------------------------------------------- */
/* Mode helpers                                                               */
/* -------------------------------------------------------------------------- */
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
