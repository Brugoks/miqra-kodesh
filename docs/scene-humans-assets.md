# Scene human assets and reproducible builds

The scenes use three shared, locally hosted, textured and skinned characters derived from MakeHuman Community assets. Capernaum additionally loads two dedicated named characters for its tableaux: Jesus for Mark 2, and Matthew for the customs post. These replace nearby crowd figures in Capernaum, Caesarea, the Second Temple and the Tabernacle. The former three static Capernaum actor assemblies are excluded from the loading manifest.

These are real-time anatomical characters, not scanned people or cinema-quality digital doubles. They have actual facial geometry, textured skin, separate textured eyes, hair, fingers, fitted garments, and a 52-bone deform rig. Do not describe the assets as historically verified portraits or claim facial morphs, skin subsurface scattering, cloth simulation, or motion capture that they do not contain.

## Provenance and rights

| Component | Source | Published asset license |
| --- | --- | --- |
| Base anatomy, shaping targets, Mixamo-compatible rig definition | [MPFB2](https://github.com/makehumancommunity/mpfb2), pinned commit in `scripts/humans/sources.json` | CC0 asset license; MPFB's authoring code has its separate GPL license and is not shipped in the browser |
| Male/female skin textures, low-poly eyes, brown iris texture, short02/short03/short04/long01 hair, eyebrow001 | [MakeHuman system asset pack](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html) | CC0; core assets explicitly relicensed September 2020 |
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
node scripts/humans/package_characters.mjs --tableau
node scripts/validate-scene-humans.js
node scripts/validate-scene-assets.js
npm test -- src/components/scene src/lib/scenes.test.js
npm run build
```

On another OS, substitute the Blender executable path. Downloads are several hundred MiB and remain in the ignored authoring cache. The source fetcher verifies hashes before extracting and checks out the pinned MPFB commit. The generator runs MPFB only inside a background Blender process and does not install a persistent Blender extension. Its `.blend`, raw `.glb`, and PNG review renders are in `scripts/.cache/humans/`.

The packaging step quantizes embedded PNGs, preserves native JPEGs, rebuilds aligned buffer views, writes content-addressed GLBs and updates the JavaScript manifest. No new runtime decoder or npm dependency is required. After accepting a new build, remove only superseded outputs from this character library; preserve assets owned by other scene work.

## The call of Matthew, and the Matthew character

The customs post on the Via Maris holds Matthew 9:9. Matthew is seated behind his own table with the stylus still over the wax tablet; Jesus stands across it with his right hand out; the clerk beside him has not looked up and is the one figure in the composition whose animation actually goes somewhere. A queue of two, a guard by the awning post and two men who walked here with Jesus fill the rest of the booth. Nobody is walking away: the tableau holds the moment before the answer, and the story pin carries the meal and the argument that follow.

Matthew is a fifth authored character rather than a re-dressed villager, because the whole point of the scene is being able to tell which man is being spoken to. He is deliberately built against the rest of the cast on every axis the eye reads at distance: the shortest and heaviest of the men (height 0.44, weight 0.62 against the traveler's 0.58/0.48), clean-shaven where the artisan and Jesus are bearded, `short03` hair no one else wears, and the only dyed garment in Capernaum — a lengthened tunic tinted violet, which is expensive cloth in a village of undyed wool. He also carries geometry no other character has: a leather girdle at the hip with a money purse hanging from it, authored in `build_characters.py` beside Jesus's mantle. The girdle is measured onto the body rather than placed at assumed heights — its ring radii come from the fitted tunic's own silhouette and its height from the rig's pelvis bone — so the height and weight sliders cannot slide the belt off him. This is an interpretive portrayal, not a portrait, and the violet is a costume decision rather than evidence about first-century customs officers.

The tableau module mirrors `mark2Tableau.js` and its trade-offs: the cast waits for every model before it instantiates, clones share the asset geometry and own their skeletons and mixers, both principals survive low quality, and only they reach the near mesh. The furniture — table, stools, wax tablet, coin stacks and bags, strongbox, and the bronze balance that says what this table is — is owned locally and disposed with the tableau. Two things are solved per frame from the live rig rather than parented once: the stylus rides Matthew's writing palm, and the balance's pans hang plumb under a rocking beam with their threads joining the two. Both are asserted to stay attached across a hundred frames, the same check the Mark 2 ropes get.

The booth and its awning are reserved against random ambient placement, and the lane route that used to run through the middle of it now stops short of the queue. `matthew9Tableau.test.js` covers cast readiness, the reach between the two men, the stylus and balance attachments, feet on the floor and clear of the booth masonry, reduced motion, quality, collision at the right height only, and resource ownership.


## Verification limits

The asset validator decodes the embedded images and checks binary lengths, hashes, real deform bones, skin weights, textures, clips and actual triangle budgets. Tests parse the shipped GLBs through Three's loader and exercise independent animation, mesh-detail switching, fallback continuity and reduced motion. Image decoding is substituted in the jsdom loader test and checked separately with Sharp.

Blender asset previews were inspected for anatomy, garment fit and poses. Per repository preference, no browser screenshot tour was used as a substitute for the maintainer's visual review. Actual browser GPU frame rate, mobile memory, close-view appearance under every scene lighting preset, foot planting through a complete walk cycle, and every route's collision with scenery still require device/visual review. The crowd and scene layout were inherited; this change does not certify every existing placement or route.

## Asset previews and checked results

Blender authoring previews (studio lighting, not in-app screenshots): [artisan](images/human-artisan.png), [villager](images/human-villager.png), [traveler](images/human-traveler.png), [matthew](images/human-matthew.png).

After the final asset packaging: 312 tests passed across 23 scene/Atlas test files; both asset validators passed; the production build passed; ESLint passed for `src/components/scene`, the packaging/validation scripts and the scenery generator. Repository-wide lint reports ten existing unused-variable errors in `Studies.jsx` and five existing hook-dependency warnings in other files. Production build reports its existing large-chunk advisory. No deployment or commit was performed.


## Mark 2 tableau and Mixamo pose references

The Capernaum room holds the moment of Mark 2:4: four men bracing at different edges of the roof opening, a reclining man on a suspended woven mat, and Jesus below. Seated and standing listeners occupy the room, and a press of seven fills the doorway and the courtyard apron outside it. That press is load-bearing rather than decorative: Mark 2:2 says there was no more room, not even at the door, and it is the only thing that explains four men carrying a fifth up a wall. Two bodies stand in the metre-deep passage and three across its mouth, spaced so that `doorGaps()` — the module's own measure of the free intervals left across the opening — reports nothing wider than 0.14 m against a mat 0.88 m across. The press is solid in the clearance query too, so a visitor is refused entry exactly as the four men were, and it names the `door-crowd` barrier so the refusal is explained in prose instead of being a silent shove. The doorway remains open geometry in `blockerAt`; a flood fill in `mark2Tableau.test.js` runs twice over the same grid, once against the bare map and once against the crowd, and requires the first to get through and the second not to. Because a flood fill is undirected, that also means a visitor flown to the Inside the House vantage cannot walk back out through the door and returns via the vantage bar. The mat stays at a fixed height; restrained breathing and a few millimetres of sway supply ambient motion. This does not play out the subsequent healing. The interior story pin links to Mark 2:1–12 for the complete account.

Jesus has an ivory long tunic, dark long hair and a beard, with a project-authored woven red mantle over the shoulder. This is a recognizable artistic portrayal, not a verified historical likeness. His anatomy, hair, beard and tunic reuse the same licensed sources above; the mantle is authored in `build_characters.py`. `sceneTableauAssets.js` is generated separately so other scenes do not download this character.

The following animations were inspected visually in the signed-in [Mixamo](https://www.mixamo.com/) browser interface on September 7, 2026. They are movement references for the shared Mixamo-compatible rigs, not imported FBX or shipped Mixamo motion capture:

| Mixamo reference | Application |
| --- | --- |
| Breathing Idle | Relaxed arms, slight torso rise and varied breathing phases across shared standing characters in all four scenes; restrained Jesus pose |
| Sitting Idle | Bent knees, supported seating, hands near the thighs; shared seated characters and the house listeners |
| Walking — Male Standard Walk; Start Walking — Walking From Standing | Opposed arm/leg swing and restrained upper-body motion for the shared distance-driven gait |
| Pulling A Rope — Mime Pulling A Rope | Staggered hand grips and a braced torso for the four carriers; the broad theatrical pulling action is reduced to a held kneeling pose |
| Laying Idle — Laying On A Bed Idle | Supine alignment with relaxed legs and hands turned toward the abdomen for the man on the mat |

Hand poses are a separate case, and were not settled by watching a Mixamo clip. The Mixamo rig convention was confirmed against Adobe's own documentation and community reference — the standard 65-bone skeleton carries three bones per digit, `mixamorig:<Side>Hand{Thumb,Index,Middle,Ring,Pinky}{1,2,3}`, which is exactly what all four shipped GLBs contain and what the solver keys on ([Mixamo standard 65 bone skeleton](https://community.adobe.com/t5/mixamo/mixamo-standard-65-bone-skeleton/m-p/11442179)). Everything past the naming — hinge axes, palm side, joint ranges — is measured from each character's own bind pose rather than copied from a reference pose, because the bind poses genuinely differ and a hand-authored axis is wrong in a way that only shows up as a mirrored or hyperextended hand. The joint ranges themselves are the standard anatomical ones (knuckle 90°, middle joint 110°, tip 80°), not values taken from a Mixamo clip.

The existing `artisan`, `traveler`, and `villager` meshes retain their period-inspired clothing. All scene variants use their shared pose machinery; task-specific carrying, working and prayer poses remain authored adaptations. Mixamo reference use does not change the geometry provenance or introduce a remote runtime dependency.

Finger and thumb kinematics are procedurally solved in `sceneHumanClips.js` for all four scenes and the Mark 2 tableau. Nothing about the hand's axes is assumed: each hand's frame is measured from its own bind pose, which is why one code path poses both hands with no mirrored sign constants.

- **The hand frame is measured, not assumed.** In these rigs a finger bone aims along its local +Y with the knuckle line landing on local −Z, so local X is the *palm normal* — the abduction axis. An earlier pass curled the fingers about local X with a fudged roll term to compensate; measured on the shipped artisan, that moved every fingertip *away* from the palm and almost entirely sideways, so hands splayed and hyperextended instead of closing. Each hand now derives its knuckle line, finger direction and palm normal from its own bind pose.
- **The palm side is read off the thumb, against a knuckle.** The thumb is the one digit standing off the plane of the fingers. It is measured against the index knuckle rather than the wrist, because the hand bone's own origin sits 35 mm off the knuckle plane against the thumb's 54 mm, so a wrist-relative test very nearly cancels its own evidence. A rig with no thumb falls back to the fact that a resting arm hangs with its palm toward the body's midline; both cues agree on all four shipped characters, which `sceneHumanRealRigs.test.js` asserts.
- **A finger is a planar chain.** The hinge axis is derived once from the knuckle and then re-expressed in each later joint's local frame, so the whole finger flexes in the plane the knuckle set. Re-deriving it per joint tilts that plane by nearly 20° at the fingertip, since each phalanx carries its own bind rotation.
- **Anatomical cascade, limits and splay.** Flexion is distributed across the knuckle, middle and tip joints (gains 0.95 / 1.55 / 0.72, clamped to 90° / 110° / 80°), so the middle joint carries most of a relaxed hand's curl rather than every joint bending evenly into a board. Pinky through index curl progressively less. Only the knuckle abducts — the joints past it are pure hinges — and its splay closes up as the hand does, the way real fingers converge onto a grip.
- **Thumb opposition, not curl.** The thumb swings across the palm — ulnar, and a little palmward — toward where the fingers will be once they close, keeping a resting amount of opposition even in an open hand. Aiming it at the fingertips of the flat bind hand points it backwards instead, since the resting thumb already stands proud of the knuckle plane. Poses scale from an open palm (`fingerCurl: 8`) through a relaxed rest (`14–20`) to a firm enclosed grip (`64`) around props and lowering ropes.

Measured across all four shipped rigs, every clip and four phases each: every fingertip travels at least 5 mm into the palm, adjacent fingertips keep at least 18 mm of clearance across the hand, the thumb travels at least 11 mm across the palm, and the thumb-to-index pinch closes monotonically from `prayer` through `idle` to `carry`. `sceneHumanRealRigs.test.js` asserts all of this against the shipped GLBs; run against the previous solver it fails on all four characters.

The tableau owns its prop geometry and cloned skeletons; it shares the asset textures and skin meshes. All six principal characters persist at low quality, with fewer audience members. Only Jesus and the reclining man can use the highest mesh detail. Reduced motion freezes the skeletons and mat; rope endpoints continue to match their fixed grips. The room and doorway are reserved against random ambient placement, and collision checks distinguish the roof from the room below.

Rebuild a single named character with `--only jesus` or `--only matthew` on the Blender command, then run packaging with `--tableau`, which writes both. The complete default Blender build includes all five characters; run both packaging commands afterward. The asset validator covers both manifests, texture decoding, hashes and mesh budgets. `mark2Tableau.test.js` additionally exercises the shipped rigs, asynchronous cast readiness, rope attachment, the held mat height, reduced motion, quality, collision and resource ownership. Browser inspection covers the real Capernaum entry plus a temporary fixed-camera harness using the actual builder and GLBs, to examine interior, roof and close character views without camera-transition timing.

Final tableau verification: all 381 tests in the 27 scene/scene-manifest test files passed. After the last resting-hand and camera adjustments, the 33 tableau/navigation tests passed again. Both asset validators, scene ESLint and the production build passed; the build retains its existing large-chunk advisory. Desktop Chrome views were inspected at low and high mesh detail; mobile GPU performance has not been measured.
