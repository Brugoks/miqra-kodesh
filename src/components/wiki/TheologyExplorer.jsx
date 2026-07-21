import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Compass, ArrowLeft, BookOpen, ChevronDown, ChevronUp, Users,
  RotateCcw, History, Quote, Scale, HeartHandshake,
} from 'lucide-react';
import {
  listQuestionnaires, loadQuestionnaire, scoreAnswers,
  loadResultHistory, saveResult, latestResult, UNSURE,
} from '../../lib/theoQuiz';
import { loadChurchTeachers } from '../../lib/bibleWiki';
import './BibleWiki.css';
import './TheologyExplorer.css';

// Theology Explorer: guided questionnaires that trace the church's historic
// debates and help users find their own convictions within them. A mirror,
// not a membership card — every position is presented in its own best voice,
// and "I'm not sure yet" is a first-class answer.

const openScripture = (ref) =>
  window.dispatchEvent(new CustomEvent('scripture:open', { detail: { ref } }));

export default function TheologyExplorer() {
  const { systemId } = useParams();
  const [teachers, setTeachers] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadChurchTeachers().then((d) => { if (!cancelled) setTeachers(d); });
    return () => { cancelled = true; };
  }, []);

  return systemId
    ? <QuizFlow key={systemId} systemId={systemId} teachers={teachers} />
    : <ExplorerIndex />;
}

