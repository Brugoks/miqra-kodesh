// Client for the Wikipedia REST summary API — keyless, CORS-open. Used to
// enrich Wikidata context cards with an intro paragraph and thumbnail.

// Extract the page title from a Wikipedia article URL, or null.
export function wikipediaTitleFromUrl(url) {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)wikipedia\.org$/.test(parsed.hostname)) return null;
    const match = parsed.pathname.match(/^\/wiki\/(.+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

// Fetch the lead-section summary for a Wikipedia article URL.
// Returns { extract, thumbnail, url } or null when unavailable.
export async function fetchWikipediaSummary(wikipediaUrl) {
  const title = wikipediaTitleFromUrl(wikipediaUrl);
  if (!title) return null;
  const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
  if (!res.ok) return null;
  const json = await res.json();
  if (!json?.extract) return null;
  return {
    extract: json.extract,
    thumbnail: json.thumbnail?.source || null,
    url: json.content_urls?.desktop?.page || wikipediaUrl,
  };
}
