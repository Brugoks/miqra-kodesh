# Ultra-realistic humans for biblical 3D scenes

Implementation handoff · September 6, 2026 · `Brugoks/miqra-kodesh`

Status: proposed work. No character implementation was changed while writing this document.

## 1. Outcome and boundaries

Replace the current primitive and static foreground people with believable, anatomically detailed, textured, rigged humans whose clothing and behavior fit each biblical setting. Target convincing real-time appearance at approximately **0.75–3 meters** on the high desktop profile, including face, hands, eyes, garment folds and movement. Preserve natural human silhouettes and purposeful motion on phones using reduced assets and effects.

“Ultra-realistic” is the visual acceptance target, not a claim that a GLB file, polygon count, AI-generated portrait or passing test achieves it. The deliverable requires both completed character art and a working rendering/animation pipeline. Offline film quality at arbitrary close-up distance on every phone is not the runtime target.

Deliver in order:

1. One reference character that passes anatomy, material, animation and in-scene lighting review.
2. A Capernaum pilot with three distinct people: net worker, courtyard worker and carrier.
3. The same runtime integrated across Caesarea, Herod’s Temple and Tabernacle with independently researched clothing and role assignments.
4. Final visual, behavioral and performance acceptance records for all four scenes.

Keep React, Vite, plain JavaScript/JSX, Three.js and the current four routes. Reuse the asset/quality/resource infrastructure already in the checkout. No engine migration, mandatory WebGPU, backend service, speech generation, face recognition, named biblical-person likeness, combat system or real-time cloth simulation is required. Do not rebuild scenery except for the lighting, ground contact and interaction props necessary to make the characters work.

This is the character-specific supplement to [the broader realism plan](biblical-scene-realism-implementation-plan.md). Its more detailed character contracts take precedence for this work; unrelated scene improvements stay outside this scope.

## 2. Verified starting point — recheck before editing

The checkout contains extensive uncommitted scene work. Preserve it and reconcile interfaces before making changes. Do not reset, regenerate unrelated assets or overwrite an in-progress implementation.

Source and binary inspection found:

| Existing component | Actual state at inspection | Implication |
| --- | --- | --- |
| `src/components/scene/sceneFigures.js` | Instanced cylinder-based robes/arms, low-resolution heads/headcloths, procedural object transforms | Keep as an emergency fallback while introducing a real character renderer |
| Capernaum fisherman GLB | 51 meshes, **0 skins, 0 animation clips, 0 images** | Static procedural assembly, not a textured skeletal actor |
| Capernaum grinder GLB | 35 meshes, **0 skins, 0 animation clips, 0 images** | Same limitation |
| Capernaum carrier GLB | 48 meshes, **0 skins, 0 animation clips, 0 images** | Same limitation |
| `capernaumAssets.js` | Clones/places these actors; no actor mixer/update implementation | Skeleton-aware cloning alone does not create a skeleton or animation |
| `sceneQuality.js` | Existing low/balanced/high profiles with `dynamicActors` 2/4/6 | Reuse the control; make the character runtime actually consume the budget |
| `sceneResources.js` | Skeleton-aware clone helper; mixer tracking checks `isAnimationMixer` | The installed `AnimationMixer` implementation has no such flag; add explicit mixer ownership/registration |
| `sceneAssets.js` | GLTF and texture loading, loaded-result caches, session disposal | Extend for character validation, in-flight deduplication, compression and complete resource cleanup |
| `Scene.jsx` | Calls `built.update(elapsed, dt)`; owns camera, quality, audio and asset session | Add camera-aware character updates and safe teardown without duplicating the render loop |

Inspected binaries were `actor-fisherman-70d229e9.glb`, `actor-grinder-97c78817.glb` and `actor-carrier-868a7ebd.glb` under `public/assets/scenes/capernaum/models/`. Re-read the current manifest if hashes change.

Existing documentation lists character clips and marks the broad pilot complete. Those records are not proof that clips exist in the shipped binary or that visual review passed. Create a separate `docs/scene-humans-progress.md` with evidence-based statuses. Correct character-related claims in existing asset documentation when replacing the assets; preserve unrelated progress history.

## 3. Readiness gate and asset production

### Required files and records

Create:

