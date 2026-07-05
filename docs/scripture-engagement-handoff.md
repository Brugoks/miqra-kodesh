# Scripture Engagement — Handoff Plan

Goal: the ReadingStats heatmap and 66-book map should reflect **all user-initiated scripture engagement** — reading-plan completions AND Bible Lookup lookups — not just plans. Passive displays (the Dashboard daily verse from OurManna, previews) are **deliberately excluded**: they never touch the recording paths, so no filtering is needed.

This document hands off a half-finished feature. Steps 1–2 are DONE and verified; execute steps 3–6 in order. Follow repo conventions: plain JSX, per-component CSS, `npm test` + `npm run lint` after each step.

## Already done — do NOT redo

1. **Migration** `supabase/migrations/20260704150000_scripture_engagement.sql` — table `scripture_engagement (user_id, book, chapter, source check in ('plan','lookup'), engaged_on date, PK on all five)`, user-owned RLS. Written but **NOT yet applied to the linked DB** (see step 6).
2. **Lib** `src/lib/scriptureEngagement.js` + `scriptureEngagement.test.js` (8 tests, all passing):
   - `passageIdsToChapters(ids)` — `'JHN.3.16-JHN.3.18'` → `'JHN.3'`, deduped
   - `localDateStr(date)` / `parseLocalDate(str)` — local-day handling (avoid the `new Date('YYYY-MM-DD')` UTC-shift trap)
   - `recordEngagement(userId, chapterIds, source, engagedOn?)` — idempotent upsert, `ignoreDuplicates`
   - `getEngagedBooksProgress(planRows, lookupChapterIds)` — per-book `{ code, name, total, planRead, engaged, done, exploredOnly }`
   - `backfillLookupEngagement(userId, refToChapters)` — one-time client backfill from `scripture_lookup_history` (approximate last-known dates), guarded by localStorage key `engagementBackfill:v1:<userId>`; call it with `(ref) => passageIdsToChapters(refToPassageIds(ref))`

## Step 3 — Wire recording into the two call sites

**a) Lookups** — `src/components/BibleLookup.jsx`, inside `lookupReference` (~line 483), in the existing `if (isConfigured)` block that upserts `scripture_lookup_history`. Add (fire-and-forget, never block the lookup):

```js
recordEngagement(session.user.id, passageIdsToChapters(passageIds), 'lookup').catch(() => {});
```

Import `recordEngagement, passageIdsToChapters` from `../lib/scriptureEngagement`. `passageIds` is already in scope.

**b) Plan completions** — `src/components/reading/useReadingPlan.js`, inside `markDayDone`, right after the `reading_plan_progress` upsert. Add:

```js
if (plan) recordEngagement(userId, getPlanChapters(plan, targetDay), 'plan').catch(() => {});
```

Import `recordEngagement` from `../../lib/scriptureEngagement` and add `getPlanChapters` to the existing `../../lib/readingPlans` import.

Do NOT record from the DailyReading reader directly (it calls `markDayDone` via `onDone` — recording there would double-write) and do NOT record from MemoryReview (user scoped this to plans + lookups only).

## Step 4 — ReadingStats UI (`src/components/reading/ReadingStats.jsx` + `.css`)

Current state: fetches `reading_plan_progress`, heatmap via `getHeatmapDays(completions)`, books map via `getLifetimeBooksProgress`.

Changes:
1. On mount (inside the existing effect, before querying): `await backfillLookupEngagement(userId, (ref) => passageIdsToChapters(refToPassageIds(ref)))` — import `refToPassageIds` from `../../lib/scripture`.
2. Additionally fetch `scripture_engagement`: `select('book, chapter, source, engaged_on').limit(10000)` (RLS scopes to the user).
3. **Heatmap source toggle** — three chips above the heatmap: `All | Plans | Lookups` (state `heatmapSource`, default `'all'`).
   - Plan day-datums: existing `reading_plan_progress` non-skipped `completed_at` timestamps (keep — this covers pre-engagement history).
   - Lookup day-datums: engagement rows with `source === 'lookup'` → `parseLocalDate(row.engaged_on)` Date objects.
   - Feed the filtered concatenation into `getHeatmapDays([...])` — it does `new Date(x)` internally, which accepts both ISO strings and Date objects. Note: with `'all'`, a plan-completion day contributes rows from BOTH tables after step 3b dual-writes; that inflates the intra-day count (shade level) but not the day itself. Acceptable; if you want exact counts, dedupe plan-source engagement rows against plan-progress days first.
4. **Books map "explored" state** — replace `getLifetimeBooksProgress(rows)` with `getEngagedBooksProgress(planRows, lookupChapterIds)` where `lookupChapterIds` = engagement rows with `source === 'lookup'` mapped to `` `${book}.${chapter}` ``. Cell classes: keep `done` (plan covers all) and `partial` (planRead > 0), add `explored` for `exploredOnly` books. Tooltip: `` `${name}: ${planRead}/${total} via plans · ${engaged - planRead} explored` ``. CSS for `.rs-book-cell.explored`: teal outline, transparent fill, e.g. `border: 1px solid rgba(13,148,136,.45); color: #14b8a6; background: transparent;` (matches existing palette).
   - "chapters read" total: keep as plan-based `planRead` sum, or show both ("X read · Y explored") — either is fine; do not let lookups inflate the plan-read number.
5. Toggle chips CSS: reuse the `.dr-chip` pattern from `DailyReading.css` (small pill, active teal).

**Streak stays plan-only** — do not touch streak computation anywhere; lookups must not feed streaks.

## Step 5 — Verify

- `npm test` (expect all suites green, including the 8 in `scriptureEngagement.test.js`) and `npm run lint` (only pre-existing warnings in App.jsx/Calendar.jsx are acceptable).
- `npm run build` must succeed.

## Step 6 — Apply migration to the linked Supabase project

```sh
supabase db push --linked
```

Only `20260704150000_scripture_engagement.sql` should be listed as pending. **Timestamp-collision warning from a previous incident:** the remote once had different migrations sharing local version numbers, which made `db push` silently skip files. Before pushing, run `supabase migration list --linked` and confirm `20260704150000` shows a Local entry with an empty Remote column. After pushing, verify:

```sh
supabase db query --linked "select column_name from information_schema.columns where table_name = 'scripture_engagement';"
```

No edge-function changes are needed for this feature.

## Definition of done

Looking up "John 3" in Bible Lookup, then opening Reading Plan → Stats shows: John's cell on the books map in the "explored" style, and today lit on the heatmap under `All` and `Lookups` (but NOT counted toward any streak). Completing a plan day continues to work exactly as before, now also writing `source='plan'` engagement rows.
