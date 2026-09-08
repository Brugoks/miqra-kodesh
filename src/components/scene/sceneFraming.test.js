import { describe, it, expect } from 'vitest';
import {
  defaultFov, defaultFovForElement, maxFov, maxFovForElement, horizontalFov, clampFov,
  FOV_MIN, FOV_MAX, FOV_MAX_NARROW, REFERENCE_ASPECT, REFERENCE_FOV,
} from './sceneFraming';

// The screens this actually has to survive, as width/height.
const LAPTOP = 1440 / 900; // 16:10, the shape the vantages were framed on
const DESKTOP = 2560 / 1440;
const TABLET_LANDSCAPE = 1024 / 768;
const TABLET_PORTRAIT = 768 / 1024;
const PHONE_PORTRAIT = 390 / 844; // iPhone 14, the worst case
const PHONE_LANDSCAPE = 844 / 390;

const ALL = [DESKTOP, PHONE_LANDSCAPE, LAPTOP, TABLET_LANDSCAPE, TABLET_PORTRAIT, PHONE_PORTRAIT];

describe('scene framing', () => {
  it('leaves the authored framing alone on the screen it was authored for', () => {
    expect(defaultFov(LAPTOP)).toBe(REFERENCE_FOV);
    expect(defaultFov(REFERENCE_ASPECT)).toBe(REFERENCE_FOV);
  });

  it('does not letterbox a wide monitor by narrowing the vertical field', () => {
    // Matching the horizontal field in both directions would cost a very wide
    // screen its sky and its floor. Wider than the reference keeps 60°.
    expect(defaultFov(DESKTOP)).toBe(REFERENCE_FOV);
    expect(defaultFov(PHONE_LANDSCAPE)).toBe(REFERENCE_FOV);
  });

  it('widens the vertical field as a viewport gets narrower', () => {
    const fovs = [TABLET_LANDSCAPE, TABLET_PORTRAIT, PHONE_PORTRAIT].map((a) => defaultFov(a));
    expect(fovs[0]).toBeGreaterThan(REFERENCE_FOV);
    expect(fovs[1]).toBeGreaterThanOrEqual(fovs[0]);
    expect(fovs[2]).toBeGreaterThanOrEqual(fovs[1]);
  });

  it('recovers real horizontal context on a portrait phone', () => {
    // The bug, stated as a number: at a fixed 60° a portrait phone sees under
    // 30° of the world across, which at the close standpoints — two metres from
    // the veil, or from the tax booth — is one person's shoulders.
    const before = horizontalFov(REFERENCE_FOV, PHONE_PORTRAIT);
    const after = horizontalFov(defaultFov(PHONE_PORTRAIT), PHONE_PORTRAIT);
    expect(before).toBeLessThan(30);
    expect(after).toBeGreaterThan(45);
    expect(after / before).toBeGreaterThan(1.6);
  });

  it('never widens a narrow screen past what the reference screen itself sees', () => {
    // Widening stops at "as much as the laptop shows", never overshoots into a
    // lens the scene was not drawn for. Screens wider than the reference are
    // not widened at all — they already see more across at 60°, which is the
    // shape the vantages were composed for, not something to correct.
    const reference = horizontalFov(REFERENCE_FOV, REFERENCE_ASPECT);
    for (const aspect of ALL.filter((a) => a < REFERENCE_ASPECT)) {
      expect(horizontalFov(defaultFov(aspect), aspect)).toBeLessThanOrEqual(reference + 1e-9);
      // The ceiling may sit wherever FOV_MAX already put it — no screen loses
      // range — but the widening never adds field beyond the reference.
      expect(horizontalFov(maxFov(aspect), aspect)).toBeLessThanOrEqual(
        Math.max(reference, horizontalFov(FOV_MAX, aspect)) + 1e-9,
      );
    }
    expect(horizontalFov(defaultFov(DESKTOP), DESKTOP)).toBeGreaterThan(reference);
  });

  it('starts every viewport fully zoomed out where it had to widen at all', () => {
    // The point of the clamp: a phone opens at its own zoom-out stop, so the
    // pinch can only ever zoom in from there.
    expect(defaultFov(PHONE_PORTRAIT)).toBe(maxFov(PHONE_PORTRAIT));
    expect(defaultFov(TABLET_PORTRAIT)).toBe(maxFov(TABLET_PORTRAIT));
    expect(defaultFov(PHONE_PORTRAIT)).toBe(FOV_MAX_NARROW);
  });

  it('lets a portrait screen zoom out further than a landscape one, never less', () => {
    // A tall screen can afford more vertical field, because the projection's
    // edge stretch lands in floor and sky rather than across a colonnade.
    expect(maxFov(PHONE_PORTRAIT)).toBeGreaterThan(maxFov(PHONE_LANDSCAPE));
    for (const aspect of ALL) {
      // No screen loses zoom range it had before this existed.
      expect(maxFov(aspect)).toBeGreaterThanOrEqual(FOV_MAX);
      expect(maxFov(aspect)).toBeLessThanOrEqual(FOV_MAX_NARROW);
    }
    expect(maxFov(LAPTOP)).toBe(FOV_MAX);
    expect(maxFov(DESKTOP)).toBe(FOV_MAX);
  });

  it('never returns a field the visitor could not have pinched to', () => {
    for (let a = 0.3; a <= 3; a += 0.05) {
      const fov = defaultFov(a);
      expect(fov).toBeGreaterThanOrEqual(FOV_MIN);
      expect(fov).toBeLessThanOrEqual(maxFov(a));
    }
  });

  it('clamps a pinch to the range of the screen it happened on', () => {
    expect(clampFov(1, LAPTOP)).toBe(FOV_MIN);
    expect(clampFov(1000, LAPTOP)).toBe(FOV_MAX);
    expect(clampFov(1000, PHONE_PORTRAIT)).toBe(FOV_MAX_NARROW);
    expect(clampFov(55, PHONE_PORTRAIT)).toBe(55);
    // A portrait zoom-out carried into landscape by a rotation has to come
    // back inside landscape's narrower range rather than staying fisheyed.
    expect(clampFov(FOV_MAX_NARROW, PHONE_LANDSCAPE)).toBe(FOV_MAX);
    // No aspect at all is the conservative case, not the permissive one.
    expect(clampFov(1000)).toBe(FOV_MAX);
  });

  it('falls back to the reference framing when the viewport has no shape yet', () => {
    // Before layout, and in jsdom, an element measures zero. Guessing wide
    // there would hand a laptop a fisheye on the first frame.
    expect(defaultFov(0)).toBe(REFERENCE_FOV);
    expect(defaultFov(NaN)).toBe(REFERENCE_FOV);
    expect(defaultFov(-1)).toBe(REFERENCE_FOV);
    expect(defaultFovForElement(null)).toBe(REFERENCE_FOV);
    expect(defaultFovForElement({ clientWidth: 0, clientHeight: 0 })).toBe(REFERENCE_FOV);
    expect(maxFovForElement(null)).toBe(FOV_MAX);
  });

  it('measures an element the same way it measures a ratio', () => {
    expect(defaultFovForElement({ clientWidth: 390, clientHeight: 844 }))
      .toBe(defaultFov(PHONE_PORTRAIT));
    expect(defaultFovForElement({ clientWidth: 1440, clientHeight: 900 }))
      .toBe(defaultFov(LAPTOP));
    expect(maxFovForElement({ clientWidth: 390, clientHeight: 844 }))
      .toBe(maxFov(PHONE_PORTRAIT));
  });

  it('agrees with itself about what a horizontal field is', () => {
    // A square viewport is the one place vertical and horizontal coincide.
    expect(horizontalFov(60, 1)).toBeCloseTo(60, 6);
    expect(horizontalFov(60, 0)).toBe(0);
  });
});