- `docs/scene-humans-assets.md`: asset inventory, provenance, license, export contract, dimensions, texture sizes, LODs and clip inventory.
- `docs/scene-humans-art-direction.md`: character lineup, historical references, approved visual targets and material/look-development notes.
- `docs/scene-humans-progress.md`: implementation/art/visual/performance statuses recorded separately.
- Editable character source files or a documented approved source location, plus reproducible export instructions. Runtime GLBs alone are insufficient for future garment, rig or clipping fixes.

Use an original sculpt/rig or a licensed realistic human base suitable for redistribution as web-delivered geometry/textures, with period clothing authored or adapted in Blender or an equivalent DCC tool. Choose the source based on anatomy, topology, rig and license, not a flattering marketplace preview. Do not introduce a required subscription, asset purchase or hosted generation API without existing authorization.

A coding agent can implement integration, validation and supporting tools. If it cannot obtain or produce a character meeting the art specification, it must identify the specific missing asset/skill/tool, continue independent coding work and leave the art milestone incomplete. More cones, boxes, generic noise textures or flat portrait billboards do not satisfy this requirement.

### Minimum completed lineup

| Deliverable | Required content |
| --- | --- |
| Reference actor | One finished full-body adult, realistic exposed skin/hands/face, believable eyes/hair, one garment set, neutral/idle/walk/turn clips and facial controls |
| Capernaum set | Three distinct adult identities with different faces, appropriate body proportions, hair/age variation and fitted garments; net-worker, courtyard-worker and carrier activities |
| Shared variation library | At least six adult identities for the four-site rollout, including varied ages and genders; more than recolors of one head |
| Site wardrobe sets | Capernaum household/fishing roles, Caesarea port roles, Temple visitor roles, wilderness camp roles; reuse garment pieces only when the reference brief supports it |
| Interaction props | Correctly scaled net tools, work implement and carried vessel/basket with authored grip/contact locations |
| Detail levels | LOD0, LOD1 and LOD2 for each outfit/identity combination that ships; all preserve identity, clothing silhouette and compatible rig semantics |

Anonymous ordinary people are sufficient. Priestly vestments or identifiable ritual actions require a separate sourced brief before inclusion. Avoid defaulting everyone to the same robe/headcloth or projecting a modern regional costume into every ancient setting. The current single height/skin/headcloth constants are implementation shortcuts, not demographic evidence. Use plausible individual variation without claiming that anatomy or complexion is uniquely determined by ethnicity or biblical role.

Record historical claims with source URLs/publication pages and distinguish archaeological, textual, comparative and artistic choices. Research clothing construction, drape, footwear, head covering and tools for each period. Exodus-era and first-century attire are not interchangeable by default.

## 4. Character art specification

### Anatomy and topology

- Continuous sculpted anatomy with plausible skull, cheek, jaw, eyelid, ear, lip and neck forms. Slight asymmetry; no detached geometric nose, rectangular ears or painted-on facial anatomy.
- Hands have believable palms, knuckles, separated fingers, nails and articulated thumbs. Feet/ankles and sandal contact must hold up at walking distance.
- Clean deformation topology at shoulders, elbows, wrists, hips, knees, mouth and eyelids. Check sitting, kneeling, reaching, gripping and turning, not just an A-pose.
- Garments fit each body. Remove or mask covered body polygons only where every required pose remains valid. Fix visible intersections in art/weights/correctives rather than hiding them with a blanket opacity trick.
- Maintain real size in meters. Uniform body scaling is allowed in a narrow authored range; extreme scaling of a single body/head is not a variation system.

### Skin

Supply authored or capture-derived albedo with no baked directional lighting; tangent-space normal detail at appropriate scale; roughness/specular variation; restrained AO; and a documented optional thickness mask for the chosen skin-lighting approximation. Use skin-specific maps, not stone/cloth noise. Wrinkles and pores must remain subtle at the target distance.

Skin is dielectric: metalness is zero. Avoid wet plastic faces, black pore outlines, uniform orange tint and baked dark circles that remain under every light. Define material presets by asset; arbitrary global tinting cannot create a credible new complexion from one texture.

### Eyes, mouth and hair

