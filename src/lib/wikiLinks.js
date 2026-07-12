// Matches a pasted internal wiki / church-history URL. Same-origin only —
// external URLs like en.wikipedia.org/wiki/… must keep their generic link
// preview. Used by chat unfurls (MessageItem → WikiLinkCard).
export function parseWikiUrl(url) {
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin !== window.location.origin) return null;
    const match = /^\/(wiki|church-history)\/([\w.-]+)$/.exec(parsed.pathname);
    if (!match) return null;
    return { section: match[1], slug: match[2] };
  } catch {
    return null;
  }
}
