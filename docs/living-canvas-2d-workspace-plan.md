# Living Canvas: a spatial workspace for your thoughts

Status: implementation proposal · October 17, 2026

Make Living Canvas a calm, expressive 2D workspace: capture a thought immediately, move it where it belongs, connect it to another thought, and gather related ideas into named sections. Combine the freedom of a whiteboard with the clarity of a mind map. Keep Miqra Kodesh's personal reflection and Scripture features close at hand.

This proposal is based on the current working tree, which contains ongoing Living Canvas changes, plus a read-only inspection of the live `/study-canvas` page. Local capabilities and deployed capabilities may differ. This document proposes future work; it does not record a shipped implementation.

## 1. Product decisions

- **One saved canvas per topic or reflection.** An existing moment becomes a canvas with its original glimpse and later entries. All its cards can connect freely; the original thought need not sit at the center. Cross-canvas links come later.
- **Three visible creation actions:** Add thought, Connect, Section. Scripture, prayer, question, and response remain available in the Add menu and card details. Users do not need to classify a thought before capturing it.
- **Canvas and Outline show the same content.** Desktop opens Canvas for new boards. Outline supports reading, keyboard organization, phone use, and the existing chronological story. Remember the person's view preference per device. Existing users first retain their prior story view with an explicit “Try canvas” action.
- **Human organization first.** Capture, connections, sections, and tidy-up work without AI. The existing explicit related-Scripture flow remains available in details; suggestions enter the board only after Add to canvas.
- **Private personal workspace for v1.** Preserve current account ownership and selective export. Multiplayer and public personal-board sharing require a separate access and synchronization design.

## 2. Verified starting point

| Area | Current working-tree evidence | Implication |
| --- | --- | --- |
| Entry point | `src/components/study/StudyCanvas.jsx` renders `MomentCanvas` for members and an admin-only Scripture study tab | Add spatial organization to personal moments without changing study access |
| Current UI | `MomentCanvas.jsx` renders capture, library, original glimpse, composer, Story/Cards, revisit, and export | Cards currently means a CSS grid, not a pannable spatial canvas |
| Content model | `src/lib/canvasJourney.js`: original moment, dated entries, five entry kinds, 4,000 characters, up to 100 later entries | Preserve IDs, dates, revisit semantics, text, and Scripture evidence |
| Storage | `src/lib/studyCanvas.js`: owner account sync, timestamp-checked moment writes, local ten-canvas fallback | Extend the existing save boundary; do not save through a second independent content path |
| Normalization | `normalizeJourney` and `normalizeCanvas` construct explicit whitelisted shapes | Merely adding a UI property will not persist it; adapters and normalization must change |
| Privacy | Moments migration forbids a journey with a share token; shared-study RPC selects explicit study fields | Spatial data stays private and must stay absent from the shared-study response |
| Design | `src/index.css`, `MomentCanvas.css`: Nunito headings, Inter body, rounded surfaces, semantic colors, organization accent, light/dark themes | Use those tokens and Lucide icons; the inspected organization's accent is neutral gray |

The visual review includes an actual live screenshot. Its populated thought is existing personal content; keep this review local. Use invented example text in the proposed workspace.

## 3. The experience

### First 60 seconds

1. Open Living Canvas. Choose a saved canvas or start with a single prompt: **“What's on your mind?”**
2. Type or paste a thought and choose **Add to canvas**. Derive a short editable title; show the first card and a compact hint: **“Add another thought, connect ideas, or create a section.”** No title, Bible reference, or category is required.
3. Add a second thought at the visible center or double-click empty space. Select a card to see Edit, Connect, and More. A **Branch thought** action creates a nearby card and a connection in one action.
4. Choose Connect, then two cards. An optional label describes the relationship: “leads to,” “questions,” or the person's own words. Default is an undirected relationship; arrows are optional.
5. Select related cards and choose **Create section**. The section fits around them; name it “What I'm noticing,” “Questions,” or anything useful. Drag its header to move the group together.
6. Close and reopen. Content, positions, sections, and links remain; the device restores its last useful viewport.