- Eyes need correctly placed globes, iris/pupil appearance, sclera tint, eyelid coverage and contact at the inner corners. Eyelids must close fully. Use a modest glossy corneal surface or equivalent economical material treatment; whole-scene transparency/refraction is not mandatory.
- Include mouth cavity, inner lip shading and teeth only where a required expression reveals them. No open-mouth idle without a finished interior. Lip-sync is outside scope.
- Use authored hair/beard cards or economical meshes with coherent direction, depth, hairline and side/back silhouettes. Preserve believable scalp coverage when cards mip down.
- Prefer tested alpha-cutout coverage for hair; sort-dependent transparency and excessive double-sided layers can dominate cost. Verify color, depth and shadow silhouettes together. Cards must not cast rectangular opaque shadows.
- Add eyebrows/eyelashes selectively; eliminate expensive small features in reduced tiers before sacrificing face shape.

### Clothing

Use sculpted/simulated folds baked into the mesh/maps, functional seams, believable hems, garment thickness and fastening. Folds must correspond to gravity, elbows, sitting, belt tension and carried loads. Fabric weave is material detail, not exaggerated ridges visible across the courtyard.

Drive motion with skeletal weights, corrective shapes and a few baked secondary bones. Author wind/cloth variation into reusable clips only where useful. Avoid uniform sine-wave waving of entire tunics. Skinning must not turn skirts into rigid trousers or cause cloth to slice through thighs during walking.

## 5. Export contract and validation

Use GLB, +Y up, meters, a documented forward axis and a root at ground level. Applied transforms; no negative object scale or exporter-dependent hidden rotations. Standardize one humanoid rig for the initial set; retarget incompatible source animations offline and bake them into the canonical rig.

Required rig semantics: root, pelvis, spine/chest/neck/head, clavicles/arms/hands, legs/feet/toes, eyes, and finger chains for gripping actors. Use semantic mappings in metadata rather than hardcoding one vendor’s bone names throughout the runtime. Ship approximately 60–90 deform bones for the reference asset; higher counts require a measured need. Limit vertices to four normalized joint influences in the initial pipeline.

All detailed assets must contain actual `skins`, valid skin indices/weights, bind matrices and usable animation clips. Export face morph targets for left/right blink and limited natural expression; jaw/mouth controls only where used. Exported eyes may use bones; record their mapping.

Use GLTFLoader-compatible PBR materials and named slots such as `skin`, `eyes`, `hair`, `cloth`, `leather`. Runtime-only shaders must be reapplied through a tested material factory after loading; do not assume a DCC procedural shader survives export.

Prefer KTX2/Basis compressed maps with mipmaps. Support the existing texture path until compressed loader support is complete. Use explicit versioned decoder paths under `/assets/`, with capability detection and graceful decode failure. Retain immutable content-hashed filenames under `public/assets/scenes/shared/humans/` and site wardrobe directories. Reuse the current service-worker/SPA contract; no cache rewrite is needed solely for characters.

Proposed semantic character definition in `sceneHumanManifest.js`:

```js
{
  id: 'galilee-net-worker-a',
  modelIds: { lod0: 'human-a-lod0', lod1: 'human-a-lod1', lod2: 'human-a-lod2' },
  rigId: 'miqra-adult-v1',
  heightMeters: 1.69, // this individual, not a historical population average
  forwardAxis: '+Z',
  clips: { idle: 'idle', walk: 'walk', turnLeft: 'turn-left', work: 'mend-net' },
  morphs: { blinkLeft: 'blink_L', blinkRight: 'blink_R' },
  sockets: { rightGrip: 'hand_R_grip', leftGrip: 'hand_L_grip' },
  locomotion: { walkMetersPerCycle: 1.25 }, // measured from this authored clip
  materialPreset: 'human-a',
  sourceIds: ['human-a-license', 'galilee-clothing-brief'],
}
```

Names and height above are examples, not existing assets. Runtime manifest IDs must resolve through the actual asset session. Store file sizes, checksums, licenses, meshes/material slots, texture dimensions and triangle counts in the validated asset inventory.

Extend `scripts/validate-scene-assets.js` or add a focused `scripts/validate-scene-humans.js`. Validate actual GLB contents, not only metadata assertions:

