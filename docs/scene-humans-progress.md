# Human implementation status

The earlier completion claims in this file were stronger than the shipped assets justified. The previous Capernaum actor GLBs were static primitive assemblies, while other scenes did not load a human asset group. The earlier detail-level field did not select geometry and the actor budget could hide a person without restoring its fallback.

## Implemented

- Three textured MakeHuman-derived GLBs with anatomical bodies and faces, eyes, hair, fitted tunics and real skeletal animation.
- Shared asset loading across all four scenes and replacement at the actual existing crowd positions.
- Real near/medium mesh selection, bounded nearby animation, independent clone rigs, distance-synchronized gait, and fallback restoration.
- Reduced-motion route/animation freezing, height-aware character clearance queries and navigation integration.
- Source licenses, archive hashes, pinned authoring tools, reproducible Blender build and binary/image validation.
- **Production motion now uses the skeletal clips baked into the shipped GLBs.** `sceneHumanClips.js` remains in the repository as an authoring/experimentation system, but it is no longer selected by `sceneHumans.js` at runtime. A real mobile screenshot exposed a failure mode that unit tests missed: the runtime-generated absolute full-body poses could put valid rigs into impossible inverted/somersaulted configurations. Stability now wins over the procedural gait's nicer stride metrics until a retargeted motion pipeline is visually validated against the actual meshes.
- **A real route model** (`sceneRoutes.js`), shared by the fallback crowd and the GLB actors. `figure.speed` used to be route-fractions per second, which meant an 86m Capernaum lane was walked at a 3-5.6 m/s sprint and a 7m one at a 0.25 m/s shuffle; it is metres per second now, with a real accelerate/cruise/decelerate profile and a stop-turn-continue at each end instead of an instant direction reversal.
- **Crowd placement that respects the navigation mesh.** Capernaum's villagers now stand on the real `floorAt`, not a flat two-level guess; they keep at least 0.62m of personal space, stand in small conversational/work knots, and every walking route is audited against `blockerAt` before being trusted.
- **Hard world anchoring.** The actor scene root is controlled only by route X/Z, `floorAt()` Y and route-facing yaw. Root pitch and roll are reset to zero every frame so no animation system can rotate the whole character into a somersault.
- **Biomechanical pose guard** (`sceneHumanSafety.js`). Head, hips and both feet are sampled in world space after animation. If their vertical ordering or floor relationship stops resembling an upright human, the actor is immediately forced to baked idle; if even idle is invalid, that skeletal actor is hidden and its proven instanced fallback is restored instead of rendering an impossible body.
- **The procedural head/weight/carry overlay is disabled on the production human path.** `sceneHumanPose.js` remains available for future constrained use, but the current runtime does not add extra head rotation or upper-body pose synthesis on top of the baked clips. This removes another uncontrolled layer while the motion system is being rebuilt around authored/retargeted movement.
- **Human-to-prop attachment sockets** (`sceneHumanAttachments.js`). The shipped Mixamo-compatible rig exposes semantic `leftGrip`, `rightGrip`, `shoulderStrap`, `back`, `hip`, and `head` sockets mapped onto real bones. Capernaum's already-loaded CC0 prop group is shared with the human manager without duplicating resource ownership, and props that load after the actor group are attached to actors already on screen.
- **First concrete interactions using already shipped free assets.** The named Capernaum carrier uses the locally hosted CC0 Galilean jar on `rightGrip`; the named fisherman carries the existing CC0 basket at the hip.

See [asset documentation](scene-humans-assets.md) for the exact asset contract and rebuild commands, and `docs/scene-humans-motion-and-crowding-plan.md` for the earlier motion/crowding measurements.

## Not claimed complete

Scanned photoreal likenesses, skin subsurface scattering, authored period-specific wardrobe for every era, two-hand IK/constraint solving, foot IK, cloth simulation, and mobile GPU certification are not implemented. The current prop sockets are rigid bone attachments: they make carried objects move with the person, but they do not yet solve both hands onto one object, constrain a hand onto a mill handle, or synchronize net-mending contact points. The shared models are an improvement in anatomical and material detail; “ultra realistic” is a visual target, not a status that unit tests can certify.

`HumanAnimationController.updateBlink()` is dead code against the shipped assets: all three GLBs have zero morph targets (`build_characters.py` calls `shape_key_remove(all=True, apply_mix=True)` during the bake), so the blink tests in `sceneHumanAnimation.test.js` pass only against a synthetic mesh built for the test and certify nothing about what actually ships.

The baked clips are an intentional stability baseline, not the final realism solution. Their known limitations remain: the walk has visible foot sliding relative to ideal stride, idle is comparatively static, and the original authoring produced less-natural forearm orientation than the procedural experiment. The next motion system should use externally authored or mocap-derived clips retargeted offline to the exact shipped skeletons, then layer root-motion control, stance-foot locking/IK, anatomically limited neck/head tracking and small additive breathing/weight shifts. Runtime code should blend and constrain verified human motion rather than synthesize the entire body pose from scratch.

`sceneRoutes.js`'s lane offset is fixed in world space rather than flipped by direction of travel, so two walkers sharing one route in opposite directions do not reliably keep to separate sides of it.
