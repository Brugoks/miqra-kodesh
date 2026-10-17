# Claude Sonnet implementation plan: richer, more human biblical environments

Prepared 2026-10-14 for Miqra Kodesh. This is an implementation handoff, not a record of completed enhancements. Repository inspected at `c1d05cd`; recheck the current branch before editing.

## 1. Objective and implementation contract

Improve the eight existing 3D environments with more believable people, varied period-appropriate clothing, everyday objects, regional vegetation, and restrained environmental detail. Use free, redistributable assets and free authoring tools. Human anatomy, clothing fit, and consistency across viewing distances are the first priority.

Work in plain JavaScript/JSX and the existing Three.js architecture. Implement a complete Capernaum pilot before extending shared changes to other scenes. Deliver working assets, integration, provenance, and validation; downloading asset packs alone does not complete a phase.

Read `CLAUDE.md` first. Follow its preference for headless verification and maintainer visual review: do not spend the session driving a browser or taking layout screenshots. Shader changes still need actual WebGL compilation where the repository requires it. Report unmeasured visual or device-performance criteria explicitly.

Preserve navigation, scene coordinates, biblical dimensions, priestly garment requirements, reduced-motion support, offline/failure fallbacks, and existing quality limits. Keep named tableau characters and the visitor avatar out of the initial crowd pilot. Inspect concurrent character work before extending shared changes to them. Do not rewrite unrelated UI, backend, or deployment systems.

Implement on the appropriate working branch, preserving other contributors' changes. A previous push request is not a standing instruction to publish every future change: this handoff does not request deployment, merging, or pushing the implementation.

## 2. Current foundation: extend these systems

The code already has downloaded character assets, material scans, localized audio, hero foliage, and near/far human rendering. Older architecture prose describing six procedural-only scenes is incomplete; use the current registry, manifests, and source files for the asset inventory.

| Area | Existing entry points | Required approach |
| --- | --- | --- |
| Scene registry and tiers | `src/components/scene/sceneModules.js`, `sceneQuality.js` | Inventory all eight routes; preserve per-scene actor limits and adaptive resolution. |
| Character authoring | `scripts/humans/sources.json`, `fetch_sources.py`, `build_characters.py`, `package_characters.mjs` | Extend pinned sources and reproducible presets; regenerate assets through the pipeline. |
| Identity and materials | `sceneHumanAppearance.js`, `sceneHumanMaterials.js`, `sceneHumanManifest.js`, `sceneHumanAssets.js` | One deterministic identity drives anatomy, appearance, and both rendering distances. |
| Clothing | `sceneHumanWardrobe.js`, `sceneHumanDress.js`, `sceneHumanHats.js`, `sceneHumanCloth.js`, `sceneHumanDrape.js` | Preserve the newer role/headwear/drape systems and their tests; improve fit and assets through their existing interfaces. |
| Human rendering and motion | `sceneHumans.js`, `sceneInstancedHumans.js`, `sceneLivingCrowd.js`, `sceneHumanAnimation.js`, `sceneHumanAttachments.js`, `sceneHumanSafety.js` | Preserve near/far identity, baked animation compatibility, attachment sockets, and motion safety. |
| Asset loading and materials | `sceneAssets.js`, `sceneSurfaces.js`, `sceneMaterialAssets.js`, `scripts/prepare-scene-materials.mjs` | Preserve lazy loading and procedural fallback. Generated manifests come from scripts. |
| Objects and vegetation | `sceneProps.js`, `sceneFoliage.js`, `sceneLandscape.js` | Extend batching and instancing; keep cheap distant representations. |
| Sound and evidence | `src/lib/sceneAudio.js`, `src/components/scene/sceneAudioManifest.js`, `sceneSourcesData.js`, `scripts/prepare-scene-audio.py` | Reuse positional sound and the source/evidence presentation. |

Except where a full path is shown, runtime files above are under `src/components/scene/`. Read `docs/scene-realism.md`, `docs/scene-humans-assets.md`, `docs/scene-humans-art-direction.md`, and `docs/scene-realism-sources.md` before implementation.

