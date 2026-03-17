/*
  dashboard/core/session.js

  Dashboard auth, session, and login-card state.
*/

/* -------------------------------------------------------------------------- */
/* Session manager                                                            */
/* -------------------------------------------------------------------------- */
function createDashboardSession(deps) {
  const {
    state,
    hasSessionHint,
    loadOwnerFilterPreference,
    saveOwnerFilterPreference,
    fetchRuntimeConfig,
    fetchSession,
    loginRequest,
    themeHelper,
    loginCard,
    dashboardCard,
    adminForm,
    loginUsernameInput,
    loginPasswordInput,
    loginError,
    loginStatus,
    dashboardSubtitle,
    adminControls,
    adminEmbedBlock,
    adminEmbedSnippetCode,
    adminEmbedSvgSnippetCode,
    paginationEl,
    deleteAllBtn,
    showToast,
    renderTagFilterList,
    updateTagFilterButton,
    refreshTagSelectors,
    closeTagFilterMenu,
    syncOwnerFilterToggle,
    refreshCounters,
    fetchTags,
    updateAdminVisibility,
    updateCreateCardVisibility,
    refreshAdminModeControls,
    updateDeleteFilteredState,
    renderAdminThrottleHint,
    setEmbedMode,
    cancelAutoRefresh,
    setSessionEventUser
  } = deps;

  let sessionRetryCount = 0;
  let sessionGraceUntil = 0;

/* -------------------------------------------------------------------------- */
/* Config + session checks                                                    */
/* -------------------------------------------------------------------------- */
async function fetchConfig() {
    try {
      const data = await fetchRuntimeConfig();
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
    setLoginLoading(true);
    setLoginPending(false);
    try {
      const data = await fetchSession(true).catch(() => null);
      if (!data || !data.user) {
        if (hasSessionHint()) {
          if (!sessionGraceUntil) {
            sessionGraceUntil = Date.now() + 1000;
          }
          if (sessionRetryCount < 2 && Date.now() < sessionGraceUntil) {
            sessionRetryCount += 1;
            setTimeout(() => checkSession(), 250);
            return;
          }
        }
        sessionRetryCount = 0;
        sessionGraceUntil = 0;
        revealLoginCard();
        return;
      }
      sessionRetryCount = 0;
      sessionGraceUntil = 0;
      await setUserSession(data?.user || null, data?.adminPermissions || null);
      showDashboard();
    } catch (error) {
      console.warn('Session check failed', error);
      sessionRetryCount = 0;
      sessionGraceUntil = 0;
      revealLoginCard();
    } finally {
      setLoginLoading(false);
    }
  }

  async function onLoginSubmit(event) {
    event.preventDefault();
    hideLoginError();
    const username = loginUsernameInput?.value.trim();
    const password = loginPasswordInput?.value;
    if (!username || !password) {
      showLoginError('Enter your username and password.');
      return;
    }
    setLoginPending(true);
    await attemptLogin(username, password);
  }

  async function attemptLogin(username, password) {
    setLoginLoading(true);
    try {
      const res = await loginRequest(username, password);
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        const code = error?.error;
        if (res.status === 429) {
          throw Object.assign(new Error(error?.message || 'Too many attempts. Try again soon.'), { code: 'rate_limit' });
        }
        throw Object.assign(new Error(error?.message || 'Login failed. Check your details.'), { code: code || 'unauthorized' });
      }
      const data = await res.json();
      await setUserSession(data?.user || null, data?.adminPermissions || null);
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
/* Dashboard/login visibility                                                 */
/* -------------------------------------------------------------------------- */
function finishDashboardInit() {
    document.body.classList.remove('dashboard-initializing');
  }

function showDashboard() {
    finishDashboardInit();
    loginCard?.classList.add('hidden');
    loginCard?.classList.remove('login-card--pending');
    dashboardCard?.classList.remove('hidden');
    if (adminControls) {
      adminControls.classList.remove('hidden');
      adminControls.classList.remove('is-loading');
    }
    if (dashboardSubtitle) {
      const name = state.user?.displayName || state.user?.username || 'Signed in';
      const instanceLabel = state.privateMode ? 'Private instance' : 'Public instance';
      dashboardSubtitle.textContent = `${name} · ${instanceLabel}`;
    }
    hideLoginError();
  }

  function hideDashboard() {
    finishDashboardInit();
    cancelAutoRefresh();
    loginCard?.classList.remove('hidden');
    loginCard?.classList.remove('login-card--pending');
    dashboardCard?.classList.add('hidden');
    adminControls?.classList.add('hidden');
    adminControls?.classList.remove('is-loading');
    adminEmbedBlock?.classList.add('hidden');
    if (adminEmbedSnippetCode) adminEmbedSnippetCode.textContent = '';
    if (adminEmbedSvgSnippetCode) adminEmbedSvgSnippetCode.textContent = '';
    setEmbedMode('script');
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

  async function setUserSession(user, adminPermissions) {
    if (user && adminPermissions) {
      state.user = { ...user, adminPermissions };
    } else {
      state.user = user || null;
    }
    state.isAdmin = Boolean(user?.isAdmin || user?.role === 'admin');
    if (!state.user) {
      if (window.VouxErrors?.cacheNavUser) {
        window.VouxErrors.cacheNavUser(null);
      }
      setSessionEventUser(null);
      state.ownerOnly = false;
      syncOwnerFilterToggle();
      hideDashboard();
      revealLoginCard();
      return;
    }
    state.ownerOnly = state.isAdmin ? loadOwnerFilterPreference() : false;
    if (state.isAdmin && state.user?.adminPermissions?.danger === false) {
      state.ownerOnly = true;
      state.ownerOnlyForced = true;
      saveOwnerFilterPreference(true);
    } else if (state.isAdmin && state.ownerOnlyForced) {
      state.ownerOnly = false;
      state.ownerOnlyForced = false;
      saveOwnerFilterPreference(false);
    }
    syncOwnerFilterToggle();
    setSessionEventUser(state.user);
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

/* -------------------------------------------------------------------------- */
/* Login status UI                                                            */
/* -------------------------------------------------------------------------- */
function setLoginPending(pending, message) {
    if (!loginCard) return;
    loginCard.classList.toggle('login-card--pending', Boolean(pending));
    if (pending) {
      // reserved for loading text
    } else {
      showStatusHint('');
    }
  }

  function revealLoginCard() {
    finishDashboardInit();
    if (!loginCard) return;
    loginCard.classList.remove('login-card--pending');
    loginCard.classList.remove('hidden');
    showStatusHint('');
  }

  function showStatusHint(message) {
    if (!loginStatus) return;
    loginStatus.textContent = message || '';
    loginStatus.classList.toggle('hidden', !message);
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

  return {
    fetchConfig,
    checkSession,
    onLoginSubmit,
    attemptLogin,
    showDashboard,
    hideDashboard,
    showLoginError,
    hideLoginError,
    setLoginLoading,
    setUserSession,
    setLoginPending,
    revealLoginCard,
    showStatusHint
  };
}

export { createDashboardSession };