- Required skins, clips, morph/socket/bone names; animation tracks resolve to real nodes.
- Finite geometry/transforms; nonzero bounds; real-size height; normalized weights and valid indices.
- Required maps/materials, LOD availability, metadata/file checksum agreement and license records.
- Clip duration, intended loops, grip/contact markers and measured movement distance.
- No required asset silently replaced by a zero-skin procedural export.

Reject invalid replacements while retaining a working procedural fallback. Fail the character content gate until the replacement is repaired.

## 6. Runtime design and integration

### File responsibilities

| File | Work |
| --- | --- |
| `sceneHumanManifest.js` — new | Character variants, clips, rig/slot mapping and source IDs |
| `sceneHumanMaterials.js` — new | Skin/eye/hair/cloth factories and optional skin-light response |
| `sceneHumanAnimation.js` — new | Activity states, locomotion phase, facial/gaze schedule, grip/ground adjustment |
| `sceneHumans.js` — new | Actor registry, skeleton-aware instantiation, LOD/budget selection, update and disposal |
| `sceneHumanPlacements.js` — new | Stable placement IDs and scene-specific role/route mappings, using existing dimensions |
| `sceneFigures.js` — extend | Stable IDs and per-actor fallback visibility; retain procedural behavior for emergency/distant fallback |
| `sceneAssets.js`, `sceneAssetManifest.js` — extend | Validated shared/site character groups, in-flight request deduplication and compressed texture/GLB dependencies |
| `sceneResources.js` — fix/extend | Explicit mixer/skeleton/texture ownership and deduplicated cleanup |
| `capernaumAssets.js` — refactor actor branch only | Remove static actor placement duplication; delegate to shared human system |
| Four `build*.js` modules — integrate | Supply placements, floor/route access and human runtime lifecycle hooks |
| `Scene.jsx`, `sceneQuality.js`, `sceneLighting.js` — integrate | Camera/quality/time/reduced-motion input and required lighting support |

Instantiate one human system per active scene visit, not one independent system per load group. Builders retain their current responsibilities; add an optional `humans` handle with:

```js
{
  acceptAssets(group),
  update({ elapsed, delta, camera, qualityProfile, reducedMotion }),
  setQuality(profile),
  dispose(),
}
```

Call `built.humans?.update(...)` exactly once in the existing route frame loop. Do not also advance its mixers from `built.update`. Keep `built.update(elapsed, dt)` for scenery and legacy fallback motion. Choose one teardown owner and document it: the route stops/disposes the human system before disposing the builder and asset session.

### Identity and replacement

Give every eligible person a stable placement ID independent of array order, tier or download timing. Store identity, activity, position/route, facing, floor context, prop attachments and fallback ID in a shared descriptor.

A loaded actor replaces a specific fallback ID atomically after validation; it does not add a second person to the crowd. Add explicit per-ID suppression to `createCrowd`, updating all associated instances together. Do not hide an entire crowd to replace three people, or repeatedly scale a suppressed instance from its previous matrix. Keep the mapping valid when instance slots are compacted/reordered.

Keep existing `gather`/`scatter` composition where useful. Stable seeded assignment chooses identities, garments and timing once per visit/placement; quality changes must not change a person’s face or clothing.

Use `SkeletonUtils.clone` on the root containing all bones. It clones bones but shares geometry/material references, so clone materials only for intended per-actor variation. Give each independently animated actor its own mixer. Use the same canonical clip set across compatible LOD skeletons and preserve normalized activity/gait phase when switching. Prefer one active LOD skeleton/mixer per actor; a prepared replacement starts in the matching pose before the switch. Do not run three complete mixers permanently for one actor.

### Lifecycle requirements

- Deduplicate **in-flight** model/texture requests; caching only completed results allows concurrent clones to trigger duplicate work.
- Asset session owns shared textures/geometries and source scenes. Human runtime owns its mixers, cloned skeleton resources, explicitly cloned materials and actor groups.
- Replace the current `isAnimationMixer` detector with explicit `trackMixer` or equivalent registration. Stop actions and uncache roots during teardown.
- Track additional skin/eye/hair material maps and custom uniform textures; the existing six-map list is insufficient. Dispose unique cloned skeleton bone textures once, without disposing shared geometry under another actor. Release loader-created image resources only after the last owner releases them and where the loader requires it.
- Generation tokens plus disposal guards prevent late attachment after a route change. An AbortController without a signal reaching the request does not cancel that request; uncancellable parsing must still dispose late results.
- Detach loaded actor groups before a builder’s traversal disposer. Dispose shared loaded resources after all actor instances stop using them.
- Pause simulation on hidden tabs; resume without applying the whole hidden interval. Quality changes preserve visit, activity and clip phase.

