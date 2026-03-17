/*
  public/js/profile/shared/dom.js

  DOM references for profile page features.
*/

/* -------------------------------------------------------------------------- */
/* Display name                                                               */
/* -------------------------------------------------------------------------- */
const profileDisplayText = document.getElementById('profileDisplayText');
const profileDisplayEdit = document.getElementById('profileDisplayEdit');

/* -------------------------------------------------------------------------- */
/* Avatar                                                                     */
/* -------------------------------------------------------------------------- */
const profileAvatarButton = document.getElementById('profileAvatarButton');
const profileAvatarFile = document.getElementById('profileAvatarFile');
const profileAvatarPreview = document.getElementById('profileAvatarPreview');
const profileAvatarFallback = document.getElementById('profileAvatarFallback');
const profileAvatarRemove = document.getElementById('profileAvatarRemove');

/* -------------------------------------------------------------------------- */
/* Password modal                                                             */
/* -------------------------------------------------------------------------- */
const profilePasswordReset = document.getElementById('profilePasswordReset');
const profilePasswordModal = document.getElementById('profilePasswordModal');
const profilePasswordMessage = document.getElementById('profilePasswordMessage');
const profilePasswordCurrent = document.getElementById('profilePasswordCurrent');
const profilePasswordNew = document.getElementById('profilePasswordNew');
const profilePasswordCurrentError = document.getElementById('profilePasswordCurrentError');
const profilePasswordNewError = document.getElementById('profilePasswordNewError');
const profilePasswordSave = document.getElementById('profilePasswordSave');
const profilePasswordCancel = document.getElementById('profilePasswordCancel');

/* -------------------------------------------------------------------------- */
/* Username modal                                                             */
/* -------------------------------------------------------------------------- */
const profileUsernameEdit = document.getElementById('profileUsernameEdit');
const profileUsernameText = document.getElementById('profileUsernameText');
const profileUsernameModal = document.getElementById('profileUsernameModal');
const profileUsernameNew = document.getElementById('profileUsernameNew');
const profileUsernamePassword = document.getElementById('profileUsernamePassword');
const profileUsernameError = document.getElementById('profileUsernameError');
const profileUsernameNewError = document.getElementById('profileUsernameNewError');
const profileUsernameSave = document.getElementById('profileUsernameSave');
const profileUsernameCancel = document.getElementById('profileUsernameCancel');

/* -------------------------------------------------------------------------- */
/* Display-name modal                                                         */
/* -------------------------------------------------------------------------- */
const profileDisplayModal = document.getElementById('profileDisplayModal');
const profileDisplayNew = document.getElementById('profileDisplayNew');
const profileDisplayError = document.getElementById('profileDisplayError');
const profileDisplaySave = document.getElementById('profileDisplaySave');
const profileDisplayCancel = document.getElementById('profileDisplayCancel');

/* -------------------------------------------------------------------------- */
/* Other profile refs                                                         */
/* -------------------------------------------------------------------------- */
const profileRoleText = document.getElementById('profileRoleText');

export {
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
};
