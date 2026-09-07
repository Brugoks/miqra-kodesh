# David and Goliath — Gemini implementation brief

Re-create the supplied reference as an explorable, cinematic 3D scene in Miqra Kodesh. Deliver actual textured, rigged geometry: David beside a rocky brook in the foreground right, Goliath on the left, two armies on opposing hills, and an open valley receding between them. The screenshot sets the composition, light and material quality target; it is not a surveyed map or a costume authority.

Prepared against the local repository on September 7, 2026. This is an implementation plan; the scene and new assets have not been built. All dimensions, counts and budgets below are proposed production settings, not historical measurements or benchmark results.

## 1. Assignment to Gemini

You are implementing the Valley of Elah scene in the existing Miqra Kodesh React/Vite/Three.js application. Read this entire brief and inspect the current scene and character contracts before editing. Reuse the application’s renderer, navigation, quality settings, loading, hotspots and asset ownership conventions. Preserve the screenshot’s visual hierarchy while applying the scriptural corrections below.

Produce a finished environment with distinct David and Goliath character assets, a shield-bearer, differentiated armies, terrain, streambed, vegetation, lighting and ambient skeletal motion. Work through the milestone gates in order. Graybox figures are temporary development tools and do not satisfy final character acceptance. Report missing external inputs explicitly; never label a concept image, a generated video, or a placeholder mesh as a finished rigged asset.

Default scope is a living standoff tableau with camera exploration, viewpoint presets and educational hotspots. A user-triggered sling vignette is milestone 6. A full battle simulator, combat controls and mass army charges are outside this brief. No video framework is required for this real-time scene.

## 2. Reference interpretation and textual grounding

Keep the low viewpoint, asymmetric hero placement, visible sling, huge difference in stature, open central valley, foreground wet stones, sparse scrub and warm directional sunlight. Keep both army silhouettes readable behind their respective champions. Do not bake the screenshot’s text, labels or arrows into textures.