## 7. Animation and interaction

Use authored motion with an explicit small state machine:

`idle ↔ walk → decelerate/turn → walk`, plus role-specific `work ↔ rest` and `carry-idle ↔ carry-walk`.

Map legacy standing/talking/attending/praying/bowing/sitting/carrying/working/kneeling/walking activities to a validated clip or intentional alternative. Unsupported clips must select a believable idle, not a T-pose. Do not silently treat ordinary idle as successful delivery of a required task animation.

Requirements:

- Use in-place walking with runtime translation and exported meters-per-cycle metadata. Gait phase derives from actual traveled distance. Cap playback-rate adaptation to a believable range; select a matching gait before extreme stretching.
- Existing procedural `figure.speed` is a route-cycle factor, not meters per second. Convert intentionally through route length; do not reuse its value as physical walking speed.
- Author turn-in-place/turning transitions; do not rotate 180° instantly at a route endpoint. Crossfade approximately 0.15–0.35 seconds initially, tuned per action.
- Ground actors through existing `floorAt`/floor context, including stacked roofs/interiors. Preserve the actor’s prior floor level; do not use the camera’s floor for every actor.
- Add restrained foot planting and pelvis adjustment for near actors where the terrain warrants it. Keep adjustments within joint limits. Fix large path/floor errors rather than stretching legs to hide them.
- Attach loads to named grip sockets. Work props have authored local contact anchors. Use baked matching poses first; add limited two-bone arm adjustment only where needed. Hands must not hover through jars or nets.
- Procedural facial additions are subtle: independent blinks, breathing, occasional gaze shifts, slight expression changes. Limit head/eye angles and distribute gaze naturally; avoid every person continuously staring at the visitor.
- Build the final pose in a documented order: base clip, transition/additive layers, locomotion/root placement, contact corrections, then gaze/facial overlays. Avoid the mixer overwriting IK or eye adjustments on the same frame.
- Separate seeded expression schedules from frame rate. Additive clips need compatible reference poses; do not add an absolute pose as an additive layer.
- Reduced motion freezes a plausible authored pose, gaze and secondary motion; pause actor translation with its gait. Keep visitor controls and story access available. Resume from preserved simulation time.

Use a small movement-clearance radius per actor so the visitor cannot put the camera through a face/torso. Integrate it as a bounded nearby-capsule query alongside existing navigation; preserve wall sliding and allow movement away if a moving actor overlaps the visitor. Give actors yielding/paused movement near the visitor, and keep authored routes out of narrow required doorways. Do not make skinned meshes the walk collision model.

The current camera near plane must be audited for the 0.75–3 m target; if it clips faces at legal approach distances, adjust modestly and test scene-scale depth precision. Do not shorten camera distance by teleporting the visitor or turning on a hidden cinematic zoom.

## 8. Skin rendering and lighting

