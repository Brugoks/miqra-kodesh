import { useState } from 'react';
import { Sparkles, RotateCcw, ArrowRight } from 'lucide-react';
import { generateQuiz } from '../../lib/wikiQuiz';

// Self-serve trivia from the foundation data — family relations, first
// appearances, aliases, name meanings. Fresh questions every round; tapping
// through to the subject's page turns a wrong answer into a rabbit hole.
export default function WikiQuizCard({ wiki, onOpenEntry }) {
  const [questions, setQuestions] = useState(null);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);

  const start = () => {
    setQuestions(generateQuiz(wiki, 5));
    setIndex(0);
    setPicked(null);
    setScore(0);
  };

  if (!questions) {
    return (
      <div className="wqz-card wqz-idle">
        <div>
          <strong>How well do you know the people of the Bible?</strong>
          <p>Five quick questions, generated straight from the text's own index.</p>
        </div>
        <button className="btn-primary" onClick={start}><Sparkles size={14} /> Take the quiz</button>
      </div>
    );
  }

  const done = index >= questions.length;
  if (done) {
    return (
      <div className="wqz-card wqz-idle">
        <div>
          <strong>{score} of {questions.length} correct{score === questions.length ? ' — well done!' : ''}</strong>
          <p>{score < questions.length ? 'Tap any name in the wiki to close the gaps.' : 'Try another round — the questions change every time.'}</p>
        </div>
        <button className="btn-secondary" onClick={start}><RotateCcw size={14} /> Play again</button>
      </div>
    );
  }

  const q = questions[index];
  const answered = picked !== null;

  return (
    <div className="wqz-card">
      <div className="wqz-progress">Question {index + 1} of {questions.length} · {score} correct</div>
      <p className="wqz-question">{q.q}</p>
      <div className="wqz-options" data-no-scripture>
        {q.options.map((option) => {
          let cls = 'wqz-option';
          if (answered && option === q.answer) cls += ' correct';
          else if (answered && option === picked) cls += ' wrong';
          return (
            <button
              key={option}
              className={cls}
              disabled={answered}
              onClick={() => {
                setPicked(option);
                if (option === q.answer) setScore((s) => s + 1);
              }}
            >
              {option}
            </button>
          );
        })}
      </div>
      {answered && (
        <div className="wqz-after">
          {q.about && (
            <button className="wqz-learn" onClick={() => onOpenEntry?.(q.about)}>
              Read why
            </button>
          )}
          <button className="btn-primary wqz-next" onClick={() => { setIndex((i) => i + 1); setPicked(null); }}>
            {index + 1 < questions.length ? <>Next <ArrowRight size={14} /></> : 'See score'}
          </button>
        </div>
      )}
    </div>
  );
}
