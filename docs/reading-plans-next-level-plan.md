# Reading Plans Next-Level Plan

Goal: evolve reading plans from a single Dashboard card ([src/components/ReadingPlanCard.jsx](../src/components/ReadingPlanCard.jsx), ~170 lines) into the app's flagship daily-habit feature: a guided reading experience, a rich plan catalog, reminders, reflection, and reading together as a fellowship. This document is written to be executed phase-by-phase by a coding agent (Gemini/Codex/Claude). Each phase is independently shippable; do them in order — Phase 0 unblocks everything after it.

## Current state (what already exists — do NOT rebuild)

- 4 plans generated from canonical chapter counts in `src/lib/readingPlans.js` (`gospels-30`, `psalms-proverbs-31`, `nt-90`, `bible-365`). `getPlanReadings(plan, day)` returns chunks like `{ label: 'Matthew 1-3', ref: 'Matthew 1' }`.
- Tables (migration `supabase/migrations/20260702002000_reading_plans.sql`):
  - `reading_plan_enrollments` — PK `(user_id, plan_id)`, `started_at`. RLS: user manages own.
  - `reading_plan_progress` — one row per `(user, plan, day)` with `completed_at`. RLS: user manages own.
- `ReadingPlanCard` on the Dashboard: plan picker, "today" = next uncompleted day (self-paced), reading chips dispatch `scripture:open` (BibleLookup listens and loads the passage), "Mark day done", progress bar, streak flame (`computeStreak` — consecutive calendar days, yesterday-anchored so an unfinished today doesn't break it).
- Discipleship partner view (`src/components/Discipleship.jsx` ~line 710) reads a partner's enrollment + progress for accountability.
- App infrastructure available to build on:
  - **Bible text in-app**: `bible-proxy` edge function (multi-translation incl. NASB) used by `BibleLookup.jsx`; also AI passage insights (`fetchInsights`), cross-references, Strong's.
  - **Web push**: `src/lib/push.js` (VAPID), `push_subscriptions` table, `send-push` edge function, `public/sw.js`.
  - **SRS memory verses**: `src/lib/srs.js`, `memory_verses` table, `MemoryReview.jsx`.
  - **Scripture image generation**: Cloudflare Workers AI (FLUX) via `image-proxy` (see `ScriptureImage.jsx`).
  - **Fellowship**: prayers, shared journal (`src/components/fellowship/`), org chat with push-backed @mentions.
  - **BibleProject videos**: `youtube-proxy` edge function, embedded in Studies.

Conventions to follow:
- Plain JSX (no TypeScript), Vite + React, CSS file per component, lucide-react icons, existing `btn-primary`/`btn-secondary`/`card` classes.
- New SQL goes in `supabase/migrations/<YYYYMMDDNNNNNN>_<name>.sql`, idempotent (`if not exists`, `create or replace`), RLS on every table.
- Pure logic goes in `src/lib/*.js` with a colocated `*.test.js` (see `readingPlans.test.js`, `srs.test.js`). Run `npm test` and `npm run lint` after each phase.
- Keep the self-paced philosophy: never guilt-trip. "Behind" messaging is gentle and optional; catch-up is one tap.

---

## Phase 0 — Data model + foundation refactor

Everything later needs enrollment state richer than "row exists". Ship this first; it changes no visible behavior except a safer Quit.

### 0.1 Migration: enrollment lifecycle

`supabase/migrations/<ts>_reading_plans_v2.sql`:

```sql
alter table public.reading_plan_enrollments
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists status text not null default 'active'
    check (status in ('active', 'paused', 'completed', 'abandoned')),
  add column if not exists completed_at timestamptz,
  add column if not exists reminder_time time,          -- null = no reminder (Phase 4)
  add column if not exists timezone text;               -- IANA tz for reminders
```

Keep the `(user_id, plan_id)` PK. Add a partial unique index later only if multiple restarts of the same plan are needed (out of scope — restarting a plan clears its progress rows instead, current behavior).

### 0.2 Extract data logic into a hook

Create `src/components/reading/` and move data logic out of `ReadingPlanCard.jsx` into `src/components/reading/useReadingPlan.js`:

- `useReadingPlan(session)` returns `{ loading, enrollment, plan, completedDays, currentDay, streak, startPlan, markDayDone, pausePlan, resumePlan, quitPlan, reload }`.
- `markDayDone` stays optimistic (add to set immediately, upsert, refresh streak from server timestamps — current pattern).
- Only `status = 'active'` enrollments count as the current plan.

`ReadingPlanCard.jsx` becomes presentation-only and keeps working exactly as today.

### 0.3 Fix Quit UX (destructive today)

Quit currently deletes all progress with zero confirmation. Replace the `X` with a small menu (lucide `MoreHorizontal`):
- **Pause plan** → `status = 'paused'` (progress kept; card returns to picker state with a "Resume {plan}" banner at top).
- **Quit plan** → confirm dialog ("Your {n} completed days will be kept — you can restart anytime."), sets `status = 'abandoned'`, does **not** delete progress rows. Re-enrolling in the same plan asks "Continue where you left off, or start over?" (start over deletes that plan's progress rows, then upserts a fresh enrollment).

### 0.4 Pacing awareness (gentle)

Add to `readingPlans.js` (+ tests): `getPaceStatus(enrollment, completedDays, plan, now)` → `{ expectedDay, delta }` where `expectedDay` is days since `started_at` clamped to `plan.days`. In the card, show a one-line subtitle:
- delta ≥ 0: "Right on pace" / "{delta} days ahead 🎯"
- delta < 0: "At your pace — day {currentDay}" (never "you're behind"). A small "Catch up" affordance appears only when delta ≤ -3: tapping shows how many chapters/day would finish on time — informational only.

---

## Phase 1 — The guided Daily Reading experience

This is the single highest-impact change: today users bounce out to the Bible Lookup panel and manually come back to hit "Mark done". Make reading itself the product.

### 1.1 `DailyReading.jsx` — full-screen reader flow

New `src/components/reading/DailyReading.jsx` (+ CSS), opened from the card's new primary button **"Start today's reading"** (replaces the raw chip list as the main action; chips remain as a compact secondary row for people who prefer the lookup panel).

- Full-screen overlay (same pattern as existing modals/lightbox) with the day's chunks as a horizontal stepper: `Matthew 1 → Matthew 2 → Matthew 3`.
- Each step fetches chapter text via the existing `bible-proxy` edge function (reuse the fetch pattern from `BibleLookup.jsx` — default to the user's last-used translation, fall back to WEB via bible-api.com like BibleLookup does).
- Comfortable reading typography: max-width ~65ch, adjustable text size (S/M/L persisted to localStorage), verse numbers muted.
- Bottom bar: "Next chapter" advances the stepper; the last chunk's button reads **"Finish day {n}"** and calls `markDayDone`.
- Per-chunk completion is client-side state only (day-level completion stays the DB unit — no schema change).
- Completion screen: progress ring animating to the new %, streak flame with count, and the day's "verse of the day" (first verse of the first chunk) rendered with a **"Share as image"** button that reuses the existing `ScriptureImage` generation.
- Esc / X closes without losing chunk position (persist `{ planId, day, chunkIndex }` in localStorage).

### 1.2 Wire the card to the reader

- Card primary CTA = "Start today's reading" (or "Continue — 2 of 3 chapters" if a partial day is in localStorage).
- Keep "Mark day done" as a text-link fallback for people who read on paper — it's a feature, not a leftover.

### 1.3 Auto-suggest a memory verse (SRS bridge)

On the completion screen, offer one tappable suggestion: "Add {ref} to memory verses". Curate a small static map in `src/lib/readingPlans.js` of well-known verses per chapter (e.g. `MAT.5` → Matthew 5:16, `JHN.3` → John 3:16, ~40 entries covering the current plans); if today's chapters hit the map, surface it. Tapping inserts into `memory_verses` with default SRS state (mirror how `MemoryReview.jsx` creates cards). Skip silently when no match.

---

## Phase 2 — Plan catalog worth browsing

### 2.1 Richer plan definitions

Extend plan objects in `readingPlans.js` with `category` (`'gospels' | 'wholeBible' | 'wisdom' | 'topical' | 'chronological'`), `paceLabel` (e.g. "~3 chapters/day"), and optional `explicitDays` (array of day → chapter-id arrays) for hand-curated plans where even distribution is wrong. `getPlanChapters` checks `explicitDays` first, else falls back to the current even-split math. Add plans:

- **Chronological Bible in a Year** (365) — events in historical order; use a standard chronological ordering table (hardcode the sequence as data, same pattern as `OT_ORDER`).
- **Life of Jesus (Chronological Gospels, 45 days)** — curated `explicitDays`.
- **Torah in 90 days**, **Psalms in 60 days**, **Proverbs in a Month** (1/day matching day-of-month), **Paul's Letters in 30 days**, **NT in 30 days** (aggressive pace, clearly labeled).
- **Bible in 6 months / 2 years** — same chapter sequence as `bible-365`, different `days` (the even-split math already handles this — these are 3-line additions).

### 2.2 Plan browser + detail view

Replace the inline picker list with `src/components/reading/PlanBrowser.jsx`:
- Category-grouped cards showing name, duration, pace label, and a mini coverage bar (OT/NT split — compute from chapter codes with `NT_BOOKS` from `scripture.js`).
- Tapping a plan opens a detail sheet: full description, sample of day 1's readings, total chapters, estimated minutes/day (~3.5 min per chapter), and "Start this plan".
- If another plan is active: "Start" offers "Pause {current} and switch" (uses Phase 0 lifecycle — no data loss).

### 2.3 Deep link

Support `?plan=<planId>` (follow the existing `?dm=<userId>` deep-link pattern) so plans can be shared in chat/QR. Opening it shows the plan detail sheet.

---

## Phase 3 — Plan calendar, missed days & calendar integration

Today the feature only ever shows "the next uncompleted day" — the plan is invisible as a whole. This phase makes the plan a navigable, graphical object: see every day at a glance, revisit missed days without shame, and put the schedule on the user's real calendar.

### 3.1 Schedule modes

Migration: add to `reading_plan_enrollments`:

```sql
alter table public.reading_plan_enrollments
  add column if not exists schedule_mode text not null default 'flexible'
    check (schedule_mode in ('flexible', 'calendar'));
```

- **flexible** (default — current behavior): "today" = next uncompleted day. There are no missed days in this mode, only the gentle pace delta from Phase 0.4.
- **calendar**: day N is pinned to `started_at::date + (N-1)`. Past dates without a progress row are **missed days**. Group plans (Phase 6) always use calendar mode.
- Chooser at plan start ("Flexible — go at my own pace" / "Calendar — one day per date"), switchable later from the card menu.

Add to `readingPlans.js` (+ tests): `dateForDay(enrollment, day)`, `dayForDate(enrollment, date)`, and `getMissedDays(enrollment, completedDays, now)` (calendar mode only; returns day numbers with dates).

### 3.2 PlanCalendar — the full-plan view

New `src/components/reading/PlanCalendar.jsx` (+ CSS), opened from the card menu ("View full plan") and from the completion screen:

- Calendar mode → a real month grid with prev/next month navigation (reuse the visual patterns of the existing `Calendar.jsx`); flexible mode → a numbered day grid (Day 1…N, chunked by week rows).
- Cell states: **completed** (filled, check), **missed** (amber outline), **skipped** (dash — see 3.3), **today** (ring), **future** (muted). Header shows "18 of 22 days read this month".
- Tapping any cell opens a day sheet: date, that day's readings (`getPlanReadings`), and actions — **Read this day** (opens `DailyReading` for that day), **Mark done**, **Skip**.
- `DailyReading` (Phase 1) takes an explicit `day` prop so any day — past or ahead — is readable, not just `currentDay`. Reading ahead is allowed and just fills future cells.

### 3.3 Missed-day recovery (never a guilt trip)

- Card, calendar mode, missed > 0: quiet banner "2 days to revisit" → opens PlanCalendar scrolled to the earliest missed day.
- Day-sheet options for a missed day:
  - **Read it now** — writes the normal progress row; plan % and totals update. Streak stays timestamp-based (`completed_at`), so back-filling is honest: it completes the plan but doesn't fabricate streak history.
  - **Skip** — migration: `alter table public.reading_plan_progress add column if not exists skipped boolean not null default false;`. A skipped row resolves the day (it's no longer "missed") without claiming it was read: rendered as a dash, excluded from streaks and chapter totals. Update `useReadingPlan` so skipped days count as "done" only for advancing `currentDay`.
  - **Catch me up** — one tap shifts `started_at` forward by the missed-day count so the schedule re-anchors to today (YouVersion-style). Confirm dialog shows the new end date. Missed days vanish because the mapping moved, not because history was rewritten.

### 3.4 Device calendar integration

- **Export to calendar** (card menu + plan detail sheet): generate an ICS via the existing `src/lib/calendarExport.js` — one all-day event per remaining plan day ("Day 12 · Matthew 5-7 · {plan name}"), description = readings + deep link (`?plan=<id>&day=12`). Calendar mode uses pinned dates; flexible mode projects forward from today at one day per date. Include a `VALARM` at `reminder_time` when set (Phase 4).
- **(Optional second step) Live subscription feed**: edge function `reading-plan-ics` serving a per-user tokenized `webcal://` feed (add a `calendar_token uuid default gen_random_uuid()` column to the enrollment) so Google/Apple Calendar stays in sync after "Catch me up" shifts — static exports go stale. Ship the static export first; add the feed only if users ask.

### 3.5 Week strip on the card

Add a 7-dot strip for the last 7 calendar days above the progress bar: filled = read, dash = skipped, hollow = nothing. Glanceable rhythm at habit-tracker scale; the Phase 7 heatmap is the long-range version of the same idea.

---

## Phase 4 — Habit engine: reminders, streaks, milestones

### 4.1 Daily reminder push

- Card/settings row: "Remind me daily at [time]" → saves `reminder_time` + `timezone` (from `Intl.DateTimeFormat().resolvedOptions().timeZone`) on the enrollment; prompts for push permission via existing `src/lib/push.js` if needed.
- New edge function `reading-plan-reminders` (mirror `send-push` invocation patterns) scheduled via Supabase cron (`pg_cron` + `pg_net`, or a scheduled edge function — match however existing scheduled jobs are done; if none exist, use Supabase's native cron for edge functions, hourly):
  - Each run: select active enrollments where local time (from `timezone`) matches `reminder_time`'s hour and **no progress row today** (in the user's tz). Send push: title "Day {n} · {plan name}", body = today's reading labels ("Matthew 5-7 · ~10 min"), deep link opens the app to the reader.
  - Never send if today is already done. One per day max (track `last_reminded_on date` column on the enrollment; add in this phase's migration).

### 4.2 Streak upgrades (kind, not punishing)

In `readingPlans.js` (+ tests):
- **Grace day**: extend `computeStreak` so a single missed day doesn't reset the streak if the surrounding days are complete, at most once per 7 days (`computeStreak(completions, { graceDays: 1 })`). Show "Grace day used 🕊️" subtly when it kicks in.
- **Best streak**: also return `{ current, best }`; show "Best: {n}" in the card tooltip/stats.

### 4.3 Milestones

Pure client-side detection on `markDayDone` (no new tables): completions crossing 7 / 30 / 100 days total, streaks of 7 / 30 / 100, plan 25/50/75/100%. Show a celebration toast on the completion screen ("🔥 30-day streak!"). If the discipleship growth-milestone system (`20260703020000_discipleship_growth_milestones.sql`) has a matching milestone type, also record it there — check that migration and reuse rather than duplicating.

---

## Phase 5 — Reflection + AI companion

### 5.1 Daily reflection note

- Migration: `reading_plan_reflections` — `id uuid pk`, `user_id`, `plan_id`, `day int`, `content text`, `shared boolean default false`, `created_at`; unique `(user_id, plan_id, day)`; RLS user-owned, plus a select policy for shared reflections scoped to group members (Phase 6 — write the policy now, gated on the groups table existing, or add it in Phase 6's migration).
- Completion screen gains an optional one-line prompt: "What stood out to you today?" — free text, saved on blur. Viewable later in a simple journal list ("My reflections") reachable from the card menu.
- If the fellowship shared journal supports external entries cleanly, offer "Share to journal"; otherwise skip — do not force integration.

### 5.2 AI reflection questions

- Reuse the existing insights edge function pattern (`fetchInsights` in `BibleLookup.jsx`): after finishing the day's last chapter, "Reflect deeper" button fetches 3 short reflection questions for the day's passage text (already fetched for the reader — send it, don't re-fetch). Cache per `(planId, day)` in localStorage so re-opens are free.
- Keep it opt-in per tap (no auto-spend on every reader open).

### 5.3 Book intro moments

When a day's reading starts a new book (`getPlanReadings` chunk with `startChapter === 1` and the previous day ended a different book), show a one-time interstitial in the reader: book name, 2-sentence intro (static map in `src/lib/bookIntros.js`, all 66 books), and — where a BibleProject overview video exists (reuse the Studies `youtube-proxy` mapping) — an inline "Watch the {book} overview (5 min)" embed. This turns the dreaded Leviticus wall into a moment.

---

## Phase 6 — Read together (groups)

The killer differentiator for a fellowship app: plans as a shared journey, not a solo grind.

### 6.1 Migration: `reading_plan_groups`

```sql
create table public.reading_plan_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,           -- match existing org FK/RLS pattern
  plan_id text not null,
  name text not null,
  created_by uuid not null references public.profiles(id),
  starts_on date not null,                 -- date-anchored: everyone reads the same day
  created_at timestamptz not null default now()
);
create table public.reading_plan_group_members (
  group_id uuid references public.reading_plan_groups(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
```

Org-scoped RLS matching chat/fellowship policies (`get_my_organization_id()`). Add `group_id uuid null` to `reading_plan_enrollments`. Group enrollments always use `schedule_mode = 'calendar'` (Phase 3) anchored to `starts_on`: today's reading = `current_date - starts_on + 1` (clamped) — the PlanCalendar, missed-day recovery, and week strip from Phase 3 all work for groups unchanged. `useReadingPlan` branches on `group_id` for `currentDay`; individual check-offs still write to `reading_plan_progress` per user.

### 6.2 Group UX

- PlanBrowser gains a "Start as a group" option (creates group + posts an invite card into a chosen chat channel via the existing chat message insert — a message with the `?plan=`/`?group=` deep link).
- Group card variant shows member avatars with subtle done/not-done state for **today only** (never historical shaming), e.g. "4 of 7 have read today".
- Day discussion: reuse Phase 5 reflections with `shared = true` scoped to the group — a lightweight per-day thread ("3 reflections from your group") visible on the completion screen and the group card. No new realtime infra needed; simple fetch on open.

### 6.3 Discipleship tie-in

The Discipleship partner view already reads enrollment/progress. Add a one-tap "Invite {partner} to read this plan with you" that creates a 2-person group. Zero new concepts — a group of two.

---

## Phase 7 — Stats, history, polish

- `src/components/reading/ReadingStats.jsx`, from the card menu: GitHub-style completion heatmap for the last 12 weeks (pure CSS grid from `completed_at` dates), totals (chapters read, books finished — derivable from progress + plan data in `readingPlans.js`, add `getBooksCompleted` + tests), current/best streak.
- **Books-of-the-Bible progress map**: 66-cell grid, cells fill as chapters are completed across *all* plans ever — long-term collectible feeling.
- A11y pass: reader is keyboard navigable, `aria-live` on completion announcements, respects `prefers-reduced-motion` for confetti/rings.
- Empty-state polish: the not-enrolled card rotates one gentle line ("The Gospels in 30 days — about 10 minutes a day").

---

## Verification checklist (every phase)

1. `npm test` and `npm run lint` pass.
2. New tables: confirm RLS by querying as anon (should return zero rows).
3. Existing flows still work: enroll → chips open BibleLookup → mark done → streak increments; Discipleship partner view still shows progress.
4. `computeStreak`, `getPaceStatus`, and any new pure functions have unit tests covering timezone-ish edges (completion at 11:59pm, yesterday-anchor, grace day).
