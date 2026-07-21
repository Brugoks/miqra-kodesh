---
name: sermon-berean-review
description: Process a sermon or message transcript using the Berean Review algorithm (berean-v4) and prepare the JSON payload to insert into the database.
---

# Agent Instruction: Running Sermon Ingestion & Berean Review (berean-v4)

When a user triggers this skill by providing a raw transcript and a talk ID, you must execute the entire pipeline end-to-end and directly write the resulting data to the application's database. 

## Agent Execution Steps
1. **Locate credentials**: Load `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, and `ESV_API_KEY` from the project's `.env` file.
2. **Retrieve talk details**: Fetch the sermon talk row from `public.sermon_talks` matching the provided `talkId` to get context (like `organization_id` and the existing metadata).
3. **Execute Pass 0 (Boundary Trimming)**: Trim off pre-sermon conversational greetings or administrative banter, and post-sermon announcements/dismissals.
4. **Execute metadata Generation**: Generate a 1-2 paragraph plain-text summary and an array of 3-5 key takeaways strings based on the trimmed transcript.
5. **Update Sermon Row**: Write the `summary`, `key_takeaways`, and trimmed `transcript` back to the talk's row in `public.sermon_talks`.
6. **Execute Berean Pass 1, 2, & 3**: Run the scripture extraction, fetch ESV verses via `bible-proxy` (or Crossway API directly), assess alignment and maturity, and extract illustrations.
7. **Assemble & Upsert Berean Report**: Package the report JSON and upsert it into `public.sermon_talk_berean`. Delete old verdicts in `public.sermon_talk_berean_verdicts`.
8. **Confirmation**: Report back to the user with a summary of the processed cards, the computed maturity score, and confirmation that all three tabs (**Summary & Takeaways**, **Transcript**, and **Berean**) have been updated in the database.

---

# Detailed Pipeline Algorithm

## 1. Input Processing & Boundary Trimming (Pre-Pass)
Before generating metadata or running reviews, strip off non-sermon conversational preamble and postamble:

- **AI Boundary Trimming (Pass 0)**:
  Analyze the raw transcript. Often, transcripts contain conversational banter, soundchecks, administrative updates, or unrelated church announcements at the beginning or end.
  - **Pre-Sermon Banter**: Identify where the speaker transitions from casual greetings, housekeeping details, or setup banter to the actual message/sermon introduction (usually marked by opening illustrations, Scripture reading, or introducing the main topic). Cut out everything prior to this start point.
  - **Post-Sermon Banter**: Identify where the speaker transitions from the final closing prayer or final call to action to casual announcements, dismissal notices, or conversational wrap-up. Cut out everything after this end point.
  - **Target Payload**: Keep the opening hook, scriptural context, body points, application, and the sermon's closing/dedication prayer.

---

## 2. metadata Generation (Summary & Takeaways)
Before starting the Berean review, generate the sermon metadata using the trimmed sermon transcript:
- **Summary**: A concise, 1-2 paragraph description (plain text) capturing the central theme, flow, and main points of the message.
- **Key Takeaways**: An array of 3-5 strings containing key actionable items or principles from the sermon. Format them as clear, brief, action-oriented sentences.

### Database Write (metadata):
Update the `public.sermon_talks` table with the generated metadata and the trimmed transcript:
```sql
UPDATE public.sermon_talks
SET 
  summary = $1, -- generated summary text
  key_takeaways = $2, -- JSON array of strings e.g. ["Takeaway 1", "Takeaway 2"]
  transcript = $3, -- trimmed and cleaned sermon transcript text
  updated_at = NOW()
WHERE id = $4; -- talk_id
```

---

## 3. Berean Pass 1: Scripture Usage Extraction
Run the structured extraction pass using the trimmed sermon transcript to identify every scripture reference, quote, or allusion in transcript order.

### Extraction Schema (EXTRACT_SCHEMA)
```json
{
  "type": "object",
  "properties": {
    "thesis": { "type": "string" },
    "mainReference": { "type": "string" },
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
  "required": ["thesis", "mainReference", "usages"]
}
```

---

## 4. Scripture Retrieval & Mechanical Grounding (No AI)
For each unique reference:
1. Parse the citation using `parseReference` logic.
2. Fetch the corresponding ESV text with `CONTEXT_VERSES = 2` surrounding verses on each side using the `bible-proxy` function.
3. **Verify exact quotes (`makeQuoteChecker`)**:
   - Normalize transcript and quote (remove casing, punctuation).
   - Check if all segments separated by ellipses (`...`) exist in the transcript.
   - If not found, compute the Longest Common Subsequence (LCS) overlap. If the in-order word overlap is $\ge 85\%$, `quoteVerified` is `true`, else `false`.
4. **Calculate alignment similarity (`quoteMatchScore`)**:
   - For `verbatim` cards, compare the speaker's quote with the fetched verse content using the LCS overlap. Return a float between `0` and `1.0`.

---

## 5. Berean Pass 2: Scripture Judgment & Maturity Scoring
Provide the trimmed transcript and the grounded cards (with fetched Bible texts) to the LLM.

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
          "assessment": { "type": "string", "enum": ["aligned", "context-caution", "misquote", "unsupported", "disputed-secondary", "unverified"] },
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
              "key": { "type": "string", "enum": ["doctrinalContent", "scriptureHandling", "assumedLiteracy", "applicationDepth"] },
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

## 6. Berean Pass 3: Examples & Stories (Illustrations)
Extract speaker illustrations, stories, personal experiences, or analogies from the trimmed transcript that explain or apply the scripture claims.

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
                "kind": { "type": "string", "enum": ["story", "personal-experience", "analogy", "cultural-example", "illustration"] },
                "claimSupported": { "type": "string" },
                "alignment": { "type": "string", "enum": ["clarifies-text", "applies-text", "overextends-text", "distracts-from-text", "reframes-text", "unsupported-spiritual-claim", "unverified"] },
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

## 7. Berean Report Assembly & DB Upsert
Combine all outputs into the final report structure:
- `promptVersion`: `"berean-v4"`
- `model`: `"gemini:gemini-2.5-flash-lite"`
- `extractModel`, `illustrationModel`
- `summary`, `maturity`, `cards`, `disclaimer`

### Database Write (Berean):
Upsert the final report into `public.sermon_talk_berean`:
```sql
INSERT INTO public.sermon_talk_berean (talk_id, organization_id, report, model, prompt_version, updated_at)
VALUES ($1, $2, $3, $4, 'berean-v4', NOW())
ON CONFLICT (talk_id) DO UPDATE
SET report = EXCLUDED.report, model = EXCLUDED.model, prompt_version = EXCLUDED.prompt_version, updated_at = NOW();
```
Delete existing verdicts to maintain structural mapping integrity:
```sql
DELETE FROM public.sermon_talk_berean_verdicts WHERE analysis_id = $1;
```
