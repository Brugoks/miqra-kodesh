// Report assembly: normalize AI output, attach fetched Scripture, verify that
// AI-quoted excerpts actually occur in the transcript, and build the JSONB
// report stored in sermon_talk_berean. All AI output passes through here —
// both the automatic pipeline and the admin manual-import workflow.

import {
  PROMPT_VERSION, MAX_CARDS, USAGE_TYPES, ASSESSMENTS,
  ILLUSTRATION_ALIGNMENTS, ILLUSTRATION_KINDS, CONFIDENCE, MATURITY_DIMENSIONS,
} from './constants.ts';
import { parseReference, toPassageId, type ParsedRef } from './reference.ts';
import { fetchPassagesByKey, type FetchedPassage } from './bible.ts';
import { quoteMatchScore, makeQuoteChecker } from './textmatch.ts';
import { parseJsonContent } from './providers.ts';

export function parseManualJson(value: unknown, label: string) {
  if (typeof value === 'string') {
    try {
      return parseJsonContent(value);
    } catch {
      throw new Error(`${label} must be valid JSON.`);
    }
  }
  if (value && typeof value === 'object') return value;
  throw new Error(`${label} is required.`);
}

export function normalizeExtractUsages(parsed: any) {
  return (Array.isArray(parsed?.usages) ? parsed.usages : [])
    .filter((usage: any) =>
      typeof usage?.transcriptQuote === 'string' && usage.transcriptQuote.trim().length >= 10
      && USAGE_TYPES.has(usage?.usageType))
    .slice(0, MAX_CARDS);
}

// Turn extraction output into cards: fetch real passage text for every unique
// parseable reference (concurrently), score verbatim quotes against it, and
// check each transcriptQuote actually occurs in the transcript.
export async function buildCardsFromExtraction(parsed: any, transcript: string) {
  const usages = normalizeExtractUsages(parsed);
  const uniqueRefs = new Map<string, ParsedRef>();
  for (const usage of usages) {
    const parsedRef = usage.reference ? parseReference(usage.reference) : null;
    if (parsedRef) uniqueRefs.set(toPassageId(parsedRef, 0), parsedRef);
  }
  const fetchedByKey = await fetchPassagesByKey(uniqueRefs);
  const checkQuote = makeQuoteChecker(transcript);

  return usages.map((usage: any, index: number) => {
    const parsedRef = usage.reference ? parseReference(usage.reference) : null;
    const fetched: FetchedPassage = parsedRef
      ? fetchedByKey.get(toPassageId(parsedRef, 0)) ?? null
      : null;
    return {
      id: `c${index + 1}`,
      transcriptQuote: String(usage.transcriptQuote).trim(),
      usageType: usage.usageType as string,
      claimSummary: String(usage.claimSummary || '').trim(),
      reference: usage.reference?.trim() || null,
      passageReference: fetched?.reference || null,
      passageText: fetched?.content || null,
      translation: fetched?.translation || null,
      illustrations: [],
      // true / false / null (too short to judge) — false renders a warning badge.
      quoteVerified: checkQuote(usage.transcriptQuote),
      quoteMatch: usage.usageType === 'verbatim' && fetched
        ? quoteMatchScore(usage.transcriptQuote, fetched.content)
        : null,
    };
  });
}

