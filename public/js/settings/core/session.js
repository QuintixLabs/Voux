/*
  settings/core/session.js

  Session check and settings page bootstrap for admin/member views.
*/

/* -------------------------------------------------------------------------- */
/* Session manager                                                            */
/* -------------------------------------------------------------------------- */
function createSessionManager(deps) {
  const {
    usersPager,
    togglePrivate,
    toggleGuides,
    allowModeUniqueInput,
    allowModeUnlimitedInput,
    autoBackupSection,
    backupDesc,
    getActiveUser,
    setActiveUser,
    fetchSettings,
    showToast,
    setStatus,
    setupBackupControls,
    setupApiKeys,
    setupUsers,
    setupBrandingForm,
    handleToggleChange,
    handleAllowedModesChange,
    runtimeManager,
    adminPermissionsManager
  } = deps;

/* -------------------------------------------------------------------------- */
/* Session bootstrap                                                          */
/* -------------------------------------------------------------------------- */
async function checkSession() {
    const revealPage = () => {
      document.documentElement.classList.remove('auth-pending');
    };
    const attempt = async () => {
      const getSession = window.VouxState?.getSession
        ? window.VouxState.getSession({ force: true })
        : fetch('/api/session', { credentials: 'include', cache: 'no-store' })
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null);
      const data = await getSession;
      if (!data || !data.user) {
        return { ok: false, unauthorized: true };
      }
      return { ok: true, data };
    };
    try {
      let result = await attempt();
      if (!result.ok && result.unauthorized) {
        result = await attempt();
      }
      if (!result.ok) {
        if (result.unauthorized) {
          window.location.href = '/dashboard';
          return;
        }
        revealPage();
        showToast('Unable to load settings right now.', 'danger');
        return;
      }
      setActiveUser(result.data?.user || null);
      if (!getActiveUser()) {
        window.location.href = '/dashboard';
        return;
      }
      if (getActiveUser().isAdmin) {
        initAdmin();
      } else {
        initMember();
      }
      revealPage();
    } catch {
      revealPage();
      showToast('Unable to load settings right now.', 'danger');
    }
  }

  /* -------------------------------------------------------------------------- */
/* Admin page init                                                            */
/* -------------------------------------------------------------------------- */
function initAdmin() {
    fetchSettings()
      .then(({ config, usersPageSize, inactiveDaysThreshold: inactiveDays, adminPermissions, backupDirectory }) => {
        // sync form values before listeners
        deps.populateForm(config, { backupDirectory });
        runtimeManager.setInactiveDaysThreshold(Number(inactiveDays));
        runtimeManager.updateInactiveButtonLabel();
        if (Number.isFinite(usersPageSize) && usersPageSize > 0) {
          usersPager.pageSize = usersPageSize;
        }
        const effectiveAdminPermissions = adminPermissions?.effective || null;
        adminPermissionsManager.applyAdminPermissionsUI(effectiveAdminPermissions, Boolean(getActiveUser()?.isOwner));
        setStatus('');
        togglePrivate?.addEventListener('change', () =>
          handleToggleChange({ privateMode: togglePrivate.checked }, togglePrivate.checked ? 'Private instance enabled' : 'Private instance disabled', togglePrivate)
        );
        toggleGuides?.addEventListener('change', () =>
          handleToggleChange({ showGuides: toggleGuides.checked }, toggleGuides.checked ? 'Guide cards shown' : 'Guide cards hidden', toggleGuides)
        );
        allowModeUniqueInput?.addEventListener('change', (event) => handleAllowedModesChange(event.target));
        allowModeUnlimitedInput?.addEventListener('change', (event) => handleAllowedModesChange(event.target));
        setupBackupControls(Boolean(getActiveUser()?.isOwner));
        setupApiKeys();
        setupUsers();
        setupBrandingForm();
        runtimeManager.setupRuntimeActions();
        document.body.classList.remove('settings-footer-hidden');
        if (getActiveUser()?.isOwner) {
          adminPermissionsManager.loadAdminPermissions();
        }
      })
      .catch(() => {
        showToast('Unable to load settings right now.', 'danger');
        document.body.classList.remove('settings-footer-hidden');
      });
  }

  /* -------------------------------------------------------------------------- */
/* Member page init                                                           */
/* -------------------------------------------------------------------------- */
function initMember() {
    deps.initSettingsTabs(['backupCard']);
    if (backupDesc) {
      backupDesc.textContent = 'Download your counters as JSON or restore them later.';
    }
    if (autoBackupSection) {
      autoBackupSection.classList.add('hidden');
    }
    setupBackupControls(false);
    document.body.classList.remove('settings-footer-hidden');
  }

  return {
    start: checkSession
  };
}

export {
  createSessionManager
};
