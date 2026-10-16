import { useState } from 'react';
import { JOURNEY_TEXT_MAX } from '../../lib/canvasJourney';

// Write drafts as the user types, so switching pages cannot discard an unsaved
// thought. Keys belong to the signed-in person; no private text goes into URLs.
export default function useMomentDraft(key, defaults) {
  const [value, setValue] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(key));
      return stored && Object.keys(defaults).every((field) => typeof stored[field] === 'string' && stored[field].length <= JOURNEY_TEXT_MAX)
        && (!('days' in defaults) || ['', '1', '7', '30'].includes(stored.days)) ? stored : defaults;
    } catch { return defaults; }
  });
  const [available, setAvailable] = useState(true);
  function update(next) {
    setValue(next);
    try { localStorage.setItem(key, JSON.stringify(next)); setAvailable(true); } catch { setAvailable(false); }
  }
  function clear() {
    setValue(defaults);
    try { localStorage.removeItem(key); } catch { setAvailable(false); }
  }
  return [value, update, clear, available];
}

