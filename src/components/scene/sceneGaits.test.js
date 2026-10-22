import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  NATURAL_WALK_SPEED, BRISK_WALK_SPEED, RUN_SPEED, DEFAULT_TRAVEL_SPEED, PACES, DEFAULT_PACE, PACE_KEY,
  STRIDE, STRIDE_AT_RUN, ACCELERATION,
  travelSpeedOf, topSpeed, paceSpeed, paceSpeedAt, targetSpeed, isFast, approachSpeed, strideFor, togglePace,
  formatSpeed, minutesToCover, getStoredPace, storePace, isPace,
} from './sceneGaits';
import { JOG_SPEED } from './sceneThirdPerson';
import {
  travelSpeedFor, defaultPaceFor, knownSceneSlugs, sceneModule,
} from './sceneModules';
import { circuitLength } from './nehemiahWalls';

// The fast walk exists because a place a kilometre across takes half an hour at
// a stroll. These hold the arithmetic that makes it a faster mode and not a
// louder one: it is always faster than a brisk walk, never faster than the body
// can show, eases rather than lurches, and is a number a scene asks for by its
// size.

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('the paces', () => {
  it('are three, each faster than the one before, and the default is the stroll', () => {
    expect(PACES).toEqual(['natural', 'brisk', 'travel']);
    expect(DEFAULT_PACE).toBe('natural');
    const speeds = PACES.map((pace) => paceSpeed(pace));
    expect(speeds).toEqual([...speeds].sort((a, b) => a - b));
    expect(new Set(speeds).size).toBe(3);
    expect(paceSpeed('natural')).toBe(NATURAL_WALK_SPEED);
    expect(paceSpeed('brisk')).toBe(BRISK_WALK_SPEED);
    expect(paceSpeed('travel')).toBe(DEFAULT_TRAVEL_SPEED);
  });

  it('gives the travel pace the scene asks for, and never more than the body can show', () => {
    expect(paceSpeed('travel', { travelSpeed: 8 })).toBe(8);
    // Seen from behind there is a jog and no sprint: the pace is capped there.
    expect(paceSpeed('travel', { travelSpeed: 8, third: true })).toBe(JOG_SPEED);
    expect(topSpeed({ third: true })).toBe(JOG_SPEED);
    expect(topSpeed({ third: false })).toBe(RUN_SPEED);
    // The slower paces are the same from either side.
    for (const third of [false, true]) {
      expect(paceSpeed('natural', { third })).toBe(NATURAL_WALK_SPEED);
      expect(paceSpeed('brisk', { third })).toBe(BRISK_WALK_SPEED);
    }
  });

  it('keeps even the capped travel pace above a brisk walk, or it would not be a faster mode', () => {
    expect(JOG_SPEED).toBeGreaterThan(BRISK_WALK_SPEED);
    expect(paceSpeed('travel', { travelSpeed: 6, third: true })).toBeGreaterThan(BRISK_WALK_SPEED);
  });

  it('takes a scene’s ask only if it is a speed worth the name', () => {
    expect(travelSpeedOf(undefined)).toBe(DEFAULT_TRAVEL_SPEED);
    expect(travelSpeedOf(null)).toBe(DEFAULT_TRAVEL_SPEED);
    expect(travelSpeedOf('fast')).toBe(DEFAULT_TRAVEL_SPEED);
    expect(travelSpeedOf(NaN)).toBe(DEFAULT_TRAVEL_SPEED);
    expect(travelSpeedOf(7)).toBe(7);
    // Never slower than a brisk walk, never faster than the run.
    expect(travelSpeedOf(1)).toBeGreaterThan(BRISK_WALK_SPEED);
    expect(travelSpeedOf(40)).toBe(RUN_SPEED);
  });

  it('is the same arithmetic with plain arguments as with an object', () => {
    for (const pace of PACES) {
      for (const third of [false, true]) {
        expect(paceSpeedAt(pace, 7, third)).toBe(paceSpeed(pace, { travelSpeed: 7, third }));
      }
    }
  });
});

describe('what the visitor is aiming at', () => {
  it('is the pace’s speed, or the jog or run while Shift is down', () => {
    expect(targetSpeed({ pace: 'natural', travelSpeed: 8 })).toBe(NATURAL_WALK_SPEED);
    expect(targetSpeed({ pace: 'travel', travelSpeed: 8 })).toBe(8);
    expect(targetSpeed({ pace: 'natural', running: true })).toBe(RUN_SPEED);
    expect(targetSpeed({ pace: 'natural', running: true, third: true })).toBe(JOG_SPEED);
    // Shift is never slower than the pace it is held over.
    for (const pace of PACES) {
      for (const third of [false, true]) {
        expect(targetSpeed({ pace, running: true, third, travelSpeed: 8 })).toBeGreaterThanOrEqual(targetSpeed({ pace, third, travelSpeed: 8 }));
      }
    }
  });

  it('hurries — the lens, the footfall, the figure’s jog — for a jog or the travel pace, not before', () => {
    expect(isFast({ pace: 'natural' })).toBe(false);
    expect(isFast({ pace: 'brisk' })).toBe(false);
    expect(isFast({ pace: 'travel' })).toBe(true);
    expect(isFast({ pace: 'natural', running: true })).toBe(true);
  });
});

