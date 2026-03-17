/*
  dashboard/shared/dom.js

  DOM references used by the dashboard module.
*/

/* -------------------------------------------------------------------------- */
/* Auth + shell refs                                                          */
/* -------------------------------------------------------------------------- */
export const loginCard = document.querySelector('#loginCard');
export const dashboardCard = document.querySelector('#dashboardCard');
export const adminForm = document.querySelector('#admin-form');
export const loginUsernameInput = document.querySelector('#loginUsername');
export const loginPasswordInput = document.querySelector('#loginPassword');
export const loginError = document.querySelector('#loginError');
export const loginStatus = document.querySelector('#loginStatus');
export const dashboardSubtitle = document.querySelector('#dashboardSubtitle');

/* -------------------------------------------------------------------------- */
/* Selection refs                                                             */
/* -------------------------------------------------------------------------- */
export const selectionToolbar = document.querySelector('#selectionToolbar');
export const selectionCountEl = document.querySelector('#selectionCount');
export const selectAllBtn = document.querySelector('#selectAll');
export const downloadSelectedBtn = document.querySelector('#downloadSelected');
export const addTagsSelectedBtn = document.querySelector('#addTagsSelected');
export const deleteSelectedBtn = document.querySelector('#deleteSelected');
export const clearSelectionBtn = document.querySelector('#clearSelection');

/* -------------------------------------------------------------------------- */
/* Counter list + paging refs                                                 */
/* -------------------------------------------------------------------------- */
export const adminControls = document.querySelector('#adminControls');
export const counterListEl = document.querySelector('#counterList');
export const deleteAllBtn = document.querySelector('#deleteAll');
export const deleteFilteredBtn = document.querySelector('#deleteFiltered');
export const paginationEl = document.querySelector('#adminPagination');
export const prevPageBtn = document.querySelector('#prevPage');
export const nextPageBtn = document.querySelector('#nextPage');
export const paginationInfo = document.querySelector('#paginationInfo');
export const counterTotalValue = document.querySelector('#counterTotalValue');
export const counterSearchInput = document.querySelector('#counterSearchInput');
export const counterSearchClear = document.querySelector('#counterSearchClear');

/* -------------------------------------------------------------------------- */
/* Create counter refs                                                        */
/* -------------------------------------------------------------------------- */
export const createForm = document.querySelector('#create-admin-form');
export const createLabelInput = document.querySelector('#adminLabel');
export const createNoteInput = document.querySelector('#adminNote');
export const createStartInput = document.querySelector('#adminStartValue');
export const adminEmbedBlock = document.querySelector('#adminEmbedBlock');
export const adminEmbedSnippetCode = document.querySelector('#adminEmbedSnippetCode');
export const adminEmbedSvgSnippetCode = document.querySelector('#adminEmbedSvgSnippetCode');
export const embedToggles = Array.from(document.querySelectorAll('.embed-toggle'));
export const embedPanels = Array.from(document.querySelectorAll('[data-embed-panel]'));
export const embedDescs = Array.from(document.querySelectorAll('[data-embed-desc]'));
export const createCard = document.querySelector('#createCard');
export const adminCooldownSelect = document.querySelector('#adminCooldownSelect');
export const adminPreview = document.querySelector('#adminPreview');
export const adminPreviewTarget = document.querySelector('#adminPreviewTarget');

/* -------------------------------------------------------------------------- */
/* Filter refs                                                                */
/* -------------------------------------------------------------------------- */
export const modeFilterSelect = document.querySelector('#modeFilter');
export const sortFilterSelect = document.querySelector('#sortFilter');
export const activityRangeControls = document.querySelector('#activityRangeControls');
export const adminThrottleHint = document.querySelector('#adminThrottleHint');

/* -------------------------------------------------------------------------- */
/* Tag refs                                                                   */
/* -------------------------------------------------------------------------- */
export const tagFilterControls = document.querySelector('#tagFilterControls');
export const tagFilterButton = document.querySelector('#tagFilterButton');
export const tagFilterMenu = document.querySelector('#tagFilterMenu');
export const tagFilterList = document.querySelector('#tagFilterList');
export const clearTagFilterBtn = document.querySelector('#clearTagFilter');
export const tagFilterCreateBtn = document.querySelector('#tagFilterCreate');
export const createTagPicker = document.querySelector('#createTagPicker');
export const createTagManageBtn = document.querySelector('#createTagManage');
export const createTagCounterHint = document.querySelector('#createTagCounterHint');
export const tagFilterCountHint = document.querySelector('.tag-count-hint');

/* -------------------------------------------------------------------------- */
/* Misc refs                                                                  */
/* -------------------------------------------------------------------------- */
export const topPaginationInfo = document.querySelector('#topPaginationInfo');
export const ownerFilterWrap = document.querySelector('#ownerFilterWrap');
export const ownerFilterToggle = document.querySelector('#ownerFilterToggle');
export const themeHelper = window.VouxTheme;
