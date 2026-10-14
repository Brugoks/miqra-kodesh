# Scene human assets and reproducible builds

The scenes use three shared, locally hosted, textured and skinned characters derived from MakeHuman Community assets. Capernaum additionally loads two dedicated named characters for its tableaux: Jesus for Mark 2, and Matthew for the customs post. These replace nearby crowd figures in Capernaum, Caesarea, the Second Temple, the Tabernacle and the Mount of Olives; the Temple and the Mount of Olives also load Jesus and the Tabernacle camp woman for their staged events. The former three static Capernaum actor assemblies are excluded from the loading manifest.

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

## Captured motion library (Adobe Mixamo)

The crowds and most of the staged casts in Capernaum, the Temple and the Mount of Olives move by motion capture from [Adobe Mixamo](https://www.mixamo.com/), exported from a signed-in account on 26 September 2026 as skeleton-only FBX at 30 fps. The FBX files stay in the ignored `scripts/.cache/mixamo/`; Mixamo's terms allow the animations to be used in a project but not redistributed as files, so what ships is only the motion, reduced to rotations relative to Mixamo's T-pose (`public/assets/scenes/shared/humans/mixamo-motion.json`, built by `node scripts/humans/build_mixamo_library.mjs`). `src/components/scene/sceneMixamo.js` fits a clip onto any of the characters in the browser — the same arithmetic as the offline Tabernacle retarget — and grounds every frame on whichever weight-bearing joint is lowest, so a kneeler kneels and a sleeper lies on the ground. Fingers are not captured; the finger solver poses them. `sceneMixamo.test.js` checks the fitted limbs point within 12° of the capture on four different bodies.

| Key | Mixamo clip |
| --- | --- |
| `breathing-idle` | Breathing Idle — Breathing Idle |
| `weight-shift` | Idle — Weight Shift Idle |
| `look-around` | Looking Around — Idle Stand Looking Around |
| `thinking` | Thinking — Thinking While Standing |
| `talk-ask` | Talking — Asking A Question With Two Hands |
| `talk-chat` | Talking At Watercooler — Having A Chat At The Watercooler |
| `argue` | Standing Arguing — Standing Arguing With Another Person |
| `argue-2` | Standing Arguing — Standing And Arguing With Another Person |
| `nod-yes` | Thoughtful Head Nod — Thoughtfully Nodding Head Yes |
| `shake-no` | Thoughtful Head Shake — Shaking Head No Thoughtfully |
| `thankful` | Thankful — Being Thankful While Standing |
| `sad-idle` | Sad Idle — Standing In A Sad Disposition |
| `crying` | Crying — Crying And Rubbing Eyes |
| `old-man-idle` | Old Man Idle — Old Man Standing Idle |
| `old-man-walk` | Old Man Walk — Slow Old Man Shuffle Walk |
| `point-forward` | Pointing Forward — Looking Down Then Pointing Forward |
| `point-bent` | Pointing — Pointing With Arm Bent |
| `yell-angry` | Yelling — Yelling In Anger |
| `surprised` | Reacting — Being Surprised And Looking Right |
| `pray-sway` | Praying — Standing Praying While Swaying |
| `pray-buckled` | Praying — Buckled Stand And Praying |
| `kneel-pray` | Praying — Kneeling In Prayer |
| `fall-to-knees` | Praying — Falling To Knees In Prayer |
| `kneel-idle` | Kneeling Idle — Kneeling Idle |
| `kneel-one-knee` | Kneeling — Kneeling On One Knee Idle |
| `kneel-warm-hands` | Kneel — Kneeling Warming Hands Over Campfire |
| `sit-idle` | Sitting Idle — Sitting With Breathing Idle |
| `sit-floor` | Sitting Idle — Sitting On The Floor |
| `sit-floor-reclined` | Sitting Idle — Sitting Reclined On The Floor |
| `sit-talk` | Sitting Talking — Sitting And Talking To Another Person |
| `sit-point` | Sitting And Pointing — Sitting And Pointing Forward |
| `sit-write` | Writing — Male Writing While Seated |
| `sleep-deep` | Sleeping Idle — Sleeping Deeply |
| `lie-asleep` | Laying Sleeping — Laying Asleep On A Bed |
| `pick-up` | Picking Up — Picking Up An Object |
| `pick-fruit` | Pick Fruit — Picking Low Hanging Fruit |
| `pick-fruit-ground` | Pick Fruit — Picking Fruit From Ground |
| `carry-box` | Box Idle — Carrying A Box |
| `push-both` | Male Action Pose — Pushing With Both Hands |
| `wave-both` | Waving — Waving With Both Hands |
| `wave-emotional` | Waving — Emotional Waving Forward |
| `look-up-arms` | Male Crouch Pose — Arms Spread Looking Upwards |
| `female-walk` | Female Walk — Female Normal Walk |
| `bow-formal` | Quick Formal Bow — Quick Formal Bow |
| `torch-idle` | Standing Torch Idle 01 — Standing Idle |
| `torch-walk` | Standing Torch Walk Forward — Walking Forward With Torch |
| `walk-neutral` | Walking — a neutral adult walk, about 1.6 m/s (from the Tabernacle's donors) |
| `walk-carry` | Holding walk — arms held in front, about 1.1 m/s (from the Tabernacle's donors) |
| `crouch-idle` | Crouching Idle — Low Crouching Idle |
| `lift-heavy` | Lifting Object — Lifting A Heavy Object With Both Hands |

## The visitor's own figure (third-person view)

The third-person view at `/scene/capernaum` shows the visitor as a first-century Galilean traveller: the shipped `human-traveler` model, with its own cloned and tinted materials (a darker undyed wool than the crowd's), a head cloth fitted to the measured skull, a bag on a strap across the back, and a walking staff held at a grip measured on the skinned right hand. See `src/components/scene/scenePlayerAvatar.js`.

Its motion is in `src/components/scene/playerAvatarClips.json`, generated — never edited — by:

```sh
node scripts/humans/retarget_player_mixamo.mjs [mixamo-source-directory]
```

- **idle** and **walk** are Adobe Mixamo "Idle" and "Walking", retargeted offline onto the traveller rig (sole-grounded, travel removed from the hips). The FBX donors live in the ignored `scripts/.cache/tabernacle/mixamo/` and never ship; only motion already bound to our rig is written.
- **jog** is authored procedurally for the same rig (a 36% duty factor with two flight phases). Its swing leg is solved against the real skinned soles so the passing foot clears the ground — a first version swept seven centimetres through it.
- Every clip holds the staff; `grip` in the JSON records where the shaft runs through the fist.
- `metersPerCycle` is the planted foot's own backward speed under the body (walk ≈ 1.55 m, jog ≈ 2.08 m), which is what the runtime drives the clip by so feet do not skate; `footfalls` are the heel-strike phases that drive the footstep sounds.

The script prints what it measured (lowest sole, skate, airborne fraction, hip bob); `scenePlayerAvatar.test.js` checks the shipped JSON and runs the real model through it.


## Shared everyday wardrobe (October 2026)

`sceneHumanAppearance.js` assigns a stable outfit from the person's ID and scene, shared by the near skeletal renderer and the instanced crowd. Filtering the near pool or changing camera distance no longer changes the model, tunic color, sash, head covering, or build. Explicit character variants remain authoritative; women without one use the camp-woman model. Men explicitly identified as such use the two male base models. Unspecified crowd members can still use all three shared bodies.

The wardrobe adds fitted waist sashes, optional open shoulder wraps, folded head cloths and veils with a face opening. Tunics, sashes and wraps have independent palettes. Imported weave and fold shading survive dye replacement; complexion and hair variations leave eye textures alone. Headwear now measures the model's head landmark instead of assuming a 1.5m jaw height, which previously left coverings floating above the shorter villager. Body-width variation is bounded to ±6%, with height, foot grounding and animation rigs retained. High/balanced quality permits eight/four nearby actors to use the detailed mesh; low remains on the original reduced-detail budget.

This applies to everyday crowds in Capernaum, Caesarea, the Temple, Olivet, Bethlehem, Sinai and the Tabernacle camp. Priests, Levites and named ceremonial variants retain their authored clothing. Elah's dedicated principal costumes and armor, and named event-tableau costumes, are separate authored assets and are not randomized by this pass. Children still use scaled adult rigs; no new child anatomy, face morphs, subsurface scattering or cloth physics is claimed.

### Cloth shading (`sceneHumanCloth.js`)

Veils, head cloths, wraps, belts and the imported tunic share one material treatment, applied through the same `onBeforeCompile` hooks as the dye and the crowd's skinning (so it costs the crowd no extra draws):

- **A procedural weave.** A 128² tiling plain-weave texture, generated in code (no download, no asset hash), laid under the dye as colour and as bump. It tiles every `WEAVE_TILE` (8 cm, 16 threads) in metres, measured along the cloth by `gridWeaveUv`, so it reads at one scale however the cloth was stretched into shape. Its average is brought back to one (`WEAVE_GAIN`), so it adds grain and never re-colours the dye. The tunic keeps its own imported texture and takes its relief from that.
- **Light through thin cloth, and a fuzz.** `RE_Direct_Cloth` wraps three's direct-light term: light arriving at the far face shows on this one in the cloth's own colour (`through`, strongest for veils), and a grazing-angle fuzz is added. The light has already been through the shadow map, so cloth in the shade of a wall does not glow.
- **Per-vertex `aCloth` = (occlusion, freedom to move).** Baked once: analytically for the veil, head cloth, belt and wrap, and for imported garments from how far the surface lies in a hollow within a fixed 7 cm reach (so the dense near mesh and the coarse crowd mesh agree — a test holds them within 0.02). Occlusion darkens the albedo a little and the indirect light a lot. The freedom weight drives a few millimetres of normal-direction flutter at the hem, measured against the cloth's own position at time zero, so a frozen clock (reduced motion) is exactly the rest pose.
- **One clock**, `setClothTime`, written by both the crowd and the near actors.

This is shading and a small vertex stir, not cloth simulation: the cloth still follows the skeleton rigidly. The imported tunic is a smooth garment, so its fold occlusion is subtle by construction (darkest at the armpits and shoulders).

### Who wears what on the head (`sceneHumanDress.js`, `sceneHumanHats.js`)

A veil belongs to women. Anyone drawn on a woman's body (the villager and camp-woman models) or marked `kind: 'woman'` wears one, unless `bareheaded`; nobody else does. Men are dressed by the group they belong to, from a weighting of: bareheaded, a head cloth (the draped sun cloth, falling to the nape), a twisted headband with its ends hanging, a felt skullcap (a pilos), and a wound linen turban. Children are bareheaded. A person belongs to a group by a `dress` tag on the figure, else by their `groupId` (Capernaum's haunts), else by their scene.

| Profile | Who | None | Cloth | Band | Cap | Turban | Helmet |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `fisherman` | Capernaum's men at the nets, the net-mender | 35 | 35 | 10 | 20 | | |
| `villager` | Capernaum's courtyards, synagogue steps, lanes and loners; Bethlehem | 55 | 30 | 5 | 10 | | |
| `traveller` | Capernaum's lane walkers, the north lane, the customs-booth queue | 35 | 45 | 10 | 10 | | |
| `labourer` | Olivet's grove workers | 20 | 55 | 15 | 10 | | |
| `shepherd` | Olivet's shepherd | 30 | 50 | 20 | | | |
| `pilgrim` | The Temple's courts; Olivet's road and camps | 55 | 30 | 5 | 10 | | |
| `townsman` | Caesarea's loose quay traffic | 45 | 25 | 10 | 20 | | |
| `harbour` | Caesarea's cargo workers | 30 | 25 | 5 | 40 | | |
| `merchant` | Caesarea's colonnade traders | 50 | 15 | | 20 | 15 | |
| `camp` | Sinai and the Tabernacle camp | 20 | 50 | 30 | | | |
| `priest` | The Temple's inner-court priests | | | | | 100 | |
| `soldier` | Caesarea's garrison | | | | | | 100 |

Each profile carries its own `basis` in the code, with how far to trust it. In short: the evidence for what ordinary men wore on their heads in first-century Judea and Galilee is thin and mostly negative. The Gospels name no hat; the published desert finds give mostly women's kerchiefs and hairnets for the head; the skullcap as a Jewish habit is later, and the prayer shawl over the head is later still, so neither is used. Bareheaded is therefore the honest majority for a village man, with a cloth for the sun and the road. Where the wider world shows more it is used only where that world is on stage: workmen's and sailors' felt caps from Roman art at the harbour; the priests' wound linen cap (Exodus 28:40; Josephus, *Antiquities* 3.157) in the Temple; the Roman soldier's helmet at Caesarea, where Acts 23–24 keep the garrison; headbands (the Beni Hasan Asiatics, c. 1900 BC) and no Roman anything in the wilderness camp. A priest or soldier is an *office*: always dressed so, in their own colours (white linen and a pale girdle; bronze and a leather belt), with no mantle over it.

`sceneHumanDress.test.js` holds the rules: every profile weighs out to a hundred and says why; a veil on every woman and on no man, in any scene or group; the wilderness camp never wears a cap, turban or helmet; ordinary villagers and pilgrims never a helmet or turban; and each profile's mix to within sampling.

What this does not cover: the authored casts of the staged events (Jesus, the disciples, named people), the Tabernacle's priests and Levites (authored in their own models), the primitive stand-in figures drawn for the seconds before the models load, and Elah's principals. Note also that many unmarked "men" in the crowds are drawn on the villager model, which is a woman's body; they are now veiled as the women they look like. Changing who the unmarked crowd is drawn as is a one-line change to `CROWD_VARIANTS`.

The shapes are in `sceneHumanHats.js`, each held a fixed distance off the measured skull and skinned to the head alone: a felt cap drawn to a small point and dipping behind; a turban ridged on a spiral; a helmet with a brow ridge and a flared neck guard (metal, no weave); a twisted band with two short ends that stir. They are plain outlines, not particular historical types.

### Draped veils and head cloths (`sceneHumanDrape.js`)

A veil or head cloth is no longer a bent sphere. It is a flat rectangle of cloth that is laid over this person's own head, pinned across the brow along the skull's cross-section (at the cloth's own thread spacing, so the held edge is not stretched), and let down onto the neck, shoulders, arms and hair until it rests. The settled shape is what ships, skinned to the head and spine like any other part, so nothing is simulated while a scene runs.

- **The solve** is position-based dynamics run overdamped (a few millimetres of drop per step, no carried velocity — a falling cloth with momentum tears itself at this resolution), with Coulomb friction so cloth stays on the crown and slides off the sides. It starts already laid over the skull by distance from the crown, with the excess spread as a brim at ear level, so only the fall onto the shoulders has far to go.
- **The body it falls on** is the skull's measured ellipsoid plus points sampled from the dense mesh below the jaw (neck, shoulders, chest, arms, tunic and hair). Hair is a set of flat cards whose normals mean nothing, so a hair point faces away from the neck.
- **Solved once per body** (a fingerprint of the skull and shoulder joints) and handed out as a fresh geometry each time: about 130–170 ms for a veil and 85–120 ms for a head cloth, the first time a model is seen. The weave's coordinates are the flat cloth's, in metres, so the thread pattern follows the cloth exactly.
- **Without a measurable body** (no root, no points) `shapeHeadwear` falls back to the bent shell it used to be, so nothing depends on the solve succeeding.
- `sceneHumanDrape.test.js` is what stands in for looking: on all four models it holds that the cloth is outside the skull and no deeper than 4 mm into the body, leaves the face open, covers the crown, reaches the shoulders (a veil) or stops at the nape (a head cloth), is within 5% mean strain, hangs about as evenly on both sides as the body does, and is identical from one run to the next.

What it is not: the cloth is still rigid once settled — it follows the head and spine through the skeleton, with the free parts stirring a few millimetres in the air (see above). A veil does not swing when the head turns.

Retuning: the per-kind numbers (`relief`, `through`, `fuzz`, `sway`) are in `CLOTH_KINDS`; they were set without looking at the result and want an eye on a real screen. The headless WebGL check (see the project notes) compiles every variant; `sceneHumanCloth.test.js` checks the strings against three's own shader templates, because jsdom cannot compile GLSL.

### Walking (`sceneGait.js`)

People who go somewhere walk captured Mixamo walks, made for their pace, instead of the sine-wave `walk` the models were exported with. The same walk is chosen for the same person whether the crowd draws them or a near actor does.

**Why.** Measured on the rig (hips and ankles read off a played clip), the shipped `walk` has no hip bob, no pelvis or shoulder counter-turn, a 3–4 cm foot lift and a 30 cm step; the Mixamo walks have 5–7 cm of bob, 12° of pelvis turn, a 13–16 cm lift and a 70–80 cm step, which are ordinary adult figures. In motion (a person walking a straight route at cruise, an ankle followed through the real controller) the old walk's planted foot travels about 21 cm per stance; the new walks' about 2 cm.

**How.**
- **Stride is measured, not declared.** `measureWalk` plays a clip on a copy of the body and takes the speed at which a planted foot travels backward under the hips: that is the speed a person must move for the foot to stay where it is put, and the distance one cycle covers is that times its duration. It agrees with the stride the Tabernacle's own retarget recorded to within 2–3%.
- **Pace-matched.** A captured walk is one person at one speed (Mixamo's "Walking" is a brisk 1.6 m/s); played at a village's 1.1 m/s it would run at two thirds time. `makeWalk` makes a variant for a pace in `PACE_BINS` (0.8–1.6 m/s) by scaling the stride, the swing and sway and the tempo together (step length grows about as speed^0.42 and cadence as speed^0.58), then re-grounds the feet, then corrects the tempo until the measured pace is the one asked for. A "loose" style swings the arms and turns the trunk less than a "spry" one, by the person's stable identity.
- **Families.** `neutral` (Walking), `woman` (Female Walk, at a woman's pace), `carry` (holding walk, for anyone carrying), `elder` (Old Man Walk, only when `figure.gait === 'elder'`). Which one, and what pace, is read off the figure alone (`walkRequest`) so the crowd and the near actor agree. Marking a walker `carries: true` gives them the arms-held walk (Capernaum's carrier does).
- **Loops are closed.** Two of the source walks do not end where they began, and the retargeter's answer to an open loop (stand still for 0.3 s) would be a hitch every step; the small gap is spread across the cycle instead.
- **The crowd** bakes each distinct variant as rows at about 30 a second, spread over exactly its own cycle, and blends a walker between the two nearest rows (by how far through the frame they are) using the lane the shader already has for fading between clips. Without that blend each frame is held for two refreshes and the planted foot creeps forward by a frame's distance and snaps back (a 3.8 cm sawtooth); with it the crowd's foot drifts as little as a near actor's. Variants cost about 25% more rows in each model's bone texture (7.1 to 9.6 MB across the four models for a Capernaum-sized crowd).
- **The stride scales with the body**: by `figure.scale` and the person's build, so a child's or a tall man's feet stay put too.
- **Without the library** (offline, tests) everyone keeps the walk the model shipped with; a near walker waits for the library before it starts, so nobody changes gait when it arrives.

`sceneGait.test.js` is the audit: every walk is a walk (bob, lift, tempo, stride, planted share), is made for the pace asked for, keeps a steady planted-foot speed, closes its loop, and slows down the way people do; and, in motion, the planted foot drifts under 3.5 cm near and far, at every size, with near and far choosing the same walk and the same stride.

Still the old way: turning round at the end of a route (the figure pivots on the spot in the idle pose while its facing eases), starting and stopping (a short cross-fade rather than a captured start and stop), sloped and stepped ground (no foot adjustment), and loads on the head or shoulder (nothing captured that carries one). The Tabernacle's priests and Levites keep their own authored walks.

### Evidence and external assets

- [Israel Antiquities Authority: Orit Shamir, textiles from Mo’a](https://publications.iaa.org.il/atiqot/vol50/iss1/6/) documents Early Roman wool, goat hair and linen, including dyed fabric and colored decoration. It informs material choice, not a reconstruction of a particular Galilean outfit.
- [Sukenik et al., PLOS ONE (2017)](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0179014) identifies madder and plant-derived indigotin in Late Bronze/early Iron Age Timna textiles. This supports the restrained red/blue dye vocabulary; it does not establish Exodus costume, exact screen colors, or how common dyed clothes were in each scene.
- Existing [MakeHuman Community assets](https://static.makehumancommunity.org/about/license.html) supply the anatomical meshes and imported textile maps. The checked-in source-specific notices remain authoritative. Existing Adobe Mixamo captures continue to supply motion under their separate terms; no newly generated character or remote runtime service is introduced.

The new accessories are project-authored geometry. They follow the rigs through skeletal weights, not simulated fabric. Work, sitting, kneeling and carrying descriptors avoid the extra shoulder wrap. Geometry, dye hooks, model identity, color consistency, short-model head fit, sacred-clothing preservation and resource ownership are tested using the shipped GLBs in `sceneHumanAppearance.test.js`. Added crowd accessories remain batched by model; the Capernaum regression allows at most 37 crowd draws and under one million crowd triangles. This is a structural budget, not a measured mobile frame-rate claim.
