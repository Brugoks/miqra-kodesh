import { useState, useEffect, useRef } from 'react';
import { Camera, Loader2, Trash2, Sparkles, Check, X, RefreshCw } from 'lucide-react';
import { supabase, hasSupabaseConfig } from '../../lib/supabaseClient';
import { isAdminRole, isDeveloperRole } from '../../lib/roles';
import { compressImage } from '../../lib/imageCompression';
import { buildImagePrompt } from '../../lib/bibleWiki';
import { imageGenerationErrorMessage } from '../../lib/imageGenerationErrors';
import { wikiImageUrl } from '../../lib/wikiImageUrls';
import wikiAnimations from '../../assets/wiki-animations.json';

// Slug → content hash for entries with a looping ambient animation at
// _default/anim/<slug>.mp4 (see scripts/anim-pilot/). The hash cache-busts
// re-uploaded clips; the still remains the poster and fallback.
const ANIMATED_SLUGS = new Map(Object.entries(wikiAnimations));
const prefersReducedMotion = typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Picture for a wiki entry, resolved in order:
//   1. the org's own picture (wiki_entry_images row → org path in the bucket)
//   2. the generated default shipped at _default/<slug>.jpg (batch script)
// Admins and developers can upload, generate (AI, text-grounded prompt),
// replace, or remove — enforced by RLS and storage policies, not just UI.
export default function WikiEntryImage({ session, userRole, activeOrgId, entry }) {
  const entrySlug = entry.s;
  const [orgPath, setOrgPath] = useState(null);
  const [defaultOk, setDefaultOk] = useState(true);
  const [animOk, setAnimOk] = useState(true);
  const [preview, setPreview] = useState(null); // data URL awaiting save
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const canView = hasSupabaseConfig && session && activeOrgId;
  const canManage = canView && (isAdminRole(userRole) || isDeveloperRole(userRole));
  const generatePrompt = buildImagePrompt(entry);

  useEffect(() => {
    if (!canView) return undefined;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('wiki_entry_images')
        .select('image_path')
        .eq('organization_id', activeOrgId)
        .eq('entry_slug', entrySlug)
        .maybeSingle();
      if (!cancelled) setOrgPath(data?.image_path || null);
    })();
    return () => { cancelled = true; };
  }, [canView, activeOrgId, entrySlug]);

  const publicUrl = (p) => wikiImageUrl(p);
  const defaultUrl = publicUrl(`_default/${entrySlug}.jpg`);
  const showingDefault = !orgPath && !preview && defaultOk && !!defaultUrl;
  const imageUrl = preview || (orgPath ? publicUrl(orgPath) : (showingDefault ? defaultUrl : null));
  // Ambient looping animation replaces the default still (org uploads win, and
  // users who ask the OS for reduced motion keep the static picture).
  const showAnimation = showingDefault && animOk && !prefersReducedMotion && ANIMATED_SLUGS.has(entrySlug);

  const saveBlob = async (blob, contentType) => {
    const ext = (contentType.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const path = `${activeOrgId}/${entrySlug}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('wiki-images')
      .upload(path, blob, { contentType });
    if (upErr) throw upErr;
    const oldPath = orgPath;
    const { error: rowErr } = await supabase.from('wiki_entry_images').upsert({
      organization_id: activeOrgId,
      entry_slug: entrySlug,
      image_path: path,
      uploaded_by: session.user.id,
      updated_at: new Date().toISOString(),
    });
    if (rowErr) throw rowErr;
    setOrgPath(path);
    // Best-effort cleanup of the replaced file — the row already points away.
    if (oldPath) supabase.storage.from('wiki-images').remove([oldPath]).catch(() => {});
  };

  const handlePick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const compressed = await compressImage(file, { maxDimension: 1280 });
      await saveBlob(compressed, compressed.type);
      setPreview(null);
    } catch (err) {
      setError(err.message || 'Could not upload the picture.');
    } finally {
      setBusy(false);
    }
  };

  const handleGenerate = async () => {
    if (!generatePrompt || generating) return;
    setGenerating(true);
    setError('');
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('image-proxy', {
        body: { prompt: generatePrompt, steps: 8, seed: Math.floor(Math.random() * 1000000) },
      });
      if (fnErr || !data?.image) {
        throw new Error(await imageGenerationErrorMessage({ data, error: fnErr }));
      }
      setPreview(data.image);
    } catch (err) {
      setError(err.message || 'Could not generate an image. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSavePreview = async () => {
    if (!preview || busy) return;
    setBusy(true);
    setError('');
    try {
      const blob = await (await fetch(preview)).blob();
      await saveBlob(blob, blob.type || 'image/jpeg');
      setPreview(null);
    } catch (err) {
      setError(err.message || 'Could not save the picture.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!orgPath || busy) return;
    setBusy(true);
    setError('');
    try {
      const { error: delErr } = await supabase
        .from('wiki_entry_images')
        .delete()
        .eq('organization_id', activeOrgId)
        .eq('entry_slug', entrySlug);
      if (delErr) throw delErr;
      supabase.storage.from('wiki-images').remove([orgPath]).catch(() => {});
      setOrgPath(null);
    } catch (err) {
      setError(err.message || 'Could not remove the picture.');
    } finally {
      setBusy(false);
    }
  };

  if (!imageUrl && !canManage) return null;

  return (
    <div className="bw-entry-image">
      {showAnimation ? (
        <video
          src={`${publicUrl(`_default/anim/${entrySlug}.mp4`)}?v=${ANIMATED_SLUGS.get(entrySlug)}`}
          poster={defaultUrl}
          autoPlay
          muted
          loop
          playsInline
          aria-label={entry.name}
          onError={() => setAnimOk(false)}
        />
      ) : imageUrl && (
        <img
          src={imageUrl}
          alt={entry.name}
          onError={() => { if (showingDefault) setDefaultOk(false); }}
        />
      )}

      {preview ? (
        <div className="bw-image-controls overlay">
          <button type="button" className="bw-image-btn" onClick={handleSavePreview} disabled={busy}>
            {busy ? <Loader2 size={14} className="bw-spin" /> : <Check size={14} />} Save
          </button>
          <button type="button" className="bw-image-btn" onClick={handleGenerate} disabled={busy || generating}>
            {generating ? <Loader2 size={14} className="bw-spin" /> : <RefreshCw size={14} />} Try again
          </button>
          <button type="button" className="bw-image-btn danger" onClick={() => setPreview(null)} disabled={busy}>
            <X size={14} /> Cancel
          </button>
        </div>
      ) : canManage && (
        <div className={`bw-image-controls ${imageUrl ? 'overlay' : ''}`}>
          <button
            type="button"
            className="bw-image-btn"
            onClick={() => inputRef.current?.click()}
            disabled={busy || generating}
          >
            {busy ? <Loader2 size={14} className="bw-spin" /> : <Camera size={14} />}
            {imageUrl ? 'Replace' : 'Add picture'}
          </button>
          {generatePrompt && (
            <button
              type="button"
              className="bw-image-btn"
              onClick={handleGenerate}
              disabled={busy || generating}
            >
              {generating ? <Loader2 size={14} className="bw-spin" /> : <Sparkles size={14} />}
              Generate
            </button>
          )}
          {orgPath && (
            <button type="button" className="bw-image-btn danger" onClick={handleRemove} disabled={busy}>
              <Trash2 size={14} /> Remove
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            style={{ display: 'none' }}
            onChange={handlePick}
          />
        </div>
      )}

      {(showingDefault || preview) && (
        <p className="bw-image-caption">
          Artistic impression generated from the text — not a photograph
          {preview ? '. Save to use it for your church.' : '.'}
        </p>
      )}
      {error && <p className="wo-error">{error}</p>}
    </div>
  );
}
