---
name: sermon-berean-review
description: Process a sermon or message transcript using the enhanced Berean Review algorithm (berean-v4), auto-detect Bible translation, generate concise community discussion questions, post to #sermons-messages chat, and insert full payload into database.
---

# Agent Instruction: Running Sermon Ingestion & Berean Review (berean-v4)

When a user triggers this skill by providing a raw transcript (and optionally a `talkId` or sermon metadata like title, speaker, and date), you must execute the entire pipeline end-to-end, update the database, and post short discussion prompts to the `#sermons-messages` community chat channel.

---

## Agent Execution Steps

1. **Locate Credentials**: Load `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, and `ESV_API_KEY` from the project's `.env` file.
2. **Organization Resolution**: If the invocation names an organization or campus (e.g. "Adventure Church Natomas"), look it up against `public.organizations.name` (case-insensitive, allow partial/fuzzy match — church names in the wild rarely match the DB row exactly). If exactly one row matches, use its `id`. If zero or more than one match, **stop and ask the user** which organization to use — do not fall back to the caller's `active_organization_id` silently. (A prior run defaulted to the wrong org this way and required a manual DB fix.)
3. **Talk Entry Resolution / Creation**:
   - If a `talkId` is provided, fetch the existing sermon talk row from `public.sermon_talks`.
   - If **NO `talkId` is provided**, first check for an existing talk with the same `title` + `speaker_name` + `talk_date` (or `video_url`) in the resolved organization — reprocessing an already-ingested sermon should update that row, not create a duplicate. Only if none exists, create a new talk entry using the provided title, speaker, and date (or defaults), and retain the newly generated `talkId`.
4. **Calendar Event Resolution / Creation**: If the talk row already has an `event_id`, skip this step.
   - Search `public.calendar_events` for the resolved organization on the sermon's `talk_date`. If exactly one match exists, link it (`sermon_talks.event_id = calendar_events.id`).
   - If zero matches, **create** a new `calendar_events` row — `title` (e.g. "Sunday Morning Service", or the service name if given), `date` = `talk_date`, `category` = `'service'`, `organization_id` = resolved org — then link its `id` as `sermon_talks.event_id`. Sermons should not go unlinked by default; only skip creation if the user explicitly says not to.
   - If multiple matches exist, stop and ask the user which one to link.
5. **Execute Pass 0 (Boundary Trimming)**: Trim off pre-sermon conversational greetings or administrative banter, and post-sermon announcements/dismissals. Preserve timestamp markers if present.
6. **Execute Metadata & Community Discussion Question Generation**:
   - Generate a 1-2 paragraph plain-text summary.
   - Generate an array of 3-5 key takeaways strings.
   - **Generate 3 Short, Concise Community Discussion Questions**: Create 3 brief, punchy questions (1 sentence each) specifically tailored to drive quick engagement and conversation in the church chat channel.
7. **Update Sermon Row**: Write `summary`, `key_takeaways`, `discussion_questions` (jsonb array of the 3 question strings), and trimmed `transcript` back to `public.sermon_talks`.
8. **Execute Berean Pass 1 (Scripture & Bible Translation Detection)**:
   - Identify every scripture reference, quote, or allusion in transcript order.
   - **Detect Bible Translation**: Identify the primary Bible translation used by the speaker (e.g., ESV, NIV, KJV, NASB, NLT, CSB, NKJV) based on key phrase choices across all quoted passages.
9. **Execute Pass 2 & 3 (Mechanical Grounding, Judgment & Illustrations)**:
   - Fetch target scripture context verses.
   - Verify quotes and evaluate alignment using the detected translation to prevent false mismatch penalties.
   - Compute maturity scores across 4 dimensions and extract speaker illustrations.
10. **Assemble & Upsert Berean Report**: Package the report JSON (including `detectedTranslation`) and upsert it into `public.sermon_talk_berean`. Clean up obsolete verdicts in `public.sermon_talk_berean_verdicts`.
11. **Post to `#sermons-messages` Chat Channel**:
    - Retrieve the `id` of the `#sermons-messages` channel in `public.chat_channels` for the talk's `organization_id`. (Create the channel if missing).
    - Post a structured message to `public.chat_messages`:
      ```text
      🎙️ **New Sermon Discussion: [Title]**
      *Speaker:* [Speaker] | *Scripture:* [Main Reference]

      [Brief 2-sentence summary]

      💬 **Community Questions:**
      1. [Concise Question 1]
      2. [Concise Question 2]
      3. [Concise Question 3]

      Jump in and share your thoughts below! 👇
      ```
