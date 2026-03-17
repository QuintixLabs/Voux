/*
  dashboard/core/data.js

  Counter data fetch and response application helpers.
*/

/* -------------------------------------------------------------------------- */
/* Data manager                                                               */
/* -------------------------------------------------------------------------- */
function createDashboardData(deps) {
  const {
    state,
    authFetch,
    buildUnauthorizedError,
    canPatchCounters,
    patchCounterRows,
    renderCounterList,
    updatePagination,
    updateCounterTotal,
    updateTagCounterHints,
    updateDeleteFilteredState,
    adminControls,
    counterListEl
  } = deps;

/* -------------------------------------------------------------------------- */
/* Counter response apply                                                     */
/* -------------------------------------------------------------------------- */
function applyCounterResponse(data, counters, options = {}) {
    const { silent = false } = options;
    const selectionSnapshot = silent ? snapshotDashboardTextSelection() : null;
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
    if (selectionSnapshot) {
      restoreDashboardTextSelection(selectionSnapshot);
    }
  }

/* -------------------------------------------------------------------------- */
/* Text selection snapshot/restore                                            */
/* -------------------------------------------------------------------------- */
function snapshotDashboardTextSelection() {
    const selection = window.getSelection?.();
    if (!isSelectionInsideCounterList(selection)) {
      return null;
    }
    const anchor = snapshotSelectionPosition(selection.anchorNode, selection.anchorOffset);
    const focus = snapshotSelectionPosition(selection.focusNode, selection.focusOffset);
    if (!anchor || !focus) {
      return null;
    }
    return {
      anchor,
      focus,
      backward: isSelectionBackward(selection)
    };
  }

  function restoreDashboardTextSelection(snapshot) {
    if (!snapshot) return;
    const selection = window.getSelection?.();
    if (!selection) return;
    try {
      const restored = restoreSelectionSnapshot(snapshot);
      if (!restored) return;
      applySelectionRange(selection, restored, snapshot.backward);
    } catch {
      // If DOM changed too much to restore, skip silently.
    }
  }

  function snapshotSelectionPosition(node, offset) {
    if (!node || !counterListEl || !counterListEl.contains(node)) {
      return null;
    }
    const path = getNodePathFromCounterList(node);
    if (!path) return null;
    return { path, offset };
  }

  function restoreSelectionPosition(snapshot) {
    if (!snapshot || !counterListEl) {
      return null;
    }
    let node = resolveNodeFromPath(snapshot.path);
    if (!node) return null;
    const maxOffset = node.nodeType === Node.TEXT_NODE
      ? (node.textContent ? node.textContent.length : 0)
      : node.childNodes.length;
    const clampedOffset = Math.max(0, Math.min(snapshot.offset, maxOffset));
    return { node, offset: clampedOffset };
  }

  function isSelectionBackward(selection) {
    if (!selection?.anchorNode || !selection.focusNode) {
      return false;
    }
    if (selection.anchorNode === selection.focusNode) {
      return selection.anchorOffset > selection.focusOffset;
    }
    const position = selection.anchorNode.compareDocumentPosition(selection.focusNode);
    return Boolean(position & Node.DOCUMENT_POSITION_PRECEDING);
  }

  function isSelectionInsideCounterList(selection) {
    if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !counterListEl) {
      return false;
    }
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const containerEl = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
    return Boolean(containerEl && counterListEl.contains(containerEl));
  }

  function restoreSelectionSnapshot(snapshot) {
    const anchor = restoreSelectionPosition(snapshot.anchor);
    const focus = restoreSelectionPosition(snapshot.focus);
    if (!anchor || !focus) {
      return null;
    }
    return { anchor, focus };
  }

  function applySelectionRange(selection, restored, backward) {
    const { anchor, focus } = restored;
    selection.removeAllRanges();
    if (typeof selection.setBaseAndExtent === 'function') {
      if (backward) {
        selection.setBaseAndExtent(focus.node, focus.offset, anchor.node, anchor.offset);
      } else {
        selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
      }
      return;
    }
    const range = document.createRange();
    range.setStart(anchor.node, anchor.offset);
    range.setEnd(focus.node, focus.offset);
    selection.addRange(range);
  }

  function getNodePathFromCounterList(node) {
    const path = [];
    let current = node;
    while (current && current !== counterListEl) {
      const parent = current.parentNode;
      if (!parent) return null;
      const index = Array.prototype.indexOf.call(parent.childNodes, current);
      if (index < 0) return null;
      path.push(index);
      current = parent;
    }
    if (current !== counterListEl) return null;
    return path.reverse();
  }

  function resolveNodeFromPath(path) {
    if (!Array.isArray(path) || !counterListEl) return null;
    let node = counterListEl;
    for (let i = 0; i < path.length; i += 1) {
      const idx = path[i];
      if (!node?.childNodes || idx < 0 || idx >= node.childNodes.length) {
        return null;
      }
      node = node.childNodes[idx];
    }
    return node;
  }

/* -------------------------------------------------------------------------- */
/* Counter fetch + cache                                                      */
/* -------------------------------------------------------------------------- */
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
      throw buildUnauthorizedError(err?.message || 'unauthorized');
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

  return {
    applyCounterResponse,
    fetchCounters,
    updateCounterCache
  };
}

export { createDashboardData };
