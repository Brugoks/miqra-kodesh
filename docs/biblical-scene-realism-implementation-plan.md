# Biblical scene realism — implementation handoff

Status: ready for implementation; application changes have not started.

Repository: `Brugoks/miqra-kodesh`. Prepared September 5, 2026 from the current checkout and a visual inspection of the four scene routes and Atlas. Recheck the working tree and relevant code before editing; file names below are more reliable than line numbers.

## 1. Objective and scope

Improve the existing walkable biblical scenes so surfaces, people, light, landscape and sound feel believable at walking distance, while preserving scripture access, historical transparency, navigation and usability on phones.

Implement a complete Capernaum pilot first: shore → village lane → courtyard → doorway → house interior. Retain the roof and synagogue as usable destinations. Deliver the shared improvements to all four existing scenes, then extend the asset treatment to Caesarea, Herod’s Temple and the Tabernacle in separate increments.

The first milestone is **the finished Capernaum pilot plus shared foundations**, not a simultaneous asset rebuild of all four sites. The complete program additionally includes the site upgrades in Phase 7. Report these milestones separately; do not describe the whole program as complete after the pilot.

Keep React/Vite, plain JavaScript/JSX and Three.js. Keep `/scene/:slug`, current place aliases, scripture events and scene module registration. No engine migration, new 3D locations, multiplayer, generative NPC dialogue, backend migration, TTS replacement, or continuous simulation of every historical era. Asset loading infrastructure alone is not a realism upgrade; actual finished assets must ship with the pilot.

This document specifies proposed behavior. Numerical budgets are engineering starting points and acceptance targets, not measurements from the audit.

## 2. Before editing

1. Read applicable `AGENTS.md`, `CLAUDE.md`, package scripts and existing scene tests. Preserve unrelated user changes. Do not commit, push or deploy merely because this plan exists.
2. Inspect the installed Three.js version and current official documentation before using loaders or post-processing APIs. The inspected package requests `three ^0.185.1`; use the lockfile version as the authority. Do not upgrade dependencies as a prerequisite without a demonstrated need.
3. Run the existing relevant tests and lint to establish a baseline. Record failures with exact commands rather than assuming older notes about failures still apply.
4. Create `docs/scene-realism-progress.md` with phase status, assets acquired, tests, measurements, unresolved prerequisites and reviewer findings. Update it after each coherent increment.
5. Reuse the audit screenshots if available in `.lavish/`: `capernaum-shore.png`, `capernaum-door.png`, `temple.png`, `caesarea.png`, `tabernacle.png`, `atlas.png`. They are local review artifacts and may not accompany this plan in a different checkout. Their absence does not block implementation.

The current repository preference in `CLAUDE.md` leaves visual verification to the maintainer. Unless the user authorizes browser verification in the implementing session, supply the manual review matrix in section 12, run all available nonvisual checks, and explicitly leave human visual acceptance pending. Unit tests cannot establish realism. Do not mark visual or real-device targets passed without evidence.

## 3. Existing architecture and constraints

| File or area | Existing responsibility | Preserve / account for |
| --- | --- | --- |
| `src/components/scene/Scene.jsx` | Lazy Three.js boot, renderer/camera, walking, tour integration, controls, hotspots and cleanup | Builder is synchronous today; audio starts on the “Step inside” gesture; teardown must handle asynchronous additions |
| `sceneModules.js` | Per-slug navigation and dynamic builder imports | Four registered scenes; avoid making other builders load for a Capernaum visit |
| `buildCapernaum.js` | Procedural village, water, interiors, figures and props | Basalt shader mainly changes color; retain the traversable room, roof hole and external stair |
| `buildSecondTemple.js` | Temple structure and generated textures | Paving/ashlar use small canvas textures; keep sacred-area boundaries and geometric checks |
| `buildCaesarea.js` | Illustrative waterfront | Not a surveyed reconstruction; preserve that disclosure |
| `buildTabernacle.js` | Exodus-based structure and camp | Text-based cubit dimensions; already has a hammered-gold normal effect |
| `*Dimensions.js`, `*Navigation.js`, `sceneNavigation.js` | Floors, barriers, body clearance, substeps, stacked room/roof surfaces | Visual improvements must not drift from these surfaces; do not replace navigation with mesh raycasting |
| `sceneLighting.js` | Shared compass-aware sun, sky, five times of day | Scenes have different axes; never assume +Z means the same direction everywhere |
| `scenePostProcessing.js` | GTAO, bloom, output conversion, vignette/grain | Low quality currently bypasses the chain; preserve exactly one output conversion |
| `sceneFigures.js`, `sceneProps.js` | Instanced primitive people and props | Keep inexpensive distant/fallback versions |
| `src/lib/sceneAudio.js` | Synthesized beds, positional sources, surface footsteps, enclosure filtering | Reuse one context and public controls; do not duplicate whole soundscapes |
| `useSceneTour.js`, `src/lib/sceneNarration.js` | Existing guided stops and narration/text fallback | Preserve cancellation, subtitle/text fallback and narration behavior |
| `src/lib/scenes.js`, `capernaumScene.js`, `caesareaScene.js`, `tabernacleScene.js` | Manifests, vantages, hotspots, scripture and geo metadata | Extend declaratively; preserve lookup helpers and aliases |
| `atlas/Atlas.jsx`, `AtlasDetailSheet.jsx` | Atlas year state and scene entry | Year is not currently passed to the detail sheet; scene selection is place-based |
| `wiki/BibleWiki.jsx` | Location detail scene entry | Show the same scene-period label here |
| `public/sw.js`, `vercel.json` | Static asset caching and SPA fallback | `/assets/` is cache-first and excluded from SPA rewriting; immutable names are mandatory there |

