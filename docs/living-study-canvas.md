# Living Study Canvas

Admin preview at `/study-canvas`, available from the sidebar to the existing
`admin` and `developer` roles. The route, page, and Edge Function all enforce
access. The function verifies the caller with Supabase Auth and reads their
current database profile; it never accepts a role, user ID, organization ID,
model, prompt instructions, or source text from the client as authority.

## SiliconFlow setup

Paste the key into `SILICONFLOW_API_KEY` in the ignored `.env.local` file.
Do not add a `VITE_` prefix. The browser never receives this key.

Run `node scripts/configure-study-canvas.js` to upload only SiliconFlow settings
to the linked Supabase project's Edge Function secrets. The script uses a
temporary restricted file, suppresses CLI output, and removes the temporary
file afterwards. It does not upload unrelated `.env.local` variables.

Optional server settings:

- `SILICONFLOW_BASE_URL`: defaults to `https://api.siliconflow.com/v1`.
  Use `https://api.siliconflow.cn/v1` for a key from the China region.
- `SILICONFLOW_CANVAS_MODEL`: defaults to `deepseek-ai/DeepSeek-V4-Flash`. Choose a model
  supporting JSON output and `enable_thinking: false`.

Deploy the function with `npx supabase functions deploy study-canvas --use-api`.
Keep JWT verification enabled. Saved canvases need the `study_canvases` table
(`supabase/migrations/20260914000000_study_canvases.sql`).

## Behavior

Each passage covers one chapter or a contiguous verse range within it, and a
canvas holds up to four passages set side by side. The server fetches the Berean
Standard Bible from the existing HelloAO source and indexes the bundled core
Wiki's people and places by chapter. Chapter-level connections are labeled
separately from the selected verse range. Links open existing Wiki pages and the
Atlas filtered to every chapter on the canvas.

The `sources` action loads one passage; `explain` takes `references` (1–4) and
reads them all, deduplicating shared Wiki entries. `reference` alone is still
accepted. Each model-generated card must cite loaded source IDs; malformed output
and unknown citations are rejected. Citation validation establishes source
identity, not theological correctness. A passage cited by any step cannot be
removed from the canvas.

### A canvas is a history

Every question and the explanation it produced is kept as a step (shape and
helpers: `src/lib/studyCanvasModel.js`). Steps form a tree: each records the step
it was asked from, so asking from an earlier step starts a branch instead of
rewriting the path. "Your study path" draws the main line flat and indents
branches under the step they left from; step numbers are creation order.

The conversation sent with a question is that step's line of ancestry only (the
last five steps), never sibling branches. The student's reflection and card notes
on a step are folded into the question that follows it, so the guide responds to
what the student thinks. Turns stay inside the server's limits (≤12 turns,
≤3000 characters each).

Cards can be pinned (up to 24). Choosing two pins lays them side by side, and
"Ask the canvas to contrast these" sends the pair back as a question. With more
than one passage, "Ask how these passages speak to each other" does the same for
the passages.

Changing the focus cancels the browser request and ignores stale results; the
replacement keeps the cancelled question's place in the tree. A provider may
still bill work that was already underway when canceled.

### Saving, sharing, export

Saves live in `study_canvases`, owned by the user (not the active organization,
so a canvas appears on every device regardless of which org each is in) and
readable through the table by nobody else, admins and developers included. Once
saved, every step, note, pin, passage and rename is saved automatically. On first
load the page uploads any canvases left in localStorage by the earlier
device-only version, across every org key for that user, and clears each key only
after its upload succeeds. Without Supabase configuration, saves fall back to up
to ten per user and organization on the device.

A saved canvas can be shared read-only by link (`/study-canvas/shared/:token`).
Any signed-in member with the link can read it through the
`get_shared_study_canvas` function; anon cannot. Notes and reflections are
stripped by that function unless the owner includes them. Turning sharing off
drops the token, so sharing again mints a new link.

"Print handout" mounts a print-only sheet (`.canvas-handout`, portalled to
`<body>`) and opens the print dialog; "Download Markdown" exports the same
content: path, steps, notes, pins and the passage text.

Provider calls have a fixed output limit and timeout, and usage is recorded under
`siliconflow / study-canvas`.

## Verification

`npx vitest run src/lib/studyCanvas src/components/study`

`deno check supabase/functions/study-canvas/index.ts`

`npm run build`

Server tests cover admin enforcement, forged client fields, source selection,
invalid ranges, invalid citations, missing configuration, and sanitized provider
errors. UI tests cover evidence navigation, local saving, provider failure/retry,
and interruption races. Live explanation verification needs the configured key.

Provider reference: https://docs.siliconflow.com/en/api-reference/chat-completions/chat-completions
