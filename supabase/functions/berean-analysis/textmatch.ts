// Mechanical text checks (no AI). Two jobs:
//   1. quoteMatchScore — how faithfully a "verbatim" quote tracks the fetched
//      passage text (order-aware, translation-tolerant).
//   2. makeQuoteChecker — does an AI-reported excerpt actually appear in the
//      transcript? Guards against hallucinated evidence quotes.
// Pure functions — no Deno APIs — so they are unit-testable (textmatch.test.js).

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\[\d+\]/g, ' ')
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function contentWords(text: string): string[] {
  return normalizeForMatch(text).split(' ').filter((word) => word.length >= 3);
}

// Longest common subsequence length between two word arrays. Order-aware:
// "god is love" vs "love is god" share words but not sequence. Tolerant of
// translation differences because dropped/substituted words only shorten the
// subsequence, they don't zero it.
function lcsLength(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  let previous = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    const current = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = a[i - 1] === b[j - 1]
        ? previous[j - 1] + 1
        : Math.max(previous[j], current[j - 1]);
    }
    previous = current;
  }
  return previous[b.length];
}

// Share of the quote's content words that appear IN ORDER in the passage.
// 1 when the quote is too short to judge.
export function quoteMatchScore(quote: string, passageText: string): number {
  const quoteWords = contentWords(quote);
  if (!quoteWords.length) return 1;
  const passageWords = contentWords(passageText);
  return Math.round((lcsLength(quoteWords, passageWords) / quoteWords.length) * 100) / 100;
}

// Returns a checker for "does this excerpt actually occur in the transcript?".
// The transcript is normalized once; each call answers:
//   true  — every substantial segment of the excerpt is found (ellipses split
//           the excerpt into segments), or the in-order word overlap is high
//   false — the excerpt cannot be located
//   null  — the excerpt is too short to judge fairly
export function makeQuoteChecker(transcript: string): (excerpt: string) => boolean | null {
  const normalizedTranscript = normalizeForMatch(transcript);
  const transcriptWords = normalizedTranscript.split(' ');
  return (excerpt: string) => {
    const segments = String(excerpt || '')
      .split(/(?:\.\.\.|…)/)
      .map((segment) => normalizeForMatch(segment))
      .filter((segment) => segment.split(' ').filter(Boolean).length >= 4);
    if (!segments.length) return null;
    if (segments.every((segment) => normalizedTranscript.includes(segment))) return true;
    // Fall back to in-order overlap: light punctuation/filler drift in the AI's
    // copy of the excerpt shouldn't count as a fabrication.
    const excerptWords = normalizeForMatch(String(excerpt || '')).split(' ').filter(Boolean);
    if (excerptWords.length < 4) return null;
    return lcsLength(excerptWords, transcriptWords) / excerptWords.length >= 0.85;
  };
}
