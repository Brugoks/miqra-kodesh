import { useState, useEffect } from 'react';
import { fetchLinkPreviewCached, readLinkPreviewCache } from '../lib/linkPreviewCache';

// Open Graph preview card for a URL shared in chat, fetched through the
// link-preview edge function. Results (including misses) are cached per
// session so scrolling back through history doesn't refetch. Render with
// key={url} — the cached value is read once on mount.

export default function LinkPreview({ url }) {
  const [preview, setPreview] = useState(() => readLinkPreviewCache(url));

  useEffect(() => {
    if (readLinkPreviewCache(url) !== undefined) return undefined; // shown via initializer
    let cancelled = false;
    fetchLinkPreviewCached(url).then((result) => {
      if (!cancelled) setPreview(result);
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
