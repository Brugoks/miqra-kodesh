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
Keep JWT verification enabled. No database migration is required.

## Behavior

Each canvas covers one chapter or a contiguous verse range within it. The server
fetches the Berean Standard Bible from the existing HelloAO source and indexes
the bundled core Wiki's people and places by chapter. Chapter-level connections
are labeled separately from the selected verse range. Links open existing Wiki
pages and the Atlas with its chapter filter.

Sources appear before explanation generation completes. Each model-generated
card must cite loaded source IDs; malformed output and unknown citations are
rejected. Citation validation establishes source identity, not theological
correctness. Cards distinguish observations from interpretations, and clicking a
citation focuses the evidence on the canvas.

Changing the focus cancels the browser request and ignores stale results. Loaded
sources remain visible and the new request receives recent conversation context.
This is application-managed cancellation/replacement, not Astra mid-turn
steering. A provider may still bill work that was already underway when canceled.

Save stores up to ten completed canvases per user and organization on the local
device. They are not synced or shared; clearing site storage removes them.
Failures keep the sources available and offer retry. Provider calls have a fixed
output limit and timeout, and usage is recorded under `siliconflow / study-canvas`.

## Verification

`npx vitest run src/lib/studyCanvasServer.test.js src/components/study/StudyCanvas.test.jsx`

`deno check supabase/functions/study-canvas/index.ts`

`npm run build`

Server tests cover admin enforcement, forged client fields, source selection,
invalid ranges, invalid citations, missing configuration, and sanitized provider
errors. UI tests cover evidence navigation, local saving, provider failure/retry,
and interruption races. Live explanation verification needs the configured key.

Provider reference: https://docs.siliconflow.com/en/api-reference/chat-completions/chat-completions
