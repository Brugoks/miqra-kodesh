// The soundscape for the immersive scenes at /scene/:slug.
//
// Every sound here is synthesised from Web Audio primitives — filtered noise,
// oscillators, envelopes — and nothing is fetched. That is the same trade the
// geometry makes in components/scene/build*.js: a few kilobytes of JavaScript
// instead of megabytes of recordings, no licensing to track, and a wind that
// can be tuned by changing a number rather than by finding a better take. It
// will never be a field recording; it is not trying to be. It is trying to
// stop the scenes being silent, which is the single largest thing standing
// between them and feeling like a place.
//
// This module is deliberately free of React and three.js. The AudioContext is
// passed in (or built here from the global) so tests can drive the whole graph
// under a fake context in jsdom, which has no Web Audio at all.
//
// Two things about browsers shape the design:
//
//   A context created before a user gesture starts suspended and stays that
//   way. Scene.jsx builds the soundscape when the visitor presses "Step
//   inside" — a real gesture — and calls resume() there.
//
//   Nothing here is driven by timers. `update(elapsed, listener)` is called
//   once per frame from the render loop that is already running, which keeps
//   the sparse events (crackles, birdsong, a distant horn) deterministic under
//   test and stops them drifting when the tab is backgrounded.

// --- deterministic randomness ---------------------------------------------

// Same generator the builders use. A soundscape that reshuffles its bird calls
// on every visit is fine; one whose *tests* do is not.
function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// --- surfaces -------------------------------------------------------------

// What a footfall sounds like. `freq` is where the bandpass sits, `q` how
// resonant it is, `decay` how fast it dies, and `body` how much low thump goes
// underneath — stone is a bright short click over almost nothing, sand is a
// dull scuff with no ring at all.
export const SURFACES = {
  stone: { freq: 1900, q: 1.1, decay: 0.13, body: 0.25, level: 0.5 },
  timber: { freq: 950, q: 2.2, decay: 0.19, body: 0.45, level: 0.5 },
  earth: { freq: 700, q: 0.8, decay: 0.16, body: 0.4, level: 0.42 },
  sand: { freq: 3600, q: 0.5, decay: 0.22, body: 0.12, level: 0.34 },
  water: { freq: 1200, q: 0.6, decay: 0.34, body: 0.3, level: 0.55 },
};

// Region names come from each scene's floorAt(); see components/scene/
// *Navigation.js. Anything unlisted is stone, which is what most of these
// sites are paved with.
const REGION_SURFACES = {
  lake: 'water',
  beach: 'sand',
  'shore-ramp': 'sand',
  village: 'earth',
  roof: 'earth',
  'roof-stair': 'stone',
  desert: 'sand',
  waterfront: 'stone',
};

export function surfaceForRegion(region) {
  return REGION_SURFACES[region] || 'stone';
}

// --- per-scene layers -----------------------------------------------------

