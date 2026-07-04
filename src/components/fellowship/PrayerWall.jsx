import { useMemo, useState, useEffect } from 'react';
import { Heart, Plus, Send, Pencil, X, ImagePlus, MessageCircle, Archive, ArchiveRestore, Trash2, CheckCircle2, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { compressImage } from '../../lib/imageCompression';
import Avatar from '../ui/Avatar';
import ImageLightbox from './ImageLightbox';
import useRealtimeRefresh from './useRealtimeRefresh';

const formatDate = (dateValue) => (
  new Date(dateValue).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
);

export default function PrayerWall({ userId, isConfigured, activeOrgId, canCreateGroups, groups, profiles, currentProfile, avatarByProfileId, refreshTrigger }) {
  const [prayers, setPrayers] = useState([]);
  const [showPrayerForm, setShowPrayerForm] = useState(false);
  const [prayerName, setPrayerName] = useState('');
  const [prayerText, setPrayerText] = useState('');
  const [prayerSubmitting, setPrayerSubmitting] = useState(false);
  const [prayerError, setPrayerError] = useState('');
  const [prayerImageFiles, setPrayerImageFiles] = useState([]);
  const [prayerImagePreviews, setPrayerImagePreviews] = useState([]);
  const [activeImageUrl, setActiveImageUrl] = useState(null);
  const [expandedPrayers, setExpandedPrayers] = useState({});
  const [prayerStatusFilter, setPrayerStatusFilter] = useState('active'); // 'active' | 'answered' | 'archived'
  const [editingPrayerId, setEditingPrayerId] = useState(null);
  const [editPrayerName, setEditPrayerName] = useState('');
  const [editPrayerText, setEditPrayerText] = useState('');
  const [prayerActionLoading, setPrayerActionLoading] = useState('');
  const [prayerUpdateDrafts, setPrayerUpdateDrafts] = useState({});
  const [prayerUpdateSubmittingId, setPrayerUpdateSubmittingId] = useState('');
  const [openAmenNamesId, setOpenAmenNamesId] = useState(null);

  const toggleExpandPrayer = (id) => {
    setExpandedPrayers((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const loadPrayers = async () => {
    if (!isConfigured) {
      const savedPrayers = localStorage.getItem('miqra_prayers');
      if (savedPrayers) {
        try { setPrayers(JSON.parse(savedPrayers)); } catch { setPrayers([]); }
      } else {
        setPrayers([]);
      }
      return;
    }

    let prayerQuery = supabase.from('prayers').select('*').order('created_at', { ascending: false });
    let amenQuery = supabase.from('prayer_amens').select('prayer_id, user_id');

    if (activeOrgId) {
      prayerQuery = prayerQuery.eq('organization_id', activeOrgId);
      amenQuery = amenQuery.eq('organization_id', activeOrgId);
    }

    const [{ data: prayerRows, error: prayerErrorRes }, { data: amenRows, error: amenError }] = await Promise.all([
      prayerQuery,
      amenQuery,
    ]);

    if (prayerErrorRes) {
      console.error('Error loading prayers from Supabase:', prayerErrorRes);
      setPrayers([]);
      return;
    }

    if (amenError) {
      console.error('Error loading prayer amens from Supabase:', amenError);
    }

    const amenUserIds = [...new Set((amenRows || []).map((amen) => amen.user_id).filter(Boolean))];
    let amenProfiles = profiles.filter((profile) => amenUserIds.includes(profile.id));
    const knownAmenProfileIds = new Set(amenProfiles.map((profile) => profile.id));
    const missingAmenProfileIds = amenUserIds.filter((id) => !knownAmenProfileIds.has(id));

    if (activeOrgId && missingAmenProfileIds.length > 0) {
      const { data: orgMemberProfiles, error: orgMembersError } = await supabase
        .rpc('org_members', { org_id: activeOrgId });

      if (orgMembersError) {
        console.error('Error loading prayer amen profile names:', orgMembersError);
      } else {
        amenProfiles = [...amenProfiles, ...(orgMemberProfiles || []).filter((profile) => missingAmenProfileIds.includes(profile.id))];
      }
    }

    const amenProfileNameById = {};
    amenProfiles.forEach((profile) => {
      amenProfileNameById[profile.id] = profile.full_name || 'Someone';
    });

    const amenCounts = {};
    const amenNameMap = {};
    const activeAmens = new Set();
    (amenRows || []).forEach((amen) => {
      amenCounts[amen.prayer_id] = (amenCounts[amen.prayer_id] || 0) + 1;
      if (!amenNameMap[amen.prayer_id]) amenNameMap[amen.prayer_id] = [];
      amenNameMap[amen.prayer_id].push(amenProfileNameById[amen.user_id] || 'Someone');
      if (amen.user_id === userId) activeAmens.add(amen.prayer_id);
    });

    const prayerIds = (prayerRows || []).map((prayer) => prayer.id);
    let updateMap = {};
    if (prayerIds.length > 0) {
      const { data: updateRows, error: updateError } = await supabase
        .from('prayer_updates')
        .select('*, profiles:user_id(full_name)')
        .in('prayer_id', prayerIds)
        .order('created_at', { ascending: true });

      if (updateError) {
        console.error('Error loading prayer updates from Supabase:', updateError);
      } else {
        updateMap = (updateRows || []).reduce((acc, update) => {
          if (!acc[update.prayer_id]) acc[update.prayer_id] = [];
          acc[update.prayer_id].push({
            id: update.id,
            userId: update.user_id,
            body: update.body,
            date: formatDate(update.created_at),
            authorName: update.profiles?.full_name || 'Leader',
          });
          return acc;
        }, {});
      }
    }

    setPrayers((prayerRows || []).map((prayer) => ({
      id: prayer.id,
      userId: prayer.user_id,
      name: prayer.name,
      category: prayer.category,
      text: prayer.body,
      summary: prayer.summary,
      date: formatDate(prayer.created_at),
      updatedAt: prayer.updated_at ? formatDate(prayer.updated_at) : null,
      archivedAt: prayer.archived_at ? formatDate(prayer.archived_at) : null,
      archivedBy: prayer.archived_by || null,
      answeredAt: prayer.answered_at ? formatDate(prayer.answered_at) : null,
      answeredBy: prayer.answered_by || null,
      amenCount: amenCounts[prayer.id] || 0,
      amenActive: activeAmens.has(prayer.id),
      amenNames: amenNameMap[prayer.id] || [],
      imagePaths: prayer.image_paths || [],
      updates: updateMap[prayer.id] || [],
    })));
  };

  useEffect(() => {
    // Hydrates prayer state from local/Supabase storage when the session context changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPrayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfigured, userId, activeOrgId, refreshTrigger, profiles]);

  useRealtimeRefresh(
    `fellowship-prayers-${activeOrgId || 'local'}`,
    ['prayers', 'prayer_amens', 'prayer_updates'],
    loadPrayers,
    isConfigured,
  );

  const savePrayersLocal = (updatedPrayers) => {
    setPrayers(updatedPrayers);
    localStorage.setItem('miqra_prayers', JSON.stringify(updatedPrayers));
  };

  // --- FORM ACTIONS ---
  const handlePrayerImageChange = (e) => {
    const files = Array.from(e.target.files || []).slice(0, 3);
    setPrayerImageFiles(files);
    setPrayerImagePreviews(files.map(f => URL.createObjectURL(f)));
  };

  const removePrayerImage = (idx) => {
    URL.revokeObjectURL(prayerImagePreviews[idx]);
    setPrayerImageFiles(prev => prev.filter((_, i) => i !== idx));
    setPrayerImagePreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const handlePrayerPaste = (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageItems = items.filter(item => item.type.startsWith('image/'));
    if (!imageItems.length) return;
    e.preventDefault();
    const newFiles = [];
    const newPreviews = [];
    for (const item of imageItems) {
      if (prayerImageFiles.length + newFiles.length >= 3) break;
      const file = item.getAsFile();
      if (file) {
        newFiles.push(file);
        newPreviews.push(URL.createObjectURL(file));
      }
    }
    if (newFiles.length > 0) {
      setPrayerImageFiles(prev => [...prev, ...newFiles].slice(0, 3));
      setPrayerImagePreviews(prev => [...prev, ...newPreviews].slice(0, 3));
    }
  };

  const handlePrayerSubmit = async (e) => {
    e.preventDefault();
    if (!prayerText.trim()) return;

    setPrayerSubmitting(true);
    setPrayerError('');

    const prayerId = `p_${crypto.randomUUID()}`;
    let imagePaths = [];

    if (isConfigured && prayerImageFiles.length > 0) {
      const uploads = await Promise.all(
        prayerImageFiles.map(async (file) => {
          const compressed = await compressImage(file);
          const ext = (compressed.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
          const path = `${userId}/${prayerId}/${Date.now()}.${ext}`;
          const { error } = await supabase.storage
            .from('prayer-images')
            .upload(path, compressed, { contentType: compressed.type });
          return error ? null : path;
        })
      );
      imagePaths = uploads.filter(Boolean);
    }

    let summary = null;
    if (isConfigured && prayerText.trim().length > 250) {
      try {
        const { data, error: sumErr } = await supabase.functions.invoke('hf-proxy', {
          body: {
            prompt: `Summarize this prayer request in a single short sentence (under 12 words) that captures all key requests. Do not include any introductory text, prefix, or signature. Just output the summary sentence. Prayer: "${prayerText.trim()}"`,
            max_new_tokens: 60
          }
        });
        if (!sumErr && data?.text) {
          summary = data.text.replace(/^["']|["']$/g, '').trim();
        }
      } catch (err) {
        console.error('Failed to generate prayer summary:', err);
      }
    }

    const newPrayer = {
      id: prayerId,
      userId,
      name: prayerName.trim() || 'Anonymous',
      category: null,
      text: prayerText.trim(),
      summary,
      date: formatDate(new Date()),
      updatedAt: null,
      archivedAt: null,
      archivedBy: null,
      answeredAt: null,
      answeredBy: null,
      amenCount: 1,
      amenActive: true,
      amenNames: [currentProfile?.full_name || 'You'],
      imagePaths,
      updates: [],
    };

    if (isConfigured) {
      const { error } = await supabase.from('prayers').insert({
        id: newPrayer.id,
        user_id: userId,
        name: newPrayer.name,
        category: newPrayer.category,
        body: newPrayer.text,
        summary: newPrayer.summary,
        image_paths: imagePaths,
      });

      if (error) {
        console.error('Prayer insert error:', error);
        setPrayerError(error.message || 'Could not save your prayer. Please try again.');
        setPrayerSubmitting(false);
        return;
      }

      await supabase.from('prayer_amens').upsert({
        prayer_id: newPrayer.id,
        user_id: userId,
        organization_id: activeOrgId || null,
      }, { onConflict: 'prayer_id,user_id', ignoreDuplicates: true });
      setPrayers([newPrayer, ...prayers]);
    } else {
      savePrayersLocal([newPrayer, ...prayers]);
    }

    setPrayerName('');
    setPrayerText('');
    setPrayerImageFiles([]);
    prayerImagePreviews.forEach(url => URL.revokeObjectURL(url));
    setPrayerImagePreviews([]);
    setPrayerSubmitting(false);
    setShowPrayerForm(false);
  };

  const handleAmen = async (id) => {
    const currentPrayer = prayers.find((p) => p.id === id);
    if (!currentPrayer) return;

    const myName = currentProfile?.full_name || 'You';
    const previousPrayers = prayers;
    const updated = prayers.map((p) => {
      if (p.id === id) {
        const removing = p.amenActive;
        const names = p.amenNames || [];
        return {
          ...p,
          amenCount: removing ? Math.max((p.amenCount || 0) - 1, 0) : (p.amenCount || 0) + 1,
          amenActive: !p.amenActive,
          amenNames: removing
            ? names.filter((n) => n !== myName)
            : [...names, myName],
        };
      }
      return p;
    });
    setPrayers(updated);
    setPrayerError('');

    if (isConfigured && currentPrayer) {
      try {
        const response = currentPrayer.amenActive
          ? await supabase.from('prayer_amens').delete().eq('prayer_id', id).eq('user_id', userId)
          : await supabase.from('prayer_amens').upsert({
            prayer_id: id,
            user_id: userId,
            organization_id: activeOrgId || null,
          }, { onConflict: 'prayer_id,user_id', ignoreDuplicates: true });

        if (response.error) throw response.error;
      } catch (err) {
        console.error('Error saving prayer amen:', err);
        setPrayers(previousPrayers);
        setPrayerError('Could not save your Amen. Please refresh and try again.');
      }
    } else {
      localStorage.setItem('miqra_prayers', JSON.stringify(updated));
    }
  };

  const canManagePrayer = (prayer) => Boolean(prayer && (prayer.userId === userId || canCreateGroups));

  const beginEditPrayer = (prayer) => {
    setEditingPrayerId(prayer.id);
    setEditPrayerName(prayer.name || '');
    setEditPrayerText(prayer.text || '');
    setPrayerError('');
  };

  const cancelEditPrayer = () => {
    setEditingPrayerId(null);
    setEditPrayerName('');
    setEditPrayerText('');
  };

  const handleSavePrayerEdit = async (id) => {
    const currentPrayer = prayers.find((p) => p.id === id);
    if (!currentPrayer || !canManagePrayer(currentPrayer) || !editPrayerText.trim()) return;

    const previousPrayers = prayers;
    const editedAt = formatDate(new Date());
    const updatedPrayers = prayers.map((p) => (
      p.id === id
        ? {
          ...p,
          name: editPrayerName.trim() || 'Anonymous',
          text: editPrayerText.trim(),
          summary: null,
          updatedAt: editedAt,
        }
        : p
    ));

    setPrayers(updatedPrayers);
    setPrayerActionLoading(`edit-${id}`);
    setPrayerError('');

    if (isConfigured) {
      try {
        const { error } = await supabase
          .from('prayers')
          .update({
            name: editPrayerName.trim() || 'Anonymous',
            body: editPrayerText.trim(),
            summary: null,
          })
          .eq('id', id);

        if (error) throw error;
      } catch (err) {
        console.error('Error updating prayer:', err);
        setPrayers(previousPrayers);
        setPrayerError('Could not update that prayer. Please refresh and try again.');
        setPrayerActionLoading('');
        return;
      }
    } else {
      localStorage.setItem('miqra_prayers', JSON.stringify(updatedPrayers));
    }

    cancelEditPrayer();
    setPrayerActionLoading('');
  };

  const handlePostPrayerUpdate = async (id) => {
    const currentPrayer = prayers.find((p) => p.id === id);
    const body = (prayerUpdateDrafts[id] || '').trim();
    if (!currentPrayer || !canManagePrayer(currentPrayer) || !body) return;

    const updateId = `pu_${crypto.randomUUID()}`;
    const newUpdate = {
      id: updateId,
      userId,
      body,
      date: formatDate(new Date()),
      authorName: currentProfile?.full_name || 'Leader',
    };
    const previousPrayers = prayers;
    const updatedPrayers = prayers.map((p) => (
      p.id === id
        ? { ...p, updates: [...(p.updates || []), newUpdate] }
        : p
    ));

    setPrayers(updatedPrayers);
    setPrayerUpdateDrafts((prev) => ({ ...prev, [id]: '' }));
    setPrayerUpdateSubmittingId(id);
    setPrayerError('');

    if (isConfigured) {
      try {
        const { data, error } = await supabase
          .from('prayer_updates')
          .insert({
            prayer_id: id,
            user_id: userId,
            body,
            organization_id: activeOrgId || null,
          })
          .select('*, profiles:user_id(full_name)')
          .single();

        if (error) throw error;

        if (data) {
          setPrayers((prev) => prev.map((p) => (
            p.id === id
              ? {
                ...p,
                updates: (p.updates || []).map((update) => (
                  update.id === updateId
                    ? {
                      id: data.id,
                      userId: data.user_id,
                      body: data.body,
                      date: formatDate(data.created_at),
                      authorName: data.profiles?.full_name || newUpdate.authorName,
                    }
                    : update
                )),
              }
              : p
          )));
        }
      } catch (err) {
        console.error('Error posting prayer update:', err);
        setPrayers(previousPrayers);
        setPrayerUpdateDrafts((prev) => ({ ...prev, [id]: body }));
        setPrayerError('Could not post that update. Please refresh and try again.');
      }
    } else {
      localStorage.setItem('miqra_prayers', JSON.stringify(updatedPrayers));
    }

    setPrayerUpdateSubmittingId('');
  };

  const handleArchivePrayer = async (id, shouldArchive = true) => {
    const currentPrayer = prayers.find((p) => p.id === id);
    if (!currentPrayer || !canManagePrayer(currentPrayer)) return;

    const previousPrayers = prayers;
    const archivedAt = shouldArchive ? formatDate(new Date()) : null;
    const updatedPrayers = prayers.map((p) => (
      p.id === id
        ? {
          ...p,
          archivedAt,
          archivedBy: shouldArchive ? userId : null,
        }
        : p
    ));

    setPrayers(updatedPrayers);
    setPrayerActionLoading(`archive-${id}`);
    setPrayerError('');

    if (isConfigured) {
      try {
        const { error } = await supabase
          .from('prayers')
          .update({
            archived_at: shouldArchive ? new Date().toISOString() : null,
            archived_by: shouldArchive ? userId : null,
          })
          .eq('id', id);

        if (error) throw error;
      } catch (err) {
        console.error('Error archiving prayer:', err);
        setPrayers(previousPrayers);
        setPrayerError(`Could not ${shouldArchive ? 'archive' : 'reopen'} that prayer. Please refresh and try again.`);
      }
    } else {
      localStorage.setItem('miqra_prayers', JSON.stringify(updatedPrayers));
    }

    setPrayerActionLoading('');
  };

  const handleMarkAnswered = async (id, shouldMark = true) => {
    const currentPrayer = prayers.find((p) => p.id === id);
    if (!currentPrayer || !canManagePrayer(currentPrayer)) return;

    const previousPrayers = prayers;
    const answeredAt = shouldMark ? formatDate(new Date()) : null;
    const updatedPrayers = prayers.map((p) => (
      p.id === id
        ? {
          ...p,
          answeredAt,
          answeredBy: shouldMark ? userId : null,
        }
        : p
    ));

    setPrayers(updatedPrayers);
    setPrayerActionLoading(`answered-${id}`);
    setPrayerError('');

    if (isConfigured) {
      try {
        const { error } = await supabase
          .from('prayers')
          .update({
            answered_at: shouldMark ? new Date().toISOString() : null,
            answered_by: shouldMark ? userId : null,
          })
          .eq('id', id);

        if (error) throw error;
      } catch (err) {
        console.error('Error marking prayer answered:', err);
        setPrayers(previousPrayers);
        setPrayerError(`Could not ${shouldMark ? 'mark that prayer as answered' : 'reopen that prayer'}. Please refresh and try again.`);
      }
    } else {
      localStorage.setItem('miqra_prayers', JSON.stringify(updatedPrayers));
    }

    setPrayerActionLoading('');
  };

  const handleDeletePrayer = async (id) => {
    if (!window.confirm('Delete this prayer request? This cannot be undone.')) return;
    setPrayers(prev => prev.filter(p => p.id !== id));
    if (isConfigured) {
      await supabase.from('prayer_amens').delete().eq('prayer_id', id);
      await supabase.from('prayers').delete().eq('id', id).eq('user_id', userId);
    } else {
      const updated = prayers.filter(p => p.id !== id);
      localStorage.setItem('miqra_prayers', JSON.stringify(updated));
    }
  };

  // Leaders/admins can see all prayers; regular members only see prayers from
  // people in their shared groups (plus their own). RLS enforces the same rule
  // server-side; this keeps the local-storage mode consistent.
  const visiblePrayers = useMemo(() => {
    if (canCreateGroups) return prayers;
    const sharedUserIds = new Set();
    sharedUserIds.add(userId);
    const myGroupKeys = Object.keys(groups).filter(key =>
      groups[key].students?.some(s => s.linkedUserId === userId)
    );
    myGroupKeys.forEach(key => {
      (groups[key].students || []).forEach(s => {
        if (s.linkedUserId) sharedUserIds.add(s.linkedUserId);
      });
    });
    return prayers.filter(p => sharedUserIds.has(p.userId));
  }, [prayers, groups, userId, canCreateGroups]);

  const displayedPrayers = useMemo(() => (
    visiblePrayers.filter((prayer) => {
      if (prayerStatusFilter === 'archived') return Boolean(prayer.archivedAt);
      if (prayerStatusFilter === 'answered') return Boolean(prayer.answeredAt) && !prayer.archivedAt;
      return !prayer.archivedAt && !prayer.answeredAt;
    })
  ), [visiblePrayers, prayerStatusFilter]);

  const activePrayerCount = visiblePrayers.filter((prayer) => !prayer.archivedAt && !prayer.answeredAt).length;
  const answeredPrayerCount = visiblePrayers.filter((prayer) => prayer.answeredAt && !prayer.archivedAt).length;
  const archivedPrayerCount = visiblePrayers.filter((prayer) => prayer.archivedAt).length;

  return (
    <section className="card">
      <div className="wall-header">
        <h2>Prayer Wall</h2>
        <button
          onClick={() => setShowPrayerForm(!showPrayerForm)}
          className="btn-primary"
          style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
        >
          <Plus size={16} />
          <span>{showPrayerForm ? 'Close Form' : 'Request Prayer'}</span>
        </button>
      </div>

      <div className="prayer-wall-scope-note">
        ℹ️ Showing prayer requests shared by members within your associated small groups.
      </div>

      <div className="prayer-wall-controls" aria-label="Prayer wall filter">
        <button
          type="button"
          className={`prayer-filter-btn ${prayerStatusFilter === 'active' ? 'active' : ''}`}
          onClick={() => setPrayerStatusFilter('active')}
        >
          Active <span>{activePrayerCount}</span>
        </button>
        <button
          type="button"
          className={`prayer-filter-btn ${prayerStatusFilter === 'answered' ? 'active' : ''}`}
          onClick={() => setPrayerStatusFilter('answered')}
        >
          Answered <span>{answeredPrayerCount}</span>
        </button>
        <button
          type="button"
          className={`prayer-filter-btn ${prayerStatusFilter === 'archived' ? 'active' : ''}`}
          onClick={() => setPrayerStatusFilter('archived')}
        >
          Archived <span>{archivedPrayerCount}</span>
        </button>
      </div>

      {prayerError && !showPrayerForm && (
        <p className="section-error">{prayerError}</p>
      )}

      {/* New Prayer Form */}
      {showPrayerForm && (
        <form onSubmit={handlePrayerSubmit} className="prayer-form animate-fade-in">
          <div className="form-group">
            <label htmlFor="prayer-name">Your Name / Initials</label>
            <input
              id="prayer-name"
              type="text"
              placeholder="e.g. John S. (leave blank for Anonymous)"
              value={prayerName}
              onChange={(e) => setPrayerName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="prayer-req">Prayer Request</label>
            <textarea
              id="prayer-req"
              rows={4}
              placeholder="What would you like the fellowship to pray for? You can also paste an image directly here."
              value={prayerText}
              onChange={(e) => setPrayerText(e.target.value)}
              onPaste={handlePrayerPaste}
              required
            />
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem', marginBottom: 0 }}>
              💡 Paste an image directly into the text box to attach it.
            </p>
          </div>

          <div className="form-group">
            <label>Photo <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional · up to 3)</span></label>
            {prayerImagePreviews.length > 0 && (
              <div className="prayer-image-previews">
                {prayerImagePreviews.map((src, i) => (
                  <div key={i} className="prayer-image-preview">
                    <img src={src} alt="" />
                    <button type="button" className="prayer-image-remove" onClick={() => removePrayerImage(i)} aria-label="Remove photo">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {prayerImagePreviews.length < 3 && (
              <label className="prayer-image-upload-btn">
                <ImagePlus size={15} />
                <span>Add photo</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handlePrayerImageChange}
                />
              </label>
            )}
          </div>

          {prayerError && (
            <p className="section-error" style={{ margin: 0 }}>{prayerError}</p>
          )}
          <div className="form-actions">
            <button
              type="button"
              onClick={() => { setShowPrayerForm(false); setPrayerError(''); }}
              className="btn-secondary"
              style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={prayerSubmitting}
              style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <Send size={14} />
              <span>{prayerSubmitting ? 'Submitting…' : 'Submit Request'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Prayers Cards List */}
      <div className="prayer-card-list">
        {displayedPrayers.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
            {prayerStatusFilter === 'archived'
              ? 'No archived prayer requests yet.'
              : prayerStatusFilter === 'answered'
                ? 'No answered prayers yet. When God answers, mark them here to celebrate together!'
                : 'No prayer requests currently active. Feel free to submit the first!'}
          </p>
        ) : (
          displayedPrayers.map((prayer) => {
            const managePrayer = canManagePrayer(prayer);
            const editingThisPrayer = editingPrayerId === prayer.id;
            return (
            <div key={prayer.id} className={`prayer-request-card ${prayer.archivedAt ? 'archived' : ''} ${prayer.answeredAt && !prayer.archivedAt ? 'answered' : ''}`}>
              <div className="prayer-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                  {prayer.name && prayer.name.toLowerCase() !== 'anonymous' && (
                    <Avatar src={avatarByProfileId[prayer.userId]} name={prayer.name} size={32} />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <span className="prayer-user">{prayer.name}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>{prayer.date}</span>
                  </div>
                </div>
                {prayer.archivedAt ? (
                  <span className="prayer-status-badge">Archived</span>
                ) : prayer.answeredAt ? (
                  <span className="prayer-status-badge answered">
                    <Sparkles size={11} /> Answered {prayer.answeredAt}
                  </span>
                ) : null}
              </div>

              {editingThisPrayer ? (
                <div className="prayer-edit-panel">
                  <div className="form-group">
                    <label htmlFor={`edit-prayer-name-${prayer.id}`}>Name / Initials</label>
                    <input
                      id={`edit-prayer-name-${prayer.id}`}
                      type="text"
                      value={editPrayerName}
                      onChange={(e) => setEditPrayerName(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor={`edit-prayer-text-${prayer.id}`}>Prayer Request</label>
                    <textarea
                      id={`edit-prayer-text-${prayer.id}`}
                      rows={4}
                      value={editPrayerText}
                      onChange={(e) => setEditPrayerText(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-actions">
                    <button type="button" className="btn-secondary" onClick={cancelEditPrayer}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => handleSavePrayerEdit(prayer.id)}
                      disabled={prayerActionLoading === `edit-${prayer.id}` || !editPrayerText.trim()}
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {prayer.summary ? (
                    <>
                      <p className="prayer-text">
                        "{expandedPrayers[prayer.id] ? prayer.text : prayer.summary}"
                      </p>
                      <button
                        type="button"
                        onClick={() => toggleExpandPrayer(prayer.id)}
                        className="prayer-expand-btn"
                      >
                        {expandedPrayers[prayer.id] ? 'Show less ▲' : 'Read full request ▼'}
                      </button>
                    </>
                  ) : (
                    <p className="prayer-text">"{prayer.text}"</p>
                  )}
                  {prayer.updatedAt && (
                    <p className="prayer-edited-note">Updated {prayer.updatedAt}</p>
                  )}
                </>
              )}

              {prayer.imagePaths?.length > 0 && (
                <div className="prayer-card-images">
                  {prayer.imagePaths.map((path, i) => {
                    const { data } = supabase.storage.from('prayer-images').getPublicUrl(path);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setActiveImageUrl(data.publicUrl)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          display: 'block',
                        }}
                        aria-label="View large image"
                      >
                        <img src={data.publicUrl} alt="" className="prayer-card-img" />
                      </button>
                    );
                  })}
                </div>
              )}

              {(prayer.updates?.length > 0 || managePrayer) && (
                <div className="prayer-updates">
                  {prayer.updates?.length > 0 && (
                    <div className="prayer-update-list">
                      {prayer.updates.map((update) => (
                        <div key={update.id} className="prayer-update-item">
                          <div className="prayer-update-meta">
                            <span>{update.authorName}</span>
                            <span>{update.date}</span>
                          </div>
                          <p>{update.body}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {managePrayer && !prayer.archivedAt && (
                    <div className="prayer-update-form">
                      <textarea
                        rows={2}
                        placeholder="Share an update with the brethren..."
                        value={prayerUpdateDrafts[prayer.id] || ''}
                        onChange={(e) => setPrayerUpdateDrafts((prev) => ({ ...prev, [prayer.id]: e.target.value }))}
                      />
                      <button
                        type="button"
                        className="btn-secondary prayer-update-submit"
                        onClick={() => handlePostPrayerUpdate(prayer.id)}
                        disabled={prayerUpdateSubmittingId === prayer.id || !(prayerUpdateDrafts[prayer.id] || '').trim()}
                      >
                        <MessageCircle size={14} />
                        <span>{prayerUpdateSubmittingId === prayer.id ? 'Posting...' : 'Post update'}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="prayer-card-footer">
                <button
                  type="button"
                  className={`amen-count-wrapper ${openAmenNamesId === prayer.id ? 'open' : ''}`}
                  onClick={() => setOpenAmenNamesId(openAmenNamesId === prayer.id ? null : prayer.id)}
                  aria-label="Show who joined in prayer"
                >
                  Joined by {prayer.amenCount} brethren in prayer
                  {prayer.amenCount > 0 && prayer.amenNames?.length > 0 && (
                    <span className="amen-names-tooltip">
                      {prayer.amenNames.map((name, i) => (
                        <span key={i} className="amen-names-tooltip-row">{name}</span>
                      ))}
                    </span>
                  )}
                </button>
                <div className="prayer-card-actions">
                  {managePrayer && !editingThisPrayer && (
                    <>
                      <button
                        type="button"
                        onClick={() => beginEditPrayer(prayer)}
                        className="prayer-icon-btn"
                        title="Edit prayer"
                        aria-label="Edit prayer"
                      >
                        <Pencil size={14} />
                      </button>
                      {!prayer.archivedAt && (
                        <button
                          type="button"
                          onClick={() => handleMarkAnswered(prayer.id, !prayer.answeredAt)}
                          className={`prayer-icon-btn ${prayer.answeredAt ? 'answered-active' : ''}`}
                          title={prayer.answeredAt ? 'Reopen as active request' : 'Mark as answered'}
                          aria-label={prayer.answeredAt ? 'Reopen as active request' : 'Mark as answered'}
                          disabled={prayerActionLoading === `answered-${prayer.id}`}
                        >
                          <CheckCircle2 size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleArchivePrayer(prayer.id, !prayer.archivedAt)}
                        className="prayer-icon-btn"
                        title={prayer.archivedAt ? 'Reopen prayer' : 'Archive prayer'}
                        aria-label={prayer.archivedAt ? 'Reopen prayer' : 'Archive prayer'}
                        disabled={prayerActionLoading === `archive-${prayer.id}`}
                      >
                        {prayer.archivedAt ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                      </button>
                    </>
                  )}
                  {prayer.userId === userId && !prayer.archivedAt && (
                    <button
                      onClick={() => handleDeletePrayer(prayer.id)}
                      className="prayer-icon-btn"
                      title="Delete prayer"
                      aria-label="Delete prayer"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  {!prayer.archivedAt && (
                    <button
                      onClick={() => handleAmen(prayer.id)}
                      className={`amen-btn ${prayer.amenActive ? 'active' : ''}`}
                    >
                      <Heart size={14} fill={prayer.amenActive ? "var(--accent-gold)" : "none"} />
                      <span>Amen</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
            );
          })
        )}
      </div>

      <ImageLightbox url={activeImageUrl} alt="Prayer wall attachment" onClose={() => setActiveImageUrl(null)} />
    </section>
  );
}