Important observed behavior:

- `detectQuality()` selects low quality on width ≤900px OR hardware concurrency ≤4. Low disables shadow maps as well as post-processing.
- The camera walks at 3.6 m/s and runs at 8.5 m/s. Footstep cadence derives from distance traveled.
- Hotspot visibility currently checks distance and screen projection, not wall occlusion. Lake labels appeared through Capernaum walls; Tabernacle labels overlapped.
- Capernaum’s distant terrain uses scaled sphere meshes. Foreground people remain primitive silhouettes.
- Atlas at year −4003 still offers the fixed c. AD 30 Temple without a date on the launch control.
- Several builder disposers traverse resources and also dispose tracked collections. Establish ownership before attaching shared loaded resources; do not add another overlapping disposal path.

## 4. Phase 0 — historical and asset specification

Deliver `docs/scene-realism-assets.md` and `docs/scene-realism-sources.md` before replacing major objects. Asset acquisition and authoring are part of implementation, not tasks silently left to the next agent.

### Historical scope

Use these initial scene period labels:

| Scene | Period label | Numeric reference year |
| --- | --- | --- |
| Capernaum | `c. AD 28` | `28` |
| Herod’s Temple | `c. AD 30` | `30` |
| Caesarea | `First century AD · Acts-era interpretation` | `null` pending a narrower sourced visual brief |
| Tabernacle | `Wilderness setting · Exodus 25–40` | `null`; do not invent an agreed absolute Exodus date |

A numeric reference year describes the chosen reconstruction moment, not a claim that every depicted object existed in precisely that year. Reuse the app’s BCE/CE formatting conventions; do not introduce year zero.

For Capernaum, retain basalt domestic architecture and a modest early synagogue interpretation. Do not reproduce the later ornate white synagogue as an AD 28 building. Source the forms of fishing boats, pottery, lamps, roof construction, clothing and vegetation. Modern ruins and topography are references, not complete ancient ground truth. Avoid treating the roof-opening story as proof of a particular excavated room’s identity.

For every major reconstruction claim, store a stable evidence ID with:

- Claim, applicable scene/object IDs, period label and source URL plus section/page where available.
- Evidence type: `textual`, `archaeological`, `comparative`, or `artistic`.
- Certainty: `attested`, `inferred`, or `illustrative`, with a plain-language limitation.
- Dimensions in original units where relevant, metric conversion and the conversion assumption.

“Attested” describes the specific claim, not the entire rendered object. Scripture can attest a described dimension without attesting a mesh’s decorative pattern. For Tabernacle dimensions, keep the 0.5 m/cubit choice explicit. Avoid unsupported precision in terrain, chronology and clothing.

### Required Capernaum asset set

| Asset group | Minimum completed content | Placement/use |
| --- | --- | --- |
| Materials | Basalt fieldstone, dressed basalt, worn plaster, compacted earth, timber, woven cloth, ceramic and rope | Appropriate regions of pilot route; separate material scale from object scale |
| Architecture | Detailed doorway/threshold, beams/roof edges, nearby wall edge treatment | Courtyard and house; preserve existing extents and clear openings |
| Fishing boat | One researched hull with planks, ribs, fittings and rope; detailed and reduced versions | Closest shore boat; retain simpler distant boats |
| Household/fishing props | Open basket, handled jar, lamp, net with visible openings, rope coil, work surface | Authored clusters outside the walk corridor; replace corresponding fallback items |
| Foreground people | At least three usable character variations; idle, work and carry/walk clips | Three to six foreground actors; natural proportions and clothing; distant crowd retained |
| Landscape | Shore stones, restrained reeds/vegetation, plausible terrain silhouette | Pilot shore and distant horizon |
| Recorded sound | Shore water, rope/wood work, cloth movement, earth and stone footsteps | Environmental analogues, not claims of authentic ancient recordings |

