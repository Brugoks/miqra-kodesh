import { useMemo, useState } from 'react';
import { HelpCircle, Search } from 'lucide-react';
import { HELP_AREAS, searchHelpTopics } from '../lib/helpContent';
import { setHelpMode } from '../lib/helpMode';
import './HelpGuide.css';

// Everything the `?` badges say, on one searchable page. Feedback ticket
// 032815b7.
//
// Same registry as the badges, so this cannot fall out of step with them —
// and it answers the case the badges can't: someone who doesn't yet know
// which screen the thing they're confused about lives on.

export default function HelpGuide() {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => searchHelpTopics(query), [query]);
  const matchIds = useMemo(() => new Set(matches.map((topic) => topic.id)), [matches]);
  const areas = HELP_AREAS.map((area) => ({
    area,
    topics: matches.filter((topic) => topic.area === area),
  })).filter((group) => group.topics.length > 0);

  return (
    <div className="help-guide">
      <header className="help-guide-head card">
        <div className="help-guide-title">
          <HelpCircle size={22} />
          <div>
            <h1>Help</h1>
            <p>What everything in the app is for, in plain terms.</p>
          </div>
        </div>
        <p className="help-guide-hint">
          You can also tap the <strong>?</strong> in the top bar on any page — that turns on little
          question marks next to the thing they explain.
        </p>
      </header>

      <div className="help-guide-search">
        <Search size={15} />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search help — try “rsvp” or “highlight”"
          aria-label="Search help topics"
        />
      </div>

      {areas.length === 0 ? (
        <p className="help-guide-empty">
          Nothing here matches “{query.trim()}”. Try a word you saw on screen, or ask in the
          feedback form and we&rsquo;ll add it.
        </p>
      ) : (
        areas.map(({ area, topics }) => (
          <section key={area} className="help-guide-area card">
            <h2>{area}</h2>
            <dl>
              {topics.map((topic) => (
                <div key={topic.id} className="help-guide-topic">
                  <dt>{topic.title}</dt>
                  <dd>{topic.body}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))
      )}

      <button
        type="button"
        className="btn-secondary help-guide-enable"
        onClick={() => setHelpMode(true)}
      >
        Show the question marks on every page
      </button>

      <p className="help-guide-count">
        {matchIds.size} {matchIds.size === 1 ? 'topic' : 'topics'}
      </p>
    </div>
  );
}
