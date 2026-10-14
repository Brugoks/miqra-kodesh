# Scene realism pass: the other seven scenes

Bethlehem's pass ([bethlehem-realism.md](bethlehem-realism.md)) set the quality target: scanned surfaces under the existing shaders, leafy foliage, one lived-in activity, and sound that belongs to places. This applies the parts of it that fit to the Second Temple, Caesarea, Capernaum, the Tabernacle, the Valley of Elah, the Mount of Olives and Sinai. Geometry, collision and the staged events are untouched.

## What changed, by scene

| Scene | Scanned surfaces | Also |
|---|---|---|
| Second Temple | Herodian ashlar (walls, steps, soreg), paving, timber, and the earth under the hills | A fire on the altar — flames and warm light that follow the hour. The soundscape already had the fire crackling under a column of smoke with nothing burning. |
| Caesarea | Kurkar-style sandstone block (replaces the procedural joints, which would have doubled the scan's own courses), plaster, terracotta roofs, timber | The surf is on the quay and a breath inland instead of one level everywhere. |
| Capernaum | Basalt, packed mud, clay plaster, reed thatch, timber — each *under* the existing Voronoi stones, trodden grit and dust | Soundscape unchanged. |
| Tabernacle | Desert sand (under the ripple shader), granite for the mountain and stones, goat-hair cloth, acacia | `enclosureAt`: the wind is shut out inside the boarded tent. The altar's fire is now heard where the altar is (it was twelve metres off). Linen rustles round the court. |
| Valley of Elah | Shephelah ground over the baked vertex colours, limestone pebbles, tent cloth | The eight terebinths have open, wind-moving leaf crowns and forked limbs in place of solid lumps. Rustle and birdsong sit among them. |
| Mount of Olives | Terra rossa ground under the baked colours, terrace stone, limestone, rock, timber, goat hair | Gethsemane's fourteen old olives have open leaf crowns round a shrunken core. Leaves and breeze are heard in the garden, not as a flat bed. |
| Sinai | Red granite ridges and boulders, gravelly soil (the trodden paths still show), cliff rock, timber, cloth | Wind gathers on the summit and in the cleft and the bed is quieter. Jethro's sheep graze round their spots (every fourth lies down) instead of standing like statues. They are only in the scene during some events, so they have no sound of their own: the soundscape knows nothing of events. |

Bethlehem's surface module moved to `sceneSurfaces.js` and gained options; Bethlehem calls it exactly as before (its bindings give explicit tints, and the shader defaults match what it had).

## Materials

All scans are Poly Haven, CC0. Poly Haven is the only source used; ambientCG and the rest of the list below were not needed for this pass.

| Asset | Author(s) | Scenes |
|---|---|---|
| [clay_plaster](https://polyhaven.com/a/clay_plaster) | Amal Kumar | Capernaum |
| [clay_roof_tiles_02](https://polyhaven.com/a/clay_roof_tiles_02) | Amal Kumar | Caesarea |
| [dark_rock_02](https://polyhaven.com/a/dark_rock_02) | Amal Kumar | Capernaum |
| [dense_sand](https://polyhaven.com/a/dense_sand) | Dimitrios Savva | Tabernacle |
| [dry_ground_rocks](https://polyhaven.com/a/dry_ground_rocks) | Rob Tuytel | Second Temple (shared with Bethlehem) |
| [dry_mud_field_001](https://polyhaven.com/a/dry_mud_field_001) | Rob Tuytel, Rico Cilliers | Capernaum |
| [hessian_380](https://polyhaven.com/a/hessian_380) | colormass, Rico Cilliers | Tabernacle, Elah, Olivet, Sinai |
| [marble_01](https://polyhaven.com/a/marble_01) | Rob Tuytel | Second Temple |
| [reed_roof_03](https://polyhaven.com/a/reed_roof_03) | Rob Tuytel | Capernaum |
| [rock_boulder_dry](https://polyhaven.com/a/rock_boulder_dry) | Dimitrios Savva, Rico Cilliers | Olivet (shared with Bethlehem) |
| [rock_face_03](https://polyhaven.com/a/rock_face_03) | Dario Barresi, Rico Cilliers | Sinai |
| [rocks_ground_02](https://polyhaven.com/a/rocks_ground_02) | Rob Tuytel | Elah, Olivet |
| [rocks_ground_06](https://polyhaven.com/a/rocks_ground_06) | Rob Tuytel | Elah |
| [rocky_trail](https://polyhaven.com/a/rocky_trail) | Amal Kumar | Sinai |
| [seaworn_sandstone_brick](https://polyhaven.com/a/seaworn_sandstone_brick) | Dimitrios Savva | Caesarea |
| [tiger_rock](https://polyhaven.com/a/tiger_rock) | Dario Barresi | Tabernacle, Sinai |
| [weathered_brown_planks](https://polyhaven.com/a/weathered_brown_planks) | Dimitrios Savva, Rico Cilliers | Six scenes (shared with Bethlehem) |
| [white_sandstone_blocks_02](https://polyhaven.com/a/white_sandstone_blocks_02) | Rob Tuytel | Second Temple, Olivet |
| [yellow_plaster](https://polyhaven.com/a/yellow_plaster) | Rob Tuytel | Caesarea |

These are surface references, not documentation of the ancient places.

Run `node scripts/prepare-scene-materials.mjs` to reproduce the library. It downloads the diffuse, OpenGL normal and roughness maps, writes them as content-hashed WebP, and regenerates `sceneMaterialAssets.js`. Three things it records that the runtime uses:

- **Two tiers.** 1024px maps, and a 512px set (`mapsLow`) that the asset session loads on the low profile or any coarse-pointer device (`textureTier` in `createAssetSession`). The small set is 0.4–1.0 MiB per scene against 2.1–4.8 MiB, and a quarter of the GPU memory. A phone is "balanced", not "low", almost always, which is why the trigger is the pointer and not the profile name alone. Bethlehem's own four sets have no small tier and load as before.
- **Average colour.** Each scan's linear mean, so `applyScannedSurface` can solve for the tint that makes the scan average out to the colour the scene was already tuned around (`albedo`, defaulting to the material's own colour). The scan adds grain and relief; it does not quietly re-colour or re-light a place. Over a vertex-coloured terrain the target is white, so the baked palette stays.
- **Sharing.** A scan Bethlehem already ships (matched by source URL) is that file; two scenes that want the same scan share one file. A visitor who has seen one scene does not download the same plaster for the next.

## How a scan is worn

`sceneSurfaces.js applyScannedSurface` projects the scan from world position in metres, so scaled and instanced geometry keep one grain size. A material with its own `onBeforeCompile` passes `preserveShader`, and its fragment work runs on top of the scan; otherwise the scan replaces it (Caesarea's block joints, where the scan has its own). `breakTiling` adds a second, rotated diffuse sample and slow world-space variation for terrain, sand and cliffs. Anisotropy is raised on the session's textures for ground seen at a grazing angle. If a scan fails to load, the procedural surface stays. Builders never dispose a scan; the asset session owns them.

The asset sequencer used `priority || 99`, so a group with priority 0 — the surfaces, in every scene, Bethlehem included — loaded *last*, after the people. It is `??` now, and a test fails on the old behaviour.

## Foliage and light

`sceneFoliage.js createLeafCrowns` is Bethlehem's open olive spray generalised (olive and terebinth leaf shapes, an optional shrunken core so the gaps do not show the trunk's far side). It is for dozens of trees, not thousands: the groves of Olivet and the village olives of Capernaum keep their cheap crowns. Wind is on the GPU in both the surface and shadow passes and freezes with reduced motion.

## Sound

Beds were turned down (no wind bed above 0.3, Sinai's to 0.09) and the character moved into sources placed in the world, as Bethlehem did. `enclosureAt` for the Tabernacle makes the existing enclosure lowpass close inside the tent. The Temple's soundscape is unchanged; Capernaum's was already localized.

## Not done, and why

- **Quixel Megascans (Fab).** Licence and pricing vary per asset and the files cannot simply be committed to a public repository; nothing was imported.
- **ActorCore, Rokoko Vision.** Both need an account and per-asset licence checks, and the scenes already carry 48 Mixamo clips. Nothing was imported. A purposeful-routine pass like Bethlehem's basket-maker (a water-drawer at Capernaum's lake, a pressman at the Gethsemane press) is the natural use for them; it needs hand-to-object contact authored and tested per scene, so it was left rather than done without being able to look.
- **Sonniss GameAudioGDC.** A multi-gigabyte bundle with per-pack terms. The soundscapes are still the recordings already in the repo plus synthesis.
- **KTX2 / Basis compressed textures.** No `toktx` or `basisu` on this machine. The 512px WebP tier is what stands in for it; GPU-compressed textures would cut memory further.
- **Simplified distant models.** No imported meshes were added, so there was nothing to simplify.

## Verification

Done headlessly: ESLint, the full test suite, the production build, asset validation (existence, size, SHA-256 of every file, including the small tier), and a real WebGL 2 compile of every scanned material and shader edit in all eight scenes (the seven plus Bethlehem) in headless Chrome on SwiftShader, with a deliberately broken shader confirming the check can fail. No shader errors and no GL errors.

**Not verified, and worth doing by eye and by ear:**

- How it looks. In particular: the Temple ashlar's course height (8 m tile, about 0.9 m courses) and how white the platform stays; Caesarea's masonry now that the procedural joints are gone; Capernaum's basalt under the Voronoi stones; whether the 2.5 m terrain tile still reads as a repeat on Sinai's and Elah's slopes; the Elah terebinths and Gethsemane's olives against the sky; the altar fire at dusk.
- A hitch when the scans arrive mid-session: each scanned material recompiles, 3–13 extra shader programs per scene.
- Frame rate and memory on a physical phone, on the 512px tier.
- A listening pass on headphones: the Sinai summit wind, the Caesarea quay, the Tabernacle's tent.