Use original authored assets or downloadable assets whose licenses permit redistribution in a shipped web app. Record creator, source, license text/location, attribution requirements, modifications, byte size, checksum, units, axis convention and LOD metadata. Do not hotlink marketplace previews, purchase assets without an authorized budget, or claim that a source license also proves archaeological accuracy.

Prefer local Blender/source files or deterministic generation scripts for authored assets. If a needed model, rig, recording or authoring tool is unavailable, continue independent infrastructure work and record the exact missing deliverable. Do not replace it with a primitive and mark the asset phase complete. Generated concept artwork is optional reference material; it does not satisfy a 3D asset requirement.

### Asset formats and packaging

- GLB with +Y up, meters, applied transforms, sensible origin/pivots, reusable materials, and named animation clips. Document the authored forward axis and transform to each scene’s axes at placement time.
- Color/emissive textures use sRGB. Normal, roughness, metalness and AO textures are data maps, not sRGB. Test UVs, normal orientation, AO channels and model/material scale against the installed Three.js implementation.
- Prefer KTX2/Basis textures with mipmaps. Keep initial hero maps ≤2048² and ordinary maps ≤1024² unless a measured close-up need justifies more. A compressed file is not the same thing as low GPU memory.
- Prefer packed maps when supported by the chosen material workflow. Do not duplicate embedded GLB textures and separately loaded copies of the same material.
- Place runtime files under `public/assets/scenes/<site-or-shared>/` with content hashes in names. Put decoders under a versioned `/assets/` path tied to the installed tool version. This uses the existing caching/rewrite contract without changing `sw.js` or `vercel.json`.
- Place editable large sources outside the runtime directory; document an existing approved source location or repository policy. Do not add a backend or cloud bucket solely for this pilot.
- Use compressed recorded audio supported by target browsers; include a fallback format only where required and verify decode failure behavior.

Write a manifest validation script, proposed `scripts/validate-scene-assets.js`, that verifies file existence, byte sizes/checksums, mandatory license/source metadata, allowed formats and referenced IDs. Reject placeholder URLs and duplicate mutable filenames.

## 5. Phase 1 — resource loading and ownership

Proposed new modules in `src/components/scene/`:

- `sceneAssetManifest.js`: declarative asset records and load groups, with no loader imports or requests at module scope.
- `sceneAssets.js`: on-demand loader creation, per-visit load/cache session, partial failures, cancellation and disposal.
- `sceneMaterials.js`: scene-owned material creation, map/color-space setup and consistent scale conventions.
- `sceneResources.js`: deduplicated tracking/ownership of geometries, materials, textures, mixers and loader workers.

Retain the synchronous builder entry point and its current return contract. Add optional extension hooks rather than converting every builder to an async function:

```js
// Proposed builder result additions; older builders remain valid.
{
  root, lighting, sun, fog, exposure,
  update(elapsed, delta = 0),
  dispose(),
  occluders: [],
  applyAssets(assetGroup), // replaces a named fallback group atomically
  applyQuality(profile),  // visibility/detail changes without rebuilding navigation
}
```

Define the ownership contract in code comments and tests:

1. The builder owns procedural geometry/materials, including retained hidden fallback groups.
2. One asset session per scene visit owns loaded GLB resources, textures and clones. Repeated instances share within that session only; no unbounded cross-route GPU cache in this phase.
3. A material instance may be customized per use; shared textures stay asset-session-owned. `applyAssets` attaches assets but does not transfer ownership implicitly.
4. The route owns the asset session, post-processing chain and renderer. On teardown, detach loaded groups before the builder’s traversal disposer; dispose each resource once using identity sets. Do not dispose a shared texture while another attached material uses it.
5. Clone skinned assets using Three.js’s supported skeleton-aware utility, not `Object3D.clone()` alone. Each actor gets its own mixer/skeleton state while sharing safe geometry/texture resources.

Loading sequence:

- Render the current procedural scene first and make “Step inside” usable as soon as that scene is ready.
- Load only the active site’s small core material/architecture group next; defer foreground actors/boats and distant refinements behind that group. Limit simultaneous large requests to two initially.
- Start recorded sound loading from the existing audio gesture path. Never create a second context or autoplay sound before that gesture.
- Keep fallbacks until a replacement group has validated finite transforms, required materials and usable bounds. Attach the replacement and hide the corresponding fallback in one update; avoid duplicate geometry, actors, audio or colliders.
- Use a route generation token plus AbortController. Some loader parsing/decoding work may not be abortable: late results from a disposed visit must be disposed and must never attach or set React state.
- A failed optional file leaves only its corresponding fallback active. Missing/corrupt GLB, KTX2, decoder, audio and HTML returned as an asset must be nonfatal. Record bounded development diagnostics; avoid exposing loader jargon in the scene UI.
- Install cleanup progressively during boot. A failure halfway through renderer, builder, post or loader setup must release everything already allocated. The current final-only `cleanup` assignment is insufficient once boot gets more complex.
- Pass `delta` to `built.update(elapsed, delta)` for mixers. Exclude hidden-tab time from simulation/performance sampling; prevent actor or sound jumps when returning.

