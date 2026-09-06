# Caesarea Maritima — Astra comparison scene

## Open

Run the app normally (`npm run dev`) and visit `/scene/caesarea`.
The existing Atlas/wiki scene lookup also exposes it on the `caesarea` place.
Compare with `/scene/second-temple` (Claude's original geometry/navigation are unchanged).

**Framing:** Paul’s witness before kings, Acts 23–27, with Cornelius and Philip as earlier story stops.

## Experience

- Walkable waterfront and shaded colonnade; five fast-travel viewpoints.
- Animated procedural sea with sun glints, shoreline foam and distance haze.
- Lofted merchant-ship hulls, curved square sails, rigging, gentle boat motion.
- Palace facade, warehouses, domestic courtyard, palms and distant city silhouette.
- Shared desktop/touch controls, scripture buttons, no-WebGL prose fallback.
- Low quality removes shadows and distant ships/birds and reduces sea tessellation.
- Reduced-motion mode freezes Caesarea's water, boats and birds.
- No downloaded models, textures, generated images, new app dependencies, or backend changes.

## Historical boundary

This is **an illustrative compact district**, not a surveyed model of ancient Caesarea.
Its street plan, palace location within the district, exact houses, hearing rooms,
ships, port structures and proportions are artistic composition. Do not use it
as archaeological evidence. In particular, the palace facade is not an identified
room of Paul's captivity, and the domestic courtyard is not an identified home
of either Cornelius or Philip. The intro and prose fallback state this explicitly.

The scripture text anchors the stories, not the geometry:

- Acts 10:1–8, 24–48; 11:1–18 — Cornelius and Peter.
- Acts 21:8–14 — Philip, his daughters and Agabus.
- Acts 23:33–35 — Paul held in Herod's praetorium.
- Acts 24–26 — hearings before Felix, Festus and Agrippa.
- Acts 27:1–6 — the ship of Adramyttium, then transfer at Myra; do not conflate the two ships.

Primary passages were checked through bible-api.com's public-domain WEB text:
`https://bible-api.com/acts%2023:33-35?translation=web`, plus Acts 10:1–8,
21:8–14 and 27:1–2. An attempted parks-authority archaeology page returned 403;
no claim of verified archaeological dimensions is made.

## Comparison provenance

The requested authoring model was GPT-6 Astra in the current OpenAI Codex-backed
Hermes session. An initial delegated implementation attempt failed at the provider
before making changes; the parent session authored the implementation. An independent
reviewer subsequently reviewed the code. Model comparison is qualitative, not a
controlled benchmark: different subjects and shared existing controls influence it.

Keep both under the same viewport, hardware and quality setting. Compare visual
composition, geometry/detail, atmosphere/motion, navigation, scripture integration,
source transparency, bundle weight and frame performance. Do not use software-renderer
headless timings as GPU performance scores.

## Code and checks

- `src/lib/caesareaScene.js`: descriptive manifest and scripture stops.
- `caesareaDimensions.js`: shared solid extents and world coordinates.
- `caesareaNavigation.js`: bounded substep collision, sliding, safe spawns, ground taps.
- `buildCaesarea.js`: injected Three.js builder, animation, resource disposal.
- `Scene.jsx`: selects the per-scene builder/navigation/disclaimer; fixes duplicate fallback keys.

```sh
npm test -- src/components/scene src/lib/scenes.test.js
npm run build
npm run lint
```

Repository-wide lint already has unrelated unused-variable errors in `Studies.jsx`
and hook warnings in `App.jsx`/`Calendar.jsx`; touched scene files pass targeted lint.
A headless Chrome/SwiftShader smoke test actually rendered each viewpoint in high
and low quality without shader/GL errors. This checks execution, not artistic quality.
No screenshots or interactive visual inspection were performed, per repository preference.

Visual review for the maintainer: opening harbor reveal; boat sail/hull silhouettes;
west-facing palace facade; domestic canopy; touch navigation and bottom viewpoint
buttons on a narrow phone. No commit, push or deployment is part of this change.
