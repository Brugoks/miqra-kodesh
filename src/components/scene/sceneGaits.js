// How fast a visitor moves, and how the body shows it.
//
// Three paces, chosen by the visitor and kept on the device:
//
//   natural  1.6 m/s   a stroll: the speed these places were reconstructed to be
//                      looked at from, and the default where the whole place can
//                      be taken in from the middle
//   brisk    3.6 m/s   a purposeful walk: the default where the place is big
//                      enough to need one (a scene's `defaultPace`)
//   travel   per scene the pace for covering ground: a place a kilometre across
//                      takes half an hour at a stroll, which is not exploring
//
// Shift is still a momentary jog on top of any of them. `travel` is a mode, not
// a key held down, so that it can be a button on a phone — there is no Shift on
// a thumbstick — and a single key (F) on a keyboard.
//
// Seen from behind, the figure has a walk and a jog and no sprint, and its legs
// cycle by distance covered: faster than a jog and they only blur. So in the
// third-person view a pace is capped at the jog (JOG_SPEED), and the labels say
// what the visitor is actually getting rather than what the setting could give
// in the other view.
//
// Pure arithmetic, no React and no three.js, so the numbers are tested.

import { JOG_SPEED } from './sceneThirdPerson';

export const NATURAL_WALK_SPEED = 1.6;
export const BRISK_WALK_SPEED = 3.6;
export const RUN_SPEED = 8.5;
// What a scene gets unless its row in sceneModules.js says otherwise.
export const DEFAULT_TRAVEL_SPEED = 5.5;

export const PACES = ['natural', 'brisk', 'travel'];
export const DEFAULT_PACE = 'natural';
export const PACE_KEY = 'miqra_scene_pace';

// Metres per footfall, at a walk. The cycle is measured in distance so the
// cadence is right at any speed; faster than a brisk walk the stride lengthens
// (a runner covers more ground per step, not more steps per second) up to
// STRIDE_AT_RUN of this at RUN_SPEED, which keeps a travel pace from bobbing the
// camera nine times a second.
export const STRIDE = 0.82;
export const STRIDE_AT_RUN = 1.55;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export const isPace = (value) => PACES.includes(value);

// A scene's travel speed from what its row in sceneModules.js asks for (a
// number, not the row: handed the row, React's compiler must assume it is
// mutated): what it asks for if that is a speed worth the name, else the
// default. Never slower than a brisk walk (it would not be a faster mode) and
// never faster than the run.
export function travelSpeedOf(asked) {
  if (!Number.isFinite(asked)) return DEFAULT_TRAVEL_SPEED;
  return clamp(asked, BRISK_WALK_SPEED + 0.4, RUN_SPEED);
}

// The most a body can show in this view.
export const topSpeed = ({ third = false } = {}) => (third ? JOG_SPEED : RUN_SPEED);

// Metres per second at a pace, in a view: the steady speed with no key held.
export function paceSpeed(pace, { travelSpeed = DEFAULT_TRAVEL_SPEED, third = false } = {}) {
  if (pace === 'travel') return Math.min(travelSpeed, topSpeed({ third }));
  if (pace === 'brisk') return BRISK_WALK_SPEED;
  return NATURAL_WALK_SPEED;
}

// The same, with plain arguments, for a label drawn while rendering: React's
// compiler will not keep manual memoization elsewhere in a component that hands
// an object literal to a function from JSX.
export const paceSpeedAt = (pace, travelSpeed, third) => paceSpeed(pace, { travelSpeed, third });

// What the visitor is aiming at this frame: the pace's speed, or the jog or run
// while Shift is down.
export function targetSpeed({
  pace, running = false, third = false, travelSpeed = DEFAULT_TRAVEL_SPEED,
}) {
  if (running) return topSpeed({ third });
  return paceSpeed(pace, { travelSpeed, third });
}

// Whether the body should look like it is hurrying — the field-of-view kick,
// the harder footfall, the heavier bob, the figure's jog. A jog or the travel
// pace.
export const isFast = ({ pace, running = false }) => running || pace === 'travel';

// Speed eases between paces rather than switching, so toggling the fast walk
// mid-stride is a surge and not a lurch. Standing still it snaps: the first
// step after a pause starts at the pace, as it always has, because a stick
// released and pushed again should not have to accelerate from a standstill.
export const ACCELERATION = 14; // m/s per second
export function approachSpeed(current, target, dt, moving = true) {
  if (!moving || !Number.isFinite(current)) return target;
  const step = ACCELERATION * Math.max(0, dt);
  if (current < target) return Math.min(target, current + step);
  return Math.max(target, current - step);
}

// Metres per footfall at a speed.
export function strideFor(speed) {
  const grown = clamp((speed - BRISK_WALK_SPEED) / (RUN_SPEED - BRISK_WALK_SPEED), 0, 1);
  return STRIDE * (1 + (STRIDE_AT_RUN - 1) * grown);
}

// The pace the one-touch toggle goes to: the fast walk, or back to whichever
// pace the visitor was on before it.
export function togglePace(current, before = DEFAULT_PACE) {
  if (current === 'travel') return isPace(before) && before !== 'travel' ? before : DEFAULT_PACE;
  return 'travel';
}

// What a label should say: the speed in the units the settings use.
export const formatSpeed = (speed) => `${(Math.round(speed * 10) / 10).toString()} m/s`;

// How long a distance takes at a pace, in whole minutes (at least one), for the
// statement a scene can make about itself.
export const minutesToCover = (metres, speed) => Math.max(1, Math.round(metres / speed / 60));

// --- keeping the choice on the device ------------------------------------------------
// Only a pace the visitor chose is kept: a scene's own default (sceneModules.js
// defaultPace — brisk where the place is big) applies until they say otherwise,
// and is never written down as though they had. An explicit choice wins over
// any scene's default. Every read and write is guarded: private windows,
// blocked storage and preview captures all throw, and the scene must run
// without it.
export function getStoredPace(fallback = DEFAULT_PACE) {
  const unset = isPace(fallback) ? fallback : DEFAULT_PACE;
  try {
    const value = window.localStorage.getItem(PACE_KEY);
    return isPace(value) ? value : unset;
  } catch {
    return unset;
  }
}

export function storePace(pace) {
  if (!isPace(pace)) return;
  try {
    window.localStorage.setItem(PACE_KEY, pace);
  } catch {
    // Not remembered: still the pace for this visit.
  }
}
