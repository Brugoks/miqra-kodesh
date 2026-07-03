# Plan: Admin "Pulse" — Activity Metrics That Answer "What's Working?"

Handoff document for an AI coding agent (Codex / Gemini / Claude). Self-contained;
follow phases in order. Each phase is shippable on its own.

## Problem

The Admin → Activity Metrics tab (`src/components/AdminPanel.jsx`, backed by the
`admin_activity_metrics` RPC in
`supabase/migrations/20260624007000_fix_admin_activity_metrics_rollup.sql`) only counts
**content-creation events** (chat messages, Q&A posts, prayers, API calls). The admin
cannot answer:

1. **Who is actually using the app?** Readers/lurkers are invisible — someone who opens
   the app daily but never posts registers zero activity.
2. **Which modules are working?** No per-module adoption (Studies, Bible Lookup,
   Discipleship, Calendar, Chat, Q&A, Fellowship…), no trend vs the previous period.
3. **What happened lately?** No recent-activity feed, no last-seen per member, no
   "these members are drifting away" signal.

Goal: the admin logs in and, in under 10 seconds, sees **DAU/WAU/MAU, which modules are
hot or dead, a recent-activity feed, and who is disengaging.**

## Existing patterns to reuse (do not reinvent)

- `admin_activity_metrics(target_org, window_days)` — security-definer RPC, admin/developer
  gate via `public.is_admin()` / `public.is_developer()`, org-scope check via
  `profile_organizations`. **Copy this exact auth preamble** for any new RPC.
- `api_usage_events` table — external API telemetry (provider, feature, units, user_id,
  organization_id, created_at). Already feeds the current RPC.
- `discipleship_org_overview` RPC (`20260703030000_discipleship_pathway.sql`) — good
  example of returning one structured `jsonb` blob for a dashboard.
- Weekly prune crons exist (`prune-telemetry`, `prune-ai-response-cache`) — copy the
  `cron.schedule` + `do $$ unschedule if exists $$` pattern from
  `20260703130000_ai_response_cache.sql`.
- Migrations: `supabase/migrations/YYYYMMDDHHMMSS_name.sql`, applied with
  `supabase db push --linked --include-all`.
- Tests: Vitest (`npx vitest run`), lint `npx eslint src`.

## Phase 1 — Capture presence (the missing data)

Content events already exist. What's missing is **page/module visits**. Add a tiny,
free-tier-friendly beacon: **one row per user × module × day**, incremented in place.
No raw event stream, no PII, no content.

### 1a. Migration `supabase/migrations/<timestamp>_app_activity_daily.sql`

```sql
create table public.app_activity_daily (
  user_id         uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  feature         text not null,          -- route key: 'dashboard', 'studies', 'chat', …
  day             date not null default current_date,
  visits          int  not null default 1,
  primary key (user_id, organization_id, feature, day)
);

alter table public.app_activity_daily enable row level security;

-- Users write only their own rows.
create policy "users record own activity" on public.app_activity_daily
  for insert to authenticated with check (auth.uid() = user_id);
create policy "users bump own activity" on public.app_activity_daily
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- Reads happen only through the admin RPC (security definer) — no select policy needed,
-- but add one for developers if DevTools wants it: using (public.is_developer()).
```

Add an RPC so the client can do a single atomic upsert-increment:

```sql
create or replace function public.track_activity(p_org uuid, p_feature text)
returns void language sql security definer set search_path = public as $$
  insert into public.app_activity_daily (user_id, organization_id, feature)
  select auth.uid(), p_org, p_feature
  where auth.uid() is not null
    and exists (select 1 from public.profile_organizations
                where profile_id = auth.uid() and organization_id = p_org)
  on conflict (user_id, organization_id, feature, day)
  do update set visits = app_activity_daily.visits + 1;
$$;
grant execute on function public.track_activity(uuid, text) to authenticated;
```

Add a prune (180-day retention) to the weekly cron pattern described above.

### 1b. Client beacon `src/lib/activityBeacon.js`

- Export `trackActivity(orgId, featureKey)` that calls
  `supabase.rpc('track_activity', { p_org: orgId, p_feature: featureKey })`,
  fire-and-forget (`.catch(() => {})`).
- **Throttle:** keep an in-memory `Set` of `${orgId}:${featureKey}` already sent this
  session (plus a sessionStorage mirror); send each at most once per 30 minutes.
  This is the free-tier guardrail — a user clicking around costs ~10 RPC calls per
  session, total.
- Map routes → feature keys in one exported constant:
  `{'/': 'dashboard', '/studies': 'studies', '/chat': 'chat', '/qa': 'qa',
    '/discipleship': 'discipleship', '/calendar': 'calendar', '/fellowship': 'fellowship',
    '/sermons': 'sermons', '/feedback': 'feedback', '/forms': 'forms'}`.
- Skip tracking when the profile role is `developer` (avoid polluting metrics while
  testing). The role is available in `App.jsx` state (`actualUserRole`).

### 1c. Wire into `src/App.jsx`

There is already `useLocation()` imported (line ~54, currently bare). Add one effect:
on `location.pathname` or `organization?.id` change, look up the feature key and call
`trackActivity(organization.id, key)`. Guard: session + organization must exist.

