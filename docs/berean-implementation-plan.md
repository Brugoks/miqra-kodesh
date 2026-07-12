# Berean Review — Implementation Plan & Handoff

**Feature:** AI-assisted scripture-alignment review of sermon/message transcripts, plus a
milk → solid food maturity profile (Heb 5:12–14). Leader-only, lives as a fourth section tab
("Berean") inside each talk on the Sermons & Messages page.

**Framing (do not drift from this):** the tool never issues verdicts on a sermon. It extracts
every scripture usage, fetches the REAL passage text, lays them side by side, and annotates —
**the leader decides** (Acts 17:11). "Milk" is never presented as bad (1 Pet 2:2); the maturity
profile describes audience fit, not quality. Positions where faithful traditions differ are
labeled "denominational distinctive," never "error" — this app is multi-tenant across churches.

A follow-up feature ("Issachar," 1 Chr 12:32 — the longitudinal teaching-diet dashboard) is
intentionally **not** named or built yet; see Phase 4.

---

## ✅ Slice 1 — DONE (code-complete, verified locally: lint clean, 339 tests pass, build succeeds)

| File | What it is |
|------|------------|
| `supabase/migrations/20260712000000_berean_analysis.sql` | `sermon_talk_berean` (one analysis per talk, unique `talk_id`, written only by service role — leaders can only SELECT) + `sermon_talk_berean_verdicts` (per-leader ✓ sound / ? discuss / ✗ concern + note per card, shared across the org's leaders). Both RLS'd to `is_leader()` within `get_my_organization_id()`, following the `sermon_talks` pattern. |
| `supabase/functions/berean-analysis/index.ts` | The pipeline. Auth = real JWT check (user client → `auth.getUser()` → profile role must be leader/admin/developer, talk must be in caller's active org). Pass 1 (Gemini): extract usages — `verbatim` / `paraphrase` / `allusion` / `uncited-claim` (with best-guess reference). Fetch each passage's REAL text via the existing `bible-proxy` function (ESV → free:web fallback), expanded ±2 verses for context, with retry on exact range if expansion fails. Mechanical `quoteMatchScore` (no AI) for verbatim quotes. Pass 2 (Gemini): judge each card ONLY against fetched text (`aligned` / `context-caution` / `misquote` / `unsupported` / `disputed-secondary` / `unverified`) + 4-dimension maturity rubric with verbatim transcript quotes as evidence. Upserts report into `sermon_talk_berean`. Model: `BEREAN_GEMINI_MODEL` env, default `gemini-2.5-flash-lite`. Prompt version `berean-v1`. |
| `src/components/sermons/BereanTab.jsx` + `Berean.css` | Leader-only tab UI: intro banner, run/re-run, summary strip (total/verbatim/paraphrase/indirect references/uncited/flagged), **milk→solid meter** (gradient track + marker, per-dimension 5-segment bars, expandable evidence quotes, "milk is not a flaw" footnote), alignment cards (speaker quote ‖ fetched scripture side by side, badges, AI explanation + confidence, weak-quote-match warning), per-leader verdict buttons + private note, other leaders' verdicts shown, Acts 17:11 disclaimer. |
| `src/components/sermons/TalkDetail.jsx` | Fourth section tab "Berean" (BookOpenCheck icon), rendered only when `isLeaderRole(userRole)`. |
| `src/components/sermons/talkUtils.js` + test | `MATURITY_BANDS`, `getMaturityBand(score)` (Milk < 2.34 ≤ Transitional < 3.67 ≤ Solid food; returns null for non-numbers), `maturityPercent(score)` (1–5 → 0–100). 11 tests. |

### Report JSONB shape (stored in `sermon_talk_berean.report`)

```json
{
  "promptVersion": "berean-v1", "model": "gemini-2.5-flash-lite",
  "summary": { "thesis": "...", "mainReference": "...", "truncated": false,
    "stats": { "total": 0, "verbatim": 0, "paraphrase": 0, "allusion": 0, "uncited": 0, "flagged": 0 } },
  "maturity": { "overall": 2.75, "overallNote": "...",
    "dimensions": [{ "key": "doctrinalContent|scriptureHandling|assumedLiteracy|applicationDepth",
                     "label": "...", "score": 1, "note": "...", "evidence": ["..."] }] },
  "cards": [{ "id": "c1", "transcriptQuote": "...", "usageType": "verbatim", "claimSummary": "...",
              "reference": "John 3:16", "passageReference": "John 3:14-18", "passageText": "[14] ...",
              "translation": "esv", "quoteMatch": 0.85,
              "assessment": "aligned", "explanation": "...", "confidence": "high" }],
  "disclaimer": "..."
}
```

---

## ✅ Deploy & verify Slice 1 — DONE (2026-07-12, commit 3911929)

Migration applied, function deployed (model default `gemini-2.5-flash-lite` — the linked
Gemini project rejects `gemini-2.5-flash`; retry/backoff added for transient 429/503).
Full E2E checklist below verified against the linked project, including RLS (student and
cross-org reads return zero rows), verdict persistence across leader accounts, upsert-not-
duplicate re-runs, friendly failure modes, and mobile layout. Original checklist kept for
re-verification after future changes:

1. `supabase db push --linked` (applies `20260712000000_berean_analysis.sql`).
2. `supabase functions deploy berean-analysis`.
3. Secrets: `GEMINI_API_KEY` and `ESV_API_KEY` should already be set (used by gemini-proxy /
   bible-proxy). Optionally `supabase secrets set BEREAN_GEMINI_MODEL=...` to override the model.
4. End-to-end check: as a leader, open a talk that has a transcript ≥ 200 chars → Berean tab →
   Run. Verify: report renders, passages show real ESV text, verdict buttons persist (and a
   second leader account sees them), a `student` role account sees no Berean tab AND
   `select * from sermon_talk_berean` returns nothing for them (RLS).
5. Failure modes to test: talk with no transcript (friendly message), transcript with zero
   scripture (422 surfaced as error), Gemini rate-limit (error string surfaced in UI).

## 🔲 Phase 2 — Grounding depth

- **Curated cross-references per card**: `cross_references` table is already seeded
  (openbible.info, vote-weighted). For each card's passage, show top ~3 cross-refs
  ("test against the whole counsel of Scripture"). Plain SQL join, no embeddings needed.
- **Per-org doctrinal statement**: new column/table (e.g. `organizations.doctrinal_statement`
  or an org settings table) editable by admins; feed it into pass 2 as an extra source and add
  an "alignment with your church's stated beliefs" section. Default baseline: Apostles'/Nicene
  creeds. Respect multi-tenancy — never bake one denomination into the prompt.
- **Strong's word-study checks**: when pass 1 detects an original-language claim ("the Greek
  word means…"), fetch the actual entry via the existing `strongs-proxy` / `word-strongs-proxy`
  and attach it to the card.
- **Translation comparison** on a card: ESV + free:kjv/web via `bible-proxy` — flag points
  riding on one translation's wording.

## 🔲 Phase 3 — Ingestion beyond pasted transcripts

- YouTube link → captions via existing `youtube-proxy` (many churches post sermons there).
- Audio upload → transcription (Whisper via `hf-proxy`, HF_TOKEN secret exists; or Cloudflare
  Workers AI which already backs `image-proxy`). Highest effort — keep last.
- Chunk + map-reduce extraction for transcripts > 60k chars (currently truncated with a
  visible warning; `report.summary.truncated`).

## 🔲 Phase 4 — Leader workflow & "Issachar" dashboard

- Transcript-anchored navigation: highlight detected quotes inline in the Transcript tab,
  click ↔ scroll to the matching Berean card.
- "Raise in discussion" button per card → drafts a discussion question (aligned cards only;
  concern-flagged cards should route to leader-only channels, never public discussion).
- **Issachar** (name reserved): teaching-diet dashboard across a series — maturity profiles
  over time ("8 weeks milk-heavy on application"), per-speaker and per-series views. Data is
  already accumulating in `sermon_talk_berean.report.maturity`.

## Conventions the next agent must follow (from CLAUDE.md + this codebase)

- Plain JS/JSX, no TypeScript in `src/` (edge functions are Deno TS).
- New tables: `organization_id` + RLS keyed to `get_my_organization_id()`, `set_organization_id`
  trigger; add a NEW migration, never edit old ones.
- Components: sibling `.css`, theme via CSS custom properties (`--accent-gold`, `--bg-secondary`…).
- Edge functions: `_shared/cors.ts` + `recordUsageEvent`; secrets server-side only.
- Tests colocated (`*.test.js`), vitest + jsdom, run `npm run lint && npm test` before done.