function ExplorerIndex() {
  const navigate = useNavigate();
  const [systems, setSystems] = useState(null);

  useEffect(() => {
    let cancelled = false;
    listQuestionnaires().then((s) => { if (!cancelled) setSystems(s); });
    return () => { cancelled = true; };
  }, []);

  if (!systems) {
    return <div className="bw-page"><div className="bw-loading">Loading questionnaires…</div></div>;
  }

  return (
    <div className="bw-page">
      <button className="bw-back" onClick={() => navigate('/church-history')}>
        <ArrowLeft size={16} /> Church History
      </button>
      <div className="bw-hero">
        <Compass size={32} className="bw-hero-icon" />
        <h1>Where Do You Stand?</h1>
        <p>
          Guided questionnaires that trace the church's great debates — and help you find
          your own convictions within them. Every position is presented fairly, in its own
          best voice. This is a mirror, not a membership card: the goal isn't to sort you
          into a camp, but to help you understand your own convictions and extend real
          charity to Christians who've read the same Bible and landed elsewhere.
        </p>
      </div>

      <div className="tq-system-list">
        {systems.map((s) => {
          const last = latestResult(s.id);
          const lastPos = last && s.positions.find((p) => p.id === last.ranked?.[0]?.id);
          return (
            <button key={s.id} className="tq-system-card" onClick={() => navigate(`/church-history/explore/${s.id}`)}>
              <span className="tq-system-title">{s.title}</span>
              <span className="tq-system-tagline">{s.tagline}</span>
              <span className="tq-system-meta">
                {s.questions.length} questions · about {s.minutes} min
                {lastPos && <> · last time you landed nearest <strong>{lastPos.name}</strong></>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function QuizFlow({ systemId, teachers }) {
  const navigate = useNavigate();
  const [system, setSystem] = useState(null);
  const [missing, setMissing] = useState(false);
  const [phase, setPhase] = useState('intro'); // 'intro' | 'quiz' | 'results'
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [showWhy, setShowWhy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadQuestionnaire(systemId).then((s) => {
      if (cancelled) return;
      if (s) setSystem(s); else setMissing(true);
    });
    return () => { cancelled = true; };
  }, [systemId]);

  if (missing) {
    return (
      <div className="bw-page">
        <button className="bw-back" onClick={() => navigate('/church-history/explore')}>
          <ArrowLeft size={16} /> Questionnaires
        </button>
        <p className="bw-empty">No questionnaire found for “{systemId}”.</p>
      </div>
    );
  }
  if (!system) {
    return <div className="bw-page"><div className="bw-loading">Loading…</div></div>;
  }

  const answer = (value) => {
    const q = system.questions[idx];
    const next = { ...answers, [q.id]: value };
    setAnswers(next);
    setShowWhy(false);
    if (idx + 1 < system.questions.length) {
      setIdx(idx + 1);
      return;
    }
    const scored = scoreAnswers(system, next);
    setResult(saveResult({ systemId: system.id, axes: scored.axes, ranked: scored.ranked }));
    setPhase('results');
  };

  const viewable = latestResult(system.id);
  const viewableName = viewable && system.positions.find((p) => p.id === viewable.ranked?.[0]?.id)?.name;

  if (phase === 'intro') {
    return (
      <div className="bw-page tq-narrow">
        <button className="bw-back" onClick={() => navigate('/church-history/explore')}>
          <ArrowLeft size={16} /> Questionnaires
        </button>
        <div className="bw-hero">
          <Scale size={32} className="bw-hero-icon" />
          <h1>{system.title}</h1>
          <p>{system.tagline}</p>
        </div>
        <p className="tq-intro-body">{system.intro}</p>
        {system.purpose && (
          <section className="tq-purpose">
            <h2 className="bw-section-title"><Users size={15} /> Why this exists</h2>
            <p>{system.purpose}</p>
          </section>
        )}
        <section className="tq-common">
          <h2 className="bw-section-title"><HeartHandshake size={15} /> Held in common</h2>
          <p className="tq-common-hint">Before any dividing line, every tradition in this questionnaire confesses:</p>
          <ul>
            {system.commonGround.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </section>
        <div className="tq-intro-actions">
          <button className="tq-primary" onClick={() => { setIdx(0); setAnswers({}); setPhase('quiz'); }}>
            Begin — {system.questions.length} questions
          </button>
          {viewableName && (
            <button className="tq-secondary" onClick={() => { setResult(viewable); setPhase('results'); }}>
              View your last result ({viewableName})
            </button>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'results' && result) {
    return <Results system={system} result={result} teachers={teachers} onRetake={() => { setIdx(0); setAnswers({}); setPhase('quiz'); }} />;
  }

  const q = system.questions[idx];
  const axis = system.axes.find((a) => a.id === q.axis);
  const voiceName = (slug) => teachers?.bySlug.get(slug)?.name;

  return (
    <div className="bw-page tq-narrow">
      <button className="bw-back" onClick={() => setPhase('intro')}>
        <ArrowLeft size={16} /> {system.title}
      </button>

      <div className="tq-progress">
        <div className="tq-progress-track">
          <div className="tq-progress-fill" style={{ width: `${(idx / system.questions.length) * 100}%` }} />
        </div>
        <span className="tq-progress-label">{idx + 1} / {system.questions.length}</span>
      </div>

      <span className="tq-axis-tag">{axis?.name}</span>
      <h2 className="tq-prompt">{q.prompt}</h2>

      <button className="tq-why-toggle" onClick={() => setShowWhy((v) => !v)}>
        {showWhy ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Why this question matters
      </button>
      {showWhy && (
        <div className="tq-why">
          <p>{q.teaching.context}</p>
          <div className="bw-chapter-chips">
            {q.teaching.scriptures.map((r) => (
              <button key={r} className="bw-ref-chip" onClick={() => openScripture(r)}>{r}</button>
            ))}
          </div>
        </div>
      )}

      <div className="tq-options">
        {q.options.map((opt, i) => (
          <button
            key={i}
            className={`tq-option${opt.src ? ' tq-option-quote' : ''}${answers[q.id] === i ? ' tq-option-selected' : ''}`}
            onClick={() => answer(i)}
          >
            {opt.src && <Quote size={14} className="tq-option-quote-icon" />}
            <span className="tq-option-text">{opt.src ? `“${opt.text}”` : opt.text}</span>
            {opt.src && <cite className="tq-option-src">— {opt.src}</cite>}
            {!opt.src && opt.voice && voiceName(opt.voice) && (
              <span className="tq-option-voice">echoes {voiceName(opt.voice)}</span>
            )}
          </button>
        ))}
        <button
          className={`tq-option tq-option-unsure${answers[q.id] === UNSURE ? ' tq-option-selected' : ''}`}
          onClick={() => answer(UNSURE)}
        >
          I'm not sure yet — leave this one open
        </button>
      </div>

      {idx > 0 && (
        <button className="tq-prev" onClick={() => { setIdx(idx - 1); setShowWhy(false); }}>
          <ArrowLeft size={14} /> Previous question
        </button>
      )}
    </div>
  );
}

function Results({ system, result, teachers, onRetake }) {
  const navigate = useNavigate();
  const { axes, ranked } = result;

  if (!ranked?.length) {
    return (
      <div className="bw-page tq-narrow">
        <button className="bw-back" onClick={() => navigate('/church-history/explore')}>
          <ArrowLeft size={16} /> Questionnaires
        </button>
        <div className="bw-hero">
          <Compass size={32} className="bw-hero-icon" />
          <h1>Every question still open</h1>
          <p>
            You answered “not sure yet” throughout — an honest place to start. Explore the
            questions again with the “why this matters” notes open, or read a few of the
            voices in Church History first.
          </p>
        </div>
        <div className="tq-intro-actions">
          <button className="tq-primary" onClick={onRetake}>Take it again</button>
        </div>
      </div>
    );
  }

  const top = system.positions.find((p) => p.id === ranked[0].id);
  if (!top) {
    return (
      <div className="bw-page tq-narrow">
        <p className="bw-empty">This saved result predates the current questionnaire — please retake it.</p>
        <div className="tq-intro-actions"><button className="tq-primary" onClick={onRetake}>Retake</button></div>
      </div>
    );
  }
  const runnerUp = ranked[1] && ranked[0].closeness - ranked[1].closeness <= 8
    ? system.positions.find((p) => p.id === ranked[1].id)
    : null;
  const openAxes = system.axes.filter((a) => (axes[a.id]?.confidence ?? 0) < 0.5);
  const figures = (top.figures || [])
    .map((f) => ({ ...f, teacher: teachers?.bySlug.get(f.s) }))
    .filter((f) => f.teacher);
  const previous = loadResultHistory()
    .filter((r) => r.systemId === system.id && r.at !== result.at)
    .slice(0, 4);
  const posName = (r) => system.positions.find((p) => p.id === r.ranked?.[0]?.id)?.name;

  return (
    <div className="bw-page tq-narrow">
      <button className="bw-back" onClick={() => navigate('/church-history/explore')}>
        <ArrowLeft size={16} /> Questionnaires
      </button>

      <header className="tq-result-header">
        <span className="tq-result-eyebrow">Your nearest voice</span>
        <h1>{top.name}</h1>
        <p className="tq-result-subtitle">{top.subtitle}</p>
        <span className="tq-closeness">{ranked[0].closeness}% aligned</span>
        {runnerUp && (
          <p className="tq-runner-up">
            …with a strong echo of <strong>{runnerUp.name}</strong> ({ranked[1].closeness}%) —
            you stand between two streams.
          </p>
        )}
      </header>

      <p className="tq-result-summary">{top.summary}</p>

      <section className="tq-meters">
        <h2 className="bw-section-title"><Scale size={15} /> Where you landed</h2>
        <p className="tq-meter-legend">● you &nbsp;·&nbsp; ◇ {top.name}</p>
        {system.axes.map((a) => {
          const u = axes[a.id] || { score: 0, confidence: 0 };
          const open = u.confidence < 0.5;
          return (
            <div key={a.id} className={`tq-meter${open ? ' tq-meter-open' : ''}`}>
              <div className="tq-meter-head">
                <span className="tq-meter-name">{a.name}</span>
                {open && <span className="tq-open-badge">open question</span>}
              </div>
              <div className="tq-meter-track">
                <span className="tq-meter-ghost" style={{ left: `${((top.profile[a.id] ?? 0) + 1) * 50}%` }}>◇</span>
                {!open && <span className="tq-meter-dot" style={{ left: `${(u.score + 1) * 50}%` }} />}
              </div>
              <div className="tq-meter-poles">
                <span>{a.poles[0]}</span>
                <span>{a.poles[1]}</span>
              </div>
            </div>
          );
        })}
        {openAxes.length > 0 && (
          <p className="tq-open-note">
            Open questions are not failures — they're your reading list. Start with the
            passages in each question's “why this matters” note.
          </p>
        )}
      </section>

      {figures.length > 0 && (
        <section className="bw-foundation">
          <h2 className="bw-section-title"><Users size={15} /> Voices who stood near here</h2>
          <p className="bw-section-hint">
            Historical figures aren't modern labels — these are teachers whose emphasis rhymes with yours. Tap to meet them.
          </p>
          <div className="bw-relation-chips" data-no-scripture>
            {figures.map((f) => (
              <button
                key={f.s}
                className="bw-entity-chip teacher"
                title={f.note}
                onClick={() => navigate(`/church-history/${f.s}`)}
              >
                {f.teacher.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="bw-foundation">
        <h2 className="bw-section-title"><Compass size={15} /> The movements this shaped</h2>
        <p className="tq-body">{top.movements}</p>
      </section>

      <section className="bw-foundation">
        <h2 className="bw-section-title"><HeartHandshake size={15} /> How this faith is lived</h2>
        <p className="tq-body">{top.lived}</p>
      </section>

      <section className="bw-foundation">
        <h2 className="bw-section-title"><BookOpen size={15} /> For your reflection</h2>
        <ul className="tq-reflect">
          {top.reflect.map((r) => <li key={r}>{r}</li>)}
        </ul>
      </section>

      {top.dialogue?.length > 0 && (
        <section className="tq-dialogue">
          <h2 className="bw-section-title"><Users size={15} /> For a conversation with someone who differs</h2>
          <p className="tq-common-hint">
            This result is most useful in a conversation, not a debate. These are for talking
            with — not at — someone who lands somewhere else on this page.
          </p>
          <ul className="tq-reflect">
            {top.dialogue.map((d) => <li key={d}>{d}</li>)}
          </ul>
        </section>
      )}

      <section className="tq-common">
        <h2 className="bw-section-title"><HeartHandshake size={15} /> Held in common</h2>
        <ul>
          {system.commonGround.map((c) => <li key={c}>{c}</li>)}
        </ul>
      </section>

      <p className="bw-tradition-note">
        This describes where your current understanding leans — it is not Scripture, and it is
        not a verdict. Like the Bereans, test every teacher and every result against the Word
        (Acts 17:11). And where sincere believers land in different places, hold your
        conviction with humility and your brother or sister with charity — eager to maintain
        the unity of the Spirit in the bond of peace (Ephesians 4:2-3).
      </p>

      <div className="tq-intro-actions">
        <button className="tq-primary" onClick={onRetake}><RotateCcw size={15} /> Take it again</button>
        <button className="tq-secondary" onClick={() => navigate('/church-history/explore')}>
          Other questionnaires
        </button>
      </div>

      {previous.length > 0 && (
        <div className="tq-history">
          <h2 className="bw-section-title"><History size={15} /> Your earlier takes</h2>
          <ul>
            {previous.map((r) => (
              <li key={r.at}>
                {new Date(r.at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                {' — '}{posName(r) || 'earlier version'}{r.ranked?.[0] ? ` · ${r.ranked[0].closeness}%` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
