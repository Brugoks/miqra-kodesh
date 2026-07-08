import { useState, useEffect, useRef } from 'react';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { supabase, hasSupabaseConfig } from '../../lib/supabaseClient';
import { isAdminRole, isDeveloperRole } from '../../lib/roles';
import { compressImage } from '../../lib/imageCompression';

// Org-curated picture for a wiki entry. Everyone in the org sees it; admins
// and developers can add, replace, or remove it (also enforced by RLS and
// storage policies).
export default function WikiEntryImage({ session, userRole, activeOrgId, entrySlug, entryName }) {
  const [imagePath, setImagePath] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const canView = hasSupabaseConfig && session && activeOrgId;
  const canManage = canView && (isAdminRole(userRole) || isDeveloperRole(userRole));

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
      if (!cancelled) setImagePath(data?.image_path || null);
    })();
    return () => { cancelled = true; };
  }, [canView, activeOrgId, entrySlug]);

  const imageUrl = imagePath
    ? supabase.storage.from('wiki-images').getPublicUrl(imagePath).data.publicUrl
    : null;

  const handlePick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-picking the same file
    if (!file) return;

    setBusy(true);
    setError('');
    try {
      const compressed = await compressImage(file, { maxDimension: 1280 });
      const ext = (compressed.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
      const path = `${activeOrgId}/${entrySlug}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('wiki-images')
        .upload(path, compressed, { contentType: compressed.type });
      if (upErr) throw upErr;

      const oldPath = imagePath;
      const { error: rowErr } = await supabase.from('wiki_entry_images').upsert({
        organization_id: activeOrgId,
        entry_slug: entrySlug,
        image_path: path,
        uploaded_by: session.user.id,
        updated_at: new Date().toISOString(),
      });
      if (rowErr) throw rowErr;
      setImagePath(path);
      // Best-effort cleanup of the replaced file — the row already points away.
      if (oldPath) supabase.storage.from('wiki-images').remove([oldPath]).catch(() => {});
    } catch (err) {
      setError(err.message || 'Could not upload the picture.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!imagePath || busy) return;
    setBusy(true);
    setError('');
    try {
      const { error: delErr } = await supabase
        .from('wiki_entry_images')
        .delete()
        .eq('organization_id', activeOrgId)
        .eq('entry_slug', entrySlug);
      if (delErr) throw delErr;
      supabase.storage.from('wiki-images').remove([imagePath]).catch(() => {});
      setImagePath(null);
    } catch (err) {
      setError(err.message || 'Could not remove the picture.');
    } finally {
      setBusy(false);
    }
  };

  if (!imageUrl && !canManage) return null;

  return (
    <div className="bw-entry-image">
      {imageUrl && <img src={imageUrl} alt={entryName} />}
      {canManage && (
        <div className={`bw-image-controls ${imageUrl ? 'overlay' : ''}`}>
          <button
            type="button"
            className="bw-image-btn"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {busy ? <Loader2 size={14} className="bw-spin" /> : <Camera size={14} />}
            {imageUrl ? 'Replace picture' : 'Add picture'}
          </button>
          {imageUrl && (
            <button
              type="button"
              className="bw-image-btn danger"
              onClick={handleRemove}
              disabled={busy}
            >
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
      {error && <p className="wo-error">{error}</p>}
    </div>
  );
}
