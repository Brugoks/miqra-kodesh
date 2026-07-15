// URL detection shared by chat message rendering and link preview cards.

export const URL_RE = /https?:\/\/[^\s<]+[^\s<.,:;"')\]!?]/g;

export function firstUrl(text) {
  const match = String(text || '').match(URL_RE);
  return match ? match[0] : null;
}

export function allUrls(text) {
  return String(text || '').match(URL_RE) || [];
}
