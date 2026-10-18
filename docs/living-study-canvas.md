# Living Study Canvas

Living Canvas at `/study-canvas` is available to signed-in members from the
sidebar. It opens **My moments**, a guided personal capture and revisit space.
Admins and developers also have a **Scripture study** tab; the study UI and
`sources` and `explain` Edge Function actions retain their admin enforcement.
The new `related` action is available to every signed-in member. `?ref=...` and
`?view=study` open that tab for eligible users.

## Personal moments

- Capture requires only the person's own words. A title is derived from the
  opening words and can be renamed later. No Bible passage or AI call is needed.
- A thread contains the original glimpse and dated reflections, Scripture
  connections, prayers, open questions, and small responses. All can be edited
  with explicit Save/Cancel controls; edits preserve IDs, order, and creation
  dates and record an edit date. Edit drafts survive navigation and failed saves.
- Scripture connections open the existing Bible reader. They are labeled as
  personal connections, separate from the biblical text.
- A chosen revisit date appears in the library's **To revisit** filter. It is an
  in-app cue, not a scheduled push/email notification. Adding a reflection on or
  after that date clears the cue; the person can choose another date in details.
- Canvas and Outline show the same content (see **Spatial workspace** below).
  Export offers an explicit preview and entry selection; the title and original
  glimpse are always included, and sections and connections come along only when
  the cards they join are chosen.
- Capture and entry drafts are stored per user in localStorage as the person
  types. They are removed after successful saving, retained after errors, and
  are not automatically sent to AI. A draft-storage failure is shown explicitly.
- Saved moments use the existing owner-only account storage. Timestamp-checked
  updates refuse to overwrite a moment changed on another device, and never
  recreate one deleted elsewhere. A user can reopen the latest moment and add
  their retained draft.
- Deleting a canvas requires confirmation. Device-only storage rejects a new
  canvas at its ten-canvas limit instead of discarding an older canvas.

Apply `supabase/migrations/20261015195700_living_canvas_moments.sql` before
shipping this frontend. It adds nullable `journey` JSON, permits zero passages
for personal moments, and enforces `journey IS NULL OR share_token IS NULL`.
Existing study rows and owner RLS are preserved. Personal threads cannot use
study link sharing; exporting selected content is the explicit sharing path.
The existing shared-study RPC does not select the journey field.

Model: `src/lib/canvasJourney.js`. UI: `src/components/study/MomentCanvas.jsx`.
The first release supports text capture; voice, photos, cross-thread graph
connections, mentor invitations, and external reminders are not implemented.

## Spatial workspace

A saved moment opens as a workspace with two views over the same content:

- **Canvas** — a pannable, zoomable board (React Flow, `@xyflow/react`, MIT).
  Thoughts are cards you drag by their header; **Connect** joins two cards (two
  taps, optional label and arrow); **Section** names a group, which drags,
  resizes and collapses as one. Select a card for Edit, Connect and More
  (Branch thought, Move to section, Delete). Search, Fit all, zoom, undo/redo,
  and a minimap once the board outgrows a screenful.
- **Outline** — every card as an ordinary list, by section or chronologically,
  with every action the board has (edit, section, connect, delete) and no
  dragging. Phones open here.

Desktop opens a new canvas as a canvas; a canvas that has only ever been a story
opens in Outline with a **Try canvas** button. The choice is remembered per
device (`miqra_canvas_view_v1:<user>`); the last viewport per canvas is too
(`miqra_canvas_viewport_v1:<user>:<canvas>`) and never writes the canvas.

### Full screen

