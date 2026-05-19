/*
  public/js/home/index.js

  Home page wiring for counter creation, embed preview, and guide interactions.
*/

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */
import {
  enhanceCodeSnippets,
  bindSnippetCopyButtons
} from '../utils/snippets.js';
import {
  // Form + results
  form,
  resultSection,
  snippetCode,
  svgSnippetCode,

  // Embed preview
  embedToggles,
  embedPanels,
  embedDescs,
  previewTarget,

  // Home sections
  builderSection,
  privateDashboardCard,
  stylingCard,
  selfHostCard,

  // Counter inputs
  cooldownSelect,
  startValueInput
} from './shared/dom.js';
import { showAlert, buildCreateCounterErrorMessage } from './shared/ui.js';
import { initGuideExpanders, toggleGuideCards } from './features/guides.js';
import { createHomeEmbedManager } from './features/embed.js';
import { createHomeCreateCounterManager } from './core/createCounter.js';

// constants
const START_VALUE_DIGIT_LIMIT = 18;
const themeHelper = window.VouxTheme;

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */
const embedManager = createHomeEmbedManager({
  // Embed controls
  embedToggles,
  embedPanels,
  embedDescs,

  // Embed preview
  previewTarget
});

const createCounterManager = createHomeCreateCounterManager({
  // Form controls
  form,
  cooldownSelect,
  startValueInput,

  // Home sections
  builderSection,
  privateDashboardCard,

  // Limits + feedback
  START_VALUE_DIGIT_LIMIT,
  showAlert,
  buildCreateCounterErrorMessage,

  // Home shell
  themeHelper,
  onGuideVisibilityChange: (shouldShow) =>
    toggleGuideCards([stylingCard, selfHostCard], shouldShow),
  onCounterCreated: (data) => {
    if (snippetCode) snippetCode.textContent = data.embedCode || '';
    if (svgSnippetCode) svgSnippetCode.textContent = data.embedSvgCode || '';
    if (window.Prism?.highlightAll) {
      window.Prism.highlightAll();
    }
    resultSection?.classList.remove('hidden');
    embedManager.setEmbedMode(embedManager.getEmbedMode());
    embedManager.renderPreview(data.embedUrl);
  }
});

/* -------------------------------------------------------------------------- */
/* Init                                                                       */
/* -------------------------------------------------------------------------- */
initGuideExpanders(document);
embedManager.bindEmbedToggleEvents();
enhanceCodeSnippets();
bindSnippetCopyButtons('.copy-button');
createCounterManager.init();
