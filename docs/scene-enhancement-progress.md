# Scene enhancement progress

Working log for [the implementation plan](claude-sonnet-scene-enhancement-plan.md). A new session should be able to resume from this file without repeating finished work. This work was pushed to `main` on 2026-10-17 from the working tree it was done in, after lint, the full test suite, the four asset validators and the build had passed. No visual or device-performance check had been made, so the manual review checklist (section 9) is still open.

- **Branch:** `feat/scene-enhancement` (from `main` at `c1d05cd`)
- **Last updated:** 2026-10-15 (Phases 0 and 1 complete; Phase 2: characters converted and eight Capernaum identity presets built, wired, tested and measured; the stiff standing pose in the crowd fixed, and the loop of people flashing back into it fixed, section 11)
- **Pilot scene:** Capernaum (`/scene/capernaum`, `buildCapernaum.js`)

## Phase status

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Inventory, provenance, measured baseline | **Complete** (this file). Two pre-existing failures recorded below; one validator fixed. |
| 1 | Optimization pilot (glTF Transform, meshopt, KTX2) | **Complete: decision made and evidenced** (section 5). Tooling, loader, fallback, validator and tests are in. Only the pilot jar is converted; the characters are measured, not converted. |
| 2 | Human realism and clothing pilot (Capernaum) | **Largely done, not finished.** All 13 existing characters converted (5.8); eight identity presets (three women, three men, two children) built through the pinned toolchain, optimized, wired into Capernaum with a measured cost (section 10). The crowd's stiff standing, sitting and working poses replaced with captured motion (section 11). Not done: clothing variation beyond the existing wardrobe, hands and feet detail, other scenes, and anyone looking at the result (sections 9, 10.7 and 11.4). |
| 3 | Everyday objects | Not started |
| 4 | Regional vegetation | Not started |
| 5 | Targeted materials and sound | Not started |
| 6 | Rollout to all eight scenes | Not started |

No visual or device-performance criterion has been checked by anyone. Everything below is from manifests, files on disk and headless commands.

## 1. Baseline validation results

Run on `feat/scene-enhancement` before any source change except where noted. Commands are from section 12 of the plan.

| Command | Result | Notes |
| --- | --- | --- |
| `npm run lint` | **Fails: 10 errors, 5 warnings** | All in files outside the scene system: `Studies.jsx` (10 `no-unused-vars` errors), `App.jsx` (2 hook-deps warnings), `Calendar.jsx` (3). Pre-existing. PR #14 ("Remove orphaned study-notes code") targets the `Studies.jsx` errors. Scene code is lint-clean. |
| `npx vitest run src/components/scene --maxWorkers=2` | **Pass: 62 files, 1069 tests** | 44 s |
| `npx vitest run src/lib/sceneAudio.test.js src/lib/sceneAudioAssets.test.js` | **Pass** | 2 s |
| `node scripts/validate-scene-assets.js` | **Pass: 261 assets, 197.79 MB** | That total counts a file once per scene that lists it, so it is **not** a first-visit figure. See section 3 for per-scene unique bytes. |
| `node scripts/validate-scene-humans.js` | **Failed at baseline; fixed** | See finding F1. Passes after the fix. |
| `node scripts/validate-tabernacle-characters.js` | Pass | |
| `node scripts/validate-elah-characters.js` | Pass | |
| `npm run build` | Pass | Existing large-chunk advisory (`three.module` 725 kB, `index` 657 kB). |

## 2. Findings that change how the plan is carried out

**F1. `validate-scene-humans.js` was stale and could not act as a gate.** Its last assertion expected every scene's actors group to be the shared library (plus tableau for Capernaum). Later commits added the camp woman to Capernaum, Jesus and the woman to the Temple, and gave the Tabernacle its own cast. The per-GLB checks (hashes, bones, weights, textures, triangle budgets) all passed; only the manifest-composition assertion failed. Fixed in `scripts/validate-scene-humans.js` to state the real per-scene contract, and checked that it still fails when a model is dropped. **Overlap:** open PR #19 (`feat/jesus-hero-character`, untouched since 2026-09-08) edits the same lines against the old contract, so it will conflict textually with this change whichever lands second.

**F2. Character bytes dominate and budget feasibility depends on Phase 1.** Measured from the shipped GLBs (section 4): each character is about 2.0 MiB LOD0 geometry, 0.4 MiB LOD1, and 1.8–2.9 MiB of embedded textures. Capernaum's first-visit models are 28.4 MiB, nearly all people. Gzip barely helps (artisan: 5.45 MiB raw, 4.43 MiB gzipped), so transfer is roughly raw size. The plan's pilot allowance of +3 MB (low) and +8 MB (high) cannot be met by adding six GLBs shaped like today's. See section 5 for what Phase 1 measured and section 6 for the decision.

