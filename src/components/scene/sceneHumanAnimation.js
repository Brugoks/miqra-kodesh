// Locomotion state machine and distance-synchronized skeletal animation.
// Translates physical traveled distance to skeletal walk cycles, schedules asynchronous
// Poisson blinks, subtle breath sway, and crossfades state transitions.

/**
 * Controller for an individual human actor's animation and behavioral state.
 */
export class HumanAnimationController {
  // Exponential turn-rate constant (1/s) and a hard cap on angular speed
  // (rad/s) so a large facing change eases in rather than snapping.
  static TURN_RATE = 3.5;

  static MAX_TURN_STEP = 2.2;

  constructor({
    mixer,
    clips = {},
    morphMesh = null,
    morphNames = { blinkLeft: 'blink_L', blinkRight: 'blink_R' },
    locomotion = { walkMetersPerCycle: 1.25 },
    reducedMotion = false,
  }) {
    this.mixer = mixer;
    this.actions = {};
    this.currentActionName = null;
    this.morphMesh = morphMesh;
    this.morphNames = morphNames;
    this.locomotion = locomotion;
    this.reducedMotion = reducedMotion;

    // Blink schedule
    this.nextBlinkTime = 1.5 + Math.random() * 3.0;
    this.blinkDuration = 0.16;
    this.blinkProgress = 0;
    this.isBlinking = false;

    // Locomotion accumulation
    this.travelledDistance = 0;
    this.walkCyclePhase = 0;

    // State machine
    this.restAction = 'idle';
    this.state = 'idle'; // 'idle', 'walk', 'turn', 'work'
    this.turnDuration = 0.8;
    this.turnElapsed = 0;
    this.targetFacing = 0;
    this.currentFacing = 0;

    // Initialize animation actions
    for (const [name, clip] of Object.entries(clips)) {
      if (clip && this.mixer) {
        const action = this.mixer.clipAction(clip);
        this.actions[name] = action;
      }
    }
  }

  /**
   * Transitions to a named clip with crossfading.
   * @param {string} name
   * @param {number} fadeDuration
   */
  transitionTo(name, fadeDuration = 0.25) {
    if (this.currentActionName === name) return;
    const nextAction = this.actions[name];
    if (!nextAction) return;

    if (this.currentActionName && this.actions[this.currentActionName]) {
      const prevAction = this.actions[this.currentActionName];
      prevAction.fadeOut(fadeDuration);
    }

    nextAction.reset().fadeIn(fadeDuration).play();
    this.currentActionName = name;
  }

  /**
   * Updates state, gait, blinks, and procedural posture.
   * @param {number} delta Seconds elapsed since last frame
   * @param {number} distanceTraveled Distance moved this frame in meters
   * @param {number} targetFacing Intended orientation
   */
  update(delta, distanceTraveled = 0, targetFacing = this.currentFacing) {
    if (this.reducedMotion) {
      if (this.currentActionName !== 'idle' && this.actions['idle']) {
        this.transitionTo('idle', 0.1);
      }
      return;
    }

    // 1. Locomotion & State Selection
    if (distanceTraveled > 0.001) {
      this.state = 'walk';
      this.transitionTo('walk', 0.2);

      // Advance gait phase based on physical meters traveled
      const metersPerCycle = this.locomotion.walkMetersPerCycle || 1.25;
      this.travelledDistance += distanceTraveled;
      this.walkCyclePhase = (this.travelledDistance / metersPerCycle) % 1.0;

      // Synchronize walk action time to physical gait
      const walkAction = this.actions['walk'];
      if (walkAction && walkAction.getClip()) {
        walkAction.paused = true; // The mixer must not advance this distance-driven clip again.
        const clipDuration = walkAction.getClip().duration;
        walkAction.time = this.walkCyclePhase * clipDuration;
      }
    } else if (this.state === 'walk') {
      this.state = 'idle';
      this.transitionTo(this.restAction, 0.3);
    }

    // 2. Smooth Facing Turn
    let facingDiff = targetFacing - this.currentFacing;
    while (facingDiff > Math.PI) facingDiff -= Math.PI * 2;
    while (facingDiff < -Math.PI) facingDiff += Math.PI * 2;

    if (Math.abs(facingDiff) > 0.01) {
      // Frame-rate independent (exponential decay: the fraction of the
      // remaining turn covered depends only on total elapsed time, not on
      // how many steps it was split into), and capped at a rate a person
      // actually pivots at. The old `delta * 5` was a fraction-per-frame
      // with no time unit, which made a figure at 144fps turn four times
      // slower than the same figure at 30fps.
      const blend = 1 - Math.exp(-HumanAnimationController.TURN_RATE * delta);
      const maxStep = HumanAnimationController.MAX_TURN_STEP * delta;
      const step = Math.sign(facingDiff) * Math.min(Math.abs(facingDiff) * blend, maxStep);
      this.currentFacing += step;
    }

    // 3. Procedural Poisson Blinking
    this.updateBlink(delta);
  }

  /**
   * Updates morph targets for natural asynchronous blinks.
   * @param {number} delta
   */
  updateBlink(delta) {
    if (!this.morphMesh || !this.morphMesh.morphTargetDictionary || !this.morphMesh.morphTargetInfluences) {
      return;
    }

    const dict = this.morphMesh.morphTargetDictionary;
    const influences = this.morphMesh.morphTargetInfluences;
    const leftIdx = dict[this.morphNames.blinkLeft];
    const rightIdx = dict[this.morphNames.blinkRight];

    if (leftIdx === undefined && rightIdx === undefined) return;

    if (!this.isBlinking) {
      this.nextBlinkTime -= delta;
      if (this.nextBlinkTime <= 0) {
        this.isBlinking = true;
        this.blinkProgress = 0;
      }
    } else {
      this.blinkProgress += delta / this.blinkDuration;
      if (this.blinkProgress >= 1.0) {
        this.isBlinking = false;
        this.nextBlinkTime = 2.0 + Math.random() * 4.0; // Random interval 2–6s
        if (leftIdx !== undefined) influences[leftIdx] = 0;
        if (rightIdx !== undefined) influences[rightIdx] = 0;
      } else {
        // Quick blink curve: sin(progress * PI)
        const weight = Math.sin(this.blinkProgress * Math.PI);
        if (leftIdx !== undefined) influences[leftIdx] = weight;
        if (rightIdx !== undefined) influences[rightIdx] = weight;
      }
    }
  }

  /**
   * Stops all animations and releases references.
   */
  dispose() {
    for (const action of Object.values(this.actions)) {
      action.stop();
    }
    this.actions = {};
    this.mixer = null;
    this.morphMesh = null;
  }
}