Do not capture stale post-processing handles: current resize/render/cleanup code closes over `post`. If runtime quality can replace it, have all three read `engine.post` and dispose the old chain before replacing it.

Acceptance: one failed load cannot blank the scene; leaving before loads finish cannot attach assets; repeat visits do not accumulate contexts, mixers, worker pools or scene resources; procedural-only unit tests still run without network/WebGL.

## 6. Phase 2 — quality, lighting and contact

Add `sceneQuality.js` with canonical `low`, `balanced`, `high` profiles and `auto` as a user selection, not a fourth resolved profile. Audit every `quality === 'low'` branch across builders, crowds, props, audio and post-processing. Resolve profile parameters centrally; do not implement a balanced label that silently receives all high costs.

Starting profile values:

| Feature | Low | Balanced | High |
| --- | --- | --- | --- |
| Pixel-ratio ceiling | 1.0 | 1.5 | 2.0 |
| Directional shadow map | Off, retain local contact shading | 1024 | 2048 |
| Dynamic foreground actors | 2 | 4 | 6 |
| Asset detail | Reduced | Medium | Near/far LOD |
| GTAO | Off | Off initially | On |
| Bloom / animated film grain | Off | Off initially | Restrained / optional |
| Terrain/vegetation density | Sparse | Moderate | Full authored density |

These are defaults to tune against measurements. Keep static contact AO/material shading on every profile. Add gentle, inexpensive contact shadows below people/props where needed; avoid full-screen AO on low. Bake crevice/contact shading, not directional sunlight, so night and moving sunlight remain coherent. Avoid applying strong baked AO and strong GTAO twice.

Expose `Auto`, `Low`, `Balanced`, `High` under a compact settings control. Persist the selected preference under a scene-specific key; gracefully handle inaccessible storage. Auto starts balanced, or low when reliable low-resource/save-data hints warrant it. Viewport width affects resolution, not the entire quality tier by itself. Preserve reduced-motion and audio preferences separately.

For the pilot, adapt **resolution only** at runtime; geometry tier changes occur only through an explicit quality selection. This avoids constant scene rebuilds. Sample unclamped visible frame deltas after a 3-second warmup, excluding load/swap periods. Evaluate 5-second windows: sustained >40 ms lowers render scale one step; sustained <22 ms for three windows can restore one step, capped by the resolved profile. Require a 10-second cooldown. Test hysteresis with synthetic samples. Log the initial and final effective resolution in benchmarks so “30 fps” is not reported without its image-quality cost.

Apply an explicit tier change in place through visibility/LOD, shadow configuration, pixel ratio and post chain updates. Preserve walker position/floor, yaw/pitch/FOV, time of day, mute and UI mode. Pause an active tour and tell the user it is paused rather than silently restarting it. Never rerun the intro or navigation initialization for a graphics setting.

Lighting changes:

- Retain compass-aware `applyLighting` and `SCENE_AXES` contracts.
- Add a prefiltered environment for reflections/indirect material response, with a compatible environment per time-of-day family (day, warm low sun, night). Lower/adjust intensity at night; do not leave daytime reflections on night metal or water.
- An environment map alone does not solve dark interiors. Add controlled local fill/probes or equivalent cheap indirect lighting where needed, with restrained exposure; prevent outdoor fill from flattening every room.
- Improve nearby shadow texel density by a bounded shadow region around the pilot route/camera. Account for sun direction and nearby casters; stabilize the region to avoid crawling shadows. Do not merely enlarge shadow maps over the entire city.
- Preserve linear processing followed by exactly one tone-map/output conversion. When no composer runs, the renderer owns output conversion. When one runs, preserve `OutputPass` and verify custom shaders follow the installed Three.js pipeline.
- Keep grain/vignette subtle and disable animated grain for reduced motion. No bloom increase as a substitute for material or lighting work.

Acceptance: low retains readable grounding; morning and night work with materials/metal; tier changes preserve visit state; resize reaches the current composer; all four builders accept all resolved profiles.

## 7. Phase 3 — complete the Capernaum visual slice

Implement assets behind the interfaces above, with scene-specific placement in a proposed `capernaumAssets.js`. Keep manifest IDs, dimensions and walkable anchors stable.

