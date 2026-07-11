// Strip rich-text HTML down to a safe formatting subset before rendering with
// dangerouslySetInnerHTML (RichTextEditor output, legacy plain-text notes).
const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'h2', 'h3',
  'ul', 'ol', 'li', 'blockquote', 'hr', 'span',
]);

export function sanitizeHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('*').forEach(el => {
    if (!ALLOWED_TAGS.has(el.tagName.toLowerCase())) {
      el.replaceWith(...el.childNodes);
    } else {
      Array.from(el.attributes).forEach(attr => el.removeAttribute(attr.name));
    }
  });
  return div.innerHTML;
}

export function isHtml(str) {
  return typeof str === 'string' && /<[a-z][\s\S]*>/i.test(str);
}
