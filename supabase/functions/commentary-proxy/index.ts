import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

type CommentaryRequest = {
  verseRef: string;
  passageText: string;
  focusVerse?: string;
  translation: string;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const { verseRef, passageText, focusVerse, translation } = (await request.json()) as CommentaryRequest;

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

2. **Context & meaning** — briefly explain key themes, any relevant cultural or historical background, and what the original audience would have understood.

3. **Application** — one practical way a Christian today might apply this passage to their life.

Keep your tone warm and devotional. Use the section headings above. Be concise — aim for 3–5 sentences per section.`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.65, maxOutputTokens: 1024 },
        }),
      }
    );

    if (!res.ok) {
      const detail = await res.text();
      return jsonResponse({ error: `Gemini responded with ${res.status}`, detail }, res.status);
    }

    const data = await res.json();
    const commentary = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!commentary) return jsonResponse({ error: 'No content returned from Gemini' }, 500);

    return jsonResponse({ commentary });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
