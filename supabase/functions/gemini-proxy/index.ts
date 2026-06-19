import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { recordUsageEvent } from '../_shared/usage.ts';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash-lite:generateContent';

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
      metadata: { reference, model: 'gemini-2.0-flash-lite' },
    });

    if (!res.ok) {
      const detail = await res.text();
      return jsonResponse({ error: `Gemini responded with ${res.status}`, detail }, res.status);
    }

    const geminiData = await res.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    let parsedData: any;
    try {
      parsedData = JSON.parse(rawText);
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
