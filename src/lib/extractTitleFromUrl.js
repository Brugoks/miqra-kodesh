// Derives a human-readable title from a resource URL (Amazon product links,
// generic slugs, or the bare domain as a fallback). Used to autofill the
// study-resource label on small groups.
export function extractTitleFromUrl(urlString) {
  if (!urlString) return '';
  try {
    let targetUrl = urlString.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = 'https://' + targetUrl;
    }
    const parsed = new URL(targetUrl);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname;

    let rawTitle = '';

    // 1. Amazon pattern
    if (host.includes('amazon.')) {
      const parts = path.split('/').filter(Boolean);
      if (parts.length > 0) {
        if (parts[0] !== 'dp' && !(parts[0] === 'gp' && parts[1] === 'product')) {
          rawTitle = parts[0];
        }
      }
    }

    // 2. Generic path segment search
    if (!rawTitle) {
      const parts = path.split('/').filter(Boolean);
      if (parts.length > 0) {
        for (let i = parts.length - 1; i >= 0; i--) {
          const part = parts[i];
          const isNumeric = /^\d+$/.test(part);
          const isCode = part.length < 4 || (part.length < 10 && /[0-9]/.test(part));
          if (!isNumeric && !isCode) {
            rawTitle = part;
            break;
          }
        }
        if (!rawTitle) {
          rawTitle = parts[parts.length - 1] || parts[0] || '';
        }
      }
    }

    if (!rawTitle) {
      let domain = host.replace(/^www\./i, '');
      const dotIndex = domain.indexOf('.');
      if (dotIndex > 0) {
        domain = domain.substring(0, dotIndex);
      }
      return domain.charAt(0).toUpperCase() + domain.slice(1);
    }

    // Clean and split
    let clean = decodeURIComponent(rawTitle)
      .replace(/[-_]+/g, ' ')
      .trim();

    // Remove Amazon query/tracking or trailing code-like words
    clean = clean.replace(/\b(dp|product|gp|ref|ref=.*)\b.*$/i, '').trim();

    const acronyms = ['esv', 'niv', 'nasb', 'kjv', 'nlt', 'nkjv', 'hcsb', 'csb', 'amp', 'msg', 'net'];
    const lowercaseWords = ['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'from', 'by', 'of', 'in', 'with', 'about'];

    const words = clean.split(/\s+/).filter(Boolean);
    const titleCased = words.map((word, index) => {
      const lowerWord = word.toLowerCase();
      if (acronyms.includes(lowerWord)) {
        return word.toUpperCase();
      }
      if (index > 0 && lowercaseWords.includes(lowerWord)) {
        return lowerWord;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');

    return titleCased;
  } catch {
    return '';
  }
}
