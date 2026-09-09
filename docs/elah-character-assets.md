# David and Goliath character assets

Elah now uses three dedicated textured, skinned GLBs in place of Gemini’s box-and-cylinder principals. David has separately shaped youthful anatomy, short hair, a plain woven tunic, narrow leather girdle, satchel and sandals. Goliath has a broader, muscular anatomy, beard, fitted bronze dome helmet, a coat of individually modeled overlapping scales and fitted greaves. A third anatomical character carries his shield. These are authored game characters, not scans or verified historical portraits.

## Physical scale and evidence

The models are normalized at authoring time to **David 1.65 m**, **Goliath 2.9 m**, and **shield-bearer 1.75 m**. The nominal David:Goliath height ratio is **1:1.758**. Height is measured from the soles to the crown before adding helmet and hand-held equipment. The export stores the physical-height transform. The runtime never rescales Goliath using a bounding box that includes his spear.

The live, slightly posed skin/hair measurements are approximately 1.664 m and 2.877 m (ratio 1:1.73); head inclination and straightening the source stance account for the small difference. Validation permits at most 3 cm from each authored target. Both the tests and the validator evaluate actual skinned vertices and exclude weapons, armor and helmet; the previous proxy test measured the spear.

David’s height and both likenesses are artistic choices. Goliath’s 2.9 m target retains the scene’s six-cubits-and-a-span interpretation; the alternate height reading is retained in the on-screen source note. The helmet, body armor, greaves, spear and separate shield-bearer follow [1 Samuel 17:4–7](https://www.esv.org/1+Samuel+17/). David’s shepherd equipment follows verses 38–40. Shield outline, hair, faces, skin coloration, footwear construction and other fine details are reconstructions rather than evidence. The [USCCB chapter notes](https://bible.usccb.org/bible/1samuel/17) discuss the height readings.

## Authoring and source rights

Anatomy, eyes, hair, beard and fitted tunic derive from the same pinned CC0 MakeHuman/MPFB sources documented in [scene-humans-assets.md](scene-humans-assets.md). The new script uses separate macro presets for each character and generates plain cloth, leather accessories, armor, helmet and sandals. Upstream license notices are copied to `public/assets/scenes/elah/notices/`. MPFB is an authoring tool and is not included in the browser bundle.

The authoring script loads the existing Blender character utilities as a library without rebuilding the other scene characters. Editable `.blend` files, raw GLBs and neutral studio renders are saved in ignored `scripts/.cache/elah/`. Packaged content-addressed GLBs and the generated `elahCharacterAssets.js` manifest are the application deliverables.

Rebuild with Blender and the source directories produced by the existing source fetcher. Example for the source caches on this machine:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background \
  --python scripts/humans/build_elah_characters.py -- \
  --source /tmp/miqra-human-assets --mpfb /tmp/miqra-mpfb --preview
node scripts/humans/package_elah_characters.mjs
node scripts/validate-elah-characters.js
node scripts/validate-scene-assets.js
npm test -- src/components/scene/elahPrincipals.test.js src/components/scene/buildElah.test.js src/components/scene/elahNavigation.test.js
npm run build
```

Substitute the actual source-fetcher paths on another machine. Blender 5.1 and the repository’s pinned MPFB checkout were used. Asset texture/image validation uses Sharp; browser skinning validation loads the real exported GLBs with Three’s GLTFLoader.

## Runtime and animation

The Elah-only manifest group loads all three principals, totaling about 12 MiB before transport compression. High-detail meshes are about 56–60k triangles each, and low-detail meshes about 11–12k. Low quality keeps all three visible and switches to the reduced meshes. Other scenes do not download these characters.

The GLBs retain the source six project-authored skeletal clips on Mixamo-compatible rigs. The active champions now use actual captures from [Adobe Mixamo](https://www.mixamo.com/): **Bouncing Fight Idle** for David (90 frames at 30 fps), and **Standing Taunt Chest Thump** for Goliath (86 frames at 30 fps). The separate “Fight Idle” download was inspected but not used. Source FBXs supplied through the signed-in Mixamo workflow are retained in ignored `scripts/.cache/elah/mixamo/`; the donor mesh is not shipped. The browser loads the baked, target-specific tracks from `elahMixamoClips.json` with the Elah builder.

These motion captures are Adobe assets, **not CC0**. The [Adobe FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) permits royalty-free use of Mixamo animations in personal, commercial and nonprofit projects including games. This use is within the scene; it is not a standalone stock animation library. Character geometry and texture source rights remain as documented above. Each generated motion record stores the exact FBX SHA-256, target GLB SHA-256, source title, frame rate and source duration.

To rebuild, export the two exact titles as FBX Binary, With Skin, 30 fps, no keyframe reduction, then save the files under their Mixamo titles in that cache directory and run:

```sh
node scripts/humans/retarget_elah_mixamo.mjs
```

The retargeter computes world-space rotation offsets from an anatomical T reference to accommodate the MPFB bone axes. It retains the captured body and limb movement, grounds the deformed soles, and uses the character's own finger hinges for closed grips. Goliath thumps with his captured **right hand** while his **left arm** holds the spear; a two-bone correction preserves the fist's position relative to his chest across different arm/torso proportions. His sword and back javelin follow the pelvis and torso. David keeps his sling in his right hand; his staff is planted beside him so both arms can take the captured guard stance. These are equipment adaptations of the named clips. Short returns to the first pose close the loops (3.13 seconds for David; 3.23 seconds for Goliath).

Spear, sling and shield are custom runtime meshes placed from the evaluated hand/finger bones every frame. The spear stays upright in its constrained grip; the hanging sling remains gravity-aligned. Bronze uses a small sky/earth reflection probe so a metallic surface remains legible in the scene’s lighting.

Character placement is shared with navigation. Foreground rocks are excluded around the cast. The reference viewpoint puts the two champions at comparable camera depth; their stature contrast comes from model scale rather than a large weapon or a misleading camera angle. The shield-bearer is offset to avoid blocking Goliath.

The tableau disposes its cloned skeletons, mixers, prop geometry, reflection probe and cloned bronze materials. The asset session retains ownership of original character geometry, textures and materials. Reduced motion uses the original still standoff pose; the bearer retains subtle authored breathing. Partial loading can accept a later asset group without duplicating existing actors. The nominal body heights and physical-height transforms are unchanged; crouching and bouncing naturally vary the posed crown height.

The surrounding armies and landscape remain Gemini’s procedural scene geometry. This work replaces the principal characters and their equipment; it does not claim to finish the original brief’s entire battlefield or a sling-release sequence.

## Verification for this implementation

- `validate-elah-characters.js`: passed; decoded all embedded character textures, checked hashes, skin weights, clips, LOD counts and posed anatomical heights.
- `validate-scene-assets.js`: passed, including all three Elah GLBs.
- 49 tests passed across the three Elah files and the existing scene loader, scene registry and route tests.
- ESLint passed on the changed JavaScript; Blender authoring Python compiled successfully; production build passed with the existing large-chunk advisory.
- Visually inspected the neutral Blender renders, the actual browser standoff, the close Goliath viewpoint and low-quality character visibility. Automatic graphics quality was restored after the check. Mobile frame rate and a photorealistic battlefield reconstruction were not established by these checks.
