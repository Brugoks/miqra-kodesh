---
name: sermon-berean-review
description: Process a sermon or message transcript using the enhanced Berean Review algorithm (berean-v4), auto-detect Bible translation, generate concise community discussion questions, post to #sermons-messages chat, and insert full payload into database.
---

# Agent Instruction: Running Sermon Ingestion & Berean Review (berean-v4)

When a user triggers this skill by providing a raw transcript (and optionally a `talkId` or sermon metadata like title, speaker, and date), you must execute the entire pipeline end-to-end, update the database, and post short discussion prompts to the `#sermons-messages` community chat channel.

---

## Agent Execution Steps

1. **Locate Credentials**: Load `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, and `ESV_API_KEY` from the project's `.env` file.
2. **Talk Entry Resolution / Creation**:
   - If a `talkId` is provided, fetch the existing sermon talk row from `public.sermon_talks`.
   - If **NO `talkId` is provided**, create a new talk entry in `public.sermon_talks` using the provided title, speaker, and date (or defaults), and retain the newly generated `talkId`.
3. **Execute Pass 0 (Boundary Trimming)**: Trim off pre-sermon conversational greetings or administrative banter, and post-sermon announcements/dismissals. Preserve timestamp markers if present.
4. **Execute Metadata & Community Discussion Question Generation**:
   - Generate a 1-2 paragraph plain-text summary.
   - Generate an array of 3-5 key takeaways strings.
   - **Generate 3 Short, Concise Community Discussion Questions**: Create 3 brief, punchy questions (1 sentence each) specifically tailored to drive quick engagement and conversation in the church chat channel.
5. **Update Sermon Row**: Write `summary`, `key_takeaways`, `discussion_questions`, and trimmed `transcript` back to `public.sermon_talks`.
6. **Execute Berean Pass 1 (Scripture & Bible Translation Detection)**:
   - Identify every scripture reference, quote, or allusion in transcript order.
   - **Detect Bible Translation**: Identify the primary Bible translation used by the speaker (e.g., ESV, NIV, KJV, NASB, NLT, CSB, NKJV) based on key phrase choices across all quoted passages.
7. **Execute Pass 2 & 3 (Mechanical Grounding, Judgment & Illustrations)**:
   - Fetch target scripture context verses.
   - Verify quotes and evaluate alignment using the detected translation to prevent false mismatch penalties.
   - Compute maturity scores across 4 dimensions and extract speaker illustrations.
8. **Assemble & Upsert Berean Report**: Package the report JSON (including `detectedTranslation`) and upsert it into `public.sermon_talk_berean`. Clean up obsolete verdicts in `public.sermon_talk_berean_verdicts`.
9. **Post to `#sermons-messages` Chat Channel**:
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
10. **Confirmation**: Report back to the user with a summary of processed cards, detected Bible translation, maturity score, generated discussion questions, link to the `#sermons-messages` chat post, and database write confirmation.

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
  summary = $1,             -- generated summary text
  key_takeaways = $2,       -- JSON array of strings
  transcript = $3,          -- trimmed and cleaned transcript text
  updated_at = NOW()
WHERE id = $4;              -- talk_id
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
2. Fetch corresponding verse text with `CONTEXT_VERSES = 2` surrounding verses.
3. Verify exact quotes using Longest Common Subsequence (LCS) overlap ($\ge 85\%$ threshold for verbatim quotes).
4. Calculate alignment similarity (`quoteMatchScore`) taking into account the `detectedTranslation`.

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

Extract speaker illustrations, personal experiences, analogies, or stories that explain or apply scripture claims.

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

Combine all outputs into the final report structure:
- `promptVersion`: `"berean-v4"`
- `model`: `"gemini:gemini-2.5-flash-lite"`
- `detectedTranslation`: Detected translation metadata
- `summary`, `maturity`, `cards`, `disclaimer`

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
