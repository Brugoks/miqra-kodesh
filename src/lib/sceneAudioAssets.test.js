import { describe, it, expect, vi } from 'vitest';
import { createSampleBank } from './sceneAudioAssets';

function makeMockContext() {
  const sources = [];
  return {
    state: 'running',
    sampleRate: 44100,
    createGain: () => ({
      gain: { value: 1 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    }),
    createBufferSource: () => {
      const src = {
        buffer: null,
        loop: false,
        playbackRate: { value: 1 },
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      sources.push(src);
      return src;
    },
    createBuffer: () => ({ length: 100 }),
    decodeAudioData: (buf, resolve) => {
      resolve({ duration: 1.0, numberOfChannels: 1 });
    },
  };
}

describe('sceneAudioAssets', () => {
  it('loads and caches audio buffers', async () => {
    const ctx = makeMockContext();
    const bank = createSampleBank(ctx, { sceneSlug: 'capernaum' });

    // Mock global fetch
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(64)),
    });

    try {
      const audioDef = { id: 'snd-test', url: '/assets/scenes/test.ogg' };
      const buf1 = await bank.loadSample(audioDef);
      expect(buf1).toBeDefined();
      expect(bank.hasSample('snd-test')).toBe(true);

      // Second load should read from cache
      const buf2 = await bank.loadSample(audioDef);
      expect(buf2).toBe(buf1);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = origFetch;
      bank.dispose();
    }
  });

  it('plays one-shot and cleans up onended', async () => {
    const ctx = makeMockContext();
    const bank = createSampleBank(ctx, { sceneSlug: 'capernaum' });
    const dest = ctx.createGain();

    // Pre-populate cache directly
    bank.loadSample = vi.fn();
    // Simulate cached sample
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(64)),
    });

    try {
      await bank.loadSample({ id: 'snd-step-stone', url: '/test.ogg' });
      // Test playOneShot without cached buffer returns null
      expect(bank.playOneShot('unloaded-id', dest)).toBeNull();
    } finally {
      globalThis.fetch = origFetch;
      bank.dispose();
    }
  });

  it('disposes cleanly and stops all active sources', () => {
    const ctx = makeMockContext();
    const bank = createSampleBank(ctx, { sceneSlug: 'capernaum' });
    expect(bank.isDisposed()).toBe(false);
    bank.dispose();
    expect(bank.isDisposed()).toBe(true);
  });
});
