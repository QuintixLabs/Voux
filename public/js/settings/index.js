/*
  settings/index.js

  Admin settings page logic: toggles, backups, and API key management.
*/

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */
import {
  // General toggles UI
  togglePrivate,
  toggleGuides,
  statusLabel,
  allowModeUniqueInput,
  allowModeUnlimitedInput,
  throttleSelect,
  purgeInactiveButton,
  inactiveHint,

  // Backup UI
  downloadBackupBtn,
  restoreFileInput,
  backupStatusLabel,
  backupDesc,
  autoBackupSection,
  autoBackupToggle,
  autoBackupSummary,
  autoBackupBody,
  autoBackupPath,
  autoBackupPathValue,
  autoBackupFrequencyInput,
  autoBackupTimeInput,
  autoBackupWeekdayField,
  autoBackupWeekdayInput,
  autoBackupRetentionInput,
  autoBackupIncludeJsonInput,
  saveAutoBackupBtn,
  runAutoBackupNowBtn,

  // API keys UI
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

  // Branding UI
  brandingForm,
  brandNameInputField,
  homeTitleInputField,
  themeSelect,
  brandingStatusLabel,
  resetBrandingBtn,

  // Users UI
  usersCard,
  usersList,
  usersFilterSelect,
  usersSearchInput,
  userCreateOpen,
  usersPagination,
  usersPrevBtn,
  usersNextBtn,
  usersPageInfo,
  userForm,
  userNameInput,
  userDisplayInput,
  userRoleSelect,
  userPasswordInput,
  userStatusLabel,
  userNameError,
  userCreateModal,
  userCreateCancel,
  userEditModal,
  userEditMessage,
  userEditUsername,
  userEditDisplay,
  userEditPassword,
  userEditSave,
  userEditCancel,

  // Admin permissions UI
  adminDefaultsOpen,
  adminPermModal,
  adminPermTitle,
  adminPermMessage,
  adminPermGrid,
  adminPermSave,
  adminPermCancel,
  adminPermReset,

  // Tabs UI
  settingsTabs,
  settingsTabButtons
} from './shared/dom.js';

import {
  // Pagination state
  usersPager,
  apiKeyPager,

  // Branding defaults
  DEFAULT_BRAND_NAME,
  DEFAULT_HOME_TITLE,
  ALLOWED_THEMES,
  themeHelper,

  // Runtime defaults
  DEFAULT_THROTTLE_SECONDS,

  // Admin permissions state
  ADMIN_PERMISSION_ITEMS,

  // Backup state
  AUTO_BACKUP_WEEKDAYS
} from './shared/state.js';

import {
  // Toasts and dialogs
  showToast,
  showAlert,
  modalConfirm,
  modalConfirmWithInput,

  // Auth response helpers
  normalizeAuthMessage,
  assertSession
} from './shared/ui.js';

// Settings features
import { createApiKeysManager } from './features/apiKeys.js';
import { createUsersManager } from './features/users.js';
import { createBackupManager } from './features/backup.js';
import { createAdminPermissionsManager } from './features/adminPermissions.js';
import { createBrandingManager } from './features/branding.js';
import { createRuntimeManager } from './features/runtime.js';
import { createTogglesManager } from './features/toggles.js';

// Settings core
import { createSettingsTabsManager } from './core/tabs.js';
import { createSessionManager } from './core/session.js';
import { createSettingsFormManager } from './core/form.js';

let activeUser = null;

// Tabs manager
const tabsManager = createSettingsTabsManager({
  settingsTabs,
  settingsTabButtons
});

/* -------------------------------------------------------------------------- */
/* API keys manager                                                           */
/* -------------------------------------------------------------------------- */
const apiKeysManager = createApiKeysManager({
  // API keys UI
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

  // API keys requests + feedback
  authFetch,
  assertSession,
  showToast,
  showAlert,
  normalizeAuthMessage,
  modalConfirm,

  // API keys formatting
  formatTimestamp,
  escapeHtml
});

