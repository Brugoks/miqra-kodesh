import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { recordUsageEvent } from '../_shared/usage.ts';

// Fetch a URL shared in chat and return its Open Graph metadata so the client
// can render a preview card. No external service — just a capped HTML fetch
// and tag parsing. Guarded against SSRF: http(s) only, no private hosts.

const MAX_HTML_BYTES = 250_000;
const FETCH_TIMEOUT_MS = 6_000;

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return true;
  // IPv4 literals in private/reserved ranges
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
  }
  // IPv6 literals (bracketed hostnames arrive without brackets from URL)
  if (host.includes(':')) return true;
  return false;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function extractMeta(html: string, keys: string[]): string | null {
  for (const key of keys) {
    // property/name in either attribute order
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`, 'i'),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return decodeEntities(match[1].trim());
    }
  }
  return null;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const { url } = (await request.json()) as { url: string };
    if (!url) return jsonResponse({ error: 'url is required' }, 400);

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return jsonResponse({ error: 'Invalid URL' }, 400);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return jsonResponse({ error: 'Only http(s) URLs are supported' }, 400);
    }
    if (isPrivateHost(parsed.hostname)) {
      return jsonResponse({ error: 'Host not allowed' }, 400);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(parsed.href, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MiqraKodeshBot/1.0; link previews)',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
    } finally {
      clearTimeout(timer);
    }

    await recordUsageEvent({
      provider: 'link-preview',
      feature: 'og-fetch',
      status: res.status,
      request,
      metadata: { host: parsed.hostname },
    });

    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('html')) {
      return jsonResponse({ preview: null });
    }

    // Read at most MAX_HTML_BYTES — OG tags live in <head>.
    const reader = res.body?.getReader();
    let html = '';
    if (reader) {
      const decoder = new TextDecoder();
      let received = 0;
      while (received < MAX_HTML_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        html += decoder.decode(value, { stream: true });
      }
      reader.cancel().catch(() => {});
    }

    const title = extractMeta(html, ['og:title', 'twitter:title'])
      || decodeEntities((html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '').trim())
      || null;
    const description = extractMeta(html, ['og:description', 'twitter:description', 'description']);
    let image = extractMeta(html, ['og:image', 'twitter:image']);
    if (image && !/^https?:\/\//i.test(image)) {
      try {
        image = new URL(image, parsed.href).href;
      } catch {
        image = null;
      }
    }
    const siteName = extractMeta(html, ['og:site_name']) || parsed.hostname;

    if (!title) return jsonResponse({ preview: null });

    return jsonResponse({
      preview: {
        url: parsed.href,
        title: title.slice(0, 200),
        description: description ? description.slice(0, 300) : null,
        image,
        siteName,
      },
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      return jsonResponse({ preview: null });
    }
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
