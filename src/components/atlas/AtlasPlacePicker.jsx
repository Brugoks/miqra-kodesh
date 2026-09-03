import { useMemo, useRef, useState } from 'react';
import { Search, MapPin, X } from 'lucide-react';
import { searchAtlas } from '../../lib/atlas';
import './AtlasDistancePanel.css';

// A single origin/destination field for AtlasDistancePanel: a places-only
// typeahead (journeys and events aren't travel endpoints) that becomes a
// clearable chip once something is picked. Deliberately its own component
// rather than a mode on AtlasSearch — the two have different endings: search
// flies the map and clears itself, a picker holds its value until cleared.
export default function AtlasPlacePicker({ atlas, value, onChange, placeholder }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);

  const results = useMemo(
    () => searchAtlas(atlas, null, query, 6, ['place']),
    [atlas, query],
  );
  const showDropdown = open && query.trim().length >= 2;

  const pick = (result) => {
    onChange({ slug: result.slug, name: result.name, la: result.la, lo: result.lo });
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  if (value) {
    return (
      <div className="atlas-picker-chip">
        <MapPin size={13} />
        <span>{value.name}</span>
        <button type="button" onClick={() => onChange(null)} aria-label={`Clear ${value.name}`}>
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className="atlas-picker">
      <div className="atlas-picker-box">
        <Search size={13} className="atlas-picker-icon" />
        <input
          ref={inputRef}
          type="text"
          inputMode="search"
          placeholder={placeholder}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          aria-label={placeholder}
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="atlas-picker-results"
          aria-autocomplete="list"
        />
      </div>
      {showDropdown && (
        <ul id="atlas-picker-results" className="atlas-picker-results" role="listbox">
          {results.length === 0 ? (
            <li className="atlas-picker-empty">No places match &ldquo;{query.trim()}&rdquo;</li>
          ) : results.map((result) => (
            <li key={result.slug} role="option">
              <button type="button" onMouseDown={(e) => { e.preventDefault(); pick(result); }}>
                <MapPin size={13} />
                <span>{result.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