Unit-test the throttle and route→key mapping in `src/lib/activityBeacon.test.js`.

## Phase 2 — RPC v2: one blob that answers the question

New migration creating `admin_activity_pulse(target_org uuid, window_days int default 30)`
returning `jsonb`. Copy the auth preamble from `admin_activity_metrics` verbatim.
Combine (a) `app_activity_daily` (presence) and (b) the existing content-event UNION
from `20260624007000_fix_admin_activity_metrics_rollup.sql` (keep its weights).

Return shape:

```jsonc
{
  "totals": {
    "dau": 12, "wau": 48, "mau": 103,          // distinct users from app_activity_daily
    "members": 120,                              // org member count
    "newMembers": 4,                             // profiles joined in window (profile_organizations or profiles.created_at)
    "contentEvents": 342, "prevContentEvents": 280   // this window vs previous window (for delta arrows)
  },
  "daily": [ { "day": "2026-07-01", "activeUsers": 14, "events": 40 }, … ],   // last N days, for sparkline
  "modules": [                                    // one row per feature key
    { "feature": "chat", "users": 33, "visits": 410, "prevUsers": 30 },        // include content features merged in ('q-and-a', 'prayer', …)
    …
  ],
  "recent": [                                     // last 20 content events, newest first — METADATA ONLY, no bodies
    { "kind": "qa:question", "userName": "Sarah C.", "at": "2026-07-03T14:02:00Z" }, …
  ],
  "powerUsers": [ { "userId": "…", "name": "…", "score": 87, "lastSeen": "2026-07-03" }, … ],  // top 10 weighted
  "quiet": [ { "userId": "…", "name": "…", "lastSeen": "2026-06-10" }, … ]     // members with NO presence rows in 14 days, oldest first, cap 25
}
```

Implementation notes:
- `lastSeen` = `max(day)` from `app_activity_daily` per user (fall back to latest
  content event).
- "prev" values: run the same aggregate over `[now - 2*window, now - window)`.
- Never return message/prayer/question text — names and kinds only (this matches the
  privacy stance of the existing RPC and `discipleship_org_overview`).
- Names via `coalesce(full_name, email)` from `profiles`.
- Keep the old `admin_activity_metrics` RPC untouched (other code may call it); the new
  tab calls `admin_activity_pulse`.

## Phase 3 — UI: rebuild the tab as "Pulse"

In `src/components/AdminPanel.jsx` (Activity Metrics section starts ~line 742; loader
~line 204). Replace the section content with, top to bottom:

1. **Header row**: window selector (7 / 30 / 90 days) + Refresh button (existing pattern).
2. **Stat tiles** (reuse existing tile styles): Today (DAU) · This week (WAU) ·
   This month (MAU) · New members — each with a small delta arrow vs previous window
   where available.
3. **Engagement sparkline**: `daily` as a simple SVG bar/line (no chart library — see
   the hand-rolled SVG pattern used elsewhere in DevTools if present, else ~30 lines of
   inline SVG rects).
4. **Module adoption list** ("What's working"): one row per module — name, unique users,
   horizontal bar scaled to max, and ▲/▼ delta vs previous window. Sort by users desc.
   Dead modules (0 users) render dimmed at the bottom — that IS the signal.
5. **Recent activity feed**: `recent` — icon per kind, "Sarah C. asked a question · 2h ago".
6. **Two columns**: Power users (name, score, last seen) · **Drifting away** (`quiet`:
   name + last seen, with a "Message" button linking `/chat?dm=<userId>` — same deep-link
   used by `src/components/Discipleship.jsx` `openDm`).

Empty states: if `app_activity_daily` has no rows yet (first deploy), show a friendly
note that presence data starts accumulating now — content metrics still render.

## Phase 4 (optional) — Weekly pulse email

Reuse the transactional email stack (`supabase/functions/send-email`, settings row in
`app_email_settings`, cron → edge function pattern from
`20260703010000_discipleship_relationships.sql`): Monday-morning email to org admins
with the four totals, top 3 / bottom 3 modules, and count of drifting members.
Email type key: `admin_weekly_pulse` (insert with `on conflict do nothing`, sort_order 57).

## Guardrails (free-tier + privacy)

- Beacon: max 1 RPC per user/module/30 min; skip developers; fire-and-forget.
- No new polling loops, no realtime subscriptions, no per-keystroke calls.
- RPCs are the only read path; raw tables have no member-facing select policies.
- Never expose content bodies in metrics — kinds, counts, names, timestamps only.
- Retention: prune `app_activity_daily` at 180 days via weekly cron.

## Verification checklist

1. `npx vitest run` and `npx eslint src` pass; `npm run build` succeeds.
2. `supabase db push --linked --include-all` applies cleanly.
3. As a normal user: browse 3 pages → `select * from app_activity_daily` (via
   `supabase db query --linked …`) shows ≤3 rows for that user today; revisiting a page
   within 30 min does NOT bump `visits`.
4. As admin: Pulse tab renders tiles, sparkline, modules, feed, quiet list; switching
   the window re-queries.
5. As non-admin: `admin_activity_pulse` RPC raises (copy the auth test pattern —
   the RPC must reject before touching data).
6. Confirm no developer-role rows appear in metrics.
