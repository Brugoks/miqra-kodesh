# Q&R Module — Next-Level Plan

Implementation plan for the Questions & Responses module (`src/components/QA.jsx`).
Written to be executed by an AI coding agent (Gemini / Codex) with no prior context
on this repo. Read **Repo Conventions & Gotchas** before writing any code.

**Vision:** today Q&R is an org message board with upvotes. Take it to: *the place
where hard questions reliably get trustworthy answers* — a pastoral trust layer,
real discovery (search / tags / semantic similarity), engagement loops (follow,
realtime, nudges), and AI study depth — reusing infrastructure this app already has
(pgvector + HF embeddings, Gemini proxy with caching, push triggers, pg_cron).

Execute phases in order. Each phase is independently shippable. Do not start a
phase until the previous one passes verification.

---

## Current state (verified 2026-07-03)

- **UI**: `src/components/QA.jsx` (~985 lines) + `QA.css`. Two-pane board: question
  list (sorted by votes desc, then newest) and a detail pane with answers, votes,
  anonymous toggle, AI artwork generation (hf-proxy prompt → image-proxy FLUX →
  uploaded to the `prayer-images` storage bucket — yes, that bucket name is
  historical debt, leave it), edit/delete for author or admin.
- **Schema**: `supabase/migrations/20260613020000_qa_section.sql` — `qa_questions`,
  `qa_answers`, `qa_question_votes`, `qa_answer_votes`, all org-scoped with RLS.
  `20260618012000_add_qa_image.sql` added `image_path`.
- **Push**: `20260627000000_qa_answer_push_notification.sql` — pg_net trigger
  notifies the *question author only* when someone answers.
- **Scripture references in question/answer text are already auto-linked** by the
  global DOM linkifier (`src/lib/scriptureLinker.js` via `ScriptureLinker.jsx`,
  mounted app-wide). Clicking dispatches `scripture:open`, which opens the Bible
  Lookup panel. Do NOT add another linkifier; do verify it still works after your
  render changes (it skips `[data-no-scripture]` subtrees if you ever need opt-out).

### Known defects to fix (Phase 0)

1. **Anonymous identity leak.** Anonymous posts still return `author_id` and
   `author_name` in the row payload to every org member (display-only masking).
   Anyone opening devtools sees who asked. This defeats the feature's promise.
2. **Unbounded loads.** `loadAll()` fetches every question, every answer, and every
   vote row visible to the user with no `limit`/pagination. Fine at 50 rows, not at
   5,000.
3. **`getRandomSeed()`/`Date.now()` patterns are fine here** (browser code), listed
   only so you don't "fix" them.

---

## Phase 0 — Correctness & privacy foundation

### 0.1 Mask anonymous authors at the API boundary

New migration (follow naming: `supabase/migrations/<YYYYMMDDHHMMSS>_qa_anonymous_masking.sql`):

- Create SECURITY DEFINER RPC `qa_board(org_id uuid)` returning jsonb (or two
  RPCs: `qa_board_questions`, `qa_board_answers`) that returns all questions +
  answers for the org with `author_id` and `author_name` **nulled out** when
  `is_anonymous = true`, UNLESS the caller is the author (`auth.uid() = author_id`)
  or `public.is_admin()`. Include a boolean `is_mine` per row so the client can
  render Edit/Delete without needing `author_id`.
  - Guard inside the function: caller must be a member of `org_id`
    (`exists (select 1 from profile_organizations where profile_id = auth.uid() and organization_id = org_id)`)
    or `public.is_developer()`. Raise `42501` otherwise (see the guard style in
    `20260703030000_discipleship_pathway.sql` → `discipleship_org_overview`).
- Keep existing table RLS as-is (writes still go directly to the tables).
- Client: replace the two table selects in `loadAll()` with the RPC; adapt
  ownership checks from `q.author_id === userId` to `q.is_mine`.
  `renderAuthor` stays the same (name is already null → "Anonymous").

