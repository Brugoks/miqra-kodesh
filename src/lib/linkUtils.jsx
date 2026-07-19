// URL detection shared by chat message rendering and link preview cards.

export const URL_RE = /https?:\/\/[^\s<]+[^\s<.,:;"')\]!?]/g;

export function firstUrl(text) {
  const match = String(text || '').match(URL_RE);
  return match ? match[0] : null;
}

export function allUrls(text) {
  return String(text || '').match(URL_RE) || [];
}

// Plain-text bodies (announcements, etc.) that just need bare URLs turned
// into clickable links — no mentions/markdown, unlike chat's renderChatMarkdown.
export function linkifyText(text, keyPrefix = 'lnk') {
  const str = String(text || '');
  if (!str) return str;
  const nodes = [];
  let last = 0;
  let index = 0;
  // Fresh RegExp per call — URL_RE carries the 'g' flag, so reusing the
  // shared exported instance here would leak lastIndex into its other
  // callers (firstUrl/allUrls use .match(), which isn't affected, but a
  // second linkifyText mid-scan would be).
  const re = new RegExp(URL_RE.source, URL_RE.flags);
  let match;
  while ((match = re.exec(str)) !== null) {
    if (match.index > last) nodes.push(str.slice(last, match.index));
    const url = match[0];
    nodes.push(
      <a key={`${keyPrefix}-${index++}`} href={url} target="_blank" rel="noopener noreferrer">
        {url}
      </a>
    );
    last = match.index + url.length;
  }
  if (!nodes.length) return str;
  if (last < str.length) nodes.push(str.slice(last));
  return nodes;
}
