/*
  settings/features/users.js

  Users list and user management logic for settings.
*/

/* -------------------------------------------------------------------------- */
/* Users manager                                                              */
/* -------------------------------------------------------------------------- */
function createUsersManager(deps) {
  const {
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
    getActiveUser,
    onOpenAdminPermissions
  } = deps;

  let activeUserEditor = null;

/* -------------------------------------------------------------------------- */
/* User list + filters                                                        */
/* -------------------------------------------------------------------------- */
async function loadUsers(silent = false) {
    if (!usersList) return;
    if (!silent) {
      usersList.innerHTML = '<p class="hint">Loading users...</p>';
    }
    try {
      const res = await authFetch('/api/users');
      if (!res.ok) throw new Error('Failed to load users');
      const data = await res.json();
      const users = Array.isArray(data.users) ? data.users : [];
      usersPager.list = users;
      renderUsersPage();
    } catch (error) {
      if (!silent) {
        usersList.innerHTML = '<p class="hint">Unable to load users.</p>';
      }
      console.warn(error);
    }
  }

  function getFilteredUsers() {
    const query = (usersSearchInput?.value || '').trim().toLowerCase();
    const baseList = usersPager.list;
    let filtered = baseList;
    const sortByName = () => {
      const normalize = (user) => (user.displayName || user.username || '').trim().toLowerCase();
      return (a, b) => normalize(a).localeCompare(normalize(b));
    };
    if (usersPager.filter === 'owner') {
      filtered = filtered.filter((user) => user.isOwner);
    }
    if (usersPager.filter === 'members') {
      filtered = filtered.filter((user) => user.role !== 'admin');
    }
    if (usersPager.filter === 'admins') {
      filtered = filtered.filter((user) => user.role === 'admin');
    }
    if (query) {
      filtered = filtered.filter((user) => {
        const name = `${user.displayName || ''} ${user.username || ''}`.toLowerCase();
        return name.includes(query);
      });
    }
    if (usersPager.filter === 'az') {
      filtered = [...filtered].sort(sortByName());
    }
    return filtered;
  }

  function getUsersTotalPages() {
    const total = getFilteredUsers().length;
    return Math.max(1, Math.ceil(total / usersPager.pageSize));
  }

  function renderUsersPage() {
    const filtered = getFilteredUsers();
    const query = (usersSearchInput?.value || '').trim();
    const totalPages = getUsersTotalPages();
    const page = Math.min(usersPager.page, totalPages);
    usersPager.page = page;
    const start = (page - 1) * usersPager.pageSize;
    const slice = filtered.slice(start, start + usersPager.pageSize);
    renderUsers(slice, query);
    if (usersPageInfo) {
      usersPageInfo.textContent = `Page ${page} / ${totalPages}`;
    }
    if (usersPagination) {
      usersPagination.classList.toggle('hidden', totalPages <= 1);
    }
    if (usersPrevBtn) usersPrevBtn.disabled = page <= 1;
    if (usersNextBtn) usersNextBtn.disabled = page >= totalPages;
  }

  function renderUsers(users, query = '') {
    if (!usersList) return;
    usersList.innerHTML = '';
    if (!users.length) {
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = query
        ? `No users found for "${query}".`
        : 'No users yet.';
      usersList.appendChild(hint);
      return;
    }
    users.forEach((user) => {
      const row = document.createElement('div');
      row.className = 'user-row';
      const meta = document.createElement('div');
      meta.className = 'user-row__meta';
      const avatar = document.createElement('div');
      avatar.className = 'user-row__avatar';
      if (user.avatarUrl) {
        const img = document.createElement('img');
        img.src = user.avatarUrl;
        img.alt = '';
        avatar.innerHTML = '';
        avatar.appendChild(img);
      } else {
        const name = (user.displayName || user.username || '?').trim();
        avatar.textContent = name.charAt(0).toUpperCase() || '?';
      }
      const title = document.createElement('strong');
      title.textContent = user.displayName ? `${user.displayName} (${user.username})` : user.username;
      const subtitle = document.createElement('span');
      subtitle.className = 'hint';
      const ownerLabel = user.isOwner ? 'Owner' : null;
      subtitle.textContent = ownerLabel || (user.role === 'admin' ? 'Admin' : 'Member');
      meta.append(avatar, title, subtitle);

      const actions = document.createElement('div');
      actions.className = 'user-row__actions';
      const activeUser = getActiveUser();
      if (activeUser?.username === user.username) {
        const badge = document.createElement('span');
        badge.className = 'user-row__badge';
        badge.textContent = 'Yourself';
        actions.appendChild(badge);
      }
      const requesterIsOwner = Boolean(activeUser?.isOwner);
      const canEditRole = requesterIsOwner && activeUser?.id !== user.id;
      if (canEditRole) {
        const roleSelect = document.createElement('select');
        roleSelect.innerHTML = `
        <option value="user">Member</option>
        <option value="admin">Admin</option>
      `;
        roleSelect.value = user.role === 'admin' ? 'admin' : 'user';
        roleSelect.addEventListener('change', () => handleUserRoleChange(user, roleSelect));
        actions.appendChild(roleSelect);
      }

      if (requesterIsOwner && user.role === 'admin' && !user.isOwner) {
        const permsBtn = document.createElement('button');
        permsBtn.type = 'button';
        permsBtn.className = 'ghost';
        permsBtn.innerHTML = '<i class="ri-shield-keyhole-line"></i>';
        permsBtn.addEventListener('click', () => onOpenAdminPermissions?.(user));
        actions.appendChild(permsBtn);
      }

      if ((user.role !== 'admin' || requesterIsOwner) && activeUser?.id !== user.id) {
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'ghost';
        editBtn.innerHTML = '<i class="ri-pencil-line"></i>';
        editBtn.addEventListener('click', () => openUserEditor(user));
        actions.appendChild(editBtn);
      }

      if (activeUser?.id !== user.id && (user.role !== 'admin' || requesterIsOwner)) {
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'danger ghost';
        deleteBtn.innerHTML = '<i class="ri-delete-bin-line"></i>';
        deleteBtn.addEventListener('click', () => handleUserDelete(user));
        actions.appendChild(deleteBtn);
      }

      row.append(meta, actions);
      usersList.appendChild(row);
    });
  }

/* -------------------------------------------------------------------------- */
/* Create modal flow                                                          */
/* -------------------------------------------------------------------------- */
function openUserCreateModal() {
    if (!userCreateModal || !userForm) return;
    userForm.reset();
    setUserStatus('');
    setUserNameError('');
    userCreateModal.classList.add('modal-overlay--open');
    userCreateModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    userNameInput?.focus();
  }

  function closeUserCreateModal() {
    if (!userCreateModal) return;
    userCreateModal.classList.remove('modal-overlay--open');
    userCreateModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  async function handleUserCreate(event) {
    event.preventDefault();
    if (!userNameInput || !userPasswordInput || !userRoleSelect) return;
    const username = userNameInput.value.trim();
    const password = userPasswordInput.value;
    const role = userRoleSelect.value === 'admin' ? 'admin' : 'user';
    const displayName = userDisplayInput?.value?.trim() || '';
    if (!username || !password) {
      showToast('Username and password are required.', 'danger');
      return;
    }
    if (password.length < 6) {
      showToast('Password must be at least 6 characters.', 'danger');
      return;
    }
    try {
      setUserStatus('');
      const res = await authFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role, displayName })
      });
      await assertSession(res);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create user');
      }
      userForm.reset();
      showToast(`User created: ${displayName || username}`);
      loadUsers(true);
      closeUserCreateModal();
    } catch (error) {
      const message = error.message === 'username_exists'
        ? 'That username is already taken.'
        : error.message || 'Failed to create user.';
      if (error.message === 'username_exists') {
        setUserNameError(message);
        return;
      }
      await showAlert(normalizeAuthMessage(error, message));
    }
  }

  function setUserNameError(message) {
    if (!userNameError) return;
    const next = message || '';
    const isHidden = userNameError.classList.contains('is-hidden');
    if (userNameError.textContent === next && !isHidden) {
      return;
    }
    userNameError.textContent = next;
    userNameError.classList.toggle('is-hidden', !next);
  }