/* -------------------------------------------------------------------------- */
/* Users manager                                                              */
/* -------------------------------------------------------------------------- */
const usersManager = createUsersManager({
  // Users UI
  usersPager,
  usersCard,
  usersList,
  usersFilterSelect,
  usersSearchInput,
  userCreateOpen,
  usersPagination,
  usersPrevBtn,
  usersNextBtn,
  usersPageInfo,
  userForm,
  userNameInput,
  userDisplayInput,
  userRoleSelect,
  userPasswordInput,
  userStatusLabel,
  userNameError,
  userCreateModal,
  userCreateCancel,
  userEditModal,
  userEditMessage,
  userEditUsername,
  userEditDisplay,
  userEditPassword,
  userEditSave,
  userEditCancel,

  // Users requests + feedback
  authFetch,
  assertSession,
  showToast,
  showAlert,
  normalizeAuthMessage,
  modalConfirm,

  // Users state bridges
  getActiveUser: () => activeUser,
  onOpenAdminPermissions: (user) =>
    adminPermissionsManager.openAdminPermissions(user)
});

/* -------------------------------------------------------------------------- */
/* Backup manager                                                             */
/* -------------------------------------------------------------------------- */
const backupManager = createBackupManager({
  // Backup UI
  downloadBackupBtn,
  restoreFileInput,
  backupStatusLabel,
  autoBackupSection,
  autoBackupToggle,
  autoBackupSummary,
  autoBackupBody,
  autoBackupPath,
  autoBackupPathValue,
  autoBackupFrequencyInput,
  autoBackupTimeInput,
  autoBackupWeekdayField,
  autoBackupWeekdayInput,
  autoBackupRetentionInput,
  autoBackupIncludeJsonInput,
  saveAutoBackupBtn,
  runAutoBackupNowBtn,

  // Backup config state
  AUTO_BACKUP_WEEKDAYS,
  applyConfigUpdate,

  // Backup requests + feedback
  authFetch,
  assertSession,
  showToast,
  showAlert,
  normalizeAuthMessage,
  modalConfirm
});

/* -------------------------------------------------------------------------- */
/* Admin permissions manager                                                  */
/* -------------------------------------------------------------------------- */
const adminPermissionsManager = createAdminPermissionsManager({
  // Admin permissions UI
  adminDefaultsOpen,
  adminPermModal,
  adminPermTitle,
  adminPermMessage,
  adminPermGrid,
  adminPermSave,
  adminPermCancel,
  adminPermReset,
  purgeInactiveButton,
  ADMIN_PERMISSION_ITEMS,

  // Admin permissions requests + feedback
  authFetch,
  showToast,
  showAlert,
  normalizeAuthMessage,

  // Admin permissions state bridges
  initSettingsTabs: (allowedIds) => tabsManager.initSettingsTabs(allowedIds),
  getActiveUser: () => activeUser,
  onUsersChanged: () => usersManager.loadUsers(true),
  fetchSettings: (...args) => formManager.fetchSettings(...args)
});

/* -------------------------------------------------------------------------- */
/* Branding manager                                                           */
/* -------------------------------------------------------------------------- */
const brandingManager = createBrandingManager({
  // Branding UI
  brandingForm,
  brandNameInputField,
  homeTitleInputField,
  themeSelect,
  brandingStatusLabel,
  resetBrandingBtn,

  // Branding defaults
  DEFAULT_BRAND_NAME,
  DEFAULT_HOME_TITLE,
  ALLOWED_THEMES,

  // Branding requests + feedback
  authFetch,
  assertSession,
  showToast,
  showAlert,
  normalizeAuthMessage,
  modalConfirm,

  // Branding helpers
  applyConfigUpdate,
  applyThemeClass
});

/* -------------------------------------------------------------------------- */
/* Form manager                                                               */
/* -------------------------------------------------------------------------- */
const formManager = createSettingsFormManager({
  // Form requests
  authFetch,

  // Runtime toggles UI
  togglePrivate,
  toggleGuides,
  allowModeUniqueInput,
  allowModeUnlimitedInput,
  throttleSelect,

  // Form apply helpers
  applyBrandingFromConfig: (...args) =>
    brandingManager.applyBrandingFromConfig(...args),
  applyAutoBackupForm: (...args) => backupManager.applyAutoBackupForm(...args),
  applyAutoBackupPath: (...args) => backupManager.applyAutoBackupPath(...args)
});

