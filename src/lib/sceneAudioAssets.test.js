import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { createSampleBank } from './sceneAudioAssets';

function makeMockContext() {
  const sources = [], gains = [];
  return {
    currentTime: 2,
    sources, gains,
    createGain: () => {
      const gain = {
        gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
        connect: vi.fn(), disconnect: vi.fn(),
      };
      gains.push(gain);
      return gain;
    },
    createBufferSource: () => {
      const source = {
        playbackRate: { value: 1 }, connect: vi.fn(), disconnect: vi.fn(),
        start: vi.fn(), stop: vi.fn(),
      };
      sources.push(source);
      return source;
    },
    decodeAudioData: vi.fn((bytes, resolve) => resolve({ duration: 3, numberOfChannels: 1 })),
  };
}

const sample = { id: 'snd-test', url: '/test.ogg' };
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, arrayBuffer: async () => new ArrayBuffer(64),
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('sceneAudioAssets', () => {
  it('deduplicates concurrent fetch/decode requests, then uses the cache', async () => {
    const context = makeMockContext();
    const bank = createSampleBank(context);
    const [first, second] = await Promise.all([bank.loadSample(sample), bank.loadSample(sample)]);
    expect(first).toBe(second);
    expect(await bank.loadSample(sample)).toBe(first);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(context.decodeAudioData).toHaveBeenCalledTimes(1);
    bank.dispose();
  });

  it('preloads only the selected sounds', async () => {
    const bank = createSampleBank(makeMockContext());
    await bank.preloadAll(['snd-wind', 'snd-step-sand-1']);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(bank.hasSample('snd-wind')).toBe(true);
    expect(bank.hasSample('snd-step-sand-1')).toBe(true);
    expect(bank.hasSample('snd-surf')).toBe(false);
    bank.dispose();
  });

  it('plays a cached one-shot at the requested level and releases both nodes', async () => {
    const context = makeMockContext();
    const bank = createSampleBank(context);
    await bank.loadSample(sample);
    const destination = {};
    const source = bank.playOneShot(sample.id, destination, { volume: 0.2, playbackRate: 1.02 });
    expect(source.playbackRate.value).toBe(1.02);
    expect(context.gains[0].gain.value).toBe(0.2);
    expect(context.gains[0].connect).toHaveBeenCalledWith(destination);
    expect(source.start).toHaveBeenCalledWith(0, 0);
    source.onended();
    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(context.gains[0].disconnect).toHaveBeenCalledOnce();
    bank.dispose();
    expect(source.stop).not.toHaveBeenCalled();
  });

  it('fades in a seamless loop and releases loop and one-shot gains on disposal', async () => {
    const context = makeMockContext();
    const bank = createSampleBank(context);
    await bank.loadSample(sample);
    const loop = bank.startLoop(sample.id, {}, { volume: 0.4, offset: 7, fadeIn: 1.2 });
    bank.playOneShot(sample.id, {});
    expect(loop.source.loop).toBe(true);
    expect(loop.source.start).toHaveBeenCalledWith(0, 1);
    expect(loop.gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.4, 3.2);
    bank.dispose();
    bank.dispose();
    loop.stop();
    for (const source of context.sources) expect(source.stop).toHaveBeenCalledOnce();
    for (const gain of context.gains) expect(gain.disconnect).toHaveBeenCalledOnce();
    expect(bank.playOneShot(sample.id, {})).toBeNull();
    expect(bank.hasSample(sample.id)).toBe(false);
  });

  it('does not repopulate the cache when decoding finishes after leaving a scene', async () => {
    const context = makeMockContext();
    let finish;
    context.decodeAudioData = vi.fn((bytes, resolve) => { finish = resolve; });
    const bank = createSampleBank(context);
    const loading = bank.loadSample(sample);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    bank.dispose();
    finish({ duration: 1 });
    expect(await loading).toBeNull();
    expect(bank.hasSample(sample.id)).toBe(false);
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('leaves missing or failed files unavailable so the soundscape can fall back', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetch.mockResolvedValue({ ok: false, status: 404 });
    const onError = vi.fn();
    const bank = createSampleBank(makeMockContext(), { onError });
    expect(await bank.loadSample(sample)).toBeNull();
    expect(onError).toHaveBeenCalledOnce();
    expect(bank.playOneShot(sample.id, {})).toBeNull();
    expect(bank.startLoop(sample.id, {})).toBeNull();
    bank.dispose();
  });
});
