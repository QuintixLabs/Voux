/*
  settings/shared/dom.js

  DOM references used by the settings module.
*/

/* -------------------------------------------------------------------------- */
/* Core toggle refs                                                           */
/* -------------------------------------------------------------------------- */
export const togglePrivate = document.getElementById('togglePrivateMode');
export const toggleGuides = document.getElementById('toggleShowGuides');
export const statusLabel = document.getElementById('settingsStatus');
export const allowModeUniqueInput = document.getElementById('allowModeUnique');
export const allowModeUnlimitedInput = document.getElementById('allowModeUnlimited');

/* -------------------------------------------------------------------------- */
/* Backup refs                                                                */
/* -------------------------------------------------------------------------- */
export const downloadBackupBtn = document.getElementById('downloadBackup');
export const restoreFileInput = document.getElementById('restoreFile');
export const backupStatusLabel = document.getElementById('backupStatus');
export const autoBackupSection = document.getElementById('autoBackupSection');
export const autoBackupToggle = document.getElementById('autoBackupToggle');
export const autoBackupSummary = document.getElementById('autoBackupSummary');
export const autoBackupBody = document.getElementById('autoBackupBody');
export const autoBackupPath = document.getElementById('autoBackupPath');
export const autoBackupPathValue = document.getElementById('autoBackupPathValue');
export const autoBackupFrequencyInput = document.getElementById('autoBackupFrequency');
export const autoBackupTimeInput = document.getElementById('autoBackupTime');
export const autoBackupWeekdayField = document.getElementById('autoBackupWeekdayField');
export const autoBackupWeekdayInput = document.getElementById('autoBackupWeekday');
export const autoBackupRetentionInput = document.getElementById('autoBackupRetention');
export const autoBackupIncludeJsonInput = document.getElementById('autoBackupIncludeJson');
export const saveAutoBackupBtn = document.getElementById('saveAutoBackup');
export const runAutoBackupNowBtn = document.getElementById('runAutoBackupNow');

/* -------------------------------------------------------------------------- */
/* API key refs                                                               */
/* -------------------------------------------------------------------------- */
export const apiKeysCard = document.getElementById('apiKeysCard');
export const apiKeysList = document.getElementById('apiKeysList');
export const apiKeyForm = document.getElementById('apiKeyForm');
export const apiKeyNameInput = document.getElementById('apiKeyName');
export const apiKeyScopeSelect = document.getElementById('apiKeyScope');
export const apiKeyCountersField = document.getElementById('apiKeyCountersField');
export const apiKeyCountersInput = document.getElementById('apiKeyCounters');
export const apiKeyStatusLabel = document.getElementById('apiKeyStatus');
export const apiKeysPagination = document.getElementById('apiKeysPagination');
export const apiKeysPrevBtn = document.getElementById('apiKeysPrev');
export const apiKeysNextBtn = document.getElementById('apiKeysNext');
export const apiKeysPageInfo = document.getElementById('apiKeysPageInfo');

/* -------------------------------------------------------------------------- */
/* Branding + runtime refs                                                    */
/* -------------------------------------------------------------------------- */
export const brandingForm = document.getElementById('brandingForm');
export const brandNameInputField = document.getElementById('brandNameInput');
export const homeTitleInputField = document.getElementById('homeTitleInput');
export const themeSelect = document.getElementById('themeSelect');
export const brandingStatusLabel = document.getElementById('brandingStatus');
export const resetBrandingBtn = document.getElementById('resetBranding');
export const throttleSelect = document.getElementById('throttleSelect');
export const purgeInactiveButton = document.getElementById('purgeInactiveButton');
export const inactiveHint = document.getElementById('inactiveHint');

/* -------------------------------------------------------------------------- */
/* Users + tabs refs                                                          */
/* -------------------------------------------------------------------------- */
export const usersCard = document.getElementById('usersCard');
export const usersList = document.getElementById('usersList');
export const usersFilterSelect = document.getElementById('usersFilter');
export const usersSearchInput = document.getElementById('usersSearch');
export const userCreateOpen = document.getElementById('userCreateOpen');
export const usersPagination = document.getElementById('usersPagination');
export const usersPrevBtn = document.getElementById('usersPrev');
export const usersNextBtn = document.getElementById('usersNext');
export const usersPageInfo = document.getElementById('usersPageInfo');
export const settingsTabs = document.getElementById('settingsTabs');
export const settingsTabButtons = settingsTabs ? Array.from(settingsTabs.querySelectorAll('.settings-tab')) : [];
export const userForm = document.getElementById('userForm');
export const userNameInput = document.getElementById('userName');
export const userDisplayInput = document.getElementById('userDisplay');
export const userRoleSelect = document.getElementById('userRole');
export const userPasswordInput = document.getElementById('userPassword');
export const userStatusLabel = document.getElementById('userStatus');
export const userNameError = document.getElementById('userNameError');
export const userCreateModal = document.getElementById('userCreateModal');
export const userCreateCancel = document.getElementById('userCreateCancel');
export const userEditModal = document.getElementById('userEditModal');
export const userEditMessage = document.getElementById('userEditMessage');
export const userEditUsername = document.getElementById('userEditUsername');
export const userEditDisplay = document.getElementById('userEditDisplay');
export const userEditPassword = document.getElementById('userEditPassword');
export const userEditSave = document.getElementById('userEditSave');
export const userEditCancel = document.getElementById('userEditCancel');

/* -------------------------------------------------------------------------- */
/* Admin permissions refs                                                     */
/* -------------------------------------------------------------------------- */
export const adminDefaultsOpen = document.getElementById('adminDefaultsOpen');
export const adminPermModal = document.getElementById('adminPermModal');
export const adminPermTitle = document.getElementById('adminPermTitle');
export const adminPermMessage = document.getElementById('adminPermMessage');
export const adminPermGrid = document.getElementById('adminPermGrid');
export const adminPermSave = document.getElementById('adminPermSave');
export const adminPermCancel = document.getElementById('adminPermCancel');
export const adminPermReset = document.getElementById('adminPermReset');

export const backupCard = document.getElementById('backupCard');
export const backupDesc = backupCard?.querySelector('.settings-desc');
