import { supabase } from './supabaseClient';

// Open Graph metadata for a URL, fetched through the link-preview edge
// function and cached per session so chat preview cards and the music
// mini-player don't refetch the same link.

const memoryCache = new Map();

function readCache(url) {
  if (memoryCache.has(url)) return memoryCache.get(url);
  try {
    const raw = sessionStorage.getItem(`miqra_link_preview_v2:${url}`);
    if (raw) {
      const value = JSON.parse(raw);
      memoryCache.set(url, value);
      return value;
    }
  } catch { /* ignore */ }
  return undefined;
}

function writeCache(url, value) {
  memoryCache.set(url, value);
  try {
    sessionStorage.setItem(`miqra_link_preview_v2:${url}`, JSON.stringify(value));
  } catch { /* ignore */ }
}

export function readLinkPreviewCache(url) {
  return readCache(url);
}

export function fetchLinkPreviewCached(url) {
  const cached = readCache(url);
  if (cached !== undefined) return Promise.resolve(cached);
  return supabase.functions.invoke('link-preview', { body: { url } })
    .then(({ data, error }) => {
      const result = !error && data?.preview ? data.preview : null;
      writeCache(url, result);
      return result;
    })
    .catch(() => {
      writeCache(url, null);
      return null;
    });
}
