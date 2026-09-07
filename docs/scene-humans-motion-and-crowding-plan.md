# Scene humans: motion and crowding

An implementation plan for the two complaints against `/scene/capernaum`: the
people do not move like people, and a dozen of them stand in one spot staring
at each other.

Everything below was measured, not guessed. The measurements are quoted so the
implementer can re-run them and know when a change has actually landed.

---

## 1. What is actually wrong

### 1.1 The walk speeds are not speeds

`figure.speed` is not metres per second. It is **route-fractions per second** —
`sampleHumanPosition()` in [sceneHumans.js:20](../src/components/scene/sceneHumans.js#L20)
and the identical copy at [sceneFigures.js:716](../src/components/scene/sceneFigures.js#L716)
both do `cycle = (elapsed * speed + phase) % 2`. So the same `speed` value means
a different pace on every route, in proportion to the route's length.

`buildCapernaum.js` gives every walker `speed: 0.035 + random() * 0.03`. Measured
against the actual `ROUTES` array:

| route | length | resulting pace |
|---|---|---|
| `[[-46,-8],[40,-8]]` | 86 m | **3.0 – 5.6 m/s** — a sprint |
| `[[22,32],[22,12]]` | 20 m | 0.70 – 1.30 m/s — correct |
| `[[-19,20],[-19,27]]` | 7 m | **0.25 – 0.46 m/s** — a shuffle |
| `[[6,-10],[6,40]]` | 50 m | **1.75 – 3.25 m/s** — a run |
| `[[36,6],[-30,6]]` | 66 m | **2.3 – 4.3 m/s** — a run |

A relaxed adult walk is 1.1–1.4 m/s. Three of the five routes are run at two to
four times that, and one at a third of it. This is the single largest cause of
"they don't move naturally", and it is also why the legs scramble: the gait is
distance-driven, so a figure at 4.3 m/s cycles its legs 3.7 times a second.

### 1.2 The routes go through walls

Sampling each route at 400 points × five lane offsets and calling
`blockerAt(x, z, 0)` from [capernaumNavigation.js:202](../src/components/scene/capernaumNavigation.js#L202):

```
ROUTE 0 [[-46,-8],[40,-8]]  len=86m  blocked=16.9%  {anchors, nets-a, nets-b, baskets, tree}
ROUTE 1 [[22,32],[22,12]]   len=20m  blocked=34.7%  {millstone, house}
ROUTE 2 [[-19,20],[-19,27]] len=7m   blocked=34.9%  {insula-west}
ROUTE 3 [[6,-10],[6,40]]    len=50m  blocked=7.4%   {nets-b, insula-north}
ROUTE 4 [[36,6],[-30,6]]    len=66m  blocked=53.2%  {house, insula-west, insula-shore-west}
```

Route 4 spends over half its length inside solid buildings. Route 2 is inside
`insula-west` for a third of its length. Nothing has ever checked this.

### 1.3 The turn-around is instantaneous and there is no pause

`along` is a triangle wave, so at each end of a route the direction reverses in
one frame at full speed while `facing` jumps by π. The controller then eases the
facing over ~0.5 s, so the figure spends half a second walking sideways. Nobody
stops, turns, and sets off again — which is what a person does.

The facing ease is also frame-rate dependent:
[sceneHumanAnimation.js:113](../src/components/scene/sceneHumanAnimation.js#L113)
uses `const turnSpeed = Math.min(1.0, delta * 5.0)`, a raw lerp factor. At 144 fps
a figure turns four times slower than at 30 fps.

### 1.4 The shipped walk clip does not walk

I decoded the animation channels straight out of `artisan-ba7d2345f355.glb` and
walked the bone chain to world space. Over the 1.2 s `walk` clip:

| quantity | measured | a real walk |
|---|---|---|
| ankle fore-aft excursion | **0.31 m** | ≈ one step length |
| `walkMetersPerCycle` in the manifest | **1.15 m** | should be ≈ 2 × step |
| swing-foot ground clearance | **3.6 cm** | 10–15 cm |
| hips vertical travel | **0.000 m** (constant 0.987) | 4–5 cm, twice per cycle |
| hip flexion/extension range | ≈ 17° total | +22° to −12°, ≈ 34° |
| arm swing amplitude | ≈ 6.5° total | 20–30° |
| pelvis / shoulder counter-rotation | none | ±4° / ±3° |

The clip implies a stride of about 0.62 m but is told to cover 1.15 m — so
roughly **half of every metre walked is the feet sliding across the ground.**
There is no vertical bob and no counter-rotation, which is why it reads as a
mannequin being dragged rather than a person walking.

### 1.5 The arms are the reason they look wrong standing still

Same decode, upper-arm and forearm direction measured as degrees away from
straight down:

| clip | upper arm | forearm |
|---|---|---|
| bind pose | 41° (A-pose) | — |
| `idle` | 5.7° ✔ | **50.6°** |
| `walk` | 8.7° ✔ | **51.8°** |
| `work` | 13.9° | **70.4°** |
| `prayer` | 39.3° | **98.7°** — above horizontal |

The upper arms hang correctly. The **forearms stick out forwards at 50–70°** in
every clip, which is exactly the splayed sleepwalker pose in the screenshot.

The cause is in the authoring script.
[`set_world_rotation()` in build_characters.py](../scripts/humans/build_characters.py)
sets each bone's rotation in *world* axes, including the forearm — so the
forearm is posed against the world instead of against the elbow, and ignores
wherever the upper arm ended up. The rest skeletons make this worse: the bind
rotations are not axis-aligned and differ per model (artisan `Hips` is tilted
9°, villager `Hips` −2°; artisan `Spine` −21°, villager `Spine` −1.3°), so a
world-axis formula drifts differently on each character.

### 1.6 `idle` is a photograph

Over the full 4-second `idle` loop, measured on the shipped GLB:

- upper-arm angle varies by **0.2°**
- forearm angle varies by **2.1°**
- head world height varies by **1.7 mm**
- hips do not move at all

That is not a still figure, it is a still *image*. And most of the crowd is on
it: `sceneHumans.js` maps only `working → work`, `sitting → sit`,
`kneeling → kneel`, `praying`/`bowing` → `prayer`. The Capernaum crowd's other
activities — `talking`, `attending`, `carrying`, `standing` — **all fall through
to the same frozen `idle`.**

Related dead code: `HumanAnimationController.updateBlink()` can never fire.
All three GLBs contain **zero morph targets** (`build_characters.py` removes
shape keys with `shape_key_remove(all=True, apply_mix=True)`), so the blink
tests in `sceneHumanAnimation.test.js` pass only against a synthetic mesh and
certify nothing about the shipped characters.

### 1.7 The creepy huddle

I built the real scene in jsdom and read the villager instance matrices back
out. Grouping them by nearest haunt centre:

| haunt | centre | people | closest pair | pairs < 0.7 m |
|---|---|---|---|---|
| nets on the shore | `[0, -10]` | **13** | **0.30 m** | 3 |
| the courtyard | `[22, 21]` | 4 | 2.63 m | 0 |
| synagogue steps | `[-19, 24]` | 7 | 0.41 m | 2 |
| the tax booth | `[-52, 2]` | **12** | **0.08 m** | 7 |
| the north lane | `[30, 40]` | 10 | 0.36 m | 6 |

Three separate faults produce this:

1. **The haunt loop distributes unevenly.** `HAUNTS[placed % HAUNTS.length]`
   advances `placed` by the *group size* (2–4), so the modulo lands unevenly —
   13 people at one haunt, 4 at another, out of a nominal 46/5 ≈ 9 each.
2. **`gather()` has no idea anyone else exists.** Each call lays out its own
   ring of 2–4 around the same centre with `i/count * 2π`, so three successive
   calls at one haunt produce three overlapping rings with only 2–4 angular
   slots each. `queryClearance()` treats a person as a 0.3 m cylinder, so
   anything under 0.6 m apart is interpenetrating — and the closest pair in the
   scene is **0.08 m**.
3. **Everyone faces the centre.** `gather()` sets
   `facing = atan2(centre − position) ± 0.35`, so a thirteen-person haunt is
   thirteen people staring into a single point. Two or three people facing each
   other is a conversation; thirteen is a séance.

### 1.8 They stand on the wrong ground

`buildCapernaum.js:798` defines the surface under a figure as
`groundAt = (x, z) => (z < SHORE.beachNorth ? LEVEL.beach : LEVEL.ground)` —
a two-level step function. The real floor
([`floorAt` in capernaumNavigation.js:153](../src/components/scene/capernaumNavigation.js#L153))
has five surfaces including the sloped shore ramp and the synagogue podium.
Comparing them at the actual villager positions:

```
(-0.80,-12.61) region=shore-ramp floor=-0.35  groundAt=0  →  floats 0.35 m
( 0.53,-13.11) region=shore-ramp floor=-0.52  groundAt=0  →  floats 0.52 m
(-0.55,-12.78) region=shore-ramp floor=-0.41  groundAt=0  →  floats 0.41 m
(-0.57,-11.74) region=shore-ramp floor=-0.05  groundAt=0  →  floats 0.05 m
```

Four of the thirteen shore villagers hover up to half a metre above the ramp
they are standing on, at four different heights, in the middle of the group.

And figures are placed with no clearance test at all:

```
(2.18,-9.84) (2.71,-8.52) (1.80,-9.39) (2.88,-8.95)  →  inside blocker "nets-b"
(-51.77,0.56) (-53.87,1.21) (-52.45,1.04) (-52.69,0.14)  →  inside "tax-booth"
(-19.54,21.00)  →  inside "insula-west"
```

Nine people are standing inside solid objects.

---

## 2. Constraints

- **Blender is not installed and MPFB is not available**, so the GLBs cannot be
  rebuilt. Every fix below is runtime JavaScript against the shipped binaries.
- **Do not touch the `.glb` files or `scripts/validate-scene-humans.js`.** The
  assets are content-addressed by sha256 in `sceneHumanAssets.js` and the
  validator asserts the six baked clips exist. They stay in the file; they just
  stop being the source of pose at runtime.
- **Do not verify visually** (per `CLAUDE.md`). No dev server, no screenshots.
  Tests and `npm run lint` carry the weight, and §7 lists what to hand back to
  the maintainer to eyeball.
- **Determinism matters.** The builder is seeded (`makeRandom(28061128)`), and
  tests assert reproducibility. Everything new must be seeded too — no bare
  `Math.random()` in placement or in per-actor phase.
- **Appearance is out of scope.** The complaint is motion and placement. Do not
  touch materials, textures, or `sceneHumanMaterials.js`.

---

## 3. Workstream A — one route model, speeds in metres per second

**New file: `src/components/scene/sceneRoutes.js`.**

The route arithmetic is currently duplicated between `sceneFigures.js` (the
instanced fallback crowd) and `sceneHumans.js` (the GLB actors), and they
already disagree — the fallback uses 0.78 m per step, the GLB path 1.15 m per
cycle. They read from *the same figure objects*, so a figure that swaps between
them mid-approach would jump. One module, both consumers.

```js
// A route is walked at a real speed in metres per second, out and back, with a
// pause at each end and a ramp on and off. Everything downstream — the gait,
// the turn, the footstep cadence — is derived from this, so this is the thing
// that has to be right. `speed` used to be route-fractions per second, which
// meant an 86m lane was run at 4 m/s and a 7m one was shuffled at 0.3.
export const WALK_SPEED = 1.15;   // m/s, relaxed village pace
export const RAMP = 0.8;          // s to reach or shed full pace
export const DWELL = 2.6;         // s standing at each end before turning back

export function routePlan(figure) { ... }
export function sampleRoute(plan, clock) { ... }
```

`routePlan(figure)` precomputes `{ from, to, dx, dz, length, speed, dwell, ramp,
legTime, period }` once per figure. With a trapezoidal speed profile,
`legTime = ramp + length / speed` (clamp `ramp` to `length / speed` so a short
route degenerates to a triangle rather than going imaginary).

`sampleRoute(plan, clock)` returns
`{ x, y: null, z, facing, speed, moving, along, direction }`:

- Phase within `period = 2 * (legTime + dwell)` selects out-leg, dwell,
  return-leg, dwell.
- Distance along a leg is the **integral of the eased speed**, not an eased
  `along` — easing `along` would slow the middle of a long route as much as its
  ends. Ramp: `d = v·t²/(2R)`. Cruise: `d = v·R/2 + v·(t−R)`. Decelerate:
  mirror.
- `speed` is the instantaneous m/s. Return it; do not make callers difference
  positions (see §5.3).
- `moving` is false during a dwell.
- `facing` follows the direction of travel while moving, and eases toward the
  return heading **across the dwell**, so a walker stops, turns on the spot, and
  sets off. Cap the turn at ~2.2 rad/s.
- Keep the perpendicular `lane` offset. Optionally flip its sign with
  `direction` (blended across the dwell) so out-bound and in-bound walkers keep
  to their own side of the lane and stop passing through each other.

**Consumers to update:**

- `sceneHumans.js` — `sampleHumanPosition()` delegates to `sampleRoute`. It is
  exported and covered by `sceneHumans.test.js`; update those tests.
- `sceneFigures.js:711-726` — same delegation. Derive the fallback's `cadence`
  from `plan.length` and the shared `walkMetersPerCycle` rather than its own
  hardcoded 0.78.
- `sceneHumanPlacements.js` — `cap-actor-carrier` has `speed: 0.035`; a person
  carrying a water skin walks about **0.95 m/s**.
- The other three builders (`buildCaesarea`, `buildSecondTemple`,
  `buildTabernacle`) pass figures through the same modules. Grep for `speed:`
  in each and convert; do not leave a scene on the old units.

**Verified replacement routes for Capernaum.** I audited these against
`blockerAt` at 600 samples × five lane offsets with a lane half-width of 0.9 m.
All eight are **0% blocked** and each stays on a single floor height:

| id | route | length | pace |
|---|---|---|---|
| `shore-promenade` | `[[-16, -6.2], [18, -6.2]]` | 34 m | 1.15 |
| `lane-north` | `[[6, -5.5], [6, 34]]` | 39.5 m | 1.20 |
| `west-lane` | `[[-26, 1], [-26, 25]]` | 24 m | 1.10 |
| `east-lane` | `[[36, 21], [36, 2]]` | 19 m | 1.25 |
| `north-lane` | `[[32, 31], [32, 49]]` | 18 m | 1.05 |
| `tax-approach` | `[[-48, -2], [-48, 11]]` | 13 m | 1.00 |
| `courtyard-lane` | `[[22, 35], [22, 29]]` | 6 m | 0.95 |
| `beach-walk` | `[[18, -16], [30, -16]]` | 12 m | 0.90 (on the beach, floor −0.55) |

Give each walker `speed: base * (0.92 + random() * 0.16)` so a lane is not a
column of metronomes, and `phase: random()` scaled across the **whole** period —
the current code writes `phase: random()` against a `% 2` cycle, so every walker
on a route starts in the same half of it and they clump.

---

## 4. Workstream B — pose and gait authored in JavaScript

**New file: `src/components/scene/sceneHumanClips.js`.**

The baked clips cannot be fixed without Blender, and two of them (`walk`,
`idle`) are unusable regardless. Build `THREE.AnimationClip`s in JS instead, once
per loaded model, and feed them to the existing `AnimationMixer`. Nothing else
in the pipeline changes: crossfades, `walkAction.paused = true` distance-driving,
and LOD all keep working.

### 4.1 Author in model space, convert per model

This is the part the Blender script got wrong and it must not be repeated. Do
**not** write bone-local rotations by hand — the three rigs have different bind
orientations (§1.5), so the same local quaternion poses them differently.

Author each joint as a rotation in **model space**, then convert top-down:

```js
// Walk the chain root → leaf. `desired[bone]` is the bone's model-space
// rotation; the local key is whatever gets you there from the parent's
// already-computed model rotation. Authoring in model space is the whole
// point: the artisan's Hips are tilted 9 degrees in bind and the villager's
// are tilted -2, so identical local keys give two different postures.
desired[bone]  = modelDelta[bone] * bindModel[bone];
localKey[bone] = desired[parent].clone().invert() * desired[bone];
```

`bindModel[bone]` is accumulated once per model from the loaded skeleton.
Bake 24 keys per cycle into `QuaternionKeyframeTrack`s named
`` `${bone.name}.quaternion` ``, plus a `VectorKeyframeTrack` on
`mixamorig:Hips.position` for the vertical bob and lateral sway. Cache the
result per `modelId`.

### 4.2 The walk cycle

Phase `p ∈ [0, 1)` is one full stride. The right leg is the left leg at
`p + 0.5`. Set `locomotion.walkMetersPerCycle = 1.30` in
`sceneHumanManifest.js` and author the stride to match it — **the ankle's
fore-aft excursion must equal one step length, 0.65 m.** That equality is the
anti-foot-skate invariant and §6 tests it directly.

Target curves (degrees, positive = flexion / forward):

| joint | curve |
|---|---|
| hip (`UpLeg`) | `5 + 17·cos(2πp)` → +22° at heel strike, −12° at toe-off |
| knee (`Leg`) | `5 + 12·bump(p, 0.12, 0.18) + 58·bump(p, 0.72, 0.22)`, clamped ≥ 0 |
| ankle (`Foot`) | `6·sin(2π(p + 0.15)) − 14·bump(p, 0.52, 0.12)` |
| pelvis yaw (`Hips`) | `4·sin(2πp)`, swing side forward |
| spine counter-yaw (`Spine1`) | `−0.6 ×` pelvis yaw |
| pelvis list (`Hips` roll) | `4·sin(2πp)`, dropping on the swing side |
| hips Y offset | `−0.022·cos(4πp)` m — 4.4 cm, twice per cycle |
| hips X offset | `0.020·sin(2πp)` m — sway over the stance foot |
| shoulder (`Arm`) | `−12 − 16·cos(2πp)`, opposite the ipsilateral leg; abduct 6° |
| elbow (`ForeArm`) | `14 + 10·max(0, cos(2πp))` |
| neck (`Neck`) | `−0.5 ×` spine yaw, so the head stays down the path |

`bump(p, centre, width)` is a raised cosine over the wrapped distance —
`0.5·(1 + cos(π · clamp(|wrap(p − centre)| / width, 0, 1)))`. C¹ and periodic,
so the clip loops cleanly and the test can sample it anywhere.

### 4.3 The standing poses

The rest of the clips are a **static pose table plus a slow loop**, which is
what the Blender script was reaching for. Author the table in model-space
degrees per joint:

```js
const POSES = {
  idle:    { Arm: [-2, 0, 6],  ForeArm: [16, 0, 4],  ... },
  talk:    { ... },   // one arm gestures in bursts, the other rests
  listen:  { ... },   // still, inclined 4 degrees toward the speaker
  carry:   { ... },   // both forearms up under a load at hip height
  work:    { ... },   // leaning in, elbows bent, hands in front at waist
  sit:     { ... },   // hips back, thigh -83, knee +89 (the seated pose the GLB got right)
  kneel:   { ... },
  prayer:  { ... },   // arms lifted and open, 1 Timothy 2:8 — not folded
};
```

**The hard requirement, in every pose:** the elbow is a rotation *relative to
the upper arm*. At rest the forearm hangs within about 20° of the upper arm's
direction and the hands sit beside the thighs. The current 50–70° forward stick
is the defect being fixed and §6 asserts against it explicitly.

### 4.4 Give the crowd's activities somewhere to go

Extend the activity → clip map in `sceneHumans.js:instantiate()`:

| activity | clip |
|---|---|
| `standing` | `idle` |
| `talking` | `talk` |
| `attending` | `listen` |
| `carrying` | `carry` (`walkCarry` while moving) |
| `working` | `work` |
| `sitting` | `sit` |
| `kneeling` | `kneel` |
| `praying`, `bowing` | `prayer` |

Keep the existing "fall back to `idle` if the clip is missing" guard.

### 4.5 Stop trusting the GLB's clips

`acceptAssets()` currently admits a model only if
`model.animations?.some(clip => clip.name === 'idle')`. That guard exists so a
primitive or failed GLB can never suppress a working fallback crowd — keep the
guard, change the test to the rig instead: the model has a `SkinnedMesh` whose
skeleton contains the bones in `RIG_DEFINITIONS['makehuman-mixamo-v1'].boneNames`.
Then build the clips from `sceneHumanClips.js` rather than reading
`model.animations`.

Update the mocks in `sceneHumans.test.js` and `sceneHumanAssets.test.js`, which
currently fabricate an `idle` clip to get past the gate.

---

## 5. Workstream C — a procedural layer, so nobody is a statue

**New file: `src/components/scene/sceneHumanPose.js`.**

Baked clips loop, and a loop that anyone stands next to for ten seconds reads as
a loop. A thin per-frame layer applied **after `mixer.update(dt)`** and before
render fixes that for a few hundred quaternion writes a frame.

Everything is seeded from the actor id (hash the string), so it is deterministic
and testable, and every actor gets its own rate multiplier in 0.9–1.1 so two
neighbours never breathe in step.

- **Breath** — Spine1 extension ±0.5° at ~0.22 Hz, plus a 3 mm Hips rise.
- **Weight shift** — the biggest "alive" tell for a standing figure. Every 4–9 s,
  shift the pelvis 2–3 cm laterally with a 2° list and a slight knee unlock on
  the unloaded side. Ease in and out; do not oscillate.
- **Head turn** — a damped random walk clamped to ±35° yaw and ±12° pitch with
  real dwell between glances. When the player is within 6 m and roughly in
  front, bias a glance toward them; being noticed is worth more than any amount
  of extra geometry.
- **Micro-sway** — ±0.4° of ankle and spine noise at ~0.15 Hz.

Declare a limit per channel and assert in tests that nothing exceeds it over a
long simulated run — an unbounded overlay is how a procedural layer turns into a
figure slowly rotating into the ground.

Under `reducedMotion` the overlay contributes exactly zero. Follow the existing
convention in `sceneHumans.update()`.

### 5.1 Frame-rate-independent turning

Replace `Math.min(1.0, delta * 5.0)` in
[sceneHumanAnimation.js:113](../src/components/scene/sceneHumanAnimation.js#L113):

```js
// Frame-rate independent, and capped at the rate a person actually pivots.
// The old `delta * 5` made a figure at 144fps turn four times slower than the
// same figure at 30.
const blend = 1 - Math.exp(-TURN_RATE * delta);
```

with `TURN_RATE ≈ 3.5 /s` and the angular step clamped to `2.2 * delta` rad.

### 5.2 Turn before walking

While the facing error exceeds ~60°, damp the walk blend to near zero so the
figure turns on the spot rather than crabbing sideways. With the route dwell
from §3 this happens naturally at the ends of a route.

### 5.3 Do not difference positions for gait distance

`sceneHumans.update()` computes `distanceMoved` by differencing
`currentPosition`, then feeds `actor.wasActive ? actor.distanceMoved : 0` to the
controller. An actor entering the active set therefore reports zero movement on
its first frame, snaps to the rest pose, and pops into `walk` on the next one.
Feed `sampleRoute`'s instantaneous `speed * dt` instead. It has no such gap, and
it is correct across the route wrap.

---

## 6. Workstream D — where people stand

All in `buildCapernaum.js` plus the placement helpers in `sceneFigures.js`.

### 6.1 Use the real floor

Import `floorAt` from `capernaumNavigation.js` and pass it to **both**
`createCrowd({ groundAt })` and `createSceneHumans({ floorAt })`, replacing the
two-level `groundAt` lambda. `createSceneHumans` already reads `floor.height`
from a `{ height, region }` return, and `floorAt` returns `null` outside the
village, so keep a simple fallback for that case. No import cycle:
`capernaumNavigation` pulls only `capernaumDimensions` and `sceneNavigation`.

This alone fixes the four shore villagers floating up to 0.52 m above the ramp,
and puts anyone near the synagogue on its podium instead of inside it.

### 6.2 Make `gather()` aware that other people exist

Extend `gather(random, centre, count, options)` in `sceneFigures.js` with:

- `clearAt(x, z)` — a predicate; reject any candidate where it is false. Callers
  pass `(x, z) => !blockerAt(x, z, 0)`.
- `minSeparation` — default **0.62 m**, twice the 0.3 m body radius that
  `queryClearance()` already uses. Rejection-sample, then run three or four
  relaxation passes pushing apart any pair still inside it.
- `floorAt` — resolve `y` per person, and reject a candidate whose floor differs
  from the group centre's by more than 0.15 m, so a knot never straddles the
  shore ramp or a step.
- `facing` — jitter widened, and an optional `faceAt: [x, z]` so a group can
  face the thing it is doing rather than its own middle.

Bound the rejection loop (`count * 40` guard, as `scatter()` already does) and
degrade by dropping a person rather than looping forever.

### 6.3 Knots, not rings

Add `knot(random, centre, size, options)` beside it: **2–4 people** on a
0.75–1.1 m ring, angles jittered, each facing the knot centre ±0.4 rad. That is
a conversation. Thirteen people facing one point is not.

Then a haunt becomes *several knots placed apart*, not one growing ring:

```js
// People stand in twos and threes, and the twos and threes stand apart. The
// shore used to be thirteen people in one 3m circle all facing the middle,
// which is the thing a village square is least like.
const HAUNTS = [
  { id: 'shore-nets',      at: [8, -16.5],  spread: 4.0, share: 0.16, faceAt: [8, -19] },
  { id: 'promenade-west',  at: [-14, -8],   spread: 3.0, share: 0.12 },
  { id: 'courtyard',       at: [24, 22.5],  spread: 2.0, share: 0.14, faceAt: [22, 20] },
  { id: 'synagogue-steps', at: [-19, 24],   spread: 1.7, share: 0.14, faceAt: [-19, 28] },
  { id: 'tax-booth-queue', at: [-48, 4],    spread: 1.7, share: 0.10, faceAt: [-52, 0] },
  { id: 'north-lane',      at: [30, 40],    spread: 3.5, share: 0.12 },
  { id: 'lane-crossing',   at: [0, 4],      spread: 3.5, share: 0.10 },
];
```

The `spread` values are bounded by the clear radius I measured at each centre —
`[8,-16.5]` 2.25 m, `[-14,-8]` 3.25 m, `[24,22.5]` 2.0 m, `[-19,24]` 1.75 m,
`[-48,4]` 1.75 m, `[30,40]` 3.75 m, `[0,4]` 3.75 m. The rejection sampler
enforces the rest; treat these as starting points and let the test in §7 settle
them.

Sub-centres within a haunt want ≥ 3.0 m between them, so knots read as separate
groups.

**Replace the distribution loop.** `HAUNTS[placed % HAUNTS.length]` is what
produced 13/4/7/12/10. Iterate the haunts explicitly and take each one's count
from its `share` of `standingCount`.

**Leave roughly 12% as loners** — individuals and pairs `scatter()`ed along the
lanes with facings drawn from the lane direction, not from any centre. A village
where every single person is in a huddle is as wrong as one where they are
evenly spaced.

### 6.4 Move the shore knot out of the doorway

The default vantage is `the-shore` at `[2, 1.15, -16]`, and the old shore haunt
sat at `[0, -10]` — six metres dead ahead of where every visitor spawns, which
is why it is the thing in the screenshot. `[8, -16.5]` puts it on the beach off
to the visitor's right, facing the water, which is also what "nets spread to
dry" should look like.

---

## 7. Tests

The 3D cannot be eyeballed, so these are the deliverable as much as the code is.
Baseline before starting: `npx vitest run src/components/scene/` → 21 files, 283
tests, all passing.

**`sceneRoutes.test.js`** (new)
- Instantaneous speed never exceeds the configured `speed`, and is within 1% of
  it through the cruise phase.
- Speed at both endpoints of a leg is ≈ 0.
- `moving` is false for exactly `2 × dwell` out of each period.
- `sampleRoute(plan, t)` equals `sampleRoute(plan, t + period)` — determinism.
- `along` is monotonic within a leg.
- A route shorter than `speed × ramp` degenerates to a triangle profile without
  NaN.

**`sceneHumanClips.test.js`** (new) — in the spirit of `buildTabernacle.test.js`,
which checks the tabernacle against Exodus. These check the gait against
biomechanics, and two of them are the defects being fixed:
- Every emitted quaternion is unit and finite; every track name resolves to a
  bone in the skeleton.
- **Forearms hang.** In `idle`, `walk` and `carry`, the forearm's model-space
  direction is within 30° of straight down. *(Currently 50.6°, 51.8°.)*
- **Feet do not skate.** Ankle fore-aft excursion over one `walk` cycle is
  within 10% of `walkMetersPerCycle / 2`. *(Currently 0.31 m against 0.575 m.)*
- **The body rises and falls.** Hips Y varies 3–6 cm over a cycle, with two
  minima. *(Currently 0.000 m.)*
- **Symmetry.** Left hip/knee/ankle at `p` equals right at `p + 0.5` within 0.5°.
- Hip flexion peaks in 18–26°, extension in 8–16°.
- Knee peak swing flexion in 55–70°, and never negative.
- Arm swing is opposite the ipsilateral leg (sign check) with 12–25° amplitude.
- **`idle` is not a photograph.** Over one loop at least one joint moves more
  than 2°. *(Currently 0.2°.)*
- The same author function against two different bind poses (artisan vs
  villager fixtures) yields model-space poses within 1° of each other — this is
  the guard against re-introducing §1.5.

**`sceneHumanPose.test.js`** (new)
- Same seed → same overlay; different actor ids diverge.
- No channel exceeds its declared limit over 120 s of simulated frames.
- `reducedMotion` contributes exactly zero.

**`buildCapernaum.test.js`** (extend) — these are the ones that currently fail:
- **No figure stands inside a blocker.** For every crowd figure at `t = 0`,
  `blockerAt(x, z, 0)` is `null`. *(Currently 9 violations.)*
- **Personal space.** Minimum pairwise horizontal distance among standing
  figures ≥ 0.62 m. *(Currently 0.08 m.)*
- **No huddle.** Single-linkage cluster at 2.0 m; no cluster exceeds 5 people.
  *(Currently 13.)*
- **A knot stands on one surface.** Within a cluster, `floorAt` heights differ
  by < 0.15 m.
- **Figures stand on the floor.** `|y − floorAt(x, z).height| < 0.05` for every
  figure. *(Currently up to 0.52 m off.)*
- **Every route is walkable.** 200 samples × lane extremes; `blockerAt` null
  throughout. *(Currently 3 of 5 routes fail, one at 53%.)*
- **Every route is walked at a human pace.** `speed ∈ [0.7, 1.6]` m/s for every
  route figure. *(Currently up to 5.6.)*
- Haunt occupancy is within ±2 of each haunt's `share`.

**`sceneHumans.test.js`** (extend)
- Gait phase advances by exactly 1.0 per `walkMetersPerCycle` of route distance.
- An actor leaving and re-entering the active set does not drop to the rest pose
  for a frame (§5.3).
- Turning is frame-rate independent: 60 steps of 1/60 s lands within 2° of 6
  steps of 1/6 s.

Also run `node scripts/validate-scene-humans.js` — it must stay green, because
the GLBs are untouched.

---

## 8. Order of work

Six commits, each independently green under `npm run lint` and
`npx vitest run src/components/scene/`.

1. **`sceneRoutes.js`, both consumers, real speeds, verified routes.** Add the
   route audit test first and watch it fail on the current `ROUTES`, then fix.
   This is the largest share of "they don't move naturally" and it lands on its
   own.
2. **Real `floorAt` for the Capernaum crowds.** Small, and stops people
   hovering.
3. **Crowd distribution — knots, separation, clearance, loners.** This is the
   screenshot.
4. **`sceneHumanClips.js` and the wiring in `acceptAssets`.** The arms and the
   gait.
5. **`sceneHumanPose.js`, the turn rate, the gait-distance source.** The last of
   the statue.
6. **Docs.** Update `docs/scene-humans-progress.md` — its "Not claimed complete"
   list should gain foot-plant accuracy and lose whatever this actually
   delivers, and the blink note from §1.6 belongs there since it is dead code
   the tests currently make look alive.

Commits 1–3 are independent of 4–5 and can be done in either order; 3 depends on 2.

---

## 9. What to hand back for eyeballing

Tests cannot reach these. Name them in the final message rather than trying to
check them:

- **The shore knot on entry.** Spawn at `the-shore` and turn around. The group
  should read as two or three separate conversations off to the right, not one
  ring. The `spread` of the `shore-nets` haunt is the number most likely to want
  a tweak.
- **A walker at close range, side on.** Watch the feet. Any residual skate means
  the authored stride and `walkMetersPerCycle` have drifted apart; the test
  catches gross mismatch but not the last 10%.
- **A walker reaching the end of a route.** It should stop, turn, and set off —
  the `DWELL` and `RAMP` constants set that rhythm and are pure taste.
- **Arms at conversational distance**, especially `talk` and `prayer`. The pose
  table is the fix but the exact angles are judgement.
- **Two people standing next to each other for ten seconds.** If they breathe or
  shift weight in step, the per-actor rate multiplier in `sceneHumanPose.js`
  needs widening.

---

## 10. Noted, out of scope

Real but not part of this ask; raise them, do not fix them here.

- **`heightMeters: 1.70` in `sceneHumanManifest.js` is wrong for two of three
  models and nothing reads it.** Measured from mesh bounds: artisan 1.77 m,
  villager 1.50 m, traveler 1.68 m. With `scale: 0.92–1.07` on top, the villager
  renders 1.38–1.60 m. Fixable at runtime with a per-variant scale; no rebuild
  needed.
- **`placement.props` is declared and never instantiated.** Every Capernaum
  placement lists props with sockets, but `RIG_DEFINITIONS.sockets` is `{}` and
  no code reads the field. The mending shuttle, hopper handle and water-skin
  harness do not exist.
- **`updateBlink()` is dead** (§1.6) and its tests certify only a synthetic mesh.
- **`build_characters.py`'s `set_world_rotation()` is the root cause of §1.5 and
  is still in the tree.** Whoever next has Blender should fix it there too, or
  delete the clip authoring from it now that the clips live in JS.
