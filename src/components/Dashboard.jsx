import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';
import { Copy, Check, BookOpen, Calendar, MessageSquare, MessageCircle, PlusSquare, PlusCircle, Send, CalendarClock, User, MapPin, ArrowRight, ExternalLink, Link as LinkIcon, ImageIcon, Loader2, RefreshCw, Lock, Unlock, Users, Pencil, X, CornerDownRight } from 'lucide-react';
import { hasSupabaseConfig, supabase } from '../lib/supabaseClient';
import { isLeaderRole, isAdminRole } from '../lib/roles';
import { nextNMeetings, toDateKey, formatMeetingDate } from '../lib/meetings';
import { ROSTER_PREFERENCE_ROLES } from '../lib/roleOptions';
import { ClipboardList } from 'lucide-react';
import { getHistoricalContext, cleanPassage, buildArtDirectorPrompt } from '../lib/scriptureImageUtils';
import MemoryReview from './MemoryReview';
import ReadingPlanCard from './ReadingPlanCard';

const DAILY_SCRIPTURE_IMAGE_CACHE_PREFIX = 'miqra_daily_scripture_image:';

function cacheDailyScriptureImage(cacheKey, imageData) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(DAILY_SCRIPTURE_IMAGE_CACHE_PREFIX) && key !== cacheKey) {
        localStorage.removeItem(key);
      }
    }
    localStorage.setItem(cacheKey, imageData);
  } catch (err) {
    console.warn('Daily scripture image cache skipped:', err);
  }
}

