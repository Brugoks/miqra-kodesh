# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Miqra Kodesh

Multi-tenant church small-groups portal (chat, calendar, reading plans, discipleship, Q&A, leader tools). React 19 + Vite SPA in plain JavaScript/JSX (no TypeScript), Supabase backend (auth, Postgres + RLS, realtime, storage, edge functions), deployed to Vercel as a static SPA with a PWA service worker.

## Commands

```sh
npm run dev          # Vite dev server
npm run build        # production build to dist/
npm run lint         # ESLint (flat config, eslint.config.js)
npm test             # vitest run (all tests)
npm test -- src/lib/roles.test.js   # single test file
npm run test:watch   # vitest watch mode
```

Tests are colocated with source (`*.test.js` / `*.test.jsx`), run in jsdom with globals enabled, setup in `src/test/setup.js` (config lives in `vite.config.js`, not a separate vitest config).

Local dev works without Supabase credentials: `src/lib/supabaseClient.js` exports `hasSupabaseConfig`, and components degrade (skip auth, use localStorage) when it is false.

### Supabase CLI (linked project)

```sh
supabase db query --linked "SELECT ..."   # run SQL as a privileged role (bypasses anon RLS)
supabase migration list --linked          # check which migrations are applied
supabase db push --linked                 # apply new migrations
supabase functions deploy <name>          # deploy an edge function
```

## Architecture

### Frontend shell (`src/App.jsx`)

`App.jsx` owns all session/identity state — Supabase session, profile, role, active organization, org membership list — and passes it down as props (no global state library). Route components under `src/components/` fetch their own data directly from Supabase, scoped by the `activeOrgId` prop. Feature areas with multiple files get a subdirectory (`chat/`, `fellowship/`, `reading/`) with hooks in colocated `use*.js` files or a `hooks/` folder. Each component has a sibling `.css` file; theming is CSS custom properties (`--accent-gold`, `--bg-secondary`, …) that `App.jsx` rewrites from the active org's brand colors, so the whole app rebrands per organization.

Roles: `student` / `leader` / `admin` / `developer`, checked via helpers in `src/lib/roles.js`. Developers can impersonate lower roles via a localStorage override (`miqra_dev_role_override`); `actualUserRole` vs `userRole` in App.jsx reflects this split.

### Multi-tenancy (the thing most likely to bite you)

- `organizations` table; users belong via `profile_organizations`; `profiles` carries both `active_organization_id` (what the app shows now, also drives RLS via `get_my_organization_id()`) and `primary_organization_id` (user's preferred default).
- Nearly every table has an `organization_id` and RLS policies keyed to the caller's active org — new tables must follow this pattern (see the `20260612*` isolation migrations).
- Signup: the `handle_new_user` trigger on `auth.users` assigns the org from the `invite_code` in signup metadata, defaulting to Charleston Baptist (the seeded default org). **This trigger fires on INSERT OR UPDATE, and Supabase updates `auth.users` on every sign-in** — the UPDATE path must remain identity-fields-only or users get bounced back to the default org (regression fixed in `20260703000000_fix_org_reassignment_on_signin.sql`).
- On first load per session, App.jsx "snaps" the active org to the primary org exactly once (`didPrimaryOrgSnap` ref) — later `onAuthStateChange` re-fires (focus, token refresh) must not override an org the user switched to mid-session.

### Service worker / deploys (`public/sw.js`, `src/main.jsx`, `vercel.json`)

- Navigations are network-first with the cached app shell as offline fallback; hashed `/assets/*` are cache-first; other same-origin statics are stale-while-revalidate. Cross-origin (Supabase) is never intercepted.
- **Bump `CACHE_VERSION` in `sw.js` whenever caching logic changes** — activation deletes old caches and is the recovery path for clients holding bad entries.
- The Vercel SPA rewrite deliberately excludes `/assets/` so requests for previous-deploy chunks 404 instead of returning index.html; the SW refuses to cache HTML-typed responses under asset URLs; `main.jsx` reloads once on `vite:preloadError`. This trio prevents a cache-poisoning bug that blanked the app after deploys — keep all three intact.

### Backend (`supabase/`)

- `supabase/migrations/` — 130+ timestamped SQL migrations; schema changes are made by adding a new migration, never editing old ones. Business logic lives heavily in Postgres: triggers, `security definer` RPCs (e.g. `admin_move_user_to_organization`, `chat_unread_counts`), and views.
- `supabase/functions/` — ~25 Deno edge functions, mostly thin authenticated proxies that hold API secrets server-side (ESV/Bible text, image generation via Cloudflare Workers AI, Giphy, YouTube, LLM providers, link previews) plus jobs (push notifications, email, reminders, storage GC). Secrets are set with `supabase secrets set`; see `supabase/functions/README.md`.
- `scripts/` — one-off Node seeders (embeddings, cross-references, backfills).

### Mobile

Layout breakpoints: ≤1024px switches to a fixed bottom tab bar, ≤640px is the general phone layout, and chat uses its own ≤760px breakpoint (`Chat.css`) with a two-screen flow (channel list ↔ conversation via `.mobile-chat-open`). The chat page drops the page gutters on phones via `layout-main--chat`. Safe-area insets (`env(safe-area-inset-*)`) are used throughout for PWA standalone mode.

## Accessing Feedback Tickets

Feedback data lives in the linked Supabase project. The anon key cannot read tickets (RLS requires authentication), so use the **Supabase CLI** with the `--linked` flag, which connects as a privileged role.

### Query tickets

```sh
supabase db query --linked "SELECT * FROM feedback_tickets ORDER BY created_at DESC;"
```

### Query the board view (includes vote/comment counts and rank scores)

```sh
supabase db query --linked "SELECT * FROM feedback_board ORDER BY rank_score DESC;"
```

### Query comments on a ticket

```sh
supabase db query --linked "SELECT * FROM feedback_ticket_comments WHERE ticket_id = '<TICKET_ID>' ORDER BY created_at;"
```

### Query activity events on a ticket

```sh
supabase db query --linked "SELECT * FROM feedback_ticket_events WHERE ticket_id = '<TICKET_ID>' ORDER BY created_at;"
```

### List and download screenshot attachments

```sh
supabase storage ls ss:///feedback-screenshots/ --recursive --experimental --linked
supabase storage cp --experimental --linked ss:///feedback-screenshots/<path> /tmp/screenshot.png
```

### Key tables and views

| Name | Type | Description |
|------|------|-------------|
| `feedback_tickets` | table | All ticket data (title, description, status, priority, screenshots, etc.) |
| `feedback_board` | view | Tickets enriched with vote count, comment count, rank score, and author name |
| `feedback_ticket_votes` | table | One row per user-vote on a ticket |
| `feedback_ticket_comments` | table | Comment threads on tickets (supports @mentions) |
| `feedback_ticket_events` | table | Activity log (status changes, assignments, edits, etc.) |
| `feedback-screenshots` | storage bucket | Uploaded screenshot attachments |