First achieve correct geometry, texture scale and PBR response with `MeshStandardMaterial`/selective `MeshPhysicalMaterial`. Physical material features cost more per pixel and need appropriate environment lighting; apply expensive features to near actors only. Use restrained cloth sheen and eye gloss where they improve the reference render. [Three.js material documentation](https://threejs.org/docs/pages/MeshPhysicalMaterial.html).

The installed `MeshPhysicalMaterial` does not expose a general skin subsurface-scattering parameter. Its transmission/thickness controls are not a drop-in skin diffusion model. Do not set skin transmission high and call the result subsurface scattering.

For the high-profile reference actor, implement and evaluate a **thickness-masked diffuse/backlighting approximation** as a separate optional material extension after base PBR passes review:

- Treat it as a visual approximation, not physically complete skin diffusion.
- Use a properly authored mask and linear-space lighting; restrict the effect to plausible thin areas such as ears and nose edges.
- Respect light intensity/direction, visibility and shadows; skin must not glow in unlit rooms or through opaque walls.
- Keep energy gain bounded and default skin opacity opaque. A red emissive rim is not acceptable.
- Preserve existing skinning, morph targets, tangents, fog and output-color chunks. Version/parameterize the shader cache key and avoid leaking one actor’s uniforms into another material.
- Compile and evaluate with the installed renderer. If the extension fails, return to the accepted PBR material without breaking the scene. Record the visual tradeoff; do not claim the extension passed based only on source-string tests.

Do not introduce full-screen skin diffusion in the first implementation. It adds masks, depth/normal handling and a separate performance risk before the core character art is proven.

Use the existing scene sun/time settings plus coherent prefiltered environment response. Audit whether environment illumination is actually assigned in the current renderer; quality/profile definitions alone do not provide it. Ensure eye highlights and skin response work at Morning, Noon, Dusk and Night. Shadowed faces should retain shape; night should not retain daylight reflections. Avoid a bright camera-following light that makes actors appear lit separately from the world.

Contact shadows beneath feet and believable clothing self-shadowing are required. Low quality may use inexpensive contact approximations. Reduce effects in this order when constrained: extra eye/refraction layers, skin approximation, hair layers, tiny facial features, distant detail. Preserve anatomy and primary textures.

## 9. Detail levels, culling and budgets

The numbers below are starting limits to measure and refine, not a promise that they produce realism or a recorded performance result.

| Representation | Intended use | Initial geometry / materials | Motion |
| --- | --- | --- | --- |
| LOD0 | Near focal actor, roughly 0.75–5 m | 45–75k triangles including clothes/hair; aim 5–7 material draws | Full pose at render rate, face/contact corrections |
| LOD1 | Roughly 5–15 m or constrained near actor | 15–25k triangles; aim ≤4 material draws | Skeletal motion, simplified face/contact work |
| LOD2 | Roughly 15–35 m | 3–6k triangles; aim ≤2 material draws | Lower-frequency skeletal updates with correct time accumulation |
| Distant crowd | Beyond ~35 m and small on screen | Authored low-detail silhouettes/rigid posed variants, instanced where useful | Sparse updates/posed variation |

Use projected screen size as well as distance and quality; distance alone fails with zoom/FOV changes. Add roughly 15–20% hysteresis and a short minimum tier residence time. Preserve identity/pose and avoid distracting visible switches. Ordinary `InstancedMesh` does not provide independent skeletal animation automatically; do not describe it as a skinned-crowd solution without implementing the necessary skinning strategy.

The current 2/4/6 `dynamicActors` values cap expensive foreground evaluation, not the existence of all other humans. On high, initially allow at most two simultaneous LOD0 characters, with the other foreground slots using LOD1. Low uses LOD1/LOD2 with two actively detailed nearby actors. Other visible people retain an authored reduced representation and simpler motion, not empty space or close-up cones.

Prioritize by projected size/proximity, visible activity and hysteresis. If a visitor approaches a previously distant person, promote that same identity. Author initial groups so the nearest cluster fits the budget; a crowded Temple view must still degrade gracefully if it exceeds it. Never hide nearby people merely to meet the cap.

Use conservative animation-aware bounds: either exported bounds that contain all required clips/corrections, or verified dynamic bounds. Rest-pose bounds can cull reaching hands and kneeling bodies. Reuse the actor bounds for broad culling; do not recompute every skinned vertex’s world bounds for every actor every frame unnecessarily. [SkinnedMesh documentation](https://threejs.org/docs/pages/SkinnedMesh.html).

Texture starting limits: 2K skin/head maps, 2K outfit maps, 1K hair/eyes where sufficient; 4K head maps only for the reference actor if the close view demonstrates a need. Prefer dedicated reduced texture packages for low so downloading every LOD0 map is not its startup cost.

Measure unique resident resources, not texture references. A 2048² RGBA8 map with full mipmaps is approximately 21.3 MiB before GPU compression; albedo, normal and packed data maps alone can therefore be costly. KTX2 transfer size, GPU storage and decoded source-image memory are different metrics.

Proposed character-only incremental budgets for the Capernaum set:

- First visible replacement: ≤8 MiB additional transfer; all pilot humans ≤25 MiB high, ≤10 MiB low.
- Resident character texture estimate: ≤128 MiB high, ≤64 MiB low; share appropriate wardrobe textures without cloning every map per person.
- Near-character update CPU: aim p95 ≤3 ms on the reference laptop, ≤5 ms on the reference phone. Measure separately from total frame time.
- Whole-scene frame target after warmup: p95 ≤16.7 ms desktop high, ≤33.3 ms phone low, subject to a named real device and fixed effective resolution.

These consume the broader scene’s budgets; they do not stack invisibly on top of them. Reconcile total transfer/memory targets with the general plan and record any justified revision. Never reduce render resolution silently and report the resulting FPS as an equivalent-quality win.

## 10. Delivery phases and completion gates

### H0 — baseline and art contract

Read current instructions/diffs; inspect actual GLBs; record baseline counts and interfaces. Produce the character asset/art specification and select a source/authoring approach. Obtain one inspectable rigged reference model with its actual clips/maps before bulk integration. Gate: valid reference asset and explicit outstanding art tasks.

### H1 — prove one character

Integrate one character in a development-only character inspection route or fixture, lazy-loaded and absent from production navigation. Provide neutral/morning/night light, front/side/back views, idle/walk/work selection, map toggles, LOD toggle and a one-meter scale marker. Reuse existing styles and renderer conventions; this is a review tool, not a new product feature.

The maintainer reviews it under the repository’s current visual-review preference. Accept anatomy and neutral-light materials before compensating with cinematic grading. Gate: valid export plus visual pass for face, hands, hair and clothing; animation deforms correctly. If visual review is pending, state that explicitly while continuing independent runtime work.

### H2 — production character runtime

Implement validated loading, per-ID replacement, real mixers, ownership, activity logic, LOD and budget integration. Fix the current mixer-registration issue. Add behavior/lifecycle tests. Gate: one actor animates independently in the actual scene, fallback is not duplicated, failed loads are safe and repeated visits release resources.

### H3 — Capernaum trio

Ship the three finished identities with role props, mending/working/carrying clips and fit to existing floors/routes. Add limited gaze/blink/contact correction and required environment lighting. Replace the old static actor branch. Gate: complete trio, high/low/reduced-motion behavior, no floating hands/feet, no close-up primitive replacements after successful load.

### H4 — four-site integration

Apply the same runtime to selected near people in Caesarea, Temple and Tabernacle. Produce period/role-appropriate wardrobe assets and clip mappings. Keep crowds and access boundaries intact. Gate: all four route integrations have actual character assets and acceptance records; Capernaum-only delivery is explicitly partial.

### H5 — optimization and final acceptance

Run the full verification matrix, asset validator, relevant tests/lint/build and performance measurements. Deliver progress, provenance, export instructions and any approved visual limitations. Mark engineering, art, historical review, visual review and device verification individually. No “ultra-realistic complete” based only on tests or a written inventory.

Commit/push/deploy or paid purchases require authorization from the implementing session. Ordinary reversible code/asset work within scope should continue without repeated confirmation requests.

## 11. Required tests and review matrix

Run the baseline scene suite, then tests appropriate to each increment. Existing package scripts are:

```sh
npm test -- src/components/scene src/lib/scenes.test.js src/lib/sceneAudio.test.js src/lib/sceneNarration.test.js
node scripts/validate-scene-assets.js
# Add/run the human-specific validator when implemented:
node scripts/validate-scene-humans.js
npm run lint
npm run build
```

Existing failures must be recorded and separated from regressions. Do not run a nonexistent human validator before creating it. Use real Three.js math/geometry where supported; mocked loaders for network/late-result tests. Do not make unit tests depend on remote asset downloads, paid services or WebGL.

New coverage must include:

- Actual reference assets have skins, expected clips/maps and valid tracks; the current static GLBs fail the new content gate.
- Two actors cloned from one source animate independently while intentionally sharing geometry/textures.
- Replacing ID A suppresses only A’s fallback; ID B remains; repeated group arrival is idempotent.
- In-flight request deduplication, corrupt model/maps, unsupported decoder, late success after disposal and partial boot failure.
- Explicit mixer registration; stop/uncache, skeleton resource disposal and shared maps freed only by their owner.
- LOD/quality switches preserve identity, normalized clip phase, placement and held props; actual 2/4/6 limits are enforced.
- Motion uses distance, correct floor context and transition turns; reduced motion/hidden tabs do not leave sliding frozen actors.
- Blink/gaze limits and additive/contact layers do not introduce nonfinite transforms or cross-actor state leakage.
- Conservative bounds contain all required poses; reaching actors do not disappear under culling.
- Actor clearance preserves navigation, required doorway access and escape from initial overlap.
- Material spaces, skin metalness zero, independent optional shader uniforms and safe shader fallback.

Human visual acceptance, recorded at 0.75 m, 1.5 m, 3 m and wider scene views:

| Inspection | Pass condition |
| --- | --- |
| Face front/profile/backlit | Plausible anatomical forms; no primitive seams, orange wax or glowing ears in shade |
| Eyes/blink/gaze | Eyelids cover eyes; eyes move within believable limits; highlights fit the scene |
| Hair/beard | Credible silhouettes from multiple angles; no opaque card rectangles or shimmering gaps |
| Hands and props | Correct grip/contact and scale; articulated thumbs/fingers; no hovering or penetration |
| Walk/turn/stand | Feet plant, gait matches distance, turns decelerate naturally, no torso snapping |
| Sit/kneel/work | Garments deform correctly and bodies retain volume; folds match support/contact |
| Scene lighting | Actor belongs in the scene at Morning/Noon/Dusk/Night and in interior shade |
| Quality/LOD | Stable identity and pose, smooth representation changes, no cones nearby after successful load |
| Reduced motion | Calm plausible still poses, no locomotion or gaze movement while frozen |
| Crowds | Independent timing and credible grouping; foreground budget does not erase other people |

`CLAUDE.md` currently reserves visual verification to the maintainer. Do not spend the implementation session driving a browser unless the user authorizes it; deliver the inspection fixture, exact routes/steps and pending matrix instead. Automated tests cannot substitute for that acceptance, and lack of review must not be represented as failure or success.

For performance, record device/browser/GPU, viewport, tier, effective pixel ratio, visible actor counts, LOD distribution, draw calls, geometry, resident texture estimates and asset versions. Use a repeatable 60-second walk after warmup; report median/p95 frame and character-update times. Hardware unavailable means unverified. Inspect repeated scene visits for resource growth; renderer counters are counts, not a precise memory-byte report.

## 12. Reference and handoff

Primary implementation references, checked during planning; verify against the installed lockfile version before coding:

- [Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html): runtime model loading.
- [Three.js SkeletonUtils](https://threejs.org/docs/pages/module-SkeletonUtils.html): skeleton-aware cloning shares geometries/materials while cloning bones.
- [Three.js AnimationMixer](https://threejs.org/docs/pages/AnimationMixer.html): independent playback, actions and cleanup APIs.
- [Three.js SkinnedMesh](https://threejs.org/docs/pages/SkinnedMesh.html): skinning attributes and animated bounds.
- [Three.js MeshPhysicalMaterial](https://threejs.org/docs/pages/MeshPhysicalMaterial.html): material features and cost; it does not document a general-purpose skin diffusion control.
- Existing `docs/scene-realism-sources.md` and scene manifests: starting historical references, to be checked claim by claim rather than accepted wholesale.

### Ready-to-paste instruction for the implementing agent

> Implement `docs/ultra-realistic-scene-humans-implementation-plan.md`. Inspect the current uncommitted work and actual actor GLBs first; preserve unrelated changes. Reuse the existing scene asset/quality infrastructure and implement the shared character runtime, starting with one finished reference human, then the Capernaum trio, then all four sites. Real anatomy, textures, skeletons, clips and believable clothing are required deliverables; primitive mesh assemblies and declared-but-missing clips do not meet the quality gate. Validate the binaries and licenses, fix lifecycle/mixer ownership, integrate per-person replacement and enforce detail/performance budgets. Record engineering, art, visual/historical review and real-device verification separately in `docs/scene-humans-progress.md`. Continue independent work if an art prerequisite is unavailable and name the precise missing deliverable. Respect repository visual-review preferences, run appropriate tests/validators/lint/build, and report pending acceptance honestly. No engine rewrite or unrelated scenery work. Do not purchase, commit, push or deploy without authorization in this session.