export default function Dashboard({ session, userRole, organization }) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [activeImageUrl, setActiveImageUrl] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [recentJournals, setRecentJournals] = useState([]);
  const [journalsLoading, setJournalsLoading] = useState(hasSupabaseConfig);
  const [activeJournalIndex, setActiveJournalIndex] = useState(0);
  const [announcementsLoading, setAnnouncementsLoading] = useState(hasSupabaseConfig);
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false);
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementBody, setAnnouncementBody] = useState('');
  const [announcementSaving, setAnnouncementSaving] = useState(false);
  const [announcementError, setAnnouncementError] = useState('');
  const canManageAnnouncements = isLeaderRole(userRole);
  const canEditTagline = isAdminRole(userRole);
  const userId = session?.user?.id;

  // --- WELCOME TAGLINE STATE ---
  const DEFAULT_TAGLINE = 'Welcome to the Student Small Groups portal. Stay connected, grow in the Word, and walk in unity with one another.';
  // Derive current tagline directly from org prop so it auto-updates on org switch
  const currentTagline = organization?.welcome_tagline || DEFAULT_TAGLINE;
  const [editingTagline, setEditingTagline] = useState(false);
  const [taglineDraft, setTaglineDraft] = useState('');
  const [taglineSaving, setTaglineSaving] = useState(false);
  const [taglineSaved, setTaglineSaved] = useState(false);
  // Track which org we are editing so we can cancel if org changes mid-edit
  const [editingTaglineOrgId, setEditingTaglineOrgId] = useState(null);
  const isEditingThisOrg = editingTagline && editingTaglineOrgId === organization?.id;

  const handleSaveTagline = async () => {
    const next = taglineDraft.trim();
    if (!next || !organization?.id) return;
    setTaglineSaving(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ welcome_tagline: next })
        .eq('id', organization.id);
      if (error) throw error;
      setEditingTagline(false);
      setEditingTaglineOrgId(null);
      setTaglineSaved(true);
      setTimeout(() => setTaglineSaved(false), 2500);
    } catch (err) {
      console.error('Error saving tagline:', err.message);
    } finally {
      setTaglineSaving(false);
    }
  };

  const handleCancelTagline = () => {
    setEditingTagline(false);
    setEditingTaglineOrgId(null);
    setTaglineDraft('');
  };

  const handleStartEditTagline = () => {
    setTaglineDraft(currentTagline);
    setEditingTagline(true);
    setEditingTaglineOrgId(organization?.id || null);
  };


  const [upcomingMeetings, setUpcomingMeetings] = useState([]);
  const [meetingsLoading, setMeetingsLoading] = useState(hasSupabaseConfig);
  const [pendingIntakes, setPendingIntakes] = useState([]);
  const [intakeGender, setIntakeGender] = useState('female');
  const [intakePrefs, setIntakePrefs] = useState(['', '', '', '', '', '']);
  const [intakeNotes, setIntakeNotes] = useState('');
  const [intakeSaving, setIntakeSaving] = useState(false);
  const [intakeDoneMsg, setIntakeDoneMsg] = useState('');
  const activeIntake = pendingIntakes[0] || null;
  const [dailyScripture, setDailyScripture] = useState(null);
  const scriptureRef = dailyScripture?.reference ?? '';
  const scriptureText = dailyScripture?.text ?? '';

  const [scriptureImage, setScriptureImage] = useState('');
  const [scriptureImageStatus, setScriptureImageStatus] = useState('idle');
  const [scriptureImageError, setScriptureImageError] = useState('');
  const [dailyVerseReady, setDailyVerseReady] = useState(false);

  // --- JOURNAL COMMENT STATE ---
  const [expandedReflections, setExpandedReflections] = useState({});
  const [dashCommentText, setDashCommentText] = useState({});
  const [dashCommentOpen, setDashCommentOpen] = useState({});
  const [dashCommentSubmitting, setDashCommentSubmitting] = useState({});
  const [dashCommentSuccess, setDashCommentSuccess] = useState({});
  const [dashJournalComments, setDashJournalComments] = useState({});

  const handleDashboardComment = async (journalEntryId) => {
    const text = (dashCommentText[journalEntryId] || '').trim();
    if (!text || !userId) return;

    setDashCommentSubmitting((prev) => ({ ...prev, [journalEntryId]: true }));
    try {
      const orgId = organization?.id || null;
      const { data, error } = await supabase.from('journal_comments').insert({
        journal_id: journalEntryId,
        user_id: userId,
        body: text,
        organization_id: orgId,
      }).select('*, profiles:user_id(full_name)').single();
      if (error) throw error;
      if (data) {
        setDashJournalComments((prev) => ({
          ...prev,
          [journalEntryId]: [...(prev[journalEntryId] || []), data],
        }));
      }
      setDashCommentText((prev) => ({ ...prev, [journalEntryId]: '' }));
      setDashCommentOpen((prev) => ({ ...prev, [journalEntryId]: false }));
      setDashCommentSuccess((prev) => ({ ...prev, [journalEntryId]: true }));
      setTimeout(() => setDashCommentSuccess((prev) => ({ ...prev, [journalEntryId]: false })), 3000);
    } catch (err) {
      console.error('Error posting comment:', err.message);
    } finally {
      setDashCommentSubmitting((prev) => ({ ...prev, [journalEntryId]: false }));
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Welcome';
    return 'Good evening';
  };

  const copyScripture = () => {
    navigator.clipboard.writeText(`"${scriptureText}" — ${scriptureRef}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    let isMounted = true;

    const loadAnnouncements = async () => {
      if (!hasSupabaseConfig) {
        setAnnouncements([]);
        setAnnouncementsLoading(false);
        return;
      }

      setAnnouncementsLoading(true);
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('announcement_date', { ascending: false });

      if (!isMounted) return;

      if (error || !data?.length) {
        setAnnouncements([]);
      } else {
        setAnnouncements(data.map((item) => ({
          id: item.id,
          date: new Date(`${item.announcement_date}T00:00:00`).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          }),
          title: item.title,
          body: item.body,
        })));
      }
      setAnnouncementsLoading(false);
    };

    loadAnnouncements();

    return () => {
      isMounted = false;
    };
  }, []);

  // Surface the next meeting for each small group the user belongs to (leaders
  // who aren't linked to a specific group see all groups). Read-only here —
  // editing lives in the Study Hub.
  useEffect(() => {
    let isMounted = true;

    const loadMeetings = async () => {
      if (!hasSupabaseConfig || !userId) {
        setUpcomingMeetings([]);
        setMeetingsLoading(false);
        return;
      }

      setMeetingsLoading(true);
      const { data: groups } = await supabase
        .from('attendance_groups')
        .select('*');

      if (!isMounted) return;

      const mine = (groups || []).filter((g) =>
        (g.students || []).some((s) => s.linkedUserId === userId));
      const visible = mine.length ? mine : (isLeaderRole(userRole) ? (groups || []) : []);

      const todayDate = new Date();
      todayDate.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(todayDate);
      const daysUntilSaturday = 6 - todayDate.getDay();
      endOfWeek.setDate(todayDate.getDate() + daysUntilSaturday);
      endOfWeek.setHours(23, 59, 59, 999);

      const scheduled = [];
      visible.forEach((group) => {
        const dates = nextNMeetings(group, 3);
        dates.forEach((date) => {
          if (date <= endOfWeek) {
            scheduled.push({ group, date });
          }
        });
      });
      scheduled.sort((a, b) => a.date - b.date);

      const results = await Promise.all(scheduled.map(async ({ group, date }) => {
        const { data } = await supabase
          .from('group_meetings')
          .select('*')
          .eq('group_id', group.id)
          .eq('meeting_date', toDateKey(date))
          .maybeSingle();
        return { group, date, details: data || null };
      }));

      if (isMounted) {
        setUpcomingMeetings(results);
        setMeetingsLoading(false);
      }
    };

    loadMeetings();

    return () => {
      isMounted = false;
    };
  }, [userId, userRole]);

  // Intake forms a leader has sent this student to fill out.
  useEffect(() => {
    let isMounted = true;
    const loadIntakes = async () => {
      if (!hasSupabaseConfig || !userId) { setPendingIntakes([]); return; }
      const { data } = await supabase
        .from('intake_form_requests')
        .select('*')
        .eq('student_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (isMounted) setPendingIntakes(data || []);
    };
    loadIntakes();
    return () => { isMounted = false; };
  }, [userId]);

  // Load highlighted journal entries visible to the user
  useEffect(() => {
    let isMounted = true;
    const loadRecentJournals = async () => {
      if (!hasSupabaseConfig || !userId) {
        setRecentJournals([]);
        setJournalsLoading(false);
        return;
      }
      setJournalsLoading(true);
      
      // We select entries and join with profiles to get the author's full name.
      // Supabase's RLS filters entries based on visibility settings ('public', 'groups' membership, 'private' ownership) automatically.
      const { data, error } = await supabase
        .from('journal_entries')
        .select(`
          id,
          user_id,
          title,
          scripture,
          body,
          summary,
          image_path,
          visibility,
          created_at,
          profiles (
            full_name
          )
        `)
        .neq('visibility', 'private')
        .order('created_at', { ascending: false })
        .limit(10);

      if (!isMounted) return;

      if (error) {
        console.error('Error loading highlighted journals:', error.message);
        setRecentJournals([]);
        setDashJournalComments({});
      } else {
        const journals = data || [];
        setRecentJournals(journals);

        const journalIds = journals.map((entry) => entry.id);
        if (journalIds.length === 0) {
          setDashJournalComments({});
        } else {
          const { data: commentRows, error: commentError } = await supabase
            .from('journal_comments')
            .select('*, profiles:user_id(full_name)')
            .in('journal_id', journalIds)
            .order('created_at', { ascending: true });

          if (!isMounted) return;

          if (commentError) {
            console.error('Error loading highlighted journal comments:', commentError.message);
            setDashJournalComments({});
          } else {
            const grouped = {};
            (commentRows || []).forEach((comment) => {
              if (!grouped[comment.journal_id]) grouped[comment.journal_id] = [];
              grouped[comment.journal_id].push(comment);
            });
            setDashJournalComments(grouped);
          }
        }
      }
      setJournalsLoading(false);
    };

    loadRecentJournals();
    return () => {
      isMounted = false;
    };
  }, [userId]);

  // Cycle through pages of 3 highlighted journals every 10 seconds
  useEffect(() => {
    const numPages = Math.ceil(recentJournals.length / 3);
    if (numPages <= 1) return;
    const interval = setInterval(() => {
      setActiveJournalIndex((prev) => (prev + 1) % numPages);
    }, 10000);
    return () => clearInterval(interval);
  }, [recentJournals]);

  useEffect(() => {
    let isMounted = true;
    const fetchDailyVerse = async () => {
      try {
        if (typeof fetch !== 'function') return;
        const today = new Date().toDateString();
        const cached = localStorage.getItem('miqra_daily_verse');
        const cachedDate = localStorage.getItem('miqra_daily_verse_date');

        if (cached && cachedDate === today) {
          const parsed = JSON.parse(cached);
          if (
            typeof parsed?.reference === 'string' &&
            parsed.reference.trim() &&
            typeof parsed?.text === 'string' &&
            parsed.text.trim()
          ) {
            if (isMounted) {
              setDailyScripture({
                reference: parsed.reference.trim(),
                text: parsed.text.trim(),
              });
              setDailyVerseReady(true);
            }
            return;
          }
        }

        const response = await fetch('https://beta.ourmanna.com/api/v1/get/?format=json&order=daily');
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        const text = data?.verse?.details?.text;
        const reference = data?.verse?.details?.reference;
        const version = data?.verse?.details?.version;

        if (text && reference) {
          const formattedRef = version ? `${reference} (${version})` : reference;
          const nextDailyScripture = {
            reference: formattedRef.trim(),
            text: text.trim(),
          };
          if (isMounted) {
            setDailyScripture(nextDailyScripture);
            setDailyVerseReady(true);
          }
          localStorage.setItem('miqra_daily_verse', JSON.stringify(nextDailyScripture));
          localStorage.setItem('miqra_daily_verse_date', today);
        }
      } catch (err) {
        console.error('Failed to fetch daily verse from OurManna:', err);
        if (isMounted) setDailyVerseReady(true);
      }
    };
    fetchDailyVerse();
    return () => { isMounted = false; };
  }, []);

  const generateScriptureImage = async ({ force = false } = {}) => {
    if (!hasSupabaseConfig || !scriptureText || !scriptureRef) return;

    const cacheKey = `miqra_daily_scripture_image:${new Date().toDateString()}:${scriptureRef}`;
    if (!force) {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        setScriptureImage(cached);
        setScriptureImageStatus('ready');
        return;
      }
    }

    setScriptureImageStatus('loading');
    setScriptureImageError('');
    try {
      const context = getHistoricalContext(scriptureRef);
      const text = cleanPassage(scriptureText);
      let prompt = '';

      // 1. Get visual prompt via hf-proxy
      try {
        const { data, error: fnErr } = await supabase.functions.invoke('hf-proxy', {
          body: { prompt: buildArtDirectorPrompt(scriptureRef, text, context), max_new_tokens: 180 },
        });
        if (fnErr || !data?.text) throw new Error(fnErr?.message || 'No prompt');
        prompt = data.text.replace(/^["']|["']$/g, '').trim();
      } catch {
        const cleanRef = scriptureRef.replace(/\([^)]*\)/g, '').trim();
        prompt = `A reverent cinematic biblical scene inspired by ${cleanRef}, set in ${context.ctx}`;
      }

      // 2. Generate image via image-proxy
      const styleSuffix = 'cinematic photography, golden hour light, epic atmosphere, photorealistic, shallow depth of field';
      const anchor = context.visionary
        ? 'visionary apocalyptic sacred imagery, luminous and otherworldly, radiant cosmic symbolism, awe-inspiring'
        : `historically accurate ${context.ctx}, Middle Eastern Semitic people, no anachronisms`;
      const finalPrompt = `${prompt}, ${styleSuffix}, ${anchor}, no text, no words, no watermark`;

      const seed = Math.floor(Date.now() % 1000000);
      const { data, error: genErr } = await supabase.functions.invoke('image-proxy', {
        body: { prompt: finalPrompt, seed, steps: 8 },
      });

      if (genErr || !data?.image) {
        throw new Error(data?.detail || genErr?.message || 'No image returned');
      }

      setScriptureImage(data.image);
      setScriptureImageStatus('ready');
      cacheDailyScriptureImage(cacheKey, data.image);
    } catch (err) {
      setScriptureImageStatus('error');
      setScriptureImageError(err.message || 'Could not generate image.');
    }
  };

  useEffect(() => {
    if (!dailyVerseReady || !hasSupabaseConfig || !scriptureText || !scriptureRef) return;
    let ignore = false;
    (async () => {
      const cacheKey = `miqra_daily_scripture_image:${new Date().toDateString()}:${scriptureRef}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        if (!ignore) {
          setScriptureImage(cached);
          setScriptureImageStatus('ready');
        }
        return;
      }
      if (ignore) return;
      setScriptureImageStatus('loading');
      setScriptureImageError('');
      try {
        const context = getHistoricalContext(scriptureRef);
        const text = cleanPassage(scriptureText);
        let prompt = '';

        // 1. Get visual prompt via hf-proxy
        try {
          const { data, error: fnErr } = await supabase.functions.invoke('hf-proxy', {
            body: { prompt: buildArtDirectorPrompt(scriptureRef, text, context), max_new_tokens: 180 },
          });
          if (ignore) return;
          if (fnErr || !data?.text) throw new Error(fnErr?.message || 'No prompt');
          prompt = data.text.replace(/^["']|["']$/g, '').trim();
        } catch {
          const cleanRef = scriptureRef.replace(/\([^)]*\)/g, '').trim();
          prompt = `A reverent cinematic biblical scene inspired by ${cleanRef}, set in ${context.ctx}`;
        }

        if (ignore) return;

        // 2. Generate image via image-proxy
        const styleSuffix = 'cinematic photography, golden hour light, epic atmosphere, photorealistic, shallow depth of field';
        const anchor = context.visionary
          ? 'visionary apocalyptic sacred imagery, luminous and otherworldly, radiant cosmic symbolism, awe-inspiring'
          : `historically accurate ${context.ctx}, Middle Eastern Semitic people, no anachronisms`;
        const finalPrompt = `${prompt}, ${styleSuffix}, ${anchor}, no text, no words, no watermark`;

        const seed = Math.floor(Date.now() % 1000000);
        const { data, error: genErr } = await supabase.functions.invoke('image-proxy', {
          body: { prompt: finalPrompt, seed, steps: 8 },
        });

        if (ignore) return;
        if (genErr || !data?.image) {
          throw new Error(data?.detail || genErr?.message || 'No image returned');
        }

        setScriptureImage(data.image);
        setScriptureImageStatus('ready');
        cacheDailyScriptureImage(cacheKey, data.image);
      } catch (err) {
        if (!ignore) {
          setScriptureImageStatus('error');
          setScriptureImageError(err.message || 'Could not generate image.');
        }
      }
    })();
    return () => { ignore = true; };
  }, [dailyVerseReady, scriptureRef, scriptureText]);

  const updateIntakePref = (index, value) =>
    setIntakePrefs((cur) => cur.map((v, i) => (i === index ? value : v)));

  const handleSubmitIntake = async (event) => {
    event.preventDefault();
    if (!activeIntake) return;
    setIntakeSaving(true);
    const { error } = await supabase
      .from('intake_form_requests')
      .update({
        gender: intakeGender,
        preferences: intakePrefs,
        availability_notes: intakeNotes.trim() || null,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      })
      .eq('id', activeIntake.id);
    setIntakeSaving(false);
    if (error) { setIntakeDoneMsg(''); return; }
    // Advance to the next pending form (if any) and reset the fields.
    setPendingIntakes((cur) => cur.filter((f) => f.id !== activeIntake.id));
    setIntakeGender('female');
    setIntakePrefs(['', '', '', '', '', '']);
    setIntakeNotes('');
    setIntakeDoneMsg('Thanks! Your preferences were sent to your leaders.');
  };

  const resetAnnouncementForm = () => {
    setAnnouncementTitle('');
    setAnnouncementBody('');
    setAnnouncementError('');
  };

  const handleCreateAnnouncement = async (event) => {
    event.preventDefault();
    if (!announcementTitle.trim() || !announcementBody.trim()) {
      setAnnouncementError('Title and announcement text are required.');
      return;
    }

    setAnnouncementSaving(true);
    setAnnouncementError('');
    const today = new Date().toISOString().slice(0, 10);
    const newAnnouncement = {
      id: `ann_${Date.now()}`,
      title: announcementTitle.trim(),
      body: announcementBody.trim(),
      announcement_date: today,
      sort_order: 0,
      created_by: userId || null,
    };

    const { data, error } = await supabase
      .from('announcements')
      .insert(newAnnouncement)
      .select('*')
      .single();

    if (error) {
      setAnnouncementError(error.message || 'Could not create announcement.');
      setAnnouncementSaving(false);
      return;
    }

    const saved = data || newAnnouncement;
    setAnnouncements((current) => [{
      id: saved.id,
      date: new Date(`${saved.announcement_date}T00:00:00`).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
      title: saved.title,
      body: saved.body,
    }, ...current]);
    resetAnnouncementForm();
    setShowAnnouncementForm(false);
    setAnnouncementSaving(false);
  };

  return (
    <div className="dashboard-grid">
      {/* Welcome Card */}
      <section className="welcome-card card">
        <div className="welcome-text">
          <h1>{getGreeting()}, {organization?.name || 'CB Students'}</h1>
          {isEditingThisOrg ? (
            <div className="welcome-tagline-edit">
              <textarea
                className="welcome-tagline-input"
                value={taglineDraft}
                onChange={(e) => setTaglineDraft(e.target.value)}
                rows={2}
                disabled={taglineSaving}
                autoFocus
              />
              <div className="welcome-tagline-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                  onClick={handleCancelTagline}
                  disabled={taglineSaving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                  onClick={handleSaveTagline}
                  disabled={taglineSaving || !taglineDraft.trim()}
                >
                  {taglineSaving ? <Loader2 size={12} className="spin" /> : <Check size={12} />}
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div className="welcome-tagline-row">
              <p>{currentTagline}</p>
              {canEditTagline && (
                <button
                  type="button"
                  className="welcome-tagline-edit-btn"
                  title="Edit welcome message"
                  onClick={handleStartEditTagline}
                >
                  <Pencil size={13} />
                </button>
              )}
              {taglineSaved && (
                <span className="welcome-tagline-saved">
                  <Check size={12} /> Saved
                </span>
              )}
            </div>
          )}
        </div>
        <div className="shabbat-candle-icon">
          <BookOpen size={48} className="logo-icon" />
        </div>
      </section>

      {/* Scripture Focus */}
      <section className="scripture-card card card-gold">
        <div className="scripture-meta">
          <span className="badge badge-gold">Daily Scripture Focus</span>
          <div className="scripture-actions">
            <button
              className="btn-secondary"
              style={{ padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', borderRadius: '6px' }}
              onClick={() => generateScriptureImage({ force: true })}
              title="Regenerate image"
              disabled={scriptureImageStatus === 'loading'}
            >
              {scriptureImageStatus === 'loading' ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
              <span style={{ fontSize: '0.8rem' }}>Image</span>
            </button>
            <button
              className="btn-secondary"
              style={{ padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', borderRadius: '6px' }}
              onClick={copyScripture}
              title="Copy verse"
            >
              {copied ? <Check size={14} style={{ color: 'var(--success-green)' }} /> : <Copy size={14} />}
              <span style={{ fontSize: '0.8rem' }}>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>
        </div>
        <div className="scripture-image-wrap">
          {scriptureImageStatus === 'loading' && (
            <div className="scripture-image-state">
              <Loader2 size={24} className="spin" />
              <span>Generating scripture artwork...</span>
            </div>
          )}
          {scriptureImageStatus === 'error' && (
            <div className="scripture-image-state">
              <ImageIcon size={22} />
              <span>{scriptureImageError || 'Image generation unavailable.'}</span>
            </div>
          )}
          {scriptureImage && scriptureImageStatus !== 'loading' && (
            <img src={scriptureImage} alt={`AI-generated artwork inspired by ${scriptureRef}`} />
          )}
          {!scriptureImage && scriptureImageStatus === 'idle' && (
            <div className="scripture-image-state">
              <ImageIcon size={22} />
              <span>Scripture artwork will appear here.</span>
            </div>
          )}
        </div>
        {dailyScripture ? (
          <>
            <blockquote className="scripture-text">
              &ldquo;{scriptureText}&rdquo;
            </blockquote>
            <p className="scripture-ref">&mdash; {scriptureRef}</p>
          </>
        ) : (
          <p className="scripture-ref" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
            {dailyVerseReady ? 'Verse unavailable.' : 'Loading today\'s verse...'}
          </p>
        )}
      </section>

      {/* Reading plan + streak */}
      <ReadingPlanCard session={session} />

      {/* Verse memorization review (renders only when the user has cards) */}
      <MemoryReview session={session} />

      {/* Announcements */}
      <section className="announcements-card card">
        <div className="announcements-header">
          <h2>Announcements</h2>
          {canManageAnnouncements && hasSupabaseConfig && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                if (showAnnouncementForm) resetAnnouncementForm();
                setShowAnnouncementForm((value) => !value);
              }}
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <PlusCircle size={14} />
              <span>{showAnnouncementForm ? 'Close' : 'New'}</span>
            </button>
          )}
        </div>
        {showAnnouncementForm && canManageAnnouncements && hasSupabaseConfig && (
          <form className="announcement-form" onSubmit={handleCreateAnnouncement}>
            <input
              type="text"
              value={announcementTitle}
              onChange={(event) => setAnnouncementTitle(event.target.value)}
              placeholder="Announcement title"
              required
            />
            <textarea
              value={announcementBody}
              onChange={(event) => setAnnouncementBody(event.target.value)}
              placeholder="Write the announcement..."
              rows={3}
              required
            />
            {announcementError && <p className="announcement-error">{announcementError}</p>}
            <div className="announcement-form-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  resetAnnouncementForm();
                  setShowAnnouncementForm(false);
                }}
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.82rem' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={announcementSaving}
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <Send size={13} />
                <span>{announcementSaving ? 'Posting...' : 'Post'}</span>
              </button>
            </div>
          </form>
        )}
        <div style={{ marginTop: '1rem' }}>
          {announcementsLoading ? (
            <p className="announcement-empty">Loading announcements...</p>
          ) : announcements.length === 0 ? (
            <p className="announcement-empty">No announcements have been posted yet.</p>
          ) : (
            announcements.map((item) => (
              <div key={item.id} className="announcement-item">
                <div className="announcement-date">{item.date}</div>
                <div className="announcement-title">{item.title}</div>
                <div className="announcement-body">{item.body}</div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Volunteer Intake Form (when a leader has sent one) */}
      {(activeIntake || intakeDoneMsg) && (
        <section className="dash-intake-card card">
          <div className="dash-intake-header">
            <h2><ClipboardList size={18} /> Volunteer Intake Form</h2>
            {pendingIntakes.length > 1 && (
              <span className="dash-intake-count">{pendingIntakes.length} to complete</span>
            )}
          </div>

          {activeIntake ? (
            <form onSubmit={handleSubmitIntake} className="dash-intake-form">
              <p className="dash-intake-intro">
                Your leaders would like to know where you'd like to serve. Rank the roles you're most interested in.
              </p>

              <div className="dash-intake-field">
                <label>Group</label>
                <select value={intakeGender} onChange={(e) => setIntakeGender(e.target.value)}>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
              </div>

              <div className="dash-intake-prefs">
                {intakePrefs.map((value, i) => (
                  <div key={i} className="dash-intake-field">
                    <label>{['1st', '2nd', '3rd', '4th', '5th', '6th'][i]} choice</label>
                    <select value={value} onChange={(e) => updateIntakePref(i, e.target.value)}>
                      <option value="">— Choose role —</option>
                      {ROSTER_PREFERENCE_ROLES.map((role) => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="dash-intake-field">
                <label>Availability / notes</label>
                <textarea
                  rows={2}
                  value={intakeNotes}
                  onChange={(e) => setIntakeNotes(e.target.value)}
                  placeholder="Anything your leaders should know (schedule, experience, etc.)"
                />
              </div>

              <button type="submit" className="btn-primary" disabled={intakeSaving}>
                <Send size={15} />
                {intakeSaving ? 'Sending...' : 'Send to Leaders'}
              </button>
            </form>
          ) : (
            <p className="dash-intake-done">{intakeDoneMsg}</p>
          )}
        </section>
      )}
      {/* Highlighted Reflections (Journal Entries Carousel) */}
      {!journalsLoading && (
        <section className="dash-journal-card card" style={{ gridColumn: '1 / -1', borderLeft: '5px solid var(--accent-gold)' }}>
          <div className="dash-journal-header">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-gold)', margin: 0 }}>
              <BookOpen size={18} /> Highlighted Reflections
            </h2>
            <button className="dash-journal-link" onClick={() => navigate('/fellowship')}>
              Personal Journal <ArrowRight size={13} />
            </button>
          </div>

          <div className="dash-journal-content">
            {recentJournals.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', margin: 0, padding: '1rem 0' }}>
                No visible group or public reflections found. Share your study journal entries in your small groups or set them to public to see them highlighted here!
              </p>
            ) : (
              <>
                {recentJournals
                  .slice(activeJournalIndex * 3, activeJournalIndex * 3 + 3)
                  .map((entry, i, page) => {
                    const authorName = entry.profiles?.full_name || 'Anonymous';
                    const comments = dashJournalComments[entry.id] || [];
                    const topLevelComments = comments.filter((comment) => !comment.parent_id);
                    const replies = comments.filter((comment) => comment.parent_id);
                    const commentCount = comments.length;
                    let journalPublicUrl = '';
                    if (entry.image_path) {
                      const { data: imgData } = supabase.storage.from('prayer-images').getPublicUrl(entry.image_path);
                      journalPublicUrl = imgData?.publicUrl || '';
                    }
                    return (
                      <div key={entry.id}>
                        <div className="dash-journal-item-carousel">
                          <div className="dash-journal-meta">
                            <span style={{ fontWeight: '500', color: 'var(--text-primary)' }}>Shared by {authorName}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                <Calendar size={12} />
                                {new Date(entry.created_at).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                              </span>
                              <span className="journal-visibility" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                {entry.visibility === 'public' && <Unlock size={12} style={{ color: 'var(--success-color, #10b981)' }} />}
                                {entry.visibility === 'groups' && <Users size={12} style={{ color: 'var(--accent-blue, #3b82f6)' }} />}
                                {(entry.visibility === 'private' || !entry.visibility) && <Lock size={12} style={{ color: 'var(--accent-gold, #d97706)' }} />}
                                <span style={{ textTransform: 'capitalize' }}>
                                  {entry.visibility === 'groups' ? 'Groups Only' : entry.visibility || 'Private'}
                                </span>
                              </span>
                            </div>
                          </div>

                          <div className="dash-journal-split" style={{ marginTop: '1rem' }}>
                            {journalPublicUrl && (
                              <div
                                className="dash-journal-img-container"
                                onClick={() => setActiveImageUrl(journalPublicUrl)}
                              >
                                <img src={journalPublicUrl} alt="Reflection artwork" />
                              </div>
                            )}
                            <div className="dash-journal-body-section">
                              <h3 className="dash-journal-title">{entry.title}</h3>
                              <div className="dash-journal-scripture">
                                <BookOpen size={12} />
                                <span>{entry.scripture || 'General Reflections'}</span>
                              </div>
                              {entry.summary && (
                                <p className="dash-journal-summary">"{entry.summary}"</p>
                              )}
                              <p className={`dash-journal-body${expandedReflections[entry.id] ? ' expanded' : ''}`}>{entry.body}</p>
                              {entry.body?.length > 200 && (
                                <button
                                  type="button"
                                  className="dash-journal-read-more"
                                  onClick={() => setExpandedReflections((prev) => ({ ...prev, [entry.id]: !prev[entry.id] }))}
                                >
                                  {expandedReflections[entry.id] ? 'Show less' : 'Read more...'}
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="dash-journal-comment-section">
                            {commentCount > 0 && (
                              <div className="dash-comment-thread">
                                <div className="dash-comment-thread-heading">
                                  <MessageCircle size={13} />
                                  <span>{commentCount} {commentCount === 1 ? 'reply' : 'replies'}</span>
                                </div>
                                {topLevelComments.map((comment) => {
                                  const commenterName = comment.profiles?.full_name || 'Anonymous';
                                  const commentReplies = replies.filter((reply) => reply.parent_id === comment.id);
                                  return (
                                    <div key={comment.id} className="dash-comment-item">
                                      <div className="dash-comment-header">
                                        <strong>{commenterName}</strong>
                                        <span>
                                          {new Date(comment.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </span>
                                      </div>
                                      <p>{comment.body}</p>

                                      {commentReplies.map((reply) => {
                                        const replyName = reply.profiles?.full_name || 'Anonymous';
                                        return (
                                          <div key={reply.id} className="dash-comment-reply">
                                            <CornerDownRight size={12} className="dash-comment-reply-icon" />
                                            <div>
                                              <div className="dash-comment-header">
                                                <strong>{replyName}</strong>
                                                <span>
                                                  {new Date(reply.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                </span>
                                              </div>
                                              <p>{reply.body}</p>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {dashCommentSuccess[entry.id] && (
                              <div className="dash-comment-toast">
                                <Check size={12} /> Comment posted!
                              </div>
                            )}
                            {!dashCommentOpen[entry.id] ? (
                              <button
                                type="button"
                                className="dash-comment-btn"
                                onClick={() => setDashCommentOpen((prev) => ({ ...prev, [entry.id]: true }))}
                              >
                                <MessageCircle size={14} />
                                <span>{commentCount > 0 ? 'Add a reply' : 'Leave a comment'}</span>
                              </button>
                            ) : (
                              <div className="dash-journal-comment-form">
                                <textarea
                                  className="dash-comment-input"
                                  placeholder="Share your thoughts on this reflection..."
                                  value={dashCommentText[entry.id] || ''}
                                  onChange={(e) => setDashCommentText((prev) => ({ ...prev, [entry.id]: e.target.value }))}
                                  rows={2}
                                  disabled={dashCommentSubmitting[entry.id]}
                                />
                                <div className="dash-comment-actions">
                                  <button
                                    type="button"
                                    className="btn-secondary"
                                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                                    onClick={() => {
                                      setDashCommentOpen((prev) => ({ ...prev, [entry.id]: false }));
                                      setDashCommentText((prev) => ({ ...prev, [entry.id]: '' }));
                                    }}
                                    disabled={dashCommentSubmitting[entry.id]}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-primary"
                                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                                    onClick={() => handleDashboardComment(entry.id)}
                                    disabled={dashCommentSubmitting[entry.id] || !(dashCommentText[entry.id] || '').trim()}
                                  >
                                    {dashCommentSubmitting[entry.id] ? <Loader2 size={12} className="spin" /> : <Send size={12} />}
                                    Post
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        {i < page.length - 1 && (
                          <hr style={{ border: 'none', borderTop: '1px dashed var(--border-color)', margin: '1rem 0' }} />
                        )}
                      </div>
                    );
                  })}

                {Math.ceil(recentJournals.length / 3) > 1 && (
                  <div className="dash-journal-nav-dots">
                    {Array.from({ length: Math.ceil(recentJournals.length / 3) }, (_, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className={`dash-journal-dot ${idx === activeJournalIndex ? 'active' : ''}`}
                        onClick={() => setActiveJournalIndex(idx)}
                        aria-label={`Go to page ${idx + 1}`}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {/* Next Meeting(s) */}
      {(meetingsLoading || upcomingMeetings.length > 0) && (
        <section className="dash-meetings-card card">
          <div className="dash-meetings-header">
            <h2><CalendarClock size={18} /> Next Meeting{upcomingMeetings.length > 1 ? 's' : ''}</h2>
            <button className="dash-meetings-link" onClick={() => navigate('/studies')}>
              Study Hub <ArrowRight size={13} />
            </button>
          </div>

          {meetingsLoading ? (
            <p className="announcement-empty">Loading your group schedule...</p>
          ) : (
            <div className="dash-meetings-list">
              {upcomingMeetings.map(({ group, date, details }) => (
                <article
                  key={`${group.id}-${toDateKey(date)}`}
                  className="dash-meeting-item"
                  onClick={() => navigate('/studies')}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      navigate('/studies');
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  title="Open in Study Hub"
                >
                  <div className="dash-meeting-when">
                    <span className="dash-meeting-date">{formatMeetingDate(date)}</span>
                    <span className="dash-meeting-time">
                      {group.meeting_time ? `${group.meeting_time}${group.meeting_end_time ? ' - ' + group.meeting_end_time : ''}` : group.frequency || ''}
                    </span>
                  </div>
                  <div className="dash-meeting-body">
                    <span className="dash-meeting-group">{group.name}</span>
                    {(details?.focus_passage || group.topic) && (
                      <span className="dash-meeting-focus">
                        {details?.focus_passage || group.topic}
                      </span>
                    )}
                    <div className="dash-meeting-meta">
                      <span><User size={12} /> {details?.facilitator || group.leader || 'Facilitator TBA'}</span>
                      {(details?.location || group.meeting_location) && (
                        <span><MapPin size={12} /> {details?.location || group.meeting_location}</span>
                      )}
                    </div>
                    {details?.agenda && (
                      <p className="dash-meeting-agenda">{details.agenda}</p>
                    )}
                    {Array.isArray(details?.links) && details.links.length > 0 && (
                      <div className="dash-meeting-links">
                        <span><LinkIcon size={12} /> Resources</span>
                        {details.links.slice(0, 2).map((link) => (
                          <a
                            key={link.url}
                            href={link.url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {link.label || link.url}
                            <ExternalLink size={12} />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}


      {/* Quick Actions Grid */}
      <section className="quick-actions-card card">
        <h2>Quick Navigation</h2>
        <div className="actions-grid">
          <button className="action-btn" onClick={() => navigate('/studies')}>
            <div className="action-icon">
              <BookOpen size={24} />
            </div>
            <div className="action-info">
              <h4>Study Hub</h4>
              <p>Explore this week's Bible studies & small group discussion guides</p>
            </div>
          </button>
          
          <button className="action-btn" onClick={() => navigate('/calendar')}>
            <div className="action-icon">
              <Calendar size={24} />
            </div>
            <div className="action-info">
              <h4>Activity Calendar</h4>
              <p>View weekly student schedules, special events, camp dates & RSVP</p>
            </div>
          </button>

          <button className="action-btn" onClick={() => navigate('/fellowship')}>
            <div className="action-icon">
              <MessageSquare size={24} />
            </div>
            <div className="action-info">
              <h4>Fellowship Wall</h4>
              <p>Share encouraging thoughts & submit prayer requests</p>
            </div>
          </button>

          <button className="action-btn" onClick={() => navigate('/fellowship')}>
            <div className="action-icon">
              <PlusSquare size={24} />
            </div>
            <div className="action-info">
              <h4>Personal Journal</h4>
              <p>Write down notes or key insights from your study time</p>
            </div>
          </button>
        </div>
      </section>

      {/* Image Modal for Highlighted Reflection Pictures */}
      {activeImageUrl && createPortal(
        <div 
          className="image-modal-backdrop" 
          onClick={() => setActiveImageUrl(null)}
          role="presentation"
        >
          <div 
            className="image-modal-content" 
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              type="button" 
              className="image-modal-close" 
              onClick={() => setActiveImageUrl(null)}
              aria-label="Close image preview"
            >
              <X size={20} />
            </button>
            <img 
              src={activeImageUrl} 
              alt="Highlighted reflection artwork preview" 
              className="image-modal-img" 
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
