/*
  public/js/profile/index.js

  Profile page wiring.
*/

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */
import {
  // Display name UI
  profileDisplayText,
  profileDisplayEdit,
  profileDisplayModal,
  profileDisplayNew,
  profileDisplayError,
  profileDisplaySave,
  profileDisplayCancel,

  // Avatar UI
  profileAvatarButton,
  profileAvatarFile,
  profileAvatarPreview,
  profileAvatarFallback,
  profileAvatarRemove,

  // Password UI
  profilePasswordReset,
  profilePasswordModal,
  profilePasswordMessage,
  profilePasswordCurrent,
  profilePasswordNew,
  profilePasswordCurrentError,
  profilePasswordNewError,
  profilePasswordSave,
  profilePasswordCancel,

  // Username UI
  profileUsernameEdit,
  profileUsernameText,
  profileUsernameModal,
  profileUsernameNew,
  profileUsernamePassword,
  profileUsernameError,
  profileUsernameNewError,
  profileUsernameSave,
  profileUsernameCancel,

  // Role UI
  profileRoleText
} from './shared/dom.js';

import {
  showAlert,
  showToast,
  normalizeProfileError,
  setInlineError
} from './shared/ui.js';

import { createProfileSession } from './core/session.js';
import { createProfileAvatarFeature } from './features/avatar.js';
import { createProfilePasswordFeature } from './features/password.js';
import { createProfileUsernameFeature } from './features/username.js';
import { createProfileDisplayNameFeature } from './features/displayName.js';

/* -------------------------------------------------------------------------- */
/* Feature setup                                                              */
/* -------------------------------------------------------------------------- */
let session;

const avatarFeature = createProfileAvatarFeature({
  // Avatar UI
  profileAvatarButton,
  profileAvatarFile,
  profileAvatarPreview,
  profileAvatarFallback,
  profileAvatarRemove,

  // Avatar feedback
  showToast,
  normalizeProfileError,

  // Avatar session bridge
  authFetch: (...args) => session.authFetch(...args),
  syncProfile: (updated) => session.syncProfile(updated)
});

session = createProfileSession({
  // Profile text UI
  profileUsernameText,
  profileDisplayText,
  profileRoleText,

  // Profile sync helpers
  setAvatarPreview: avatarFeature.setAvatarPreview,
  showToast
});

const passwordFeature = createProfilePasswordFeature({
  // Password UI
  profilePasswordReset,
  profilePasswordModal,
  profilePasswordMessage,
  profilePasswordCurrent,
  profilePasswordNew,
  profilePasswordCurrentError,
  profilePasswordNewError,
  profilePasswordSave,
  profilePasswordCancel,
  profileUsernameText,
  profileDisplayText,

  // Password requests + feedback
  authFetch: session.authFetch,
  showToast,
  showAlert,
  normalizeProfileError,
  setInlineError
});

const usernameFeature = createProfileUsernameFeature({
  // Username UI
  profileUsernameEdit,
  profileUsernameText,
  profileUsernameModal,
  profileUsernameNew,
  profileUsernamePassword,
  profileUsernameError,
  profileUsernameNewError,
  profileUsernameSave,
  profileUsernameCancel,

  // Username requests + feedback
  authFetch: session.authFetch,
  showToast,
  normalizeProfileError,
  setInlineError,
  syncProfile: session.syncProfile
});

const displayNameFeature = createProfileDisplayNameFeature({
  // Display name UI
  profileDisplayEdit,
  profileDisplayText,
  profileDisplayModal,
  profileDisplayNew,
  profileDisplayError,
  profileDisplaySave,
  profileDisplayCancel,

  // Display name requests + feedback
  authFetch: session.authFetch,
  showToast,
  normalizeProfileError,
  setInlineError,
  syncProfile: session.syncProfile
});

/* -------------------------------------------------------------------------- */
/* Init                                                                       */
/* -------------------------------------------------------------------------- */

// Feature binding
avatarFeature.bind();
passwordFeature.bind();
usernameFeature.bind();
displayNameFeature.bind();

// Initial profile load
session.loadProfile();
