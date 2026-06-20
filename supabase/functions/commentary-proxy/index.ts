import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { recordUsageEvent } from '../_shared/usage.ts';

const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

type CommentaryRequest = {
  verseRef: string;
  passageText: string;
  focusVerse?: string;
  translation: string;
  userId?: string | null;
  organizationId?: string | null;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const { verseRef, passageText, focusVerse, translation, userId, organizationId } =
      (await request.json()) as CommentaryRequest;

    if (!verseRef || !passageText) {
      return jsonResponse({ error: 'verseRef and passageText are required' }, 400);
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) return jsonResponse({ error: 'GEMINI_API_KEY not configured' }, 503);

    const cleanText = passageText.replace(/\[[\d:]+\]/g, '').replace(/\s+/g, ' ').trim();
    const focusNote = focusVerse && focusVerse !== verseRef
      ? `\nThe reader's focus verse is ${focusVerse}. The surrounding verses above are provided as context.`
      : '';

    const prompt = `You are a biblical scholar helping a Christian understand scripture in its context.

Passage: ${verseRef} (${translation})
"${cleanText}"${focusNote}

Please provide three short sections:

1. **Plain-language rephrase** — restate the passage in simple, natural English that a modern reader would immediately understand.

2. **Context & meaning** — briefly explain key themes, any relevant cultural or historical background, and what the original audience would have understood. Stay grounded in the quoted passage; do not invent specific historical facts, quotations, or original-language claims that the text does not support.

3. **Application** — one practical way a Christian today might apply this passage to their life. Keep it invitational; do not claim divine authority or predict personal outcomes.

Keep your tone warm and devotional. Use the section headings above. Be concise — aim for 3–5 sentences per section.`;

    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.65, maxOutputTokens: 1024 },
      }),
    });

    const responseText = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(responseText);
    } catch {
      // Malformed provider response is handled as a failure below.
    }

    const promptTokens = Number(data?.usageMetadata?.promptTokenCount);
    await recordUsageEvent({
      provider: 'gemini',
      feature: 'verse-commentary',
      status: res.status,
      units: Number.isFinite(promptTokens) && promptTokens > 0 ? promptTokens : 1,
      organizationId: organizationId ?? null,
      userId: userId ?? null,
      metadata: {
        verseRef,
        focusVerse: focusVerse ?? null,
        translation,
        model: GEMINI_MODEL,
        inputTokens: Number.isFinite(promptTokens) ? promptTokens : null,
        outputTokens: data?.usageMetadata?.candidatesTokenCount ?? null,
        totalTokens: data?.usageMetadata?.totalTokenCount ?? null,
      },
    });

    if (!res.ok) {
      const retryDelay = data?.error?.details?.find(
        (item: { retryDelay?: string }) => item?.retryDelay,
      )?.retryDelay;
      const retryAfterSeconds = retryDelay ? Number.parseInt(retryDelay, 10) : null;
      const friendly = res.status === 429
        ? 'The AI is receiving requests too quickly right now. Please wait a few seconds before trying again.'
        : [500, 502, 503, 504].includes(res.status)
          ? 'The AI service is briefly unavailable. Please try again in a moment.'
          : `Gemini responded with ${res.status}`;
      return jsonResponse(
        { error: friendly, retryAfterSeconds, detail: data?.error?.message ?? responseText },
        res.status,
      );
    }

    const commentary = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!commentary) return jsonResponse({ error: 'No content returned from Gemini' }, 500);

    return jsonResponse({ commentary });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