export function buildScriptureReport(
  talk: any,
  extractParsed: any,
  judgeParsed: any,
  cards: Array<any>,
  truncated: boolean,
  transcript: string,
  model: string,
  extractModel = model,
) {
  const judgments = new Map<string, any>(
    (Array.isArray(judgeParsed?.cards) ? judgeParsed.cards : []).map((card: any) => [card.id, card]),
  );
  const finalCards = cards.map((card) => {
    const judgment = judgments.get(card.id);
    const assessment = card.passageText
      ? (ASSESSMENTS.has(judgment?.assessment) ? judgment.assessment : 'unverified')
      : 'unverified';
    return {
      ...card,
      illustrations: [],
      assessment,
      explanation: String(judgment?.explanation || 'No assessment was produced for this usage.').trim(),
      confidence: CONFIDENCE.has(judgment?.confidence) ? judgment.confidence : 'low',
    };
  });

  // Maturity evidence must be real speaker words — drop quotes that cannot be
  // located in the transcript (keep ones too short to judge).
  const checkQuote = makeQuoteChecker(transcript);
  const dimensionResults = MATURITY_DIMENSIONS.map((dimension) => {
    const scored = (judgeParsed?.maturity?.dimensions || [])
      .find((d: any) => d.key === dimension.key);
    const score = Math.min(5, Math.max(1, Math.round(Number(scored?.score) || 3)));
    return {
      key: dimension.key,
      label: dimension.label,
      score,
      note: String(scored?.note || '').trim(),
      evidence: (Array.isArray(scored?.evidence) ? scored.evidence : [])
        .map((quote: any) => String(quote).trim())
        .filter(Boolean)
        .filter((quote: string) => checkQuote(quote) !== false)
        .slice(0, 3),
    };
  });
  const overall = Math.round(
    (dimensionResults.reduce((sum, d) => sum + d.score, 0) / dimensionResults.length) * 100,
  ) / 100;

  const flagged = finalCards.filter((card) =>
    ['context-caution', 'unsupported', 'misquote'].includes(card.assessment)).length;
  const countBy = (type: string) => finalCards.filter((card) => card.usageType === type).length;

  return {
    promptVersion: PROMPT_VERSION,
    model,
    extractModel,
    summary: {
      thesis: String(extractParsed?.thesis || '').trim(),
      mainReference: String(extractParsed?.mainReference || talk.scripture_ref || '').trim(),
      stats: {
        total: finalCards.length,
        verbatim: countBy('verbatim'),
        paraphrase: countBy('paraphrase'),
        allusion: countBy('allusion'),
        uncited: countBy('uncited-claim'),
        illustrations: 0,
        flagged,
      },
      truncated,
    },
    maturity: {
      overall,
      overallNote: String(judgeParsed?.maturity?.overallNote || '').trim(),
      dimensions: dimensionResults,
    },
    cards: finalCards,
    disclaimer:
      'AI-assisted review to support your own examination, not replace it. Every assessment is anchored to the fetched scripture text shown on the card — read it and judge for yourself. "They received the word with all eagerness, examining the Scriptures daily to see if these things were so." (Acts 17:11)',
  };
}

export function mergeIllustrationsIntoReport(
  existingReport: any,
  parsed: any,
  illustrationModel: string,
  transcript: string,
) {
  const existingCards = Array.isArray(existingReport?.cards) ? existingReport.cards : [];
  const checkQuote = makeQuoteChecker(transcript);
  const byCard = new Map<string, any[]>(
    (Array.isArray(parsed?.cardIllustrations) ? parsed.cardIllustrations : [])
      .map((item: any) => [
        String(item?.cardId || ''),
        Array.isArray(item?.illustrations) ? item.illustrations : [],
      ] as [string, any[]]),
  );
  const mergedCards = existingCards.map((card: any) => {
    const rawIllustrations = byCard.get(card.id) || [];
    const cardIllustrations = rawIllustrations
      .map((illustration: any, index: number) => ({
        id: `${card.id}-i${index + 1}`,
        excerpt: String(illustration?.excerpt || '').trim(),
        kind: ILLUSTRATION_KINDS.includes(illustration?.kind) ? illustration.kind : 'illustration',
        claimSupported: String(illustration?.claimSupported || '').trim(),
        alignment: ILLUSTRATION_ALIGNMENTS.has(illustration?.alignment) ? illustration.alignment : 'unverified',
        explanation: String(illustration?.explanation || '').trim(),
        confidence: CONFIDENCE.has(illustration?.confidence) ? illustration.confidence : 'low',
      }))
      .filter((illustration) => illustration.excerpt.length >= 20)
      // An excerpt that cannot be found in the transcript is fabricated — drop it.
      .filter((illustration) => checkQuote(illustration.excerpt) !== false)
      .slice(0, 3);
    return { ...card, illustrations: cardIllustrations };
  });
  const illustrationCount = mergedCards.reduce((sum: number, card: any) => sum + (card.illustrations?.length || 0), 0);
  return {
    ...existingReport,
    promptVersion: PROMPT_VERSION,
    model: existingReport.model || illustrationModel,
    illustrationModel,
    summary: {
      ...(existingReport.summary || {}),
      stats: {
        ...(existingReport.summary?.stats || {}),
        illustrations: illustrationCount,
      },
    },
    cards: mergedCards,
  };
}
