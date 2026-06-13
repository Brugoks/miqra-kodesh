import { useState, useEffect } from 'react';
import { Sparkles, RefreshCw, ChevronDown, ChevronUp, Check, Loader2 } from 'lucide-react';
import { supabase, hasSupabaseConfig } from '../lib/supabaseClient';
import { canAccessLeaderTools } from '../lib/roles';
import './IceBreaker.css';

const THEMES = [
  { value: '', label: 'Surprise me' },
  { value: 'faith & trust', label: 'Faith & Trust' },
  { value: 'family & childhood', label: 'Family & Childhood' },
  { value: 'gratitude & blessings', label: 'Gratitude' },
  { value: 'fun & humor', label: 'Fun & Humor' },
  { value: 'dreams & calling', label: 'Dreams & Calling' },
  { value: 'community & friendship', label: 'Community' },
  { value: 'scripture & devotion', label: 'Scripture & Devotion' },
];

function buildPrompt(theme) {
  const themeClause = theme
    ? `Theme for today: "${theme}".`
    : 'Choose a fun, creative theme on your own.';

  return `<s>[INST] You are a creative assistant helping a Christian small group leader. Generate exactly 5 ice breaker questions for their group meeting.

${themeClause}

Requirements:
- Wholesome, appropriate for all ages (teens through seniors)
- Encourage genuine sharing, laughter, and connection
- Mix light-hearted fun with moments of real reflection
- Each question must be one sentence, under 20 words
- Do NOT include Bible trivia — these should work for anyone

Return ONLY a numbered list 1 through 5. No introduction, no commentary, no extra text after the list. [/INST]`;
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
              {THEMES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
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
              <span>Generating questions — this can take up to 20 seconds on first load…</span>
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