**Acceptance:** as a non-admin, the network response for another member's anonymous
question contains no `author_id`/`author_name`; the author still sees their own
Edit/Delete buttons; admins still see true authorship.

### 0.2 Pagination

- Questions: load newest 50 with `.range(0, 49)`; "Load more" button appends the
  next page. Keep vote-count sorting *within the loaded set* (server-side sort by
  votes requires the RPC — acceptable to sort loaded pages client-side for now).
- Answers/votes: fetch only for loaded question ids (`.in('question_id', ids)`).

**Acceptance:** initial load issues no unbounded queries; "Load more" works; vote
toggling still updates optimistically.

---

## Phase 1 — Trust layer (accepted answers + leader responses)

The single biggest upgrade: a question can be *resolved*, and answers from leaders
are visibly trustworthy.

### 1.1 Schema (one migration)

```sql
alter table public.qa_answers
  add column if not exists is_accepted boolean not null default false,
  add column if not exists author_role text; -- snapshot: 'leader' | 'admin' | null

alter table public.qa_questions
  add column if not exists resolved_at timestamptz;
```

- `author_role`: set by the client at insert time from the poster's role — snapshot
  on write, do not join live (roles change; the badge should reflect who they were
  when they answered). Only store it when the role is a leader role AND the answer
  is **not** anonymous (an anonymous leader answer must not carry the badge — it
  would de-anonymize them in a small org).
  Leader roles: `developer`, `admin`, `leader`, `student_leader`, `parent_leader`
  (see `LEADER_ROLES` in `src/lib/roles.js`; use `isLeaderRole(userRole)`).
- Accepting: UPDATE policy already lets authors edit their own answers — that is
  NOT enough. Add a targeted RLS policy or (simpler, safer) a SECURITY DEFINER RPC
  `qa_accept_answer(answer_id uuid, accept boolean)` that verifies
  `auth.uid()` is the **question's** author or `is_admin()`, sets
  `is_accepted` on that answer, clears it on the question's other answers
  (single accepted answer per question), and sets/clears `qa_questions.resolved_at`.

### 1.2 UI

- Accepted answer: pinned to the top of the answer list regardless of votes, green
  border-left + `✓ Accepted` chip. Question rows in the list get a subtle `✓`
  when resolved. Question author (and admins) see an "Accept" button on each answer.
- Leader badge: when `author_role` is set, render a small chip next to the author
  ("Leader" — blue, matching `.disc-role.discipler` colors in `Discipleship.css`).
- New sort/filter awareness: resolved questions sort below open ones within equal
  votes (tweak `sortedQuestions`).
- Push: extend the existing answer-push trigger's body (or leave it — acceptable)
  and add a small trigger `qa_accepted_push`: when an answer becomes accepted,
  notify the *answer author* ("Your answer was accepted ✓"). Copy the pg_net +
  `push_hook_secret` vault pattern from `20260627000000_qa_answer_push_notification.sql`
  verbatim (URL is hardcoded to the project ref in that file — keep that style).

**Acceptance:** author accepts an answer → it pins with the chip, question shows
resolved, answer author receives a push; accepting a different answer un-accepts
the first; non-authors/non-admins get an RLS/RPC error if they try.

---

## Phase 2 — Discovery (tags, search, semantic similarity)

### 2.1 Tags

```sql
alter table public.qa_questions
  add column if not exists tag text
    check (tag in ('bible','faith-basics','relationships','church-life','hard-questions','other'));
```

- Ask modal: a required chip-select of the six tags (labels: Bible, Faith Basics,
  Relationships, Church Life, Hard Questions, Other).
- Board: filter chips above the list (All + six tags), combinable with the sort
  tabs below. Existing questions have `tag = null` → show under All only.

### 2.2 Sort tabs + text search

- Tabs: **Top** (votes desc — current behavior), **New**, **Unanswered**
  (no answers), **Open** (not resolved), **Mine** (my questions or ones I answered).