describe('easing between paces', () => {
  it('starts a step from standing still at the pace, as it always has', () => {
    expect(approachSpeed(1.6, 8, 0.016, false)).toBe(8);
    expect(approachSpeed(NaN, 8, 0.016, true)).toBe(8);
  });

  it('surges to a new pace rather than lurching to it, in both directions, and never overshoots', () => {
    let speed = 1.6;
    const seen = [speed];
    for (let i = 0; i < 120 && speed !== 8; i += 1) {
      speed = approachSpeed(speed, 8, 1 / 60, true);
      seen.push(speed);
    }
    expect(speed).toBe(8);
    expect(seen.every((value, i) => i === 0 || value > seen[i - 1])).toBe(true);
    expect(Math.max(...seen)).toBe(8);
    // About half a second for the whole gap: quick, and not a switch.
    expect(seen.length / 60).toBeGreaterThan(0.3);
    expect(seen.length / 60).toBeLessThan(0.8);
    for (let i = 0; i < 200 && speed !== 1.6; i += 1) speed = approachSpeed(speed, 1.6, 1 / 60, true);
    expect(speed).toBe(1.6);
    expect((8 - 1.6) / ACCELERATION).toBeCloseTo(seen.length / 60, 0);
  });

  it('does nothing on a frame of no time, and survives a long one', () => {
    expect(approachSpeed(3, 8, 0, true)).toBe(3);
    expect(approachSpeed(3, 8, 10, true)).toBe(8);
  });
});

describe('the stride', () => {
  it('is the walk’s up to a brisk walk, then lengthens, so a fast walk does not bob nine times a second', () => {
    expect(strideFor(NATURAL_WALK_SPEED)).toBe(STRIDE);
    expect(strideFor(BRISK_WALK_SPEED)).toBe(STRIDE);
    expect(strideFor(RUN_SPEED)).toBeCloseTo(STRIDE * STRIDE_AT_RUN, 9);
    let last = STRIDE;
    for (let speed = BRISK_WALK_SPEED; speed <= RUN_SPEED; speed += 0.25) {
      expect(strideFor(speed)).toBeGreaterThanOrEqual(last);
      last = strideFor(speed);
    }
    // Footfalls a second at the scene’s fastest pace: fewer than the old fixed
    // stride gave, and not a buzz.
    const footfalls = (speed) => speed / strideFor(speed);
    expect(footfalls(8)).toBeLessThan(8 / STRIDE);
    expect(footfalls(8)).toBeLessThan(7);
    // And a faster pace is still more footfalls than a slower one.
    expect(footfalls(8)).toBeGreaterThan(footfalls(BRISK_WALK_SPEED));
  });
});

describe('the toggle', () => {
  it('goes to the fast walk, and back to the pace it interrupted', () => {
    expect(togglePace('natural', 'natural')).toBe('travel');
    expect(togglePace('brisk', 'brisk')).toBe('travel');
    expect(togglePace('travel', 'brisk')).toBe('brisk');
    expect(togglePace('travel', 'natural')).toBe('natural');
  });

  it('never gets stuck: a bad or missing memory falls back to the stroll', () => {
    expect(togglePace('travel', undefined)).toBe('natural');
    expect(togglePace('travel', 'sprint')).toBe('natural');
    expect(togglePace('travel', 'travel')).toBe('natural');
    expect(togglePace('nonsense', 'brisk')).toBe('travel');
  });
});

describe('remembering the pace', () => {
  it('keeps the choice on the device', () => {
    expect(getStoredPace()).toBe('natural');
    storePace('brisk');
    expect(window.localStorage.getItem(PACE_KEY)).toBe('brisk');
    expect(getStoredPace()).toBe('brisk');
    storePace('travel');
    expect(getStoredPace()).toBe('travel');
  });

  it('ignores a stored value it does not know, and refuses to store one', () => {
    window.localStorage.setItem(PACE_KEY, 'warp');
    expect(getStoredPace()).toBe('natural');
    storePace('warp');
    expect(window.localStorage.getItem(PACE_KEY)).toBe('warp'); // untouched
    expect(isPace('travel')).toBe(true);
    expect(isPace('warp')).toBe(false);
  });

  it('survives storage that throws, as it does in a private window', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(getStoredPace()).toBe('natural');
    expect(() => storePace('travel')).not.toThrow();
  });
});