1. Replace foreground color-only masonry with real normal/roughness response. Add modeled edge stones and lintel/threshold detail at the doorway. Use plausible repeating scale in meters and controlled variation; avoid scaling one UV map arbitrarily across different-sized walls.
2. Add beam joints, roof-edge irregularity, cloth sag, pottery handles/rims and readable net openings. Retain the roof opening and its broken beam treatment. The unvisited remainder of the village may stay simpler, but no abrupt material seam should appear along the pilot walk.
3. Replace the nearest boat with the detailed/reduced asset, correctly intersecting the waterline. Avoid floating moorings, enormous knots and unconnected rigging. Define animated parts and pivots in metadata.
4. Build irregular shore transitions with stones, wet/dry variation and restrained vegetation. Keep navigable ground aligned to `floorAt`; decorative displacement must not produce visible foot sinking or a traversable slope the navigation refuses. Changes to actual floor heights require simultaneous dimension/navigation updates and tests.
5. Replace scaled-sphere horizon forms with an authored heightfield/ridge mesh referenced to local geography. Document its approximate status where ancient data is unavailable; do not make modern elevation data a claim of an exact ancient shoreline.
6. Upgrade water normal detail, grazing-angle reflections and shallow/deep color. Use a shoreline/depth mask tied to this scene’s coordinates. Contact foam belongs near moving water/obstacles, not uniformly across the lake. Low uses a cheaper equivalent. Preserve fog and output color behavior.
7. Place three to six foreground actors doing ordinary work in clusters. Use per-actor timing and variation, real contact with held objects and planted feet. Do not replace all crowds with costly skinned meshes. Do not put a primitive figure next to the camera after its detailed replacement loads.
8. Reuse existing route concepts for limited actor travel. Carrying loops require movement and an attached load; working loops require a matching prop. Validate their paths outside walls/water and clear of the visitor’s body corridor. Full crowd AI and dynamic crowd collision are out of scope.

LOD policy: start detailed foreground models inside 10 m, medium from 10–25 m and simplified beyond 25 m; use hysteresis bands to prevent flicker. Tune based on visual scale and recorded performance. Hidden/far actors do not need full mixer updates. Preserve instancing for static repeated props.

Use only simple colliders for large newly added obstacles that visitors can approach. Small dressing stays outside the walk corridor. Never register each pebble/jar as a new per-frame navigation obstacle.

Reduced motion must cover all newly introduced water displacement, cloth motion, actor gestures and particle effects. Freeze at a plausible deterministic pose; do not move actors while their gait is frozen. Existing builders must be audited too: accepting a `reducedMotion` option is not proof it is actually used.

Acceptance: the entire pilot route has finished material/model treatment, authored actors, working low-detail alternatives, and unchanged safe access to house, roof and synagogue. Missing assets remain visible as fallbacks but are a failed content-delivery requirement, not a passed pilot.

## 8. Phase 4 — recorded environmental sound

Extend `src/lib/sceneAudio.js` through an injectable sample bank, proposed `sceneAudioAssets.js` in the same directory. Keep its current `resume`, `update`, `footstep`, mute/volume and `dispose` surface compatible.

- Reuse current context, master/footstep buses, listener coordinates and positional sources. Existing enclosure filtering is already present; improve it instead of building a second path that ignores mute.
- Crossfade a loaded recorded layer over its corresponding synthesized layer over approximately 0.5–1 second. A failed or missing layer leaves the synthesized version. Do not play both at full level.
- Decode once per context/asset; bound the cache to the active visit. AudioBuffer memory is uncompressed: include it in the budget.
- Schedule gap-free loops with authored loop boundaries; vary one-shots without immediate repetition. Keep footsteps distance-driven. Use conservative playback-rate variation and headroom; avoid clipping when layers overlap.
- Add subtle interior reverb and source obstruction for house/doorway transitions. Extend the existing enclosure signal; use inexpensive fixed-region or low-frequency source checks, not a whole-scene raycast for every voice every frame.
- Environmental samples are analogues. Avoid recognizable modern speech, traffic and machinery. Any intelligible period-language dialogue requires its own researched script and is not in this phase.
- Respect mute, paused/hidden tabs, narration intelligibility and reduced motion. If narration ducking is added, connect to the existing tour lifecycle without changing its synthesis service or creating new paid calls.
- Late decoding after route exit must not start playback. Disposal stops sources, releases references/disconnects nodes, and closes only an owned context.

Acceptance: sound-on/off works before and after samples load; footsteps match surfaces and actual motion; no double ambience, autoplay failure, late playback or decode-failure crash. Human listening acceptance is recorded separately from graph tests.

## 9. Phase 5 — unobstructed exploration and historical context

### Hotspots and controls

Add `sceneHotspots.js` for testable visibility and placement logic.

