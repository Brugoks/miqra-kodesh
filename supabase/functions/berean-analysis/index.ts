// Berean review (Acts 17:11) — analyze a sermon/message transcript for how it
// uses Scripture, and profile it on the milk → solid food spectrum (Heb 5:12-14).
//
// Pipeline (mode "scripture"):
//   1. AI pass 1: extract every scripture usage from the transcript —
//      explicit references, paraphrases/allusions, and uncited "the Bible says"
//      claims (with the model's best-guess source reference).
//   2. Fetch the REAL text of each referenced passage (with a small context
//      window) through the bible-proxy function, so nothing is judged against
//      the model's memory of Scripture. AI-quoted excerpts are also verified
//      mechanically against the transcript.
//   3. AI pass 2: judge each usage against the fetched text and score the
//      four-dimension maturity rubric with transcript quotes as evidence.
// Mode "illustrations" attaches speaker examples/stories to existing cards.
// Manual modes let an admin run the same prompts in an external AI tool and
// paste the JSON back — grounding still happens server-side.
//
// The AI annotates; the leader decides. Modules:
//   constants.ts  shared enums/limits/prompt version
//   reference.ts  scripture reference parsing (pure, unit-tested)
//   textmatch.ts  quote scoring + transcript verification (pure, unit-tested)
//   bible.ts      passage fetching via bible-proxy (parallel, bounded)
//   providers.ts  Gemini/OpenRouter/Groq with retry + fallback chain
//   prompts.ts    prompt builders + JSON schemas
//   report.ts     normalization and report assembly

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { recordUsageEvent } from '../_shared/usage.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { PROMPT_VERSION, MAX_TRANSCRIPT_CHARS, MAX_CARDS, ANALYSIS_MODES } from './constants.ts';
import { AiProviderError, callAi, aiModelLabel, usageUnits } from './providers.ts';
import { EXTRACT_SCHEMA, JUDGE_SCHEMA, ILLUSTRATION_SCHEMA, buildExtractPrompt, buildJudgePrompt, buildIllustrationPrompt } from './prompts.ts';
import {
  parseManualJson, normalizeExtractUsages, buildCardsFromExtraction,
  buildScriptureReport, mergeIllustrationsIntoReport,
} from './report.ts';