describe('the pace a scene opens on', () => {
  it('is the scene’s own default until the visitor has chosen, and theirs after', () => {
    // Nothing chosen: the scene's default, whatever it is.
    expect(getStoredPace()).toBe('natural');
    expect(getStoredPace('brisk')).toBe('brisk');
    // A choice wins over any scene's default, in either direction.
    storePace('natural');
    expect(getStoredPace('brisk')).toBe('natural');
    storePace('travel');
    expect(getStoredPace('brisk')).toBe('travel');
    storePace('brisk');
    expect(getStoredPace('natural')).toBe('brisk');
  });

  it('falls back to the stroll for a default it does not know, and never writes one down', () => {
    expect(getStoredPace('warp')).toBe('natural');
    expect(getStoredPace(undefined)).toBe('natural');
    // Reading is not choosing: asking for a scene's default leaves nothing behind.
    getStoredPace('brisk');
    expect(window.localStorage.getItem(PACE_KEY)).toBeNull();
  });

  it('is brisk in the big places and a stroll in the small, by each scene’s own row', () => {
    for (const big of ['nehemiahs-wall', 'mount-of-olives', 'sinai']) expect(defaultPaceFor(big), big).toBe('brisk');
    for (const small of ['caesarea', 'tabernacle', 'valley-of-elah', 'bethlehem', 'capernaum', 'second-temple']) {
      expect(defaultPaceFor(small), small).toBe('natural');
    }
    expect(defaultPaceFor('no-such-scene')).toBe('natural');
  });

  it('is the same places that ask for a travel pace, and never the travel pace itself', () => {
    for (const slug of knownSceneSlugs()) {
      const row = sceneModule(slug);
      expect(isPace(defaultPaceFor(slug)), slug).toBe(true);
      // A default is a gentle one: the fast walk is for the visitor to turn on.
      expect(defaultPaceFor(slug), slug).not.toBe('travel');
      // A scene big enough to ask for a travel speed is big enough to open brisk.
      if (row.travelSpeed !== undefined) expect(defaultPaceFor(slug), slug).toBe('brisk');
    }
  });

  it('is the same speed from behind a figure as in first person, so the default does not depend on the view', () => {
    expect(paceSpeed('brisk', { third: true })).toBe(paceSpeed('brisk', { third: false }));
    expect(paceSpeed('brisk', { third: true })).toBeLessThan(JOG_SPEED);
  });

  it('puts the 2.6 km wall at a brisk walk in about twelve minutes, from the first step', () => {
    const minutes = minutesToCover(circuitLength('city'), paceSpeed(defaultPaceFor('nehemiahs-wall')));
    expect(minutes).toBeGreaterThanOrEqual(11);
    expect(minutes).toBeLessThanOrEqual(13);
  });
});

describe('what a label says', () => {
  it('writes a speed the way the settings read it', () => {
    expect(formatSpeed(1.6)).toBe('1.6 m/s');
    expect(formatSpeed(8)).toBe('8 m/s');
    expect(formatSpeed(4.2)).toBe('4.2 m/s');
    expect(formatSpeed(3.5999)).toBe('3.6 m/s');
  });

  it('counts minutes in whole numbers, and at least one', () => {
    expect(minutesToCover(600, 1.6)).toBe(6);
    expect(minutesToCover(1, 8)).toBe(1);
  });
});

describe('each scene’s travel pace', () => {
  it('is a real speed for every scene, between a brisk walk and the run', () => {
    for (const slug of knownSceneSlugs()) {
      const speed = travelSpeedFor(slug);
      expect(Number.isFinite(speed), slug).toBe(true);
      expect(speed, slug).toBeGreaterThan(BRISK_WALK_SPEED);
      expect(speed, slug).toBeLessThanOrEqual(RUN_SPEED);
    }
    expect(travelSpeedFor('no-such-scene')).toBe(DEFAULT_TRAVEL_SPEED);
  });

  it('is faster for the big places than the small, because that is what it is for', () => {
    for (const big of ['nehemiahs-wall', 'mount-of-olives', 'sinai']) {
      expect(travelSpeedFor(big), big).toBeGreaterThan(DEFAULT_TRAVEL_SPEED);
      expect(sceneModule(big).travelSpeed, big).toBeDefined();
    }
    expect(travelSpeedFor('nehemiahs-wall')).toBeGreaterThanOrEqual(travelSpeedFor('mount-of-olives'));
    expect(travelSpeedFor('mount-of-olives')).toBeGreaterThanOrEqual(travelSpeedFor('sinai'));
    // Small places are left on the default: the whole of them is in view.
    for (const small of ['caesarea', 'tabernacle', 'valley-of-elah', 'bethlehem']) expect(travelSpeedFor(small), small).toBe(DEFAULT_TRAVEL_SPEED);
  });

  it('makes the two and a half kilometres of Nehemiah’s wall a few minutes’ walk, not half an hour', () => {
    const circuit = circuitLength('city');
    expect(minutesToCover(circuit, NATURAL_WALK_SPEED)).toBeGreaterThan(24);
    expect(minutesToCover(circuit, BRISK_WALK_SPEED)).toBeGreaterThan(10);
    expect(minutesToCover(circuit, travelSpeedFor('nehemiahs-wall'))).toBeLessThanOrEqual(6);
    // First person only: nobody is capped at a jog on the wall.
    expect(sceneModule('nehemiahs-wall').thirdPerson).toBeFalsy();
  });

  it('is capped at the jog wherever there is a figure to see from behind', () => {
    for (const slug of knownSceneSlugs().filter((id) => sceneModule(id).thirdPerson)) {
      expect(paceSpeed('travel', { travelSpeed: travelSpeedFor(slug), third: true }), slug).toBe(JOG_SPEED);
    }
  });
});
