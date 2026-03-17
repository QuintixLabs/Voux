/*
  dashboard/shared/state.js

  Dashboard constants and shared mutable state.
*/

/* -------------------------------------------------------------------------- */
/* State + constants                                                          */
/* -------------------------------------------------------------------------- */
export const RANGE_LABELS = {
  today: 'Today',
  '7d': '7 days',
  '30d': '30 days'
};

export const TAG_LIMIT = 20;
export const START_VALUE_DIGIT_LIMIT = 18;
export const OWNER_FILTER_STORAGE_KEY = 'voux_owner_only';

/* -------------------------------------------------------------------------- */
/* Mutable dashboard state                                                    */
/* -------------------------------------------------------------------------- */
export const state = {
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
  ownerOnlyForced: false,
  latestCounters: [],
  selectedIds: new Set(),
  counterCache: new Map(),
  embedMode: 'script',
  tags: [],
  tagFilter: [],
  createTags: [],
  debugInactive: new URLSearchParams(window.location.search).has('debugInactive')
};

export const tagSelectorRegistry = new Set();

/* -------------------------------------------------------------------------- */
/* Owner filter persistence                                                   */
/* -------------------------------------------------------------------------- */
export function loadOwnerFilterPreference() {
  try {
    return window.localStorage.getItem(OWNER_FILTER_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function hasSessionHint() {
  try {
    return (
      window.localStorage.getItem('voux_session_hint') === '1' &&
      Boolean(window.localStorage.getItem('voux_nav_user'))
    );
  } catch {
    return false;
  }
}

export function saveOwnerFilterPreference(value) {
  try {
    window.localStorage.setItem(OWNER_FILTER_STORAGE_KEY, value ? 'true' : 'false');
  } catch {
    // ignore
  }
}