12. **Confirmation**: Report back to the user with a summary of processed cards, detected Bible translation, maturity score, generated discussion questions, whether a calendar event was linked or created, link to the `#sermons-messages` chat post, and database write confirmation.

---

# Detailed Pipeline Algorithm

## 1. Input Processing & Boundary Trimming (Pre-Pass 0)

Analyze the raw transcript to strip off non-sermon conversational preamble and postamble:

- **Pre-Sermon Banter**: Cut out setup banter, soundchecks, housekeeping updates, and casual greetings prior to the message opening (hook, scripture reading, or sermon intro).
- **Post-Sermon Banter**: Cut out post-prayer casual announcements, offering instructions, or dismissal notices.
- **Timestamp Preservation**: If the raw transcript includes timestamp markers (e.g. `[02:15]`), preserve them at paragraph boundaries for audio/video synchronization.

---

## 2. Metadata & Community Discussion Question Generation

Using the trimmed transcript, generate:
- **Summary**: Concise 1-2 paragraph description capturing the central theme, theological focus, and overall message flow.
- **Key Takeaways**: Array of 3-5 actionable principles formatted as clear, brief sentences.
- **Concise Discussion Questions**: Exactly 3 single-sentence, engaging questions tailored for chat response (e.g., *"What was one takeaway from Sunday's message that challenged you?"* or *"How can we apply [Verse] in our work this week?"*).

### Database Write (Metadata):
Update `public.sermon_talks`:
```sql
UPDATE public.sermon_talks
SET 
  summary = $1,                  -- generated summary text
  key_takeaways = $2,            -- JSON array of strings
  discussion_questions = $3,     -- JSON array of the 3 question strings
  transcript = $4,               -- trimmed and cleaned transcript text
  updated_at = NOW()
WHERE id = $5;                   -- talk_id
```

---

## 3. Berean Pass 1: Scripture Extraction & Translation Detection

Identify every scripture reference, quote, or allusion in transcript order, and detect the Bible translation used.

### Extraction Schema (EXTRACT_SCHEMA)
```json
{
  "type": "object",
  "properties": {
    "thesis": { "type": "string" },
    "mainReference": { "type": "string" },
    "detectedTranslation": { 
      "type": "string", 
      "enum": ["ESV", "NIV", "KJV", "NASB", "NLT", "CSB", "NKJV", "Paraphrase/Unknown"] 
    },
    "translationConfidence": { "type": "string", "enum": ["high", "medium", "low"] },
    "translationEvidence": { "type": "string" },
    "usages": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "transcriptQuote": { "type": "string" },
          "usageType": { "type": "string", "enum": ["verbatim", "paraphrase", "allusion", "uncited-claim"] },
          "reference": { "type": "string" },
          "claimSummary": { "type": "string" }
        },
        "required": ["transcriptQuote", "usageType", "reference", "claimSummary"]
      }
    }
  },
  "required": ["thesis", "mainReference", "detectedTranslation", "translationConfidence", "usages"]
}
```

---

## 4. Scripture Retrieval & Grounding (No AI)

For each unique reference:
1. Parse the citation using `parseReference`.
2. Fetch corresponding verse text with `CONTEXT_VERSES = 2` surrounding verses — via the `bible-proxy` edge function (ESV first, falling back to the free public-domain WEB translation; see `supabase/functions/berean-analysis/bible.ts`).
3. Verify exact quotes using Longest Common Subsequence (LCS) overlap ($\ge 85\%$ threshold for verbatim quotes) — see `textmatch.ts`.
4. Calculate alignment similarity (`quoteMatchScore`), also LCS-based (`textmatch.ts`).

