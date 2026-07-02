import { useState, useEffect } from 'react';
import { QrCode, X, Copy, Check } from 'lucide-react';
import './QRShareButton.css';

// Button + modal that renders a QR code for any URL (generated locally with
// the `qrcode` package — nothing leaves the browser). Made for projecting on
// a screen: "scan to RSVP / open the form".

export default function QRShareButton({ value, title, buttonLabel = 'QR Code', className = 'btn-secondary' }) {
  const [open, setOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !value) return;
    let cancelled = false;
    import('qrcode').then(({ default: QRCode }) =>
      QRCode.toDataURL(value, { width: 480, margin: 2 })
    ).then((url) => {
      if (!cancelled) setDataUrl(url);
    }).catch(() => {
      if (!cancelled) setDataUrl(null);
    });
    return () => { cancelled = true; };
  }, [open, value]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  if (!value) return null;

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => setOpen(true)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.8rem', fontSize: '0.8rem', borderRadius: '8px' }}
      >
        <QrCode size={14} /> {buttonLabel}
      </button>
      {open && (
        <div className="qr-share-overlay" role="presentation" onClick={() => setOpen(false)}>
          <div className="qr-share-dialog" role="dialog" aria-modal="true" aria-label={title || 'QR code'} onClick={(e) => e.stopPropagation()}>
            <div className="qr-share-header">
              <span className="qr-share-title">{title || 'Scan to open'}</span>
              <button type="button" className="qr-share-close" onClick={() => setOpen(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            {dataUrl
              ? <img className="qr-share-img" src={dataUrl} alt={`QR code for ${value}`} />
              : <div className="qr-share-loading">Generating…</div>}
            <button type="button" className="qr-share-copy" onClick={handleCopy}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
              <span className="qr-share-url">{value}</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