Pasting a paragraph creates one card. Offer **Split into thoughts** with a preview of blank-line-separated cards and a remaining-capacity count; never silently rewrite the wording or invent connections. This enhancement follows the core capture flow.

### Workspace layout

- **Top bar:** Back to canvases, editable title, save state, Canvas/Outline, and an overflow menu for revisit date and selective export. The workspace uses available viewport height; avoid stacking the old capture/composer forms above it.
- **Left toolbar:** labeled Add thought, Connect, Section; Select/Hand controls and undo/redo are secondary. On a narrow screen use a compact bottom toolbar with a prominent Add button.
- **Board:** subtle dot grid, generous empty space, readable cards with soft corners, restrained category tint and explicit type label. Selected objects get a clear outline. Avoid perpetual movement, decorative particles, and always-visible connection handles.
- **Card details:** open on explicit Edit or Enter, as a side panel on desktop and a sheet on touch devices. Keep long notes and full Scripture context here; a board card shows a short excerpt. Closing a draft retains it; Save/Cancel stay explicit for content edits.
- **Navigation:** visible Fit all, zoom percentage, +/- controls, and search. Show a minimap only when the board is large enough to need it. Search lists text matches and focuses the chosen card, expanding its section if needed.
- **Library:** a separate compact library/drawer, not a permanent large sidebar consuming board width. Keep To revisit and clear account/device storage labels.

### Interaction contract

| Action | Mouse / trackpad | Touch / keyboard alternative |
| --- | --- | --- |
| Select | Click card; Shift-click adds to selection; drag empty space selects an area | Tap card; explicit multi-select mode; focusable Outline rows |
| Edit | Edit button or double-click card | Enter opens details; Escape closes and retains draft |
| Move | Drag card header; body text remains selectable; optional alignment guides | Drag header after movement threshold; Move to section menu; keyboard nudge outside editors |
| Pan / zoom | Space-drag, middle-drag or Hand; trackpad scroll pans; pinch/Ctrl-wheel zooms at pointer | One finger on background pans; two-finger pinch; visible controls always available |
| Connect | Select source, Connect, select target; optional drag handle shortcut | Same two-tap flow; searchable destination picker in details/Outline |
| Group | Multi-select, Create section; drag into highlighted section | Move to section dropdown; keyboard section creation and rename |
| Undo / redo | Visible buttons; Cmd/Ctrl-Z, Shift-Cmd/Ctrl-Z | Same buttons; native text undo stays inside the active editor |
| Find | Search button; Cmd/Ctrl-F only while board is focused | Search results accessible as a normal list |

Shortcuts apply only inside the focused workspace, never while typing or in another app panel. Tab navigates controls; do not repurpose it to create branches. Escape cancels Connect or a pending gesture, then clears selection. Show the active mode and a cancel action. Coordinate transforms must account for both pan and zoom when placing, moving, or connecting cards.

### Sections and relationships

Use one level of sections for v1. A card belongs to at most one section. A section has a name, semantic color, size, position, and optional collapsed state. On drop, highlight and adopt the containing section; dragging a card fully outside removes membership while preserving its world position. An explicit Move to section control provides the same result. If sections overlap, use the topmost highlighted eligible section.

Section deletion defaults to **Remove section, keep cards**. Moving and resizing a section never scale the cards or their text. Resize cannot crop its children. Collapsing a section hides its cards visually but preserves their content; external links attach to the collapsed frame with a count, and expand back to the original endpoints. Collapsing, membership changes, and group moves are each one undoable action.

Connections attach to card edges and follow their movement. Labels are optional, editable, and limited to 120 characters. Permit cycles: thoughts are a graph. Reject self-links and duplicate endpoint pairs; v1 supports one relationship per pair, optionally directed. Deleting a card removes its incident links in the same undoable transaction. The original glimpse is editable and movable but cannot be individually deleted while the legacy moment model requires it; explain this in its menu. Whole-canvas deletion retains the existing confirmation.

### Outline, touch, and accessibility

Outline offers By section and Chronological orders. Each card exposes its type, text, section, and connected cards as ordinary accessible controls. All creation, editing, linking, grouping, and deletion must work here without dragging. Use a predictable focus order, announcements for completed moves and saves, and focus restoration after dialogs. Color always has a textual counterpart.

