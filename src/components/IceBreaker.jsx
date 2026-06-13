import { useState, useEffect } from 'react';
import { Sparkles, RefreshCw, ChevronDown, ChevronUp, Check, Loader2 } from 'lucide-react';
import { supabase, hasSupabaseConfig } from '../lib/supabaseClient';
import { canAccessLeaderTools } from '../lib/roles';
import './IceBreaker.css';

const THEMES = [
  { value: '', label: 'Surprise me', depth: 'light' },
  { value: 'fun & humor', label: 'Fun & Humor', depth: 'light' },
  { value: 'family & childhood', label: 'Family & Childhood', depth: 'light' },
  { value: 'gratitude & blessings', label: 'Gratitude', depth: 'light' },
  { value: 'faith & trust', label: 'Faith & Trust', depth: 'medium' },
  { value: 'dreams & calling', label: 'Dreams & Calling', depth: 'medium' },
  { value: 'community & friendship', label: 'Community', depth: 'medium' },
  { value: 'scripture & devotion', label: 'Scripture & Devotion', depth: 'medium' },
  { value: 'fear & doubt', label: 'Fear & Doubt', depth: 'deep' },
  { value: 'shame & redemption', label: 'Shame & Redemption', depth: 'deep' },
  { value: 'struggle & perseverance', label: 'Struggle & Perseverance', depth: 'deep' },
  { value: 'identity & belonging', label: 'Identity & Belonging', depth: 'deep' },
  { value: 'loss & grief', label: 'Loss & Grief', depth: 'deep' },
  { value: 'prayer & unanswered prayers', label: 'Unanswered Prayer', depth: 'deep' },
  { value: 'forgiveness & letting go', label: 'Forgiveness', depth: 'deep' },
  { value: 'loneliness & being known', label: 'Loneliness & Being Known', depth: 'deep' },
];

const DEPTH_INSTRUCTIONS = {
  light: `- Keep questions warm, fun, and easy to answer
- Safe for new members who don't know each other yet
- Light reflection is welcome but nothing too personal`,
  medium: `- Invite genuine reflection and personal sharing
- Questions should feel meaningful but not overwhelming
- Encourage people to go a little deeper than surface-level`,
  deep: `- These are vulnerability-focused questions for a group with established trust
- Ask questions that create honest, courageous sharing
- It's okay to sit with discomfort — that's where real connection happens
- Questions should gently crack open the heart, not interrogate
- Avoid clichés; ask what people rarely get asked in church settings`,
};

function buildPrompt(theme) {
  const themeObj = THEMES.find(t => t.value === theme) || THEMES[0];
  const depth = themeObj.depth || 'medium';

  const themeClause = theme
    ? `Theme for today: "${theme}".`
    : 'Choose a meaningful theme appropriate to the depth level below.';

  return `You are a gifted small group facilitator helping a Christian community go deeper together. Generate exactly 5 ice breaker questions for a group meeting.

${themeClause}
Depth level: ${depth.toUpperCase()}

${DEPTH_INSTRUCTIONS[depth]}

Additional requirements:
- Wholesome and appropriate for all ages (teens through seniors)
- Each question must be one sentence, under 25 words
- Do NOT include Bible trivia — questions should work for anyone
- Write questions that make people think "I've never been asked that before"

Return ONLY a numbered list 1 through 5. No introduction, no commentary, no extra text after the list.`;
}

function parseQuestions(raw) {
  if (!raw) return [];
  return raw
    .split('\n')
    .map(line => line.replace(/^\s*\d+[\.\)]\s*/, '').trim())
    .filter(q => q.length > 8 && q.length < 200);
}

