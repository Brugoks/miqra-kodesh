# Scene human assets and reproducible builds

The scenes now use three locally hosted, textured and skinned characters derived from MakeHuman Community assets. These replace nearby crowd figures in Capernaum, Caesarea, the Second Temple and the Tabernacle. The former three static Capernaum actor assemblies are excluded from the loading manifest.

These are real-time anatomical characters, not scanned people or cinema-quality digital doubles. They have actual facial geometry, textured skin, separate textured eyes, hair, fingers, fitted garments, and a 52-bone deform rig. Do not describe the assets as historically verified portraits or claim facial morphs, skin subsurface scattering, cloth simulation, or motion capture that they do not contain.

## Provenance and rights

| Component | Source | Published asset license |
| --- | --- | --- |
| Base anatomy, shaping targets, Mixamo-compatible rig definition | [MPFB2](https://github.com/makehumancommunity/mpfb2), pinned commit in `scripts/humans/sources.json` | CC0 asset license; MPFB's authoring code has its separate GPL license and is not shipped in the browser |
| Male/female skin textures, low-poly eyes, brown iris texture, short02/short04/long01 hair, eyebrow001 | [MakeHuman system asset pack](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html) | CC0; core assets explicitly relicensed September 2020 |
| Plain fitted tunic geometry and texture, recolored and lengthened here | WDG, `wdg_mycenaean_tunic`, [Dress 01 pack](https://static.makehumancommunity.org/assets/assetpacks/dress01.html) | Published pack manifest lists CC0 |
| Artisan beard geometry and diffuse/normal textures | grinsegold, `grinsegold_beard_sigmund_wip`, [Bodyparts 05 pack](https://static.makehumancommunity.org/assets/assetpacks/bodyparts05.html) | Published pack manifest lists CC0 |
| Skeletal cycles, fitting changes, garment colors, detail levels and packaging | This repository's Blender authoring script | Project-authored adaptations of those CC0 assets |

The tunic's original `.mhclo` retains an older AGPL header. The distributed Dress 01 pack explicitly lists this particular asset as CC0. The published pack license manifest is preserved alongside the output, rather than silently discarding this discrepancy. The model is used under the pack's later explicit CC0 release. The core CC0 text and the dress/beard pack manifests are in `public/assets/scenes/shared/humans/notices/`. Upstream archive SHA-256 values and the exact MPFB commit are pinned in `scripts/humans/sources.json`.

The anatomical slider presets are authoring parameters, not historical evidence about ethnicity, appearance, or average body proportions. The tunic is an interpretive base garment, not evidence that Mycenaean costume represents every biblical period. No modern shoes, branding, or fantasy armor is imported. Bare feet, muted cloth and simple hair are artistic choices for anonymous background people.

## Runtime contract

- `sceneHumanAssets.js` contains the generated URLs, sizes, SHA-256 hashes and triangle counts. GLBs embed every texture and buffer; there are no runtime requests to an asset vendor.
- Each character has `_LOD0` and `_LOD1` meshes sharing its rig and textures. Near meshes have approximately 53–61k triangles; medium meshes have approximately 9.5–11k. The total library is approximately 14 MiB before HTTP compression.
- Clips: `idle`, `walk`, `work`, `prayer`, `sit`, `kneel`. They are authored skeletal loops. `work` is a generic small gesture, not synchronized net mending, milling, or prop handling.
- No facial blend shapes are advertised. A future facial controller can use morphs when an asset actually supplies them.
- Color maps are glTF base-color textures. Eyes have a glossy dielectric response; hair/brows/beards use depth-writing alpha cutouts. Hair/beard normal maps are retained where supplied. Skin uses conventional glTF PBR, without a fake red-glow shader.
- Seated characters receive a small wooden stool rather than an unsupported chair pose. Low/balanced/high allow 8/18/28 nearby skeletal characters, of which at most 0/2/4 use near geometry. Other people retain their instanced fallback. The replacement radius is 18/28/36 m, with a 3 m exit margin; near geometry uses 7/9 m enter/exit distances.
- Clones share asset geometry and textures and own their bones and mixers. The asset session disposes shared resources; the human manager disposes cloned skeletons. Changing quality or leaving replacement range restores fallback figures.
- Reduced motion freezes both skeletons and routes. Distance-driven gait is paused in the mixer to prevent double advancement. Character positions reuse the actual crowd descriptors, including route phase, lane and floor height.

## Rebuild

Requirements: Blender 5.1, Python 3, Git, and the project's installed Node dependencies (`sharp` is already a dependency). Blender/MPFB are authoring tools only; the application does not require them.

```sh
python3 scripts/humans/fetch_sources.py
/Applications/Blender.app/Contents/MacOS/Blender --background \
  --python scripts/humans/build_characters.py -- \
  --source scripts/.cache/human-sources \
  --mpfb scripts/.cache/human-sources/mpfb2 --preview
node scripts/humans/package_characters.mjs
node scripts/validate-scene-humans.js
node scripts/validate-scene-assets.js
npm test -- src/components/scene src/lib/scenes.test.js
npm run build
```

On another OS, substitute the Blender executable path. Downloads are several hundred MiB and remain in the ignored authoring cache. The source fetcher verifies hashes before extracting and checks out the pinned MPFB commit. The generator runs MPFB only inside a background Blender process and does not install a persistent Blender extension. Its `.blend`, raw `.glb`, and PNG review renders are in `scripts/.cache/humans/`.

The packaging step quantizes embedded PNGs, preserves native JPEGs, rebuilds aligned buffer views, writes content-addressed GLBs and updates the JavaScript manifest. No new runtime decoder or npm dependency is required. After accepting a new build, remove only superseded outputs from this character library; preserve assets owned by other scene work.

## Verification limits

The asset validator decodes the embedded images and checks binary lengths, hashes, real deform bones, skin weights, textures, clips and actual triangle budgets. Tests parse the shipped GLBs through Three's loader and exercise independent animation, mesh-detail switching, fallback continuity and reduced motion. Image decoding is substituted in the jsdom loader test and checked separately with Sharp.

Blender asset previews were inspected for anatomy, garment fit and poses. Per repository preference, no browser screenshot tour was used as a substitute for the maintainer's visual review. Actual browser GPU frame rate, mobile memory, close-view appearance under every scene lighting preset, foot planting through a complete walk cycle, and every route's collision with scenery still require device/visual review. The crowd and scene layout were inherited; this change does not certify every existing placement or route.

## Asset previews and checked results

Blender authoring previews (studio lighting, not in-app screenshots): [artisan](images/human-artisan.png), [villager](images/human-villager.png), [traveler](images/human-traveler.png).

After the final asset packaging: 312 tests passed across 23 scene/Atlas test files; both asset validators passed; the production build passed; ESLint passed for `src/components/scene`, the packaging/validation scripts and the scenery generator. Repository-wide lint reports ten existing unused-variable errors in `Studies.jsx` and five existing hook-dependency warnings in other files. Production build reports its existing large-chunk advisory. No deployment or commit was performed.