/* -------------------------------------------------------------------------- */
/* Runtime manager                                                            */
/* -------------------------------------------------------------------------- */
const runtimeManager = createRuntimeManager({
  // Runtime UI
  throttleSelect,
  purgeInactiveButton,
  inactiveHint,

  // Runtime defaults
  DEFAULT_THROTTLE_SECONDS,

  // Runtime requests + feedback
  authFetch,
  assertSession,
  showToast,
  showAlert,
  normalizeAuthMessage,
  modalConfirm,
  modalConfirmWithInput,

  // Runtime state helpers
  applyConfigUpdate,
  setStatus: (text) => togglesManager.setStatus(text)
});

/* -------------------------------------------------------------------------- */
/* Toggles manager                                                            */
/* -------------------------------------------------------------------------- */
const togglesManager = createTogglesManager({
  // Toggle UI
  statusLabel,
  allowModeUniqueInput,
  allowModeUnlimitedInput,

  // Toggle requests + feedback
  authFetch,
  assertSession,
  showToast,
  showAlert,
  normalizeAuthMessage,

  // Toggle state helper
  applyConfigUpdate
});

/* -------------------------------------------------------------------------- */
/* Session manager                                                            */
/* -------------------------------------------------------------------------- */
const sessionManager = createSessionManager({
  // Session-owned UI
  usersPager,
  togglePrivate,
  toggleGuides,
  allowModeUniqueInput,
  allowModeUnlimitedInput,
  autoBackupSection,
  backupDesc,

  // Session state
  getActiveUser: () => activeUser,
  setActiveUser: (next) => {
    activeUser = next;
  },

  // Session data + feedback
  fetchSettings: (...args) => formManager.fetchSettings(...args),
  showToast,
  setStatus: (text) => togglesManager.setStatus(text),

  // Session setup hooks
  setupBackupControls,
  setupApiKeys,
  setupUsers,
  setupBrandingForm,

  // Session toggle handlers
  handleToggleChange: (...args) => togglesManager.handleToggleChange(...args),
  handleAllowedModesChange: (...args) =>
    togglesManager.handleAllowedModesChange(...args),

  // Session feature managers
  runtimeManager,
  adminPermissionsManager,
  populateForm: (...args) => formManager.populateForm(...args),
  initSettingsTabs: (allowedIds) => tabsManager.initSettingsTabs(allowedIds)
});

/* -------------------------------------------------------------------------- */
/* Theme helpers                                                              */
/* -------------------------------------------------------------------------- */
function applyThemeClass(theme) {
  if (themeHelper?.apply) {
    themeHelper.apply(theme);
    return;
  }
  const fallback =
    String(theme || 'default')
      .trim()
      .toLowerCase() || 'default';
  document.documentElement.setAttribute('data-theme', fallback);
}

/* -------------------------------------------------------------------------- */
/* Networking                                                                 */
/* -------------------------------------------------------------------------- */
function authFetch(url, options = {}) {
  return fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      ...options.headers
    }
  });
}
// init
sessionManager.start();

/* -------------------------------------------------------------------------- */
/* Setup helpers                                                              */
/* -------------------------------------------------------------------------- */
function setupBackupControls(canManageAutoBackups = false) {
  backupManager.setupBackupControls(canManageAutoBackups);
}

function setupApiKeys() {
  apiKeysManager.setup();
}

function setupBrandingForm() {
  brandingManager.setupBrandingForm();
}

function setupUsers() {
  adminPermissionsManager.setup();
  usersManager.setupUsers();
}

function applyConfigUpdate(payload) {
  const config = payload?.config;
  if (config && window.VouxState?.setConfig) {
    window.VouxState.setConfig(config);
  } else if (window.VouxState?.clearConfig) {
    window.VouxState.clearConfig();
  }
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */
function formatTimestamp(value) {
  if (!value) return 'never';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'never';
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return 'never';
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* -------------------------------------------------------------------------- */
/* Hint tooltips                                                              */
/* -------------------------------------------------------------------------- */
(function () {
  const icons = document.querySelectorAll('.hint-icon[data-tooltip]');
  icons.forEach((icon) => {
    icon.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isOpen = icon.classList.contains('is-open');
      icons.forEach((i) => i.classList.remove('is-open'));
      if (!isOpen) {
        icon.classList.add('is-open');
      }
    });
  });
  document.addEventListener('click', () => {
    icons.forEach((i) => i.classList.remove('is-open'));
  });
})();
