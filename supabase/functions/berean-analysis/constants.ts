// Shared constants for the Berean review pipeline. Bump PROMPT_VERSION whenever
// prompts, schemas, or report semantics change so old reports are identifiable.

export const PROMPT_VERSION = 'berean-v4';

export const MAX_TRANSCRIPT_CHARS = 60_000;
export const MAX_CARDS = 30;
export const CONTEXT_VERSES = 2; // verses of surrounding context fetched on each side

export const ANALYSIS_MODES = new Set([
  'scripture',
  'illustrations',
  'manual-extract-kit',
  'manual-judge-kit',
  'manual-save-scripture',
  'manual-illustrations-kit',
  'manual-save-illustrations',
]);

export const USAGE_TYPES = new Set(['verbatim', 'paraphrase', 'allusion', 'uncited-claim']);

export const ASSESSMENTS = new Set([
  'aligned', 'context-caution', 'unsupported', 'misquote', 'disputed-secondary', 'unverified',
]);

export const ILLUSTRATION_ALIGNMENTS = new Set([
  'clarifies-text',
  'applies-text',
  'overextends-text',
  'distracts-from-text',
  'reframes-text',
  'unsupported-spiritual-claim',
  'unverified',
]);

export const ILLUSTRATION_KINDS = ['story', 'personal-experience', 'analogy', 'cultural-example', 'illustration'];

export const CONFIDENCE = new Set(['high', 'medium', 'low']);

export const MATURITY_DIMENSIONS = [
  { key: 'doctrinalContent', label: 'Doctrinal Content' },
  { key: 'scriptureHandling', label: 'Handling of Scripture' },
  { key: 'assumedLiteracy', label: 'Assumed Biblical Literacy' },
  { key: 'applicationDepth', label: 'Application Depth' },
];