- Preserve real accessible HTML buttons. Project the anchor as today; perform cheap distance/frustum checks before occlusion.
- Builders expose explicit simple opaque occluders: walls, roofs and substantial structures. Exclude sky, water, transparent cloth, smoke, tiny props and the hotspot’s own target surface.
- Raycast from camera to anchor with a small endpoint tolerance so a label on a wall does not hide itself. Account for backside/interior wall views through suitable simple double-sided occlusion geometry.
- Check occlusion at approximately 10 Hz or meaningful camera movement, not all meshes every animation frame. Reuse vectors/raycaster and cached label sizes. Invalidate bounds on resize, content/font changes and asset replacement.
- Select at most three world labels, prioritized by active selection, distance and non-overlap. Avoid control/panel rectangles. Introduce small visibility hysteresis to limit flicker. Do not hide a keyboard-focused label mid-interaction; restore focus predictably if the user changes modes.
- Add a `Places & stories` list exposing every hotspot and vantage independent of world visibility. Quiet mode hides world labels/hints and closes the narrative panel, while retaining Exit, mute, settings and the list. A selected story can intentionally reopen its panel.

Move speeds into a small testable configuration module. Default walk to 1.6 m/s. Offer a fast traversal preference retaining current 3.6 m/s and existing run/fast-travel controls. Reuse distance-driven footsteps/bob; do not couple footstep frequency to a new timer. Audit tours and arrival thresholds so slower walking does not leave instructions or transitions broken.

### Period metadata and entry wording

Add a `period` object to scene manifests using the labels/reference years from Phase 0. Add a pure formatting helper that can be used by Atlas, Wiki and the scene intro. Do not parse years out of subtitle strings.

- `Atlas.jsx` passes `year` into `AtlasDetailSheet`.
- Every available scene button names the scene period: e.g. `Enter Herod’s Temple · c. AD 30`.
- If selected Atlas year differs from a non-null scene reference year, show: `Atlas: 4003 BC. This reconstruction depicts c. AD 30.` The explicitly dated entry button performs the transition; no confirmation modal is necessary.
- Keep the Atlas timeline unchanged on entry and restore its selected year on return. Before pushing the scene route, save `{ year, placeSlug }` in the current Atlas history entry through React Router’s replace navigation, preserving its existing search parameters and unrelated state. This lets browser Back restore the same visit; scene-route state alone cannot do that. Pass a small React Router state object to the new scene entry as well: `{ sceneReturnContext: { source: "atlas", year, placeSlug } }`. Read it with `useLocation()` in `Scene.jsx`; the Exit action navigates to `/atlas` with a validated restoration payload. `Atlas.jsx` consumes that payload once to initialize/restore year and place selection after data is available. Validate a finite year against the existing Atlas range and require a known place slug; invalid/missing state falls back to current default behavior. Do not accept an arbitrary return URL. Direct scene links and Wiki launches retain the existing Exit-to-Atlas behavior. Preserve the router history state through quality changes; test a browser Back round trip as well as Exit. This is an explicitly disclosed move into a dated reconstruction, not alternate-era geometry. Restoring every pan/zoom/filter is outside this milestone.
- For broad/uncertain periods, show the label without a precise mismatch calculation. Do not assign a fabricated reference year to Tabernacle or Caesarea just to enable the comparison.
- Keep `sceneForPlace`, `resolveScene`, `scenePath` and direct links backward compatible. Do not hide existing scenes merely because a chosen map date differs.
- Wiki place entries and scene intros display the same period label. Keep modern map links clearly labeled as present-day views.
- Add `How we know` access to source/interpretation notes by evidence ID. Keep source data lightweight and lazy-load detailed records if necessary. Source tags must not cover the scene by default.

The existing Atlas location artwork can remain for now. Do not generate photorealistic replacement marketing art before the actual 3D scene supports that expectation.

Acceptance: year −4003 + Jerusalem clearly discloses c. AD 30; matching years produce no contradictory warning; null-year scenes work; all old aliases and direct routes resolve; hidden/occluded hotspots are reachable from the list.

## 10. Phase 6 — pilot integration and release readiness

Finish the Capernaum acceptance matrix before expensive site-specific asset work elsewhere. No phase may remove an existing test just because the new output is different: update assertions only when the underlying requirement intentionally changes, and preserve behavior coverage.

Suggested initial incremental budgets, excluding the existing app shell:

| Budget | Pilot target |
| --- | --- |
| Optional core enhancement transfer | ≤8 MiB compressed |
| All Capernaum enhancement transfer | ≤25 MiB high; ≤10 MiB low |
| Estimated incremental texture memory | ≤128 MiB high; ≤64 MiB low |
| Decoded sample memory | ≤24 MiB per active visit |
| Visible draw calls | Aim ≤250 high, ≤150 low; report baseline as well |
| Visible frame timing after warmup | p95 ≤16.7 ms on agreed laptop; p95 ≤33.3 ms on agreed midrange phone |