## 3. Resources to leverage explicitly

These are selected providers and authoring inputs. Individual model, texture, and recording IDs must be selected and pinned during acquisition; this plan does not claim that a particular historical object is available in every catalog. License and historical suitability are separate checks.

| Resource and authoritative link | Use in this implementation | Rights and selection rule |
| --- | --- | --- |
| [MakeHuman / MPFB asset packs](https://static.makehumancommunity.org/assets/assetpacks.html) | Primary character pipeline. Extend existing system assets, Dress 01, and Bodyparts 05 with natural Skins 01/02, Eyebrows 01, and suitable Hair 01 assets. Evaluate the CC0 anatomy targets for hands, ears, cheeks, and noses. | These named packs are listed under CC0. The catalog also contains CC-BY packs; record the actual pack license. Hair 01 is often stylized: reject unsuitable styles and author a replacement on the existing rig. Dress assets are starting geometry, not evidence of ancient clothing. |
| [Blender Studio Human Base Meshes](https://www.blender.org/download/demo-files/#assets) | Anatomy reference and, where useful, source geometry for sculpting/baking face, hand, and foot detail. Evaluate one candidate alongside the MakeHuman pilot. | The Human Base Meshes bundle is CC0; other demo bundles differ. These are not finished historical, clothed, animated people. Keep the existing production skeleton in the first release. |
| [ambientCG](https://ambientcg.com/) · [license](https://docs.ambientcg.com/license/) | Fill specific gaps in coarse fabric, leather, clay, earth, and worn surfaces after auditing existing maps. | CC0 assets. Choose materials by physical weave, grain, and scale; a modern scan does not establish historical use. |
| [Poly Haven](https://polyhaven.com/) · [license](https://polyhaven.com/license) | Extend the provider already used by the project: compatible rock/debris models and missing surface maps. Use HDRIs as authoring/lighting references initially. | Assets are CC0. Preserve the scene's compass-based sky and time-of-day lighting; do not replace it with a fixed HDRI. |
| [The Base Mesh library](https://www.thebasemesh.com/model-library) · [FAQ](https://www.thebasemesh.com/faq) | Starting geometry for simple containers, tools, furniture, or accessories where a suitable model exists; reshape against archaeological references. | Library models are CC0. Mesh availability and historical authenticity must each be checked. Author simple geometry locally when no suitable asset exists. |
| [Smithsonian Open Access](https://www.si.edu/openaccess) · [3D collection](https://3d.si.edu/) | Optional reference or source mesh for one or two date- and region-matched objects. Retopologize and bake any selected scan. | Use only a download explicitly marked CC0. Skip if the catalog has no suitable object; museum ownership does not make an object appropriate to these scenes. |
| [The Met Open Access](https://www.metmuseum.org/hubs/open-access) | Reference images and object metadata for pottery profiles, lamps, textile fragments, and accessories. Store accession IDs, dates, place, and interpretation. | Eligible Open Access images are CC0. This is a reference source, not a promise of downloadable game-ready meshes. |
| [Sapling Tree Gen](https://extensions.blender.org/add-ons/sapling-tree-gen/) | Free Blender authoring tool for species-informed olive, fig, and terebinth branch structures; save deterministic presets and export optimized geometry. | GPL authoring software. Record the tool license separately from any imported textures or presets; do not label all inputs CC0. Check compatibility with the installed Blender version. |
| [Freesound](https://freesound.org/) · [license FAQ](https://freesound.org/help/faq/) | A small set of missing localized sounds: rope, baskets, pottery, footsteps, or appropriate birds. | Select CC0 or CC-BY recordings only and preserve required attribution. Exclude NC recordings and audible modern machinery/speech. If an account is required and unavailable, retain existing audio and report the unavailable candidate. |
| [glTF Transform](https://gltf-transform.dev/cli) · [source/license](https://github.com/donmccurdy/glTF-Transform) | Reproducible mesh/texture optimization, meshopt compression, and a measured KTX2/Basis pilot. | MIT tooling. Pin versions, preserve licenses of inputs, and install encoder dependencies explicitly. Optimization must preserve runtime-required bones, nodes, skinning, and animation. |

Use the current animation library before seeking more animation services. Keep its separate source and license records; a CC0 character mesh does not make an attached animation CC0. Do not introduce paid-generation APIs, trial-dependent assets, or extractable marketplace assets with incompatible redistribution terms.

Historical references to consult alongside museum records:

- [Orit Shamir, textiles from Mo'a](https://publications.iaa.org.il/atiqot/vol50/iss1/6/): comparative evidence for textile materials and construction in its own place and period.
- [Sukenik et al., Timna dyed textiles](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0179014): evidence for dye use in a specific archaeological context, not a complete wardrobe specification for every biblical era.
- Existing scene sources and cited biblical passages: authoritative constraints for scene-specific design, especially priestly garments and Tabernacle measurements.

## 4. Phase 0 — inventory, provenance, and a measured baseline

First read the relevant builders and tests. Record scene routes, actor variants, garment roles, loaded asset groups, download sizes, mesh counts, triangle counts, texture sizes, and current validation results in `docs/scene-enhancement-progress.md` (new). Do not reuse earlier test counts as evidence for the current branch.

Extend existing source registries rather than creating an unrelated parallel asset framework. Add a small prop/vegetation source registry only if neither existing manifest fits. Every acquired input needs: stable ID, original URL, creator, license identifier and evidence URL, retrieval date, source SHA-256, intended scene/period/geography, and whether it is a reference or shipped asset. Generated outputs need paths, hashes, dimensions, quality tier, authoring tool versions, and transformation recipe. Keep raw large downloads in the existing ignored cache and publish only the necessary optimized outputs and credits.

Record historical confidence independently as attested, probable, inferred, or illustrative, with a supporting reference. Do not present estimated social-role frequencies, colors, or facial features as established historical facts. Use varied individual features; do not tie moral character or occupational status to skin tone or facial structure.

**Exit criteria:** inventory covers all eight scenes; sources have a documented acquisition path; baseline validators/tests have been run; the first Capernaum pilot is identified in the progress document. Missing external assets have a local-authoring or existing-asset fallback.

## 5. Phase 1 — small optimization pilot

Before bulk acquisition, optimize one static prop and one representative material set with glTF Transform. Compare download bytes, decoded geometry, texture memory estimates, and actual loading behavior. Keep this pilot bounded so it does not delay improvements to people.

The current loader does not wire meshopt or KTX2 decoding, and `scripts/validate-scene-assets.js` currently excludes `.ktx2`. Adding compressed files therefore requires the corresponding loader configuration, locally hosted decoder/transcoder dependencies, extension/MIME handling, manifest schema changes, and tests. Check current Three.js documentation for the installed version when implementing.

Prefer meshopt as the initial mesh path; do not add multiple compression formats without measured benefit. Keep existing WebP/uncompressed assets as explicit fallbacks during migration. Load only the chosen variant; do not fetch both formats by default. Cover unsupported compression, failed decoder fetch, corrupt assets, and interrupted scene loading. Preserve session ownership of shared geometry, textures, and materials when scenes dispose.

For KTX2, evaluate color maps and normal maps separately; normal maps must not become sRGB. Keep the established physical texture scale and linear-color calculations. If compression is incompatible or does not produce a useful saving, document the result and ship the established format while continuing the rest of the plan.

**Exit criteria:** one reproducible before/after report; successful load and fallback tests; no new third-party runtime asset requests. The optimization decision is explicit before processing the full asset set.

## 6. Phase 2 — human realism and clothing pilot

Start with ordinary Capernaum residents. Build six adult identity presets spanning younger, middle-aged, and older appearances, different face shapes, heights, and builds, with male and female variants. These are authored variation targets, not demographic claims. Where scenes already contain children, add two proportion-appropriate child presets after the adult pipeline works; do not achieve child anatomy by uniformly shrinking an adult.

Extend `scripts/humans/` and the current MakeHuman pipeline. Keep existing source pins until a deliberate compatibility check justifies changing them. Use the Blender base meshes as a reference or detail-baking input first; replacing the skeleton would unnecessarily invalidate the animation and far-crowd pipeline.

Prioritize the details that make silhouettes and faces readable: neck/shoulder transitions, jaw and cheek variation, eyelids, eye placement, ears, hand proportions, feet, and believable skin roughness. Bake detail where possible. Avoid glassy eyes, painted-on clothing folds, and oversized headwear. Facial animation is optional after this milestone; do not add runtime morph targets unless export and near/far behavior are supported.

Keep one seeded appearance descriptor per person. Store actual body dimensions and garment-fit parameters for each preset. Carry skin tone, hair, facial-hair choice, garment cut, wrap, and trim consistently through near/far swaps. Extend the existing descriptor rather than generating a fresh random outfit at each distance.

Reuse role- and period-specific selections in `sceneHumanDress.js`. Introduce variation through tunic length, sleeve shape, mantle placement, sash width, head coverings, footwear, restrained dye palettes, fabric weight, and wear. Weight choices by scene and activity, preserving existing priestly overrides. Dye variation must include plausible color where supported rather than making every person uniformly beige.

Fit drapes to the actual body and bound pose. Exercise shoulders, elbows, hips, knees, sitting, walking, and task poses. Fix garment intersections through fitting and skin weights; do not globally inflate garments or hide entire anatomy regions to conceal a bad fit. Preserve existing attachment grips and motion safety checks. Keep gait cadence and contact timing consistent with speed and body size.

Generate near and far representations together. Re-bake the far animation data when topology, skeleton mappings, or skinning inputs change. Keep hair, veils, and accessories stable across transitions. Respect existing actor-count limits and batch/material counts; diversity should not imply a separate shader or large texture set for each person.

**Exit criteria:** six adult presets load with consistent identities at both distances; existing child roles use age-appropriate proportions if touched; no regressions in dress, hats, cloth, drape, bind-pose, animation, safety, attachment, or disposal tests. Record the maintainer's visual review checklist for faces, hands, cloth intersections, foot contact, and LOD transitions without claiming visual approval that has not happened.

## 7. Phase 3 — everyday objects with historical context

Build a starter set of eight reusable prop types: storage jar, cooking vessel, oil lamp, basket, rope coil, fishing-net bundle, spindle, and grinding stone. Audit existing procedural versions first; improve or replace them only where a sourced model or authored mesh offers a concrete benefit.

Use The Base Mesh for suitable starting geometry, museum records for proportions and dates, and ambientCG/Poly Haven for appropriate surface detail. A Smithsonian scan is optional: if no date- and region-matched CC0 example exists, author from documented references. Keep archaeological forms distinct between Roman-era villages and earlier settings; do not place one lamp or pottery type in all scenes by convenience.

Create a reproducible prop preparation script, such as `scripts/prepare-scene-props.mjs`, only after checking for an existing equivalent. Normalize meter scale, origins, material slots, and bounds; remove hidden scan geometry; create distance variants. Integrate with `sceneAssets.js` and the batching patterns in `sceneProps.js`. Preserve procedural fallback for failed loads and lower quality tiers.

Place meaningful small clusters near existing activities: nets by fishing work, vessels by cooking/storage, baskets near gathering or trade. Keep doorways and walking routes clear. Preserve the existing decorative-prop collision convention unless a genuinely large object requires a deliberate navigation update and tests.

**Exit criteria:** eight documented prop types or explicit reuse of their existing equivalents; scene placement is period-aware; repeated props are batched; asset loading, fallback, disposal, and navigation tests pass.

## 8. Phase 4 — regional vegetation and landscape detail

Use Sapling offline to author two variations each of olive, fig, and terebinth trees, guided by botanical references selected and cited during acquisition. Add locally suitable reeds or shrubs only where the scene setting supports them. Use Poly Haven rock/debris models selectively. Natural variation should include branch structure, trunk lean, crown density, and scale without extreme random distortion.

Integrate hero geometry into the existing `sceneFoliage.js` approach and retain `sceneLandscape.js` for distant trees. Reuse leaf atlases and instancing. Preserve wind/depth-pass agreement and the reduced-motion freeze. Retain low-tier vegetation density and avoid new per-tree update loops.

Do not populate Sinai with the village vegetation palette. Acacia or other wilderness vegetation requires a separate, supported species choice and authored preset. Keep sparse landscapes sparse where appropriate.

**Exit criteria:** reproducible species presets and credits; appropriate placement by scene; shared materials and bounded draw calls; shadows and reduced-motion behavior remain covered by headless checks.

## 9. Phase 5 — targeted material and sound improvements

After people, props, and foliage are integrated, fill up to six material gaps using ambientCG or Poly Haven. Extend the current preparation scripts to support another provider only when a selected asset needs it. Preserve content-hashed filenames, shared URLs, 1024/512 tiers where applicable, map conventions, and graceful procedural rendering. Do not hand-edit `sceneMaterialAssets.js`.

Target fabric weave, leather grain, pottery roughness, and local ground wear before broad architectural replacements. Confirm normal orientation, base-color color space, roughness range, and real-world repeat size. Any changes to `sceneSurfaces.js` must preserve shader hooks/cache keys and receive actual WebGL shader compilation checks.

Add at most six missing localized recordings from Freesound. Reuse `scripts/prepare-scene-audio.py` and existing manifests/credits. Trim and normalize sources, make clean loops where needed, and place sound near an appropriate activity. Preserve user-gesture audio startup, mute, pause/resume, and cleanup. Limit simultaneous emitters; avoid one audible loop per crowd member. Do not invent historically certain speech or languages from generic crowd recordings.

**Exit criteria:** new maps and sounds have a documented purpose, provenance, and size; no duplicate full-resolution downloads; audio lifecycle and material tests pass. Existing assets may satisfy this phase without six new files of each type.

## 10. Phase 6 — rollout across all eight environments

Shared infrastructure may land first, but enable new assets per scene after the Capernaum pilot is stable. Extend the current builder integration rather than duplicating the renderer.

| Route and builder | First improvements | Constraints to preserve |
| --- | --- | --- |
| `/scene/capernaum` — `buildCapernaum.js` | Human pilot, fishing props, village materials | Activity placements, boats/net interactions, walkable lanes |
| `/scene/caesarea` — `buildCaesarea.js` | Human variants, harbor/trade objects | Appropriate Roman-era context, existing harbor navigation |
| `/scene/bethlehem` — `buildBethlehem.js` | Household clothing, pottery, baskets | Existing material pipeline and domestic scale |
| `/scene/second-temple` — `buildSecondTemple.js` | Pilgrim variation and carefully selected props | Priestly distinctions, sacred-space boundaries, architecture |
| `/scene/mount-of-olives` — `buildOlivet.js` | Tree variants, travelers, ground detail | Topography, routes, scene-specific vegetation |
| `/scene/sinai` — `buildSinai.js` | Wilderness dress, camp objects, sparse vegetation | Environmental restraint and existing crowd behavior |
| `/scene/tabernacle` — `buildTabernacle.js` | Ordinary camp residents first | Text-specified dimensions, furnishings, priestly garments, dedicated character pipeline |
| `/scene/valley-of-elah` — `buildElah.js` | Terrain and ordinary supporting figures first | Dedicated David/Goliath assets, weapons, proportions, and choreography |

Named characters and the visitor avatar require separate compatibility checks before inheriting changed geometry or fitting assumptions. Update documentation if a scene intentionally retains an older asset or procedural representation.

## 11. Performance targets and release gates

These are proposed acceptance targets, not measurements or promises about the current application. Record the baseline first and document any necessary exception with evidence.

- Preserve current active near-actor caps and low-tier crowd/foliage density. Improve variation before adding population.
- Keep a near human at or below the current largest shipped near-character triangle count; target far humans at 12,000 triangles or fewer without exceeding current per-scene crowd budgets. Count garments and hair, not just the body.
- Default new material maps to the existing 1024/512 tiers. Permit a shared 2048 face atlas only when the Capernaum pilot demonstrates a visible need and fits the memory budget.
- Target no more than 3 MB additional first-visit asset transfer on low quality and 8 MB on high for the Capernaum pilot. Count required decoders, meshes, textures, and audio. Lazy-load assets unrelated to the selected scene.
- Target no more than a 10% increase in representative frame time and draw calls compared with the same route, viewpoint, quality, and device baseline. Measure physical-device performance when available; headless software rendering is a correctness check, not mobile GPU evidence.
- Validate low, balanced, high, reduced-motion, muted audio, failed asset fetch, route change during load, and repeated enter/leave disposal behavior.

If a target is missed, first reduce texture duplication, material splits, distant geometry, or eager loading. Do not hide regressions by silently increasing quality limits or removing existing population.

## 12. Verification and deliverables

Run baseline and final checks, using narrower relevant tests while iterating:

- `npm run lint`
- `npx vitest run src/components/scene --maxWorkers=2`
- `npx vitest run src/lib/sceneAudio.test.js src/lib/sceneAudioAssets.test.js --maxWorkers=2` when audio is touched
- `node scripts/validate-scene-assets.js`
- `node scripts/validate-scene-humans.js`
- `node scripts/validate-tabernacle-characters.js` and `node scripts/validate-elah-characters.js` when shared character changes can affect those pipelines
- `npm run build`

Add behavioral tests for identity consistency, garment-fit dimensions, skinning/bone preservation after optimization, deterministic source regeneration, supported asset formats, load failure fallback, and ownership/disposal. Extend existing tests instead of duplicating implementation details. A generated human's bind-pose and animation contracts need checks against the exported asset, not only mocked metadata.

Perform headless WebGL compile/load checks for modified shaders and compression paths. Record commands, actual outcomes, and pre-existing failures separately. Do not equate passing unit tests with visual realism or claim performance on hardware that was not measured.

Provide a short manual review list for the maintainer: Capernaum faces and hands at near distance; walking/sitting cloth fit; continuity across near/far transitions; props at realistic scale; foliage silhouettes and shadows; muted/reduced-motion behavior; low-tier mobile usability; protected priestly and named-character appearances. Give exact scene routes and existing viewpoint names or coordinates found in the builders.

Final deliverables:

1. Integrated, optimized assets and the scripts/presets needed to reproduce them.
2. Updated manifests, source hashes, attribution files, and historical-evidence notes.
3. Changes to shared rendering/loading only where needed, with working quality fallbacks.
4. `docs/scene-enhancement-progress.md` listing each phase, actual resources used, scene coverage, before/after sizes, validation results, and remaining manual checks.
5. A concise implementation report describing what improved, what was measured, and any unmet acceptance criterion. Do not mark omitted work complete.

## 13. Copy-ready instruction for Claude Sonnet

Read `CLAUDE.md` and `docs/claude-sonnet-scene-enhancement-plan.md`. Implement this plan in dependency order, starting with the inventory, a bounded optimization pilot, and the Capernaum human/clothing pilot. Use the explicitly named free resources, pin actual selected assets and licenses, and extend the existing pipelines. Preserve the newer dress, hat, cloth, and drape systems and near/far identity. Continue through props, vegetation, targeted materials/audio, and rollout to all eight scenes, documenting any unavailable asset and using the specified fallback. Follow the repository's headless verification preference and leave an actionable manual visual checklist. Keep a current progress document so another session can resume without repeating completed work. Do not publish or deploy as part of this handoff.