**Known limitation — read before trusting `quoteMatch` scores**: `quoteMatchScore` does **not** take `detectedTranslation` into account, and passage grounding always fetches ESV or WEB — never NIV or another translation, regardless of what was detected (there is no free/licensed API for NIV text wired into this pipeline). A perfectly verbatim NIV quote can score **0% match** against WEB grounding text if the wording differs enough (e.g. NIV Hebrews 13:1 "Keep on loving one another as brothers and sisters" vs. WEB "Let brotherly love continue" — zero shared words). **Do not let a low `quoteMatch` score on a `verbatim` card imply misquotation by itself** — cross-check the quote against the *actual* detected translation's known wording yourself before flagging it, and note in the card's `explanation` when a low score is a translation artifact rather than a real mismatch. `detectedTranslation` is informational for the reviewer only; it does not currently change what gets fetched or scored.

---

## 5. Berean Pass 2: Scripture Judgment & Maturity Scoring

Provide the trimmed transcript, grounded cards, and `detectedTranslation` to the LLM judge.

### Judgment Schema (JUDGE_SCHEMA)
```json
{
  "type": "object",
  "properties": {
    "cards": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "assessment": { 
            "type": "string", 
            "enum": ["aligned", "context-caution", "misquote", "unsupported", "disputed-secondary", "unverified"] 
          },
          "explanation": { "type": "string" },
          "confidence": { "type": "string", "enum": ["high", "medium", "low"] }
        },
        "required": ["id", "assessment", "explanation", "confidence"]
      }
    },
    "maturity": {
      "type": "object",
      "properties": {
        "dimensions": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "key": { 
                "type": "string", 
                "enum": ["doctrinalContent", "scriptureHandling", "assumedLiteracy", "applicationDepth"] 
              },
              "score": { "type": "integer" },
              "note": { "type": "string" },
              "evidence": { "type": "array", "items": { "type": "string" } }
            },
            "required": ["key", "score", "note", "evidence"]
          }
        },
        "overallNote": { "type": "string" }
      },
      "required": ["dimensions", "overallNote"]
    }
  },
  "required": ["cards", "maturity"]
}
```

---

## 6. Berean Pass 3: Illustrations & Examples