// "manual:GPT-5" etc. — keep the admin-supplied label short and single-line.
function manualModelLabel(raw: unknown) {
  const label = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return `manual:${label || 'external-subscription'}`;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // ── Auth: an authenticated leader of the talk's organization ──
    const authHeader = request.headers.get('Authorization') || '';
    const authed = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await authed.auth.getUser();
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const { data: profile } = await admin
      .from('profiles')
      .select('role, active_organization_id, full_name')
      .eq('id', user.id)
      .maybeSingle();
    const isLeader = ['leader', 'admin', 'developer'].includes(profile?.role || '');
    if (!isLeader) return jsonResponse({ error: 'Berean review is available to leaders only' }, 403);

    const body = (await request.json()) as {
      talkId?: string;
      mode?: string;
      extractionResult?: unknown;
      judgmentResult?: unknown;
      illustrationResult?: unknown;
      manualModel?: unknown;
    };
    const { talkId, mode: requestedMode } = body;
    const mode = ANALYSIS_MODES.has(requestedMode || '') ? requestedMode! : 'scripture';
    const isManualMode = mode.startsWith('manual-');
    const isAdmin = ['admin', 'developer'].includes(profile?.role || '');
    if (!talkId) return jsonResponse({ error: 'talkId is required' }, 400);
    if (isManualMode && !isAdmin) {
      return jsonResponse({ error: 'Manual Berean import is available to admins only' }, 403);
    }

    const { data: talk } = await admin
      .from('sermon_talks')
      .select('id, organization_id, title, speaker_name, scripture_ref, transcript')
      .eq('id', talkId)
      .maybeSingle();
    if (!talk) return jsonResponse({ error: 'Talk not found' }, 404);
    if (talk.organization_id !== profile?.active_organization_id && profile?.role !== 'developer') {
      return jsonResponse({ error: 'Talk belongs to a different organization' }, 403);
    }
    if (!talk.transcript || talk.transcript.trim().length < 200) {
      return jsonResponse({ error: 'This talk needs a transcript (at least a few paragraphs) before it can be reviewed.' }, 400);
    }

    const transcript = talk.transcript.slice(0, MAX_TRANSCRIPT_CHARS);
    const truncated = talk.transcript.length > MAX_TRANSCRIPT_CHARS;

    // Card ids are positional (c1…cN per extraction), so a new Scripture report
    // invalidates every stored leader verdict — without this, old verdicts
    // silently reattach to whichever new card now holds the same id.
    async function saveScriptureAnalysis(report: any, model: string) {
      const { data: saved, error: saveError } = await admin
        .from('sermon_talk_berean')
        .upsert({
          talk_id: talk.id,
          organization_id: talk.organization_id,
          report,
          model,
          prompt_version: PROMPT_VERSION,
          created_by: user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'talk_id' })
        .select()
        .single();
      if (saveError || !saved) return { saved: null, saveError };
      await admin.from('sermon_talk_berean_verdicts').delete().eq('analysis_id', saved.id);
      return { saved, saveError: null };
    }

    async function saveIllustrationsAnalysis(report: any, model: string) {
      // Illustrations attach to existing cards, so leader verdicts stay valid.
      return await admin
        .from('sermon_talk_berean')
        .upsert({
          talk_id: talk.id,
          organization_id: talk.organization_id,
          report,
          model,
          prompt_version: PROMPT_VERSION,
          created_by: user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'talk_id' })
        .select()
        .single();
    }

    if (mode === 'manual-extract-kit') {
      return jsonResponse({
        kit: {
          mode,
          promptVersion: PROMPT_VERSION,
          prompt: buildExtractPrompt(transcript, talk.title, talk.scripture_ref || ''),
          schema: EXTRACT_SCHEMA,
          expectedOutput: 'Paste only the model response JSON into Step 2. Markdown fences are OK; the app will strip them.',
          nextStep: 'After pasting extraction JSON, click Build Scripture judgment prompt so the app can fetch real Bible text and prepare the grounded judgment prompt.',
        },
      });
    }

    if (mode === 'manual-judge-kit') {
      const extractionResult = parseManualJson(body.extractionResult, 'Extraction result');
      const cards = await buildCardsFromExtraction(extractionResult, transcript);
      if (!cards.length) {
        return jsonResponse({ error: 'No valid scripture usages were found in the pasted extraction JSON.' }, 422);
      }
      return jsonResponse({
        kit: {
          mode,
          promptVersion: PROMPT_VERSION,
          prompt: buildJudgePrompt(transcript, cards),
          schema: JUDGE_SCHEMA,
          draft: {
            thesis: String((extractionResult as any)?.thesis || '').trim(),
            mainReference: String((extractionResult as any)?.mainReference || talk.scripture_ref || '').trim(),
            cards,
            truncated,
          },
          expectedOutput: 'Paste only the model response JSON into Step 4, then save the Scripture report.',
          nextStep: 'Saving will merge your extraction with fetched Scripture text and the pasted judgments into the normal Berean report display.',
        },
      });
    }

    if (mode === 'manual-save-scripture') {
      const extractionResult = parseManualJson(body.extractionResult, 'Extraction result');
      const judgmentResult = parseManualJson(body.judgmentResult, 'Scripture judgment result');
      const cards = await buildCardsFromExtraction(extractionResult, transcript);
      if (!cards.length) {
        return jsonResponse({ error: 'No valid scripture usages were found in the pasted extraction JSON.' }, 422);
      }
      const manualModel = manualModelLabel(body.manualModel);
      const report = buildScriptureReport(
        talk,
        extractionResult,
        judgmentResult,
        cards,
        truncated,
        transcript,
        manualModel,
      );
      const { saved, saveError } = await saveScriptureAnalysis(report, manualModel);
      if (saveError || !saved) {
        return jsonResponse({ error: `Manual Scripture review could not be saved: ${saveError?.message}` }, 500);
      }
      await recordUsageEvent({
        provider: 'manual',
        feature: 'berean-manual-scripture',
        status: 200,
        units: cards.length,
        organizationId: talk.organization_id,
        userId: user.id,
        metadata: { talkId, promptVersion: PROMPT_VERSION, cards: cards.length, model: manualModel },
      });
      return jsonResponse({ analysis: saved, mode });
    }

    if (mode === 'illustrations' || mode === 'manual-illustrations-kit' || mode === 'manual-save-illustrations') {
      const { data: existingAnalysis } = await admin
        .from('sermon_talk_berean')
        .select('*')
        .eq('talk_id', talk.id)
        .maybeSingle();
      const existingReport = existingAnalysis?.report;
      const existingCards = Array.isArray(existingReport?.cards) ? existingReport.cards : [];
      if (!existingAnalysis || !existingCards.length) {
        return jsonResponse({ error: 'Run or import the Scripture review first, then run Examples & stories.' }, 409);
      }
      const illustrationBaseCards = existingCards
        .filter((card: any) => typeof card?.id === 'string' && typeof card?.transcriptQuote === 'string')
        .map((card: any) => ({
          id: card.id,
          transcriptQuote: String(card.transcriptQuote || ''),
          claimSummary: String(card.claimSummary || ''),
          passageReference: card.passageReference || null,
          passageText: card.passageText || null,
        }))
        .slice(0, MAX_CARDS);

      if (mode === 'manual-illustrations-kit') {
        return jsonResponse({
          kit: {
            mode,
            promptVersion: PROMPT_VERSION,
            prompt: buildIllustrationPrompt(transcript, illustrationBaseCards),
            schema: ILLUSTRATION_SCHEMA,
            expectedOutput: 'Paste only the model response JSON into the Examples & stories field. Markdown fences are OK; the app will strip them.',
            nextStep: 'Saving will merge these examples into the existing Scripture cards without rerunning the Scripture review.',
          },
        });
      }

      if (mode === 'manual-save-illustrations') {
        const illustrationResult = parseManualJson(body.illustrationResult, 'Examples & stories result');
        const manualModel = manualModelLabel(body.manualModel);
        const report = mergeIllustrationsIntoReport(existingReport, illustrationResult, manualModel, transcript);
        const { data: saved, error: saveError } = await saveIllustrationsAnalysis(report, manualModel);
        if (saveError) return jsonResponse({ error: `Manual examples review could not be saved: ${saveError.message}` }, 500);
        await recordUsageEvent({
          provider: 'manual',
          feature: 'berean-manual-illustrations',
          status: 200,
          units: Number(report?.summary?.stats?.illustrations) || 1,
          organizationId: talk.organization_id,
          userId: user.id,
          metadata: { talkId, promptVersion: PROMPT_VERSION, model: manualModel },
        });
        return jsonResponse({ analysis: saved, mode });
      }

      // mode === 'illustrations'
      const illustrations = await callAi(
        buildIllustrationPrompt(transcript, illustrationBaseCards),
        ILLUSTRATION_SCHEMA,
        8192,
        'berean_illustrations',
      );
      await recordUsageEvent({
        provider: illustrations.provider,
        feature: 'berean-illustrations',
        status: 200,
        units: usageUnits(illustrations.usage),
        organizationId: talk.organization_id,
        userId: user.id,
        metadata: {
          talkId,
          model: aiModelLabel(illustrations),
          promptVersion: PROMPT_VERSION,
          cards: illustrationBaseCards.length,
        },
      });

      const report = mergeIllustrationsIntoReport(existingReport, illustrations.parsed, aiModelLabel(illustrations), transcript);
      const { data: saved, error: saveError } = await saveIllustrationsAnalysis(report, aiModelLabel(illustrations));
      if (saveError) return jsonResponse({ error: `Examples & stories completed but could not be saved: ${saveError.message}` }, 500);

      return jsonResponse({ analysis: saved, mode });
    }

    // ── mode === 'scripture': Pass 1 — extract scripture usages ──
    const extract = await callAi(
      buildExtractPrompt(transcript, talk.title, talk.scripture_ref || ''),
      EXTRACT_SCHEMA,
      8192,
      'berean_extract',
    );
    await recordUsageEvent({
      provider: extract.provider,
      feature: 'berean-extract',
      status: 200,
      units: usageUnits(extract.usage),
      organizationId: talk.organization_id,
      userId: user.id,
      metadata: { talkId, model: aiModelLabel(extract), promptVersion: PROMPT_VERSION },
    });

    if (!normalizeExtractUsages(extract.parsed).length) {
      return jsonResponse({ error: 'No scripture usage could be identified in this transcript.' }, 422);
    }

    // ── Fetch real passage text for every parseable reference (parallel) ──
    const cards = await buildCardsFromExtraction(extract.parsed, transcript);

    // ── Pass 2: grounded judgment + maturity rubric ──
    const judge = await callAi(buildJudgePrompt(transcript, cards), JUDGE_SCHEMA, 8192, 'berean_judge');
    await recordUsageEvent({
      provider: judge.provider,
      feature: 'berean-judge',
      status: 200,
      units: usageUnits(judge.usage),
      organizationId: talk.organization_id,
      userId: user.id,
      metadata: { talkId, model: aiModelLabel(judge), promptVersion: PROMPT_VERSION, cards: cards.length },
    });

    const report = buildScriptureReport(
      talk,
      extract.parsed,
      judge.parsed,
      cards,
      truncated,
      transcript,
      aiModelLabel(judge),
      aiModelLabel(extract),
    );

    const { saved, saveError } = await saveScriptureAnalysis(report, aiModelLabel(judge));
    if (saveError || !saved) {
      return jsonResponse({ error: `Analysis completed but could not be saved: ${saveError?.message}` }, 500);
    }

    return jsonResponse({ analysis: saved, mode });
  } catch (err) {
    if (err instanceof AiProviderError) {
      return jsonResponse({ error: err.message }, err.status || (err.transient || err.configuration ? 503 : 500));
    }
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
