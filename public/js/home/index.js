/*
  public/js/home/index.js

  Home page wiring for counter creation, embed preview, and guide interactions.
*/

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */
import { enhanceCodeSnippets, bindSnippetCopyButtons } from '../utils/snippets.js';
import {
  form,
  resultSection,
  snippetCode,
  svgSnippetCode,
  embedToggles,
  embedPanels,
  embedDescs,
  previewTarget,
  builderSection,
  privateDashboardCard,
  stylingCard,
  selfHostCard,
  cooldownSelect,
  startValueInput
} from './shared/dom.js';
import {
  showAlert,
  buildCreateCounterErrorMessage
} from './shared/ui.js';
import {
  initGuideExpanders,
  toggleGuideCards
} from './features/guides.js';
import { createHomeEmbedManager } from './features/embed.js';
import { createHomeCreateCounterManager } from './core/createCounter.js';

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */
const START_VALUE_DIGIT_LIMIT = 18;
const themeHelper = window.VouxTheme;

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */
const embedManager = createHomeEmbedManager({
  embedToggles,
  embedPanels,
  embedDescs,
  previewTarget
});

const createCounterManager = createHomeCreateCounterManager({
  form,
  cooldownSelect,
  startValueInput,
  builderSection,
  privateDashboardCard,
  START_VALUE_DIGIT_LIMIT,
  showAlert,
  buildCreateCounterErrorMessage,
  themeHelper,
  onGuideVisibilityChange: (shouldShow) => toggleGuideCards([stylingCard, selfHostCard], shouldShow),
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
