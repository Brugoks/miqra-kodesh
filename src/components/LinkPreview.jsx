import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

// Open Graph preview card for a URL shared in chat, fetched through the
// link-preview edge function. Results (including misses) are cached per
// session so scrolling back through history doesn't refetch. Render with
// key={url} — the cached value is read once on mount.

const memoryCache = new Map();

function readCache(url) {
  if (memoryCache.has(url)) return memoryCache.get(url);
  try {
    const raw = sessionStorage.getItem(`miqra_link_preview:${url}`);
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
    sessionStorage.setItem(`miqra_link_preview:${url}`, JSON.stringify(value));
  } catch { /* ignore */ }
}

export default function LinkPreview({ url }) {
  const [preview, setPreview] = useState(() => readCache(url));

  useEffect(() => {
    if (readCache(url) !== undefined) return undefined; // shown via initializer
    let cancelled = false;
    supabase.functions.invoke('link-preview', { body: { url } })
      .then(({ data, error }) => {
        const result = !error && data?.preview ? data.preview : null;
        writeCache(url, result);
        if (!cancelled) setPreview(result);
      })
      .catch(() => {
        writeCache(url, null);
        if (!cancelled) setPreview(null);
      });
    return () => { cancelled = true; };
  }, [url]);

  if (!preview) return null;

  return (
    <a className="chat-link-preview" href={preview.url} target="_blank" rel="noopener noreferrer">
      {preview.image && (
        <img className="chat-link-preview-img" src={preview.image} alt="" loading="lazy" />
      )}
      <span className="chat-link-preview-body">
        <span className="chat-link-preview-site">{preview.siteName}</span>
        <span className="chat-link-preview-title">{preview.title}</span>
        {preview.description && (
          <span className="chat-link-preview-desc">{preview.description}</span>
        )}
      </span>
    </a>
  );
}
