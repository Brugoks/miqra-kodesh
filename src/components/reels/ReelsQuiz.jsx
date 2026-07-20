import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, RotateCcw, Share2, Trophy, Check } from 'lucide-react';
import { generateReelQuiz, scoreAnswer } from '../../lib/reelsQuiz';
import { wikiImageUrl } from '../../lib/wikiImageUrls';
import wikiAnimations from '../../assets/wiki-animations.json';

const prefersReducedMotion = typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const ROUND = 7;
// Blur (px) of the "who is this?" picture as it sharpens across reveal stages.
const IDENTIFY_BLUR = [22, 12, 5];

// One question card. Per-question state (picked answer, reveal stage) lives
// here so a `key={index}` remount resets it — no effect juggling. The parent
// owns the running score.
function QuizCard({ question: q, index, total, score, streak, onAnswer, onNext, onOpen }) {
  const [picked, setPicked] = useState(null);
  const [stage, setStage] = useState(0);
  const [videoFailed, setVideoFailed] = useState(false);
  const videoRef = useRef(null);

  // Progressive reveal for "who is this?": sharpen the picture and surface a
  // hint every ~1.6s (async setState in timers is fine) until answered.
  useEffect(() => {
    if (q.type !== 'identify' || picked !== null) return undefined;
    const t1 = setTimeout(() => setStage(1), 1600);
    const t2 = setTimeout(() => setStage(2), 3200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [q, picked]);

  useEffect(() => { videoRef.current?.play().catch(() => {}); }, [picked]);

  const answer = (option) => {
    if (picked !== null) return;
    setPicked(option);
    onAnswer(option, stage);
  };

  const answered = picked !== null;
  const isCorrect = answered && picked === q.answer;
  const blur = q.type === 'identify' && !answered ? IDENTIFY_BLUR[stage] : 0;
  const showName = !q.hideName || answered;
  const animHash = wikiAnimations[q.subject];
  const useVideo = animHash && !prefersReducedMotion && !videoFailed;

  return (
    <div className="reel-frame">
      <img
        className="reel-bg"
        src={wikiImageUrl(`_default/thumbs/${q.subject}.jpg`)}
        alt=""
        aria-hidden="true"
        onError={(e) => { e.target.style.display = 'none'; }}
      />
      {useVideo ? (
        <video
          ref={videoRef}
          className="reel-media quiz-media"
          src={`${wikiImageUrl(`_default/anim/${q.subject}.mp4`)}?v=${animHash}`}
          poster={`${wikiImageUrl(`_default/anim/${q.subject}.jpg`)}?v=${animHash}`}
          style={{ filter: blur ? `blur(${blur}px)` : 'none' }}
          preload="auto"
          autoPlay
          muted
          loop
          playsInline
          onError={() => setVideoFailed(true)}
        />
      ) : (
        <img
          className={`reel-media quiz-media${answered ? ' quiz-kb' : ''}`}
          src={wikiImageUrl(`_default/${q.subject}.jpg`)}
          alt={showName ? q.subjectName : 'Mystery figure'}
          style={{ filter: blur ? `blur(${blur}px)` : 'none' }}
        />
      )}

      <div className="quiz-panel">
        <div className="quiz-hud">
          <span className="quiz-count">{index + 1} / {total}</span>
          <span className="quiz-score">{score}</span>
          {streak >= 2 && <span className="quiz-streak"><Flame size={13} /> {streak}</span>}
        </div>

        {q.hideName && !answered && stage > 0 && (
          <div className="quiz-hints">
            {q.hints.slice(0, stage).map((h) => <span key={h} className="quiz-hint">{h}</span>)}
          </div>
        )}
        {showName && <h2 className="quiz-name">{q.subjectName}</h2>}
        <p className="quiz-q">{q.q}</p>

        <div className="quiz-options">
          {q.options.map((option) => {
            let cls = 'quiz-option';
            if (answered && option === q.answer) cls += ' correct';
            else if (answered && option === picked) cls += ' wrong';
            else if (answered) cls += ' dim';
            return (
              <button
                key={option}
                type="button"
                className={cls}
                disabled={answered}
                onClick={() => answer(option)}
              >
                {option}
              </button>
            );
          })}
        </div>

        {answered && (
          <div className="quiz-result">
            <p className={`quiz-verdict ${isCorrect ? 'ok' : 'no'}`}>
              {isCorrect ? 'Correct!' : `Answer: ${q.answer}`}
            </p>
            {q.fact && <p className="quiz-fact">{q.fact}</p>}
            <div className="quiz-result-actions">
              <button type="button" className="quiz-learn" onClick={() => onOpen(q.about)}>
                Read their story →
              </button>
              <button type="button" className="quiz-btn primary quiz-next" onClick={onNext}>
                {index + 1 < total ? 'Next' : 'See results'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// The "Play" mode of Character Reels: a full-screen character with a
// multiple-choice question. "Who is this?" cards start blurred and sharpen —
// answer sooner for more points; a streak multiplies the score.
export default function ReelsQuiz({ wiki }) {
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState(() => generateReelQuiz(wiki, ROUND));
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [missed, setMissed] = useState([]);
  const [copied, setCopied] = useState(false);

  const restart = () => {
    setQuiz(generateReelQuiz(wiki, ROUND));
    setIdx(0);
    setScore(0);
    setStreak(0);
    setBest(0);
    setCorrectCount(0);
    setMissed([]);
    setCopied(false);
  };

  const handleAnswer = (option, stage) => {
    const q = quiz[idx];
    if (option === q.answer) {
      const newStreak = streak + 1;
      setScore((s) => s + scoreAnswer(q, stage, newStreak));
      setStreak(newStreak);
      setBest((b) => Math.max(b, newStreak));
      setCorrectCount((c) => c + 1);
    } else {
      setStreak(0);
      setMissed((m) => (m.some((x) => x.slug === q.subject)
        ? m
        : [...m, { slug: q.subject, name: q.subjectName }]));
    }
  };

  const share = async () => {
    const text = `I scored ${score} (${correctCount}/${quiz.length}) on Bible Character Reels 🔥`;
    const url = `${window.location.origin}/reels`;
    try {
      if (navigator.share) await navigator.share({ title: 'Bible Character Reels', text, url });
      else { await navigator.clipboard.writeText(`${text} ${url}`); setCopied(true); }
    } catch { /* user cancelled the share sheet */ }
  };

  if (!quiz.length) {
    return <div className="reels-quiz"><p className="reels-empty">Not enough characters to build a quiz yet.</p></div>;
  }

  if (idx >= quiz.length) {
    const perfect = correctCount === quiz.length;
    return (
      <div className="reels-quiz" data-no-scripture>
        <div className="quiz-done">
          <Trophy size={40} className="quiz-done-icon" />
          <div className="quiz-done-score">{score}</div>
          <p className="quiz-done-line">
            {correctCount} of {quiz.length} correct
            {best >= 2 && <> · best streak {best}🔥</>}
          </p>
          <p className="quiz-done-sub">
            {perfect ? 'Flawless — you know your Scripture.' : 'Tap a name below to close the gaps.'}
          </p>
          {missed.length > 0 && (
            <div className="quiz-missed">
              {missed.map((m) => (
                <button key={m.slug} type="button" className="quiz-missed-chip" onClick={() => navigate(`/wiki/${m.slug}`)}>
                  {m.name}
                </button>
              ))}
            </div>
          )}
          <div className="quiz-done-actions">
            <button type="button" className="quiz-btn primary" onClick={restart}>
              <RotateCcw size={15} /> Play again
            </button>
            <button type="button" className="quiz-btn" onClick={share}>
              {copied ? <><Check size={15} /> Copied</> : <><Share2 size={15} /> Share</>}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="reels-quiz" data-no-scripture>
      <QuizCard
        key={idx}
        question={quiz[idx]}
        index={idx}
        total={quiz.length}
        score={score}
        streak={streak}
        onAnswer={handleAnswer}
        onNext={() => setIdx((i) => i + 1)}
        onOpen={(slug) => navigate(`/wiki/${slug}`)}
      />
    </div>
  );
}
