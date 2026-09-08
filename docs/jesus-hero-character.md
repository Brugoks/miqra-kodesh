# Jesus hero character — production contract

Status: visual identity approved; runtime integration scaffolding in progress.

Asset target: `human-jesus-v1`
Fallback asset: `human-jesus`
Period: c. AD 28–30
Classification: historically informed artistic reconstruction. The exact face is unknown and must not be presented as a forensic identification of Jesus.

## Visual authority

The approved Miqra-Kodesh character sheet from the September 2026 design session is the visual authority for the hero character. Production work should preserve its identity rather than drifting toward a MetaHuman preset or conventional later Christian iconography.

Core direction:

- First-century Jewish/Galilean appearance; Levantine complexion, dark brown eyes and dark wavy/curly hair.
- Visual age approximately 32–33.
- Production height 1.66 m. This is an art-direction choice informed by population estimates, not a claimed measurement of Jesus.
- Lean, compact, working-man build rather than heroic or bodybuilder proportions.
- Moderately short natural beard and relatively short dark hair; no shoulder-length Renaissance hair.
- Ordinary, weathered skin. Do not make the character unusually handsome or visibly supernatural in everyday scenes.
- Natural-fiber tunic, rectangular mantle, woven belt and historically restrained leather sandals.
- Identity should be established through staging, attention, words and actions rather than brilliant costume colors or halo-like effects.

## Evidence labels

Every historical design claim added to the character source documentation must be classified as one of:

- `attested` — directly supported by ancient textual/material evidence.
- `inferred` — plausible from first-century Jewish/Judean context and comparative evidence.
- `artistic` — required to complete a usable character but not recoverable historically.

Exact facial geometry is always `artistic` unless a future source changes the evidentiary basis. Do not silently promote an artistic facial choice to an archaeological claim.

## Authoring pipeline

Use MetaHuman as a high-resolution source/authoring tool, not as the browser runtime contract:

1. Match the approved front, three-quarter and profile identity in MetaHuman or a Blender sculpt conformed to MetaHuman-quality topology.
2. Export the high-resolution source to Blender.
3. Build the web meshes, clothing and hair-card solution in Blender.
4. Skin the runtime body to the existing Miqra-Kodesh Mixamo-compatible skeleton.
5. Preserve facial performance as morph targets/shape keys rather than shipping MetaHuman RigLogic.
6. Export a content-addressed GLB plus compressed runtime textures.
7. Validate the result in Mark 2 before replacing the fallback in any other tableau.

## Runtime skeleton contract

The body must remain compatible with the current `makehuman-mixamo-v1` family used by Miqra-Kodesh. Required core bones include:

- `mixamorig:Hips`
- `mixamorig:Spine`, `mixamorig:Spine1`, `mixamorig:Spine2`
- `mixamorig:Neck`, `mixamorig:Head`
- left/right arm, forearm and hand
- left/right upper leg, leg and foot

Existing locomotion, attachments, tableau posing, pose-safety and route logic depend on this contract. Do not make the MetaHuman skeleton the browser-facing rig.

## Geometry targets

### LOD0 — hero

Target 75k–95k triangles total, approximately:

- head/eyes/mouth: 25k–35k
- body: 15k–20k
- tunic: 10k–15k
- mantle: 8k–12k
- hair cards: 8k–12k
- beard/brows/lashes: 5k–8k
- sandals/accessories: 2k–4k

### LOD1 — medium

Target 25k–40k triangles total.

The first runtime asset should use the two LOD buckets the existing scene code already understands (`LOD0` and meshes containing `_LOD1`). Do not add a third internal LOD until the shared runtime explicitly supports it.

## Face contract

The hero face is a separate layer over the body skeleton. Start with a compact high-value morph set rather than reproducing MetaHuman's entire facial rig.

Initial required morphs:

- `eyeBlinkLeft`, `eyeBlinkRight`
- `eyeSquintLeft`, `eyeSquintRight`
- `eyeWideLeft`, `eyeWideRight`
- `browInnerUp`
- `browDownLeft`, `browDownRight`
- `browOuterUpLeft`, `browOuterUpRight`
- `jawOpen`
- `mouthSmileLeft`, `mouthSmileRight`
- `mouthFrownLeft`, `mouthFrownRight`
- `mouthPucker`, `mouthFunnel`
- `mouthPressLeft`, `mouthPressRight`
- `mouthUpperUp`, `mouthLowerDown`
- `cheekSquint`
- `noseSneer`

Eye aim should prefer eyeball rotation/bones. Add corrective eyelid morphs if required by the final topology.

## Speech target

Phase one does not require cinematic phoneme solving. A later viseme pass should support roughly:

`REST`, `AA`, `EE`, `IH`, `OH`, `OU`, `FV`, `L`, `MBP`, `WQ`, `TH`.

Expression and viseme weights must blend rather than replace each other.

## Materials and textures

Runtime hero targets:

- skin BaseColor: 2048²
- skin Normal: 2048²
- skin Roughness: 1024–2048²
- micro-normal: 512–1024²
- AO: 1024²
- clothing/hair maps sized by measured close-up need

Skin is dielectric (`metalness = 0`). Do not bake directional illumination into BaseColor. Preserve subtle regional roughness variation instead of a uniformly matte or plastic surface.

Use hair cards for scalp hair, beard, eyebrows and eyelashes. Do not ship strand grooms to the web runtime.

## Clothing

- Separate skinned tunic and mantle meshes.
- Natural off-white/oatmeal tunic; visible woven roughness and restrained wear.
- Rectangular heavier mantle with historically restrained fringe treatment.
- Simple woven sash.
- Simple worn leather sandals.
- No runtime cloth simulation requirement for v1; use skinning/helper bones and baked secondary motion where necessary.

## Animation milestone

The first hero GLB should include enough motion to validate the complete character pipeline:

- `idle`
- `walk`
- a teaching/teacher pose or loop
- core blink morphs
- the initial facial morph set

Subsequent animation library:

- idle-listening
- idle-teaching
- walk-slow
- sit / sit-down / stand-up
- pray / kneel
- small teaching gestures
- open-hand / two-hand gestures
- point / reach / blessing
- look-up / look-down

Prefer subtle natural gestures over theatrical preaching poses.

## Packaging and performance

Runtime asset id: `human-jesus-v1`.

Target initial payload:

- hero GLB: 5–8 MB
- compressed runtime textures: 3–5 MB
- total hero payload: 8–12 MB maximum before measured justification

Use the repository's existing content-addressed asset naming and validation process. The hero asset should load only with the Capernaum principal/tableau assets, not as a prerequisite for first paint.

## Fallback/migration rule

`human-jesus` remains the stable runtime/fallback id while the new asset is being developed.

The principal model resolver prefers `human-jesus-v1` only when that asset has actually loaded and passed the tableau's existing skinned-rig validation. The current shipped Jesus GLB therefore remains the working scene until the hero model is present.

Do not delete the fallback until the new character passes:

- rig validation
- Mark 2 staging
- Matthew 9 staging
- LOD behavior
- close-range visual review
- mobile performance review
- resource-disposal/revisit tests

## First production milestone

Produce `human-jesus-v1-alpha.glb` with:

- approved face and body proportions
- finished hair/beard silhouette
- tunic, mantle, belt and sandals
- Mixamo-compatible body skeleton
- LOD0 and LOD1
- idle, walk and teacher motion
- blink morphs and the initial face set
- 2K-class runtime skin textures

Integrate it into Mark 2 first. If it reads convincingly at ordinary first-person distance without destabilizing scene performance, the hero-character pipeline is validated and can expand into Matthew 9 and future Scripture events.
