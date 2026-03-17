/*
  public/js/home/shared/dom.js

  DOM references used by the home builder page.
*/

/* -------------------------------------------------------------------------- */
/* Builder form refs                                                          */
/* -------------------------------------------------------------------------- */
export const form = document.querySelector('#create-form');
export const resultSection = document.querySelector('#result');
export const snippetCode = document.querySelector('#embedSnippetCode');
export const svgSnippetCode = document.querySelector('#embedSvgSnippetCode');

/* -------------------------------------------------------------------------- */
/* Embed refs                                                                 */
/* -------------------------------------------------------------------------- */
export const embedToggles = Array.from(document.querySelectorAll('.embed-toggle'));
export const embedPanels = Array.from(document.querySelectorAll('[data-embed-panel]'));
export const embedDescs = Array.from(document.querySelectorAll('[data-embed-desc]'));
export const previewTarget = document.querySelector('#previewTarget');

/* -------------------------------------------------------------------------- */
/* Page card refs                                                             */
/* -------------------------------------------------------------------------- */
export const builderSection = document.querySelector('#builderSection');
export const privateDashboardCard = document.querySelector('#privateDashboardCard');
export const stylingCard = document.querySelector('#stylingCard');
export const selfHostCard = document.querySelector('#selfHostCard');

/* -------------------------------------------------------------------------- */
/* Input refs                                                                 */
/* -------------------------------------------------------------------------- */
export const cooldownSelect = document.querySelector('#cooldownSelect');
export const startValueInput = document.querySelector('#startValue');
