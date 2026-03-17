/*
  settings/shared/state.js

  Shared constants/state used by the settings module.
*/

/* -------------------------------------------------------------------------- */
/* Pager state                                                                */
/* -------------------------------------------------------------------------- */
export const usersPager = {
  list: [],
  page: 1,
  pageSize: 4,
  filter: 'all'
};

export const apiKeyPager = {
  list: [],
  page: 1,
  pageSize: 3
};

/* -------------------------------------------------------------------------- */
/* Branding defaults                                                          */
/* -------------------------------------------------------------------------- */
export const DEFAULT_BRAND_NAME = 'Voux';
export const DEFAULT_HOME_TITLE = 'Voux · Simple Free & Open Source Hit Counter for Blogs and Websites';
export const DEFAULT_THROTTLE_SECONDS = 0;

export const themeHelper = window.VouxTheme;
export const ALLOWED_THEMES = (
  themeHelper?.THEMES && themeHelper.THEMES.length ? themeHelper.THEMES : ['default']
);

/* -------------------------------------------------------------------------- */
/* Permission catalog                                                         */
/* -------------------------------------------------------------------------- */
export const ADMIN_PERMISSION_ITEMS = [
  { key: 'runtime', label: 'Runtime settings', hint: 'Settings that affect how things run.' },
  { key: 'branding', label: 'Branding', hint: 'Customize names and visuals.' },
  { key: 'apiKeys', label: 'API keys', hint: 'Create and manage access keys.' },
  { key: 'users', label: 'Users', hint: 'Manage user accounts.' },
  { key: 'danger', label: 'Danger actions', hint: 'Gives admins full control over all counters.' }
];

export const AUTO_BACKUP_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
