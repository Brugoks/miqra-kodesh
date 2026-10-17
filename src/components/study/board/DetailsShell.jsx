import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * The panel beside the board on a desktop and the sheet over it on a touch
 * device (the stylesheet decides which). It takes focus when it opens, closes
 * on Escape, and hands focus back to whatever opened it.
 */
export default function DetailsShell({ title, onClose, children }) {
  const panel = useRef(null);
  useEffect(() => {
    const opener = document.activeElement;
    panel.current?.focus({ preventScroll: true });
    return () => { if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  return <aside className="lc-details" aria-label={title} ref={panel} tabIndex={-1}
    onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
    <header className="lc-details__bar"><h2>{title}</h2><button className="lc-icon-button" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}><X size={18} /></button></header>
    <div className="lc-details__body">{children}</div>
  </aside>;
}
