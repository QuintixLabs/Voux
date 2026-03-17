/*
  public/js/home/features/guides.js

  Guide expander interactions and guide-card visibility helpers.
*/

/* -------------------------------------------------------------------------- */
/* Expanders                                                                  */
/* -------------------------------------------------------------------------- */
function initGuideExpanders(root = document) {
  root.querySelectorAll('.expander').forEach((details) => {
    const content = details.querySelector('.expander__content');
    const summary = details.querySelector('summary');
    const arrow = summary?.querySelector('i');
    if (!content || !summary) return;

    let isAnimating = false;
    let closeTimeout = null;

    summary.addEventListener('click', (event) => {
      event.preventDefault();
      if (isAnimating) return;

      if (closeTimeout) {
        clearTimeout(closeTimeout);
        closeTimeout = null;
      }

      isAnimating = true;

      if (details.open) {
        if (arrow) {
          arrow.style.transform = 'rotate(0deg)';
        }
        content.style.gridTemplateRows = '1fr';
        void content.offsetHeight;
        requestAnimationFrame(() => {
          content.style.gridTemplateRows = '0fr';
        });
        closeTimeout = setTimeout(() => {
          details.removeAttribute('open');
          if (arrow) {
            arrow.style.transform = '';
          }
          isAnimating = false;
          closeTimeout = null;
        }, 400);
      } else {
        details.setAttribute('open', '');
        if (arrow) {
          arrow.style.transform = 'rotate(180deg)';
        }
        content.style.gridTemplateRows = '0fr';
        void content.offsetHeight;
        requestAnimationFrame(() => {
          content.style.gridTemplateRows = '1fr';
          setTimeout(() => {
            if (arrow) {
              arrow.style.transform = '';
            }
            isAnimating = false;
          }, 400);
        });
      }
    });

    if (!details.open) {
      content.style.gridTemplateRows = '0fr';
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Guide cards                                                                */
/* -------------------------------------------------------------------------- */
function toggleGuideCards(cards, shouldShow) {
  (cards || []).forEach((card) => {
    if (!card) return;
    card.classList.toggle('hidden', !shouldShow);
  });
}

export {
  initGuideExpanders,
  toggleGuideCards
};
