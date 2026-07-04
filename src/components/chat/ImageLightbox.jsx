import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function ImageLightbox({ image, onClose }) {
  useEffect(() => {
    if (!image) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [image, onClose]);

  if (!image) return null;

  return (
    <div
      className="chat-lightbox-overlay"
      role="presentation"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="chat-lightbox" role="dialog" aria-modal="true" aria-label={`Image shared by ${image.authorName}`}>
        <button type="button" className="chat-lightbox-close" onClick={onClose} aria-label="Close image">
          <X size={20} />
        </button>
        <img src={image.url} alt={`Shared by ${image.authorName}`} />
      </div>
    </div>
  );
}
