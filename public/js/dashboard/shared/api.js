/*
  dashboard/shared/api.js

  Network helpers for dashboard requests.
*/

/* -------------------------------------------------------------------------- */
/* Request helpers                                                            */
/* -------------------------------------------------------------------------- */
export function authFetch(url, options = {}) {
  return fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      ...options.headers
    }
  });
}

export async function fetchRuntimeConfig() {
  if (window.VouxState?.getConfig) {
    return window.VouxState.getConfig();
  }
  const res = await fetch('/api/config');
  if (!res.ok) return null;
  return res.json();
}

export async function fetchSession(force = true) {
  if (window.VouxState?.getSession) {
    return window.VouxState.getSession({ force });
  }
  const res = await fetch('/api/session', { credentials: 'include' });
  if (!res.ok) return null;
  return res.json();
}

/* -------------------------------------------------------------------------- */
/* Auth endpoints                                                             */
/* -------------------------------------------------------------------------- */
export function login(username, password) {
  return fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username, password })
  });
}