Document exact device/browser, physical vs software GPU, viewport, pixel ratio/render scale, tier, network conditions and asset versions. Test a repeatable 60-second walk after warmup, separately from loading. Report median and p95; do not hide stutters with average FPS. GPU memory figures may be estimates from formats/dimensions; renderer counters are not byte measurements.

If a budget is missed, first reduce distant detail/texture resolution, stop unnecessary actor updates, improve instancing and reduce overdraw. Do not remove all grounding/near detail or falsify the acceptance target to claim success. Record revised budgets and their rationale where a measured tradeoff is justified. Hardware unavailable means that target is unverified, not passed.

Deliver a short pilot completion report with asset manifest, source notes, commands/results, measurements, visual/listening status and remaining site work. A production deployment is a separate action, subject to the implementing session’s authorization.

## 11. Phase 7 — expand to the remaining scenes

Use the completed pilot pipeline; do not fork three new loader/material/audio systems. Deliver one site at a time with the same regression, resource and review gates.

### Caesarea

Create an Acts-era reference brief before replacing the illustrative district. Upgrade nearby quay stone, columns, cargo vessels, rope/moorings and working harbor figures; layer port sounds into existing positions. Preserve the disclosure that street plan, hearing rooms and household identifications are conjectural. Distinguish Roman-era reference features from later ruins. Reuse Capernaum technology, not its freshwater shore treatment or every boat/house asset.

### Herod’s Temple

Replace large repeating paving patterns with correctly scaled varied materials and joints. Refine near columns, thresholds, limestone/marble/gold response and foreground pilgrims. Maintain public/restricted routes and all dimensional tests. Add source-linked details consistent with the chosen c. AD 30 brief. Preserve the sense of a functioning, maintained sacred complex; avoid applying ruin-like damage everywhere. Keep crowd and shadow budgets appropriate to the much larger platform.

### Tabernacle

Improve woven linen, tent coverings, rope tension, board/metal craftsmanship and camp figures. Preserve all Exodus geometry assertions, interpretive roof/skin disclosures and the chosen cubit conversion. Keep the existing hammered-metal work where it remains useful. Improve label visibility and cloth weight before adding expensive atmospheric effects. Treat visual depiction of cloud/fire as an artistic rendering of the text, not archaeological evidence.

The shared low/balanced/high settings, source access, quiet mode, date wording and lifecycle protections are required on all sites even before their dedicated art increment. The program is complete only after all four site acceptance records are present; the pilot remains a separately deliverable milestone.

## 12. Verification

### Existing checks to run

Run these at baseline and again when relevant work is complete:

```sh
npm test -- src/components/scene src/lib/scenes.test.js src/lib/sceneAudio.test.js src/lib/sceneNarration.test.js
npm test -- src/components/atlas/Atlas.test.jsx src/components/atlas/AtlasDetailSheet.test.jsx src/components/wiki/BibleWiki.test.jsx
npm run lint
npm run build
```

Add new tests under the existing Vitest setup. The scene-directory command includes new colocated tests automatically. Run tests for any new helpers placed elsewhere explicitly. Use real Three.js for geometry/math where existing tests do; fake network, loaders and Web Audio for lifecycle tests. Never make unit tests download remote assets or require a GPU.

### Required new behavior coverage

| Area | Cases |
| --- | --- |
| Asset session | Partial success; missing/corrupt/HTML response; decoder failure; abort before/after parse; retry without duplicates; cleanup after partial boot |
| Ownership | Shared textures survive while in use; teardown disposes each owned resource once; no late attach after route generation changes |
| Quality | Width alone no longer forces low; hints/storage fallback; explicit tier preservation; auto resolution hysteresis; current composer resized/disposed |
| Materials | Color/data-map spaces, finite scaling, fallback on absent maps; no shared material mutation across unintended objects |
| Geometry/navigation | Safe vantages in every tier; house/roof stacked floors, roof opening, stair and barrier invariants; new large obstacles aligned |
| Actors | Independent skeleton/mixer state; bounded update work; LOD hysteresis; reduced motion stops both gait and travel |
| Audio | Gesture resume; failed decode fallback; late decode after dispose; mute during load; recorded/synthetic crossfade; surface footsteps; context ownership |
| Hotspots | Wall blocks label; doorway reveals it; endpoint/self tolerance; transparent exclusions; overlap priority; keyboard focus and list access |
| Periods | Matching/different/unknown years; BCE formatting; dated Atlas/Wiki CTAs; existing aliases and direct paths; Exit and browser Back restore the Atlas year; invalid return payload falls back safely |
| Assets | Local file/checksum/license validation; no mutable runtime names, dangling IDs or missing decoders |