Extract speaker illustrations, personal experiences, analogies, or stories that explain or apply scripture claims. Cap at **3 illustrations per card** (`mergeIllustrationsIntoReport` in `report.ts` truncates to 3, dropping any excerpt shorter than 20 characters or one that can't be located in the transcript) — pick the 3 strongest if a card has more candidates.

### Illustration Schema (ILLUSTRATION_SCHEMA)
```json
{
  "type": "object",
  "properties": {
    "cardIllustrations": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "cardId": { "type": "string" },
          "illustrations": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "excerpt": { "type": "string" },
                "kind": { 
                  "type": "string", 
                  "enum": ["story", "personal-experience", "analogy", "cultural-example", "illustration"] 
                },
                "claimSupported": { "type": "string" },
                "alignment": { 
                  "type": "string", 
                  "enum": ["clarifies-text", "applies-text", "overextends-text", "distracts-from-text", "reframes-text", "unsupported-spiritual-claim", "unverified"] 
                },
                "explanation": { "type": "string" },
                "confidence": { "type": "string", "enum": ["high", "medium", "low"] }
              },
              "required": ["excerpt", "kind", "claimSupported", "alignment", "explanation", "confidence"]
            }
          }
        },
        "required": ["cardId", "illustrations"]
      }
    }
  },
  "required": ["cardIllustrations"]
}
```

---

## 7. Berean Report Assembly, DB Upsert & Chat Post

**This is the step that matters most to get exactly right.** `BereanTab.jsx` (the UI that renders this report) does NOT consume the EXTRACT_SCHEMA / JUDGE_SCHEMA / ILLUSTRATION_SCHEMA shapes above directly — those are only the *intermediate* LLM-output shapes. The actual `report` jsonb column must match what `supabase/functions/berean-analysis/report.ts` (`buildScriptureReport` + `mergeIllustrationsIntoReport`) produces, which reshapes those intermediate outputs. **Writing the raw extraction/judgment schema straight into the `report` column will silently break the Berean tab** (React throws reading `report.summary.stats.total` on what is actually a string, etc.) — this has happened before. Match this shape exactly:

```json
{
  "promptVersion": "berean-v4",
  "model": "<the model/agent that ran this analysis, e.g. \"anthropic:claude-sonnet-5\" — record your own identity, don't hardcode a provider>",
  "extractModel": "<same, or the model used for extraction if different>",
  "summary": {
    "thesis": "<from EXTRACT_SCHEMA.thesis>",
    "mainReference": "<from EXTRACT_SCHEMA.mainReference>",
    "stats": {
      "total": "<card count>", "verbatim": "<count>", "paraphrase": "<count>",
      "allusion": "<count>", "uncited": "<count>",
      "illustrations": "<total illustrations across all cards>",
      "flagged": "<count where assessment is context-caution, unsupported, or misquote>"
    },
    "truncated": false
  },
  "maturity": {
    "overall": "<average of the 4 dimension scores, rounded to 2 decimals>",
    "overallNote": "<from JUDGE_SCHEMA.maturity.overallNote>",
    "dimensions": [
      { "key": "doctrinalContent", "label": "Doctrinal Content", "score": 1, "note": "...", "evidence": ["..."] },
      { "key": "scriptureHandling", "label": "Handling of Scripture", "score": 1, "note": "...", "evidence": ["..."] },
      { "key": "assumedLiteracy", "label": "Assumed Biblical Literacy", "score": 1, "note": "...", "evidence": ["..."] },
      { "key": "applicationDepth", "label": "Application Depth", "score": 1, "note": "...", "evidence": ["..."] }
    ]
  },
  "cards": [
    {
      "id": "c1",
      "transcriptQuote": "<from EXTRACT_SCHEMA usage>",
      "usageType": "verbatim",
      "claimSummary": "<from EXTRACT_SCHEMA usage>",
      "reference": "<from EXTRACT_SCHEMA usage>",
      "passageReference": "<the reference as returned by the fetched passage>",
      "passageText": "<the actual fetched verse text — null if unfetchable>",
      "translation": "<translation id actually fetched, e.g. \"esv\" or \"web\" — NOT necessarily detectedTranslation, see the limitation note in section 4>",
      "illustrations": ["<illustrations for THIS card inlined here, each { id, excerpt, kind, claimSupported, alignment, explanation, confidence } — NOT a separate top-level array keyed by cardId>"],
      "quoteVerified": "<true/false/null — does transcriptQuote actually occur in the transcript (see makeQuoteChecker in textmatch.ts)>",
      "quoteMatch": "<0-1 LCS score, verbatim cards only, null otherwise — see the limitation note in section 4>",
      "assessment": "<from JUDGE_SCHEMA card>",
      "explanation": "<from JUDGE_SCHEMA card>",
      "confidence": "<from JUDGE_SCHEMA card>"
    }
  ],
  "disclaimer": "AI-assisted review to support your own examination, not replace it. Every assessment is anchored to the fetched scripture text shown on the card — read it and judge for yourself. \"They received the word with all eagerness, examining the Scriptures daily to see if these things were so.\" (Acts 17:11)"
}
```

### Database Writes:
1. **Berean Report**: Upsert report into `public.sermon_talk_berean`:
```sql
INSERT INTO public.sermon_talk_berean (talk_id, organization_id, report, model, prompt_version, updated_at)
VALUES ($1, $2, $3, $4, 'berean-v4', NOW())
ON CONFLICT (talk_id) DO UPDATE
SET report = EXCLUDED.report, model = EXCLUDED.model, prompt_version = EXCLUDED.prompt_version, updated_at = NOW();
```
2. **Post to `#sermons-messages` Channel**:
Insert message into `public.chat_messages` for the `#sermons-messages` channel.

**Before reporting success to the user**: re-fetch the row you just wrote and confirm `report.summary.stats`, `report.maturity.overall`, and `report.cards[].illustrations` exist with the right types — don't just confirm the write didn't error.
