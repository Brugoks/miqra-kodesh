import { useMemo, useRef, useState } from 'react';
import { Search, MapPin, Milestone, Route } from 'lucide-react';
import { searchAtlas } from '../../lib/atlas';
import './AtlasSearch.css';

const KIND_ICON = { place: MapPin, event: Milestone, journey: Route };
const KIND_LABEL = { place: 'Place', event: 'Event', journey: 'Journey' };

// "I have something in mind, show me where it happened" — a live typeahead
// over places, mappable events, and journeys (all pure/in-memory via
// searchAtlas, so there's no debounce to wire: every keystroke re-searches).
export default function AtlasSearch({ atlas, journeys, onSelectResult }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef(null);

  const results = useMemo(() => searchAtlas(atlas, journeys, query), [atlas, journeys, query]);
  const showDropdown = open && query.trim().length >= 2;

  const commit = (result) => {
    onSelectResult(result);
    setQuery('');
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e) => {
    if (!showDropdown || !results.length) {
      if (e.key === 'Escape') { setQuery(''); setOpen(false); }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commit(results[activeIndex >= 0 ? activeIndex : 0]);
    } else if (e.key === 'Escape') {
      setQuery('');
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div className="atlas-search">
      <div className="atlas-search-box">
        <Search size={15} className="atlas-search-icon" />
        <input
          ref={inputRef}
          type="text"
          inputMode="search"
          placeholder="Search a place, event, or journey…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActiveIndex(-1); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={handleKeyDown}
          aria-label="Search the ancient world map"
          aria-expanded={showDropdown}
          role="combobox"
          aria-controls="atlas-search-results"
          aria-autocomplete="list"
        />
      </div>

      {showDropdown && (
        <ul id="atlas-search-results" className="atlas-search-results" role="listbox">
          {results.length === 0 ? (
            <li className="atlas-search-empty">No matches for &ldquo;{query.trim()}&rdquo;</li>
          ) : results.map((result, i) => {
            const Icon = KIND_ICON[result.kind];
            return (
              <li key={`${result.kind}-${result.slug}`} role="option" aria-selected={i === activeIndex}>
                <button
                  type="button"
                  className={`atlas-search-result${i === activeIndex ? ' is-active' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); commit(result); }}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  <Icon size={14} className={`atlas-search-result-icon kind-${result.kind}`} />
                  <span className="atlas-search-result-name">{result.name}</span>
                  <span className="atlas-search-result-kind">{KIND_LABEL[result.kind]}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