Existing expectations that must be consciously reconciled include low-quality no-shadow tests, post-processing pass order, exact named geometries, figure/prop counts, and reduced-motion behavior. Keep the correctness requirements; update incidental counts only where assets legitimately replace procedural groups.

### Manual visual and listening review matrix

For each site, review desktop high and phone low; review the pilot at balanced as well. Include Morning, Dusk and Night, muted/sound-on, reduced motion and quiet mode.

For Capernaum, explicitly check:

1. Shore opening: boats sit in water, landscape is plausible, wet edges/foam are localized, no texture shimmer.
2. Approach courtyard: ground and people are grounded, props clear the path, no LOD pop at repeated boundaries.
3. Doorway at 0.5–2 m: masonry relief, edges, timber and pottery remain credible; lake labels disappear behind the wall.
4. Interior and roof: controlled shade, window/roof light, source labels, clear exit, no floor/roof collision regression.
5. Time switch: shadows/reflections change coherently; no daylight environment at night or baked sun conflict.
6. Tier switch during visit: position/heading/time/mute remain; tour pause is explicit; no duplicate people or disappearing structural walls.
7. Slow/offline/missing assets: base scene still enters; individual fallbacks work; late refinements do not obscure or teleport the visitor.
8. Repeated route changes and hidden-tab return: no runaway GPU/audio resources, time jumps or sound after leaving.
9. Keyboard and touch: stories remain accessible, controls fit narrow safe areas, Exit/mute remain reachable, narration/text fallback still works.
10. Listen at shore, doorway and interior: location is audible, steps match movement, transitions do not click, dialogue/narration is intelligible, mute is complete.

Tests and builds establish software behavior. This matrix establishes the sensory result. Record reviewer/device/date and any remaining findings.

## 13. Suggested delivery order

Each increment should leave the application usable and include its own relevant tests/documentation:

1. Historical/asset brief, source and license records, baseline progress log.
2. Loader, manifest validation, resource ownership and procedural fallbacks.
3. Shared quality profiles, settings and lighting/contact treatment.
4. Finished Capernaum materials/architecture/shore/boat assets.
5. Foreground actor integration and recorded environmental sound.
6. Hotspot visibility, accessible stories/quiet mode, movement and period wording.
7. Pilot performance work, completed checks and honest acceptance report.
8. Caesarea site increment.
9. Temple site increment.
10. Tabernacle site increment and final cross-site regression review.

Do not create giant unrelated refactors. Keep source prose, asset metadata and relevant implementation changes together so a reviewer can trace a visual claim to its evidence. If asset production is blocked, identify the missing asset and continue independent code work, but keep the affected content milestone incomplete.

## 14. Reference links

These constrain implementation and research; they are not blanket proof of the proposed reconstructions:

- [Three.js MeshStandardMaterial](https://threejs.org/docs/pages/MeshStandardMaterial.html): material maps and environment support.
- [Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html): supported model-loading pipeline; check compatibility against the installed version.
- [Three.js KTX2Loader](https://threejs.org/docs/pages/KTX2Loader.html): compressed texture support and renderer capability detection.
- [Custodia: Capernaum](https://www.custodia.org/en/sanctuaries/capernaum/): basalt houses, later monumental synagogue, excavation chronology and interpretive uncertainty.
- [Israel Nature and Parks Authority: Caesarea](https://en.parks.org.il/reserve-park/caesarea-national-park/): multi-period site context; obtain excavation/publication references for exact new architectural claims.
- Repository `docs/caesarea-scene.md`: current illustrative-boundary disclosure.
- Existing scene manifests and Tabernacle geometry tests: current scripture references and dimensional contracts; verify rather than assuming every historical sentence is established fact.

## 15. Ready-to-paste coding-agent instruction

> Implement `docs/biblical-scene-realism-implementation-plan.md` in this repository. Start with the complete Capernaum pilot and shared foundations (Phases 0–6), keeping the remaining site upgrades as separately reported increments. Read the current repository instructions, inspect the working tree, preserve unrelated changes, and follow the loading/resource/collision contracts in the plan. Produce actual licensed or original assets; do not mark placeholders or infrastructure alone as a finished realism upgrade. Track progress, evidence, asset provenance and validation in `docs/scene-realism-progress.md`. Preserve all four routes, scripture/tour behavior, accessibility, reduced motion and graceful fallbacks. Run the specified relevant tests, lint and build. Respect the repository’s visual-review preference and report visual/listening/device acceptance as pending when it has not been performed. Continue independent work when an asset prerequisite is unavailable and identify the exact missing deliverable. Do not commit, push, purchase or deploy without authorization from the current session. Report pilot completion separately from the full four-site program.
