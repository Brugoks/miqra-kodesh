import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpenCheck, CheckCircle2, Database, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react';
import './InsightsGuide.css';

export default function InsightsGuide() {
  const navigate = useNavigate();

  return (
    <div className="ig-page">
      <main className="ig-container">
        <button type="button" className="ig-back" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} />
          Back
        </button>

        <header className="ig-hero">
          <ShieldCheck size={38} />
          <div>
            <h1>How Scripture Insights Are Produced</h1>
            <p>
              Insights are AI-assisted study notes designed to support careful reading—not replace
              Scripture, pastors, teachers, or trusted scholarship.
            </p>
          </div>
        </header>

        <section className="ig-flow" aria-label="Insight generation process">
          <article>
            <BookOpenCheck size={20} />
            <h2>1. Passage first</h2>
            <p>The selected passage text is the primary source and controls the response.</p>
          </article>
          <article>
            <Database size={20} />
            <h2>2. Curated context</h2>
            <p>A concise book and genre profile supplies literary and historical orientation.</p>
          </article>
          <article>
            <Sparkles size={20} />
            <h2>3. Constrained generation</h2>
            <p>Gemini must separate context, interpretation, reflection, and cross-references.</p>
          </article>
          <article>
            <CheckCircle2 size={20} />
            <h2>4. Validation</h2>
            <p>The server checks structure, source IDs, confidence labels, and canonical references.</p>
          </article>
        </section>

        <section className="ig-section">
          <h2>Accuracy guardrails</h2>
          <ul>
            <li>The model may use only the passage and curated profile supplied with the request.</li>
            <li>Historical details must remain general when the evidence does not establish specifics.</li>
            <li>Interpretive disagreement must be labeled rather than presented as certainty.</li>
            <li>Claims include confidence levels and the source IDs supporting them.</li>
            <li>Generated cross-references must use canonical Bible-book and chapter ranges and are clearly labeled as unverified AI suggestions.</li>
            <li>The model may not claim divine authority, predict outcomes, or prescribe personal decisions.</li>
            <li>Invalid responses may be corrected once; responses that still fail are not displayed.</li>
          </ul>
        </section>

        <section className="ig-section">
          <h2>Confidence labels</h2>
          <div className="ig-confidence-grid">
            <div><strong>High</strong><span>Explicit in the passage or supplied source.</span></div>
            <div><strong>Medium</strong><span>A strong synthesis supported by the supplied context.</span></div>
            <div><strong>Low</strong><span>Indirect, thematic, debated, or weakly supported.</span></div>
          </div>
        </section>

        <aside className="ig-caution">
          <TriangleAlert size={20} />
          <div>
            <h2>Important limitation</h2>
            <p>
              AI can still misunderstand a passage or omit relevant scholarship. Verify important
              conclusions in Scripture and consult trusted teachers and commentaries—especially for
              disputed doctrine or personal guidance.
            </p>
          </div>
        </aside>

        <section className="ig-section">
          <h2>Use in passage visualization</h2>
          <p>
            When insights have already been generated, only validated literary context, historical
            context, and medium-or-high-confidence themes may help compose the art prompt. The passage
            remains authoritative; commentary, application, low-confidence claims, and disputed views
            are not used to add visual elements.
          </p>
        </section>
      </main>
    </div>
  );
}
