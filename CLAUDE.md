# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Miqra Kodesh

Multi-tenant church small-groups portal (chat, calendar, reading plans, discipleship, Q&A, leader tools). React 19 + Vite SPA in plain JavaScript/JSX (no TypeScript), Supabase backend (auth, Postgres + RLS, realtime, storage, edge functions), deployed to Vercel as a static SPA with a PWA service worker.

## Working preferences

**Don't spend a session visually verifying UI changes** — no driving a browser, no screenshots, no dev server just to look at a layout. The maintainer prefers to eyeball UI himself; skipping it saves real time and tokens.

Still run `npm run lint` and the relevant tests, and still cover behaviour with tests. When a change has a visual dimension that tests can't reach (spacing, breakpoints, colour, overflow), just say plainly what to look at and where — e.g. "check the breadcrumb row on a narrow phone; the `margin-left: auto` push is the bit most likely to want tweaking." Match existing CSS conventions in the sibling `.css` file rather than inventing new patterns, since nobody is checking the result mid-task.

This applies to visual confirmation only — it is not licence to skip verification you *can* do headlessly (tests, lint, a real query against a scratch Postgres, etc.).

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

### Immersive 3D scenes (`src/components/scene/`)

`/scene/:slug` drops the user into a walkable first-person reconstruction of a biblical site — currently one, Herod's Temple, hung on the atlas place `jerusalem`. Four modules, each with a deliberate job:

- **`templeDimensions.js`** — every measurement, in one place. Both the geometry and the collision model import from it, so what is drawn and what is solid cannot drift apart. Change a number here and both follow.
- **`buildSecondTemple.js`** — the geometry, assembled from three.js primitives and canvas-drawn textures. No downloaded models or images. Takes `THREE` as an argument so it stays importable (and testable) in jsdom.
- **`templeNavigation.js`** — where you can walk. No raycasting: `floorAt` resolves any point to one of three floor heights or a ramp, and a step rule blocks any move that changes height by more than a stride, which handles every edge and drop without enumerating wall geometry. Only same-height barriers are listed explicitly. Pure functions, so walking is fully testable headlessly — which matters, because a corner you can clip through never shows up in a screenshot.
- **`Scene.jsx`** — the route: render loop, look controls, walking, tap-to-walk, touch thumbstick. Dynamically imports three.js, so it lands in its own ~185KB-gzipped chunk that only this route fetches.

`src/lib/scenes.js` is the manifest (vantages, hotspots, scripture refs), React- and three.js-free so the atlas sheet and wiki entry can offer "Step inside" without pulling in the 3D chunk.

Things to keep intact: the three floor heights (`LEVEL`) are what the manifest's Y coordinates are measured against — move one and the vantages move with it, and a test asserts they agree; the barriers that stop a walker (the soreg, the rail, the sanctuary door) carry prose and scripture because being refused entry *is* the content, not a limitation; the no-WebGL branch is a real user path and renders every hotspot and barrier as prose; hotspot labels and the walk marker are positioned by direct DOM writes in the render loop, never React state.

Mobile controls: drag to look, tap the ground to walk there, and a thumbstick that appears only under `@media (pointer: coarse)`. The stick is a sibling of the stage, not a child, so its drags are never also read as look-around.

### Theming (light / dark)

- **Every color comes from a token in the `:root` block of `src/index.css`.** Never hardcode a surface, text, border or status color in a component `.css` file or a JSX `style` prop — add or reuse a token. The token block defines the light palette; `[data-theme="dark"]` and a `prefers-color-scheme` media query redefine only what changes. The two dark blocks are kept byte-identical on purpose (an explicit choice must beat the OS setting), so edit the media-query one and mirror it.
- Mode is `system` (default) / `light` / `dark`, persisted to `localStorage` under `miqra_theme` by `src/lib/theme.js`. `system` deliberately stamps **no** `data-theme` attribute so the media query keeps following the OS live. An inline script in `index.html` resolves the theme before first paint — keep it in sync with `resolveTheme()`.
- `src/lib/branding.js` maps an org's `primary_color` onto the accent tokens. It writes inline styles on `<html>`, which outrank `[data-theme]` rules, so it must only ever touch brand-owned tokens — **never surfaces**. A brand color chosen against a white page is lightened via `ensureContrast()` before use on the dark theme.
- Translucent tints use `color-mix(in srgb, var(--token) N%, transparent)` rather than a frozen `rgba()`, so they track the theme's version of that color.
- Deliberate exceptions (dark in both themes, and excluded from the token rule): `reels/CharacterReels.css`, `qa/QAPresent.css`, `atlas/Atlas.css` + the atlas map chrome, `scene/Scene.css`, `ui/Select.css`'s opt-in `variant="dark"`, modal scrims, image-lightbox chrome, QR quiet zones, third-party brand colors (Google/Facebook/Discord), Leaflet marker colors (SVG attributes can't resolve `var()`), and the `.wsp-` study-pack print sheet.

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
