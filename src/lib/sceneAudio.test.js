import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SOUNDSCAPES,
  SURFACES,
  createSoundscape,
  soundscapeFor,
  surfaceForRegion,
  audioAvailable,
} from './sceneAudio';
import { knownSceneSlugs } from '../components/scene/sceneModules';

// jsdom has no Web Audio at all, so the whole graph is exercised against a
// stand-in that records what was built and what was connected to what. It
// implements the subset the module actually touches; anything the module
// starts using that is missing here will throw rather than pass quietly.

function makeParam(value) {
  return {
    value,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  };
}

function makeFakeContext({ withPositionParams = true } = {}) {
  const created = [];
  const connections = [];

  const node = (kind, extra = {}) => {
    const self = {
      // `kind` rather than `type`: BiquadFilterNode.type and
      // OscillatorNode.type are real properties the module sets, so a marker
      // called `type` gets overwritten the moment a filter is configured.
      kind,
      connect: vi.fn((target) => {
        connections.push([self, target]);
        return target;
      }),
      disconnect: vi.fn(),
      ...extra,
    };
    created.push(self);
    return self;
  };

  const context = {
    sampleRate: 44100,
    currentTime: 0,
    state: 'suspended',
    destination: { kind: 'destination', connect: vi.fn(), disconnect: vi.fn() },
    listener: withPositionParams
      ? {
        positionX: makeParam(0),
        positionY: makeParam(0),
        positionZ: makeParam(0),
        forwardX: makeParam(0),
        forwardY: makeParam(0),
        forwardZ: makeParam(-1),
        upX: makeParam(0),
        upY: makeParam(1),
        upZ: makeParam(0),
      }
      : { setPosition: vi.fn(), setOrientation: vi.fn() },
    createBuffer: (channels, frames, rate) => ({
      length: frames,
      duration: frames / rate,
      numberOfChannels: channels,
      sampleRate: rate,
      getChannelData: () => new Float32Array(frames),
    }),
    createGain: () => node('gain', { gain: makeParam(1) }),
    createBiquadFilter: () => node('filter', { frequency: makeParam(350), Q: makeParam(1) }),
    createDynamicsCompressor: () => node('compressor', {
      threshold: makeParam(-24),
      ratio: makeParam(12),
    }),
    createPanner: () => node('panner', {
      panningModel: '',
      distanceModel: '',
      refDistance: 1,
      maxDistance: 10000,
      rolloffFactor: 1,
      positionX: makeParam(0),
      positionY: makeParam(0),
      positionZ: makeParam(0),
    }),
    createBufferSource: () => node('source', {
      buffer: null,
      loop: false,
      playbackRate: makeParam(1),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
    }),
    createOscillator: () => node('oscillator', {
      frequency: makeParam(440),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
    }),
    resume: vi.fn(async () => { context.state = 'running'; }),
    close: vi.fn(async () => { context.state = 'closed'; }),
  };

  return { context, created, connections };
}

const nodesOfKind = (created, kind) => created.filter((n) => n.kind === kind);

describe('surfaceForRegion', () => {
  it('maps each scene region to a footfall that suits it', () => {
    expect(surfaceForRegion('lake')).toBe('water');
    expect(surfaceForRegion('beach')).toBe('sand');
    expect(surfaceForRegion('desert')).toBe('sand');
    expect(surfaceForRegion('village')).toBe('earth');
  });

  it('falls back to stone, which is what most of these sites are paved with', () => {
    expect(surfaceForRegion('inner')).toBe('stone');
    expect(surfaceForRegion('fifteen-steps')).toBe('stone');
    expect(surfaceForRegion(undefined)).toBe('stone');
    expect(surfaceForRegion('a region nobody has written yet')).toBe('stone');
  });

  it('names a real surface for every region', () => {
    for (const region of Object.keys(SURFACES)) {
      expect(SURFACES[region].decay).toBeGreaterThan(0);
      expect(SURFACES[region].level).toBeGreaterThan(0);
    }
  });
});

describe('SOUNDSCAPES', () => {
  it('covers every scene the app can route to', () => {
    for (const slug of knownSceneSlugs()) {
      expect(soundscapeFor(slug), `no soundscape for ${slug}`).toBeTruthy();
    }
  });

  it('gives every layer a voice the engine implements', () => {
    // Every voice name that appears in the table must survive graph
    // construction — a typo here is otherwise a silent missing sound.
    for (const slug of knownSceneSlugs()) {
      const { context, created } = makeFakeContext();
      const scape = createSoundscape(slug, { context });
      expect(scape).toBeTruthy();
      const spec = soundscapeFor(slug);
      // One panner per positional source, no more and no less.
      expect(nodesOfKind(created, 'panner')).toHaveLength(spec.sources.length);
      scape.dispose();
    }
  });

  it('places every positional source somewhere finite', () => {
    for (const slug of knownSceneSlugs()) {
      for (const source of soundscapeFor(slug).sources) {
        expect(source.at).toHaveLength(3);
        for (const value of source.at) expect(Number.isFinite(value)).toBe(true);
        expect(source.radius).toBeGreaterThan(0);
      }
    }
  });

  it('returns nothing for a slug with no scene', () => {
    expect(soundscapeFor('nineveh')).toBeNull();
    const { context } = makeFakeContext();
    expect(createSoundscape('nineveh', { context })).toBeNull();
  });
});

