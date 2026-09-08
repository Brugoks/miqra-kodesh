// How much of the world the camera shows, which is not a matter of taste on a
// phone the way it is on a laptop.
//
// A three.js perspective camera's `fov` is *vertical*, but "I can't see what is
// going on" is a complaint about the *horizontal* field. Those two are the same
// number only at one aspect ratio, and the vantages in every scene manifest
// were framed on a landscape screen. Hold the vertical fov at 60° and hand the
// same vantage to a portrait phone at 9:19.5 and the horizontal field collapses
// from about 85° to under 30° — a keyhole. Nothing is wrong with where the
// visitor is standing; they are looking through a much longer lens than the
// scene was written for, and it shows worst exactly where the standpoint is
// closest: two metres from the veil, or from Levi's tax booth, thirty degrees
// across is one person's shoulders.
//
// So both the default and the zoom-out limit are derived from the aspect
// rather than fixed. Widen the vertical field until the horizontal one matches
// what the same vantage gives on the reference screen; the honest answer to
// that on a phone is past 120°, which would bow the architecture, so it is
// clamped. Because the default lands on that clamp, a phone starts fully zoomed
// out and the visitor's pinch can only ever zoom in from there — which is the
// right way round for a device whose problem is seeing too little.

// The screen the vantages were composed on. Anything wider than this keeps the
// framing as written; only narrower screens are compensated.
export const REFERENCE_ASPECT = 16 / 10;
export const REFERENCE_FOV = 60;

export const FOV_MIN = 32;
// The widest a landscape screen goes, unchanged: at 16:10 this is already a
// 96° horizontal field and any more of it bows the colonnades.
export const FOV_MAX = 78;
// ...and the widest a portrait one does. A tall screen can afford more vertical
// field than a wide one, because the stretch a rectilinear projection puts at
// the edges lands in floor and sky rather than across the building. At 100° on
// a 9:19.5 phone the extreme corner sits 53° off axis — about a 17mm lens —
// which is wide, and still only 58° across: short of the 85° the reference
// screen sees, so this is recovering the keyhole rather than overshooting it.
// This is the one number to turn down if a phone starts reading as a fisheye.
export const FOV_MAX_NARROW = 100;

const RAD = Math.PI / 180;

// The horizontal field a given vertical fov actually yields at an aspect.
// Exported because it is the number this whole module is really about, and the
// only one worth asserting against.
export function horizontalFov(fov, aspect) {
  if (!Number.isFinite(fov) || !Number.isFinite(aspect) || aspect <= 0) return 0;
  return (2 * Math.atan(Math.tan((fov * RAD) / 2) * aspect)) / RAD;
}

// The vertical fov that would reproduce the reference screen's horizontal
// field on a viewport of this shape. Unclamped, and unusable as-is on a phone —
// everything below is about how far towards it we are willing to go.
function matchedFov(aspect, referenceFov, referenceAspect) {
  const wanted = Math.tan((referenceFov * RAD) / 2) * referenceAspect;
  return (2 * Math.atan(wanted / aspect)) / RAD;
}

const usable = (aspect) => Number.isFinite(aspect) && aspect > 0;

// The widest this viewport is allowed to go — the zoom-out stop as well as, by
// construction, the default. Never below FOV_MAX, so no screen loses zoom range
// it had before; never above the fov that matches the reference horizontally,
// so widening always stops at "as much as the laptop sees" rather than
// overshooting into a lens the scene was never drawn for.
export function maxFov(aspect, {
  referenceFov = REFERENCE_FOV,
  referenceAspect = REFERENCE_ASPECT,
} = {}) {
  if (!usable(aspect) || aspect >= referenceAspect) return FOV_MAX;
  const matched = matchedFov(aspect, referenceFov, referenceAspect);
  return Math.min(FOV_MAX_NARROW, Math.max(FOV_MAX, matched));
}

// Keeps a pinch or a scroll inside this viewport's range.
export function clampFov(fov, aspect) {
  return Math.min(maxFov(aspect), Math.max(FOV_MIN, fov));
}

// The vertical fov to start a scene at on a viewport of this shape. Never
// narrower than the reference — a very wide monitor keeps 60° rather than
// losing the sky and the floor to a letterbox.
export function defaultFov(aspect, options = {}) {
  const { referenceFov = REFERENCE_FOV, referenceAspect = REFERENCE_ASPECT } = options;
  if (!usable(aspect) || aspect >= referenceAspect) return referenceFov;
  return Math.min(
    maxFov(aspect, options),
    Math.max(FOV_MIN, matchedFov(aspect, referenceFov, referenceAspect)),
  );
}

// The same questions asked of a DOM element. Before layout — and in jsdom,
// which never lays anything out — the element measures zero, and the reference
// framing is the right answer to give.
const aspectOf = (el) => {
  const width = el?.clientWidth || 0;
  const height = el?.clientHeight || 0;
  return height > 0 ? width / height : 0;
};

export const defaultFovForElement = (el) => defaultFov(aspectOf(el));
export const maxFovForElement = (el) => maxFov(aspectOf(el));
