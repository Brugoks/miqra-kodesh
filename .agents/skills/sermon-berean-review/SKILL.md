---
name: sermon-berean-review
description: Process a sermon or message transcript using the enhanced Berean Review algorithm (berean-v4), auto-detect Bible translation, generate concise community discussion questions, build the member-facing Living Canvas insight pack (from the sermon only, never from anyone's reflections), post to #sermons-messages chat, and insert full payload into database.
---

# Agent Instruction: Running Sermon Ingestion & Berean Review (berean-v4)

When a user triggers this skill by providing a raw transcript (and optionally a `talkId` or sermon metadata like title, speaker, and date), you must execute the entire pipeline end-to-end, update the database, and post short discussion prompts to the `#sermons-messages` community chat channel.

---

## Privacy boundary — read before touching any data

**This skill never reads members' Living Canvas moments, journals, reflections or prayers.** Not to "find related insights", not in aggregate, not with the service-role key. Those live in `public.study_canvases` under owner-only row-level security, are never link-shared, and are sent to AI only when a member presses a button themselves. A service-role key *can* read them; that is exactly why you must not.

Helping a sermon meet a member's canvas is done in two halves, and only the first belongs here:

1. **Sermon side (this skill, Pass 4):** prepare a small *insight pack* from the sermon alone and store it on the talk (`sermon_talks.canvas_insights`).
2. **Member side (the app):** when a member opens a moment, the app matches it to recent insight packs **on their own device** by passage reference, and only if they press "Ask what may speak into this" does their glimpse go to the AI. See `docs/living-study-canvas.md` → "Hear it in a sermon".

Never `select` from `study_canvases`, never join anything to it, never accept a canvas, journal or reflection as input to any step below. If a request asks you to look at members' reflections to find connections, decline that part, run the rest, and explain why.

---

## Agent Execution Steps

1. **Locate Credentials**: Load `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, and `ESV_API_KEY` from the project's `.env` file.
2. **Organization Resolution**: If the invocation names an organization or campus (e.g. "Adventure Church Natomas"), look it up against `public.organizations.name` (case-insensitive, allow partial/fuzzy match — church names in the wild rarely match the DB row exactly). If exactly one row matches, use its `id`. If zero or more than one match, **stop and ask the user** which organization to use — do not fall back to the caller's `active_organization_id` silently. (A prior run defaulted to the wrong org this way and required a manual DB fix.)
3. **Talk Entry Resolution / Creation**:
   - If a `talkId` is provided, fetch the existing sermon talk row from `public.sermon_talks`.
   - If **NO `talkId` is provided**, first check for an existing talk with the same `title` + `speaker_name` + `talk_date` (or `video_url`) in the resolved organization — reprocessing an already-ingested sermon should update that row, not create a duplicate. Only if none exists, create a new talk entry using the provided title, speaker, and date (or defaults), and retain the newly generated `talkId`.
4. **Calendar Event Resolution / Creation**: If the talk row already has an `event_id`, skip this step.
   - Search `public.calendar_events` for the resolved organization on the sermon's `talk_date` **with `category = 'service'`** — a same-day Bible study, men's breakfast or other event is *not* the service, so never link a sermon to one of those. If exactly one service event exists, link it (`sermon_talks.event_id = calendar_events.id`).
   - If zero service events match, **create** a new `calendar_events` row — `title` (e.g. "Sunday Morning Service", or the service name if given), `date` = `talk_date`, `category` = `'service'`, `organization_id` = resolved org — then link its `id` as `sermon_talks.event_id`. Sermons should not go unlinked by default; only skip creation if the user explicitly says not to.
   - If multiple service events exist, stop and ask the user which one to link. (Creating an event writes an in-app notification for every member of the organization; this is the established behaviour for ingests, but mention it in the confirmation.)
5. **Execute Pass 0 (Boundary Trimming & Formatting)**: Trim off pre-sermon conversational greetings or administrative banter, and post-sermon announcements/dismissals. Preserve timestamp markers if present. Reformat the kept transcript into readable markdown (title/speaker/text header, `## ` section headings, blank-line paragraphs, `> ` blockquotes for scripture read aloud) — see section 1 below. **This is formatting only: every word the speaker actually said must be preserved verbatim, in order — never summarize, paraphrase, reword, or drop content.**
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
10b. **Execute Pass 4 (Member Insight Pack for the Living Canvas)**: From the *finished report and the stored transcript only*, choose 3–6 insights, validate them with the repo's `buildInsightPack`, and write the result to `public.sermon_talks.canvas_insights`. Skip with a clear note (do not fail the run) if the column does not exist yet (migration `20261018190000_sermon_canvas_insights.sql` not applied). See section 8 below. **No canvas data is read at any point.**
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
12. **Confirmation**: Report back to the user with a summary of processed cards, detected Bible translation, maturity score, generated discussion questions, the insight pack (how many insights, which passages, and that no member data was read), whether a calendar event was linked or created, link to the `#sermons-messages` chat post, and database write confirmation. Also say which side effects the writes had: creating a calendar event writes an in-app notification for every member of the organization, and the chat post may push to members who set that channel to "all".

---

# Detailed Pipeline Algorithm

## 1. Input Processing & Boundary Trimming (Pre-Pass 0)

Analyze the raw transcript to strip off non-sermon conversational preamble and postamble:

- **Pre-Sermon Banter**: Cut out setup banter, soundchecks, housekeeping updates, and casual greetings prior to the message opening (hook, scripture reading, or sermon intro).
- **Post-Sermon Banter**: Cut out post-prayer casual announcements, offering instructions, or dismissal notices.
- **Timestamp Preservation**: If the raw transcript includes timestamp markers (e.g. `[02:15]`), preserve them at paragraph boundaries for audio/video synchronization.

### Transcript formatting (stored in `sermon_talks.transcript`)

The Transcript tab (`TalkDetail.jsx`, via `renderTranscriptMarkdown` in `src/lib/transcriptMarkdown.jsx`) renders a small markdown subset — do not write a single unbroken wall of text. Target this structure, matching the existing well-formatted talks in the table (e.g. "Go All Out: Peace, Holiness, and Your Inheritance", "What Kind of a Man Am I?"):

```markdown
# {Title}

**Speaker:** {Speaker}{ (affiliation), if mentioned}
**Text:** {Main scripture reference}

---

## {Section heading, e.g. "Introduction", "The Call to Hospitality", "Closing"}

{Paragraph — a few sentences forming one coherent thought or point.}

{Next paragraph.}

> {Scripture quoted/read aloud at length goes in a blockquote, not inline —
> only for actual extended readings, not every passing paraphrase.}

## {Next section heading}
...
```

Supported inline/block syntax: `#`/`##`/`###` headings, `**bold**`, `*italic*`, `> ` blockquotes, `* `/`- ` bullet lists, `---` horizontal rules, blank-line-separated paragraphs.

**Hard constraint — this step adds structure, it does not touch content**: the only *new* words allowed are the title/speaker/text header block itself. Every sentence of what the speaker actually said must survive character-for-character (aside from the paragraph breaks, heading insertions, and blockquote/bold markup you're adding around it) — no summarizing, no "cleaning up" filler words, no reordering. If you're unsure whether a change is purely structural, don't make it. Section headings are your own editorial judgment about where topics shift; keep them sparse (3-7 for a typical message) — don't force one per paragraph.

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

---

## 8. Berean Pass 4: Member Insight Pack (Living Canvas)

**What this is.** The Berean report is a leader tool (RLS: leaders only) and carries findings a congregation should not receive second-hand. The insight pack is the part of the sermon that is safe and useful for *every member* of the church: a few grounded claims, each tied to a passage and to words the speaker really said, with a question to sit with. The app's Living Canvas ("Hear it in a sermon") matches it to a member's moment **on the member's own device**, by passage reference, and only calls AI when the member presses a button. This skill's only job is to prepare the pack. **Read nothing about any member** (see the privacy boundary at the top).

**Inputs, and only these:** the finished Berean `report` (section 7) and the stored `transcript` (the trimmed, formatted markdown from step 5, with a `[mm:ss]` marker at the start of each paragraph).

**Prerequisite:** migration `20261018190000_sermon_canvas_insights.sql` adds `sermon_talks.canvas_insights`. If the column is missing, skip this pass, say so in the confirmation, and do not fail the run.

### Choosing insights (3–6; fewer, stronger)

- **Only from cards the review judged `aligned`** (confidence `high` or `medium`) that have fetched passage text and a verified quote. Never from `context-caution`, `misquote`, `unsupported`, `disputed-secondary` or `unverified` cards: a congregation must not be handed a point the review had doubts about, and must not learn of leader-only flags indirectly. The builder rejects them. Do not mention the review, its flags, or any weakness of the speaker in member-facing text.
- Prefer claims that carry the sermon's spine over passing cross-references. One insight per distinct claim; do not repeat the same passage twice.
- **Voice: invite, never announce.** The pack offers a connection to weigh against the passage (Acts 17:11); it never tells a member what God is saying to them. No "God is telling you…", no "this is a sign", no promises or prescriptions. `claim` states what *the sermon says the passage shows*, no more than the aligned card supports. `question` is genuinely open ("What…", "Where…", "Is there…") and ends with `?`; it is not a rhetorical push toward a conclusion.
- Plain text only, no Markdown or HTML.

### Raw shape you write

```json
{ "insights": [ {
    "anchor": "Luke 4:18-19",            // single-chapter passage the claim rests on; what the member would open
    "refs": ["Luke 4:14-30"],            // up to 4 other passages the sermon tied it to (e.g. the main text); used only for matching
    "cards": ["c13", "c14"],             // Berean card ids it is drawn from (the audit trail)
    "claim": "Jesus knew what he was sent to do before his hometown said anything about it...",   // <= 280 chars
    "quote": { "text": "he started his ministry and then he comes and he opens up the book ...", "at": "41:04" },
    "question": "What do you sense you were made and sent to do, apart from whether anyone has noticed?"  // <= 240 chars, ends with ?
} ] }
```

- `quote.text` is the speaker's **exact words** from the stored transcript (4+ words, <= 400 chars; `...` may join two separated stretches). `quote.at` is the time on the **raw line** where the quote begins (the stored transcript only marks paragraph starts; the builder checks your time falls inside the paragraph the words are in, so a "Watch from 41:04" link cannot land on the wrong minute). Use `null` for `at` if the transcript has no timing. Omit `quote` entirely rather than paraphrase.
- Assign no `id`; the builder numbers them `i1…iN`.

### Build and validate with the repo's own module

Run `buildInsightPack(raw, report, transcript, { model })` from `supabase/functions/berean-analysis/insights.ts` — the same module its tests cover. It imports only `reference.ts` and `textmatch.ts`, so plain Node 22 runs it directly (type stripping; no loader or `Deno` shim needed — that shim is only for `report.ts`). It returns `{ pack, problems }`.

- **`problems` must be empty before anything is written.** Fix the raw insights and rebuild. Never hand-edit the pack and never loosen the builder to get past a problem.
- The builder verifies: valid single-chapter references; every card exists, is `aligned`, has passage text and a verified quote; the quote really occurs in the transcript (no invented quotes); the time sits inside its paragraph; the question is a question; no duplicates; caps on counts and lengths.

### Write and verify

```sql
update public.sermon_talks
set canvas_insights = $1::jsonb, updated_at = now()   -- the `pack` from the builder
where id = $2;                                        -- talk_id
```

Re-running replaces the pack. The database re-checks the structure (`sermon_talks_canvas_insights_check`), so a malformed pack is refused rather than stored. **Before reporting success**, re-select the row and confirm `canvas_insights->>'version' = '1'` and the insight count and anchors match what you built.

### Don'ts

- Do not read `study_canvases`, or any member's reflections, to decide what to include or to "see what resonates". Not in aggregate, not for a pastor, not "just to check".
- Do not add fields to the pack to carry member data, counts of members, or anything derived from them.
- Do not turn `context-caution` findings into "test this" prompts for members; leaders see those in the Berean tab.
- Do not write the pack for a talk that is not published to the same organization it was ingested for.