// One row per scene, the way sceneModules.js has one row per scene. A layer
// with `at` is positional and fades with distance; one without is the bed, and
// plays at the same level wherever you stand.
//
// Coordinates are the scene's own metres, so they can be read straight off the
// vantages in src/lib/<site>Scene.js.
export const SOUNDSCAPES = {
  'second-temple': {
    seed: 6120,
    bed: [
      { voice: 'wind', gain: 0.2, freq: 380 },
      { voice: 'crowd', gain: 0.34, freq: 620 },
    ],
    sources: [
      // The fire on the altar, which was never allowed to go out.
      { id: 'altar', voice: 'fire', gain: 0.85, at: [0, 8, 8], radius: 34 },
      // Pilgrims packed into the outer court, loudest by the eastern gates.
      { id: 'gates', voice: 'crowd', gain: 0.5, freq: 700, at: [0, 2, 190], radius: 120 },
      { id: 'doves', voice: 'birds', gain: 0.32, at: [-60, 12, 150], radius: 90 },
      // Levites at the hour of prayer, far enough off to be atmosphere.
      { id: 'horn', voice: 'horn', gain: 0.4, at: [0, 24, -20], radius: 260 },
    ],
  },
  capernaum: {
    seed: 3311,
    bed: [
      { voice: 'wind', gain: 0.17, freq: 300 },
      { voice: 'crowd', gain: 0.16, freq: 560 },
    ],
    sources: [
      { id: 'lake', voice: 'water', gain: 0.9, at: [0, 0, -40], radius: 110 },
      { id: 'gulls', voice: 'gulls', gain: 0.35, at: [20, 16, -60], radius: 140 },
      { id: 'village', voice: 'crowd', gain: 0.4, freq: 640, at: [0, 2, 30], radius: 60 },
      { id: 'goats', voice: 'flock', gain: 0.3, at: [-34, 1, 44], radius: 70 },
    ],
  },
  caesarea: {
    seed: 9042,
    bed: [
      { voice: 'wind', gain: 0.3, freq: 460 },
      { voice: 'surf', gain: 0.5 },
    ],
    sources: [
      { id: 'harbour', voice: 'water', gain: 0.8, at: [-60, 0, 40], radius: 130 },
      { id: 'gulls', voice: 'gulls', gain: 0.42, at: [-40, 20, 20], radius: 160 },
      { id: 'rigging', voice: 'rigging', gain: 0.4, at: [-25, 6, 80], radius: 70 },
      { id: 'market', voice: 'crowd', gain: 0.42, freq: 680, at: [90, 2, -40], radius: 90 },
    ],
  },
  tabernacle: {
    seed: 4004,
    bed: [
      // Open desert: wind is most of what there is, and it never stops.
      { voice: 'wind', gain: 0.42, freq: 520 },
      { voice: 'insects', gain: 0.14 },
    ],
    sources: [
      { id: 'altar', voice: 'fire', gain: 0.8, at: [0, 1.6, 22], radius: 22 },
      { id: 'camp', voice: 'crowd', gain: 0.34, freq: 600, at: [0, 2, 60], radius: 80 },
      { id: 'flock', voice: 'flock', gain: 0.34, at: [-40, 1, 50], radius: 80 },
    ],
  },
};

export function soundscapeFor(slug) {
  return SOUNDSCAPES[slug] || null;
}

// --- context --------------------------------------------------------------

export function audioAvailable() {
  return typeof window !== 'undefined'
    && Boolean(window.AudioContext || window.webkitAudioContext);
}

