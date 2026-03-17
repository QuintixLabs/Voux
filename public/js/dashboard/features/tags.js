/*
  dashboard/features/tags.js

  Tag UI helpers shared across dashboard sections.
*/

import { normalizeHexColor, getTagContrastColor } from '../shared/helpers.js';

/* -------------------------------------------------------------------------- */
/* Tag helpers                                                                */
/* -------------------------------------------------------------------------- */
function applyTagStyles(element, color, options = {}) {
  if (!element) return;
  const normalized = normalizeHexColor(color) || '#4c6ef5';
  element.style.setProperty('--tag-color', normalized);
  const shouldApplyText = options.textContrast !== false;
  if (shouldApplyText) {
    element.style.setProperty('--tag-text-color', getTagContrastColor(normalized));
  } else {
    element.style.removeProperty('--tag-text-color');
  }
}

function buildTagBadges(tags) {
  if (!Array.isArray(tags) || !tags.length) return null;
  const wrapper = document.createElement('div');
  wrapper.className = 'counter-tags';
  tags.forEach((tag) => {
    if (!tag) return;
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    const tagId = typeof tag === 'string' ? tag : tag.id;
    if (tagId) {
      chip.dataset.tagId = tagId;
    }
    applyTagStyles(chip, tag.color, { textContrast: false });
    const chipLabel = document.createElement('span');
    chipLabel.className = 'tag-chip__label';
    chipLabel.textContent = tag.name || tag.id;
    chip.appendChild(chipLabel);
    wrapper.appendChild(chip);
  });
  return wrapper;
}

export {
  applyTagStyles,
  buildTagBadges
};
