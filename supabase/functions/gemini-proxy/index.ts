import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { recordUsageEvent } from '../_shared/usage.ts';

const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent`;

type GeminiRequest = {
  reference: string;
  passageText: string;
  userId?: string | null;
  organizationId?: string | null;
  task?: string | null;
};

type InsightsResponse = {
  historicalContext: string;
  keyThemes: string[];
  commentary: string;
  crossReferences: { reference: string; connection: string }[];
};

function buildPrompt(reference: string, passageText: string): string {
  return `You are a biblical scholar providing enriching context for scripture study. For the passage ${reference}, provide a JSON response with the following structure:

{
  "historicalContext": "2-3 sentences on the historical setting, cultural background, and author's context",
  "keyThemes": ["Theme 1", "Theme 2", "Theme 3"],
  "commentary": "2-3 sentences on the meaning, significance, and application of this passage",
  "crossReferences": [
    { "reference": "Book Chapter:Verse", "connection": "Brief explanation of how this passage relates" }
  ]
}

Passage text (NASB):
${passageText.slice(0, 3000)}

Return ONLY the JSON object, no markdown fences or extra text.`;
}

function buildQuestionsPrompt(reference: string, passageText: string): string {
  return `You are a biblical scholar providing enriching context for scripture study. For the passage ${reference}, provide a JSON response with the following structure containing 5 to 7 discussion questions in total, mixing the three types (observation = what does it say, interpretation = what does it mean, application = how do I live it):

{
  "questions": [
    { "question": "Question text here", "type": "observation" },
    { "question": "Question text here", "type": "interpretation" },
    { "question": "Question text here", "type": "application" }
  ]
}

Passage text (NASB):
${passageText.slice(0, 3000)}

Return ONLY the JSON object, no markdown fences or extra text.`;
}

function parseGeminiJson(rawText: string): unknown {
  const withoutFences = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  try {
    return JSON.parse(withoutFences);
  } catch {
    const objectStart = withoutFences.indexOf('{');
    const objectEnd = withoutFences.lastIndexOf('}');
    if (objectStart >= 0 && objectEnd > objectStart) {
      return JSON.parse(withoutFences.slice(objectStart, objectEnd + 1));
    }
    throw new Error('Gemini did not return a JSON object');
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const { reference, passageText, userId, organizationId, task } =
      (await request.json()) as GeminiRequest;

    if (!reference || !passageText) {
      return jsonResponse({ error: 'reference and passageText are required' }, 400);
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return jsonResponse({ error: 'GEMINI_API_KEY not configured' }, 503);
    }

    const prompt = task === 'questions'
      ? buildQuestionsPrompt(reference, passageText)
      : buildPrompt(reference, passageText);

    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1024,
        },
      }),
    });

    const featureName = task === 'questions' ? 'discussion-questions' : 'scripture-insights';
    const inputChars = reference.length + passageText.length;
    await recordUsageEvent({
      provider: 'gemini',
      feature: featureName,
      status: res.status,
      units: Math.ceil(inputChars / 4),
      organizationId: organizationId ?? null,
      userId: userId ?? null,
      metadata: { reference, model: GEMINI_MODEL },
    });

    if (!res.ok) {
      const detail = await res.text();
      let upstreamMessage = '';
      let retryAfterSeconds: number | null = null;

      try {
        const parsed = JSON.parse(detail);
        upstreamMessage = parsed?.error?.message ?? '';
        const retryDelay = parsed?.error?.details?.find(
          (item: { retryDelay?: string }) => item?.retryDelay,
        )?.retryDelay;
        retryAfterSeconds = retryDelay ? Number.parseInt(retryDelay, 10) : null;
      } catch {
        // Keep the response safe and concise if Gemini returns a non-JSON error.
      }

      const error = res.status === 429
        ? 'Gemini is temporarily rate limited. Please try again shortly.'
        : `Gemini request failed with status ${res.status}.`;

      return jsonResponse({
        error,
        retryAfterSeconds,
        detail: upstreamMessage || undefined,
      }, res.status);
    }

    const geminiData = await res.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    let parsedData: any;
    try {
      parsedData = parseGeminiJson(rawText);
    } catch {
      return jsonResponse({ error: 'Failed to parse Gemini response', raw: rawText }, 502);
    }

    if (task === 'questions') {
      return jsonResponse({ questions: parsedData.questions });
    } else {
      return jsonResponse({ insights: parsedData });
    }
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
