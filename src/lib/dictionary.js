// Client for dictionaryapi.dev — keyless English dictionary. Used as the
// fallback when a tapped word has no Strong's entry, so every word in a
// passage is explorable.

// Fetch definitions for an English word.
// Returns { word, phonetic, meanings: [{ partOfSpeech, definitions: [str] }] }
// or null when the word is unknown.
export async function fetchDefinition(word) {
  const clean = String(word).toLowerCase().replace(/[^a-z'-]/g, '');
  if (!clean) return null;
  const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(clean)}`);
  if (!res.ok) return null;
  const json = await res.json();
  const entry = Array.isArray(json) ? json[0] : null;
  if (!entry?.meanings?.length) return null;
  return {
    word: entry.word || clean,
    phonetic: entry.phonetic || entry.phonetics?.find((p) => p.text)?.text || '',
    meanings: entry.meanings.slice(0, 3).map((m) => ({
      partOfSpeech: m.partOfSpeech || '',
      definitions: (m.definitions || []).slice(0, 2).map((d) => d.definition).filter(Boolean),
    })).filter((m) => m.definitions.length),
  };
}