Every device has a **Full screen** button in the workspace bar. It lays the
workspace over the whole browser window, covering the app's sidebar, header and tab
bar (inline, the canvas is boxed in by them and by the page's 1200px column), using
`100dvh` and the safe-area insets so it follows the browser's toolbars, a notch and
the on-screen keyboard. The bar becomes one slim row. On a phone it keeps only
Exit, the saving state and the Canvas/Outline switch (the name and the buttons that
leave the page wait for Exit; the stylesheet hides `.lc-bar__wide` below 760px); in
a wider window it keeps those too.

On a touch device where the browser allows it (Android Chrome, iPad Safari) it also
asks for real full screen, which hides the browser's own toolbars. iPhone Safari
allows that only for video, so there the window-filling layer is all there is —
which is why it is a layer of its own, not a wrapper around the Fullscreen API. With
a mouse it never asks: the request was for the window, F11 already does the screen,
and the rest of a desktop should stay where it is. Leaving real full screen with a
swipe or Escape leaves ours too.

**A canvas opens this way by default**, on every device, whether it was just
captured or picked from the library; the capture page and the library are normal
pages. Exit full screen (the button or Escape) is remembered for that person on
that device (`miqra_canvas_fullscreen_v1:<user>`), and so is choosing Full screen
again. Back is navigation, not a choice, so it is never remembered. A canvas that
opened by itself is the page, not an overlay, so it makes no Back entry and Back
leaves the page as it always did; a full screen the person opened with the button
is an overlay and Back peels it off first. An automatic open cannot ask the browser
for real full screen (that needs a tap), so on a touch device the window-filling
layer is what opens, and the Full screen button, being a tap, adds real full screen.
The page's own errors and notices sit behind the layer, so they are shown inside it
while it covers the page. With the spatial workspace switched off nothing opens full
window.

Exit is the button; **Escape**, once nothing else wants it (an open panel, a pending
Connect or a selection take it first, and a field being edited keeps its own); the
browser or device **Back** (it closes full screen instead of leaving the page,
through `useBackDismiss`); or the system gesture. Opening Scripture from a card gives
up real full screen (the reader lives outside the element) but keeps the layer, so
closing the reader returns to the canvas. It is the same workspace, never a copy:
unsent words, the view, selection and saving carry across, and the canvas is not
rebuilt. Code: `board/useFullscreen.js`.

### Data

`journey` stays the source of truth for words. A new nullable, versioned `board`
JSONB column (migration `20261017120000_living_canvas_board.sql`) holds only
placements: card positions (world coordinates, widths), one level of sections,
and labelled connections. Nodes point at `moment` or `entry:<id>`; no text or
Scripture is copied into the board. Caps: 101 cards, 20 sections, 200
connections, 120-character labels, coordinates ±100,000, card widths 200–640,
sections 280–20,000. The database enforces the structure too
(`study_canvas_board_valid`), the row limit counts it, a board needs a journey,
and personal canvases still cannot have a share token. The shared-study RPC
selects explicit fields and never returns `board`.

Reading never writes. A canvas with no board is laid out deterministically
(original at the left, entries on a grid in creation order); the first spatial
edit persists the arrangement. An entry added by an older client is placed in a
free slot. Placements for entries that no longer exist are left out, with a
notice. A layout that cannot be read (corrupt, or from a newer version) never
hides the story: it is held aside as `boardIssue`, never overwritten by an
ordinary save, and can be downloaded or deliberately reset from Canvas settings.

Code: `src/lib/canvasBoard.js` (validation, projection, geometry, search),
`canvasBoardCommands.js` (every change is a command; undo/redo, 50 steps),
`canvasBoardFlow.js` (the only place that knows React Flow wants section children
relative to their section), `canvasEdgeGeometry.js`, `canvasSaveQueue.js`,
`canvasRecovery.js`, `canvasFlags.js`; UI in `src/components/study/board/`.

### Saving

Edits are committed locally at once and saved in the background through one
serialized queue (≈500 ms debounce, 2 s max wait). Each request builds on the
timestamp the previous one returned (compare-and-swap on `updated_at`); an
acknowledgement never replaces the document, so an edit made in flight stays
dirty. Before an edit counts as "Saved on this device" it is written to an
IndexedDB recovery journal, scoped by user and canvas. States: Saving, Saved,
Saved on this device · will retry, Couldn't save (changes only in this tab),
Changed elsewhere, Deleted elsewhere.

A refusal (changed or deleted on another device) stops saving: nothing is
retried or merged. The person can download their copy, save it as a separate
canvas, or reload. On opening, a leftover journal is replayed only after asking
and only when the account is still at the revision it was built on; if the
account moved on, it is kept for download or a separate canvas.

### Pasting several paragraphs

A paste is one thought by default, wording and blank lines untouched. When the
text has two or more paragraphs (split at blank lines) the composer offers
**Split into N thoughts** with a numbered preview. Splitting changes no wording,
adds every piece or none (`addThoughts`), is one undo step, and is refused with a
reason, never by cutting, when the pieces would not fit (100 later thoughts, 4,000
characters each). It is not offered for a Scripture connection or a branch.

### The switch

The workspace is **on for everyone**, and it opens whenever a canvas does. A switch
remains so it can be turned off again. **Off** means Outline only, exactly the story
as before, with the saved layout left untouched and the `board` column never read.

- Whole build: `VITE_LIVING_CANVAS_BOARD=off` (a build-time variable, so it needs a
  redeploy).
- One device: open any page with `?canvasBoard=off` (or `on`); it is remembered
  under `miqra_living_canvas_board` and wins over the build setting.

The `board` migration (`20261017120000_living_canvas_board.sql`) was applied to the
linked project on 2026-10-17, before the workspace became the default; apply it to
any other environment first, because loading a canvas asks for the column while the
switch is on. Rolling back is turning the switch off; board data is never rewritten.
An older client may add entries without a layout; the projection places them when
the board returns.

### Not built

Templates, tidy-up, uploads, ink, nested sections, cross-canvas links, and
realtime collaboration are later proposals (`docs/living-canvas-2d-workspace-plan.md`,
slice 4). Also not built: a card-width control (the `resizeCard` command exists),
alignment guides, and dragging from a card to connect (Connect, and connecting by
name from the details panel or Outline, cover it).

## Pull related Scripture

From a saved glimpse, **Pull related Scripture** proposes up to three passages.
An optional focus lets the person explore what is becoming clearer now. The
button sends only the saved original glimpse, that focus, and saved passage
references as exclusions; other entries and prayers are not sent to the provider.
There is no provider call on capture, editing, or opening a thread.

The `related` action verifies identity, validates bounded input, asks the existing
SiliconFlow model for references, and fetches their full BSB chapters from
HelloAO. It validates the selected verse ranges (1–8 verses), then asks for
context and connection grounded in the fetched chapters. Quotations always come
from the Bible source, never model output. A suggestion shows the selected
verses, two surrounding verses on each side when available, passage context,
and a possible connection to the glimpse. Context/application remain labeled
AI-assisted interpretations, not assertions of theological correctness.

Only **Add to canvas** saves a suggestion, one choice at a time. Chosen passages
retain their BSB text, surrounding verses, context, connection, and the glimpse
wording at selection time. Users can edit the context/connection and add their
own reflection separately; the source Bible text stays intact. Editing the
original glimpse reveals the earlier wording on previously chosen passages.
Repeat pulls exclude saved references; cancellation ignores late results and
save failures retain the suggestion for retry. Markdown export includes the
selected entries and their evidence.

The new optional JSON fields are backward compatible with existing journey
records and require no additional database migration beyond the moments
migration above. Deploy the updated `study-canvas` Edge Function together with
the frontend. Related requests use two bounded provider calls and record usage
under `siliconflow / canvas-related-scripture`, without storing glimpse text in
usage metadata.

## AI study preview

The function verifies the caller with Supabase Auth and reads their
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

`npx vitest run src/lib/canvas src/lib/studyCanvas src/lib/relatedScriptureServer.test.js src/components/study src/components/Layout.test.jsx src/lib/roles.test.js`

Database regression checks: `supabase/tests/living_canvas_moments.sql` in a
disposable database with the base schema and both canvas migrations installed.
It checks independent capture, ownership, reassignment rejection, cross-user
isolation, malformed data, share-token rejection, and existing shared-study
redaction. Its test fixtures and grants are rolled back.
`supabase/tests/living_canvas_board.sql` (same setup plus
`20261017120000_living_canvas_board.sql`) checks that a layout saves and is
preserved by writes that omit it, every structural rule and cap, that a board
needs a journey, that layouts are never shareable, and owner isolation.

The UI tests render the real board in jsdom and drive it through React Flow's own
handlers (selection, connect, sections, search, keyboard, and drag by header).
jsdom cannot show layout or real input, so `npm run check:canvas-browser` drives
the real page in headless Chrome with trusted mouse, wheel, key and touch input
(`scripts/living-canvas-browser-check/`; needs Google Chrome, set `CHROME_PATH` if
it is not at the macOS default). It asserts on geometry rather than taking
screenshots, and covers: the board's real size and the phone layout; hit-testing
(a section's frame lets pointers through, its header drags); header-only dragging
in world coordinates, section drags carrying their cards, drop-to-join and
drag-out; marquee select and pressing empty space to deselect; wheel pan,
Ctrl+wheel zoom around the pointer, Space-drag and middle-drag pan; connect with
a label and a themed arrowhead; double-click to add at the pointer; section
resize that cannot crop its cards; Tab/Enter/Escape focus; search; text contrast
in light and dark; on an emulated phone, one-finger pan, two-finger pinch, tap
select, Select several, the details sheet, 16px form fields, 44 px targets and a
board that clears the app's tab bar; full screen on a phone, with and without the Fullscreen
API (like iPhone Safari), over the app's real header and tab bar, through
rotation, a short on-screen-keyboard viewport and Back; full window on a desktop
(over the real sidebar, Escape, Back, panels, no real screen full screen); and the
automatic open, on a desktop and a phone, with the choice remembered, Back not
taken for a choice, and focus on the dialog; and frame times for a full
board (101 cards, 20 sections, 200 connections). The page is mounted inside the
app's real `Layout`, so the checks run against its real header, sidebar and tab bar.

Still **manual before widening the rollout**, because Chrome in a script is not
the real thing:

- Safari/WebKit on a Mac, an iPad and an iPhone: the same pan, pinch, drag and
  sheet behaviour with real fingers, and the on-screen keyboard clearing the
  details sheet. The scripted frame times are from desktop Chrome with software
  rendering, not a tablet: the plan's targets are 60 fps on a desktop and 30 fps
  on a tablet.
- How it looks: card spacing, section tints, selected outlines, link and label
  styling, and the board height (`clamp(520px, calc(100dvh - 230px), 1100px)`)
  beside the real app header and the bottom tab bar at ≤1024 px. The check runs
  the page without the app shell.
- Known limits: a pinch that starts on a card does not zoom (React Flow ignores
  gestures on draggable nodes; the zoom buttons and a pinch on empty space do);
  controls inside the canvas, like a section's collapse button, scale with the
  zoom. On a phone the board opens on the original glimpse at a readable size;
  Fit all shows the whole board.
- VoiceOver smoke test, 200% browser zoom, reduced motion.
- The plan's usability gate: four of five first-time testers can capture,
  connect and group three thoughts in two minutes, and find an off-screen thought
  with Fit all or search.

`deno check supabase/functions/study-canvas/index.ts`

`npm run build`

Server tests cover admin enforcement, forged client fields, source selection,
invalid ranges, invalid citations, missing configuration, and sanitized provider
errors. UI tests cover evidence navigation, local saving, provider failure/retry,
and interruption races. Live explanation verification needs the configured key.

Provider reference: https://docs.siliconflow.com/en/api-reference/chat-completions/chat-completions
