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

`/scene/:slug` drops the user into a walkable first-person reconstruction of a biblical site. Four exist: `second-temple` (Jerusalem), `caesarea`, `capernaum`, and `tabernacle` (Sinai). All geometry is procedural — three.js primitives and shader maths, no downloaded models or images.

The Tabernacle is the odd one out and its tests reflect it: Exodus 25-40 gives the building as a specification in cubits, so `buildTabernacle.test.js` checks the geometry **against the text** — a court of a hundred cubits by fifty, a Most Holy Place that is a ten-cubit cube, forty-eight boards in ninety-six silver sockets. Those are not matters of taste, and two of them were wrong until the tests said so.

**Shared spine.** `sceneModules.js` maps a slug to its navigation module and a dynamic builder import, so `Scene.jsx` knows nothing about which site it is showing — adding a scene is one row. `sceneNavigation.js` holds every movement rule: substepping (so a long frame cannot tunnel through a wall), wall sliding, the step rule, and the tap-to-walk ray march. A scene supplies only `floorAt(x, z, fromHeight)` and `blockerAt(x, z, height)`.

Two ideas carry most of the collision model, and both matter when editing:

- **The step rule** refuses any move whose floor height changes by more than a stride. That one check handles walking off a raised court, off the side of a stair, off a roof and off the platform — with no wall geometry enumerated for any of it. Only barriers separating two points at the *same* height need listing explicitly.
- **`fromHeight` stacks surfaces.** A room and the roof over it share a ground plan, so "what is the floor here" has two answers and the right one is the one nearest the height the question is asked from. `blockerAt` takes a height for the same reason: a house wall is a wall in the lane and a floor on the roof.

**Per scene**, a `<site>Dimensions.js` holds every measurement (both the geometry and the collision import it, so what is drawn and what is solid cannot drift), a `<site>Navigation.js` supplies the two questions above, a `build<Site>.js` assembles the geometry and takes `THREE` as an argument so it stays importable in jsdom, and `src/lib/<site>Scene.js` is the manifest — vantages, hotspots, scripture refs — which is React- and three.js-free so the atlas sheet and wiki entry can offer "Step inside" without pulling in the 3D chunk.

Things to keep intact: the floor heights in each dimensions module are what that scene's manifest Y coordinates are measured against, and a test asserts they agree; the barriers that stop a walker carry prose and scripture, because being refused entry *is* the content (the soreg at the temple, the hole in the roof at Capernaum); the no-WebGL branch is a real user path and renders every hotspot and barrier as prose; hotspot labels and the walk marker are positioned by direct DOM writes in the render loop, never React state.

Because none of the 3D can be eyeballed in CI, the tests carry more weight than usual: they build the real scene graph in jsdom and assert no NaN, populated instance matrices, determinism, clean disposal, that geometry exists wherever collision says "wall", and — most importantly — that the routes a visitor is meant to walk actually complete end to end.

Mobile controls: drag to look, tap the ground to walk there, and a thumbstick that appears only under `@media (pointer: coarse)`. The stick is a sibling of the stage, not a child, so its drags are never also read as look-around.

**Present-day links (`src/lib/googleMaps.js`).** Google's Maps URLs scheme is key-free and unbilled, so "what is there now" is a plain link, not an SDK. Three callers: the atlas detail sheet and the wiki place entry (satellite view from `la`/`lo`, available for every place), and a scene vantage, which additionally converts scene metres to lat/lng and scene yaw to a compass heading so Street View opens on the same standpoint facing the same way.

That transform needs two numbers per scene — `geo.bearing` (compass heading of −Z, the direction of yaw 0) and `geo.xAxis` (heading of +X) — because the scenes genuinely disagree about handedness: the temple has +X north and +Z east, Capernaum has +X east and +Z north. One number cannot tell those apart, and getting it wrong mirrors the view without breaking anything visibly.

Scene vantages default to a **satellite** link, because `viewpoint` alone means "nearest panorama" and nearest can be a road across a field. A vantage upgrades to Street View by adding `now: { streetView: true }` or, better, `now: { panoId: '...' }` once someone has checked the imagery by hand — the coverage cannot be detected without the paid API, so it is curated, not discovered.

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
