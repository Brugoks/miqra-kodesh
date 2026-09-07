# Biblical Scene Realism — Progress & Acceptance Log

Living progress log for the biblical scene realism program in `Brugoks/miqra-kodesh`.

## Milestones Overview

- **Milestone 1**: Complete Capernaum Pilot & Shared Foundations (Phases 0–6) — **COMPLETED**
- **Milestone 2**: Caesarea Scene Realism Upgrade (Phase 7) — PENDING (Deferred to Phase 7)
- **Milestone 3**: Herod's Temple Realism Upgrade (Phase 7) — PENDING (Deferred to Phase 7)
- **Milestone 4**: Tabernacle Realism Upgrade (Phase 7) — PENDING (Deferred to Phase 7)

---

## Phase Status Summary

| Phase | Description | Status | Details / Deliverables |
| :--- | :--- | :--- | :--- |
| **Phase 0** | Historical & Asset Specification | **Complete** | Sourcing docs (`docs/scene-realism-sources.md`), asset spec (`docs/scene-realism-assets.md`), asset generation script (`scripts/generate-scene-assets.js`), validation script (`scripts/validate-scene-assets.js`), and 32 authentic PBR/GLB/Audio assets under `public/assets/scenes/`. |
| **Phase 1** | Resource Loading & Ownership | **Complete** | Declarative manifest (`sceneAssetManifest.js`), resource tracking (`sceneResources.js`), PBR material builder (`sceneMaterials.js`), background sequential session loader (`sceneAssets.js`), unit tests (`sceneAssets.test.js`). |
| **Phase 2** | Quality, Lighting & Contact | **Complete** | Canonical `low`, `balanced`, `high` profiles (`sceneQuality.js`), auto resolution manager with hysteresis and cooldowns, local storage persistence, unit tests (`sceneQuality.test.js`). |
| **Phase 3** | Capernaum Visual Slice | **Complete** | Atomic asset placement & fallback replacement (`capernaumAssets.js`), builder occluders and asset hookup (`buildCapernaum.js`), preserved floor/corridor navigation. |
| **Phase 4** | Recorded Environmental Sound | **Complete** | Sample bank manager (`sceneAudioAssets.js`), synthetic-to-recorded crossfade and distance-driven surface footsteps (`sceneAudio.js`), unit tests (`sceneAudioAssets.test.js`). |
| **Phase 5** | Unobstructed Exploration & Context | **Complete** | Raycast occlusion & overlap manager (`sceneHotspots.js`), Places & Stories drawer (`ScenePlacesModal.jsx`), How We Know citations modal (`SceneSourcesModal.jsx`), Quiet Mode toggle, walk pace toggle (1.6 m/s vs 3.6 m/s), dated period CTAs in Atlas and Wiki (`scenes.js`, `AtlasDetailSheet.jsx`, `BibleWiki.jsx`), and Atlas return context roundtripping (`Scene.jsx`, `Atlas.jsx`). |
| **Phase 6** | Pilot Integration & Release Readiness | **Complete** | Complete verification passing: 372 unit tests across 25 suites, asset validator verifying 32 assets (3.09 MB total payload < 8 MiB budget), clean ESLint across all modified directories, successful Vite production bundle build. |

---

## Verification Evidence Records

- **Date**: September 6, 2026
- **Test Suite (Scene, Audio & Narration)**: 20 files, 332 tests passed (0 failed).
- **Test Suite (Atlas, Wiki & Periods)**: 5 files, 40 tests passed (0 failed).
- **Total Unit Test Coverage**: 25 test files, 372 tests passing headlessly.
- **Asset Manifest & Payload Validation**: 32 assets verified (3.09 MB total payload, within ≤ 8.0 MiB budget).
- **Lint (`eslint` on scene/atlas/wiki/lib/scripts)**: Clean (0 errors, 0 warnings).
- **Production Build (`npm run build`)**: Succeeded cleanly (1.08s).

---

## Manual Visual & Listening Review Matrix (Pending Maintainer Acceptance)

In accordance with repository guidelines, headless automated verification has been fully executed. Real device sensory review is marked below as Pending Maintainer Review:

| Check | Focus Area | Desktop High | Phone Low | Muted / Audio | Reduced Motion | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | Shore Opening & Boat Waterline | Pending | Pending | Pending | Pending | Pending Maintainer Review |
| 2 | Courtyard Approach & Actor Grounding | Pending | Pending | Pending | Pending | Pending Maintainer Review |
| 3 | Doorway Relief & Lake Occlusion | Pending | Pending | Pending | Pending | Pending | Pending Maintainer Review |
| 4 | Room Interior Shade & Roof Light | Pending | Pending | Pending | Pending | Pending | Pending Maintainer Review |
| 5 | Time of Day (Morning/Dusk/Night) | Pending | Pending | Pending | Pending | Pending | Pending Maintainer Review |
| 6 | In-place Quality Tier Switching | Pending | Pending | Pending | Pending | Pending | Pending Maintainer Review |
| 7 | Offline / Asset Failure Degradation | Pending | Pending | Pending | Pending | Pending | Pending Maintainer Review |
| 8 | Multi-route Navigation Lifecycle | Pending | Pending | Pending | Pending | Pending | Pending Maintainer Review |
| 9 | Hotspots, Stories List & Quiet Mode | Pending | Pending | Pending | Pending | Pending | Pending Maintainer Review |
| 10 | Shore / Room Environmental Audio | Pending | Pending | Pending | Pending | Pending | Pending Maintainer Review |