Correct the camp annotation: the Philistines camp between Socoh and Azekah at Ephes-dammim; Israel occupies the opposite side across the valley. Include Goliath’s shield-bearer rather than assigning the screenshot’s enormous shield to Goliath by default. David enters the confrontation without Saul’s armor, carrying shepherd equipment. These choices follow [1 Samuel 17:1–7, 38–41, ESV](https://www.esv.org/1+Samuel+17/).

Use a bronze helmet, scale-style body armor and greaves for Goliath, with his spear and other equipment. Scale armor is an interpretation supported by the [USCCB translation of 1 Samuel 17](https://bible.usccb.org/bible/1samuel/17). Avoid copying the reference’s fantasy ornament and classical-looking crest as verified historical detail. Clothing colors, faces, banner patterns, water level and exact troop positions are artistic choices. Use plain faction banners without modern national emblems.

Author David at approximately 1.65 m and Goliath at approximately 2.9 m for the reference’s dramatic scale. Keep Goliath’s height configurable. The textual tradition includes differing height readings; explain that choice in the Sources panel, following the [USCCB note on 17:4](https://bible.usccb.org/bible/1samuel/17). David’s age and height are visual design choices, not assertions about the historical person.

Use simple labels: David, Goliath, Philistine ranks, Israelite ranks, Brook, Valley of Elah. Omit the screenshot’s mileage arrows. Only add geographic directions after deriving them from verified map coordinates and the scene’s orientation. Display a scene-specific reconstruction note instead of the Temple’s default Mishnah/Josephus disclaimer.

## 3. Environment and camera blockout

Use meters with Y up. Define a local composition coordinate system before modeling; do not implicitly reuse the Temple’s compass orientation. Start with a 240 × 320 m playable terrain and inexpensive surrounding hills extending the visible horizon. Use a shared terrain height function or heightfield for render geometry, character placement and navigation.

Initial staging: camera near (0, ground + 1.35, 14), looking toward (0, ground + 1.8, -12); David near (3, ground, 3); Goliath near (-4, ground, -6); shield-bearer a little forward and outside Goliath’s silhouette. These are graybox starting points. Tune the camera and placement together until David occupies roughly the right third, Goliath the left third, and both remain fully visible. Start around a 55-degree vertical field of view; compare a 45–60-degree range at the reference aspect ratio. Avoid using perspective distortion to replace coherent body scale.

Put army bands on the left and right slopes, roughly 40–120 m from the encounter. Run the brook diagonally through the foreground toward the center distance. Keep the duel corridor and key sightlines clear of random trees and crowd placement. Compress distance for readability and label the arrangement as interpretive.

Build the environment in layers:

- Sculpt broad hills and an eroded stream channel first. Add dry soil, limestone outcrops, exposed banks and paths; use material blending to avoid a single repeating ground texture.
- Author 8–12 reusable rock shapes, 3–5 shrub clumps, 2–3 sparse tree variants, grass tufts, tents, spear racks and two banner families. Vary scale and rotation with a fixed seed; constrain placement by slope, water and reserved areas.
- Use close rock geometry and baked normals for fine detail. Transition to lower detail and clustered vegetation with distance. Keep grass density low enough that the valley reads as dry, open ground.
- Make the brook shallow, with visible stones beneath it. Use restrained normal-map movement and highlights; begin without expensive reflection passes. Treat visible flowing water as artistic staging, not evidence of the season.
- Use warm side/back sunlight, cooler sky fill, distant haze and contact shadows. Fit into the existing lighting controls. Match the dramatic direction without rendering faces black or washing out bronze and cloth.
- Offer Reference View, Beside David, Facing Goliath and Valley Overview. Bound navigation so visitors cannot fall through terrain, walk into the principals or reach unfinished scenery. Preserve touch, keyboard, pause and return-to-view controls.

Gate: save a graybox screenshot at the reference aspect ratio and a top-down placement image. Both champions and armies must read before detailed assets begin.

## 4. Character and prop production

Preferred path: extend the repository’s MakeHuman/MPFB and Blender pipeline for anatomy and consistent rigs, then create dedicated costumes, hair, faces and props. The existing assets are a starting point for anatomy and tooling; first-century villagers are not finished early-Israelite soldiers. See [the existing asset guide](scene-humans-assets.md), `scripts/humans/build_characters.py` and `scripts/humans/package_characters.mjs`.

Gemini may produce turnaround images, asset specifications and Blender scripts. Images and videos are references, not geometry. If a connected image-to-3D tool is available, use separate character reference sheets to create a draft mesh, then retopologize and rig it in Blender. Do not feed the entire battlefield image into a generator and expect independently animatable characters. If Gemini lacks 3D-tool access, deliver the Blender script and an explicit artist handoff for manual modeling steps; keep those steps marked unfinished until exported assets pass inspection.

### David asset prompt

Create one full-body, realistic young shepherd character for the David and Goliath scene. Match the reference’s lean silhouette, dark wavy hair, simple knee-length undyed tunic, worn leather belt, sandals and small cross-body shepherd bag. Give him distinct, natural facial anatomy and fully modeled hands. Use an alert, calm expression. He is fully clothed, without armor, crown or royal accessories. Produce front, side and back orthographic views at the same scale, neutral A-pose, plain background, soft neutral light, no text, no dramatic shadows and no weapons fused to his hands. Treat the face and costume as an artistic portrayal, not a recovered likeness.

Model separate eyes, economical hair cards or sculpted hair masses, tunic, belt, sandals and bag. Put deformation loops around shoulders, elbows, hips, knees and finger joints. Fit the tunic through crouch and running poses. Remove hidden underlying geometry only after fitting is stable. Model the sling separately: retention loop, two cords and a pouch; it must be a sling, not a Y-shaped slingshot. Create five separate smooth stones and a staff. Put stable attachment points on the hands and belt; use scene state to account for staff and stone placement during actions.

### Goliath asset prompt

Create one full-body, exceptionally tall, powerfully built human warrior with realistic anatomy for Goliath of Gath. Use the screenshot for visual mass and presence. Design a practical bronze helmet, overlapping bronze scale-style torso armor, bronze greaves, leather straps, subdued cloth underlayer and worn sandals. Use dark hair and a weathered face as artistic choices. Avoid fantasy spikes, oversized ornamental pauldrons, medieval plate, Roman legionary equipment, modern emblems and a huge decorative crest. Produce matching front, side and back orthographic views in a neutral A-pose, soft studio lighting, plain background, no text. Show weapons and shield on a separate prop sheet.

Build Goliath as a distinct anatomical asset, not a uniformly enlarged crowd soldier. Preserve plausible hands, neck, joints and head-to-body proportions. Model armor in sections; bake most individual scale detail into normals, keeping silhouette edges in geometry. Skin flexible garments; rigidly attach helmet and suitable armor sections to the correct bones. Check shoulder clearance during gestures. Create a heavy wooden-shaft spear with an iron head, a sheathed sword and the back-carried equipment chosen for the project’s translation. Document the interpretation. Give the large shield to a separately rigged shield-bearer with a convincing arm grip and strap.

### Opposing army asset prompts

Israelite kit: create modular adult soldiers with practical muted tunics, belts, sandals, simple head coverings, wood/leather shields and spears. Vary height, build, facial hair, cloth colors and wear. Keep a shared skeleton and socket naming convention. No identical uniforms or modern symbols.

Philistine kit: create modular adult soldiers with a stronger bronze/leather equipment presence, restrained helmets, shields and spears. Keep individual variety and practical construction. Differentiate their silhouettes and costume palette from the Israelites while retaining the same realistic material treatment. Do not portray either army as a different species or rely on caricatured faces to signal allegiance.

Start with three base body/face variants per army and at least four equipment/color combinations per base. The shield-bearer can derive from a Philistine base but needs a dedicated shield-carry pose. Ensure generated variants share scale, skeleton compatibility and texture layout where practical. Interpret these kits as art direction; have a costume review before calling any specific kit historically grounded.

### Blender authoring and export checklist

1. Create or import each body, fix nonmanifold surfaces and duplicate faces, retopologize high-density drafts, and establish real-world size. Apply mesh transforms before binding; never casually apply transforms to an already animated rig.
2. UV unwrap deliberately. Bake high-detail normals and ambient occlusion. Author PBR base color, roughness, metallic and normal maps under neutral light; no painted sun shadows. Cloth/skin/leather are nonmetallic, exposed bronze and iron are metallic. Use restrained wear rather than random noise.
3. Rig the uncluttered humanoid first. Fit garments to that exact body, bind or transfer weights, and correct weights manually through the pose suite. Attach props after rigging. Do not ask an auto-rigger to resolve a spear, giant shield and long loose accessories as anatomy.
4. Preserve editable `.blend` sources and separate export collections. Use stable mesh, bone, material and clip names. Bake constraints and any cloth/prop simulation to supported animation before runtime export.
5. Export GLB with embedded textures, skin weights and only intended clips. Make Blender-to-glTF axis conversion explicit and verify the result in the application, rather than compensating with undocumented runtime rotations. Test a one-meter reference cube to catch FBX scale conversion errors.
6. Follow the existing `_LOD0`/`_LOD1` naming pattern where using the shared loader; add explicit handling for any new far level. Keep all levels aligned to the same skeleton. Check whether simplification alters weight quality or creates visible holes.
7. Run packaging to generate content-addressed names, sizes and hashes. Record tool versions, source licenses, provenance, triangle counts, texture sizes and clip names. Source project files belong in the authoring workflow; ship only required runtime assets.

Proposed per-character LOD0 budgets: David 35–55k triangles, Goliath 50–75k including armor, shield-bearer 15–25k. LOD1: David 12–18k, Goliath 18–25k, soldiers 4–8k. Use approximately 0.5–1.5k triangles for distant posed soldiers. Start with 2K hero texture sets and shared 1K army atlases; reserve 4K authoring maps for baking and only ship them if measured benefit justifies the cost. Target at most four material slots per hero and two per distant soldier.

## 5. Mixamo animation pipeline

Use [Mixamo](https://www.mixamo.com/) for base humanoid motion. Adobe documents FBX/OBJ/ZIP upload for unrigged characters and FBX for rigged uploads, plus skeleton mapping in its [rigging guide](https://helpx.adobe.com/creative-cloud/help/mixamo-rigging-animation.html). Its [FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) describes humanoid rigging requirements and project usage rights. Keep local backups; the service does not retain a history of all uploaded characters.

1. Export a clean, centered character in a neutral pose with no environment or large props. For an existing MPFB rig, first test rigged FBX mapping on one character and one animation; compatibility of naming does not prove correct rest poses or deformation. If mapping fails, rig a clean body in Mixamo, bring it back to Blender, and bind the final costume to that verified skeleton.
2. For auto-rigging, place the requested anatomical markers accurately and review elbows, knees, fingers and shoulder twist in the preview. Save one FBX with the skin as the rig reference. Download subsequent animation FBXs without skin where the interface offers it, at 30 fps, on the same uploaded character. Choose in-place locomotion where available. Record the actual export settings.
3. Import the rig reference and clips into Blender. Match scale and bind/rest poses. Transfer/bake animation to the final deform skeleton if needed; do not rely on renaming bone tracks alone. Keep hips’ vertical motion while removing unintended horizontal root drift for in-place clips.
4. Edit base clips for costume clearance, hand grips and character personality. Export named actions in the character GLB initially; use separate animation libraries only after same-rig loading is proven. Verify every expected clip is actually exported.
5. At runtime, clone skinned characters with independent skeletons and mixers. Use the repository’s established cloning pattern. Crossfade compatible idle/walk transitions around 0.2–0.35 seconds. Drive route distance and walk-cycle speed together so feet do not slide.

Animation search targets, not promises of exact currently available clip titles:

- David: breathing/standing idle, walk, run, crouch or pick-up base. Export as `david_idle`, `david_walk`, `david_run`; author `david_pick_stone`, `david_load_sling`, `david_sling_release` and `david_recover` in Blender.
- Goliath: standing idle, heavy walk, restrained taunt/challenge. Adapt for spear grip and armor. Export `goliath_idle`, `goliath_walk`, `goliath_challenge`. Author a forward fall only if implementing the vignette.
- Armies: two standing idles, looking around, small weight shifts and restrained reaction gestures. Export a small curated set such as `army_idle_a`, `army_idle_b`, `army_watch`, `army_react`; mix phases and modest speed variation to break synchronization.
- Shield-bearer: adapt a base idle/walk with a custom shield grip. Bake the arm pose; a generic unarmed idle must not let the forearm pass through the shield.

The local asset guide records prior visual inspection of Breathing Idle, Sitting Idle and Walking references. Those existing project-authored clips are not imported Mixamo motion capture. For this feature, record each animation’s actual origin: imported Mixamo clip, modified Mixamo clip or custom keyframes. Do not claim downloads or exact catalog availability before verifying them in the signed-in interface.

Mixamo animates the body; it does not finish David’s sling mechanics. In Blender, author coordinated shoulder, elbow, wrist and torso motion plus the sling pouch/cords. Establish a visible loaded stone, finger retention loop and release cord. Bake cord motion or drive it with a deterministic curve; avoid free cloth simulation for the initial release. The launch event must align with the stone leaving the pouch. Never substitute an ordinary overarm throw with an unrelated rope spin.

## 6. Armies, performance and loading

Create the impression of hundreds of soldiers through depth and grouping, not hundreds of independent full-detail rigs. Start with about 180 visible figures per side on high, 100 on balanced and 50 on low. These totals include distant static figures and are adjustable visual targets.

Reserve the main character budget for David and Goliath on every quality tier. Proposed total active skeleton caps, including principals: 4 low, 12 balanced, 24 high. This is a new scene-specific budget, not the existing `dynamicActors` field. Keep the shield-bearer visible even when frozen or reduced in detail. Profile the caps before raising them.

Use skinned characters close to viewers. Bake selected poses into ordinary meshes for middle/far ranks and instance compatible geometry/material variants. Standard [Three.js InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html) is useful for repeated geometry with shared materials; independent skeletal animation needs a separate solution. Do not put hundreds of ordinary SkinnedMesh instances in the scene and assume they become a single animated draw call. Distant billboards are optional only beyond navigable space and must remain convincing from allowed viewpoints.

Share geometry/textures, apply frustum and distance culling, use LOD hysteresis, and avoid detailed shadows on far ranks. Use low-cost banner sway, occasional gestures in nearby troops and phase variation to give life without simulating a battle. Ground feet on the actual slope; reject placements that intersect a neighbor, tree, tent or reserved corridor.

Stage loading: terrain shell and controls, both principals together, supporting cast, then distant detail. Show meaningful loading progress and a retry state for a failed hero group. Keep a usable environment during optional-asset failure. Do not silently call a hero placeholder a completed load. Handle route exit during in-flight downloads and release resources according to existing ownership rules.

Initial targets: first playable payload at most 20 MiB, complete high scene at most 45 MiB, balanced main view below roughly 350 draw calls and 1 million visible triangles. Aim for 60 fps on a representative laptop and 30 fps on a representative mobile device after loading. Measure sustained frame times, requests and resource counts on named devices; these are provisional targets. Decoded texture memory matters separately from transfer size. Introduce KTX2 or mesh compression only with matching decoder integration and measured gains; the current pipeline does not require those decoders.

Reduced motion freezes skeletal, cloth, water and camera automation at an intentional readable pose. Pause elapsed animation while the tab is hidden so returning does not trigger jumps or delayed story events. Keep principal visibility independent of crowd quality.

## 7. Implementation map for the existing application

Verified foundations: React 19, Vite 8 and Three.js 0.185 are declared in `package.json`; `Scene.jsx` dynamically loads builders and manages rendering, navigation, asset sessions and quality. `sceneModules.js` registers four existing scenes. `sceneAssets.js` uses GLTFLoader and group loading. `scene-humans-assets.md` documents shared skinned meshes, separate clone skeletons, LODs and packaging. Recheck these files at implementation time.

- Add `src/lib/elahScene.js`: plain scene metadata, period wording, vantages, story references, hotspots and reconstruction/source notes. Register a proposed `valley-of-elah` scene slug in `src/lib/scenes.js`. Resolve the actual Atlas place identifier before assigning `placeSlug`; do not invent a duplicate place.
- Add `src/components/scene/buildElah.js` and register its lazy import in `sceneModules.js`. Match the current builder return contract: `root`, lighting/sun where expected, `update`, `dispose`, `applyAssets`, `applyQuality`, fog/exposure and occluders.
- Add `elahTerrain.js` and `elahNavigation.js`. Share terrain sampling, slope limits, stream boundaries and principal/camp collision geometry. Conform to the existing `stanceAt`, `move`, `groundPointAlongRay` and surface interfaces instead of replacing navigation globally.
- Add `davidGoliathTableau.js` for principal model readiness, attachment sockets, animation states and deterministic reset. Follow the existing Capernaum tableau ownership patterns. Add `elahCrowds.js` for seeded faction placements, distance tiers and army-specific appearance.
- Extend `sceneAssetManifest.js` and the packaging workflow with Elah groups. Put shipped assets under `public/assets/scenes/elah/`, with character, material, prop and notice subfolders. Keep shared resources shared and prevent other scenes from downloading Elah-only heroes.
- Extend or add a dedicated `scripts/humans/build_elah_characters.py` using existing authoring utilities; add a reproducible environment build script. Commit generation settings and manifests alongside implementation. Preserve a clear separation between editable sources, downloaded references and packaged runtime files.
- Add the scene entry from the existing Atlas place and David’s wiki detail where supported. Inspect the current `sceneForPlace` caller behavior before adding a person link; a person identifier such as `david_994` is not a geographic place identifier.

Do not introduce a second renderer or replace the app with a new framework. If scene-specific camera FOV or animation controls require a shared contract extension, make the default backward compatible and test the four current scenes. Ensure the update loop advances each mixer only once and disposal ownership prevents double-freeing shared materials.

## 8. Milestones and review gates

1. **Scene shell and graybox.** Register the route, stage terrain and proxy principals, implement safe navigation, vantages and corrected labels. Deliver reference-view and overhead captures. Gate: recognizable composition, coherent scale, no terrain holes.
2. **One complete character pipeline.** Finish David’s anatomy, costume, textures and sling; test one Mixamo base motion through FBX, Blender and GLB. Deliver `.blend`, packaged GLB, neutral turntable stills and an in-app close-up. Gate: correct hands, feet, skinning, scale and prop sockets. Resolve pipeline defects here before multiplying assets.
3. **Goliath and shield-bearer.** Finish armor, weapons, fit and animation. Deliver neutral and action-pose renders plus the two-character reference view. Gate: distinct hero anatomy, readable scale contrast, plausible grips, no armor penetration.
4. **Environment and armies.** Replace graybox terrain, add streambed/material layers, deploy modular troops and quality tiers, and integrate lighting and sources. Gate: the valley and both armies remain legible, no identical synchronized rows, balanced tier meets provisional budgets or has a documented tuning plan.
5. **Ambient scene release candidate.** Finish navigation, accessible controls, load failures, reduced motion and cleanup. Deliver browser captures at desktop and mobile sizes, validation results and a device performance report. Gate: final assets are present, complete scene works, and existing scenes regressions pass.
6. **Optional sling vignette.** Add an explicit Play encounter control with pause and reset. Use a short authored sequence: ready, load, sling wind-up/release, stone flight, reaction, settle. Target 12–18 seconds as a pacing choice. Reset must restore characters, all stones, sling, staff, mixers and camera. Gate: one launch and one impact per play, no event duplication when pausing, changing quality or replaying. The ambient scene must not repeatedly kill and resurrect Goliath in a loop.

For the vignette, use a single scene timeline and explicit state/event definitions. Keep locomotion placement deterministic. Author a non-graphic forward collapse if depicting the result; keep the full account available through Scripture links. Stone flight must originate at the evaluated sling pouch world position and arrive at the chosen contact point at the authored time. Define camera behavior when a visitor leaves the default viewpoint; default to preserving user control unless they explicitly choose cinematic playback.

## 9. Validation and completion criteria

Test behavior that can break the scene: scene registration and metadata; terrain/navigation agreement; invalid slope and obstacle rejection; independent skeleton motion; hero readiness and failed GLB loading; quality transitions preserving principals; prop attachment positions across clips; reset/replay event counts; reduced motion; route exit during load; correct disposal of owned resources. Use actual exported GLBs in asset validation, with the existing project’s image-decoding test limitations documented.

Run the existing human and scene asset validators, focused scene tests, lint on changed files and the production build. Add focused Elah coverage rather than tests that merely repeat constants. Suggested existing commands are `node scripts/validate-scene-humans.js`, `node scripts/validate-scene-assets.js`, `npm test -- src/components/scene src/lib/scenes.test.js` and `npm run build`. Extend validators to cover the new manifest where needed; a pass that ignores Elah is not evidence that Elah assets are valid.

Inspect neutral-light character renders and actual browser scenes. Check a close orbit around every principal, a full animation cycle, both army slopes, low and high settings, mobile framing, blocked assets, and five enter/exit cycles for sustained resource growth. Record device/browser, resolution, quality, frame-time measurement window, draw calls, triangles and transfer totals. Automated tests do not establish visual quality or mobile frame rate.

Final visual acceptance: David’s sling is recognizable; Goliath is visibly taller and anatomically convincing; the shield-bearer is present; armies occupy opposing slopes; the brook leads into the valley; cloth, skin, stone and bronze read as different materials; no floating feet, clipping weapons or synchronized crowd waves; labels are legible and optional. Compare the default viewpoint against the supplied screenshot’s composition without promising pixel identity.

Final handoff: working local route, editable Blender sources or documented source archive, optimized GLBs/textures, animation provenance and settings, asset notices, reproducible build/package instructions, source notes, screenshots and measured validation report. List any remaining placeholder or manual art task. Do not mark the feature complete while required hero assets are missing.