/* -------------------------------------------------------------------------- */
/* Role/profile updates                                                       */
/* -------------------------------------------------------------------------- */
async function handleUserRoleChange(user, roleSelect) {
    if (!user?.id || !roleSelect) return;
    const nextRole = roleSelect.value === 'admin' ? 'admin' : 'user';
    const previousRole = user.role === 'admin' ? 'admin' : 'user';
    if (nextRole === previousRole) return;
    try {
      const res = await authFetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: nextRole })
      });
      await assertSession(res);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update role');
      }
      const roleLabel = nextRole === 'admin' ? 'Admin' : 'Member';
      const userLabel = user.displayName || user.username || 'user';
      showToast(`Role updated: ${userLabel} -> ${roleLabel}`);
      loadUsers(true);
    } catch (error) {
      roleSelect.value = previousRole;
      const message = error.message === 'last_admin'
        ? 'You need at least one admin on this instance.'
        : error.message === 'admin_edit_forbidden'
          ? 'Admin accounts cannot be edited.'
          : error.message === 'owner_locked'
            ? 'The owner account cannot be edited.'
            : error.message || 'Failed to update role';
      await showAlert(normalizeAuthMessage(error, message));
    }
  }

  function openUserEditor(user) {
    if (!userEditModal) return;
    activeUserEditor = user;
    if (userEditMessage) {
      const label = user.displayName ? `${user.displayName} (${user.username})` : user.username;
      userEditMessage.textContent = `Editing ${label}.`;
    }
    if (userEditUsername) userEditUsername.value = user.username || '';
    if (userEditDisplay) userEditDisplay.value = user.displayName || '';
    if (userEditPassword) userEditPassword.value = '';
    userEditModal.classList.add('modal-overlay--open');
    userEditModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    userEditUsername?.focus();
  }

  function closeUserEditor() {
    if (!userEditModal) return;
    userEditModal.classList.remove('modal-overlay--open');
    userEditModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    activeUserEditor = null;
  }

  async function handleUserEditorSave() {
    if (!activeUserEditor) return;
    const username = userEditUsername?.value?.trim().toLowerCase() || '';
    const displayName = userEditDisplay?.value?.trim() || '';
    const password = userEditPassword?.value || '';
    if (!username) {
      await showAlert('Username is required.');
      return;
    }
    if (password && password.length < 6) {
      await showAlert('Password must be at least 6 characters.');
      return;
    }
    const payload = { username, displayName };
    if (password) payload.password = password;
    try {
      const res = await authFetch(`/api/users/${activeUserEditor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update user');
      }
      const targetName = displayName || username || activeUserEditor.displayName || activeUserEditor.username || 'user';
      showToast(`User updated: ${targetName}`);
      closeUserEditor();
      loadUsers(true);
    } catch (error) {
      const message = error.message === 'username_exists'
        ? 'That username is already taken.'
        : error.message === 'owner_locked'
          ? 'The owner account cannot be edited.'
          : error.message === 'admin_edit_forbidden'
            ? 'Admin accounts cannot be edited.'
            : normalizeAuthMessage(error, 'Failed to update user');
      await showAlert(normalizeAuthMessage(error, message));
    }
  }

  async function handleUserDelete(user) {
    if (!user?.id) return;
    const confirmed = await modalConfirm({
      title: 'Delete user?',
      message: `Remove "${user.username}" from this instance? Their counters will become unowned.`,
      messageParts: [
        'Remove "',
        { strong: user.username || 'user' },
        '" from this instance? Their counters will become unowned.'
      ],
      confirmLabel: 'Delete user',
      variant: 'danger'
    });
    if (!confirmed) return;
    try {
      const res = await authFetch(`/api/users/${user.id}`, { method: 'DELETE' });
      await assertSession(res);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete user');
      }
      showToast(`User deleted: ${user.displayName || user.username || 'user'}`);
      loadUsers(true);
    } catch (error) {
      await showAlert(normalizeAuthMessage(error, 'Failed to delete user'));
    }
  }

  function setUserStatus(message) {
    if (userStatusLabel) {
      userStatusLabel.textContent = message || '';
    }
  }

/* -------------------------------------------------------------------------- */
/* Event wiring                                                               */
/* -------------------------------------------------------------------------- */
function setupUsers() {
    if (!usersCard) return;
    loadUsers();
    userForm?.addEventListener('submit', handleUserCreate);
    userCreateOpen?.addEventListener('click', openUserCreateModal);
    userCreateCancel?.addEventListener('click', closeUserCreateModal);
    userCreateModal?.addEventListener('click', (event) => {
      if (event.target === userCreateModal) closeUserCreateModal();
    });
    userNameInput?.addEventListener('input', () => setUserNameError(''));
    usersFilterSelect?.addEventListener('change', () => {
      usersPager.filter = usersFilterSelect.value || 'all';
      usersPager.page = 1;
      renderUsersPage();
    });
    usersSearchInput?.addEventListener('input', () => {
      usersPager.page = 1;
      renderUsersPage();
    });
    usersPrevBtn?.addEventListener('click', () => {
      if (usersPager.page > 1) {
        usersPager.page -= 1;
        renderUsersPage();
      }
    });
    usersNextBtn?.addEventListener('click', () => {
      const totalPages = getUsersTotalPages();
      if (usersPager.page < totalPages) {
        usersPager.page += 1;
        renderUsersPage();
      }
    });

    userEditCancel?.addEventListener('click', closeUserEditor);
    userEditModal?.addEventListener('click', (event) => {
      if (event.target === userEditModal) closeUserEditor();
    });
    userEditSave?.addEventListener('click', () => {
      handleUserEditorSave();
    });
  }

  return {
    setupUsers,
    loadUsers
  };
}

export {
  createUsersManager
};
