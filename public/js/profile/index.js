/*
  public/js/profile/index.js

  Profile page wiring.
*/

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */
import {
  profileDisplayText,
  profileDisplayEdit,
  profileAvatarButton,
  profileAvatarFile,
  profileAvatarPreview,
  profileAvatarFallback,
  profileAvatarRemove,
  profilePasswordReset,
  profilePasswordModal,
  profilePasswordMessage,
  profilePasswordCurrent,
  profilePasswordNew,
  profilePasswordCurrentError,
  profilePasswordNewError,
  profilePasswordSave,
  profilePasswordCancel,
  profileUsernameEdit,
  profileUsernameText,
  profileUsernameModal,
  profileUsernameNew,
  profileUsernamePassword,
  profileUsernameError,
  profileUsernameNewError,
  profileUsernameSave,
  profileUsernameCancel,
  profileDisplayModal,
  profileDisplayNew,
  profileDisplayError,
  profileDisplaySave,
  profileDisplayCancel,
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
  profileAvatarButton,
  profileAvatarFile,
  profileAvatarPreview,
  profileAvatarFallback,
  profileAvatarRemove,
  showToast,
  normalizeProfileError,
  authFetch: (...args) => session.authFetch(...args),
  syncProfile: (updated) => session.syncProfile(updated)
});

session = createProfileSession({
  profileUsernameText,
  profileDisplayText,
  profileRoleText,
  setAvatarPreview: avatarFeature.setAvatarPreview,
  showToast
});

const passwordFeature = createProfilePasswordFeature({
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
  authFetch: session.authFetch,
  showToast,
  showAlert,
  normalizeProfileError,
  setInlineError
});

const usernameFeature = createProfileUsernameFeature({
  profileUsernameEdit,
  profileUsernameText,
  profileUsernameModal,
  profileUsernameNew,
  profileUsernamePassword,
  profileUsernameError,
  profileUsernameNewError,
  profileUsernameSave,
  profileUsernameCancel,
  authFetch: session.authFetch,
  showToast,
  normalizeProfileError,
  setInlineError,
  syncProfile: session.syncProfile
});

const displayNameFeature = createProfileDisplayNameFeature({
  profileDisplayEdit,
  profileDisplayText,
  profileDisplayModal,
  profileDisplayNew,
  profileDisplayError,
  profileDisplaySave,
  profileDisplayCancel,
  authFetch: session.authFetch,
  showToast,
  normalizeProfileError,
  setInlineError,
  syncProfile: session.syncProfile
});

/* -------------------------------------------------------------------------- */
/* Init                                                                       */
/* -------------------------------------------------------------------------- */
avatarFeature.bind();
passwordFeature.bind();
usernameFeature.bind();
displayNameFeature.bind();
session.loadProfile();
