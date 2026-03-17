/*
  settings/index.js

  Admin settings page logic: toggles, backups, and API key management.
*/


/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */
import {
  togglePrivate,
  toggleGuides,
  statusLabel,
  allowModeUniqueInput,
  allowModeUnlimitedInput,
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
  apiKeysCard,
  apiKeysList,
  apiKeyForm,
  apiKeyNameInput,
  apiKeyScopeSelect,
  apiKeyCountersField,
  apiKeyCountersInput,
  apiKeyStatusLabel,
  brandingForm,
  brandNameInputField,
  homeTitleInputField,
  themeSelect,
  brandingStatusLabel,
  resetBrandingBtn,
  throttleSelect,
  purgeInactiveButton,
  inactiveHint,
  apiKeysPagination,
  apiKeysPrevBtn,
  apiKeysNextBtn,
  apiKeysPageInfo,
  usersCard,
  usersList,
  usersFilterSelect,
  usersSearchInput,
  userCreateOpen,
  usersPagination,
  usersPrevBtn,
  usersNextBtn,
  usersPageInfo,
  settingsTabs,
  settingsTabButtons,
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
  adminDefaultsOpen,
  adminPermModal,
  adminPermTitle,
  adminPermMessage,
  adminPermGrid,
  adminPermSave,
  adminPermCancel,
  adminPermReset,
  backupCard,
  backupDesc
} from './shared/dom.js';
import {
  usersPager,
  apiKeyPager,
  DEFAULT_BRAND_NAME,
  DEFAULT_HOME_TITLE,
  DEFAULT_THROTTLE_SECONDS,
  themeHelper,
  ALLOWED_THEMES,
  ADMIN_PERMISSION_ITEMS,
  AUTO_BACKUP_WEEKDAYS
} from './shared/state.js';
import {
  showToast,
  showAlert,
  normalizeAuthMessage,
  assertSession,
  modalConfirm,
  modalConfirmWithInput
} from './shared/ui.js';
import { createApiKeysManager } from './features/apiKeys.js';
import { createUsersManager } from './features/users.js';
import { createBackupManager } from './features/backup.js';
import { createAdminPermissionsManager } from './features/adminPermissions.js';
import { createBrandingManager } from './features/branding.js';
import { createRuntimeManager } from './features/runtime.js';
import { createSettingsTabsManager } from './core/tabs.js';
import { createSessionManager } from './core/session.js';
import { createTogglesManager } from './features/toggles.js';
import { createSettingsFormManager } from './core/form.js';

/* -------------------------------------------------------------------------- */
/* Defaults                                                                   */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* State                                                                      */
/* -------------------------------------------------------------------------- */
let activeUser = null;

const tabsManager = createSettingsTabsManager({
  settingsTabs,
  settingsTabButtons
});

const apiKeysManager = createApiKeysManager({
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
});

const usersManager = createUsersManager({
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
  authFetch,
  assertSession,
  showToast,
  showAlert,
  normalizeAuthMessage,
  modalConfirm,
  getActiveUser: () => activeUser,
  onOpenAdminPermissions: (user) => adminPermissionsManager.openAdminPermissions(user)
});

const backupManager = createBackupManager({
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
  AUTO_BACKUP_WEEKDAYS,
  authFetch,
  assertSession,
  showToast,
  showAlert,
  normalizeAuthMessage,
  modalConfirm,
  applyConfigUpdate
});

const adminPermissionsManager = createAdminPermissionsManager({
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
  authFetch,
  showToast,
  showAlert,
  normalizeAuthMessage,
  initSettingsTabs: (allowedIds) => tabsManager.initSettingsTabs(allowedIds),
  getActiveUser: () => activeUser,
  onUsersChanged: () => usersManager.loadUsers(true),
  fetchSettings: (...args) => formManager.fetchSettings(...args)
});

const brandingManager = createBrandingManager({
  brandingForm,
  brandNameInputField,
  homeTitleInputField,
  themeSelect,
  brandingStatusLabel,
  resetBrandingBtn,
  DEFAULT_BRAND_NAME,
  DEFAULT_HOME_TITLE,
  ALLOWED_THEMES,
  authFetch,
  assertSession,
  showToast,
  showAlert,
  normalizeAuthMessage,
  modalConfirm,
  applyConfigUpdate,
  applyThemeClass
});

const formManager = createSettingsFormManager({
  authFetch,
  togglePrivate,
  toggleGuides,
  allowModeUniqueInput,
  allowModeUnlimitedInput,
  throttleSelect,
  applyBrandingFromConfig: (...args) => brandingManager.applyBrandingFromConfig(...args),
  applyAutoBackupForm: (...args) => backupManager.applyAutoBackupForm(...args),
  applyAutoBackupPath: (...args) => backupManager.applyAutoBackupPath(...args)
});

const runtimeManager = createRuntimeManager({
  throttleSelect,
  purgeInactiveButton,
  inactiveHint,
  DEFAULT_THROTTLE_SECONDS,
  authFetch,
  assertSession,
  showToast,
  showAlert,
  normalizeAuthMessage,
  modalConfirm,
  modalConfirmWithInput,
  applyConfigUpdate,
  setStatus: (text) => togglesManager.setStatus(text)
});

const togglesManager = createTogglesManager({
  statusLabel,
  allowModeUniqueInput,
  allowModeUnlimitedInput,
  authFetch,
  assertSession,
  showToast,
  showAlert,
  normalizeAuthMessage,
  applyConfigUpdate
});

const sessionManager = createSessionManager({
  usersPager,
  togglePrivate,
  toggleGuides,
  allowModeUniqueInput,
  allowModeUnlimitedInput,
  autoBackupSection,
  backupDesc,
  getActiveUser: () => activeUser,
  setActiveUser: (next) => {
    activeUser = next;
  },
  fetchSettings: (...args) => formManager.fetchSettings(...args),
  showToast,
  setStatus: (text) => togglesManager.setStatus(text),
  setupBackupControls,
  setupApiKeys,
  setupUsers,
  setupBrandingForm,
  handleToggleChange: (...args) => togglesManager.handleToggleChange(...args),
  handleAllowedModesChange: (...args) => togglesManager.handleAllowedModesChange(...args),
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
  const fallback = String(theme || 'default').trim().toLowerCase() || 'default';
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

/* -------------------------------------------------------------------------- */
/* Init                                                                       */
/* -------------------------------------------------------------------------- */
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
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
// toggle hint tooltips
(function(){
  const icons=document.querySelectorAll('.hint-icon[data-tooltip]');
  icons.forEach((icon)=>{
    icon.addEventListener('click',(e)=>{
      e.preventDefault();
      e.stopPropagation();
      const isOpen=icon.classList.contains('is-open');
      icons.forEach((i)=>i.classList.remove('is-open'));
      if(!isOpen){
        icon.classList.add('is-open');
      }
    });
  });
  document.addEventListener('click',()=>{
    icons.forEach((i)=>i.classList.remove('is-open'));
  });
})();
