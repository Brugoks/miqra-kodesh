import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ImageIcon, Loader2, RefreshCw, Download, AlertCircle, Sparkles, X, Copy, Check, Camera, Search } from 'lucide-react';
import { supabase, hasSupabaseConfig } from '../lib/supabaseClient';
import './ScriptureImage.css';

import { STYLES, getHistoricalContext, cleanPassage, fallbackPrompt, buildArtDirectorPrompt } from '../lib/scriptureImageUtils';

export default function ScriptureImage({ reference, content, translation, insights = null }) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState('painterly');
  const [status, setStatus] = useState('idle'); // idle | prompting | loading | ready | error
  const [imgUrl, setImgUrl] = useState('');
  const [artPrompt, setArtPrompt] = useState('');
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const seedRef = useRef(1);

  // Stock photos (Pexels via pexels-proxy) as an alternative to AI art.
  const [source, setSource] = useState('ai'); // 'ai' | 'photo'
  const [photoQuery, setPhotoQuery] = useState('');
  const [photos, setPhotos] = useState(null);
  const [photoStatus, setPhotoStatus] = useState('idle'); // idle | loading | error
  const [photoError, setPhotoError] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  const searchPhotos = async (query) => {
    if (!hasSupabaseConfig) return;
    setPhotoStatus('loading');
    setPhotoError('');
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('pexels-proxy', {
        body: { query: query.trim(), perPage: 18, orientation: 'landscape' },
      });
      if (fnErr || !data?.photos) throw new Error(fnErr?.message || 'No photos returned');
      setPhotos(data.photos);
      setSelectedPhoto(data.photos[0] || null);
      setPhotoStatus('idle');
    } catch (err) {
      setPhotoStatus('error');
      setPhotoError(err.message || 'Photo search failed. Please try again.');
    }
  };

  const openPhotos = () => {
    setSource('photo');
    // First open shows Pexels' curated feed; search refines from there.
    if (photos === null && photoStatus !== 'loading') searchPhotos('');
  };

  const canCopyImage = typeof navigator !== 'undefined' && !!navigator.clipboard
    && typeof window !== 'undefined' && 'ClipboardItem' in window;

  const generate = async (reusePrompt) => {
    setError('');
    let prompt = reusePrompt || '';
    const context = getHistoricalContext(reference);

    // 1. Turn the verse into a vivid art prompt (Groq via hf-proxy). Falls back to raw verse text.
    if (!prompt) {
      setStatus('prompting');
      const text = cleanPassage(content);
      if (hasSupabaseConfig) {
        try {
          const { data, error: fnErr } = await supabase.functions.invoke('hf-proxy', {
            body: {
              prompt: buildArtDirectorPrompt(reference, text, context, insights),
              max_new_tokens: 180,
            },
          });
          if (fnErr || !data?.text) throw new Error(fnErr?.message || 'No prompt');
          prompt = data.text.replace(/^["']|["']$/g, '').trim();
        } catch {
          prompt = `${fallbackPrompt(text)}, set in ${context.ctx}`;
        }
      } else {
        prompt = `${fallbackPrompt(text)}, set in ${context.ctx}`;
      }
      setArtPrompt(prompt);
    }

    // 2. Compose the final prompt with the chosen style + a reinforced anchor (historical for
    //    realist books, apocalyptic for Revelation), then generate via the image-proxy edge fn.
    const styleObj = STYLES.find((s) => s.value === style) || STYLES[0];
    const anchor = context.visionary
      ? 'visionary apocalyptic sacred imagery, luminous and otherworldly, radiant cosmic symbolism, awe-inspiring'
      : `historically accurate ${context.ctx}, Middle Eastern Semitic people, no anachronisms`;
    const finalPrompt = `${prompt}, ${styleObj.suffix}, ${anchor}, no text, no words, no watermark`;
    const seed = seedRef.current++;

    setStatus('loading');
    setImgUrl('');
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('image-proxy', {
        body: { prompt: finalPrompt, seed, steps: 8 },
      });
      if (fnErr || !data?.image) {
        throw new Error(data?.detail || fnErr?.message || 'No image returned');
      }
      setImgUrl(data.image); // data URL — <img> onLoad flips status to 'ready'
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Could not generate an image. Please try again.');
    }
  };

  const handleVisualize = () => {
    setOpen(true);
    generate('');
  };

  const handleClose = () => setOpen(false);

  const handleRegenerate = () => generate(artPrompt); // new seed, same art prompt

  // Close on Escape + lock body scroll while the full-screen modal is open
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Whichever image is on the stage right now — AI art or the picked photo.
  const displayedUrl = source === 'photo' ? (selectedPhoto?.fullUrl || '') : imgUrl;

  const handleCopy = async () => {
    if (!displayedUrl || !canCopyImage) return;
    try {
      // Convert to PNG — clipboards reliably accept image/png across browsers.
      // Pass the blob as a promise so Safari/WebKit keeps the user gesture valid.
      const pngBlob = (async () => {
        const blob = await (await fetch(displayedUrl)).blob();
        if (blob.type === 'image/png') return blob;
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext('2d').drawImage(bitmap, 0, 0);
        return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      })();
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': pngBlob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy the image. Try Download instead.');
    }
  };

  const handleDownload = async () => {
    if (!displayedUrl) return;
    setDownloading(true);
    try {
      const res = await fetch(displayedUrl);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = `${reference.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}${source === 'photo' ? `-photo-${selectedPhoto?.id}` : ''}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch {
      window.open(displayedUrl, '_blank', 'noopener');
    } finally {
      setDownloading(false);
    }
  };

  const busy = status === 'prompting' || status === 'loading';
  const passageText = cleanPassage(content);

  const modal = (
    <div className="si-modal-overlay" onClick={handleClose}>
      <div className="si-modal" onClick={(e) => e.stopPropagation()}>
        <div className="si-modal-header">
          <div className="si-title">
            <Sparkles size={16} />
            <span>Scripture Art · {reference}</span>
          </div>
          <button type="button" className="si-modal-close" onClick={handleClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="si-body">
          {hasSupabaseConfig && (
            <div className="si-source-toggle" role="group" aria-label="Image source">
              <button
                type="button"
                className={`si-style-chip ${source === 'ai' ? 'active' : ''}`}
                onClick={() => setSource('ai')}
              >
                <Sparkles size={12} /> AI Art
              </button>
              <button
                type="button"
                className={`si-style-chip ${source === 'photo' ? 'active' : ''}`}
                onClick={openPhotos}
              >
                <Camera size={12} /> Photos
              </button>
            </div>
          )}

          {source === 'photo' ? (
            <>
              <form
                className="si-photo-search"
                onSubmit={(e) => { e.preventDefault(); searchPhotos(photoQuery); }}
              >
                <input
                  value={photoQuery}
                  onChange={(e) => setPhotoQuery(e.target.value)}
                  placeholder="Search photos — e.g. shepherd, sunrise, mountains, cross"
                  autoComplete="off"
                />
                <button type="submit" className="si-action-btn" disabled={photoStatus === 'loading'}>
                  {photoStatus === 'loading' ? <Loader2 size={14} className="si-spin" /> : <Search size={14} />}
                </button>
              </form>
              <div className="si-stage">
                {photoStatus === 'loading' && (
                  <div className="si-loading">
                    <Loader2 size={28} className="si-spin" />
                    <span>Finding photos…</span>
                  </div>
                )}
                {photoStatus === 'error' && (
                  <div className="si-error">
                    <AlertCircle size={20} />
                    <span>{photoError}</span>
                  </div>
                )}
                {photoStatus === 'idle' && selectedPhoto && (
                  <img src={selectedPhoto.fullUrl} alt={selectedPhoto.alt} className="si-image visible" />
                )}
                {photoStatus === 'idle' && photos && photos.length === 0 && (
                  <div className="si-error">
                    <span>No photos found — try a different search.</span>
                  </div>
                )}
              </div>
              {photos?.length > 0 && (
                <div className="si-photo-grid">
                  {photos.map((photo) => (
                    <button
                      key={photo.id}
                      type="button"
                      className={`si-photo-thumb ${selectedPhoto?.id === photo.id ? 'active' : ''}`}
                      style={{ background: photo.avgColor }}
                      onClick={() => setSelectedPhoto(photo)}
                      title={`${photo.alt} — by ${photo.photographer}`}
                    >
                      <img src={photo.thumbUrl} alt={photo.alt} loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="si-stage">
              {busy && (
                <div className="si-loading">
                  <Loader2 size={28} className="si-spin" />
                  <span>{status === 'prompting' ? 'Composing the scene…' : 'Painting the image…'}</span>
                </div>
              )}

              {status === 'error' && (
                <div className="si-error">
                  <AlertCircle size={20} />
                  <span>{error || 'Could not generate an image. Please try again.'}</span>
                </div>
              )}

              {imgUrl && (
                <img
                  src={imgUrl}
                  alt={`Artistic visualization of ${reference}`}
                  className={`si-image ${status === 'ready' ? 'visible' : ''}`}
                  onLoad={() => setStatus('ready')}
                  onError={() => { setStatus('error'); setError('The image service did not respond. Try again.'); }}
                />
              )}
            </div>
          )}

          {passageText && (
            <blockquote className="si-passage">
              <p className="si-passage-text">{passageText}</p>
              <cite className="si-passage-ref">— {reference}{translation ? ` · ${translation}` : ''}</cite>
            </blockquote>
          )}
        </div>

        <div className="si-modal-footer">
          {source === 'ai' ? (
            <>
              <div className="si-style-picker">
                {STYLES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    className={`si-style-chip ${style === s.value ? 'active' : ''}`}
                    onClick={() => {
                      setStyle(s.value);
                      if (artPrompt) generate(artPrompt);
                    }}
                    disabled={busy}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {artPrompt && status === 'ready' && <p className="si-caption">{artPrompt}</p>}

              <div className="si-actions">
                <button type="button" className="si-action-btn" onClick={handleRegenerate} disabled={busy}>
                  <RefreshCw size={14} /> Regenerate
                </button>
                {canCopyImage && (
                  <button type="button" className="si-action-btn" onClick={handleCopy} disabled={busy || !imgUrl}>
                    {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied!' : 'Copy'}
                  </button>
                )}
                <button type="button" className="si-action-btn" onClick={handleDownload} disabled={busy || !imgUrl || downloading}>
                  {downloading ? <Loader2 size={14} className="si-spin" /> : <Download size={14} />} Download
                </button>
              </div>

              <p className="si-credit">AI-generated art (FLUX via Cloudflare) · an artistic impression, not a literal depiction</p>
            </>
          ) : (
            <>
              <div className="si-actions">
                {canCopyImage && (
                  <button type="button" className="si-action-btn" onClick={handleCopy} disabled={!selectedPhoto}>
                    {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied!' : 'Copy'}
                  </button>
                )}
                <button type="button" className="si-action-btn" onClick={handleDownload} disabled={!selectedPhoto || downloading}>
                  {downloading ? <Loader2 size={14} className="si-spin" /> : <Download size={14} />} Download
                </button>
              </div>
              <p className="si-credit">
                Photos provided by <a href="https://www.pexels.com" target="_blank" rel="noreferrer">Pexels</a>
                {selectedPhoto && (
                  <>
                    {' · '}photo by{' '}
                    {selectedPhoto.photographerUrl
                      ? <a href={selectedPhoto.photographerUrl} target="_blank" rel="noreferrer">{selectedPhoto.photographer}</a>
                      : selectedPhoto.photographer}
                  </>
                )}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button type="button" className="si-visualize-btn" onClick={handleVisualize}>
        <ImageIcon size={14} />
        Visualize this passage
      </button>
      {open && createPortal(modal, document.body)}
    </>
  );
}
