import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// Full-screen image preview shared by the Prayer Wall and Study Journal.
export default function ImageLightbox({ url, alt = 'Attachment preview', onClose }) {
  useEffect(() => {
    if (!url) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [url, onClose]);

  if (!url) return null;

  return createPortal(
    <div
      className="image-modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="image-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="image-modal-close"
          onClick={onClose}
          aria-label="Close image preview"
        >
          <X size={20} />
        </button>
        <img src={url} alt={alt} className="image-modal-img" />
      </div>
    </div>,
    document.body
  );
}