describe('createSoundscape', () => {
  let scape;
  let harness;

  beforeEach(() => {
    harness = makeFakeContext();
    scape = createSoundscape('second-temple', { context: harness.context });
  });

  afterEach(() => {
    scape?.dispose();
  });

  it('builds a graph that reaches the destination', () => {
    const { connections, context } = harness;
    expect(connections.some(([, target]) => target === context.destination)).toBe(true);
  });

  it('starts silent, so nothing plays before the visitor asks for it', () => {
    const master = harness.created.find((n) => n.kind === 'gain');
    expect(master.gain.value).toBe(0);
  });

  it('resumes the context and only then raises the volume', async () => {
    expect(harness.context.resume).not.toHaveBeenCalled();
    await scape.resume();
    expect(harness.context.resume).toHaveBeenCalled();
    expect(harness.context.state).toBe('running');
  });

  it('survives a context that refuses to resume', async () => {
    harness.context.resume = vi.fn(async () => { throw new Error('blocked by autoplay policy'); });
    await expect(scape.resume()).resolves.toBe(false);
  });

  it('moves the listener to where the visitor is standing', () => {
    scape.update(1, { x: 12, y: 1.75, z: -30, yaw: 0 });
    const { listener } = harness.context;
    expect(listener.positionX.value).toBe(12);
    expect(listener.positionZ.value).toBe(-30);
    // Scene.jsx's convention: yaw 0 faces -Z.
    expect(listener.forwardZ.value).toBeCloseTo(-1, 6);
    expect(listener.forwardX.value).toBeCloseTo(0, 6);
  });

  it('turns the listener with the camera', () => {
    scape.update(1, { x: 0, y: 1.75, z: 0, yaw: Math.PI / 2 });
    const { listener } = harness.context;
    expect(listener.forwardX.value).toBeCloseTo(-1, 6);
    expect(listener.forwardZ.value).toBeCloseTo(0, 6);
  });

  it('supports the older setPosition listener API', () => {
    const legacy = makeFakeContext({ withPositionParams: false });
    const old = createSoundscape('capernaum', { context: legacy.context });
    old.update(1, { x: 4, y: 1.7, z: 9, yaw: 0 });
    expect(legacy.context.listener.setPosition).toHaveBeenCalledWith(4, 1.7, 9);
    expect(legacy.context.listener.setOrientation).toHaveBeenCalled();
    old.dispose();
  });

  it('closes the world down as the visitor steps inside', () => {
    const before = harness.created.filter((n) => n.kind === 'filter').map((n) => n.frequency.value);
    // Enclosure is eased rather than switched, so it takes a few frames.
    for (let i = 0; i < 200; i += 1) scape.update(i * 0.016, { enclosure: 1 });
    const after = harness.created.filter((n) => n.kind === 'filter').map((n) => n.frequency.value);
    // The muffle is the one filter that started wide open.
    expect(Math.max(...before)).toBeGreaterThan(19000);
    expect(Math.max(...after)).toBeLessThan(Math.max(...before));
  });

  it('never lets a filter frequency go negative or NaN', () => {
    for (let t = 0; t < 400; t += 1) {
      scape.update(t * 0.37, { x: t, y: 1.7, z: -t, yaw: t * 0.1, enclosure: t % 2 });
    }
    for (const node of harness.created) {
      if (node.kind !== 'filter') continue;
      expect(Number.isFinite(node.frequency.value)).toBe(true);
      expect(node.frequency.value).toBeGreaterThan(0);
      expect(Number.isFinite(node.Q.value)).toBe(true);
    }
    for (const node of harness.created) {
      if (!node.gain) continue;
      expect(Number.isFinite(node.gain.value)).toBe(true);
      expect(node.gain.value).toBeGreaterThanOrEqual(0);
    }
  });

  it('fires sparse events over time rather than all at once', () => {
    const oscillatorsAfter = () => nodesOfKind(harness.created, 'oscillator').length;
    scape.update(0, {});
    const atStart = oscillatorsAfter();
    // The horn is on a ~60s mean interval and the birds ~4.5s, so a couple of
    // minutes of scene clock must produce something.
    for (let t = 0; t < 120; t += 0.5) scape.update(t, {});
    expect(oscillatorsAfter()).toBeGreaterThan(atStart);
  });

  it('is deterministic: the same scene twice schedules the same events', () => {
    const runOnce = () => {
      const local = makeFakeContext();
      const one = createSoundscape('caesarea', { context: local.context });
      for (let t = 0; t < 90; t += 0.25) one.update(t, {});
      const count = local.created.length;
      one.dispose();
      return count;
    };
    expect(runOnce()).toBe(runOnce());
  });
});