**F3. Every crowd in every scene is drawn from four bodies.** `human-artisan`, `human-traveler` (male), `human-villager` (a woman's body, and also what `CROWD_VARIANTS` uses for unmarked "men") and `human-tabernacle-camp-woman`. Identity variety today is those four bodies times tint, headwear and ±6% build. That is the baseline the six presets extend.

**F4. `SCENE_DRESS` is keyed `olivet` but the route slug is `mount-of-olives`.** `buildOlivet.js` passes `mount-of-olives`, so `dressFor` falls through to `villager` instead of `pilgrim`. There is no visible effect today because the two profiles have identical weights, and `sceneHumanDress.test.js` uses the key `olivet`, so it cannot catch this. Not fixed yet; fix with a test that uses the real slug when Phase 2 touches dress.

**F5. Documentation drift on actor caps.** `docs/scene-humans-assets.md` quotes 8/18/28 skeletal actors and 0/2/4 near meshes. In code: Capernaum, the Temple, Olivet and (through `createLivingCrowd`) Caesarea, Bethlehem and Sinai pass `actorLimits {low 3, balanced 5, high 8}` and `actorRange {10, 12, 15}`; the Tabernacle passes `{14, 22, 28}`; the defaults `{8, 18, 28}` / `{18, 28, 36}` apply to nobody. Near (LOD0) meshes are capped at **8 / 4 / 0** on high / balanced / low (`sceneHumans.js:371`). The far crowd's `REACH` is 35 m / 60 m / unlimited (`sceneInstancedHumans.js:295`). Section 7 uses the code values. The prose should be corrected when Phase 2 updates that document.

**F6. The loader and validator cannot take compressed assets yet.** `sceneAssets.js` makes a bare `GLTFLoader` with no meshopt or KTX2 decoder, and `validate-scene-assets.js` whitelists only `.png .webp .glb .ogg .wav`. Both match the plan's description.

**F7. Prop palette is the same everywhere.** Procedural kinds in `sceneProps.js`: `jar, waterJar, basket, crate, sack, ropeCoil, bundle, bench, post, awning, brazier, block`. All seven prop-using scenes place the same jar/basket/sack/waterJar set regardless of period. Of the plan's eight prop types, a storage jar, basket and rope coil exist; a **cooking vessel, oil lamp, spindle and grinding stone do not**, and the fishing-net bundle exists only as one Capernaum GLB (`prop-fish-net`, 17 KB) plus the generic `bundle`. Capernaum ships four tiny prop GLBs (7–17 KB each, group priority 3, loaded last).

**F8. Tooling on this machine.** Present: Blender 5.1.0 (`/Applications/Blender.app`), Node 22.23, ffmpeg (Homebrew), system Python 3.9.6, `sharp`, `three` ^0.185.1. Absent: `toktx`, `basisu`, `gltf-transform`. The MakeHuman source cache `scripts/.cache/human-sources/` is missing, so Phase 2 begins with `fetch_sources.py` (several hundred MiB, hash-verified). Existing ignored caches under `scripts/.cache/`: `humans`, `mixamo`, `tabernacle`, `elah`, DEM tiles (284 MB total).

**F9. No live concurrent scene work was found.** The two `herdr/*-worker` worktrees are 0 commits ahead of `main` (last commit 2026-08-12). Remote `chatgpt/scene-human-interactions` (8 ahead, 41 behind, 7 scene files) and `chatgpt/scene-human-upright-hotfix` (4 ahead, 40 behind, 3 scene files) both end on 2026-09-06 with docs commits about the prop-interaction and upright-human passes, and branch from commits that predate Mark 2, the Mixamo library, the instanced crowd, cloth, dress and gait. Their subjects match work that `main` already has under other hashes (`sceneHumanAttachments.js`, `sceneHumanSafety.js`); that equivalence was inferred from subjects, not diffed. Only PR #19 (F1) overlaps files this plan will touch.

**F10. The Capernaum crowd has no draw-call headroom.** `sceneInstancedHumans.test.js` asserts at most 37 draws and under 1,000,000 triangles for the crowd, and the measured values are **70 people, 37 draws, 845k triangles**. Each body's parts (body, eyes, hair, brows, garments, wardrobe parts) are batched per model, so every additional distinct body mesh adds draws and would break the cap. (This paragraph first estimated nine draws a body from 37 over four; measured later, a body adds 6.6 in the crowd and about 13 in the whole frame, section 10.5.) Triangles had about 155k of headroom. The plan's "≤ 10% draws" gate is against the whole frame, not the crowd, so a measured whole-frame count is needed before deciding whether that cap may be raised (explicitly, with the reason recorded) or whether variety has to come from per-instance data instead of new meshes (section 6, point 5). **Resolved by the maintainer's decision and a measurement: section 10.5.**

**F11. `scripts/generate-scene-assets.js` must not be run.** It rewrites the whole of `sceneAssetManifest.js` from a template embedded in the script (the `updatedManifestContent` block). That template predates the camp woman in Capernaum, the Temple, Olivet, Elah, Bethlehem and Sinai entries, and the scanned-surfaces loop, so running it would silently delete them. The prop GLBs it makes are procedural and cheap to regenerate, but the manifest is no longer a generated file. Edit it by hand until the generator is split from it. This plan did not touch the generator.

**F12. Decoded texture memory is the biggest unexamined cost, and it is separate from download size.** Each character carries two 2048² maps (skin and hair) plus 1024² maps, none shared between characters. Decoded as RGBA8 with mipmaps (width × height × 4 × 4/3 bytes per image, from the GLB's embedded images) that is about **71 MiB for the artisan and 350 MiB across Capernaum's six characters**; the four the crowd draws (artisan, villager, traveler, camp woman) are about 229 MiB. This is an upper-bound estimate from image dimensions, not a measurement on a device. Neither WebP nor meshopt changes it, and the 512 px material tier only covers the scanned surfaces. The lever is texture dimensions or GPU-compressed formats, and it needs the maintainer's eye. Since then, conversion and the 1024² crowd limit cut it to 221.5 MiB for Capernaum's six characters and 101.4 MiB for the four the crowd draws (section 5.8).

**F13. The documented rebuild command silently dropped normal maps.** `build_characters.py` was given `--source scripts/.cache/human-sources`, a relative path, exactly as `scene-humans-assets.md` shows. Blender saves the `.blend` before the glTF export and re-bases image paths on the `.blend`'s folder, so a normal map loaded from a relative path then pointed at `/scripts/...`, the exporter's temporary copy of it came back empty, and the map was dropped with only a logged "does not have any image data". It also exits 0 after a Python error. The script now makes `--source` and `--mpfb` absolute, and with that the artisan rebuilds **byte for byte** (SHA-256 `29628010edc2b439…`) on Blender 5.1.0 and the pinned MPFB commit. Check the log for `CHARACTER {...}` and for `Traceback`, never the exit code.

**F14. MakeHuman's age slider is not linear in years.** 0.1875 is 11 years, 0.5 is 25 and 1.0 is 90, so the first presets, set at 0.27 to 0.30 as "young adults", were fourteen to sixteen years old, and the first "adult" (0.50) was twenty-five. Heights are non-linear in the height slider too. Both were caught by measuring the built bodies, and are now fixed from measured responses and held by a test that converts each recipe back to years and metres (`scenePresets.test.js`).

**F15. Optimizing textures one at a time dropped a required extension.** Calling `compressTexture` directly (to give each texture its own size and fidelity) leaves `EXT_texture_webp` undeclared, which makes a file with WebP images invalid glTF. It was noticed only because the output was 324 bytes smaller than a file the new code was supposed to reproduce exactly. The optimizer now declares it, and both `validate-scene-assets.js` and `glb-check.mjs` fail on WebP images without the extension (and on the extension without images). With the fix the Jesus and Matthew files reproduced their earlier hashes, which is what makes the refactor trustworthy.

**F16. The scruffy beard has the same licence discrepancy as the tunic.** `wdg_scruffy_beard.mhclo` still carries an AGPL header, while the Bodyparts 05 manifest lists it as CC0 (WDG, 2019). Used under the pack's explicit CC0 listing and recorded in `notices/ATTRIBUTION.md`, as the tunic is. Every other asset the presets use (skins, hair, eyebrows, eyes, MPFB's morph targets) is listed CC0 with no stray header.

## 3. Scene inventory

Eight routes, from `sceneModules.js`. Bytes are what `createAssetSession` would fetch on a first visit through the manifest groups, counting each URL once. "Small" is the 512 px texture tier (`textureTier: 'small'`, low profile or coarse pointer). They exclude `mixamo-motion.json` (1.35 MiB, 0.96 MiB gzipped, fetched separately), the recorded audio bank (30 files, 0.62 MiB, shared), narration, and JS chunks.

| Route | Builder | First visit, full | Small | Groups (priority: models / materials) | Third person |
| --- | --- | ---: | ---: | --- | --- |
| `/scene/capernaum` | `buildCapernaum.js` | 32.26 MiB | 29.21 MiB | surfaces 0: 0/5 · actors 2: 6/0 · props 3: 4/0 | yes (default) |
| `/scene/caesarea` | `buildCaesarea.js` | 16.19 MiB | 14.46 MiB | surfaces 0: 0/4 · actors 2: 3/0 | no |
| `/scene/bethlehem` | `buildBethlehem.js` | 22.13 MiB | 22.13 MiB (no small tier) | surfaces 0: 0/4 · actors 1: 4/0 | yes (default) |
| `/scene/second-temple` | `buildSecondTemple.js` | 27.05 MiB | 24.98 MiB | surfaces 0: 0/4 · actors 2: 5/0 | no |
| `/scene/mount-of-olives` | `buildOlivet.js` | 28.97 MiB | 25.39 MiB | surfaces 0: 0/5 · actors 2: 5/0 | yes (default) |
| `/scene/sinai` | `buildSinai.js` | 24.63 MiB | 20.86 MiB | surfaces 0: 0/5 · actors 1: 4/0 | yes (default) |
| `/scene/tabernacle` | `buildTabernacle.js` | 25.12 MiB | 22.51 MiB | surfaces 0: 0/4 · actors 2: 5/0 | no |
| `/scene/valley-of-elah` | `buildElah.js` | 15.65 MiB | 12.83 MiB | surfaces 0: 0/3 · principals 1: 3/0 | no |

**People per scene**

| Scene | Crowd mechanism | Skeletal actor cap low / bal / high (range m) | Dress profile source (`sceneHumanDress.js`) |
| --- | --- | --- | --- |
| Capernaum | `createSceneHumans` + instanced crowd | 3 / 5 / 8 (10 / 12 / 15) | groups: fisherman, traveller, villager; scene: villager |
| Caesarea | `createLivingCrowd` | 3 / 5 / 8 (10 / 12 / 15) | scene: townsman; harbour, merchant, soldier |
| Bethlehem | `createLivingCrowd` | 3 / 5 / 8 (10 / 12 / 15) | scene: villager |
| Second Temple | `createSceneHumans` + instanced crowd | 3 / 5 / 8 (10 / 12 / 15) | scene: pilgrim; priest (office) |
| Mount of Olives | `createSceneHumans` + instanced crowd | 3 / 5 / 8 (10 / 12 / 15) | scene key mismatch (F4); labourer, shepherd, pilgrim |
| Sinai | `createLivingCrowd` | 3 / 5 / 8 (10 / 12 / 15) | scene: camp |
| Tabernacle | `createSceneHumans`, own cast | 14 / 22 / 28 (default range) | scene: camp; own priests and Levites |
| Valley of Elah | dedicated principals, no ambient crowd | n/a | n/a |

Authored placements (`sceneHumanPlacements.js`): Capernaum 3 (fisherman → artisan, grinder → villager, carrier → traveler), Caesarea 1, Second Temple 1, Tabernacle 1. Ambient people elsewhere come from each scene's crowd figures through `humanVariantId`.

**Materials (scanned surfaces, Poly Haven CC0)**: Capernaum 5 (basalt, earth, plaster, thatch, timber), Caesarea 4, Bethlehem 4 (its own pipeline, no small tier), Second Temple 4, Olivet 5, Sinai 5, Tabernacle 4, Elah 3. Sources and authors: `docs/scene-realism.md`.

**Models shipped** (every distinct GLB; triangles are LOD0 / LOD1):

| Model | MiB | Triangles | Rights | Scenes |
| --- | ---: | --- | --- | --- |
| `human-tabernacle-high-priest` | 6.55 | 76,193 / 18,285 | CC0 + Adobe Mixamo | Sinai, Tabernacle |
| `human-jesus` | 5.64 | 59,659 / 10,731 | CC0 | Temple, Capernaum, Olivet |
| `human-artisan` | 5.45 | 61,136 / 10,998 | CC0 | Bethlehem, Temple, Caesarea, Capernaum, Olivet |
| `human-david` | 5.03 | 58,174 / 10,919 | CC0 | Elah |
| `human-tabernacle-camp-woman` | 4.74 | 56,831 / 10,304 | CC0 + Adobe Mixamo | Sinai, Bethlehem, Temple, Capernaum, Tabernacle, Olivet |
| `human-villager` | 4.38 | 59,150 / 10,641 | CC0 | Bethlehem, Temple, Caesarea, Capernaum, Olivet |
| `human-tabernacle-camp-man` | 4.33 | 50,377 / 9,161 | CC0 + Adobe Mixamo | Sinai, Tabernacle |
| `human-traveler` | 4.23 | 53,036 / 9,540 | CC0 | Sinai, Bethlehem, Temple, Caesarea, Capernaum, Olivet |
| `human-goliath` | 4.00 | 61,139 / 12,454 | CC0 | Elah |
| `human-matthew` | 3.94 | 57,210 / 10,291 | CC0 | Capernaum |
| `human-tabernacle-priest` | 3.26 | 53,429 / 10,576 | CC0 + Adobe Mixamo | Tabernacle |
| `human-shield-bearer` | 3.02 | 55,707 / 11,245 | CC0 | Elah |
| `human-tabernacle-levite` | 2.95 | 50,851 / 9,689 | CC0 + Adobe Mixamo | Tabernacle |
| `prop-fish-net`, `prop-galilean-jar`, `prop-basket`, `prop-stone-anchor` | 0.01–0.02 each | not recorded | CC0 | Capernaum |

**Audio:** 30 recordings in `public/assets/scenes/shared/audio/`, 0.62 MiB, licences 22 CC0 and 8 CC-BY-3.0, credited in `CREDITS.txt`, built by `scripts/prepare-scene-audio.py` (needs ffmpeg).

## 4. Anatomy of a shipped character (measured)

KiB inside each GLB, from `bufferViews` classified by what references them.

| | Images | LOD0 mesh | LOD1 mesh | Animation | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| `human-artisan` | 2,947 | 2,012 | 394 | 33 | 5.45 MiB |
| `human-villager` | 1,809 | 2,044 | 406 | 33 | 4.38 MiB |

The images are PNG and JPEG. In the artisan, the hair diffuse alone is a 1,350 KiB PNG and the hair normal map 266 KiB; the skin is a 366 KiB JPEG, the cloth 180 KiB. Eyes and brows are 34–69 KiB. Textures are not shared between characters, so every GLB repeats its own eye, brow and hair data.

## 5. Phase 1: optimization pilot

**Scope as run.** The plan's pilot (one static prop, one material set) plus a measure-only run on all six Capernaum characters, because the budget decision in section 6 depends on them. The jar prop was converted as the pilot; the characters were first measured only, and have since been converted (5.8). The 5.1 to 5.4 tables are the pilot's measurements, taken with the crowd texture limit not yet applied.

**Tools.** Dev-only and pinned: `@gltf-transform/core`, `/extensions`, `/functions` 4.5.1 (published 2026-09-28) and `meshoptimizer` 1.3.0 (2026-09-25); `sharp` 0.35.3 was already a dependency. `basisu` 2.50 (Homebrew `basis_universal`, Apache-2.0) was installed on this machine for the KTX2 measurement only; it is not a repository dependency and `brew uninstall basis_universal` removes it. At runtime the loader uses three 0.185.1's own meshopt decoder: a 26.5 kB lazy chunk (7.3 kB gzipped), imported only on the scene loader path, with its wasm inlined. No decoder file is fetched from anywhere, so there is no new runtime request and no "decoder fetch failed" case.

### 5.1 Characters, measured with the shipped script (`--textures`)

| Character | Original | Optimized | Share | Decoded textures (estimate) |
| --- | ---: | ---: | ---: | ---: |
| `human-artisan` | 5,578.8 KiB | 2,381.0 KiB | 43% | 70.7 MiB |
| `human-villager` | 4,480.0 KiB | 1,895.1 KiB | 42% | 54.7 MiB |
| `human-traveler` | 4,329.8 KiB | 1,808.2 KiB | 42% | 54.7 MiB |
| `human-jesus` | 5,771.0 KiB | 2,663.9 KiB | 46% | 65.4 MiB |
| `human-matthew` | 4,037.6 KiB | 1,680.0 KiB | 42% | 54.7 MiB |
| `human-tabernacle-camp-woman` | 4,856.2 KiB | 2,241.8 KiB | 46% | 49.4 MiB |
| **Capernaum actors group** | **28.37 MiB** | **12.37 MiB** | **44%** | 349.5 MiB |

If converted, Capernaum's first visit falls by 16.0 MiB. For every character the script's audit passed: node names, node→mesh mapping, skin joint lists, animation names and durations, material names, alpha modes and cutoffs, attribute types, and **identical triangles** (each triangle compared as the set of its three vertices' full attribute rows, independent of vertex order and of the compression library's own claims).

### 5.2 Geometry and animation only (artisan, images excluded)

| Variant | Size | Difference from the original, as three.js loads it |
| --- | ---: | --- |
| Original | 2,301 KiB | n/a |
| **Float32 + meshopt, lossless (adopted)** | **1,196 KiB** | **none**: 0.000 mm at the bind pose and in all six clips, 0.00° on normals |
| Quantize + meshopt, high (not adopted) | 653 KiB | up to 0.115 mm at the bind pose, **0.535 mm** over six clips, 1.17° on normals |

Why quantization is not adopted: it saves another ~540 KiB per character but turns positions into normalized int16 with the scale folded into the skin. Every reader of raw `geometry.attributes.position` would then get numbers in −1..1 rather than metres, and the headwear fitting, drape, skull measuring, cloth baking and the crowd's bake read exactly those. That would be a silent failure, not a loud one. Revisit only after auditing the readers.

Keeping the original vertex order would cost about 445 KiB per character (geometry shrinks 29% instead of 46%). `reorder` was kept: nothing in the repository keys on vertex indices (the bind-pose fixtures hold bone transforms, and the one index use in `sceneHumanHats.js` builds its own geometry).

### 5.3 Image quality (artisan, shipping settings: colour lossy WebP q80, normal maps lossless)

Measured on texels the alpha test can show; the beard map is 64% fully transparent and lossy WebP is free to rewrite the colour under those.

| Texture | Role | Size | Visible | Result |
| --- | --- | --- | ---: | --- |
| brows | colour | 512² | 12% | 33.9 dB; 0 of 32,118 texels flip at the alpha cutoff |
| beard | colour | 1024² | 36% | 34.7 dB; 0 of 374,169 flip |
| beard | normal | 1024² | 36% | exact |
| eyes | colour | 1024² | 100% | 43.7 dB |
| hair | normal | 1024² | 43% | exact |
| hair | colour | 2048² | 42% | 41.5 dB; 0 of 1,763,919 flip |
| cloth | colour | 1024² | 100% | 38.8 dB |
| skin | colour | 2048² | 100% | 43.0 dB |

Normal maps stay lossless because lossy WebP is always 4:2:0 chroma-subsampled: on the beard normal map it measured **34° mean error** at q80 and at q90. Image quality was measured on the artisan only; the other five were checked for structure and exact geometry. PSNR says nothing about how hair and beard look at arm's length, so that is on the manual checklist.

### 5.4 KTX2 (`capernaum-basalt`, encoded from the original Poly Haven JPEGs recorded in the manifest)

| Map | Shipped WebP | KTX2 variant | KTX2 bytes (with mips) | Quality vs original | GPU memory, 1024² with mips |
| --- | ---: | --- | ---: | --- | --- |
| diffuse | 68,752 | ETC1S | 137,707 | 38.2 dB (WebP: 39.4) | 1.3 MiB, against 5.3 MiB as RGBA8 |
| normal | 459,478 | UASTC, `-normal_map` | 1,346,062 | 38.8 dB, 1.60° mean (WebP: 38.4, 1.71°) | same |
| normal | 459,478 | ETC1S | 217,216 | 30.3 dB, **4.5° mean, 80° worst** | unusable |
| roughness | 65,812 | ETC1S | 140,095 | 40.4 dB (WebP: 40.4) | same |

At parity quality the set goes from about 594 kB to 1,624 kB (2.7× the bytes) to save about 12 MiB of GPU memory per scan at the full tier. The 512 px tier already cuts that fourfold for phones, and the character textures in F12 are a far larger cost than all five scans of a scene. **Not adopted.** If it is ever revisited the loader needs `KTX2Loader`, the 571 KiB Basis transcoder hosted locally, `detectSupport`, code that does not read `texture.image` pixels (compressed textures have none), and `.ktx2` in the validator.

### 5.5 What is in the repository

- `scripts/optimize-scene-glb.mjs`: the reproducible pipeline and audit (`--textures`, `--dry-run`). Never overwrites its input.
- `src/components/scene/sceneAssets.js`: every `GLTFLoader` gets the meshopt decoder (`createGltfLoader` is exported for tests); a model may name a `fallback`, tried only if the primary fails to load or decode, so one visit never downloads both. A model with no fallback behaves as before.
- `scripts/validate-scene-assets.js`: a file must declare `compression: 'meshopt'` exactly when it requires `EXT_meshopt_compression`; a compressed model must name a fallback that does not itself need the decoder; any other required extension besides meshopt and WebP is rejected. All three rules were checked by breaking the manifest on purpose.
- `public/assets/scenes/capernaum/models/jar-155276fb.glb` (12,356 B, from 14,676 B) is the pilot, with the original `jar-85d866df.glb` as its fallback. The manifest entry was edited by hand (F11).
- Eight new tests in `sceneAssets.test.js`, driven with the real bytes of the shipped files: the compressed jar loads and fetches nothing else; it draws exactly the original's triangles with float, non-normalized attributes; a loader with no decoder falls back; a failed fetch and a truncated file both fall back; two failures report once and the session carries on; no fallback means one attempt; leaving mid-load reports nothing. Removing the decoder attachment fails two of them and removing the fallback attempt fails two others, which confirms they test what they claim.
- A real-browser check (headless Chrome on SwiftShader, local server, not a visual check): the shipped-settings artisan loads through `GLTFLoader` with the decoder, with the same 12 skinned meshes, 72,134 triangles, six clips and 16 images at the same dimensions as the original, colour maps in sRGB and normal maps linear, positions `Float32Array` and not normalized. Load time was 85 ms against 152 ms locally; that is not a network number.

### 5.6 Pitfalls found (so they are not paid for twice)

- `meshopt()` already calls `reorder()` and `quantize()`; passing your own `quantize` first is overridden by its defaults (8-bit weights). To avoid quantization, compose `reorder()` and the extension yourself, as the script does.
- `quantize()` clones the skin once per mesh (twelve skins for one character) unless `quantizationVolume: 'scene'`, which lets `dedup` merge them back.
- `dedup()` merges byte-identical meshes (the camp woman's LOD0 and LOD1 sash) and equal materials, changing the node→mesh structure and the material names the runtime reads roles from. Not used.
- In three r185, `SkinnedMesh.getVertexPosition` already applies the bone transform. Calling `applyBoneTransform` after it skins twice, which is invisible on an unquantized file at the bind pose and wildly wrong on a quantized one. An early "quantized files are broken" result was this harness bug, caught by computing one vertex by hand.
- Under jsdom a Node-realm `ArrayBuffer` fails `GLTFLoader`'s `instanceof ArrayBuffer` and is parsed as JSON ("Unsupported asset"). Copy with `new Uint8Array(buffer).buffer`, as the existing tests do.
- Measure image error only on texels that can be seen, and normal maps lossless.
- `compressTexture` (one texture) does not declare `EXT_texture_webp`; the `textureCompress` transform does. See F15.

### 5.7 What converting the characters needed

All of it is done and described in 5.8: the packaging scripts run the optimizer, one shared test loader replaced the per-file ones, and the validators decode instead of reading raw bytes.

### 5.8 Converting the existing characters (Phase 2 step 1, done)

Decided by the maintainer on 2026-10-14: convert everything; crowd skin and hair may drop to 1024²; realism comes before the 37-draw cap; coordinate PR #19.

**What ships.** Each of the 13 characters is now two files: the optimized `<id>-<hash12>.opt.glb` the scenes load, and the plain `<id>-<hash12>.glb` exactly as before, named in the manifest as `fallback` (with `fallbackSize` and `fallbackSha256`) and fetched only if the first fails. The four generated manifests (`sceneHumanAssets.js`, `sceneTableauAssets.js`, `tabernacleCharacterAssets.js`, `elahCharacterAssets.js`) carry `compression`, `fallback*` and each texture's recorded size and format.

**Texture limit.** The crowd's bodies (`artisan`, `villager`, `traveler`, `camp-man`, `camp-woman`) have skin and hair at 1024². The named principals keep 2048²: Jesus and Matthew (staged up close), the Levite, priest and high priest (authored vestments), David, Goliath and the shield bearer. This is the `MAX_TEXTURE` constant at the top of each `scripts/humans/package_*.mjs`; setting a character's entry to `1024` and re-running that script is the whole change.

**Results when the conversion landed** (the eye-texture rule in section 10 has since trimmed these a little further).

| Scene | First visit, full: before → after | Small tier: before → after |
| --- | --- | --- |
| Capernaum | 32.26 → **15.44 MiB** | 29.21 → 12.38 |
| Second Temple | 27.05 → 12.53 | 24.98 → 10.45 |
| Mount of Olives | 28.97 → 14.45 | 25.39 → 10.87 |
| Tabernacle | 25.12 → 13.34 | 22.51 → 10.74 |
| Sinai | 24.63 → 13.14 | 20.86 → 9.37 |
| Bethlehem | 22.13 → 10.64 | 22.13 → 10.64 |
| Caesarea | 16.19 → 7.46 | 14.46 → 5.73 |
| Valley of Elah | 15.65 → 9.38 | 12.83 → 6.55 |

Capernaum's actors group goes from 28.37 to 11.55 MiB. Estimated decoded texture memory for Capernaum's six characters falls from 349.5 to **221.5 MiB**, and for the four the crowd draws from 229.4 to **101.4 MiB** (width × height × 4 × 4/3 per image; an upper-bound estimate, not a device measurement). The principals still dominate what is left (Jesus 65 MiB, David 71 MiB, Matthew 55 MiB), but they are only resident while staged.

**What was checked.**
- The optimizer's audit now also proves the rig: every inverse-bind matrix and every animation sample is bit-identical, and node transforms agree within 1e-5. That tolerance is not slack: the writer snaps the Blender export's near-identity scales (`1.0000015`) to `1`, which moved at most 3.7 × 10⁻⁶. It also keeps node names, node→mesh, skin joints, materials with alpha mode and cutoff, attribute types and identical triangles for every primitive. A character that fails it is not written. All 13 passed.
- three.js loading each plain file and its optimized twin: vertex positions agree within **0.002 mm** at the bind pose and across all six clips, with no unmatched vertices. Normal angles are not quoted: where vertices coincide (double-layered vestments, Jesus's mantle) position-plus-UV matching can pick the wrong twin, and the triangle audit, which compares every vertex's full attribute row, passed.
- A real browser (headless Chrome, real image decoding, the production decoder) loaded both files of all 13 characters with identical mesh counts, triangles, bone counts and clip names and durations, and texture formats and colour spaces intact.
- All four validators were rewritten around `scripts/lib/glb-check.mjs` and now decode through a loader, check both files of each record (hashes, layout, extensions, textures against the manifest, weights summing to one, triangles), and still run the Elah body-height measurement. Scene tests: 62 files, 1097 pass. Of those 28 new ones, 8 are mine and 20 are `sceneHumanRealRigs.test.js` discovering the `.opt.glb` files by directory listing, so the existing rig, finger and seating tests now run on the compressed characters as well.
- The retargeted Mixamo clips name the plain build's hash (`targetSha256`): they were fitted to that skeleton, and the audit shows the optimized file holds it bit for bit. `retarget_elah_mixamo.mjs` and `retarget_player_mixamo.mjs` now read the plain build, and re-running both reproduced `elahMixamoClips.json` and `playerAvatarClips.json` byte for byte. The one test that compared `targetSha256` with the manifest now compares with `fallbackSha256 ?? sha256`.

**Things to know.**
- The plain files stay in the repository and are deployed. That is the plan's fallback requirement, and adds 25.40 MiB of new files (the 13 optimized ones) on top of the originals. Dropping the fallbacks later means deleting the plain files and the `fallback*` fields, and relaxing the validator rule that requires them.
- The packaging cleanup only ever removes superseded `.opt.glb` files. An earlier version of it also removed `goliath-d980857077e0.glb`, an old tracked Goliath build that nothing references; that was undone and the cleanup narrowed, so it is still in the repository and can be deleted by a person if wanted.
- Test files get their loader from `src/test/gltf.js` (`createTestGltfLoader`): the meshopt decoder, and the headless-image plugin at the *front* of the plugin list. The ordering matters: three's own WebP reader would otherwise claim WebP textures and wait forever for jsdom to decode them.
- Image quality of the 1024² crowd textures has not been looked at. It is on the manual checklist.

## 6. Decisions and their reasons

1. **Branch.** All work is on `feat/scene-enhancement`. `main` is untouched.
2. **Validator fix.** Made in Phase 0 because the plan names this validator as a release gate and it was red for a reason unrelated to any asset.
3. **Adopted: lossless float meshopt, role-aware WebP, explicit fallback.** Not adopted: quantization, `dedup`, KTX2. Evidence in section 5.
4. **Maintainer's answers (2026-10-14), and what was done with them.** Convert the existing characters: yes. Crowd skin and hair to 1024²: yes. The crowd draw cap: raise it if realism needs it, with the reason recorded and a whole-frame draw count measured first (the plan forbids raising it silently). PR #19: coordinate. **Done:** the cap in `sceneInstancedHumans.test.js` went from 37 to 96 (the crowd draws 90) with the reason and the measurement written into the test; the whole-frame cost is in section 10.5.
5. **Identity presets and the budget.** Six presets built like today's characters would be roughly 27 MiB against a +3 / +8 MB allowance, so presets must not be shipped that way. With Phase 1 measured:
   - converting the existing characters is worth −16.0 MiB on Capernaum's first visit; six new presets at the *optimized* size of today's characters (about 1.6–2.6 MiB each, roughly 12 MiB) would then leave the net change near −4 MiB, inside the gate, though the gross addition would not be. Both numbers should be reported when Phase 2 lands;
   - presets still ought to share textures with the existing bodies through the tint system `sceneHumanAppearance.js` already has, and to differ in geometry, so they cost less than that;
   - far distance (LOD1, 0.4 MiB uncompressed) is what most of the crowd uses, and near (LOD0) meshes are capped at 8 / 4 / 0;
   - because of F10, variety that needs no new mesh is preferred where it is enough: per-instance tint (exists) and build (exists, ±6%). A candidate, **untested**, is baking body proportions into the instanced crowd's bone-matrix rows: no extra draws, but bone-texture memory (7.1–9.6 MB per model already, per `scene-humans-assets.md`), so measure first. Face and head shape are what clearly need new geometry.
   **Outcome:** the eight presets are 14.02 MiB, Capernaum's first visit is 29.39 MiB against 32.26 MiB before this work (net −2.87 MiB, inside the +3 / +8 MB gate), and no existing character had to be cut.
6. **A source registry for props and vegetation is deferred to Phases 3 and 4.** Existing records fit their own domains: `scripts/humans/sources.json` (MakeHuman packs, pinned URLs and SHA-256, read by `fetch_sources.py`), `sceneMaterialAssets.js` (generated, Poly Haven), `CREDITS.txt` plus `prepare-scene-audio.py` (audio), `sceneSourcesData.js` and `docs/scene-realism-sources.md` (historical evidence IDs and certainty). None records a prop or tree input, so a small registry will be added when the first such input is acquired, with the fields the plan lists.
7. **Historical confidence vocabulary.** The repository already uses `attested`, `probable`, `inferred`, `illustrative`. New work keeps that set.

## 7. Acceptance targets, restated against the baseline

| Target (plan section 11) | Baseline to compare against, and where it stands now |
| --- | --- |
| Near human triangles at or under the largest shipped | Ambient ceiling was `human-artisan` 61,136; the absolute maximum is the high priest at 76,193. The presets run 54,778 to 63,811 near (the elder's scruffy beard and the braided hair are the heavy ones), inside the shared validator's own 65,000 limit and far under the maximum. |
| Far humans at or under 12,000 | Met: the presets' far meshes are 9,854 to 11,480. The high priest (18,285) and Goliath (12,454) already exceed it; they are named characters and out of scope. |
| Actor caps and crowd density unchanged | Met: caps are as in section 3 and no person was added. Variety was added, not population. |
| +3 MB low / +8 MB high first-visit on the Capernaum pilot | **Met in net terms.** Capernaum first visit: **32.26 / 29.21 MiB** (full / small) before this work, **29.39 / 26.34** now, so −2.87 MiB net. Gross, the presets add 14.02 MiB to the converted state (about 15.4 / 12.4). Every other scene lost 6 to 15 MiB (section 5.8). |
| ≤10% frame time and draw-call increase | **Draw calls: not met, by decision.** Whole frame +23% to +36% across the six vantages, measured (section 10.5); the maintainer chose realism over the cap. **Frame time: not measured** (no device; SwiftShader's times mean nothing). Triangles −0.6% to −1.5%; shader programs 143 → 84. |
| Validators, tests, build | Lint 10 errors and 5 warnings (unchanged, none in touched files); scene tests **63 files, 1190 tests pass** (baseline 62 and 1069); audio tests, all four validators and the build pass. |

## 8. Resume here

**What is done and where to look:** sections 5.8 (conversion) and 10 (presets). The branch is `feat/scene-enhancement`, uncommitted, nothing pushed.

**What a person should do next.** Walk Capernaum on a screen and a phone with section 9 open. Nothing in sections 5 and 10 says the new people *look* right, only that they are measured, the right size and age, loaded safely and fitted.

**What is left of Phase 2, if wanted:**
- *Clothing variation.* The presets differ in body, face, hair and brows, and in hem (the women's tunics are long, and the lean man's a little longer than the other men's); the sleeves, footwear, mantle placement and sash width are still the shared wardrobe's. The plan also asked for dye variation weighted by scene and activity.
- *Hands, ears and feet* beyond what the morph targets give (the ear and cheek targets are used; nothing was authored or baked for hands or feet).
- *More presets for other scenes.* Only Capernaum has a pool. Caesarea, Bethlehem and the Temple would use the same presets with their own pools; Sinai and the Tabernacle are the Late Bronze and Iron Age and want their own people and dress, not Roman-period villagers.

**Decisions that are the maintainer's:**
1. **Do the new people look right?** Everything else turns on this (section 9).
2. **Keep the plain fallback files?** They are 36.8 MiB of the 76.1 MiB of new binaries this branch adds (the optimized files are 39.3 MiB). They exist because the plan asked for fallbacks and cost nothing at runtime. If the compressed path proves itself, deleting them and the `fallback*` fields is a cleanup.
3. **PR #19** (Jesus hero character) edits the same validator and manifest lines as this branch and records plain URLs in `sceneHeroAssets.js`. Whichever lands second needs a rebase, and a hero asset would need `compression` and `fallback` fields, or to go through `scripts/lib/publish-character.mjs`.
4. **Quantization** stays off until the readers of raw positions have been audited (section 5.2).

## 9. Manual review checklist

Check on the dev server or a phone; **none of this has been looked at by anyone**, including the Blender preview renders I glanced at for gross errors.

- **The new people, close up** (`/scene/capernaum`, walk to the shore nets, the oven yards at x −12 to 0, z 28 to 36, and the lane at x 2, z 8 to 19): are the faces distinct and plausible rather than odd or caricatured? Does the elder woman's grey hair and the elder man's grey beard read as age? Do the children read as children, in the lanes where five of them run and at the oven?
- **The village's old man** (figure `elder`, x 13, z 37.25, sitting in a doorway) should now be the white-bearded elder.
- **Veils and head cloths on the new women**, and bareheaded children: fit at the temples and nape (the drape tests hold them outside the skull and clear of the face; they cannot say they look right).
- **Walking and sitting** on the new bodies, in particular the children (feet on the ground, a child sitting on a stool with feet dangling is expected) and the lean tall man.
- **Capernaum crowd faces and hair at near distance** with the 1024² skin and hair, and the 256² eyes: soft tone or fine strands, not silhouettes, are the risk (the PSNR numbers are in 5.3; the eyes were not measured, only reasoned about: 0.1 mm a texel on the iris).
- **Jesus and Matthew** (events *Mark 2* and the customs post) and the Levite, priests, David, Goliath and the shield bearer keep their 2048² textures, recompressed; check hair and beard edges.
- **The named carrier** (placement `cap-actor-carrier`, x 12, z 28) holds the jar, whose triangles are identical.
- **Standing, sitting and working about** (section 11): the shore nets (x 8, z −16.5) and the other haunts. Nobody should hold their arms out in front with open palms. Whoever sits should be on the ground with legs out in front and no stool; whoever works should now and then bend to the ground and straighten up, not all at once.
- **Both loading paths:** with the network panel set to block `.opt.glb`, a scene should still load its characters from the plain files, and nothing should break. Blocking only the *preset* files should leave Capernaum's crowd built, on the older bodies.
- **Load time on a phone**: the first visit is 14 MiB larger than the converted state (and 2.9 MiB smaller than before the work); the crowd builds twelve bodies' animation textures instead of four.
- Entries for the remaining phases will name the route and existing vantage ids, for props at realistic scale, foliage silhouettes and shadows, muted and reduced-motion behaviour, low-tier mobile use, and the protected priestly and named-character appearances.

## 10. Phase 2: identity presets (Capernaum pilot)

### 10.1 What was built

Every woman in every scene was drawn on one body, men on two, and children on scaled adults (F3). Eight new bodies, built from MakeHuman's macro sliders and a handful of MPFB's CC0 morph targets, give Capernaum's crowd more faces, ages and builds. They are authored variation, not demographic claims, portraits, or evidence of how anyone looked, and none is tied to a role, trade or character.

| Preset | Age | Height | Shoulders | Near / far triangles | Transfer | Decoded textures |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| `woman-young` | ≈22 | 1.56 m | 0.30 m | 61,970 / 11,150 | 1.72 MiB | 17.7 MiB |
| `woman-adult` | ≈38 | 1.55 m | 0.31 m | 59,151 / 10,642 | 1.67 MiB | 17.7 MiB |
| `woman-elder` | ≈67 | 1.49 m | 0.30 m | 59,151 / 10,642 | 1.70 MiB | 17.7 MiB |
| `man-elder` | ≈68 | 1.66 m | 0.36 m | 63,811 / 11,480 | 2.19 MiB | 23.0 MiB |
| `man-young` | ≈21 | 1.71 m | 0.36 m | 58,291 / 10,487 | 1.77 MiB | 17.7 MiB |
| `man-lean` | ≈40 | 1.78 m | 0.38 m | 58,290 / 10,485 | 1.80 MiB | 17.7 MiB |
| `child-boy` | ≈10 | 1.26 m | 0.26 m | 54,778 / 9,854 | 1.45 MiB | 17.7 MiB |
| `child-girl` | ≈8 | 1.12 m | 0.20 m | 61,971 / 11,149 | 1.73 MiB | 17.7 MiB |
| **All eight** | | | | | **14.02 MiB** | **146.7 MiB** |

The recipe of each (macro sliders, the skin, hair, eyebrows, eye colour and beard, and every morph target with its weight, resolved to a real file) is in its manifest record in `scenePresetAssets.js` and in the GLB's `asset.extras`, next to the body as built. The adult and elder women share a hairstyle (`long01`); the elder's is re-coloured grey.

### 10.2 How they are made, and what went wrong on the way

- The Blender 5.1.0 + pinned MPFB + fetched-packs toolchain was proved first: the existing artisan rebuilds byte for byte (F13). `build_characters.py --presets` builds the eight; `package_characters.mjs --presets` optimizes and records them. A morph-target name that matches no file stops the build rather than quietly making a plain face; this caught two typos.
- **Hair.** `bob01` and `bob02` are a modern side-swept bob whose fringe covers one eye and would poke out from under a veil: rejected, as the plan expected of "Hair 01" styles. The elders needed grey, and a tint cannot do it (the source hair is near-black, mean RGB about 27 of 255), so `hairColor` and `beardColor` re-map each pixel's strand detail around a target grey.
- **Ages and heights** were corrected after measuring (F14). The hem follows the body's own hips, so a child's tunic is cut where a child's knee is (the original five keep their fixed 0.90 m threshold so they still rebuild byte for byte).
- **Previews.** Each build rendered a Blender preview. I looked at them for gross errors only: wrong hair, wrong proportions, a missing or black texture. They are not a judgement of realism.

### 10.3 In the runtime

- A scene opts in with a pool of bodies per sex and age (`PRESET_POOLS` in `sceneHumanManifest.js`); a figure's `kind` and optional `age` choose a pool, and its identity chooses the body, so the near actor and the far crowd always agree. Unmarked figures are a man or a woman by identity; ages come from `AGE_WEIGHTS` (35% young, 55% adult, 10% elder) unless the figure says. Only Capernaum has a pool. Every other scene keeps the older rule, and a test reproduces that rule independently and compares it across 200 people of each kind in six other scenes and in the no-scene case.
- Children: `bodyScale()` turns a figure's `scale` (a fraction of an adult) into the scale that makes a child body that tall; near actors, the instanced crowd and the gait all use it. The village's five running children and its oven child land at the heights `capernaumLife.js` gave them.
- Women on the new bodies are veiled and walk the woman's walk (`isWomanModel`); children are bareheaded.
- **If a preset does not arrive** the person wears the body it varies (`FALLBACK_MODEL`), and the crowd no longer waits for a body that has a stand-in. The first version of that fix was wrong: the crowd waited for every wanted body before building, so one failed download would have left the whole village as stand-in figures. The new test that applies only the original bodies caught it, and failed before the fix.
- The crowd's shader programs are now keyed by what is patched in (role, dyed or not, cloth kind), not by whose body it is. Twelve bodies had been compiling twelve copies of the same programs.

### 10.4 Texture memory

Three changes keep the people from costing more than they did: the crowd's skin and hair at 1024² (5.8), **eyes at 256²** (an eye is a 24 mm ball; at 256 px the iris is still about 0.1 mm a texel, finer than any screen resolves, and it saves 5 MiB of GPU memory per body), and eyebrows left at 512² because their strands are the detail. The rule is `SMALL_TEXTURES` in `package_characters.mjs` and `package_tabernacle_characters.mjs` and applies only to the crowd's bodies (the 13 that also have the 1024² limit). Estimated decoded memory (width × height × 4 × 4/3; not measured on a device): the crowd's **twelve** bodies are about **228 MiB**, against 229 MiB for the four they used to be; Capernaum's six original characters 201.5 MiB against 349.5 before this work.

### 10.5 What it costs, measured

`node scripts/measure-scene-frame.mjs` builds the real Capernaum scene, loads its real assets through the real asset session, renders each of the scene's own six vantages in headless Chrome on SwiftShader, and reads `renderer.info`. Run on this branch and on a clean checkout of `c1d05cd` (`--root`), at `high`:

| Vantage | Draws, before → after | Triangles, before → after |
| --- | --- | --- |
| the shore | 388 → 496 (+27.8%) | 2.47 M → 2.45 M (−0.6%) |
| the tax booth | 445 → 547 (+22.9%) | 2.44 M → 2.43 M (−0.6%) |
| the doorway | 390 → 496 (+27.2%) | 2.22 M → 2.19 M (−1.3%) |
| inside the house | 366 → 470 (+28.4%) | 2.20 M → 2.17 M (−1.4%) |
| on the roof | 341 → 445 (+30.5%) | 2.18 M → 2.15 M (−1.4%) |
| the synagogue | 307 → 417 (+35.8%) | 2.16 M → 2.13 M (−1.3%) |

`balanced` is within a point of these. GPU resources at `high`: geometries 297 → 369, textures 210 → 251, **shader programs 143 → 84**. No shader errors and no GL errors at either tier. The crowd alone (`sceneInstancedHumans.test.js`): 70 people, **90 draws** (37 before), 827k triangles (845k before). A body therefore adds about 6.6 draws in the crowd and about 13 in the whole frame, because the sun's shadow pass draws the crowd again.

Those draw increases are above the plan's 10%, and the maintainer decided realism comes first. The crowd test's cap went from 37 to 96, with this reasoning and these numbers written into the test, and it should only be raised again the same way. What this does *not* say is that frame time went up by that much, or by anything: draw count is one input, the crowd's cost is mostly vertex skinning from a texture, and SwiftShader's times are not a phone's. That needs a device.

The program change was checked pixel for pixel: the same scene rendered with shared and with per-body program keys, at five vantages on both tiers, differs by 0 in every pixel (re-running identical code also differs by 0, so the comparison can see a difference), with real, varied frames (mean luminance 59 to 199, 169 to 224 distinct levels).

### 10.6 What was checked

- **`scenePresets.test.js` (20 tests):** each preset has a variant on its own model and a recorded recipe; its age (converted back to years), sex and measured height are where it was built to be; no two share a set of morph targets; triangle counts are inside the shared limits; every pool names real variants on bodies of the right sex or age; across thousands of people every body in a pool is used and no person is on a body of the wrong kind; a figure's `age` is respected; the village's elder is `man-elder-a`; the age mix is within 2.5% of `AGE_WEIGHTS`; the same person gets the same body and appearance at any index and as a near actor; explicit variants are untouched; every scene without a pool is exactly as before; adults keep their scale and children are as tall as asked; the fallback bodies exist, are of the right kind, and only Capernaum downloads the presets.
- **The existing suites, extended to the new bodies:** the drape and hat suites on all six new grown bodies (cloth outside the skull, face open, crown covered, shoulders reached, no stretch, symmetric, deterministic); the cloth, gait, appearance, human-assets and near/far suites with the production set of bodies; and `sceneHumanRealRigs.test.js`, which finds the new files by listing the directory, on the plain and the optimized file of each. Where those tests held absolute millimetre thresholds calibrated on adult bodies, the finger-travel thresholds now scale with the body's size, and a child seated on a stool is allowed feet higher off the floor (0.34 m instead of 0.22 m, since the stool is a grown person's height and a child's shin is shorter): the tests learning what a child is, not a threshold relaxed to pass.
- **A real browser:** all eight presets, optimized and plain, load with identical mesh, triangle, bone and clip counts and the same texture count. Whole-frame measurements as above.
- **Mutation checks:** the missing-preset test failed before the crowd stopped waiting for absent bodies; removing the decoder or the fallback attempt fails the tests that guard them (5.5).

### 10.7 What is not done, or not known

- No one has looked at the people (section 9). Faces are the hardest thing to get right and the least checkable here.
- Frame time and memory on a device. Draws and programs are counts.
- Dress variation beyond the shared wardrobe, hands and feet (section 8).
- Only Capernaum. The presets are not in any other scene's manifest, by a test.
- Each preset ships its near (LOD0) mesh, which before compression is about five times the size of its far one (2.0 against 0.4 MiB on the artisan) and is used by at most eight near actors. A crowd-only body without LOD0 would save a large part of each preset's transfer; it was not done because near actors would then draw 10,000-triangle faces up close.

## 11. The crowd's awkward standing

The maintainer's screenshot (Capernaum, four people in a row with the same arms-out, open-palm pose) was the report.

### 11.1 Cause

Each model ships its own baked clips (`idle`, `work`, `sit`). All three hold the arms out in front of the body with the palms open, the stiff A-pose of the rig. `CROWD_MOTIONS` (`sceneMixamo.js`) handed a captured clip to a person by activity, but had `null` in its `standing` and `attending` lists ("so some people still do the baked one") and had no entry at all for `sitting` or `working`. A probe of the built Capernaum crowd found 10 of 34 people on a baked clip, and all ten belonged to the `shore-nets` group (the group that is all sitting and working), so it read as a row of identical people. Separately, gesture schedules were clustered: the hash behind them was `n * 31 + c`, under which ids differing only in the last character differ by a few units, so a group's talkers and gesturers fell into two clusters and acted together.

### 11.2 What changed

- `sceneMixamo.js`: no `null` in the standing lists; `sitting` gets `sit-floor` and `sit-floor-reclined`; `working` gets `pick-up`; `GROUND_SEATED` names the clips that sit a person on the ground; `assignCrowdMotion` leaves a figure `onStep` alone (the baked sit is posed to be lowered onto a step with the feet on the steps below, a floor-sit would put the legs over the next step down).
- `sceneMotionLife.js`: a work clip is played whole between long spells of standing (period 26 to 36 s, window 9.4 s of the 9.55 s capture); the hash is FNV-1a with a final mix, so sequential ids spread across the cycle.
- `sceneInstancedHumans.js`: no stool for someone whose floor-sit clip was baked for them (judged by the bake, not the request, so a figure whose library never arrived keeps the baked sit and its stool).
- `sceneHumans.js`: the same for the near actors, including the case where the library arrives after the actor was made with a stool (the stool's parts are hidden when the clip installs).
- `buildCapernaum.js`: a floor-sitter's placement keeps 0.55 m clear in front of them for their legs (a worker keeps its 0.45 m).

### 11.3 What was checked

- **`sceneCrowdPoses.test.js` (new, 20 tests):** on five bodies (artisan, villager, adult woman, elder man, boy) each ground-sit clip puts the pelvis under 0.25 m, the lowest joint within 0.12 m of the ground and none below it, and the head clear above the pelvis; `pick-up` starts and ends where `breathing-idle` stands (head within 6 cm, pelvis within 5 cm), dips at least 8 cm at the pelvis and 25 cm at the head in between, and keeps the lowest joint within 0.12 m of the ground; every option list names a real clip; a step-sitter, a walker and a figure with its own clip are not reassigned; ids differing in one character gesture at spread-out times; the work gesture holds the whole capture between long spells at ease.
- **`sceneInstancedHumans.test.js`:** floor-sitters get no stool and are not lifted, with the stool kept when no library is present; a step-sitter keeps the baked sit and has no stool; in the built Capernaum nobody in place is on a baked clip, and the stool count is exactly the number of people who sit on the baked sit.
- **`sceneMotionLife.test.js`:** a near actor's stool is hidden when, and not before, its floor-sit clip arrives, and kept when the clip is absent.
- **Mutation checks:** putting a `null` back in `standing`, removing the `onGround` test, and removing the near actor's stool hiding each fail a test.
- **Whole gate** (before 11.5; see there for the final counts): scene tests 64 files / 1216 tests; the four validators and the build pass; lint is the same 15 problems as before, none in the files this changed. The full suite also reports three failures that are not from this work, in files it does not touch: `Studies.test.jsx` (the closest-meeting test is date-dependent) and two in `sceneNarrationManifest.test.js` (the Bethlehem `village-workshop` line has no recording; `node scripts/build-scene-narration.js` re-records it, which needs the `fish-tts` secrets). `sceneHumanDrape.test.js`'s two heaviest tests now carry a 30 s timeout: with the presets they loop over thirteen bodies and passed alone but timed out at the 5 s default when the suite ran in parallel.

### 11.4 What is not known

- Nobody has looked. The pose numbers say the body is on the ground and bends and recovers; they cannot say it looks like a person sitting at nets. The hands of `sit-floor-reclined` are the most likely to be wrong, since a capture has no idea what the net is.
- The white rectangle in the screenshot (under one of the people) was not identified; it is not a stool, which is a cylinder.
- Working people play `pick-up` facing the way they are placed, towards nothing in particular; a person bending to a net that is not in front of them would look wrong. The placement leaves 0.45 m in front of them but there is no prop there for the hands to reach.
- Frame cost was not re-measured. A body in the crowd now bakes up to three more clips (`sit-floor`, `sit-floor-reclined`, `pick-up`, each capped at 96 rows), which adds to its bone texture but not to draws; `node scripts/measure-scene-frame.mjs` would say.

### 11.5 The loop: people flashing back into the stiff pose

The maintainer's second screenshot (the same shore, a reclined sitter, two people standing, the traveller) came with "some folks in a glitchy loop". The fix in 11.2 had **introduced** it.

**Found by measuring, not guessing.** A still cannot show a loop, so a temporary test built the real Capernaum with the motion library and every model, stood the camera at each haunt, stepped 60 to 90 s at 30 fps, and tracked each person's skinned pose frame to frame, for the baked crowd (vertex samples through the bone texture) and for the near actors (bone positions in their own frame), reporting any jump no body makes in a thirtieth of a second together with the clip transition it came with. At the shore nets the reclined sitter went `life:sit-floor-reclined -> idle -> life:sit-floor-reclined` every third of a second (270 times in 90 s, a 0.83 m jump) and the worker `life:pick-up -> idle` every 1.2 s (72 times, 0.5 m). `idle` is the baked A-pose, arms out, palms open.

**Cause.** The eight nearest people within 15 m are near actors (`sceneHumans.js`, high quality), and after each update every near actor is held to `isSane` (`sceneHumanSafety.js`), written for people who stand and walk: head at least 0.16 of a height over the pelvis, pelvis 0.12 over the feet, head 0.48 over the feet. A person sitting on the ground has the pelvis at the feet's height (0.05 m over them on `sit-floor`, −0.02 m on `sit-floor-reclined`); a person bending to `pick-up` has the head below the pelvis (−0.10 m); either fails, `forceSafeIdle` replaces the pose with the baked idle, and the next frame's motion update starts the clip fading back in, which fails again. Sitting on a stool used to pass, because the baked sit has the pelvis 0.37 m up, which is why this was new.

**It was not only mine.** Auditing every captured clip on five bodies against the check showed `talk-chat` failing for about a fifth of its length on every one (a deep lean: the head only 0.17 m over the pelvis), and `kneel-idle` and `kneel-pray` failing on the villager body by 1.6 cm. None of the check, the talk clips or the kneel clips was changed by this session, so by the same reading talkers and kneelers in the near ring were flickering this way before it, though that was not run on the earlier code. The village's other clips pass.

**What changed.** `sceneHumanSafety.js` has `POSTURES` (the three limits as fractions of height, per posture: `upright`, which is the old check unchanged and the default; `lean`; `stoop`; `kneel`; `ground-seat`) and `CLIP_POSTURE` (which captured clip is which: `talk-chat`, `pick-up`, `kneel-idle`, `kneel-pray`, `sit-floor`, `sit-floor-reclined`); `postureOf(actionName)` strips the controller's `life:` prefix. `sceneHumans.js` passes the postures of the actions that are showing (the one playing and, while it fades, the one it is leaving, held to the least demanding of them). Every posture still requires finite landmarks, the feet near the surface, and the head clear of the floor and of the feet; the limits are the least measured on all sixteen bodies, with margin. A new clip that does not fit the upright check will fail `sceneHumanSafety.test.js` rather than flicker.

**Checked.**
- `sceneHumanSafety.test.js` (8 tests): every clip `CROWD_MOTIONS` can deal, and every rest and gesture the schedules play, passes under its posture for sixty moments through the clip on all sixteen bodies; the default is still exactly the old limits; every clip with a posture fails the upright check on some body (so the table is not decoration); a sleeper fails every posture; a body upside down fails every posture; a body between two postures is held to the less demanding; a NaN fails.
- `sceneMotionLife.test.js`: a sitter on the ground, a sitter, a worker, a talker and a kneeler run 100 s at 10 Hz and are never in `idle`, and each was seen playing the clip that used to trip the check. Removing the posture from the call fails it.
- The detector, rerun after the fix: the shore nets went from 270 and 72 flips to none, and none at the six other haunts (what it still lists is motion inside one clip, never a change of clip, apart from a one-frame change as an actor first appears).
- Gate: scene tests 65 files / 1225 tests; whole suite 2345 pass with the same three unrelated failures as in 11.3; lint the same 15 problems in the same three files.

**Lesson, so it is not paid for twice.** The gate was green and the scene looked wrong, because nothing ran a near actor through its own safety check with a captured clip. Anything that changes which clip a person plays should be run through a long simulation of the real scene and watched for a change of action; the check in `sceneHumanSafety.test.js` now does the cheap version of that for the poses.

**Not known.** Nobody has looked. The seam of `pick-up` (its last frame is 0.4 m from its first, at the hands) and of `talk-chat` (0.55 m) are never played, because the schedules cut both well before the end, but a capture added later with an open end and a looped schedule would show a 0.3 s snap, and nothing tests for it yet. The white sheet in the screenshot is the `awning` prop that the beach scatters as "nets spread out to dry" (`buildCapernaum.js`, a flat 2.4 by 1.8 m cream plane, double-sided, up to 1.2 times larger): it is lit nearly white in full sun, and it is under the haunt because the haunts and the beach props are placed independently. It was not touched.
