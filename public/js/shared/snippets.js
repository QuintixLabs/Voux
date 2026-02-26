/*
  snippets.js

  shared code snippet helpers for main and dashboard pages.
*/

function formatSnippetLanguage(code) {
  const fallback = 'Text';
  if (!code) return fallback;
  const langClass = Array.from(code.classList || []).find((cls) => cls.startsWith('language-'));
  const raw = (langClass || '').replace(/^language-/, '').toLowerCase();
  if (!raw) return fallback;
  if (raw === 'markup') return 'Markup';
  if (raw === 'html') return 'HTML';
  if (raw === 'bash' || raw === 'shell' || raw === 'sh') return 'Bash';
  if (raw === 'css') return 'CSS';
  if (raw === 'javascript' || raw === 'js') return 'JavaScript';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function enhanceCodeSnippets(root = document) {
  root.querySelectorAll('.code-snippet').forEach((snippet) => {
    const pre = snippet.querySelector('pre');
    const button = snippet.querySelector('.copy-button');
    if (!pre || !button) return;

    let header = snippet.querySelector('.code-snippet__top');
    if (!header) {
      header = document.createElement('div');
      header.className = 'code-snippet__top';
      snippet.insertBefore(header, pre);
    }

    let lang = header.querySelector('.code-snippet__lang');
    if (!lang) {
      lang = document.createElement('span');
      lang.className = 'code-snippet__lang';
      header.appendChild(lang);
    }

    const code = snippet.querySelector('code');
    const language = formatSnippetLanguage(code);
    lang.replaceChildren();
    const icon = document.createElement('i');
    icon.className = 'ri-code-s-slash-line';
    icon.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = language;
    lang.append(icon, label);

    if (button.parentElement !== header) {
      header.appendChild(button);
    }
  });
}

function bindSnippetCopyButtons(selector = '.code-snippet .copy-button', root = document) {
  root.querySelectorAll(selector).forEach((button) => {
    button.addEventListener('click', () => {
      const block = button.closest('.code-snippet') || button.parentElement;
      const code = block?.querySelector('code');
      if (!code) return;
      const text = code.textContent;
      if (!text) return;

      navigator.clipboard.writeText(text).then(() => {
        const originalHTML = button.innerHTML;
        button.innerHTML = '<i class="ri-check-line"></i>';
        button.classList.add('copied');
        button.disabled = true;

        setTimeout(() => {
          button.innerHTML = originalHTML;
          button.classList.remove('copied');
          button.disabled = false;
        }, 2000);
      });
    });
  });
}

export {
  enhanceCodeSnippets,
  bindSnippetCopyButtons
};
