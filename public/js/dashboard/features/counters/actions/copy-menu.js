/*
  public/js/dashboard/features/counters/actions/copy-menu.js

  This file handles the small menu used to copy script and SVG embeds.
*/

/* -------------------------------------------------------------------------- */
/* Copy menu UI                                                               */
/* -------------------------------------------------------------------------- */
function createCounterCopyMenu(counterId, copyEmbedSnippet) {
  const copyWrap = document.createElement('div');
  copyWrap.className = 'counter-copy';

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'counter-copy-button';
  copyBtn.innerHTML = `<i class="icon" style="--icon:url('/assets/icons/ui/copy.svg')" aria-hidden="true"></i>`;

  const copyMenu = document.createElement('div');
  copyMenu.className = 'counter-copy__menu';

  const copyScript = document.createElement('button');
  copyScript.type = 'button';
  copyScript.innerHTML =
    `<i class="icon" style="--icon:url('/assets/icons/ui/code-s-slash.svg')" aria-hidden="true"></i><span>Copy script</span>`;

  const copySvg = document.createElement('button');
  copySvg.type = 'button';
  copySvg.innerHTML =
    `<i class="icon" style="--icon:url('/assets/icons/ui/image.svg')" aria-hidden="true"></i><span>Copy SVG</span>`;

  copyMenu.append(copyScript, copySvg);
  copyBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    document.querySelectorAll('.counter-copy__menu.is-open').forEach((menu) => {
      if (menu !== copyMenu) menu.classList.remove('is-open');
    });
    copyMenu.classList.toggle('is-open');
  });

  copyScript.addEventListener('click', (event) => {
    event.stopPropagation();
    copyMenu.classList.remove('is-open');
    copyEmbedSnippet(counterId, copyBtn, 'script');
  });

  copySvg.addEventListener('click', (event) => {
    event.stopPropagation();
    copyMenu.classList.remove('is-open');
    copyEmbedSnippet(counterId, copyBtn, 'svg');
  });

  copyWrap.append(copyBtn, copyMenu);
  return copyWrap;
}

export { createCounterCopyMenu };