export function createAudioContext() {
  if (!audioAvailable()) return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

// --- noise ----------------------------------------------------------------

// Pink-ish rather than white. White noise is all treble and reads as static;
// the 1/f tilt is what makes the same generator sound like wind in one filter
// and a crowd in another. Paul Kellet's economy filter, which is six
// multiply-adds and close enough.
function fillPinkNoise(channel, random) {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < channel.length; i += 1) {
    const white = random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    channel[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
}

// One buffer, shared by every looping voice. Each source reads it at its own
// rate and starts at its own offset, which decorrelates them well enough that
// four layers off one buffer do not beat against each other audibly.
function makeNoiseBuffer(context, seconds, random) {
  const rate = context.sampleRate || 44100;
  const frames = Math.max(1, Math.floor(rate * seconds));
  const buffer = context.createBuffer(1, frames, rate);
  fillPinkNoise(buffer.getChannelData(0), random);
  return buffer;
}

// --- the soundscape -------------------------------------------------------

export function createSoundscape(slug, options = {}) {
  const spec = soundscapeFor(slug);
  const context = options.context !== undefined ? options.context : createAudioContext();
  if (!spec || !context) return null;

  const quality = options.quality || 'high';
  const low = quality === 'low';
  const random = makeRandom(spec.seed);
  const nodes = [];
  const voices = [];
  let disposed = false;

  // Chirps within a bird call are milliseconds apart — too fine for the frame
  // clock, too coarse to be worth a scheduled oscillator each. This is the one
  // timer in the file, and it is bounded by the call that made it.
  const setTimeoutSafe = (fn, ms) => {
    if (ms <= 0) {
      if (!disposed) fn();
      return;
    }
    setTimeout(() => {
      if (!disposed) fn();
    }, ms);
  };

  const track = (node) => {
    nodes.push(node);
    return node;
  };

  const gainNode = (value) => {
    const node = track(context.createGain());
    node.gain.value = value;
    return node;
  };

  const filter = (type, frequency, q) => {
    const node = track(context.createBiquadFilter());
    node.type = type;
    node.frequency.value = frequency;
    if (q !== undefined) node.Q.value = q;
    return node;
  };

  // --- master chain -------------------------------------------------------

  const master = gainNode(0);
  // A compressor stops a footfall landing on top of a crackle from clipping,
  // and keeps the bed sitting at a consistent level as sources fade in and out.
  const compressor = track(context.createDynamicsCompressor());
  if (compressor.threshold) compressor.threshold.value = -18;
  if (compressor.ratio) compressor.ratio.value = 4;
  master.connect(compressor);
  compressor.connect(context.destination);

  // Everything ambient runs through one lowpass so that stepping inside — a
  // house at Capernaum, the Holy Place — can shut the world out without every
  // voice knowing about walls. `enclosure` in update() drives it.
  const muffle = filter('lowpass', 20000, 0.7);
  muffle.connect(master);

  // Footsteps deliberately bypass the muffle: your own feet do not get
  // quieter when you walk indoors, they get louder and shorter.
  const footBus = gainNode(0.9);
  footBus.connect(master);

  const noise = makeNoiseBuffer(context, low ? 2.5 : 4, random);

  const loopingNoise = (rate) => {
    const source = track(context.createBufferSource());
    source.buffer = noise;
    source.loop = true;
    if (source.playbackRate) source.playbackRate.value = rate;
    return source;
  };

  const started = [];
  const startSource = (source, offset) => {
    started.push(source);
    try {
      source.start(0, offset);
    } catch {
      // A fake context in tests may not implement the offset form.
      source.start(0);
    }
  };

  // --- voices -------------------------------------------------------------
  //
  // Each factory returns { output, update? }. A voice with no update is a
  // steady bed; one with an update either modulates itself or schedules sparse
  // one-shot events against the elapsed clock.

  // Wind. A bandpass wandering slowly across a noise floor, with the gain
  // breathing on a different period so the gusts never land on a beat.
  const windVoice = ({ freq = 400 }) => {
    const source = loopingNoise(0.85);
    const band = filter('bandpass', freq, 0.6);
    const level = gainNode(0.5);
    source.connect(band);
    band.connect(level);
    startSource(source, random() * 2);
    const phase = random() * 6.283;
    return {
      output: level,
      update: (t) => {
        const gust = Math.sin(t * 0.13 + phase) * 0.5 + Math.sin(t * 0.31 + phase * 2) * 0.3;
        band.frequency.value = freq * (1 + gust * 0.45);
        level.gain.value = 0.5 * (0.72 + gust * 0.38);
      },
    };
  };

  // Crowd murmur. Two bands an octave apart, swelling on incommensurable
  // periods — which is what stops a loop sounding like a loop.
  const crowdVoice = ({ freq = 620 }) => {
    const source = loopingNoise(0.6);
    const band = filter('bandpass', freq, 1.4);
    const upper = filter('bandpass', freq * 2.1, 2.2);
    const level = gainNode(0.4);
    const upperLevel = gainNode(0.25);
    source.connect(band);
    band.connect(level);
    source.connect(upper);
    upper.connect(upperLevel);
    upperLevel.connect(level);
    startSource(source, random() * 2);
    const phase = random() * 6.283;
    return {
      output: level,
      update: (t) => {
        const swell = Math.sin(t * 0.21 + phase) * 0.5 + Math.sin(t * 0.37 + phase * 1.7) * 0.32;
        level.gain.value = 0.4 * (0.78 + swell * 0.3);
        upperLevel.gain.value = 0.25 * (0.8 + Math.sin(t * 0.53 + phase) * 0.35);
      },
    };
  };

  // Water lapping at a shore. Low noise whose gain rises and falls on two slow
  // periods, so the swells arrive irregularly the way they actually do.
  const waterVoice = () => {
    const source = loopingNoise(0.5);
    const low2 = filter('lowpass', 760, 0.9);
    const level = gainNode(0.4);
    source.connect(low2);
    low2.connect(level);
    startSource(source, random() * 2);
    const phase = random() * 6.283;
    return {
      output: level,
      update: (t) => {
        const swell = Math.sin(t * 0.27 + phase) * 0.55 + Math.sin(t * 0.41 + phase * 2.3) * 0.3;
        level.gain.value = 0.4 * (0.6 + Math.max(0, swell) * 0.9);
        low2.frequency.value = 760 + swell * 260;
      },
    };
  };

  // Open sea against a harbour mole: heavier, slower, more spray in the top end.
  const surfVoice = () => {
    const source = loopingNoise(0.4);
    const band = filter('lowpass', 1100, 0.7);
    const spray = filter('highpass', 2600, 0.5);
    const level = gainNode(0.4);
    const sprayLevel = gainNode(0.1);
    source.connect(band);
    band.connect(level);
    source.connect(spray);
    spray.connect(sprayLevel);
    sprayLevel.connect(level);
    startSource(source, random() * 2);
    const phase = random() * 6.283;
    return {
      output: level,
      update: (t) => {
        const swell = Math.sin(t * 0.14 + phase);
        const crest = Math.max(0, swell) ** 2;
        level.gain.value = 0.4 * (0.5 + crest * 1.1);
        sprayLevel.gain.value = 0.1 * (0.3 + crest * 1.6);
      },
    };
  };

  // Cicadas in the heat. A narrow resonant band amplitude-modulated fast
  // enough to buzz rather than hiss.
  const insectVoice = () => {
    const source = loopingNoise(1.4);
    const band = filter('bandpass', 4600, 9);
    const level = gainNode(0.3);
    source.connect(band);
    band.connect(level);
    startSource(source, random() * 2);
    const phase = random() * 6.283;
    return {
      output: level,
      update: (t) => {
        const chirr = Math.sin(t * 33) * 0.5 + 0.5;
        const swell = 0.6 + Math.sin(t * 0.09 + phase) * 0.4;
        level.gain.value = 0.3 * swell * (0.45 + chirr * 0.55);
      },
    };
  };

  // A one-shot noise burst through a filter, which is most of the transients
  // in this file: crackles, footfalls, creaking rope.
  const burst = (destination, { freq, q, decay, level, type = 'bandpass', rate = 1 }) => {
    if (disposed) return;
    const source = context.createBufferSource();
    source.buffer = noise;
    if (source.playbackRate) source.playbackRate.value = rate;
    const band = context.createBiquadFilter();
    band.type = type;
    band.frequency.value = freq;
    band.Q.value = q;
    const envelope = context.createGain();
    const now = context.currentTime;
    // Not quite instant: a 4ms rise instead of a step, because a step is a
    // click of its own.
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(Math.max(level, 0.0002), now + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    source.connect(band);
    band.connect(envelope);
    envelope.connect(destination);
    source.onended = () => {
      source.disconnect();
      band.disconnect();
      envelope.disconnect();
    };
    const offset = random() * (noise.duration ? noise.duration - decay - 0.05 : 0);
    try {
      source.start(now, Math.max(0, offset), decay + 0.05);
    } catch {
      source.start(now);
      if (source.stop) source.stop(now + decay + 0.05);
    }
  };

  // A pitched one-shot: the body of every animal and bird in here. `sweep`
  // bends the pitch across the note, which is what tells a gull from a goat.
  const tone = (destination, {
    freq, to, duration, level, type = 'sine', vibrato = 0,
  }) => {
    if (disposed) return;
    const osc = context.createOscillator();
    osc.type = type;
    const envelope = context.createGain();
    const now = context.currentTime;
    osc.frequency.setValueAtTime(freq, now);
    if (to && osc.frequency.exponentialRampToValueAtTime) {
      osc.frequency.exponentialRampToValueAtTime(to, now + duration);
    }
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(Math.max(level, 0.0002), now + duration * 0.18);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(envelope);
    envelope.connect(destination);

    let lfo;
    let lfoGain;
    if (vibrato) {
      lfo = context.createOscillator();
      lfoGain = context.createGain();
      lfo.frequency.value = vibrato;
      lfoGain.gain.value = freq * 0.06;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(now);
      if (lfo.stop) lfo.stop(now + duration);
    }

    osc.onended = () => {
      osc.disconnect();
      envelope.disconnect();
      lfo?.disconnect();
      lfoGain?.disconnect();
    };
    osc.start(now);
    if (osc.stop) osc.stop(now + duration);
  };

  // A voice that does nothing until its clock comes round. `every` is a mean
  // interval, jittered, so nothing here is ever periodic.
  const sparse = (output, every, jitter, fire) => {
    let next = random() * every;
    return {
      output,
      update: (t) => {
        if (t < next) return;
        next = t + every * (1 - jitter + random() * jitter * 2);
        fire(t);
      },
    };
  };

  // Fire: a steady low bed with crackles scattered over it.
  const fireVoice = () => {
    const source = loopingNoise(0.55);
    const body = filter('lowpass', 480, 1.1);
    const level = gainNode(0.32);
    source.connect(body);
    body.connect(level);
    startSource(source, random() * 2);
    const crackleBus = gainNode(0.5);
    crackleBus.connect(level);
    const spark = sparse(level, low ? 0.5 : 0.26, 0.85, () => {
      burst(crackleBus, {
        freq: 1400 + random() * 2600,
        q: 1.6,
        decay: 0.035 + random() * 0.07,
        level: 0.12 + random() * 0.3,
        rate: 1.4,
      });
    });
    const phase = random() * 6.283;
    return {
      output: level,
      update: (t) => {
        spark.update(t);
        level.gain.value = 0.32 * (0.85 + Math.sin(t * 1.7 + phase) * 0.1 + Math.sin(t * 4.3) * 0.05);
      },
    };
  };

  // Small birds: a pair or three of fast rising chirps, then nothing for a
  // while. Sparrows in the colonnade, which Jesus mentions twice.
  const birdVoice = () => {
    const bus = gainNode(0.5);
    return sparse(bus, low ? 7 : 4.5, 0.8, () => {
      const notes = 2 + Math.floor(random() * 3);
      const base = 2600 + random() * 1500;
      for (let i = 0; i < notes; i += 1) {
        const at = i * (0.07 + random() * 0.05);
        // Scheduled by nesting rather than by a timer: each chirp is its own
        // short oscillator and the offsets are small enough to just stack.
        const start = base * (0.94 + random() * 0.16);
        setTimeoutSafe(() => tone(bus, {
          freq: start,
          to: start * (1.25 + random() * 0.3),
          duration: 0.06 + random() * 0.04,
          level: 0.09 + random() * 0.06,
        }), at * 1000);
      }
    });
  };

  // Gulls: a descending cry, repeated. The sound of every harbour there has
  // ever been.
  const gullVoice = () => {
    const bus = gainNode(0.5);
    return sparse(bus, low ? 9 : 6, 0.7, () => {
      const cries = 2 + Math.floor(random() * 3);
      const base = 900 + random() * 500;
      for (let i = 0; i < cries; i += 1) {
        setTimeoutSafe(() => tone(bus, {
          freq: base * (1 - i * 0.06),
          to: base * (0.55 - i * 0.04),
          duration: 0.26 + random() * 0.12,
          level: 0.1,
          type: 'sawtooth',
          vibrato: 22,
        }), i * (230 + random() * 90));
      }
    });
  };

  // Sheep and goats. Sawtooth with heavy vibrato through a formant band is a
  // crude bleat, but at fifty metres it is unmistakably an animal.
  const flockVoice = () => {
    const bus = gainNode(0.4);
    const formant = filter('bandpass', 1000, 2.6);
    formant.connect(bus);
    return sparse(bus, low ? 11 : 7, 0.8, () => {
      const base = 260 + random() * 190;
      tone(formant, {
        freq: base,
        to: base * 0.8,
        duration: 0.4 + random() * 0.35,
        level: 0.16,
        type: 'sawtooth',
        vibrato: 13 + random() * 9,
      });
    });
  };

  // Rope and timber working against each other at a mooring.
  const riggingVoice = () => {
    const bus = gainNode(0.5);
    return sparse(bus, low ? 8 : 5, 0.9, () => {
      burst(bus, {
        freq: 260 + random() * 320,
        q: 8 + random() * 8,
        decay: 0.4 + random() * 0.5,
        level: 0.14,
        rate: 0.35,
      });
    });
  };

  // The shofar at the hour of prayer, and the silver trumpets. Rare enough to
  // be an event rather than a texture — a long way off, and only now and then.
  const hornVoice = () => {
    const bus = gainNode(0.45);
    const shape = filter('lowpass', 900, 1.2);
    shape.connect(bus);
    return sparse(bus, low ? 95 : 62, 0.55, () => {
      const base = 172 * (random() < 0.5 ? 1 : 1.5);
      tone(shape, {
        freq: base, to: base * 1.002, duration: 1.5 + random() * 0.9, level: 0.2, type: 'sawtooth', vibrato: 5,
      });
      tone(shape, {
        freq: base * 2, to: base * 2.004, duration: 1.3 + random() * 0.8, level: 0.09, type: 'sawtooth',
      });
    });
  };

  const VOICES = {
    wind: windVoice,
    crowd: crowdVoice,
    water: waterVoice,
    surf: surfVoice,
    insects: insectVoice,
    fire: fireVoice,
    birds: birdVoice,
    gulls: gullVoice,
    flock: flockVoice,
    rigging: riggingVoice,
    horn: hornVoice,
  };

  // --- build the graph ----------------------------------------------------

  for (const layer of spec.bed) {
    const factory = VOICES[layer.voice];
    if (!factory) continue;
    const voice = factory(layer);
    const level = gainNode(layer.gain);
    voice.output.connect(level);
    level.connect(muffle);
    voices.push(voice);
  }

  // Positional sources. A PannerNode does the distance falloff and the stereo
  // placement, so walking round the altar actually walks round the fire.
  const panners = [];
  for (const source of spec.sources) {
    const factory = VOICES[source.voice];
    if (!factory) continue;
    const voice = factory(source);
    const level = gainNode(source.gain);
    const panner = track(context.createPanner());
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = Math.max(1, source.radius * 0.25);
    panner.maxDistance = source.radius * 4;
    panner.rolloffFactor = 1.1;
    if (panner.positionX) {
      panner.positionX.value = source.at[0];
      panner.positionY.value = source.at[1];
      panner.positionZ.value = source.at[2];
    } else if (panner.setPosition) {
      panner.setPosition(source.at[0], source.at[1], source.at[2]);
    }
    voice.output.connect(level);
    level.connect(panner);
    panner.connect(muffle);
    voices.push(voice);
    panners.push(panner);
  }

  // --- listener -----------------------------------------------------------

  const listener = context.listener;

  const placeListener = (x, y, z, yaw) => {
    // Camera convention from Scene.jsx: yaw 0 faces -Z.
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    if (listener?.positionX) {
      listener.positionX.value = x;
      listener.positionY.value = y;
      listener.positionZ.value = z;
      listener.forwardX.value = fx;
      listener.forwardY.value = 0;
      listener.forwardZ.value = fz;
      listener.upX.value = 0;
      listener.upY.value = 1;
      listener.upZ.value = 0;
    } else if (listener?.setPosition) {
      listener.setPosition(x, y, z);
      listener.setOrientation(fx, 0, fz, 0, 1, 0);
    }
  };

  // --- public surface -----------------------------------------------------

  let muted = false;
  let targetVolume = options.volume ?? 0.85;
  let currentEnclosure = 0;

  // The bed fades in over a couple of seconds rather than arriving at full
  // level the instant the visitor presses "Step inside".
  const applyVolume = (immediate = false) => {
    const value = muted ? 0 : targetVolume;
    const now = context.currentTime;
    if (immediate || !master.gain.linearRampToValueAtTime) {
      master.gain.value = value;
      return;
    }
    master.gain.cancelScheduledValues?.(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(value, now + (muted ? 0.25 : 2.2));
  };

  let lastFootAt = -1;

  return {
    context,

    // Browsers hold a context suspended until a gesture resumes it. Called
    // from the "Step inside" click, which is as real as gestures get.
    async resume() {
      if (context.state === 'suspended' && context.resume) {
        try {
          await context.resume();
        } catch {
          return false;
        }
      }
      applyVolume();
      return true;
    },

    // Called once per frame from the render loop. `elapsed` is the scene clock
    // in seconds — the same one the geometry's update() gets.
    update(elapsed, position = {}) {
      if (disposed) return;
      const {
        x = 0, y = 1.7, z = 0, yaw = 0, enclosure = 0,
      } = position;
      placeListener(x, y, z, yaw);

      // Walls do not slam shut; they close over about a third of a second as
      // you step through a doorway.
      currentEnclosure += (enclosure - currentEnclosure) * 0.08;
      muffle.frequency.value = 20000 - currentEnclosure * 18600;

      for (const voice of voices) voice.update?.(elapsed);
    },

    // A single footfall. Driven by the walk cadence in Scene.jsx rather than
    // by a timer here, so the sound lands on the frame the foot does.
    footstep(surfaceName, intensity = 1) {
      if (disposed || muted) return;
      const surface = SURFACES[surfaceName] || SURFACES.stone;
      const now = context.currentTime;
      // Two footfalls in the same handful of milliseconds is a bug upstream,
      // not a sound; refusing it here is cheaper than being careful there.
      if (now - lastFootAt < 0.09) return;
      lastFootAt = now;
      const variation = 0.86 + random() * 0.3;
      burst(footBus, {
        freq: surface.freq * variation,
        q: surface.q,
        decay: surface.decay,
        level: surface.level * intensity,
        rate: variation,
      });
      if (surface.body > 0) {
        burst(footBus, {
          freq: 120 * variation,
          q: 1.4,
          decay: surface.decay * 1.3,
          level: surface.level * surface.body * intensity,
          type: 'lowpass',
          rate: 0.4,
        });
      }
    },

    setMuted(value) {
      muted = Boolean(value);
      applyVolume();
      return muted;
    },

    isMuted() {
      return muted;
    },

    setVolume(value) {
      targetVolume = Math.min(1, Math.max(0, value));
      applyVolume();
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      for (const source of started) {
        try {
          source.stop?.();
        } catch {
          // already stopped
        }
      }
      for (const node of nodes) node.disconnect?.();
      // The context is ours to close only when we made it. A caller who passed
      // one in owns its lifetime.
      if (options.context === undefined && context.close) {
        context.close().catch(() => {});
      }
    },
  };
}