- Search input filtering loaded questions client-side on title+body
  (server-side full-text is overkill at this scale; the feedback module's
  `to_tsvector` pattern exists in `20260610014000_feedback_tickets.sql` if the org
  outgrows client filtering).

### 2.3 Semantic "similar questions" (the next-level piece)

Reuse the existing embedding pipeline end-to-end — this repo already has pgvector
(`vector(384)`), the `BAAI/bge-small-en-v1.5` model through `hf-proxy`
(`task: 'embed'`, see `src/components/SemanticSearch.jsx` lines ~28-45), and the
`search_verses` RPC as a reference implementation
(`supabase/migrations/20260613000000_semantic_bible_search.sql`).

- Migration: `alter table qa_questions add column embedding vector(384);`
  plus RPC `match_qa_questions(org_id uuid, query_embedding vector(384), match_count int default 5)`
  returning id, title, similarity — filtered to the org and excluding the question
  itself. Add an ivfflat or hnsw index only if row counts warrant (skip initially;
  document that).
- Write path: after a question insert/edit, the client invokes `hf-proxy`
  `{ task: 'embed', text: title + ' ' + body }` and updates the row's embedding.
  Non-blocking, best-effort (wrap in try/catch; a missing embedding just means the
  question won't appear in similarity results).
- **Ask-time dedupe:** in the Ask modal, debounce (600ms) the title field; once >
  15 chars, embed and call `match_qa_questions`; render up to 3 "Has this been
  asked?" rows with vote/answer counts. Clicking one closes the modal and opens
  that question. This single feature kills duplicate questions and shows off the
  whole system.
- Detail pane: "Related questions" section (same RPC, using the open question's
  stored embedding — no HF call needed).
- Backfill: one-off script `scripts/seed-qa-embeddings.js` following the structure
  of `scripts/seed-verse-embeddings.js` (reads `.env` for `VITE_SUPABASE_URL` +
  `SUPABASE_SERVICE_ROLE_KEY`; calls HF via the same router the proxy uses, or
  invokes `hf-proxy` per row). Idempotent: only rows with null embedding.

**Acceptance:** typing a title similar to an existing question surfaces it before
posting; detail pane shows related questions; embeddings are backfilled; HF usage
shows up in DevTools (hf-proxy already records usage — verify, don't rebuild).

---

## Phase 3 — Engagement loops (follow, realtime, leader nudge)

### 3.1 Follow a question

```sql
create table public.qa_question_followers (
  question_id uuid not null references public.qa_questions(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (question_id, user_id)
);
-- RLS: select/insert/delete own rows (user_id = auth.uid()), select also for
-- developers. Mirror the vote-table policies in 20260613020000_qa_section.sql.
```

- Bell/Follow toggle on the detail pane. Asking a question auto-follows it;
  answering one auto-follows it (insert with `on conflict do nothing` semantics —
  use upsert).
- Rewrite the `notify_qa_answer` trigger function (CREATE OR REPLACE in a new
  migration): notify **all followers except the answer's author** instead of only
  the question author. Batch: `jsonb_agg` the follower ids into a single
  `send-push` call (`userIds` accepts an array — see
  `supabase/functions/send-push/index.ts`).

### 3.2 Realtime board

- Subscribe (pattern: `Chat.jsx` `useEffect` with `supabase.channel(...).on('postgres_changes', ...)`)
  to INSERTs on `qa_questions` and `qa_answers` filtered by
  `organization_id=eq.${activeOrgId}`; append rows into state, dedup by id
  (`cur.some((x) => x.id === row.id) ? cur : [...cur, row]`).
- **Caveat:** realtime INSERT payloads bypass the Phase 0 masking RPC. For rows
  where `is_anonymous` is true and `author_id !== userId`, null out
  `author_id`/`author_name` client-side before inserting into state (defense in
  depth; the payload technically already delivered it, which is acceptable for
  realtime hints — note this tradeoff in a code comment).

### 3.3 Weekly unanswered-questions nudge to leaders

- Edge function `qa-leader-digest` + pg_cron weekly (Mon 15:00 UTC), following the
  exact auth pattern of `supabase/functions/discipleship-nudge/index.ts`:
  vault secret `qa_digest_cron_token` created in the migration, mirrored to a
  function secret `QA_DIGEST_CRON_TOKEN` at deploy time, checked env-first.
- Logic: per org, find questions with zero answers older than 3 days; if any,
  push to org members with leader roles (query `profiles.role in (...leader roles)`
  joined through `profile_organizations`): "3 questions are waiting for a response"
  → url `/qa`. At most one digest per org per week (the cron cadence handles it).
- Deploy + mirror the token:
  `TOKEN=$(supabase db query --linked "select decrypted_secret from vault.decrypted_secrets where name='qa_digest_cron_token';" | ...)`
  then `supabase secrets set QA_DIGEST_CRON_TOKEN="$TOKEN"` and
  `supabase functions deploy qa-leader-digest`.

**Acceptance:** follower receives push on new answers; new questions appear on
other clients without refresh; invoking the digest function with the cron token
returns a summary JSON and pushes only to leaders.

---

## Phase 4 — AI study depth

### 4.1 "Explore the Scriptures" panel on a question

A button on the question detail: suggests 2–4 relevant Bible passages with one-line
"why this passage" notes. **Positioning matters:** this is a study aid, never an
authoritative answer. Panel copy must say so ("A starting point for your own study
— weigh everything against Scripture").

- New edge function `qa-passages` modeled exactly on
  `supabase/functions/discipleship-guide/index.ts` (Gemini `gemini-2.5-flash-lite`,
  `responseSchema` JSON, `recordUsageEvent({ provider: 'gemini', feature: 'qa-passages', ... })`).
  Schema: `{ passages: [{ reference, why }] } (2–4 items, why ≤ 2 sentences)`.
  Temperature 0.2. Prompt: the question title+body; instruct canonical book names
  ("John 3:16-18" style) so the references auto-link.
- **Cache per question** in a `qa_passage_suggestions` table
  (`question_id` pk, `prompt_version`, `content jsonb`, `created_at`) — same shape
  as `discipleship_guides`. Regenerate only when the question is edited
  (compare a `source_hash` column = md5(title+body)).
- Render the references as plain text — the global scriptureLinker makes them
  clickable automatically. Do not build custom link handling.

### 4.2 Leader draft assist (leaders only)

- In the answer composer, visible only when `isLeaderRole(userRole)`: a "Suggest a
  starting point" button that calls the same `qa-passages` function with an
  extended task (or a second function `qa-draft`) returning a short 3–4 sentence
  pastoral starting draft + passages. It fills the textarea (editable, never
  auto-posts). Append a fixed suffix the leader can delete: nothing automatic —
  the leader owns what they post.
- Guard server-side too: the function verifies the caller's role via
  `profiles.role` (service-role lookup of `auth.getUser()` — copy the developer
  check in `supabase/functions/health-check/index.ts`, but against leader roles).

**Acceptance:** passages panel renders with clickable references and caches (second
request `cached: true`); non-leaders never see or successfully call the draft
assist; all Gemini calls appear in DevTools API activity.

---

## Repo Conventions & Gotchas (read before coding)

**Stack:** React 19 + Vite (JS, not TS, in `src/`), Supabase (Postgres + RLS + Edge
Functions in Deno TS under `supabase/functions/`), Vitest, ESLint 10.

**Verification loop (must pass before every commit):**
```sh
npm run lint    # 0 errors required; 6 pre-existing warnings are known/acceptable
npm test        # all tests green (225+ currently)
npm run build   # must succeed
```

**Lint rules that WILL bite you:**
- `react-hooks/set-state-in-effect` is an **error**: never call a setState
  synchronously inside a `useEffect` body, including via a sync-prefix async
  function. Patterns that pass: promise chains where all setState happens inside
  `.then(...)` callbacks; or `Promise.resolve().then(() => setX(...))` for resets
  (see `Discipleship.jsx` Phase-3 effect and `DevTools.jsx` `useEffect(() => { Promise.resolve().then(load); })`).
- `react-refresh/only-export-components` is an **error**: component files may only
  export components (+ a const is tolerated for `DiscipleshipOnboarding`'s pattern
  — but put shared helpers/regexes in `src/lib/*.js`, never export utilities from
  a `.jsx` component file).
- Unused vars are errors.

**Database migrations:**
- Files: `supabase/migrations/<YYYYMMDDHHMMSS>_<snake_case_name>.sql`; pick a
  timestamp later than every existing file.
- Apply with `supabase db push --linked --yes` (the project is already linked; the
  CLI is authenticated). Never edit an already-applied migration — add a fixup
  migration instead (see `20260702011000_fix_dev_usage_daily.sql` for the pattern
  and why).
- RLS style: per-action policies with explicit names; `public.is_developer()`
  (includes service-role since `20260703000000`), `public.is_admin()`; org
  membership via `profile_organizations`. Copy guard style from existing files.
- `GROUP BY` gotcha: don't put aggregates inside a `jsonb_build_object` you then
  `GROUP BY 1` on — aggregate in an inner subquery first (this exact bug happened
  in `dev_usage_daily`).

**Edge functions:**
- Live in `supabase/functions/<name>/index.ts`; always start with the OPTIONS/CORS
  + method check from `_shared/cors.ts`; record calls with
  `recordUsageEvent` from `_shared/usage.ts` (provider/feature/status/request).
- Deploy: `supabase functions deploy <name>`. Cron-invoked functions authenticate
  via `x-cron-token` checked against an env secret first, vault row as fallback
  (copy `discipleship-nudge`). Push sending: POST to
  `${SUPABASE_URL}/functions/v1/send-push` with `Authorization: Bearer <SERVICE_ROLE_KEY>`
  and `{ userIds, title, body, url }`.
- DB-trigger push: pg_net + vault `push_hook_secret` (copy
  `20260627000000_qa_answer_push_notification.sql`).

**Testing:** pure logic goes in `src/lib/<name>.js` with a colocated
`<name>.test.js` (Vitest, `describe/it/expect`). Components are mostly untested —
don't add component tests unless trivial; DO add lib tests for anything with
branching logic (sorting, filtering, masking helpers).

**Deploy/ship:** commit to `main` and push — Vercel auto-deploys the frontend.
Commit messages: conventional-ish (`feat(qa): ...`), body explains why, and end
with the Claude/agent co-author trailer only if that's your tool's convention.
Database (`db push`) and functions (`functions deploy`) are deployed manually
before pushing the code that depends on them.

**Do NOT:**
- Add npm dependencies (everything above is achievable with what's installed).
- Rename the `prayer-images` bucket or migrate stored images.
- Touch `discipleship_*`, `chat_*`, or `feedback_*` tables.
- Modify `gemini-proxy` (it's tightly coupled to insights/questions) — new Gemini
  features get their own function following `discipleship-guide`.
- Build a custom scripture linkifier — the global one already handles Q&R text.

## Suggested execution order & sizing

| Step | Size | Depends on |
|------|------|-----------|
| 0.1 anonymous masking RPC | S | — |
| 0.2 pagination | S | 0.1 (same loader) |
| 1 trust layer | M | 0.1 |
| 2.1–2.2 tags + tabs + search | M | 0.2 |
| 2.3 semantic similarity | M | 2.1 helpful, not required |
| 3.1 follow + push rewrite | M | 1 |
| 3.2 realtime | S | 0.1 |
| 3.3 leader digest | M | — |
| 4.1 passages panel | M | — |
| 4.2 leader draft assist | S | 4.1 |

One commit per row minimum; verify (`lint`/`test`/`build` + the phase's acceptance
criteria against the live project) before moving on.