At phone widths, default new devices to Outline with an obvious Canvas switch. Canvas stays usable with touch pan/pinch and a bottom details sheet; touch targets are at least 44 CSS pixels. Tablet landscape uses the full board. Respect reduced motion, browser zoom, existing theme tokens, and organization branding. Test the actual iPad/Safari gesture behavior before broad release.

## 4. Technical approach

### Canvas engine

Use **`@xyflow/react` (React Flow)** as the proposed rendering and interaction engine, with application-owned card components and a domain model independent of the library. It provides a documented viewport, custom nodes/edges, grouping primitives, and accessibility support. Its grouping uses parent-relative positions; parents must precede children. Dynamic membership, history, persistence, and the complete product interactions remain our work. See [viewport](https://reactflow.dev/learn/concepts/the-viewport), [subflows](https://reactflow.dev/learn/layouting/sub-flows), and [accessibility](https://reactflow.dev/learn/advanced-use/accessibility).

| Option | Fit and cost | Decision |
| --- | --- | --- |
| React Flow | Good fit for semantic cards, relationships, and custom Scripture UI; MIT core; requires our own document/history layer | Recommended, pending the short input/performance spike |
| tldraw | Worth evaluating if pen drawing and arbitrary shapes become the main goal; production requires a valid license key | Reconsider for a drawing-first product direction |
| Bespoke pointer/SVG engine | Maximum control, but we own hit testing, transforms, touch, selection, accessibility, and rendering optimization | Avoid for this release |

Licensing sources: [React Flow attribution and MIT](https://reactflow.dev/api-reference/types/pro-options), [tldraw license](https://tldraw.dev/community/license). Verify supported package versions against this React 19/Vite 8 application in the spike and pin the selected version in the lockfile. Core library availability does not imply its paid example implementations can be copied.

### Content and spatial data

Keep `journey` as the content source of truth. Add a nullable, versioned **`board` JSONB column** to `study_canvases`; do not bury it in `journey`, where older normalizers would erase it. Add a top-level `board` field to the domain adapter. The existing original text maps to the stable node ID `moment:<canvasId>`; each entry maps to `entry:<entryId>`. No text or Scripture quotation is duplicated inside the board document.

Suggested v1 shape:

```ts
type Board = {
  version: 1;
  nodes: Array<{
    id: string;
    contentRef: { type: 'moment' } | { type: 'entry'; entryId: string };
    x: number; y: number; width: number; // world coordinates
    sectionId: string | null;
  }>;
  sections: Array<{
    id: string; title: string; color: 'neutral' | 'teal' | 'purple' | 'amber';
    x: number; y: number; width: number; height: number; collapsed: boolean;
  }>;
  edges: Array<{
    id: string; source: string; target: string;
    label: string; direction: 'none' | 'forward';
  }>;
};
```

Store all positions in world coordinates. The React Flow adapter converts section children to parent-relative positions and back, preventing position jumps on reparenting. Card height is derived from the bounded preview; persist width only. Keep selection, hover, drag previews, measured dimensions, and connection drafts out of the saved document. Viewport and preferred view are user/canvas/device preferences, not content writes.

For v1, **Add thought** creates an existing `reflection` entry; “Thought” is the simpler creation label, with Reflection as its compatible stored type. Keep current explicit prayer/question/response/scripture types. Adding a new enum would make old normalizers reject those records. The first thought continues to populate `journey.moment`; a blank board remains an unsaved draft until it contains text.

Validate unique IDs, finite and bounded positions, widths and section dimensions, existing content references, valid membership, edge endpoints, allowed colors, version, and label lengths. Proposed caps: original plus 100 entries, 20 sections, 200 connections; 4,000 characters per thought and the existing aggregate row limit of 3 MB including the new board. Suggested geometry bounds: coordinates ±100,000; card widths 200–640; sections 280–20,000. Enforce structural limits in the database as well as client validation. No recursive sections.

Missing board data gets a deterministic initial arrangement: original at the left, entries in creation order on a spaced grid, no invented semantic edges or sections. Opening a legacy record does not write. Saving an explicit spatial edit persists the arrangement. Missing nodes for newly added legacy entries are placed in a free slot; stale references are omitted from the view with a recovery notice. A malformed or unsupported board must not make the underlying story unreadable or silently overwrite the raw layout; expose Outline and a deliberate reset/download recovery path.

### State, undo, and saves

Introduce a document reducer/command layer shared by Canvas and Outline. Commands cover create/edit/delete card, connect, edit/delete edge, move/resize, create/rename/remove/collapse section, and change membership. A gesture is one command at pointer-up, not a history entry per pointer event. Keep the last 50 document commands in memory per session; text editors own their draft history. A content edit becomes one document command when Save succeeds locally. Undo restores content, memberships, and edges together and queues a new save; it does not restore an old server timestamp.

Refactor the current save API so spatial autosave receives the updated row/timestamp directly instead of refreshing the whole library after every drag. Use a single serialized save queue for journey and board together. Debounce committed layout actions about 500 ms (max 2 seconds during continuous completed actions). Pending changes are immutable snapshots tagged with local sequence numbers; acknowledgments must never replace edits made while a request was in flight. Chain the next request from the returned server timestamp. Viewport changes never write the canvas row.

Continue compare-and-swap updates using `updated_at`, checking the insert/update result. Add an owner-authorized atomic save RPC only if needed to validate and return the complete updated record; do not add a second unconditional upsert path. An existing canvas deleted on another device must not be recreated by retry. Keep local migration upload from overwriting an already existing server row: insert missing IDs, then reconcile collisions explicitly and retain the local copy until resolved.

Keep `useMomentDraft` for capture/editor drafts. Persist the committed-but-unacknowledged document plus its base timestamp to an IndexedDB recovery journal, scoped by user and canvas, before showing that local recovery is available. On reload, match the server revision before replay. Use a clear **Saving / Saved / Saved on this device / Couldn't save / Changed elsewhere** state. If storage is unavailable, state that changes are only in this tab. If a remote conflict occurs, stop automatic retries, retain a downloadable local copy, and offer reload or save as a separate canvas; do not silently merge competing edits. Sign-out and account switches must never load another user's recovery journal.

### Modules and integration

| Work area | Proposed files / changes |
| --- | --- |
| Domain | `src/lib/canvasBoard.js` for validation, legacy projection, world-coordinate transforms; `canvasBoardCommands.js` for atomic commands/history |
| Workspace | `src/components/study/board/LivingCanvasBoard.jsx`, `ThoughtNode.jsx`, `ScriptureNode.jsx`, `SectionNode.jsx`, `ConnectionEdge.jsx` |
| Controls | `CanvasToolbar.jsx`, `CanvasDetails.jsx`, `CanvasOutline.jsx`, `CanvasSearch.jsx`; styles inherit app tokens |
| State | `useCanvasDocument.js`, `useCanvasAutosave.js`, `src/lib/canvasRecovery.js`; selection isolated from content state |
| Existing integration | `MomentCanvas.jsx`, `MomentEditor.jsx`, `RelatedScripture.jsx`; reuse evidence viewer and reader events |
| Persistence | Extend `studyCanvasModel.js`, `studyCanvas.js` selects/writes/local serialization; additive migration and database tests |
| Export | Extend selective Markdown export with selected sections and relationships; include a link only when both endpoints are selected |

Retain the current original-glimpse inclusion rule in selective export and state it in the preview. Add board JSON recovery export in v1. A visual PNG/PDF export is a later feature and requires explicit bounds/selection handling. Keep all personal board fields excluded from shared-study RPC output. RLS must continue to restrict both reading and writing to the owner; see [Supabase row security](https://supabase.com/docs/guides/database/postgres/row-level-security).

## 5. Delivery sequence

These are implementation slices in dependency order, not calendar estimates. Refine sizing after the engine/input spike.

| Slice | Deliverable | Exit gate |
| --- | --- | --- |
| 0 · Validate the feel | Isolated React Flow spike using invented content and app tokens; drag, pan/pinch, inline/details editing, grouping, two-tap connections | Works with mouse, trackpad, touch, keyboard; 101 cards/200 edges remain responsive; license/dependency decision recorded |
| 1 · First useful canvas | Domain projection, additive board storage, single save queue, recovery, capture, move cards, Canvas/Outline, Fit all | New and legacy moments survive reload; existing Scripture content and timestamps unchanged; no write on read |
| 2 · Organize meaning | Labeled/directed connections, sections and membership, multi-select, history, search, branch action | Create five cards, connect three, move/collapse a section, undo/redo, reopen with identical state |
| 3 · Make it dependable | Phone/tablet controls, full keyboard alternatives, accessible focus, dark mode, conflict/offline recovery, selective export, gated rollout | End-to-end regression and usability gates below pass |
| 4 · Optional polish | Previewed split-paste, templates, selected-card tidy-up, richer media, cross-canvas references | Chosen after real use identifies friction; each has its own migration/access story |

Ship the public v1 after slices 1–3 pass together: links, sections, undo, and reliable saves are part of the core promise. Keep the feature behind a rollout switch during those slices. The “cool” comes from direct manipulation, satisfying organization, and responsive feedback; optional media or AI organization should not delay that core.

## 6. Verification and release gates

- **Domain tests:** stable legacy projection; valid/invalid references; group world/relative conversions at nonzero pan/zoom; full transaction undo; no Scripture-text mutation; deterministic migration and version handling.
- **Persistence tests:** movement and content edits during an in-flight save; out-of-order/failed acknowledgments; reload recovery; quota errors; remote revision conflicts and deletions; old-client saves preserve board; local-upload collisions retain both copies.
- **Database tests:** two users cannot read/write each other's board; owner reassignment fails; malformed/oversized board is rejected; personal share-token prohibition and shared-study redaction still hold. Run in a disposable database.
- **Browser flows:** add → edit → connect → section → move → undo/redo → reload → Outline → selective export. Cover empty, loading, error, board limits, interrupted gestures, deleted endpoints, and long text.
- **Input/accessibility:** desktop Chrome and Safari, tablet Safari touch, narrow phone layout, 200% zoom, reduced motion, keyboard-only and VoiceOver smoke checks. Verify local control labels plus library-provided accessibility behavior.
- **Performance targets:** 101 cards/20 sections/200 edges; target 60 fps on the test desktop and at least 30 fps on the test tablet during drag/pan, with no perceptible typing lag. Record device/browser and measurements. Memoize node components and event handlers; avoid subscriptions that rerender the entire tree on selection. See [React Flow performance guidance](https://reactflow.dev/learn/advanced-use/performance).
- **Usability gate:** with five first-time testers, at least four can capture, connect, and group three thoughts without coaching in two minutes, and find a hidden/offscreen thought with Fit all or search. Revise affordances if they cannot.
- **Regression commands:** run focused `canvasJourney`, `studyCanvasModel`, `studyCanvas`, `MomentCanvas`, existing study-component tests, new board tests, the relevant SQL suite, lint on changed files, and `npm run build`. Browser interaction tests are essential; jsdom alone cannot prove pointer geometry or touch behavior.

Deploy additive schema support first, then a frontend that can read both formats, then enable the workspace for a small group. Do not bulk-rewrite saved moments. Rollback disables spatial editing and restores Outline while leaving board data untouched. An older client may add entries without layout; the deterministic projection handles those additions when the new client returns. Keep export and the original story usable throughout rollout.

## 7. Boundaries and review choices

The proposed default is a **thought workspace**: text, Scripture, relationships, and sections. A **drawing-first whiteboard** adds ink, shapes, images, and pen tools and warrants a fresh engine/licensing evaluation. The visual review offers that scope choice; absent a requested change, use the thought-workspace direction above.

Cross-canvas linking, realtime collaboration, automatic AI organization, nested sections, uploads, and handwriting are later proposals. They introduce distinct permissions, storage, graph, and synchronization work. No extra product decision is required to start slice 0; the remaining uncertainties are whether the engine meets the input/performance gates and which usability issues testing reveals.