export default function IceBreaker({ session, userRole, activeOrgId }) {
  const [record, setRecord] = useState(null);        // current DB row
  const [generated, setGenerated] = useState([]);    // freshly generated (not yet saved)
  const [theme, setTheme] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const isLeader = canAccessLeaderTools(userRole);
  const userId = session?.user?.id;
  const configured = hasSupabaseConfig && Boolean(userId);

  // Load the most recent ice breaker for this org
  useEffect(() => {
    if (!configured) { setLoaded(true); return; }
    const fetchLatest = async () => {
      let q = supabase
        .from('ice_breakers')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);
      if (activeOrgId) q = q.eq('organization_id', activeOrgId);
      const { data } = await q;
      setRecord(data?.[0] || null);
      setLoaded(true);
    };
    fetchLatest();
  }, [activeOrgId, configured]);

  const handleGenerate = async () => {
    setGenError('');
    setGenerating(true);
    setGenerated([]);
    setExpanded(true);
    try {
      const { data, error } = await supabase.functions.invoke('hf-proxy', {
        body: { prompt: buildPrompt(theme), max_new_tokens: 350 },
      });
      if (error || !data?.text) throw new Error(error?.message || 'No response from AI');
      const questions = parseQuestions(data.text);
      if (questions.length < 2) throw new Error('Could not parse questions — try again.');
      setGenerated(questions);
    } catch (err) {
      setGenError(err.message || 'Generation failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleActivate = async (question) => {
    if (!configured) return;
    setSaving(true);
    try {
      if (record) {
        const { data } = await supabase
          .from('ice_breakers')
          .update({ active_question: question, questions: generated.length ? generated : record.questions, updated_at: new Date().toISOString() })
          .eq('id', record.id)
          .select()
          .single();
        setRecord(data);
      } else {
        const { data } = await supabase
          .from('ice_breakers')
          .insert({
            organization_id: activeOrgId || null,
            created_by: userId,
            theme,
            questions: generated,
            active_question: question,
          })
          .select()
          .single();
        setRecord(data);
      }
      setGenerated([]);
      setExpanded(false);
    } catch (err) {
      setGenError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!record) return;
    await supabase.from('ice_breakers').update({ active_question: null }).eq('id', record.id);
    setRecord(prev => ({ ...prev, active_question: null }));
  };

  if (!loaded) return null;

  const activeQuestion = record?.active_question;
  const hasActive = Boolean(activeQuestion);

  return (
    <section className={`ice-breaker-card ${hasActive ? 'has-active' : ''}`}>
      {/* Header */}
      <div className="ib-header">
        <div className="ib-title-row">
          <Sparkles size={18} className="ib-icon" />
          <div>
            <h2 className="ib-title">Ice Breaker</h2>
            <p className="ib-subtitle">Start your meeting with a conversation starter</p>
          </div>
        </div>

        {isLeader && (
          <button
            className="ib-toggle-btn"
            onClick={() => setExpanded(v => !v)}
            aria-label={expanded ? 'Collapse' : 'Generate ice breakers'}
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            <span>{expanded ? 'Close' : 'Generate'}</span>
          </button>
        )}
      </div>

      {/* Active question banner */}
      {hasActive && (
        <div className="ib-active-question">
          <p className="ib-question-text">"{activeQuestion}"</p>
          {isLeader && (
            <button className="ib-clear-btn" onClick={handleClear} title="Clear question">
              Clear
            </button>
          )}
        </div>
      )}

      {!hasActive && !isLeader && (
        <p className="ib-empty">No ice breaker set for today. Check back before your meeting!</p>
      )}

      {/* Leader generator panel */}
      {isLeader && expanded && (
        <div className="ib-generator animate-fade-in">
          <div className="ib-controls">
            <select
              className="ib-theme-select"
              value={theme}
              onChange={e => setTheme(e.target.value)}
            >
              <option value="">Surprise me</option>
              <optgroup label="— Light —">
                {THEMES.filter(t => t.depth === 'light' && t.value !== '').map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </optgroup>
              <optgroup label="— Medium —">
                {THEMES.filter(t => t.depth === 'medium').map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </optgroup>
              <optgroup label="— Deep & Vulnerable —">
                {THEMES.filter(t => t.depth === 'deep').map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </optgroup>
            </select>
            <button
              className="ib-generate-btn"
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating
                ? <><Loader2 size={14} className="ib-spin" /> Thinking…</>
                : <><RefreshCw size={14} /> Generate</>
              }
            </button>
          </div>

          {generating && (
            <div className="ib-loading">
              <Loader2 size={20} className="ib-spin" />
              <span>Generating questions…</span>
            </div>
          )}

          {genError && (
            <p className="ib-error">{genError}</p>
          )}

          {generated.length > 0 && !generating && (
            <ul className="ib-question-list">
              {generated.map((q, i) => (
                <li key={i} className="ib-question-item">
                  <span className="ib-q-num">{i + 1}</span>
                  <span className="ib-q-text">{q}</span>
                  <button
                    className="ib-use-btn"
                    onClick={() => handleActivate(q)}
                    disabled={saving}
                  >
                    {saving ? <Loader2 size={12} className="ib-spin" /> : <Check size={12} />}
                    Use this
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