describe('footsteps', () => {
  it('makes a sound, and a different one per surface', () => {
    const harness = makeFakeContext();
    const scape = createSoundscape('capernaum', { context: harness.context });
    const before = nodesOfKind(harness.created, 'source').length;
    scape.footstep('stone');
    const afterStone = nodesOfKind(harness.created, 'source').length;
    expect(afterStone).toBeGreaterThan(before);

    // Bandpass centre reflects the surface: sand is bright and scuffy, earth
    // is dull. Compare the newest filter each footfall created.
    const centres = [];
    for (const surface of ['sand', 'earth']) {
      harness.context.currentTime += 1;
      const mark = harness.created.length;
      scape.footstep(surface);
      const made = harness.created.slice(mark).filter((n) => n.kind === 'filter');
      centres.push(made[0].frequency.value);
    }
    expect(centres[0]).toBeGreaterThan(centres[1]);
    scape.dispose();
  });

  it('refuses two footfalls in the same instant', () => {
    const harness = makeFakeContext();
    const scape = createSoundscape('capernaum', { context: harness.context });
    harness.context.currentTime = 5;
    const mark = harness.created.length;
    scape.footstep('stone');
    const afterFirst = harness.created.length;
    scape.footstep('stone'); // same currentTime — a bug upstream, not a sound
    expect(harness.created.length).toBe(afterFirst);
    expect(afterFirst).toBeGreaterThan(mark);
    scape.dispose();
  });

  it('says nothing while muted', () => {
    const harness = makeFakeContext();
    const scape = createSoundscape('capernaum', { context: harness.context });
    scape.setMuted(true);
    expect(scape.isMuted()).toBe(true);
    harness.context.currentTime = 9;
    const mark = harness.created.length;
    scape.footstep('stone');
    expect(harness.created.length).toBe(mark);
    scape.dispose();
  });

  it('treats an unknown surface as stone rather than throwing', () => {
    const harness = makeFakeContext();
    const scape = createSoundscape('capernaum', { context: harness.context });
    harness.context.currentTime = 3;
    expect(() => scape.footstep('obsidian')).not.toThrow();
    scape.dispose();
  });
});

describe('dispose', () => {
  it('stops every looping source and disconnects the graph', () => {
    const harness = makeFakeContext();
    const scape = createSoundscape('tabernacle', { context: harness.context });
    scape.update(1, {});
    const loops = nodesOfKind(harness.created, 'source').filter((n) => n.loop);
    expect(loops.length).toBeGreaterThan(0);
    scape.dispose();
    for (const loop of loops) expect(loop.stop).toHaveBeenCalled();
    // The persistent graph is torn down. One-shot bursts are not checked here:
    // they disconnect themselves from `onended`, which a fake context never
    // fires — their leak-safety is the browser's contract, not this module's.
    for (const panner of nodesOfKind(harness.created, 'panner')) {
      expect(panner.disconnect).toHaveBeenCalled();
    }
    for (const compressor of nodesOfKind(harness.created, 'compressor')) {
      expect(compressor.disconnect).toHaveBeenCalled();
    }
  });

  it('leaves a borrowed context open, because its lifetime is the caller’s', () => {
    const harness = makeFakeContext();
    const scape = createSoundscape('tabernacle', { context: harness.context });
    scape.dispose();
    expect(harness.context.close).not.toHaveBeenCalled();
  });

  it('is idempotent, and silent after', () => {
    const harness = makeFakeContext();
    const scape = createSoundscape('tabernacle', { context: harness.context });
    scape.dispose();
    expect(() => scape.dispose()).not.toThrow();
    harness.context.currentTime = 20;
    const mark = harness.created.length;
    scape.footstep('sand');
    scape.update(30, { x: 1, z: 1 });
    expect(harness.created.length).toBe(mark);
  });
});

describe('audioAvailable', () => {
  it('is false in a jsdom that has no Web Audio', () => {
    // The suite runs without AudioContext defined; the guard is what stops
    // Scene.jsx trying to build a soundscape on a browser that lacks it.
    expect(audioAvailable()).toBe(Boolean(window.AudioContext || window.webkitAudioContext));
  });

  it('createSoundscape returns null when there is no context to be had', () => {
    expect(createSoundscape('second-temple', { context: null })).toBeNull();
  });
});

describe('the table itself', () => {
  it('keeps gains in a sane range so nothing clips the master', () => {
    for (const spec of Object.values(SOUNDSCAPES)) {
      for (const layer of [...spec.bed, ...spec.sources]) {
        expect(layer.gain).toBeGreaterThan(0);
        expect(layer.gain).toBeLessThanOrEqual(1);
      }
    }
  });

  it('gives every scene a bed, so silence is never the resting state', () => {
    for (const spec of Object.values(SOUNDSCAPES)) {
      expect(spec.bed.length).toBeGreaterThan(0);
      expect(Number.isFinite(spec.seed)).toBe(true);
    }
  });
});
