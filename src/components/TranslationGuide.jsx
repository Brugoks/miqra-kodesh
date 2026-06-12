import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen } from 'lucide-react';
import './TranslationGuide.css';

export default function TranslationGuide() {
  const navigate = useNavigate();

  return (
    <div className="tg-page">
      <div className="tg-container">
        <button className="tg-back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} />
          Back
        </button>

        <div className="tg-hero">
          <BookOpen size={36} className="tg-hero-icon" />
          <h1>Understanding Bible Translation Styles</h1>
          <p className="tg-hero-intro">
            No English Bible translation is perfect in every situation. Each translation makes choices
            about how closely to follow the original wording versus how clearly to communicate the
            original meaning. Comparing multiple translations can help you gain a fuller understanding
            of Scripture.
          </p>
        </div>

        <div className="tg-spectrum-bar">
          <span>Word-for-Word</span>
          <div className="tg-spectrum-track">
            <div className="tg-spectrum-fill" />
          </div>
          <span>Thought-for-Thought</span>
        </div>

        <div className="tg-cards">
          <div className="tg-card tg-formal">
            <span className="tg-style-badge">Word-for-Word</span>
            <h2>Formal Equivalence</h2>
            <p className="tg-example-label">NASB · ESV · NKJV</p>
            <p>
              Prioritizes preserving the structure and wording of the original Hebrew, Aramaic, and
              Greek as closely as possible. Excellent for detailed study, tracing specific words, and
              examining the text with greater precision. Some passages may feel less natural in modern
              English.
            </p>
            <p className="tg-use-case">
              <strong>Best for:</strong> Deep word studies, sermon prep, cross-referencing original language tools.
            </p>
          </div>

          <div className="tg-card tg-optimal">
            <span className="tg-style-badge">Balanced</span>
            <h2>Optimal Equivalence</h2>
            <p className="tg-example-label">CSB · NIV · HCSB</p>
            <p>
              Balances faithfulness to the original wording with clarity in contemporary English.
              Preserves important details from the original languages while presenting them naturally.
              Ideal for both study and everyday reading.
            </p>
            <p className="tg-use-case">
              <strong>Best for:</strong> Daily reading, small group study, memorization.
            </p>
          </div>

          <div className="tg-card tg-dynamic">
            <span className="tg-style-badge">Thought-for-Thought</span>
            <h2>Dynamic Equivalence</h2>
            <p className="tg-example-label">NLT · MSG · GNT</p>
            <p>
              Focuses on communicating the meaning and intent of the original text in clear, modern
              language. Makes difficult passages easier to understand and helps readers grasp the flow.
              Translators sometimes interpret phrases rather than translate them more literally.
            </p>
            <p className="tg-use-case">
              <strong>Best for:</strong> New readers, devotional reading, grasping the big picture.
            </p>
          </div>
        </div>

        <div className="tg-method">
          <h3>A Helpful Study Method</h3>
          <p>
            When studying a passage, consider reading it first in the <strong>CSB</strong> for
            balance, comparing it with the <strong>NASB</strong> to see the original wording more
            closely, then consulting the <strong>NLT</strong> to clarify the meaning in contemporary
            language. Where translations differ, take extra notice — those differences often highlight
            places where the original text contains important nuances worth exploring further.
          </p>
        </div>

        <blockquote className="tg-verse">
          "All Scripture is breathed out by God and profitable for teaching, for reproof, for
          correction, and for training in righteousness." — 2 Timothy 3:16 (ESV)
        </blockquote>
      </div>
    </div>
  );
}
