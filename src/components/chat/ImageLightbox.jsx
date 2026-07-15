import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

// Derive a sensible filename from the stored path (Supabase URLs end in the
// object key), falling back to a timestamped default.
function filenameFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    const last = decodeURIComponent(path.split('/').pop() || '');
    return last && /\.\w+$/.test(last) ? last : `image-${last || 'download'}.jpg`;
  } catch {
    return 'image.jpg';
  }
}

export default function ImageLightbox({ image, onClose }) {
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!image) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [image, onClose]);

  if (!image) return null;

  // The image lives on a different origin (Supabase storage), so <a download>
  // won't force a save — fetch the blob and download that. Fall back to opening
  // the image in a new tab if the fetch is blocked.
  const handleDownload = async () => {
    setDownloading(true);
    try {
      const response = await fetch(image.url);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filenameFromUrl(image.url);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(image.url, '_blank', 'noopener,noreferrer');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="chat-lightbox-overlay"
      role="presentation"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="chat-lightbox" role="dialog" aria-modal="true" aria-label={`Image shared by ${image.authorName}`}>
        <div className="chat-lightbox-actions">
          <button type="button" className="chat-lightbox-btn" onClick={handleDownload} disabled={downloading} aria-label="Download image" title="Download image">
            <Download size={20} />
          </button>
          <button type="button" className="chat-lightbox-btn" onClick={onClose} aria-label="Close image" title="Close">
            <X size={20} />
          </button>
        </div>
        <img src={image.url} alt={`Shared by ${image.authorName}`} />
      </div>
    </div>
  );
}
