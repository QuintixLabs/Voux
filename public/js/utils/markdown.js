/*
  public/js/utils/markdown.js

  Small safe markdown renderer for inline note formatting.
*/

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderNoteMarkdown(value) {
  const source = String(value || '');
  if (!source) return '';

  let html = escapeHtml(source);

  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  html = html.replace(/~~([^~\n][\s\S]*?)~~/g, '<s>$1</s>');
  html = html.replace(/(^|[^~])~([^~\n][\s\S]*?)~(?!~)/g, '$1<s>$2</s>');
  html = html.replace(/\*\*([^*\n][\s\S]*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^*])\*([^*\n][\s\S]*?)\*(?!\*)/g, '$1<em>$2</em>');
  html = html.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  return html;
}

function applyNoteMarkdown(element, value) {
  if (!element) return;
  element.innerHTML = renderNoteMarkdown(value);
}

function isHttpUrl(value) {
  return /^https?:\/\/\S+$/i.test(String(value || '').trim());
}

function attachNoteMarkdownPasteBehavior(textarea) {
  if (!textarea || textarea.dataset.markdownPasteBound === '1') return;
  textarea.dataset.markdownPasteBound = '1';
  textarea.addEventListener('paste', (event) => {
    const selected = textarea.value.slice(
      textarea.selectionStart,
      textarea.selectionEnd
    );
    const url = event.clipboardData?.getData('text/plain') || '';

    if (!selected || !isHttpUrl(url)) return;
    event.preventDefault();
    const replacement = `[${selected}](${url.trim()})`;
    textarea.focus();
    const inserted =
      typeof document.execCommand === 'function' &&
      document.execCommand('insertText', false, replacement);

    if (!inserted) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.setRangeText(replacement, start, end, 'end');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
}

export {
  renderNoteMarkdown,
  applyNoteMarkdown,
  attachNoteMarkdownPasteBehavior
};
