/*
  public/js/home/shared/ui.js

  UI helpers for alerts and home page error messages.
*/

/* -------------------------------------------------------------------------- */
/* Modal bridge                                                               */
/* -------------------------------------------------------------------------- */
function modalApi() {
  return window.VouxModal;
}

async function showAlert(message, options) {
  if (modalApi()?.alert) {
    await modalApi().alert(message, options);
  } else {
    window.alert(message);
  }
}

/* -------------------------------------------------------------------------- */
/* API error mapping                                                          */
/* -------------------------------------------------------------------------- */
function buildCreateCounterErrorMessage(error, status) {
  if (error && error.error === 'csrf_blocked') {
    return 'Request blocked (CSRF). Open this instance from its configured URL and try again.';
  }
  if (status === 401 || status === 403) {
    return 'This instance is private. Log in to create counters.';
  }
  if (error && error.error === 'unauthorized') {
    return 'This instance is private. Log in to create counters.';
  }
  if (error && typeof error.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }
  if (error && error.error === 'rate_limited') {
    const wait = typeof error.retryAfterSeconds === 'number' ? error.retryAfterSeconds : null;
    if (wait) {
      const pretty = wait === 1 ? '1 second' : `${wait} seconds`;
      return `Too many new counters at once. Try again in ${pretty}.`;
    }
    return 'Too many new counters right now. Try again in a moment.';
  }
  if (error && typeof error.error === 'string') {
    return error.error;
  }
  if (status === 413) {
    return 'Payload too large.';
  }
  return 'Failed to create counter. Please try again.';
}

export {
  showAlert,
  buildCreateCounterErrorMessage
};
