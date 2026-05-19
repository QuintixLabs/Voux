/*
  public/js/dashboard/features/tags/updates/catalog.js

  Tag catalog requests and refresh flow.
*/

function createTagCatalogHelpers(deps) {
  const {
    // Shared state
    state,

    // Feedback
    normalizeAuthMessage,
    showAlert,
    showToast,

    // Requests + auth
    authFetch,
    assertAuthorizedResponse,

    // Counter data
    refreshCounters,

    // Tag UI refresh
    refreshTagSelectors,
    renderTagFilterList,
    updateTagCounterHints,
    updateTagFilterButton
  } = deps;

/* -------------------------------------------------------------------------- */
/* Tag fetch                                                                  */
/* -------------------------------------------------------------------------- */
async function fetchTags() {
  if (!state.user) return;
  if (state.isAdmin && state.user?.adminPermissions?.tags === false) {
    state.tags = [];
    state.tagFilter = [];
    state.createTags = [];
    refreshTagSelectors();
    renderTagFilterList();
    updateTagCounterHints();
    updateTagFilterButton();
    return;
  }
  try {
    const res = await authFetch('/api/tags');
    await assertAuthorizedResponse(res);
    if (!res.ok) {
      throw new Error('Failed to load tags');
    }
    const payload = await res.json().catch(() => ({}));
    const tags = Array.isArray(payload.tags) ? payload.tags : [];
    state.tags = tags;
    state.tagFilter = state.tagFilter.filter((id) =>
      tags.some((tag) => tag.id === id)
    );
    state.createTags = state.createTags.filter((id) =>
      tags.some((tag) => tag.id === id)
    );
    refreshTagSelectors();
    renderTagFilterList();
    updateTagCounterHints();
    updateTagFilterButton();
  } catch (error) {
    if (error?.code !== 'forbidden') {
      console.warn('Failed to fetch tags', error);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Tag create/update/delete                                                   */
/* -------------------------------------------------------------------------- */
async function createTagRequest(payload) {
  try {
    const res = await authFetch('/api/tags', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    await assertAuthorizedResponse(res);
    if (!res.ok) {
      throw new Error(data.error || 'Failed to create tag');
    }
    const createdTag = data?.tag || null;
    await fetchTags();
    showToast(`Created tag "${createdTag?.name || payload?.name || 'tag'}"`);
    return createdTag;
  } catch (error) {
    await showAlert(normalizeAuthMessage(error, 'Failed to create tag'));
    return null;
  }
}

async function updateTagRequest(tagId, payload) {
  try {
    const res = await authFetch(`/api/tags/${tagId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update tag');
    }
    await fetchTags();
    refreshTagSelectors();
    showToast(`Updated tag "${payload?.name || tagId}"`);
    return true;
  } catch (error) {
    await showAlert(normalizeAuthMessage(error, 'Failed to update tag'));
    return false;
  }
}

async function deleteTagRequest(tagId, name) {
  try {
    const res = await authFetch(`/api/tags/${encodeURIComponent(tagId)}`, {
      method: 'DELETE'
    });
    await assertAuthorizedResponse(res);
    if (res.status === 404) throw new Error('Tag not found.');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to delete tag');
    }
    await fetchTags();
    await refreshCounters(state.page, { silent: true });
    updateTagCounterHints();
    showToast(`Deleted tag "${name || tagId}"`);
    return true;
  } catch (error) {
    await showAlert(normalizeAuthMessage(error, 'Failed to delete tag'));
    return false;
  }
}


  return {
    // Tag fetch
    fetchTags,

    // Tag create/update/delete
    createTagRequest,
    updateTagRequest,
    deleteTagRequest
  };
}

export { createTagCatalogHelpers };
